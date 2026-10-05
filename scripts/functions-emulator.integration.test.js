const assert = require('assert');
const fs = require('fs');
const {initializeApp, deleteApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const HOST = process.env.EMULATOR_HOST || '127.0.0.1';
const REGION = 'europe-west1';
const AUTH_URL = `http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`;
const FUNCTIONS_URL = `http://${HOST}:5001/${PROJECT_ID}/${REGION}`;
const PASSWORD = 'test123456';
const ADDRESS = {
  label: 'المنزل', city: 'دمشق', address: 'عنوان اختبار التكامل - دمشق',
  landmark: 'قرب المنطقة الأولى', location: {latitude: 33.5138, longitude: 36.2765},
};
const counters = {passed: 0, cases: []};
const started = Date.now();
const adminApp = initializeApp({projectId: PROJECT_ID}, 'functions-integration-test');
const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

function pass(label) { counters.passed += 1; counters.cases.push(label); }
function expect(condition, message) { assert.ok(condition, message); pass(message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function key(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function orderData(overrides = {}) {
  return {
    vendor_id: 'restaurant-01', zone_id: 'zone-1', coupon_code: '', idempotency_key: key('integration'),
    items: [{product_id: 'meal', quantity: 1, selected_modifiers: []}], delivery_address: clone(ADDRESS),
    payment_method: 'cash_on_delivery', wallet_amount: 0, loyalty_points: 0, cash_change_for: 0, ...overrides,
  };
}
async function login(email) {
  const response = await fetch(AUTH_URL, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password: PASSWORD, returnSecureToken: true}),
  });
  const body = await response.json();
  assert.equal(response.ok, true, `Auth emulator login failed for ${email}: ${JSON.stringify(body)}`);
  return body;
}
async function call(name, token, data) {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
    body: JSON.stringify({data}),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { throw new Error(`${name} returned non-JSON ${response.status}: ${text.slice(0, 300)}`); }
  return {response, body};
}
function errorOf(result) { return result.body?.error || {}; }
function assertError(result, status, message, label) {
  const error = errorOf(result);
  assert.equal(error.status, status, `${label}: expected ${status}, got ${JSON.stringify(result.body)}`);
  assert.match(String(error.message || ''), new RegExp(message), `${label}: unexpected error message ${JSON.stringify(error)}`);
  pass(label);
}
async function resetRate(uid) { await db.doc(`order_rate_limits/${uid}`).delete(); }
async function order(id) { return (await db.doc(`orders/${id}`).get()).data() || {}; }
async function createOrder(token, uid, overrides = {}) {
  await resetRate(uid);
  const result = await call('createOrder', token, orderData(overrides));
  if (!result.response.ok || result.body.error) throw new Error(`createOrder failed: ${JSON.stringify(result.body)}`);
  const id = result.body.result?.order_id;
  assert.ok(id, `createOrder did not return order_id: ${JSON.stringify(result.body)}`);
  return id;
}
async function setManualChannels(channels) {
  const payload = {manual_transfer: {channels}};
  await Promise.all([
    db.doc('public_payment_config/main').set(payload, {merge: true}),
    db.doc('system_config/main').set(payload, {merge: true}),
  ]);
}
async function setup() {
  const customer = await login('customer01@test.local');
  const other = await login('customer02@test.local');
  const admin = await login('admin@test.local');
  const vendor = await login('vendor@test.local');
  const courier = await login('courier01@test.local');
  const customerRef = db.doc(`users/${customer.localId}`);
  await customerRef.set({wallet_balance: 1000, loyalty_points: 100, fcm_token: 'integration-invalid-token'}, {merge: true});
  await db.doc('users/' + other.localId).set({wallet_balance: 1000, loyalty_points: 100}, {merge: true});
  await setManualChannels({
      bank_transfer: {enabled: true, display_name: 'تحويل بنكي', account_label: 'حساب تجريبي', min_amount: 300, max_amount: 1000},
      sham_cash: {enabled: true, display_name: 'شام كاش', account_label: 'حساب شام كاش تجريبي', min_amount: 300, max_amount: 1000},
      syriatel_cash: {enabled: false, min_amount: 300, max_amount: 1000},
  });
  await db.doc('public_payment_config/main').set({bank_transfer: {enabled: true, currency: 'SYP'}}, {merge: true});
  await db.doc('vendors/restaurant-01').set({opening_hours: {open: '00:00', close: '23:59'}, is_busy: false, is_active: true}, {merge: true});
  await db.doc('vendors/restaurant-02').set({opening_hours: {open: '25:00', close: '25:01'}, is_busy: false, is_active: true}, {merge: true});
  await db.doc('vendors/restaurant-01/products/meal').set({is_available: true, price: 250}, {merge: true});
  await db.doc('coupons/INTEGRATIONONCE').set({type: 'fixed_amount', value: 100, min_order_amount: 100, expires_at: null, usage_limit_total: 10, usage_limit_per_customer: 1, used_count: 0, is_active: true}, {merge: true});
  await db.doc('coupons/INTEGRATIONEXPIRED').set({type: 'fixed_amount', value: 100, min_order_amount: 100, expires_at: Timestamp.fromMillis(Date.now() - 60_000), usage_limit_total: 10, usage_limit_per_customer: 1, used_count: 0, is_active: true}, {merge: true});
  return {customer, other, admin, vendor, courier};
}
async function run() {
  const users = await setup();
  const {customer, other, admin, vendor, courier} = users;
  const customerToken = customer.idToken;
  const otherToken = other.idToken;
  const adminToken = admin.idToken;
  const vendorToken = vendor.idToken;
  const courierToken = courier.idToken;

  // Cash: success, closed store, unavailable product, order above configured limit, idempotency.
  const cashId = await createOrder(customerToken, customer.localId, {idempotency_key: key('cash-success')});
  expect((await order(cashId)).payment_method === 'cash_on_delivery', 'cash order succeeds');
  expect((await order(cashId)).policy?.readiness_status === 'policy_not_ready' && (await order(cashId)).policy?.debt_formula_version === 'gross_cash_collected_v1', 'createOrder records narrow policy readiness and gross debt formula');
  await db.doc(`courier_wallets/${courier.localId}`).update({credit_limit: 100});
  await db.doc(`courier_wallets/${courier.localId}`).update({credit_limit: require('firebase-admin/firestore').FieldValue.delete()});
  assertError(await call('claimCourierOrder', courierToken, {order_id: cashId}), 'FAILED_PRECONDITION', 'تجاوز المندوب حد الائتمان', 'claimCourierOrder uses unified policy_not_ready fallback 0');
  await db.doc(`courier_wallets/${courier.localId}`).update({credit_limit: 100});
  const staffEmail = `policy-courier-${Date.now()}@test.local`;
  const staff = await call('createStaffAccount', adminToken, {role: 'courier', email: staffEmail, password: PASSWORD, name: 'مندوب سياسة', phone: '0900000999', zone_id: 'zone-1'});
  assert.equal(staff.response.ok, true, JSON.stringify(staff.body));
  const staffWallet = (await db.doc(`courier_wallets/${staff.body.result.uid}`).get()).data() || {};
  expect(staffWallet.credit_limit === 0 && staffWallet.credit_limit_source === 'courier_wallets/{courierId}.credit_limit', 'courier account uses policy fallback 0 and wallet-only credit limit source');
  assertError(await call('createOrder', customerToken, orderData({vendor_id: 'restaurant-02'})), 'FAILED_PRECONDITION', 'المتجر مغلق', 'closed store is rejected');
  await db.doc('vendors/restaurant-01/products/meal').update({is_available: false});
  assertError(await call('createOrder', customerToken, orderData()), 'FAILED_PRECONDITION', 'لم يعد متاحاً', 'unavailable product is rejected');
  await db.doc('vendors/restaurant-01/products/meal').update({is_available: true});
  assertError(await call('createOrder', customerToken, orderData({items: [{product_id: 'meal', quantity: 5, selected_modifiers: []}], payment_method: 'manual_transfer', payment_channel: 'sham_cash'})), 'FAILED_PRECONDITION', 'خارج حدود', 'manual order above channel limit is rejected');
  const idemData = orderData({idempotency_key: key('idempotency')});
  await resetRate(customer.localId);
  const first = await call('createOrder', customerToken, idemData);
  assert.equal(first.response.ok, true, JSON.stringify(first.body));
  const firstId = first.body.result.order_id;
  const beforeCount = (await db.collection('orders').where('customer_id', '==', customer.localId).get()).size;
  const replay = await call('createOrder', customerToken, idemData);
  const afterCount = (await db.collection('orders').where('customer_id', '==', customer.localId).get()).size;
  expect(replay.response.ok && replay.body.result.order_id === firstId && beforeCount === afterCount, 'idempotency replays same order without second order');

  // Coupon: one redemption only, expired coupon rejected.
  const couponData = orderData({coupon_code: 'INTEGRATIONONCE'});
  await resetRate(customer.localId);
  const couponFirst = await call('createOrder', customerToken, couponData);
  assert.equal(couponFirst.response.ok, true, JSON.stringify(couponFirst.body));
  expect((await order(couponFirst.body.result.order_id)).discount_amount > 0, 'coupon is applied on first order');
  await resetRate(customer.localId);
  assertError(await call('createOrder', customerToken, {...couponData, idempotency_key: key('coupon-second')}), 'FAILED_PRECONDITION', 'غير صالح أو منتهي', 'coupon cannot be consumed twice by same customer');
  assertError(await call('createOrder', customerToken, orderData({coupon_code: 'INTEGRATIONEXPIRED'})), 'FAILED_PRECONDITION', 'غير صالح أو منتهي', 'expired coupon is rejected');

  // Wallet and points: exact debit, ledger entries, insufficient balance.
  const beforeUser = (await db.doc(`users/${customer.localId}`).get()).data();
  const walletId = await createOrder(customerToken, customer.localId, {payment_method: 'wallet', wallet_amount: 350});
  const afterUser = (await db.doc(`users/${customer.localId}`).get()).data();
  const walletOrder = await order(walletId);
  expect(Number(beforeUser.wallet_balance) - Number(afterUser.wallet_balance) === Number(walletOrder.wallet_amount), 'wallet payment debits exact requested amount');
  const walletLedger = await db.collection(`users/${customer.localId}/wallet_ledger`).where('order_id', '==', walletId).get();
  expect(walletLedger.size === 1 && walletLedger.docs[0].data().direction === 'debit', 'wallet payment writes debit ledger entry');
  const pointsBefore = Number(afterUser.loyalty_points);
  const pointsId = await createOrder(customerToken, customer.localId, {payment_method: 'hybrid', wallet_amount: 0, loyalty_points: 10});
  const pointsAfter = Number((await db.doc(`users/${customer.localId}`).get()).data().loyalty_points);
  expect(pointsBefore - pointsAfter === 10 && (await db.doc(`users/${customer.localId}/loyalty_ledger/${pointsId}`).get()).exists, 'points payment debits points and writes ledger entry');
  await db.doc(`users/${customer.localId}`).set({wallet_balance: 100}, {merge: true});
  assertError(await call('createOrder', customerToken, orderData({payment_method: 'wallet', wallet_amount: 350})), 'FAILED_PRECONDITION', 'رصيد المحفظة غير كاف', 'wallet cannot exceed balance');
  await db.doc(`users/${customer.localId}`).set({wallet_balance: 1000, loyalty_points: 0}, {merge: true});
  assertError(await call('createOrder', customerToken, orderData({payment_method: 'hybrid', loyalty_points: 10})), 'FAILED_PRECONDITION', 'نقاط الولاء غير كافية', 'points cannot exceed balance');
  await db.doc(`users/${customer.localId}`).set({loyalty_points: 100}, {merge: true});

  // Manual transfer full approval path.
  const manualId = await createOrder(customerToken, customer.localId, {payment_method: 'manual_transfer', payment_channel: 'sham_cash'});
  const intent = await call('createManualTransferIntent', customerToken, {order_id: manualId, channel: 'sham_cash'});
  assert.equal(intent.response.ok, true, JSON.stringify(intent.body));
  const paymentId = intent.body.result.payment_id;
  expect(intent.body.result.status === 'awaiting_customer_action', 'manual intent is created for the order');
  const intentPolicy = (await db.doc(`payment_intents/${paymentId}`).get()).data()?.policy || {};
  expect(intentPolicy.readiness_status === 'policy_not_ready' && intentPolicy.escalation_mode === 'pending_verification_only', 'manual transfer records narrow policy readiness');
  const proof = await call('submitManualTransferProof', customerToken, {payment_id: paymentId, reference: key('REF'), sender_name: 'عميل الاختبار', note: 'إثبات تكامل'});
  assert.equal(proof.response.ok, true, JSON.stringify(proof.body));
  expect(proof.body.result.status === 'pending_verification', 'manual proof is submitted');
  const firstPayment = (await db.doc(`payment_intents/${paymentId}`).get()).data();
  const firstReferenceHash = firstPayment.reference_hash;
  const correctedReference = key('REF-CORRECTED');
  const correctedProof = await call('submitManualTransferProof', customerToken, {payment_id: paymentId, reference: correctedReference});
  assert.equal(correctedProof.response.ok, true, JSON.stringify(correctedProof.body));
  const correctedPayment = (await db.doc(`payment_intents/${paymentId}`).get()).data();
  expect(correctedPayment.reference_attempts === 2 && correctedPayment.reference_hash !== firstReferenceHash, 'second reference correction succeeds');
  const referenceReservations = await db.collection('manual_transfer_references').where('payment_id', '==', paymentId).get();
  expect(referenceReservations.size === 1 && referenceReservations.docs[0].data().reference_hash === correctedPayment.reference_hash, 'old reference is released and new reference is reserved');
  assertError(await call('createManualTransferIntent', otherToken, {order_id: manualId, channel: 'sham_cash'}), 'NOT_FOUND', 'الطلب غير موجود', 'other customer cannot create intent for order');
  assertError(await call('reviewManualTransfer', customerToken, {payment_id: paymentId, decision: 'approve', amount_verified: true}), 'PERMISSION_DENIED', 'غير مسموح لهذا الدور', 'non-super-admin cannot review manual transfer');
  assertError(await call('reviewManualTransfer', adminToken, {payment_id: paymentId, decision: 'approve', amount_verified: true}), 'FAILED_PRECONDITION', 'نسخة المرجع', 'review requires expected reference version');
  const staleReview = await call('reviewManualTransfer', adminToken, {payment_id: paymentId, decision: 'approve', amount_verified: true, expected_reference_hash: firstReferenceHash, expected_attempt: 1});
  assertError(staleReview, 'ABORTED', 'تغيّر المرجع بعد عرضه', 'stale review reference is rejected');
  const unchangedPayment = (await db.doc(`payment_intents/${paymentId}`).get()).data();
  const unchangedOrder = await order(manualId);
  const preReviewLedger = await db.collection('financial_ledger').where('payment_id', '==', paymentId).get();
  expect(unchangedPayment.status === 'pending_verification' && unchangedOrder.payment_status === 'pending' && preReviewLedger.empty, 'stale review does not change state or write ledger');
  const review = await call('reviewManualTransfer', adminToken, {payment_id: paymentId, decision: 'approve', amount_verified: true, expected_reference_hash: correctedPayment.reference_hash, expected_attempt: correctedPayment.reference_attempts});
  assert.equal(review.response.ok, true, JSON.stringify(review.body));
  const paidOrder = await order(manualId);
  const paidPayment = (await db.doc(`payment_intents/${paymentId}`).get()).data();
  expect(paidOrder.payment_status === 'paid' && paidPayment.status === 'paid', 'approved manual transfer marks payment and order paid');
  const ledger = await db.collection('financial_ledger').where('payment_id', '==', paymentId).get();
  const debit = ledger.docs.filter((doc) => doc.data().direction === 'debit').reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
  const credit = ledger.docs.filter((doc) => doc.data().direction === 'credit').reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0);
  expect(ledger.size === 2 && debit === credit && debit === Number(paidPayment.amount), 'manual approval creates balanced two-sided ledger');
  expect(ledger.docs.every((doc) => doc.data()?.policy?.readiness_status === 'policy_not_ready'), 'manual transfer ledger entries carry the narrow policy snapshot');
  const source = fs.readFileSync(require.resolve('../functions/index.js'), 'utf8');
  expect(source.includes('تم اعتماد دفعتك اليدوية بنجاح.'), 'manual approval uses the expected notification message contract');
  assertError(await call('submitManualTransferProof', customerToken, {payment_id: paymentId, reference: key('AFTER-REVIEW')}), 'FAILED_PRECONDITION', 'ليست بانتظار إثبات', 'reference correction after review is rejected');

  // Manual rejection, duplicate reference, disabled channel, amount bounds, three-attempt cap.
  const rejectOrder = await createOrder(customerToken, customer.localId, {payment_method: 'manual_transfer', payment_channel: 'sham_cash'});
  const rejectIntent = await call('createManualTransferIntent', customerToken, {order_id: rejectOrder, channel: 'sham_cash'});
  const rejectPayment = rejectIntent.body.result.payment_id;
  await call('submitManualTransferProof', customerToken, {payment_id: rejectPayment, reference: key('REJECT')});
  const rejectSnapshot = (await db.doc(`payment_intents/${rejectPayment}`).get()).data();
  const rejected = await call('reviewManualTransfer', adminToken, {payment_id: rejectPayment, decision: 'reject', reason: 'المرجع غير مطابق', expected_reference_hash: rejectSnapshot.reference_hash, expected_attempt: rejectSnapshot.reference_attempts});
  assert.equal(rejected.response.ok, true, JSON.stringify(rejected.body));
  expect((await db.doc(`orders/${rejectOrder}`).get()).data().payment_status === 'failed', 'manual rejection marks order payment failed');

  const duplicateOrderA = await createOrder(customerToken, customer.localId, {payment_method: 'manual_transfer', payment_channel: 'sham_cash'});
  const duplicateOrderB = await createOrder(customerToken, customer.localId, {payment_method: 'manual_transfer', payment_channel: 'sham_cash'});
  const intentA = await call('createManualTransferIntent', customerToken, {order_id: duplicateOrderA, channel: 'sham_cash'});
  const intentB = await call('createManualTransferIntent', customerToken, {order_id: duplicateOrderB, channel: 'sham_cash'});
  const duplicateReference = key('DUPLICATE');
  await call('submitManualTransferProof', customerToken, {payment_id: intentA.body.result.payment_id, reference: duplicateReference});
  assertError(await call('submitManualTransferProof', customerToken, {payment_id: intentB.body.result.payment_id, reference: duplicateReference}), 'ALREADY_EXISTS', 'مستخدم مسبق', 'duplicate manual reference is rejected');

  await setManualChannels({sham_cash: {enabled: false, min_amount: 300, max_amount: 1000}});
  assertError(await call('createOrder', customerToken, orderData({payment_method: 'manual_transfer', payment_channel: 'sham_cash'})), 'FAILED_PRECONDITION', 'غير متاحة', 'disabled manual channel is rejected');
  await setManualChannels({sham_cash: {enabled: true, min_amount: 600, max_amount: 1000}});
  assertError(await call('createOrder', customerToken, orderData({payment_method: 'manual_transfer', payment_channel: 'sham_cash'})), 'FAILED_PRECONDITION', 'خارج حدود', 'manual amount below channel minimum is rejected');
  await setManualChannels({sham_cash: {enabled: true, min_amount: 300, max_amount: 1000}});

  const capOrder = await createOrder(customerToken, customer.localId, {payment_method: 'manual_transfer', payment_channel: 'sham_cash'});
  const capIntent = await call('createManualTransferIntent', customerToken, {order_id: capOrder, channel: 'sham_cash'});
  const capPayment = capIntent.body.result.payment_id;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const submitted = await call('submitManualTransferProof', customerToken, {payment_id: capPayment, reference: key(`CAP${attempt}`)});
    assert.equal(submitted.response.ok, true, JSON.stringify(submitted.body));
  }
  assertError(await call('submitManualTransferProof', customerToken, {payment_id: capPayment, reference: key('CAP4')}), 'RESOURCE_EXHAUSTED', 'الحد الأقصى', 'manual reference attempts are capped at three');
  expect((await db.doc(`payment_intents/${capPayment}`).get()).data().reference_attempts === 3, 'manual reference attempt counter remains exactly three');

  console.log(JSON.stringify({status: 'passed', project_id: PROJECT_ID, tool: 'direct callable HTTP with Auth Emulator ID tokens', cases_passed: counters.passed, duration_ms: Date.now() - started, duration_seconds: Number(((Date.now() - started) / 1000).toFixed(2)), checks: counters.cases}, null, 2));
}
run().catch((error) => {
  console.error(JSON.stringify({status: 'failed', message: error.message, stack: error.stack, cases_passed: counters.passed, completed_checks: counters.cases, duration_ms: Date.now() - started}, null, 2));
  process.exitCode = 1;
}).finally(async () => { await deleteApp(adminApp).catch(() => {}); });
