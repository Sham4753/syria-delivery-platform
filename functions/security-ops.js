'use strict';

const SAFE_ACTION = /^[a-z0-9_-]{1,64}$/;

function appCheckRequired() {
  return String(process.env.ENFORCE_APPCHECK || '').toLowerCase() === 'true';
}

function assertAppCheck(context, HttpsError) {
  if (appCheckRequired() && !context?.app) {
    throw new HttpsError('failed-precondition', 'يلزم تحقق App Check لهذه العملية');
  }
}

function quotaDocumentId(uid, action) {
  const normalizedUid = String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const normalizedAction = String(action || '').toLowerCase();
  if (!normalizedUid || !SAFE_ACTION.test(normalizedAction)) throw new Error('invalid_quota_key');
  return `${normalizedUid}_${normalizedAction}`;
}

async function consumeQuota({db, uid, action, limit, windowMs, HttpsError, now = Date.now()}) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1000) throw new Error('invalid_quota_policy');
  const ref = db.doc(`security_rate_limits/${quotaDocumentId(uid, action)}`);
  let result;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const windowStart = Number(current.window_start || 0);
    const count = windowStart > 0 && now - windowStart < windowMs ? Number(current.count || 0) : 0;
    const nextWindowStart = count === 0 ? now : windowStart;
    if (count >= limit) {
      const retryAfterMs = Math.max(0, windowMs - (now - nextWindowStart));
      throw new HttpsError('resource-exhausted', 'تم تجاوز الحد المؤقت للعملية', {retry_after_ms: retryAfterMs});
    }
    result = {count: count + 1, limit, window_start: nextWindowStart, retry_after_ms: Math.max(0, windowMs - (now - nextWindowStart))};
    tx.set(ref, {uid, action, count: result.count, limit, window_start: nextWindowStart, updated_at: now}, {merge: true});
  });
  return result;
}

function incidentRecord({source, code, message, context = {}, now = null}) {
  const safeContext = Object.fromEntries(Object.entries(context || {}).filter(([key]) => !/secret|password|token|api[_-]?key|authorization/i.test(key)).slice(0, 20).map(([key, value]) => [String(key).slice(0, 64), String(value).slice(0, 200)]));
  return {
    source: String(source || 'unknown').slice(0, 80),
    code: String(code || 'unknown').slice(0, 80),
    message: String(message || 'unknown').slice(0, 500),
    context: safeContext,
    created_at: now || new Date().toISOString(),
  };
}

module.exports = {appCheckRequired, assertAppCheck, quotaDocumentId, consumeQuota, incidentRecord};
