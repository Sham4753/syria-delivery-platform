'use strict';

const TOPUP_METHODS = ['voucher', 'local_transfer', 'change_to_wallet'];
// أكواد القسائم: أحرف وأرقام وشرطات فقط. هذا يمنع حرف "/" من كسر مسار الوثيقة
// ويمنع المدخلات الطويلة أو الغريبة قبل أي قراءة من قاعدة البيانات.
const VOUCHER_CODE = /^[A-Z0-9_-]{4,64}$/;
const MAX_REFERENCE_LENGTH = 80;

// حصص الشحن لكل مستخدم. تُستهلك مع كل محاولة (ناجحة أو فاشلة) لإبطاء تخمين الأكواد.
const TOPUP_QUOTAS = [
  {action: 'wallet_topup', limit: 10, windowMs: 10 * 60 * 1000},
  {action: 'wallet_topup_day', limit: 40, windowMs: 24 * 60 * 60 * 1000},
];

// يتحقق من مدخلات الشحن ويعيد {method, reference} بعد التنظيف.
// يرمي HttpsError(invalid-argument) عند أي قيمة غير صالحة.
function normalizeTopUpRequest(data, HttpsError) {
  const method = String(data?.method || '');
  const reference = String(data?.reference || '').trim();
  if (!TOPUP_METHODS.includes(method) || !reference) {
    throw new HttpsError('invalid-argument', 'طريقة الشحن والمرجع مطلوبان');
  }
  if (method === 'voucher') {
    const code = reference.toUpperCase();
    // رسالة موحّدة مع حالة "الكود غير موجود" حتى لا نكشف شكل الأكواد الصحيحة.
    if (!VOUCHER_CODE.test(code)) throw new HttpsError('failed-precondition', 'كود الشحن غير صالح أو مستخدم');
    return {method, reference: code};
  }
  if (reference.length > MAX_REFERENCE_LENGTH || /[\u0000-\u001f]/.test(reference)) {
    throw new HttpsError('invalid-argument', 'المرجع طويل جداً أو يحتوي رموزاً غير صالحة');
  }
  return {method, reference};
}

async function consumeTopUpQuotas({db, uid, HttpsError, consumeQuota, now}) {
  for (const quota of TOPUP_QUOTAS) {
    await consumeQuota({db, uid, HttpsError, now, ...quota});
  }
}

module.exports = {TOPUP_METHODS, VOUCHER_CODE, TOPUP_QUOTAS, normalizeTopUpRequest, consumeTopUpQuotas};
