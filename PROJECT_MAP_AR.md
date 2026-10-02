# خريطة مشروع Syria Delivery

هذا المستودع هو المصدر الوحيد للكود والتوثيق والبناء. يحتوي على منصة توصيل متعددة الأطراف، وليس ثلاثة تطبيقات منفصلة بلا رابط.

## مكونات النظام

| المجلد | الوظيفة | المعرّف Android |
|---|---|---|
| `customer_app/` | تطبيق العميل: تصفح المزودين، السلة، الطلبات، التتبع والدردشة | `com.mycompany.mimoapp` |
| `merchant_app/` | تطبيق التاجر/المطعم/الصيدلية/البقالة لإدارة الطلبات والمنتجات | `com.syria.delivery.merchant` |
| `courier_app/` | تطبيق المندوب لاستلام الطلبات وتحديث حالتها والموقع | `com.syria.delivery.courier` |
| `admin-dashboard/` | لوحة الإدارة المبنية بـ React + Vite | Web |
| `functions/` | Cloud Functions وTriggers، ومنها نشر المزودين للعامة | Firebase Functions |
| `firestore.rules` | قواعد الوصول والصلاحيات | Firestore |
| `scripts/` | التهيئة والاختبارات والبيانات التجريبية | Node.js |

## كيف تتصل المكونات؟

```text
العميل ─┐
التاجر ─┼── Firebase Auth / Firestore / Functions ── لوحة الإدارة
المندوب ─┘
```

في التطوير المحلي تعمل خدمات Firebase على:

- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001`
- Emulator UI: `http://127.0.0.1:4000`

معرّف المشروع المحلي/المهيأ في المستودع هو `syria-delivery-2026-majed`. لا تستخدم `demo-syria-delivery` مع هذا المستودع؛ لأن ذلك يفصل بيانات الاختبار عن Triggers Functions.

## البداية السريعة على Windows

1. ثبّت Node.js LTS وFirebase CLI وFlutter وAndroid Studio عند الحاجة.
2. اضغط مرتين على [`START_HERE.bat`](START_HERE.bat) لتشغيل Firebase Emulator ولوحة الإدارة وتطبيقات Flutter على Chrome.
3. أو استخدم [`BUILD_APPS_WINDOWS.bat`](BUILD_APPS_WINDOWS.bat) لبناء APKات Debug.
4. افتح [`BUILD_APPS_WINDOWS_AR.md`](BUILD_APPS_WINDOWS_AR.md) للتفاصيل وخيارات Android وGitHub Actions.

## الحسابات التجريبية المحلية

بعد تشغيل التهيئة:

| الدور | البريد | كلمة المرور |
|---|---|---|
| Admin | `admin@test.local` | `test123456` |
| Vendor | `vendor@test.local` | `test123456` |
| Courier | `courier@test.local` | `test123456` |
| Customer | `customer@test.local` | `test123456` |

هذه الحسابات تعمل مع Emulator فقط، وليست حسابات إنتاج.

## الاختبارات الأساسية

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:GCLOUD_PROJECT = "syria-delivery-2026-majed"

node scripts/security-contract.test.js
node scripts/test-public-vendor-publication.js
```

## قواعد مهمة للمساهمين

- لا تضع مفاتيح أو ملفات توقيع أو كلمات مرور في Git.
- لا تعدّل `pubspec.lock` أو ملفات إعداد Firebase بلا سبب موثق.
- استخدم GitHub Actions للبناء القابل للتنزيل بدل رفع APK يدويًا إلى المستودع.
- اختبر Emulator قبل اختبار Firebase الإنتاجي.
- اقرأ `README.md` و`BUILD_APPS_WINDOWS_AR.md` قبل تشغيل أو تعديل النظام.
