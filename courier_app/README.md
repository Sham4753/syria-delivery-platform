# Courier App

تطبيق المندوب لمنصة Syria Delivery.

## الوظائف

تسجيل الدخول، عرض الطلبات الجديدة في المنطقة، قبول الطلب، تحديث مراحل التسليم، الموقع الدوري، المحفظة والاتصال.

## تشغيل محلي

```powershell
flutter pub get
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1 --dart-define=FIREBASE_PROJECT_ID=syria-delivery-2026-majed
```

على Android Emulator استخدم `EMULATOR_HOST=10.0.2.2`.

## البناء

```powershell
flutter build apk --debug
```

المعرّف Android: `com.syria.delivery.courier`.
