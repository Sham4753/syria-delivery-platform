# Merchant App — Syria Delivery

تطبيق التاجر/المطعم/الصيدلية/البقالة المبني بـ Flutter وFirebase. يوفر استقبال الطلبات وقبولها أو رفضها، تحديد زمن التحضير، وضع المشغول، إدارة توفر أصناف المنيو، وتقارير المبيعات والعمولات.

## الإعداد

```powershell
flutter pub get
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1 --dart-define=FIREBASE_PROJECT_ID=syria-delivery-2026-majed
```

على Android Emulator استخدم `EMULATOR_HOST=10.0.2.2`. للبناء: `flutter build apk --debug`.

المعرّف Android: `com.syria.delivery.merchant`.

فعّل Email/Password في Firebase Authentication. أنشئ مستخدمًا من Firebase Console ثم أنشئ `users/{uid}` من Firestore Console بالقيمتين:

```text
role: vendor_admin
vendor_id: <معرّف مستند المتجر في vendors>
```

لا يملك التطبيق صلاحية إنشاء دور `vendor_admin` تلقائيًا. يجب ربطه بمتجر محدد قبل الدخول.

## حالة الدفع

يعرض التطبيق طريقة الدفع الموجودة في الطلب، بينما ربط المحافظ الإلكترونية المحلية يحتاج بيانات اعتماد API رسمية من مزود الدفع وتحققًا خلفيًا للـ webhook. الدفع النقدي هو المسار الافتراضي الآمن في النسخة الحالية.
