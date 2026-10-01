const assert = require('assert');
const {appCheckRequired, assertAppCheck, quotaDocumentId, consumeQuota, incidentRecord} = require('../functions/security-ops');

class TestHttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

function fakeDb() {
  const values = new Map();
  return {
    doc(path) {
      return {path, async get() { const value = values.get(path); return {exists: Boolean(value), data: () => value}; }};
    },
    async runTransaction(callback) {
      const tx = {get: ref => ref.get(), set: (ref, value) => values.set(ref.path, {...(values.get(ref.path) || {}), ...value})};
      return callback(tx);
    },
    values,
  };
}

process.env.ENFORCE_APPCHECK = 'true';
assert.strictEqual(appCheckRequired(), true);
assert.throws(() => assertAppCheck({auth: {uid: 'u1'}}, TestHttpsError), error => error.code === 'failed-precondition');
assert.doesNotThrow(() => assertAppCheck({app: {appId: 'test'}}, TestHttpsError));
assert.strictEqual(quotaDocumentId('user/1', 'support_ticket'), 'user_1_support_ticket');
assert.throws(() => quotaDocumentId('u1', 'not safe'), /invalid_quota_key/);

(async () => {
  const db = fakeDb();
  const first = await consumeQuota({db, uid: 'u1', action: 'support_ticket', limit: 2, windowMs: 60000, HttpsError: TestHttpsError, now: 1000});
  const second = await consumeQuota({db, uid: 'u1', action: 'support_ticket', limit: 2, windowMs: 60000, HttpsError: TestHttpsError, now: 1001});
  assert.strictEqual(first.count, 1);
  assert.strictEqual(second.count, 2);
  await assert.rejects(() => consumeQuota({db, uid: 'u1', action: 'support_ticket', limit: 2, windowMs: 60000, HttpsError: TestHttpsError, now: 1002}), error => error.code === 'resource-exhausted');
  const reset = await consumeQuota({db, uid: 'u1', action: 'support_ticket', limit: 2, windowMs: 60000, HttpsError: TestHttpsError, now: 61001});
  assert.strictEqual(reset.count, 1);
  const record = incidentRecord({source: 'callable', code: 'failed-precondition', message: 'App Check', context: {token: 'must-be-short-and-sanitized'}, now: 'now'});
  assert.strictEqual(record.created_at, 'now');
  assert.strictEqual(record.source, 'callable');
  assert.strictEqual(record.context.token, undefined);
  console.log('Security operations tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
