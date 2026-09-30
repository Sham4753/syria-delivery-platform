// اختبار المنطق المالي بقاعدة بيانات وهمية في الذاكرة: node scripts/test-errand-functions.js
const assert = require('assert');
const {createHash, randomInt} = require('crypto');
const {buildErrandFunctions} = require('../functions/errands');

class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
const FieldValue = {serverTimestamp: () => ({toMillis: () => Date.now()}), increment: (n) => ({__inc: n}), delete: () => ({__del: true})};

function makeDb() {
  const store = new Map();
  let auto = 0;
  const apply = (path, patch, merge = true) => {
    const cur = merge ? {...(store.get(path) || {})} : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v && v.__inc !== undefined) cur[k] = Number(cur[k] || 0) + v.__inc;
      else if (v && v.__del) delete cur[k];
      else cur[k] = v;
    }
    store.set(path, cur);
  };
  const snap = (path) => ({exists: store.has(path), id: path.split('/').pop(), data: () => (store.has(path) ? {...store.get(path)} : undefined)});
  const doc = (path) => ({path, id: path.split('/').pop(), get: async () => snap(path), collection: (name) => coll(`${path}/${name}`)});
  const coll = (path) => ({
    doc: (id) => doc(`${path}/${id || `auto${++auto}`}`),
    get: async () => ({docs: [...store.keys()].filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/')).map((k) => snap(k))}),
  });
  return {
    store, doc, collection: coll,
    async runTransaction(fn) {
      const backup = new Map([...store].map(([k, v]) => [k, {...v}]));
      const tx = {
        get: async (ref) => snap(ref.path),
        create: (ref, data) => { if (store.has(ref.path)) throw new Error(`ALREADY_EXISTS ${ref.path}`); apply(ref.path, data, false); },
        set: (ref, data, opts) => apply(ref.path, data, !!(opts && opts.merge)),
        update: (ref, patch) => { if (!store.has(ref.path)) throw new Error(`NOT_FOUND ${ref.path}`); apply(ref.path, patch); },
      };
      try { return await fn(tx); } catch (e) { store.clear(); backup.forEach((v, k) => store.set(k, v)); throw e; }
    },
  };
}

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
function setup() {
  const db = makeDb();
  const requireRole = async (uid, roles) => { const u = (await db.doc(`users/${uid}`).get()).data() || {}; if (!roles.includes(u.role)) throw new HttpsError('permission-denied', 'role'); return u; };
  const fns = buildErrandFunctions({db, onCall: (h) => h, HttpsError, FieldValue, createHash, randomInt, requireRole, money});
  const put = (path, data) => db.store.set(path, data);
  put('zones_geo/z1', {polygon: [{lat: 33, lng: 36}, {lat: 33, lng: 37}, {lat: 34, lng: 37}, {lat: 34, lng: 36}], is_active: true});
  put('zones_geo/z2', {polygon: [{lat: 35, lng: 36}, {lat: 35, lng: 37}, {lat: 36, lng: 37}, {lat: 36, lng: 36}], is_active: true});
  put('zones/z1', {name: 'z1', delivery_fee_base: 10000, is_active: true, is_accepting_orders: true});
  put('zones/z2', {name: 'z2', delivery_fee_base: 8000, is_active: true, is_accepting_orders: true});
  put('system_config/main', {});
  put('users/cust', {role: 'customer', wallet_balance: 0});
  put('users/cour', {role: 'courier'});
  put('users/cour2', {role: 'courier'});
  put('users/admin', {role: 'super_admin'});
  put('courier_wallets/cour', {debt: 0, credit_limit: 100});
  return {db, fns, put};
}
const rejects = async (promise, code, msg) => { try { await promise; } catch (e) { assert.strictEqual(e.code || 'plain', code, `${msg}: got ${e.code} ${e.message}`); return e; } assert.fail(`${msg}: expected ${code}`); };
const ctx = (uid) => ({auth: {uid}});
const pickup = {label: 'أ', latitude: 33.5, longitude: 36.5};
const dropoff = {label: 'ب', latitude: 33.6, longitude: 36.6};
let keyN = 0; const key = () => `errand-key-${Date.now()}-${++keyN}-xxxxxxxx`;
const base = () => ({pickup_address: pickup, dropoff_address: dropoff, description: 'طرد', expected_fee: 10000, idempotency_key: key()});

(async () => {
  // ---- عرض السعر والإنشاء ----
  {
    const {db, fns} = setup();
    const q = await fns.quoteErrand({pickup_address: pickup, dropoff_address: dropoff}, ctx('cust'));
    assert.strictEqual(q.zone_id, 'z1'); assert.strictEqual(q.delivery_fee, 10000);
    await rejects(fns.quoteErrand({pickup_address: pickup, dropoff_address: dropoff}, {}), 'unauthenticated', 'quote needs login');
    await rejects(fns.quoteErrand({pickup_address: {latitude: 40, longitude: 40}, dropoff_address: dropoff}, ctx('cust')), 'failed-precondition', 'pickup outside');
    await rejects(fns.quoteErrand({pickup_address: pickup, dropoff_address: {latitude: 35.5, longitude: 36.5}}, ctx('cust')), 'failed-precondition', 'different zones');
    await rejects(fns.quoteErrand({pickup_address: {label: 'x'}, dropoff_address: dropoff}, ctx('cust')), 'invalid-argument', 'no coordinates');

    // العميل يحاول فرض رسم ومنطقة: يُتجاهل
    const res = await fns.createErrand({...base(), delivery_fee: 1, zone_id: 'evil'}, ctx('cust'));
    const order = db.store.get(`orders/${res.order_id}`);
    assert.strictEqual(order.delivery_fee, 10000, 'fee comes from the server'); assert.strictEqual(order.zone_id, 'z1');
    assert.strictEqual(order.cash_due, 10000); assert.strictEqual(order.courier_id, null); assert.strictEqual(order.status, 'pending');
    assert.ok(db.store.get(`order_secrets/${res.order_id}`).otp_hash, 'otp secret created');

    // بدون expected_fee أو بسعر قديم
    const b = base(); delete b.expected_fee;
    await rejects(fns.createErrand(b, ctx('cust')), 'invalid-argument', 'missing expected_fee');
    const e = await rejects(fns.createErrand({...base(), expected_fee: 1}, ctx('cust')), 'failed-precondition', 'stale price');
    assert.strictEqual(e.details.reason, 'price_changed'); assert.strictEqual(e.details.delivery_fee, 10000);
  }
  // ---- التكرار وحد المعدل ----
  {
    const {db, fns} = setup();
    const payload = base();
    const first = await fns.createErrand(payload, ctx('cust'));
    const again = await fns.createErrand(payload, ctx('cust'));
    assert.strictEqual(again.order_id, first.order_id); assert.strictEqual(again.replayed, true);
    assert.strictEqual([...db.store.keys()].filter((k) => k.startsWith('orders/')).length, 1, 'no duplicate order');
    await rejects(fns.createErrand({...payload, description: 'غير'}, ctx('cust')), 'already-exists', 'same key different data');
    for (let i = 0; i < 3; i++) await fns.createErrand(base(), ctx('cust'));
    await fns.createErrand(base(), ctx('cust'));
    await rejects(fns.createErrand(base(), ctx('cust')), 'resource-exhausted', 'rate limit after 5/min');
  }
  // ---- إعدادات ناقصة = رفض وليس توصيلًا مجانيًا ----
  {
    const {db, fns} = setup();
    db.store.set('zones/z1', {name: 'z1', is_active: true, is_accepting_orders: true});
    await rejects(fns.quoteErrand({pickup_address: pickup, dropoff_address: dropoff}, ctx('cust')), 'failed-precondition', 'zero fee');
    db.store.set('zones/z1', {delivery_fee_base: 10000, is_active: true, is_accepting_orders: false});
    await rejects(fns.quoteErrand({pickup_address: pickup, dropoff_address: dropoff}, ctx('cust')), 'failed-precondition', 'zone paused');
  }
  // ---- تحويل الفكة ----
  {
    const {db, fns, put} = setup();
    const delivered = (extra = {}) => ({customer_id: 'cust', courier_id: 'cour', status: 'delivered', payment_method: 'cash_on_delivery', cash_due: 30000, cash_change_for: 50000, delivered_at: FieldValue.serverTimestamp(), ...extra});
    put('orders/o1', delivered());
    await rejects(fns.requestChangeToWallet({order_id: 'o1'}, ctx('cust')), 'permission-denied', 'customer cannot request');
    await rejects(fns.requestChangeToWallet({order_id: 'o1'}, ctx('cour2')), 'failed-precondition', 'other courier');
    const r = await fns.requestChangeToWallet({order_id: 'o1', amount: 999999}, ctx('cour'));
    assert.strictEqual(r.amount, 20000, 'amount computed by server, not claimed'); assert.strictEqual(r.status, 'pending');
    assert.strictEqual(db.store.get('change_requests/o1').courier_claimed_amount, 999999);
    assert.strictEqual(db.store.get('users/cust').wallet_balance, 0, 'no credit before review');
    await rejects(fns.requestChangeToWallet({order_id: 'o1'}, ctx('cour')), 'already-exists', 'duplicate request');

    put('orders/o2', delivered({delivered_at: {toMillis: () => Date.now() - 49 * 3600 * 1000}}));
    await rejects(fns.requestChangeToWallet({order_id: 'o2'}, ctx('cour')), 'failed-precondition', 'expired window');
    put('orders/o3', delivered({cash_change_for: 30000}));
    await rejects(fns.requestChangeToWallet({order_id: 'o3'}, ctx('cour')), 'failed-precondition', 'no change to convert');
    put('orders/o4', delivered({status: 'on_the_way'}));
    await rejects(fns.requestChangeToWallet({order_id: 'o4'}, ctx('cour')), 'failed-precondition', 'not delivered');

    // مراجعة
    await rejects(fns.reviewChangeRequest({order_id: 'o1', decision: 'approve'}, ctx('cour')), 'permission-denied', 'courier cannot review');
    await rejects(fns.reviewChangeRequest({order_id: 'o1', decision: 'maybe'}, ctx('admin')), 'invalid-argument', 'bad decision');
    const ok = await fns.reviewChangeRequest({order_id: 'o1', decision: 'approve', note: 'تم التحقق'}, ctx('admin'));
    assert.strictEqual(ok.status, 'approved');
    assert.strictEqual(db.store.get('users/cust').wallet_balance, 20000);
    assert.strictEqual(db.store.get('courier_wallets/cour').debt, 20000, 'courier owes the cash he kept');
    assert.ok(db.store.get('users/cust/wallet_ledger/change_o1') && db.store.get('courier_wallets/cour/ledger/change_o1'));
    assert.strictEqual([...db.store.keys()].filter((k) => k.startsWith('financial_ledger/')).length, 1);
    assert.strictEqual(db.store.get('change_requests/o1').status, 'approved');
    await rejects(fns.reviewChangeRequest({order_id: 'o1', decision: 'approve'}, ctx('admin')), 'failed-precondition', 'double approve');
    assert.strictEqual(db.store.get('users/cust').wallet_balance, 20000, 'no double credit');

    put('orders/o5', delivered({cash_change_for: 40000}));
    await fns.requestChangeToWallet({order_id: 'o5'}, ctx('cour'));
    const rj = await fns.reviewChangeRequest({order_id: 'o5', decision: 'reject', note: 'غير صحيح'}, ctx('admin'));
    assert.strictEqual(rj.status, 'rejected'); assert.strictEqual(db.store.get('users/cust').wallet_balance, 20000, 'reject credits nothing');
  }
  console.log('errand function tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
