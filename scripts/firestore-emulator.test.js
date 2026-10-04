const assert = require('assert');
const {initializeApp, getApps, deleteApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [host, port] = HOST.split(':');
const counters = {allowed: 0, denied: 0};

let testEnv;
let adminDb;

function ref(collection, id) {
  return adminDb.collection(collection).doc(id);
}

async function allow(label, operation) {
  await assertSucceeds(operation());
  counters.allowed += 1;
  return label;
}

async function deny(label, operation) {
  await assertFails(operation());
  counters.denied += 1;
  return label;
}

function ctx(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const users = [
      ['customer_1', {role: 'customer', display_name: 'عميل'}],
      ['vendor_1', {role: 'vendor_admin', vendor_id: 'vendor_1'}],
      ['courier_1', {role: 'courier'}],
      ['admin_1', {role: 'super_admin'}],
    ];
    for (const [id, data] of users) await db.doc(`users/${id}`).set(data);
    await db.doc('vendors/vendor_1').set({name: 'متجر', is_active: true, zone_id: 'zone_1'});
    await db.doc('vendors/vendor_1/products/product_1').set({name: 'منتج', price: 100, is_available: true});
    await db.doc('vendors/vendor_1/products/product_hidden').set({name: 'مخفي', price: 100, is_available: false});
    await db.doc('zones/zone_1').set({is_accepting_orders: true});
    await db.doc('couriers/courier_1').set({zone_id: 'zone_1', is_available: true});
    await db.doc('orders/order_party').set({customer_id: 'customer_1', vendor_id: 'vendor_1', courier_id: 'courier_1', zone_id: 'zone_1', status: 'pending'});
    await db.doc('orders/order_open').set({customer_id: 'customer_1', vendor_id: 'vendor_1', courier_id: null, zone_id: 'zone_1', status: 'pending', dispatch_candidates: ['courier_1']});
    await db.doc('payment_intents/payment_1').set({customer_id: 'customer_1', order_id: 'order_party', method: 'manual_transfer', status: 'pending_verification'});
    await db.doc('payment_events/event_1').set({payment_id: 'payment_1'});
    await db.doc('wallet_topups/topup_1').set({customer_id: 'customer_1', status: 'pending'});
    await db.doc('users/customer_1/wallet_ledger/entry_1').set({amount: 100});
    await db.doc('users/customer_1/loyalty_ledger/entry_1').set({points: 2});
    await db.doc('courier_wallets/courier_1').set({debt: 0});
    await db.doc('courier_wallets/courier_1/ledger/entry_1').set({amount: 100});
    await db.doc('coupons/TEST10').set({is_active: true, value: 10});
    await db.doc('chats/order_party/messages/message_1').set({sender_id: 'customer_1', text: 'مرحبا'});
    await db.doc('tracking/order_party').set({courier_id: 'courier_1', customer_id: 'customer_1'});
    await db.doc('public_config/main').set({app_name: 'Demo'});
    await db.doc('public_payment_config/main').set({manual_transfer: {channels: {}}});
    await db.doc('payment_config/main').set({bank_transfer: {enabled: false}});
  });
}

async function runRulesMatrix() {
  const guest = testEnv.unauthenticatedContext().firestore();
  const customer = ctx('customer_1');
  const vendor = ctx('vendor_1');
  const courier = ctx('courier_1');
  const adminDbClient = ctx('admin_1');

  // users: self-read and safe self-update; escalation and cross-user access denied.
  await allow('customer reads own user', () => customer.doc('users/customer_1').get());
  await deny('customer reads other user', () => customer.doc('users/vendor_1').get());
  await allow('customer updates safe profile field', () => customer.doc('users/customer_1').update({display_name: 'عميل محدث'}));
  await deny('customer escalates role', () => customer.doc('users/customer_1').update({role: 'super_admin'}));
  await allow('admin reads user', () => adminDbClient.doc('users/customer_1').get());
  await allow('admin updates role', () => adminDbClient.doc('users/customer_1').update({role: 'customer', audit_marker: 'admin'}));
  await deny('guest creates user with privileged role', () => guest.doc('users/guest_1').set({role: 'super_admin'}));

  // orders: party/admin reads; client writes are callable-only.
  await allow('customer reads own order', () => customer.doc('orders/order_party').get());
  await allow('vendor reads vendor order', () => vendor.doc('orders/order_party').get());
  await allow('courier reads assigned order', () => courier.doc('orders/order_party').get());
  await allow('courier reads offered order', () => courier.doc('orders/order_open').get());
  await allow('admin reads order', () => adminDbClient.doc('orders/order_party').get());
  await deny('guest reads order', () => guest.doc('orders/order_party').get());
  await deny('customer creates order directly', () => customer.doc('orders/direct').set({customer_id: 'customer_1'}));
  await deny('customer updates order directly', () => customer.doc('orders/order_party').update({status: 'delivered'}));
  await deny('vendor updates order directly', () => vendor.doc('orders/order_party').update({status: 'delivered'}));

  // payment_intents and payment_events: customer/admin read only, all client writes denied.
  await allow('customer reads own payment intent', () => customer.doc('payment_intents/payment_1').get());
  await allow('admin reads payment intent', () => adminDbClient.doc('payment_intents/payment_1').get());
  await deny('vendor reads payment intent', () => vendor.doc('payment_intents/payment_1').get());
  await deny('customer writes payment intent', () => customer.doc('payment_intents/payment_1').update({status: 'paid'}));
  await allow('customer reads own payment event', () => customer.doc('payment_events/event_1').get());
  await allow('admin reads payment event', () => adminDbClient.doc('payment_events/event_1').get());
  await deny('vendor reads payment event', () => vendor.doc('payment_events/event_1').get());
  await deny('customer writes payment event', () => customer.doc('payment_events/event_2').set({payment_id: 'payment_1'}));

  // manual_transfer_references: default deny for every client role.
  for (const [name, db] of [['guest', guest], ['customer', customer], ['vendor', vendor], ['courier', courier], ['admin', adminDbClient]]) {
    await deny(`${name} reads manual reference`, () => db.doc('manual_transfer_references/any').get());
    await deny(`${name} writes manual reference`, () => db.doc('manual_transfer_references/any').set({payment_id: 'payment_1'}));
  }

  // Wallets and ledgers.
  await allow('customer reads own wallet ledger', () => customer.doc('users/customer_1/wallet_ledger/entry_1').get());
  await deny('customer reads other wallet ledger', () => customer.doc('users/vendor_1/wallet_ledger/entry_1').get());
  await deny('customer writes wallet ledger', () => customer.doc('users/customer_1/wallet_ledger/new').set({amount: 1}));
  await allow('customer reads own topup', () => customer.doc('wallet_topups/topup_1').get());
  await deny('vendor reads customer topup', () => vendor.doc('wallet_topups/topup_1').get());
  await allow('courier reads own courier wallet', () => courier.doc('courier_wallets/courier_1').get());
  await deny('vendor reads courier wallet', () => vendor.doc('courier_wallets/courier_1').get());
  await allow('admin reads courier wallet ledger', () => adminDbClient.doc('courier_wallets/courier_1/ledger/entry_1').get());
  await deny('courier writes courier wallet ledger', () => courier.doc('courier_wallets/courier_1/ledger/new').set({amount: 1}));

  // Coupons: no client reads; admin write only.
  await deny('guest reads coupon', () => guest.doc('coupons/TEST10').get());
  await deny('customer reads coupon', () => customer.doc('coupons/TEST10').get());
  await deny('vendor writes coupon', () => vendor.doc('coupons/TEST10').update({value: 20}));
  await allow('admin writes coupon', () => adminDbClient.doc('coupons/TEST10').update({value: 20}));

  // Chat/messages: order parties and admin; writes require active order and own sender_id.
  await allow('customer reads chat', () => customer.doc('chats/order_party/messages/message_1').get());
  await allow('vendor reads chat', () => vendor.doc('chats/order_party/messages/message_1').get());
  await allow('courier reads chat', () => courier.doc('chats/order_party/messages/message_1').get());
  await allow('admin reads chat', () => adminDbClient.doc('chats/order_party/messages/message_1').get());
  await deny('guest reads chat', () => guest.doc('chats/order_party/messages/message_1').get());
  await allow('customer sends chat message', () => customer.doc('chats/order_party/messages/customer_message').set({sender_id: 'customer_1', text: 'رسالة'}));
  await deny('customer impersonates sender in chat', () => customer.doc('chats/order_party/messages/forged').set({sender_id: 'vendor_1', text: 'رسالة'}));

  // Public config, payment config, and tracking.
  await allow('guest reads public config', () => guest.doc('public_config/main').get());
  await allow('guest reads public payment config', () => guest.doc('public_payment_config/main').get());
  await deny('customer reads private payment config', () => customer.doc('payment_config/main').get());
  await allow('admin reads private payment config', () => adminDbClient.doc('payment_config/main').get());
  await deny('customer writes public config', () => customer.doc('public_config/main').set({unsafe: true}));
  await allow('customer reads tracking as party', () => customer.doc('tracking/order_party').get());
  await allow('courier updates own tracking', () => courier.doc('tracking/order_party').update({courier_id: 'courier_1', location: {latitude: 33, longitude: 36}}));
  await allow('admin updates tracking', () => adminDbClient.doc('tracking/order_party').update({admin_note: 'reviewed'}));
  await deny('guest reads tracking', () => guest.doc('tracking/order_party').get());
}

async function runReferenceRace() {
  let races = 0;
  for (let round = 1; round <= 3; round += 1) {
    const reference = `manual_transfer_references/race_${round}`;
    const attempts = await Promise.all(Array.from({length: 20}, async (_, index) => {
      const transaction = adminDb.runTransaction(async (tx) => {
        const target = adminDb.doc(reference);
        const snapshot = await tx.get(target);
        if (snapshot.exists) return false;
        tx.create(target, {payment_id: `race_${round}_${index}`, channel: 'sham_cash'});
        return true;
      });
      try {
        return await transaction;
      } catch (error) {
        if (/already exists|already-exists|ABORTED|409/i.test(String(error.message))) return false;
        throw error;
      }
    }));
    assert.strictEqual(attempts.filter(Boolean).length, 1, `سباق المرجع الجولة ${round} يجب أن يملك فائزًا واحدًا`);
    assert.strictEqual((await adminDb.doc(reference).get()).exists, true);
    races += 1;
  }
  return races;
}

(async () => {
  const started = Date.now();
  testEnv = await initializeTestEnvironment({projectId: PROJECT_ID, firestore: {host, port: Number(port)}});
  const adminApp = initializeApp({projectId: PROJECT_ID});
  adminDb = getFirestore(adminApp);
  await seed();
  await runRulesMatrix();
  const races = await runReferenceRace();
  const durationMs = Date.now() - started;
  console.log(JSON.stringify({
    status: 'passed',
    project_id: PROJECT_ID,
    allowed_cases: counters.allowed,
    denied_cases: counters.denied,
    reference_race_rounds: races,
    concurrent_attempts_per_round: 20,
    duration_ms: durationMs,
    duration_seconds: Number((durationMs / 1000).toFixed(2)),
  }, null, 2));
  await testEnv.cleanup();
  await deleteApp(adminApp);
})().catch(async (error) => {
  console.error(JSON.stringify({status: 'failed', message: error.message, stack: error.stack}, null, 2));
  if (testEnv) await testEnv.cleanup().catch(() => {});
  for (const app of getApps()) await deleteApp(app).catch(() => {});
  process.exitCode = 1;
});
