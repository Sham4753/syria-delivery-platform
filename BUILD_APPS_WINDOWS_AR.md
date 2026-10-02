# بناء تطبيقات Android من المشروع

## البناء المحلي بضغطة واحدة

من جذر المستودع، اضغط مرتين على:

```text
BUILD_APPS_WINDOWS.bat
```

سيبني التطبيقات الثلاثة بصيغة Debug ويضع الملفات في:

```text
artifacts/android/
```

الملفات الناتجة:

- `customer-debug.apk`
- `merchant-debug.apk`
- `courier-debug.apk`

نسخة Debug مناسبة للتجربة على Android Emulator أو هاتف تطوير. ليست نسخة نشر على Google Play.

## البناء من PowerShell

```powershell
.\windows\build-apps.ps1 -App all -Mode debug
```

لبناء تطبيق واحد فقط:

```powershell
.\windows\build-apps.ps1 -App customer -Mode debug
.\windows\build-apps.ps1 -App merchant -Mode debug
.\windows\build-apps.ps1 -App courier -Mode debug
```

قبل البناء يجب أن يعمل:

```powershell
flutter doctor
flutter devices
```

## تجربة التطبيق مع Firebase Emulator

شغّل Firebase أولًا من نافذة منفصلة:

```powershell
firebase.cmd emulators:start --project syria-delivery-2026-majed --only auth,firestore,functions
```

ثم شغّل تطبيق Android مع عنوان Emulator الخاص بالمحاكي:

```powershell
flutter run -d <android-device-id> `
  --dart-define=USE_FIREBASE_EMULATORS=true `
  --dart-define=EMULATOR_HOST=10.0.2.2 `
  --dart-define=FIREBASE_PROJECT_ID=syria-delivery-2026-majed
```

في Chrome استخدم `EMULATOR_HOST=127.0.0.1` بدل `10.0.2.2`.

## البناء من GitHub بزر واحد

1. افتح مستودع GitHub.
2. افتح تبويب **Actions**.
3. اختر workflow باسم **Build Android Apps**.
4. اضغط **Run workflow**.
5. اترك `build_mode` على `debug` للتجربة، ثم اضغط **Run workflow**.
6. بعد انتهاء التشغيل افتح صفحة التنفيذ واضغط قسم **Artifacts**.
7. نزّل:
   - `android-apks-customer`
   - `android-apks-merchant`
   - `android-apks-courier`

كل Artifact يحتوي APK التطبيق المعني. لا تحفظ APK داخل Git؛ GitHub Actions هو مكان البناء والتنزيل.

## Release وFirebase App Distribution

اختيار `release` يحتاج أسرار توقيع Android في إعدادات المستودع:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEY_ALIAS`

لا تضع هذه القيم في ملفات المشروع أو في الرسائل. بعد إضافة الأسرار يمكن بناء AAB/APK موقّع. رفعه إلى Firebase App Distribution خطوة منفصلة، ولا يحدث تلقائيًا بمجرد البناء.

## الفرق بين GitHub وFirebase

- GitHub يحفظ الكود ويشغّل البناء عبر Actions.
- Firebase يشغّل Auth وFirestore وFunctions، ويمكنه توزيع APK فقط عند تنفيذ رفع صريح إلى App Distribution.
- Emulator UI على `http://127.0.0.1:4000` يعرض بيانات وخدمات Firebase، وليس قائمة APKات.
