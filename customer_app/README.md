# Customer App

تطبيق العميل لمنصة Syria Delivery.

## الوظائف

تسجيل الدخول، عرض المزودين والمنتجات، العناوين، السلة والطلب، التتبع، الدردشة، المحفظة والكوبونات.

## تشغيل محلي

من جذر المستودع شغّل Firebase Emulator ثم:

```powershell
flutter pub get
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1 --dart-define=FIREBASE_PROJECT_ID=syria-delivery-2026-majed
```

على Android Emulator استخدم `EMULATOR_HOST=10.0.2.2`.

## البناء

```powershell
flutter build apk --debug
```

المعرّف Android الحالي: `com.mycompany.mimoapp`، وهو المعرّف المسجل في ملف Firebase لهذا التطبيق. لا تغيّره دون تسجيل تطبيق Android جديد في Firebase وتحديث `google-services.json`.
