# Syria Delivery — Private Node.js Server

هذا الخادم يستبدل الاعتماد التشغيلي على Cloud Functions عند استخدام Firebase Spark أو عند استضافة المنطق على خادم خاص. ما زال Firestore وFirebase Auth مصدر البيانات، بينما التحقق من التوكن، العمليات الحساسة، ومجدول الإسناد تعمل هنا.

## التشغيل

```bash
cd server
npm install
cp .env.example .env
# اضبط GOOGLE_APPLICATION_CREDENTIALS أو استخدم اعتماد البيئة في الخادم
npm start
```

- `GET /health` فحص صحة الخدمة.
- `POST /v1/call/topUpWallet` شحن المحفظة بكود أو طلب تحويل محلي.
- `POST /v1/call/claimCourierOrder` قبول عرض التوصيل.
- `POST /v1/call/rejectCourierOrder` رفض العرض وإعادة الطلب للطابور.
- `POST /v1/call/completeDelivery` تأكيد التسليم برمز OTP.
- `POST /v1/call/cancelOrder` إلغاء طلب العميل.

كل مسار يحتاج `Authorization: Bearer <Firebase ID token>`. لا تضع مفتاح الخدمة داخل المستودع؛ استخدم Secret Manager أو متغير بيئة في الخادم.

## ملاحظات الترحيل

تطبيقات Flutter يمكنها استخدام هذه المسارات عبر عميل HTTP بدل `httpsCallable`. عمليات إنشاء الطلب، التسعير، الإشعارات، والتقارير تبقى في طبقة الدومين نفسها وتُنقل تدريجيًا إلى مسارات مماثلة؛ لا يوجد اعتماد على `firebase-functions` داخل الخادم.
