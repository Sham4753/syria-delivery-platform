#!/usr/bin/env node
// Executes the real callables in functions/index.js against an in-memory Firestore.
// The fake enforces the rule that bit round 2: a transaction may not read after it has written.
// This is NOT a replacement for Emulator tests (no security rules, no triggers, no indexes),
// but it runs every money path with real data and needs no Firebase tooling.
//   node scripts/test-round3-logic.js            -> tests functions/index.js
//   FUNCTIONS_INDEX=/other/index.js node ...     -> tests another copy
process.env.NODE_ENV = 'test';
const assert = require('assert');
const path = require('path');
const Module = require('module');

// ---------------------------------------------------------------- fake Firestore
class Timestamp { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } }
const FieldValue = {serverTimestamp: () => ({__s: 'ts'}), increment: (n) => ({__s: 'inc', n}), delete: () => ({__s: 'del'})};
const cmp = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : v);
let autoId = 0;

function materialize(existing, patch, replace) {
  const out = replace ? {} : {...existing};
  for (const [key, value] of Object.entries(patch)) {
    if (value && value.__s === 'ts') out[key] = new Timestamp(Date.now());
    else if (value && value.__s === 'inc') out[key] = Number(existing[key] || 0) + value.n;
    else if (value && value.__s === 'del') delete out[key];
    else out[key] = value;
  }
  return out;
}

class FakeDb {
  constructor() { this.docs = new Map(); }
  seed(p, data) { this.docs.set(p, materialize({}, data, true)); }
  read(p) { return this.docs.get(p); }
  remove(p) { this.docs.delete(p); }
  doc(p) { return new DocRef(this, p); }
  collection(p) { return new CollRef(this, p); }
  async runTransaction(fn) {
    const tx = new Tx(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }
}
class DocRef {
  constructor(db, p) { this.db = db; this.path = p; this.id = p.split('/').pop(); }
  collection(name) { return new CollRef(this.db, `${this.path}/${name}`); }
  async get() { return snap(this.db, this.path); }
  async update(data) { this.db.docs.set(this.path, materialize(this.db.read(this.path) || {}, data, false)); }
  async set(data, opts) { this.db.docs.set(this.path, materialize(opts?.merge ? this.db.read(this.path) || {} : {}, data, !opts?.merge)); }
}
function snap(db, p) {
  const data = db.read(p);
  return {exists: data !== undefined, id: p.split('/').pop(), ref: new DocRef(db, p), data: () => (data === undefined ? undefined : {...data})};
}
class Query {
  constructor(db, coll, filters = [], max = Infinity) { this.db = db; this.coll = coll; this.filters = filters; this.max = max; }
  where(field, op, value) { return new Query(this.db, this.coll, [...this.filters, {field, op, value}], this.max); }
  limit(n) { return new Query(this.db, this.coll, this.filters, n); }
  async get() {
    const docs = [];
    for (const [p, data] of this.db.docs) {
      const rest = p.startsWith(`${this.coll}/`) ? p.slice(this.coll.length + 1) : null;
      if (rest === null || rest.includes('/')) continue;
      const ok = this.filters.every(({field, op, value}) => {
        const actual = cmp(data[field]); const wanted = cmp(value);
        if (op === '==') return actual === wanted; if (op === '!=') return actual !== wanted;
        if (op === '>=') return actual >= wanted; if (op === '<=') return actual <= wanted;
        if (op === 'in') return value.includes(actual);
        throw new Error(`fake db: unsupported operator ${op}`);
      });
      if (ok) docs.push(snap(this.db, p));
      if (docs.length >= this.max) break;
    }
    return {docs, size: docs.length, empty: docs.length === 0};
  }
}
class CollRef extends Query {
  constructor(db, p) { super(db, p); }
  doc(id) { return new DocRef(this.db, `${this.coll}/${id || `auto${++autoId}`}`); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}
class Tx {
  constructor(db) { this.db = db; this.writes = []; }
  async get(target) {
    if (this.writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
    return target instanceof DocRef ? snap(this.db, target.path) : target.get();
  }
  set(ref, data, opts) { this.writes.push({op: 'set', ref, data, opts}); return this; }
  update(ref, data) { this.writes.push({op: 'update', ref, data}); return this; }
  create(ref, data) { this.writes.push({op: 'create', ref, data}); return this; }
  delete(ref) { this.writes.push({op: 'delete', ref}); return this; }
  commit() {
    const staged = new Map(this.db.docs);
    for (const {op, ref, data, opts} of this.writes) {
      const exists = staged.has(ref.path); const current = staged.get(ref.path) || {};
      if (op === 'create') { if (exists) throw Object.assign(new Error(`ALREADY_EXISTS ${ref.path}`), {code: 6}); staged.set(ref.path, materialize({}, data, true)); }
      else if (op === 'update') { if (!exists) throw Object.assign(new Error(`NOT_FOUND ${ref.path}`), {code: 5}); staged.set(ref.path, materialize(current, data, false)); }
      else if (op === 'set') staged.set(ref.path, materialize(opts?.merge ? current : {}, data, !opts?.merge));
      else if (op === 'delete') staged.delete(ref.path);
    }
    this.db.docs = staged; // all-or-nothing
  }
}

// ---------------------------------------------------------------- stub the Firebase packages
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const db = new FakeDb();
const stubs = {
  'firebase-functions/v2/firestore': {onDocumentCreated: (_o, h) => h, onDocumentWritten: (_o, h) => h},
  'firebase-functions/v1': {region: () => ({https: {onCall: (h) => h}})},
  'firebase-functions/v1/https': {HttpsError},
  'firebase-admin/app': {initializeApp: () => {}},
  'firebase-admin/auth': {getAuth: () => ({})},
  'firebase-admin/messaging': {getMessaging: () => ({send: async () => {}, sendEachForMulticast: async () => ({successCount: 0})})},
  'firebase-admin/firestore': {getFirestore: () => db, FieldValue},
};
const originalLoad = Module._load;
Module._load = function (request, ...rest) { return stubs[request] || originalLoad.call(this, request, ...rest); };
const indexPath = path.resolve(process.env.FUNCTIONS_INDEX || path.join(__dirname, '..', 'functions', 'index.js'));
const fns = require(indexPath);

// ---------------------------------------------------------------- helpers
const as = (uid) => ({auth: {uid}});
const NOW = Date.now();
async function fails(promise, code, label) {
  try { await promise; } catch (error) {
    assert.strictEqual(error.code, code, `${label}: expected ${code}, got ${error.code || 'plain error'}: ${error.message}`);
    return;
  }
  assert.fail(`${label}: expected failure ${code} but the call succeeded`);
}
let passed = 0; let failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (error) { failed += 1; failures.push(name); console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`); }
}

function seedWorld() {
  db.docs.clear();
  for (const [uid, user] of Object.entries({
    admin: {role: 'super_admin'}, courier1: {role: 'courier'}, vend1: {role: 'vendor_admin', vendor_id: 'v1'}, vend2: {role: 'vendor_admin', vendor_id: 'v2'},
    cust1: {role: 'customer', wallet_balance: 100, loyalty_points: 50}, cust2: {role: 'customer', wallet_balance: 0, loyalty_points: 0},
  })) db.seed(`users/${uid}`, user);
  db.seed('courier_wallets/courier1', {debt: 50000, balance: 0});
  db.seed('couriers/courier1', {zone_id: 'z1', is_available: true});
  db.seed('system_config/main', {});
  db.seed('zones_geo/z1', {polygon: [{latitude: 33.4, longitude: 36.2}, {latitude: 33.4, longitude: 36.4}, {latitude: 33.6, longitude: 36.4}, {latitude: 33.6, longitude: 36.2}]});
  db.seed('zones/z1', {is_accepting_orders: true, delivery_fee_base: 2000});
  db.seed('vendors/v1', {is_active: true, zone_id: 'z1', is_busy: false, commission_rate: 10});
  db.seed('vendors/v1/products/p1', {name: 'Burger', price: 10000, is_available: true});
  db.seed('coupons/GOOD', {is_active: true, type: 'percentage', value: 10, min_order_amount: 1000, used_count: 3});
  db.seed('coupons/FREEDEL', {is_active: true, type: 'free_delivery', value: 0});
  db.seed('coupons/EXPIRED', {is_active: true, type: 'percentage', value: 10, expires_at: new Timestamp(NOW - 1000)});
  db.seed('coupons/USEDUP', {is_active: true, type: 'percentage', value: 10, usage_limit_total: 1, used_count: 1});
  db.seed('coupons/FORSOMEONE', {is_active: true, type: 'percentage', value: 10, restricted_to_customer: 'cust2'});
  db.seed('coupons/ONCE', {is_active: true, type: 'percentage', value: 10, usage_limit_per_customer: 1});
  db.seed('coupons/ONCE/redemptions/cust1', {order_id: 'old'});
  db.seed('coupons/OFF', {is_active: false, type: 'percentage', value: 10});
}
const order = (extra) => ({customer_id: 'cust1', vendor_id: 'v1', zone_id: 'z1', courier_id: null, wallet_amount: 0, loyalty_points_used: 0, ...extra});

(async () => {
  // ------------------------------------------------------------ harness self-check
  console.log('harness');
  try { seedWorld(); await db.runTransaction(async (tx) => { tx.set(db.doc('x/1'), {a: 1}); await tx.get(db.doc('users/admin')); }); console.log('  FAIL harness did not enforce read-before-write'); failed += 1; } catch (error) { assert(/all reads/.test(error.message)); passed += 1; console.log('  ok   harness enforces read-before-write'); }

  // ------------------------------------------------------------ shifts and courier debt
  console.log('shifts and courier debt');
  const shift = (id, extra) => {
    db.seed(`shifts/${id}`, {owner_type: 'courier', owner_id: 'courier1', status: 'open', opening_cash: 1000, vendor_id: null, opened_at: new Timestamp(NOW - 3600000), ...extra});
    db.seed('active_shifts/courier_courier1', {shift_id: id});
  };
  await test('admin closes a courier shift: debt reduced, settlement approved, no transaction error', async () => {
    seedWorld(); shift('s1');
    db.seed('orders/o1', order({status: 'delivered', courier_id: 'courier1', cash_due: 30000, delivery_fee: 5000, total: 35000, delivered_at: new Timestamp(NOW - 1800000)}));
    const result = await fns.closeShift({shift_id: 's1', counted_cash: 31000}, as('admin'));
    assert.strictEqual(result.status, 'approved');
    assert.strictEqual(db.read('courier_wallets/courier1').debt, 20000);
    const settlement = db.read(`settlements/${result.settlement_id}`);
    assert.strictEqual(settlement.debt_applied, true); assert.strictEqual(settlement.remitted_amount, 30000);
    assert.strictEqual(db.read('shifts/s1').status, 'closed'); assert.strictEqual(db.read('active_shifts/courier_courier1'), undefined);
  });
  await test('debt never goes below zero', async () => {
    seedWorld(); shift('s1');
    await fns.closeShift({shift_id: 's1', counted_cash: 99999999}, as('admin'));
    assert.strictEqual(db.read('courier_wallets/courier1').debt, 0);
  });
  await test('courier closes own shift (pending), admin approves: debt reduced exactly once', async () => {
    seedWorld(); shift('s2', {opening_cash: 0});
    const closed = await fns.closeShift({shift_id: 's2', counted_cash: 5000}, as('courier1'));
    assert.strictEqual(closed.status, 'pending_approval'); assert.strictEqual(db.read('courier_wallets/courier1').debt, 50000);
    await fns.approveSettlement({settlement_id: closed.settlement_id}, as('admin'));
    assert.strictEqual(db.read('courier_wallets/courier1').debt, 45000);
    assert.strictEqual(db.read(`settlements/${closed.settlement_id}`).status, 'approved');
    await fails(fns.approveSettlement({settlement_id: closed.settlement_id}, as('admin')), 'failed-precondition', 'second approval');
    assert.strictEqual(db.read('courier_wallets/courier1').debt, 45000);
  });
  await test('a non-admin cannot approve a settlement', async () => {
    seedWorld(); db.seed('settlements/st1', {status: 'pending_approval', owner_type: 'courier', owner_id: 'courier1', counted_cash: 10, opening_cash: 0});
    await fails(fns.approveSettlement({settlement_id: 'st1'}, as('courier1')), 'permission-denied', 'courier approving');
  });

  // ------------------------------------------------------------ coupons
  console.log('coupons');
  const preview = (code, uid = 'cust1', subtotal = 10000, delivery_fee = 2000) => fns.previewCoupon({code, subtotal, delivery_fee}, as(uid));
  const INVALID = {valid: false, message: 'الكوبون غير صالح'};
  await test('previewCoupon returns the discount for valid coupons (and does not crash)', async () => {
    seedWorld();
    assert.deepStrictEqual(await preview('good'), {valid: true, discount: 1000});
    assert.deepStrictEqual(await preview('FREEDEL'), {valid: true, discount: 2000});
  });
  await test('every kind of invalid coupon gets the identical answer (no hints for guessing)', async () => {
    seedWorld();
    for (const code of ['NOPE', 'EXPIRED', 'USEDUP', 'FORSOMEONE', 'ONCE', 'OFF', 'a/b', '../x']) {
      db.remove('coupon_preview_rate_limits/cust1');
      assert.deepStrictEqual(await preview(code), INVALID, code);
    }
    db.remove('coupon_preview_rate_limits/cust1');
    assert.deepStrictEqual(await preview('GOOD', 'cust1', 500), INVALID, 'below minimum order');
  });
  await test('previewCoupon is rate limited: 10 per minute', async () => {
    seedWorld();
    for (let i = 0; i < 10; i += 1) await preview('GOOD', 'cust2');
    await fails(preview('GOOD', 'cust2'), 'resource-exhausted', '11th preview');
  });
  const place = (code, key, uid = 'cust1') => fns.createOrder({vendor_id: 'v1', zone_id: 'z1', delivery_address: {location: {latitude: 33.5, longitude: 36.3}, landmark: 'x'}, items: [{product_id: 'p1', quantity: 1}], coupon_code: code, payment_method: 'cash_on_delivery', idempotency_key: key.padEnd(20, '0')}, as(uid));
  await test('createOrder applies a valid coupon and records the redemption', async () => {
    seedWorld();
    const result = await place('good', 'k-good');
    const created = db.read(`orders/${result.order_id}`);
    assert.strictEqual(created.discount_amount, 1000); assert.strictEqual(created.total, 11000);
    assert.strictEqual(db.read('coupons/GOOD').used_count, 4); assert(db.read('coupons/GOOD/redemptions/cust1'));
  });
  await test('createOrder and previewCoupon agree on every coupon', async () => {
    seedWorld(); let i = 0;
    for (const code of ['GOOD', 'FREEDEL', 'NOPE', 'EXPIRED', 'USEDUP', 'FORSOMEONE', 'ONCE', 'OFF', 'a/b']) {
      db.remove('coupon_preview_rate_limits/cust1'); db.remove('order_rate_limits/cust1');
      const previewed = (await preview(code)).valid === true;
      let created = true; try { await place(code, `k-agree-${i += 1}`); } catch (error) { created = false; assert.strictEqual(error.code, 'failed-precondition', `${code}: ${error.message}`); }
      assert.strictEqual(created, previewed, `${code}: preview=${previewed} createOrder=${created}`);
    }
  });

  // ------------------------------------------------------------ cancellation, failed delivery and refunds
  console.log('cancellation, failed delivery and refunds');
  const move = (id, status, uid, reason) => fns.transitionOrderStatus({order_id: id, status, reason}, as(uid));
  const paid = (extra) => order({wallet_amount: 5000, loyalty_points_used: 10, coupon_code: 'GOOD', coupon_applied: true, ...extra});
  await test('vendor cancellation refunds wallet, points and coupon (it did not in round 2)', async () => {
    seedWorld(); db.seed('coupons/GOOD/redemptions/cust1', {order_id: 'oc1'}); db.seed('orders/oc1', paid({status: 'preparing'}));
    await move('oc1', 'cancelled', 'vend1', 'out of stock');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100); assert.strictEqual(db.read('users/cust1').loyalty_points, 60);
    assert(db.read('users/cust1/wallet_ledger/refund_oc1')); assert(db.read('users/cust1/loyalty_ledger/refund_oc1'));
    assert.strictEqual(db.read('coupons/GOOD').used_count, 2); assert.strictEqual(db.read('coupons/GOOD/redemptions/cust1'), undefined);
    assert.strictEqual(db.read('orders/oc1').refund_processed, true); assert.strictEqual(db.read('orders/oc1').cancelled_by, 'vendor');
  });
  await test('a deleted coupon does not block the refund', async () => {
    seedWorld(); db.seed('orders/oc2', paid({status: 'preparing', coupon_code: 'GONE'}));
    await move('oc2', 'cancelled', 'admin', 'x');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100); assert.strictEqual(db.read('orders/oc2').cancelled_by, 'admin');
  });
  await test('failed_delivery needs one of the fixed reasons', async () => {
    seedWorld(); db.seed('orders/f1', paid({status: 'on_the_way', courier_id: 'courier1'}));
    await fails(move('f1', 'failed_delivery', 'courier1', 'bad'), 'invalid-argument', 'unknown reason');
    await fails(move('f1', 'failed_delivery', 'courier1', ''), 'invalid-argument', 'empty reason');
  });
  await test('a courier cannot fail an order before pickup', async () => {
    seedWorld(); db.seed('orders/f0', paid({status: 'ready_for_pickup', courier_id: 'courier1'}));
    await fails(move('f0', 'failed_delivery', 'courier1', 'courier_issue'), 'failed-precondition', 'fail before pickup');
  });
  await test('returned is reachable only from failed_delivery, by the order\'s own vendor', async () => {
    seedWorld(); db.seed('orders/f2', paid({status: 'on_the_way', courier_id: 'courier1'}));
    await fails(move('f2', 'returned', 'vend1', ''), 'failed-precondition', 'vendor returning an order that is out for delivery');
    await fails(move('f2', 'returned', 'courier1', ''), 'failed-precondition', 'courier skipping failed_delivery');
    await move('f2', 'failed_delivery', 'courier1', 'courier_issue');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 100, 'no refund at the moment of failure');
    assert.strictEqual(db.read('orders/f2').refund_review_required, true);
    await fails(move('f2', 'returned', 'courier1', ''), 'permission-denied', 'courier confirming the return');
    await fails(move('f2', 'returned', 'vend2', ''), 'permission-denied', 'other vendor confirming the return');
  });
  await test('vendor/courier-side failure: refund after the vendor confirms the return, failure_reason is kept', async () => {
    seedWorld(); db.seed('coupons/GOOD/redemptions/cust1', {order_id: 'f3'}); db.seed('orders/f3', paid({status: 'on_the_way', courier_id: 'courier1'}));
    await move('f3', 'failed_delivery', 'courier1', 'courier_issue'); await move('f3', 'returned', 'vend1', 'box came back');
    const done = db.read('orders/f3');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100); assert.strictEqual(done.refund_processed, true); assert.strictEqual(done.refund_review_required, false);
    assert.strictEqual(done.failure_reason, 'courier_issue'); assert.strictEqual(done.return_note, 'box came back');
  });
  await test('customer-side failure: no automatic refund, admin refunds once', async () => {
    seedWorld(); db.seed('orders/f4', paid({status: 'on_the_way', courier_id: 'courier1'}));
    await move('f4', 'failed_delivery', 'courier1', 'customer_refused'); await move('f4', 'returned', 'vend1', '');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 100); assert.strictEqual(db.read('orders/f4').refund_review_required, true);
    await fails(fns.resolveRefundReview({order_id: 'f4', decision: 'refund'}, as('cust1')), 'permission-denied', 'customer resolving');
    await fails(fns.resolveRefundReview({order_id: 'f4', decision: 'bogus'}, as('admin')), 'invalid-argument', 'bad decision');
    await fns.resolveRefundReview({order_id: 'f4', decision: 'refund', note: 'goodwill'}, as('admin'));
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100); assert.strictEqual(db.read('orders/f4').refund_review_required, false);
    assert.strictEqual(db.read('orders/f4').refund_resolution, 'refund');
    await fails(fns.resolveRefundReview({order_id: 'f4', decision: 'refund'}, as('admin')), 'failed-precondition', 'second refund');
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100);
  });
  await test('admin can deny a refund, and can resolve while the vendor never confirmed the return', async () => {
    seedWorld(); db.seed('orders/f5', paid({status: 'on_the_way', courier_id: 'courier1'})); db.seed('orders/f6', paid({status: 'on_the_way', courier_id: 'courier1'}));
    await move('f5', 'failed_delivery', 'courier1', 'other'); await move('f5', 'returned', 'vend1', '');
    await fns.resolveRefundReview({order_id: 'f5', decision: 'deny', note: 'abuse'}, as('admin'));
    assert.strictEqual(db.read('users/cust1').wallet_balance, 100); assert.strictEqual(db.read('orders/f5').refund_review_required, false); assert.strictEqual(db.read('orders/f5').refund_resolution, 'deny');
    await move('f6', 'failed_delivery', 'courier1', 'customer_unreachable');
    await fns.resolveRefundReview({order_id: 'f6', decision: 'refund'}, as('admin'));
    assert.strictEqual(db.read('users/cust1').wallet_balance, 5100);
  });
  await test('resolveRefundReview rejects orders that are not waiting for review', async () => {
    seedWorld(); db.seed('orders/n1', paid({status: 'delivered'}));
    await fails(fns.resolveRefundReview({order_id: 'n1', decision: 'refund'}, as('admin')), 'failed-precondition', 'delivered order');
  });

  // ------------------------------------------------------------ compensation flags (trigger)
  console.log('compensation flags');
  const trigger = async (id, beforeData, afterData) => {
    db.seed(`orders/${id}`, afterData);
    await fns.notifyOrderChange({params: {orderId: id}, data: {before: {data: () => beforeData}, after: {data: () => afterData, ref: db.doc(`orders/${id}`)}}});
    return db.read(`orders/${id}`);
  };
  await test('a vendor cancelling its own order creates no compensation claim', async () => {
    seedWorld(); const out = await trigger('t1', order({status: 'preparing'}), order({status: 'cancelled'}));
    assert.strictEqual(out.commission_voided, true); assert(!out.vendor_compensation_due); assert(!out.courier_compensation_due);
  });
  await test('customer-fault failure after pickup: vendor and courier compensation due', async () => {
    seedWorld(); const out = await trigger('t2', order({status: 'on_the_way', courier_id: 'courier1'}), order({status: 'failed_delivery', failure_reason: 'customer_refused', courier_id: 'courier1'}));
    assert.strictEqual(out.vendor_compensation_due, true); assert.strictEqual(out.courier_compensation_due, true);
  });
  await test('courier/vendor-fault failure: no compensation, and the return step adds none', async () => {
    seedWorld(); const out = await trigger('t3', order({status: 'on_the_way', courier_id: 'courier1'}), order({status: 'failed_delivery', failure_reason: 'courier_issue', courier_id: 'courier1'}));
    assert(!out.vendor_compensation_due); assert(!out.courier_compensation_due);
    const back = await trigger('t4', order({status: 'failed_delivery', failure_reason: 'customer_refused'}), order({status: 'returned', failure_reason: 'customer_refused'}));
    assert(!back.vendor_compensation_due);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log(`failed: ${failures.join(' | ')}`); process.exit(1); }
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
