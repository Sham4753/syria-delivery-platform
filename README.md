# Syria Delivery Platform

منصة توصيل متعددة الأطراف لمنطقة واحدة، ومصدرها الوحيد هو هذا المستودع. يحتوي المشروع على تطبيق العميل، تطبيق التاجر، تطبيق المندوب، لوحة الإدارة، Firebase Functions وقواعد Firestore.

## ابدأ من هنا

- خريطة النظام: [`PROJECT_MAP_AR.md`](PROJECT_MAP_AR.md)
- بناء APKات Android: [`BUILD_APPS_WINDOWS_AR.md`](BUILD_APPS_WINDOWS_AR.md)
- تشغيل العرض المحلي: [`START_HERE_AR.md`](START_HERE_AR.md)
- إعداد Firebase على Windows: [`FIREBASE_SETUP_WINDOWS_AR.md`](FIREBASE_SETUP_WINDOWS_AR.md)
- مخطط Firestore: [`firestore-schema.md`](firestore-schema.md)

## المكونات

- `customer_app/`: تطبيق العميل — Android/Web/iOS.
- `merchant_app/`: تطبيق التاجر — استقبال الطلبات وإدارة المتجر.
- `courier_app/`: تطبيق المندوب — الطلبات المسندة والتسليم والموقع.
- `admin-dashboard/`: لوحة الإدارة React + Vite.
- `functions/`: Cloud Functions وFirestore triggers.
- `scripts/`: seed واختبارات العقود والسيناريوهات.
- `firestore.rules`: قواعد الصلاحيات.

## تشغيل محلي سريع على Windows

للتشغيل الكامل على Chrome، اضغط مرتين على:

```text
START_HERE.bat
```

يفتح المشغل Firebase Emulator ولوحة الإدارة وتطبيقات Flutter الثلاثة. لا يغلق المشغل عمليات Node أو Firebase عامة؛ إذا كانت المنافذ مستخدمة، أغلق جلسة المشروع القديمة أو غيّر المنافذ يدويًا.

المنافذ المحلية:

| الخدمة | العنوان |
|---|---|
| Firebase Emulator UI | `http://127.0.0.1:4000` |
| Auth | `127.0.0.1:9099` |
| Firestore | `127.0.0.1:8080` |
| Functions | `127.0.0.1:5001` |
| Admin Dashboard | يطبعه المشغل |
| Customer / Courier / Merchant Web | `3000` / `3001` / `3002` |

لتهيئة بيانات العرض يدويًا:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:GCLOUD_PROJECT = "syria-delivery-2026-majed"
node scripts/seed-emulator.js
```

الحسابات التجريبية: `admin@test.local`, `vendor@test.local`, `courier@test.local`, `customer@test.local`، وكلمة المرور للجميع `test123456`.

## بناء APKات Android

### محليًا

اضغط `BUILD_APPS_WINDOWS.bat`، أو نفّذ:

```powershell
.\windows\build-apps.ps1 -App all -Mode debug
```

تظهر الملفات في `artifacts/android/`. للبناء عبر GitHub: افتح **Actions → Build Android Apps → Run workflow** واترك `debug` للتجربة. شرح التنزيل الكامل في [`BUILD_APPS_WINDOWS_AR.md`](BUILD_APPS_WINDOWS_AR.md).

### من GitHub Actions

كل Push أو Pull Request يمرر التحليل والاختبارات ويبني APKات Debug. التشغيل اليدوي يتيح `debug` أو `release`. إصدار `release` يتطلب أسرار توقيع Android؛ لا تضعها في Git.

## الاختبارات

```powershell
npm run test:security-contract
npm run test:vendor-publication
```

يجب تشغيل Auth/Firestore/Functions Emulator قبل اختبارات التكامل.

## Firebase والإنتاج

المشروع المهيأ هو `syria-delivery-2026-majed`. ملفات `google-services.json` المضمنة مرتبطة بهذا المشروع ولا تحتوي مفاتيح خدمة خاصة. لا تخلط Project ID مع `demo-syria-delivery` لأن ذلك يفصل Triggers عن البيانات.

Firebase لا يرفع APK تلقائيًا إلى App Distribution. GitHub Actions يبني الملفات ويتيح تنزيلها كـ Artifacts؛ رفعها إلى Firebase Distribution قرار وخطوة مستقلة.

## قواعد العمل

- لا تضع مفاتيح الخدمة أو ملفات التوقيع أو `.env` في Git.
- لا تعدّل قواعد Firestore أو وظائف الإنتاج قبل تشغيل اختبارات Emulator.
- استخدم أسماء مجلدات التطبيقات كما هي؛ فهي جزء من Matrix البناء.
- سجّل أي تغيير تشغيلي في التوثيق القريب من السكربت.
