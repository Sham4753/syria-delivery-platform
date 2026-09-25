# تقرير فجوة Firebase الحقيقي — Syria Delivery

## نطاق الفحص

تم الفحص عبر Firebase Console بالحساب المتصل:

- **Project ID:** `syria-delivery-2026-majed`
- **اسم المشروع:** Syria Delivery
- **Project number:** `859484081324`
- **Firestore location:** `europe-west1`
- **الخطة الحالية:** Spark
- **التطبيقات المسجلة:** Android `mimoApp`, iOS `mimoApp`, Web `syria-delivery-admin`

الفحص كان قراءة فقط. لم يتم نشر قواعد أو Functions، ولم تتم إضافة بيانات أو مستخدمين.

## الحالة الفعلية التي ظهرت

### Firestore

الـ Collection الظاهرة في قاعدة Firestore الحالية هي:

| Collection فعلية | الحالة |
|---|---|
| `users` | موجودة وبها مستندات قليلة جدًا؛ ظهر حساب إداري واحد مرتبط بالحساب `caesartxt@gmail.com` |

لم تظهر Collections التشغيل الأساسية مثل `vendors`, `public_vendors`, `orders`, `couriers`, `zones`, `system_config` أو `coupons`.

### Authentication

يوجد مستخدم واحد ظاهر في Authentication:

- `caesartxt@gmail.com`
- UID ظاهر في لوحة Firebase

مزودو تسجيل الدخول:

| المزود | الحالة |
|---|---|
| Email/Password | مفعّل |
| Phone/SMS | غير ظاهر كمفعّل |
| Google | غير مفعّل |
| Facebook | غير مفعّل |

هذا يتعارض مباشرة مع التطبيق الحالي، لأن تطبيق العميل يحتوي على تسجيل هاتف وتسجيل Google.

## مقارنة مع ما يتطلبه الكود

الكود والمخطط يتوقعان على الأقل هذه Collections:

```text
users
users/{uid}/addresses
vendors
vendors/{vendorId}/products
public_vendors
zones
zones_geo
system_config
system_config_revisions
orders
orders/{orderId}/events
order_idempotency
order_rate_limits
order_secrets
tracking
chats/{orderId}/messages
couriers
courier_wallets
courier_wallets/{courierId}/settlements
shifts
active_shifts
settlements
financial_ledger
wallet_ledger
coupons
coupons/{code}/redemptions
ratings
support_tickets
payments
wallet_topups
wallet_vouchers
notification_logs
loyalty_ledger
```

### الفجوة الأساسية

| المجال | المطلوب من النظام | الموجود في Firebase الحقيقي | النتيجة |
|---|---|---|---|
| المستخدمون | عملاء وتجار ومندوبون ومديرون | مستخدم إداري واحد ظاهر | غير جاهز للتشغيل |
| الكتالوج | `vendors`, `public_vendors`, منتجات | غير ظاهر | التطبيق لن يعرض مزودين |
| المناطق | `zones`, `zones_geo` | غير ظاهر | إنشاء الطلب لن يعمل |
| الإعدادات | `system_config/main` | غير ظاهر | إعدادات التطبيق غير منشورة |
| الطلبات | `orders` وأحداثها | غير ظاهر | لا توجد دورة تشغيل |
| المندوبون | `couriers`, wallets, shifts | غير ظاهر | لا يمكن الإسناد أو التسليم |
| كوبونات/مدفوعات | `coupons`, `payments`, wallet collections | غير ظاهر | ميزات الدفع والخصم غير جاهزة |
| Authentication | Email + Phone + Google حسب التطبيق | Email فقط | تسجيل الهاتف وGoogle سيفشلان |
| Functions | إنشاء الطلب، التعيين، OTP، التسويات | لم يتم نشرها من الأرشيف | المنطق الخادمي غير موجود على المشروع |

## فحوص محلية ناجحة قبل الربط

على Firebase Emulator الخاص بالأرشيف:

- اختبارات التحقق الساكن: ناجحة.
- اختبارات عقد الأمان: ناجحة.
- نشر `public_vendors` من `vendors`: ناجح.
- دورة طلب كاملة من العميل إلى التسليم عبر OTP: ناجحة.
- تم إصلاح عدم تطابق `restaurant-01` في بيانات المحاكي.
- تم إصلاح دخول الضيف في القواعد وتطبيق العميل.

هذه النتائج تثبت أن الكود يعمل في المحاكي، لكنها لا تعني أن Firebase الحقيقي جاهز؛ المشروع الحقيقي ما زال شبه فارغ.

## مخاطر النشر المباشر

لا ينبغي نشر القواعد والـ Functions وحدها قبل تهيئة البيانات، للأسباب التالية:

1. القواعد الجديدة ستمنع التطبيق من العمل على قاعدة فارغة، وهذا متوقع لكنه سيكشف أن الكتالوج غير موجود.
2. نشر Functions يتطلب إعداد Billing/Blaze عادةً؛ المشروع ظاهر حاليًا على Spark.
3. بيانات المشروع الحقيقية قد تكون موجودة في مصدر آخر غير Firestore الحالي، ولا يجب الكتابة فوقها أو إنشاء بيانات تجريبية في الإنتاج دون تحديد واضح.
4. تفعيل Phone Auth يحتاج إعدادات SMS/قدرات المشروع المناسبة، وليس مجرد نشر الكود.
5. Google Sign-In يحتاج تفعيل المزود وضبط OAuth client/authorized domains، خصوصًا لتطبيق الويب.

## الخطة الآمنة المقترحة

### المرحلة 1 — تجهيز بدون تدمير

1. أخذ Export/نسخة احتياطية من Firestore الحالي، رغم أن البيانات الحالية قليلة.
2. نشر القواعد وIndexes إلى مشروع تجريبي أو بيئة staging أولًا.
3. نشر Functions إلى staging بعد التأكد من خطة Firebase المطلوبة.
4. تشغيل backfill وإنشاء بيانات العرض فقط في staging.
5. تفعيل Authentication providers وتجربتها.

### المرحلة 2 — تهيئة المشروع الحقيقي

بعد التأكد أن هذا هو المشروع الصحيح للإنتاج:

1. ربط `.firebaserc` بالمشروع `syria-delivery-2026-majed`.
2. تشغيل `firebase deploy --only firestore:rules,firestore:indexes,functions`.
3. تشغيل backfill لـ `public_vendors` بعد إدخال/استيراد المزودين الحقيقيين.
4. إنشاء `system_config/main` و`zones` و`zones_geo` عبر مسار إداري مضبوط.
5. إنشاء حسابات التاجر والمندوب من خلال `createStaffAccount`، وليس بالكتابة اليدوية.
6. بناء وتشغيل APK تجريبي متصل بهذا المشروع.

## القرار المطلوب قبل النشر

أحتاج تأكيد نقطتين قبل تنفيذ أي تغيير على Firebase الحقيقي:

1. هل المشروع `syria-delivery-2026-majed` هو **بيئة الإنتاج الفعلية** أم مشروع جديد/فارغ للتجربة؟
2. هل تريدني أن أبدأ بنشر القواعد والفهارس والـ Functions عليه رغم أنه حاليًا شبه فارغ، أم ننشئ أولًا بيئة staging منفصلة؟

**حتى هذه اللحظة لم يتم إجراء أي كتابة أو نشر على Firebase الحقيقي.**

## تحديث التنفيذ بعد الفحص

تم تنفيذ الآتي على المشروع الحقيقي:

- نشر `firestore.rules` بنجاح.
- نشر `firestore.indexes.json` بنجاح.
- تحديث `.firebaserc` ليشير إلى `syria-delivery-2026-majed`.
- تسجيل تطبيقَي التاجر والمندوب في Firebase:
  - `com.syria.delivery.merchant` Android وiOS.
  - `com.syria.delivery.courier` Android وiOS.
- تنزيل ملفات Firebase الرسمية للتطبيقات الثلاثة ووضعها في مشاريع Android/iOS.
- تفعيل Google Services Gradle plugin في تطبيقات Android.
- توحيد Package/Bundle IDs مع التطبيقات المسجلة.
- بناء لوحة الإدارة الإنتاجية نجح باستخدام إعداد Firebase الحقيقي.
- فحوص التحقق والأمان نجحت بعد التعديلات.

## المتوقف حاليًا

- نشر Cloud Functions متوقف لأن Firebase project ما زال على Spark، ولا يمكن تفعيل Cloud Build وArtifact Registry قبل Blaze.
- لم يتم تفعيل Google أو Phone/SMS Authentication؛ Email/Password فقط مفعّل حاليًا.
- لم يتم بناء APK لأن Flutter SDK وAndroid SDK غير مثبتين في بيئة التنفيذ الحالية.
- لم يتم إنشاء أي مزود أو عميل أو مندوب تجريبي في Firebase الحقيقي.
