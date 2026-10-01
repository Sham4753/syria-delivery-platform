const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {normalizeTopUpRequest, consumeTopUpQuotas, TOPUP_QUOTAS} = require('../functions/wallet-guard');
const {consumeQuota} = require('../functions/security-ops');

class TestHttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return 'none'; };

// تنظيف مدخلات القسائم
assert.deepStrictEqual(normalizeTopUpRequest({method: 'voucher', reference: ' abcd-1234 '}, TestHttpsError), {method: 'voucher', reference: 'ABCD-1234'});
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'voucher', reference: 'a/b/c/d'}, TestHttpsError)), 'failed-precondition');
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'voucher', reference: 'AB'}, TestHttpsError)), 'failed-precondition');
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'voucher', reference: 'X'.repeat(65)}, TestHttpsError)), 'failed-precondition');
// الطرق الأخرى
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'local_transfer', reference: 'x'.repeat(81)}, TestHttpsError)), 'invalid-argument');
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'local_transfer', reference: 'a\nb'}, TestHttpsError)), 'invalid-argument');
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'bitcoin', reference: 'abc'}, TestHttpsError)), 'invalid-argument');
assert.strictEqual(code(() => normalizeTopUpRequest({method: 'voucher'}, TestHttpsError)), 'invalid-argument');
assert.deepStrictEqual(normalizeTopUpRequest({method: 'local_transfer', reference: ' TRX 99 '}, TestHttpsError), {method: 'local_transfer', reference: 'TRX 99'});

// الحصص: العاشرة تنجح والحادية عشرة تُرفض
function fakeDb() {
  const values = new Map();
  return {
    doc(p) { return {path: p, async get() { const v = values.get(p); return {exists: Boolean(v), data: () => v}; }}; },
    async runTransaction(cb) { return cb({get: (ref) => ref.get(), set: (ref, v) => values.set(ref.path, {...(values.get(ref.path) || {}), ...v})}); },
  };
}
(async () => {
  const db = fakeDb();
  const now = Date.now();
  for (let i = 0; i < 10; i += 1) await consumeTopUpQuotas({db, uid: 'u1', HttpsError: TestHttpsError, consumeQuota, now});
  await assert.rejects(() => consumeTopUpQuotas({db, uid: 'u1', HttpsError: TestHttpsError, consumeQuota, now}), (e) => e.code === 'resource-exhausted');
  // مستخدم آخر غير متأثر
  await consumeTopUpQuotas({db, uid: 'u2', HttpsError: TestHttpsError, consumeQuota, now});
  // بعد انتهاء نافذة 10 دقائق يعود المستخدم للشحن
  await consumeTopUpQuotas({db, uid: 'u1', HttpsError: TestHttpsError, consumeQuota, now: now + 10 * 60 * 1000 + 1});
  assert.ok(TOPUP_QUOTAS.length === 2);

  // العقد: topUpWallet فعلاً يستخدم الحارس
  const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
  const body = source.slice(source.indexOf('exports.topUpWallet'), source.indexOf('exports.createOrder'));
  assert(/normalizeTopUpRequest/.test(body) && /consumeTopUpQuotas/.test(body), 'topUpWallet must validate and rate-limit');
  console.log('wallet-guard tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
