# ترحيل مقياس الأسعار — المرحلة 1-ب

## نطاق التنفيذ

تم تحويل بيانات الاختبار والـ seed والإعدادات النموذجية وقيم الأدمن الافتراضية من الليرة القديمة إلى الليرة الجديدة وفق:

> القيمة الجديدة = القيمة القديمة ÷ 100

لم تُعدّل Cloud Functions أو قواعد الحساب أو `firestore.rules` أو `applicationId` أو ملفات Firebase.

## القرارات المالية المعتمدة

- `loyalty_points` و`loyalty_points_used` وأرصدة النقاط **وحدات مستقلة** وليست مبالغ SYP؛ لم تُحوّل.
- قيم الاختبار العدائية مثل `999999` **بقيت كما هي**، حتى تستمر في اختبار تجاوز الحدود.
- `credit_limit: 100` **بقيت كما هي** ولم تُحوّل؛ تحتاج الوحدة والحد إلى قرار مالي مستقل.
- `loyalty_point_value` تغيّر من `10` إلى `0.1` في بيانات seed، بما يتوافق مع تحويل قيمة النقطة النقدية.
- أضيف `loyalty_points_divisor: 10` إلى seed والمثال، بينما بقيت لوحة الأدمن دون إرسال هذا الحقل إلى Function لأن مخطط النشر الحالي لا يسمح به بعد.
- لم يتغير fallback داخل `functions/index.js`: ما زال `loyalty_points_divisor || 1000` حتى تصدر موافقة مستقلة على تعديل منطق الدالة.

## موضع divisor وسلوك غياب credit_limit

- يُقرأ `loyalty_points_divisor` في `functions/index.js:1372` عند حساب نقاط العميل بعد تسليم الطلب:
  `floor((subtotal - discount_amount) / divisor * loyalty_points_rate)`.
- كان النص الموازي في لوحة الأدمن `نقاط الولاء لكل 1000`، وأصبح `نقاط الولاء لكل 10`.
- في الإسناد الآلي داخل `functions/index.js:898` و`functions/dispatch-engine.js:23`، غياب `credit_limit` يجعل الحد البديل `100`.
- في `claimCourierOrder` داخل `functions/index.js:952`، غياب الحقل يجعل الحد البديل `0`.
- النتيجة العملية: قد يعتبر الإسناد الآلي المندوب مؤهلًا حتى حد دين 100، ثم ترفض المطالبة اليدوية نفسها عند غياب الحقل لأن أي دين غير صفري يساوي أو يتجاوز حدًا افتراضيًا قدره 0. لم يُعدّل هذا التناقض في هذه المرحلة.

## ما لم يُنفذ

- لم يُضف `price_display_mode`.
- لم يُعدّل fallback `1000` داخل Function.
- لم يُعدّل أي منطق حسابي أو مخطط تحقق أو حدود `max`.
- لم تُنشر بيانات أو Functions أو Rules إلى Firebase.
- بقي `credit_limit` دون تحويل.

## الملفات المعدلة

- `scripts/seed-emulator.js`
- `config/system-config.example.json`
- `scripts/test-errand-functions.js`
- `scripts/test-errand-geo.js`
- `scripts/courier-settlement.test.js`
- `scripts/payment-provider.test.js`
- `scripts/financial-ledger.test.js`
- `scripts/referral-profile.test.js`
- `scripts/smoke-order.js`
- `admin-dashboard/src/components/OperationsPages.jsx`
- `admin-dashboard/src/components/MasterSettingsPage.jsx`
- `docs/PRICE_SCALE_MIGRATION_AR.md`
