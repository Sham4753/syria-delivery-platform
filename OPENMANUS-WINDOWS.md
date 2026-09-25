# تشغيل OpenManus وبناء Syria Delivery على Windows 11

هذه الحزمة لا تحتوي أي مفتاح API. يجب أن يضيف مالك الجهاز المفتاح بنفسه داخل ملف إعداد OpenManus.

## 1. تثبيت المتطلبات على Windows

ثبّت من المصادر الرسمية:

- **Git for Windows**.
- **Node.js LTS**.
- **Flutter SDK** وأضفه إلى PATH.
- **Android Studio** مع Android SDK وAndroid SDK Platform-Tools.
- **WSL2 Ubuntu** من PowerShell بصلاحية Administrator:

```powershell
wsl --install -d Ubuntu
```

أعد تشغيل Windows إذا طلب منك ذلك، ثم افتح Ubuntu مرة واحدة لإنشاء اسم المستخدم وكلمة المرور.

بعد فك ضغط المشروع، افتح PowerShell داخل مجلد `syria-delivery` وشغّل:

```powershell
.\windows\check-environment.ps1
```

إذا منع PowerShell تشغيل السكربتات في هذه الجلسة فقط:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## 2. تثبيت OpenManus داخل WSL2

شغّل PowerShell من مجلد المشروع:

```powershell
.\windows\install-openmanus.ps1
```

السكربت يقوم بتثبيت Python 3.12 وuv داخل Ubuntu، ثم يستنسخ OpenManus الرسمي من:

https://github.com/FoundationAgents/OpenManus

ويضعه داخل:

```text
syria-delivery/openmanus
```

## 3. إعداد نموذج الذكاء الاصطناعي

افتح الملف التالي من Windows عبر VS Code أو Notepad:

```text
openmanus/config/config.toml
```

انسخ الإعدادات من `config/config.example.toml`، ثم ضع مزود النموذج ومفتاحه. مثال OpenAI:

```toml
[llm]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
api_key = "ضع_مفتاحك_هنا"
max_tokens = 4096
temperature = 0.0
```

لا تضع المفتاح داخل Git أو داخل ZIP عام. ملف `config.toml` محلي وسري.

## 4. تشغيل OpenManus

من Windows:

```powershell
.\windows\run-openmanus.bat
```

بعد بدء البرنامج، اطلب منه العمل داخل المسار:

```text
/mnt/c/مسار-المشروع/syria-delivery
```

أو افتح مجلد المشروع نفسه عبر WSL. مثال مهمة آمنة:

```text
افحص مشروع Syria Delivery بالكامل، شغّل الفحوصات، أصلح أخطاء البناء فقط، ولا تغيّر قواعد Firestore أو Cloud Functions أو الحقول دون تقرير وموافقة.
```

## 5. بناء المشروع بالكامل

من PowerShell داخل مجلد المشروع:

```powershell
.\windows\build-all.ps1
```

الأمر ينفذ:

```text
admin-dashboard: npm install, npm run lint, npm run build
customer_app: flutter pub get, flutter analyze, flutter build web
courier_app: flutter pub get, flutter analyze, flutter build web
merchant_app: flutter pub get, flutter analyze, flutter build web
```

لبناء لوحة الأدمن فقط إذا لم تثبت Flutter بعد:

```powershell
.\windows\build-all.ps1 -SkipFlutter
```

## 6. Firebase

ثبّت Firebase CLI على Windows:

```powershell
npm install -g firebase-tools
firebase login
firebase use <PROJECT_ID>
```

للتجربة المحلية:

```powershell
firebase emulators:start
```

لا تنشر القواعد أو الوظائف إلى مشروع Firebase حقيقي قبل مراجعة `firestore.rules` وفحص الحسابات والصلاحيات.

## 7. تشغيل الواجهات محليًا

لوحة الأدمن:

```powershell
cd admin-dashboard
npm run dev
```

تطبيق العميل على Chrome:

```powershell
cd customer_app
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1
```

تطبيق المندوب:

```powershell
cd courier_app
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1
```

تطبيق التاجر:

```powershell
cd merchant_app
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1
```

## ملاحظات مهمة

OpenManus ليس بديلًا عن Flutter أو Firebase CLI؛ دوره مساعد برمجي يعمل على ملفات المشروع ويشغّل أوامر التطوير بعد إعطائه صلاحية واضحة. لا تمنحه مفاتيح Firebase Admin أو مفاتيح الإنتاج داخل المحادثة. احتفظ بنسخة Git قبل أي مهمة إصلاح آلية، واطلب منه إنشاء تقرير تغييرات قبل النشر.

المراجع الرسمية:

- [OpenManus](https://github.com/FoundationAgents/OpenManus)
- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Firebase for Flutter](https://firebase.google.com/docs/flutter/setup)
- [Flutter على Android Studio](https://docs.flutter.dev/tools/android-studio)
