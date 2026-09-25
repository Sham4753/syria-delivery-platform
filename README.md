# Syria Delivery — Multi-Vendor MVP

## وضع الإنتاج والمحاكي

تطبيقَا المندوب والتاجر يعملان افتراضيًا على Firebase الإنتاجي. استخدم `--dart-define=USE_FIREBASE_EMULATORS=true` فقط للعروض المحلية مع Emulator. يجب تزويد بناء الإنتاج بإعدادات Firebase الخاصة بالعميل عبر إعدادات المنصة، وعدم استخدام مشروع Demo.

منصة توصيل متعددة المزودين في منطقة واحدة، مع لوحة أدمن وتطبيقَي Flutter.

## تشغيل العرض بضغطة واحدة على Windows

بعد فك الضغط، اضغط مرتين على `START_HERE.bat`. سيفتح العرض المبني للوحة الإدارة محليًا في المتصفح. إذا لم يتوفر Node.js، يحاول المشغّل استخدام Python. راجع `START_HERE_AR.md` للتفاصيل والقيود.

هذه الحزمة تتضمن المصدر الكامل ولوحة الإدارة المبنية، لكنها لا تتضمن APK أو EXE لتطبيقات Flutter لأن بناء Flutter الأصلي يحتاج بيئة Flutter وأجهزة اختبار غير متوفرة في هذه الحزمة. تشغيل النظام الإنتاجي الكامل يحتاج إعداد Firebase ومزودات الدفع والرسائل والخرائط.

## المجلدات

- `admin-dashboard/`: لوحة إدارة React + Vite.
- `customer_app/`: تطبيق Flutter فعلي للزبون: تسجيل الدخول، الفئات، المزودون، المنتجات، الطلبات، التتبع والدردشة.
- `merchant_app/`: تطبيق Flutter للتاجر: استقبال/رفض الطلبات، تحديد زمن التحضير، وضع المشغول، إدارة توفر المنتجات وتقارير المبيعات.
- `courier_app/`: تطبيق Flutter فعلي للمندوب: تسجيل الدخول، الطلبات المسندة، الحالات والموقع الدوري كل دقيقتين.
- `firestore-schema.md`: مرجع نموذج بيانات Firestore.
- `firestore.rules`: قواعد الوصول حسب الأدوار.
- `functions/`: Cloud Functions لحساب العمولة وإرسال الإشعارات.

## تشغيل لوحة الأدمن

```bash
cd admin-dashboard
npm run dev
```

قبل الربط بـ Firebase، انسخ ملف البيئة:

```bash
cp .env.example .env.local
```

ثم ضع إعدادات تطبيق Firebase Web في `.env.local`.

### إنشاء أول حساب أدمن يدويًا (مطلوب قبل تشغيل اللوحة)

لوحة الأدمن لا تنشئ حسابات تلقائيًا ولا تعرض أي بيانات قبل تسجيل الدخول. لإنشاء أول أدمن:

1. افتح **Firebase Console → Authentication → Users**، اختر **Add user**، وأنشئ مستخدمًا بالبريد الإلكتروني وكلمة المرور.
2. انسخ `User UID` للمستخدم الذي أنشأته.
3. افتح **Firestore Database → Data**، وأنشئ مجموعة `users` ومستندًا بمعرّف يساوي `UID` المنسوخ تمامًا.
4. أضف الحقل `role` من النوع string وقيمته `super_admin`، ويمكن إضافة بقية حقول الملف الشخصي لاحقًا.
5. افتح لوحة الأدمن وسجّل الدخول بالبريد وكلمة المرور. إذا كان الحساب مسجلًا في Authentication دون مستند `users/{uid}` الصحيح، أو كانت قيمة `role` مختلفة، فسيظهر رفض الوصول.

لا تنشئ مستخدم الأدمن من تطبيق العميل أو المندوب. قواعد Firestore تسمح بالإنشاء الذاتي فقط إذا كانت قيمة الدور `customer` أو `courier`، بينما منح `super_admin` و`vendor_admin` يتم يدويًا من Firebase Console أو بواسطة أدمن موجود.

## تشغيل تطبيقات Flutter

```bash
cd customer_app
flutter pub get
flutter run
```

وللمندوب:

```bash
cd courier_app
flutter pub get
flutter run
```

قبل التشغيل، نفّذ `flutterfire configure` داخل كل تطبيق لتوليد `lib/firebase_options.dart`، ثم استبدل `Firebase.initializeApp()` بتهيئة `DefaultFirebaseOptions.currentPlatform` إذا كان مشروعك يحتاج إعدادات صريحة. فعّل Authentication (Email/Password) وFirestore من Firebase Console.

## النشر

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

تم اختبار تحليل Dart وبناء لوحة الويب محلياً. إخراج APK في بيئة الإنشاء الحالية يحتاج Android SDK، لكنه قابل للبناء مباشرة على جهاز Android/Flutter مجهز. قبل نشر قواعد Firestore، اختبر تسجيل الدخول بحساب `super_admin` وتحقق من رفض إنشاء مستند مستخدم بدور `super_admin` من تطبيق غير أدمن.

## نطاق الجولة الموسعة

تمت إضافة بحث العميل وترتيب النتائج، بيانات نوع التنفيذ والدفع والجدولة في نموذج الطلب، محادثة وتتبع حي، تطبيق تاجر مستقل، وضع المشغول وإدارة توفر المنيو، قبول الطلب وتحديد زمن التحضير، تقارير المبيعات، محفظة المندوب، إشعارات Firebase Cloud Messaging، توزيع أولي للطلبات على مندوب متاح في المنطقة، ومراقبة مباشرة للطلبات والمندوبين في لوحة الإدارة. الدفع الإلكتروني المحلي ممثل كحالات وحقول جاهزة للربط بمزوّد رسمي؛ لا يُفترض اعتبار تسجيل الدفع الإلكتروني مكتملًا قبل الحصول على API وتوقيع/تحقق webhook من المزوّد.

### تشغيل تطبيق التاجر

```bash
cd merchant_app
flutter pub get
flutterfire configure
flutter run
```

أنشئ مستخدم التاجر من Firebase Authentication ثم أنشئ `users/{uid}` يدويًا بالقيمتين `role: "vendor_admin"` و`vendor_id: "معرّف المتجر"`. لا تمنح هذا الدور من تطبيق الهاتف.

### القيود التشغيلية المهمة

التوزيع الحالي يختار أول مندوب متاح في المنطقة كآلية MVP، ولا يدّعي حساب المسافة أو التجميع الأمثل. لإطلاق إنتاجي يجب إضافة خدمة GeoQuery/Redis، قواعد منع التزاحم الذرية، وإشعارات SMS احتياطية. كما يجب اختبار التخزين المؤقت والعمل دون اتصال على أجهزة فعلية، وتكوين صلاحيات Android/iOS للموقع والإشعارات، وإنشاء فهارس Firestore المذكورة في هذا المستودع.

### إصلاح الجولة الثامنة: استقلال التحضير عن التعيين

كل طلب جديد يكتب `courier_id: null` صراحة. يستطيع التاجر نقله من `pending` إلى `preparing` دون تعيين مندوب. تطبيق السائق يستعلم عن طلبات منطقته التي يكون فيها `courier_id == null`، ثم يرشح حالات `pending` و`preparing` و`ready_for_pickup` فقط. عند القبول يكتب المندوب `courier_id` فقط ويحافظ على حالة التحضير، وقاعدة Firestore تمنع التعيين إذا كان الطلب مسندًا أو خارج هذه الحالات.

سيناريو الاختبار: أنشئ طلبًا من العميل، اقبله من تطبيق التاجر ليصبح `preparing`، سجّل دخول مندوب في المنطقة نفسها، تحقق من ظهوره في قائمة الطلبات الجديدة، ثم اضغط قبول وتحقق من كتابة `courier_id` وبقاء `status: preparing`. بعد ذلك يمكن للتاجر تحويله إلى `ready_for_pickup` وللمندوب إلى `picked_up` ثم `on_the_way` و`delivered`.

## دورة الطلب في الجولة الثالثة

تم اختيار آلية قبول الطلب من المندوب: شاشة المندوب تستمع إلى طلبات `pending` في `zone_id` الخاص به، وزر القبول يكتب `courier_id` و`status: accepted`. قواعد Firestore تمنع قبول طلب خارج منطقة المندوب أو بعد أن يصبح غير `pending`.

بعد القبول، يرسل المندوب موقعه كل دقيقتين إلى `couriers/{uid}` وإلى `tracking/{orderId}` لكل طلب نشط. شاشة الزبون تستمع إلى المسار الثاني وتعرض الموقع على الخريطة. عند تسجيل الدخول يطلب كل تطبيق صلاحية الإشعارات ويحفظ FCM token في `users/{uid}.fcm_token`. عند إنشاء الطلب يقرأ التطبيق `zones/{zone_id}.delivery_fee_base` ويحفظ `delivery_fee` و`total`.

تم التحقق من عدم وجود أخطاء ترجمة Dart عبر `dart analyze` (المخرجات المتبقية ملاحظات lint فقط)، ونجح `npm run lint` و`npm run build` للوحة الأدمن و`node --check functions/index.js`. لم يمكن تشغيل مسار Firebase/FCM الحقيقي أو اختبار حركة GPS بين جهازين داخل البيئة الحالية لعدم وجود مشروع Firebase متصل وأجهزة Android/Android SDK؛ بعد تنفيذ `flutterfire configure` وتثبيت Android SDK يمكن اختبار السيناريو end-to-end على جهازين.

لا تضع مفاتيح Firebase أو ملفات الأسرار في Git.

### إدارة المناطق من لوحة الأدمن

لوحة الأدمن تستمع إلى `zones` لحظياً، وتوفر إضافة وتعديل الاسم ورسوم التوصيل والحالة. عند أول تشغيل متصل بـ Firebase وإذا كانت المجموعة فارغة، ينشئ التطبيق `zones/zone-1` باسم «المنطقة الأولى». رسم الحدود يكتب `zones_geo/{zoneId}` بنفس معرّف المنطقة، وحقل منطقة المزود أصبح قائمة اختيار من المناطق الفعلية.

## الجولة العاشرة — ميزات ما قبل الإطلاق

أضيفت آلية إلغاء موحدة: يستطيع العميل الإلغاء أثناء `pending` فقط، ويستطيع التاجر الإلغاء أثناء `pending` أو `preparing` مع سبب، بينما يحتفظ الأدمن بصلاحية التدخل. عند الإلغاء تُصفّر العمولة وتوسم بـ `commission_voided`; وإذا كان المندوب قد استلم الطلب أو كان في الطريق، يوضع `courier_compensation_due` للمراجعة اليدوية.

تبدأ محفظة المندوب بدين `0` وحد ائتماني افتراضي `100`. عند تسليم طلب COD يزداد الدين بقيمة `subtotal`، بينما تضاف `delivery_fee` إلى أرباح المندوب. تمنع القواعد قبول طلب جديد عندما يبلغ الدين الحد الائتماني. لوحة الأدمن تعرض الدين وتسمح بتسجيل تسوية نقدية مع سجل داخل `settlements`.

أضيفت عناوين محفوظة تحت `users/{uid}/addresses`; يختار العميل عنوانًا قبل الطلب، ويحفظ الطلب نسخة snapshot كاملة من العنوان. كما أضيف `is_accepting_orders` و`surge_multiplier` للمناطق، مع منع الإنشاء من القواعد عندما تكون المنطقة مجمدة، واحتساب رسوم التوصيل الأساسية مضروبة بالمضاعف. أضيف زر اتصال مباشر باستخدام `url_launcher` في شاشة العميل والمندوب؛ يعتمد على رقم الهاتف الموجود في ملف الطرف الآخر.

### اختبار الجولة العاشرة

يجب اختبار إلغاء التاجر لطلب `preparing` والتحقق من `cancelled_by: vendor` و`commission_voided: true`. ثم يُسلّم مندوب طلب COD، وتُراجع زيادة `debt` ومنع قبول طلب جديد عند تجاوز `credit_limit`، ثم تُسجّل تسوية من لوحة الأدمن وتُراجع عودة إمكانية القبول. يُنشأ عنوانان للعميل ويُختار أحدهما، ثم يُجمّد الأدمن المنطقة للتحقق من رفض الطلب من التطبيق ومن قواعد Firestore معًا. وأخيرًا تُضغط أزرار الاتصال على جهاز Android فعلي للتحقق من فتح تطبيق الهاتف.

لم يُنفّذ ربط المحافظ الإلكترونية المحلية أو SMS؛ لا توجد بيانات اعتماد/API رسمية في المشروع، لذلك بقي الدفع الإلكتروني ممثلًا كحقول وحالات آمنة إلى حين توفير مزود رسمي. كما لم يُنفّذ اختبار Firebase حي أو بناء APK لعدم توفر مشروع Firebase وFlutter/Android SDK في بيئة التنفيذ.

## الجولة الحادية عشرة — كوبونات وإحالة وأوقات العمل

أضيفت مجموعة `coupons` مع استرداداتها، والتحقق الخادمي من الصلاحية والحدود قبل تثبيت الخصم. تُحسب العمولة ودين المندوب من `subtotal` الأصلي، بينما يتحمل الخصم صافي إيراد المنصة. أضيفت أكواد إحالة للزبائن الجدد، ومكافأة كوبون توصيل مجاني لصاحب الإحالة بعد أول طلب مكتمل.

أضيف إدخال كوبون في تطبيق العميل، وقسم عرض وإضافة كوبونات في لوحة الأدمن. كما أضيف `opening_hours: { open: "09:00", close: "23:00" }` للمزودين الجدد؛ يعرض العميل المزود المغلق مع شارة ولا يسمح بفتحه، ويعرض تطبيق التاجر حالة الإغلاق التلقائي منفصلة عن مفتاح الانشغال اليدوي.

اختبار الجولة: أنشئ كوبونًا صالحًا وطبقه، ثم تحقق من انخفاض `total` وبقاء `commission` و`debt` محسوبين على `subtotal`. جرّب كوبونًا منتهيًا أو مستنفدًا وتحقق من تصفير الخصم خادميًا. أنشئ عميلًا جديدًا بكود إحالة، نفّذ أول تسليم، وتحقق من إنشاء كوبون `free_delivery` مقيد بصاحب الإحالة. أنشئ مزودًا خارج أوقات الدوام وتحقق من ظهوره مغلقًا في العميل والتاجر.

قرار بديل: توليد `referral_code` يتم خادميًا عند إنشاء مستند المستخدم، لكن ربط حساب خارجي أو SMS غير مضاف؛ كما أن نموذج الأدمن المختصر يضيف كوبونًا افتراضيًا من نوع percentage ويمكن تعديل الحقول المتقدمة مباشرة من Firestore Console حتى توسعة النموذج المرئي.

## الجولة الثانية عشرة — التجربة المحلية الكاملة بدون Firebase حقيقي

هذا الإعداد يشغل Authentication وFirestore وCloud Functions وEmulator UI محليًا على المنافذ الثابتة `9099` و`8080` و`5001` و`4000`. لا يحتاج إلى مشروع Firebase على الإنترنت ولا يرسل بيانات إلى خدمة خارجية. يجب تثبيت Node.js وFirebase CLI مرة واحدة فقط:

```bash
npm install -g firebase-tools
firebase login
```

بعد فك ضغط المشروع، نفّذ الأمر التالي من المجلد الجذري:

```bash
cd syria-delivery
./dev.sh
```

أو:

```bash
npm run local
```

يشغّل الأمر المحاكيات، ينتظر جاهزيتها، ثم ينفذ `scripts/seed-emulator.js` تلقائيًا. يرفض السكربت العمل إذا لم تكن متغيرات Emulator مفعلة، لحماية المستخدم من الكتابة في مشروع Firebase حقيقي.

### بيانات الدخول التجريبية

| الدور | البريد | كلمة المرور |
|---|---|---|
| الأدمن | `admin@test.local` | `test123456` |
| التاجر | `vendor@test.local` | `test123456` |
| المندوب | `courier@test.local` | `test123456` |
| العميل | `customer@test.local` | `test123456` |

تفتح واجهة مراقبة البيانات على [http://127.0.0.1:4000](http://127.0.0.1:4000). بعد ظهور رسالة `Emulator جاهز`، شغّل كل تطبيق في نافذة طرفية منفصلة:

```bash
cd admin-dashboard
npm install
npm run dev
```

```bash
cd customer_app
flutter pub get
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

```bash
cd courier_app
flutter pub get
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

```bash
cd merchant_app
flutter pub get
flutter run --dart-define=USE_FIREBASE_EMULATORS=true
```

لوحة الأدمن تتصل بالمحاكيات تلقائيًا عند تشغيل `npm run dev` لأن Vite في وضع التطوير يفعّل `connectAuthEmulator` و`connectFirestoreEmulator` و`connectFunctionsEmulator`.

في Flutter، مفتاح التبديل هو `--dart-define=USE_FIREBASE_EMULATORS=true`. عند تفعيله يستخدم التطبيق `127.0.0.1` على desktop/iOS، ويستخدم `10.0.2.2` تلقائيًا على Android Emulator لأن هذا العنوان يشير إلى جهاز المضيف من داخل محاكي Android. على هاتف Android حقيقي يجب استبدال العنوان في `emulatorHost()` بعنوان IP المحلي لجهاز التطوير، ثم تشغيل المحاكيات على `0.0.0.0` أو ضبط الشبكة المناسبة.

عند النشر الحقيقي لا تمرر `USE_FIREBASE_EMULATORS=true`، وأزل/عطّل إعدادات Emulator من Vite، ثم استخدم إعدادات Firebase الحقيقية التي ينتجها `flutterfire configure` وملفات البيئة الخاصة بلوحة الأدمن.

### مسار الاختبار المحلي

بعد تشغيل التطبيقات: ادخل لوحة الأدمن، ثم افتح العميل وأنشئ حسابًا جديدًا أو استخدم الحساب الجاهز، اختر عنوانًا ومطعم التجربة والمنتج، طبّق `FIRST50` اختياريًا وأنشئ الطلب. افتح التاجر لقبول الطلب وتحويله إلى `preparing`، ثم افتح المندوب لقبول الطلب، وبعدها حدّث الحالات حتى `delivered`. راقب المستندات والوظائف والإشعارات من Emulator UI. تبقى نافذة `./dev.sh` مفتوحة طوال الاختبار؛ الضغط على `Ctrl+C` يوقف المحاكيات.

هذا الإعداد للتجربة المحلية فقط. لا تستخدم بيانات الدخول التجريبية أو `demo-syria-delivery` في الإنتاج.

## الجولة الرابعة عشرة — Windows والهاتف الحقيقي عبر USB وChrome

على Windows شغّل `check-requirements.bat` أولًا لفحص Node.js وFirebase CLI وFlutter وADB. بعدها شغّل `start.bat` بالنقر المزدوج أو من PowerShell:

```powershell
cd C:\syria-delivery
.\start.bat
```

يفتح `start.bat` نافذة Firebase Emulator، ينتظر تشغيلها، ثم ينفذ seed تلقائيًا. افتح لوحة الأدمن في Chrome من نافذة ثانية:

```powershell
cd C:\syria-delivery\admin-dashboard
npm install
npm run dev
```

ثم افتح الرابط الظاهر، غالبًا `http://localhost:5173`. واجهة Emulator UI هي `http://127.0.0.1:4000`.

لتوصيل هاتف Android حقيقي عبر USB: فعّل Developer Options وUSB debugging، وصِل الهاتف، وافق على رسالة RSA، ثم نفّذ:

```powershell
node scripts\adb-reverse-setup.js
```

يفتح السكربت تحويلًا عكسيًا للمنافذ `8080` و`9099` و`5001`، وبذلك يستخدم الهاتف `127.0.0.1` للوصول إلى محاكيات Windows. شغّل التطبيقات على الهاتف مثلًا:

```powershell
cd C:\syria-delivery\customer_app
flutter pub get
flutter run -d <DEVICE_ID> --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=EMULATOR_HOST=127.0.0.1
```

كرر الأمر من `courier_app` و`merchant_app`. احصل على `DEVICE_ID` عبر `flutter devices` أو `adb devices`. لا تستخدم `10.0.2.2` مع الهاتف الحقيقي؛ هذا العنوان مخصص لـ Android Emulator الافتراضي فقط. يبقى عنوان Chrome على Windows `localhost`.

لإيقاف المحاكيات استخدم:

```powershell
.\stop.bat
```

أو أغلق نافذة Firebase Emulator. ملفات Windows الجديدة هي `start.bat` و`stop.bat` و`check-requirements.bat` و`scripts\adb-reverse-setup.js`.

## تشغيل Flutter Web على Chrome

تحتوي التطبيقات الثلاثة الآن على مجلد `web/` الأساسي، ويمكن تشغيلها مباشرة:

```powershell
cd courier_app
flutter pub get
flutter run -d chrome --dart-define=USE_FIREBASE_EMULATORS=true
```

ينطبق الأمر نفسه على `customer_app` و`merchant_app`. في وضع Web يستخدم التطبيق `127.0.0.1` تلقائيًا للمحاكيات. كما تم تعطيل تسجيل FCM في Web عند الاختبار المحلي لأن `firebase_messaging` يحتاج VAPID key؛ هذا يمنع تجمد شاشة تسجيل الدخول، ولا يؤثر على Android/iOS.

## مرحلة تحويل المشروع إلى منتج قابل للتسليم

### الجولة السابعة عشرة — تشغيل Windows موثوق

أصبح `start.bat` ينتظر اتصال TCP فعليًا بالمنفذ `8080` بدل الانتظار الثابت، مع حد أقصى قدره 90 ثانية ورسالة خطأ واضحة عند الفشل. بعد جاهزية Firestore ونجاح seed، يطلق تلقائيًا لوحة الأدمن وتطبيق العميل والمندوب على Chrome، ثم يحاول إعداد `adb reverse` ويطلق تطبيق التاجر على جهاز Flutter المتاح مع تمرير `EMULATOR_HOST=127.0.0.1` صراحة. لا يمكن تنفيذ ملف `.bat` فعليًا داخل بيئة Linux الحالية؛ تمت مراجعة منطق batch وأوامر PowerShell وNode يدويًا والتحقق من ملفات Node/JSON وبناء لوحة الإدارة.

أضيفت طبقة إعدادات المنتج في لوحة الأدمن تحت قسم **إعدادات النظام**. يستطيع صاحب النظام تعديل اسم المنتج، العملة، هاتف الدعم، ورسم التوصيل الافتراضي وحفظها في `system_config/main` دون تعديل الكود. يوجد قالب إعدادات إضافي في `config/system-config.example.json` لاستخدامه عند تجهيز عميل جديد.

على Windows أصبح `start.bat` يفحص المتطلبات، يشغّل Emulator والتهيئة التجريبية، يثبت اعتماديات لوحة الإدارة عند الحاجة، يشغّل لوحة الأدمن تلقائيًا ويفتح Chrome. يستخدم `stop.bat` لإيقاف الخدمات. هذه نسخة Demo محلية؛ الإنتاج الحقيقي يجب أن يستخدم Firebase Project مستقلًا، حسابات إنتاج، نطاقًا، FCM حقيقيًا ونسخًا احتياطية.

### نموذج التسليم للعملاء

للعميل غير التقني، لا يُسلّم الكود كطريقة التشغيل اليومية. يُسلّم رابط لوحة الإدارة وتطبيقات Android جاهزة أو حزمة Installer. يتم إعداد Firebase مرة واحدة، ثم تُدار المناطق والمتاجر والمنتجات والكوبونات والعمولات وأوقات العمل من لوحة الإدارة. تعديل المنطق البرمجي أو إضافة مزود SMS/دفع جديد يبقى ضمن تحديثات المنتج، أما الإعدادات التشغيلية فلا تتطلب الرجوع إلى الكود.

### الخطوات التالية قبل البيع التجاري

ينبغي تجهيز بيئة Staging وProduction منفصلتين، إنشاء Installer موثّق وموقّع، بناء APK لكل تطبيق مربوط بمشروع العميل، إعداد نسخ Firestore الاحتياطية، اختبار FCM على أجهزة حقيقية، وإضافة سجل عمليات الأدمن ومراقبة Cloud Functions. لا تستخدم حسابات Emulator أو بيانات `test.local` في الإنتاج.

## الجولة التاسعة عشرة — إعادة بناء الواجهات وبنية الكود

أعيد بناء لوحة الأدمن بواجهة تشغيل احترافية: Sidebar ثابتة، شريط علوي، صفحات مستقلة للمزودين والمناطق والطلبات والمندوبين والكوبونات والإعدادات، جداول قابلة للقراءة، Modals للنماذج، Validation قبل الحفظ، حالات تحميل أثناء الكتابة، وToast واضحة عند النجاح أو الفشل. التصميم مبني على primitives داخل `admin-dashboard/src/components/ui.jsx` بأسلوب shadcn-inspired، مع الحفاظ على React وFirebase الحاليين دون تغيير نموذج Firestore أو Cloud Functions أو قواعد Firestore.

بنية لوحة الأدمن الجديدة:

```text
admin-dashboard/src/
├── App.jsx
├── App.css
└── components/
    ├── ui.jsx
    ├── VendorsPage.jsx
    ├── ZonesPage.jsx
    └── OperationsPages.jsx
```

تمت إعادة تنظيم نقطة دخول تطبيقات Flutter بحيث أصبحت `lib/main.dart` صغيرة وتستدعي bootstrap الخاص بالتطبيق، بينما يوجد الكود الحالي في `lib/app.dart` مع مجلد `lib/screens/` يحتوي نقاط استيراد منظمة للشاشات (login، orders، wallet، store، address book). كما تم توحيد `ThemeData` و`ColorScheme` على Material 3 بلون أزرق موحّد. لم يتغير أي collection أو field أو Cloud Function.

فحوصات هذه الجولة: نجح `npm run lint` و`npm run build` للوحة الأدمن، ونجح فحص JavaScript وJSON. Flutter غير مثبت في بيئة التنفيذ الحالية؛ لذلك لا يمكن ادعاء نجاح `flutter analyze` أو `flutter build web` هنا. يجب تشغيلهما على جهاز Windows/Flutter قبل الإنتاج:

```powershell
foreach ($app in @('customer_app','courier_app','merchant_app')) { cd $app; flutter pub get; flutter analyze; cd .. }
cd customer_app; flutter build web
```

## الجولة العشرون — إعادة ربط الخرائط وإعادة هيكلة Flutter فعليًا

أعيد ربط `MapManager.jsx` داخل صفحتي المزودين والمناطق. صفحة المناطق تحفظ الحدود المرسومة فعليًا في `zones_geo/{zoneId}` مع حقل `polygon`، وصفحة المزودين تحفظ موقع المزود في `vendors/{vendorId}.location` بصيغة `GeoPoint`. كما أصبحت الخريطة تعرض المزودين والمناطق وتسمح باختيار المنطقة أو المزود قبل النقر على الخريطة.

أعيد فصل تطبيقات Flutter فعليًا بدل ملفات export الشكلية. أصبحت نقطة الدخول صغيرة في `lib/main.dart`، والتهيئة والمكونات العامة في `lib/common.dart`، بينما نُقلت الشاشات الفعلية إلى ملفات مستقلة تحتوي الكود الحقيقي:

```text
customer_app/lib/screens/
├── login_screen.dart
├── home_screen.dart
├── products_screen.dart
├── orders_screen.dart
├── order_screen.dart
└── address_book_screen.dart

courier_app/lib/screens/
├── login_screen.dart
├── orders_screen.dart
└── wallet_screen.dart

merchant_app/lib/screens/
├── login_screen.dart
└── store_screen.dart
```

كل ملفات `screens/*.dart` تحتوي الآن كودًا فعليًا متعدد الأسطر، ولا توجد exports شكلية إلى `app.dart`. تم أيضًا توحيد Material 3 واللون الأساسي الأزرق. لم يتم تعديل `firestore.rules` أو `functions/index.js` أو نموذج البيانات.

تم تشغيل `npm run lint` و`npm run build` للوحة الأدمن ونجحا، كما نجح فحص توازن الأقواس على جميع ملفات Dart المفصولة. لا يزال Flutter SDK غير مثبت في بيئة البناء الحالية، لذلك يلزم تشغيل `flutter pub get` و`flutter analyze` و`flutter build web` على Windows قبل اعتماد تطبيقات Flutter للإنتاج.

## تشغيل OpenManus وبناء المشروع على Windows 11

أضيفت مجلد `windows/` مع أدوات تجهيز Windows وWSL2 وتشغيل OpenManus وبناء لوحة الأدمن وتطبيقات Flutter. راجع الدليل الكامل في [OPENMANUS-WINDOWS.md](OPENMANUS-WINDOWS.md).

الأوامر الأساسية من PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\windows\check-environment.ps1
.\windows\install-openmanus.ps1
.\windows\build-all.ps1
.\windows\run-openmanus.bat
```

لا تحتوي الحزمة على أي مفاتيح API. يجب إدخال مفتاح نموذج الذكاء الاصطناعي يدويًا في `openmanus/config/config.toml` بعد تشغيل مثبت OpenManus. لا ترسل مفاتيح Firebase أو مفاتيح الإنتاج إلى OpenManus أو إلى مستودع Git.
