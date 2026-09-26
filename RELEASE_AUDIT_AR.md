# تقرير مراجعة mimoApp — Customer / Merchant / Courier

**المستودع:** `Sham4753/syria-delivery-platform`

**Commit المفحوص:** `e3b99e9 Prepare Syria Delivery Firebase platform handoff`

**تاريخ الفحص:** 2026-09-26

## 1. الخلاصة التنفيذية

لا أوصي برفع APK إلى Google Play أو توزيعه كإصدار إنتاجي قبل إغلاق العناصر الحرجة التالية:

1. **جميع تطبيقات Android الثلاثة موقعة بمفتاح debug** في `android/app/build.gradle.kts`، وهذا غير مقبول للإنتاج.
2. **لا يوجد `.github/workflows/build.yml` في commit الحالي** رغم أن وصف المشروع يفترض وجوده؛ لذلك لا يوجد مسار بناء يمكن التحقق منه في هذه النسخة.
3. **Customer يستخدم Application ID placeholder**: `com.mycompany.mimoapp`، ويجب تثبيته كمعرّف إنتاجي متسق مع Firebase.
4. **Merchant Android label مضبوط خطأً إلى `customer_app`**.
5. **Courier لا يعرض الطلبات التي أصبحت `ready_for_pickup` بعد إسنادها** لأن الاستعلام يستبعد هذه الحالة، وبالتالي قد يختفي الطلب من واجهة المندوب قبل الاستلام.
6. **لا يمكن إجراء `flutter analyze` أو `flutter build` في بيئة الفحص الحالية** لأن `flutter` و`dart` غير مثبتين. تم إجراء فحص ساكن، JSON، بنية الملفات، وقراءة إعدادات Gradle/Firebase فقط.
7. **لا توجد اختبارات Dart/Flutter أو integration tests داخل التطبيقات الثلاثة**.

## 2. مصفوفة الأولوية

| الأولوية | العنصر | التطبيقات/الملفات | الإجراء |
|---|---|---|---|
| Critical | Release signing يستخدم debug key | التطبيقات الثلاثة، `android/app/build.gradle.kts:33-38` | إضافة keystore خارج Git وربطه بـ GitHub Secrets |
| Critical | لا يوجد CI workflow في commit | `.github/workflows/build.yml` مفقود | إضافة workflow موحد أو استعادة الملف الصحيح |
| High | Application ID غير إنتاجي للعميل | `customer_app/android/app/build.gradle.kts:9,20` | اعتماد ID نهائي وتسجيله في Firebase Play Console |
| High | الطلب `ready_for_pickup` يختفي من شاشة Courier | `courier_app/lib/screens/orders_screen.dart:143-150` | إضافة `ready_for_pickup` إلى whereIn |
| High | Merchant يظهر باسم customer_app | `merchant_app/android/app/src/main/AndroidManifest.xml:6` | استبدال label بـ `mimoApp Merchant` |
| High | عدم وجود اختبار Flutter قابل للتشغيل في CI | التطبيقات الثلاثة | إضافة analyze/test/build إلى workflow |
| Medium | OTP محفوظ نصيًا بجانب hash | `functions/index.js:420,574` | إن كان التصميم يتطلب عرضه للعميل، أبقه في projection مقيد؛ وإلا احذف الحقل `otp` واستخدم آلية عرض آمنة |
| Medium | أخطاء الشبكة تُبتلع في Courier | `courier_app/lib/screens/orders_screen.dart:137,384` | تسجيل خطأ للمستخدم وإعادة المحاولة، لا `catch (_) {}` صامت |
| Medium | إضافة المنتج تعيد quantity إلى 1 | `customer_app/lib/screens/products_screen.dart:49-51` | زيادة كمية المفتاح الحالي بدل overwrite |
| Medium | الموقع يُرفع كل دقيقتين حتى دون طلب نشط | `courier_app/lib/screens/orders_screen.dart:91-99` | اربط التتبع بحالة availability/active delivery واستخدم lifecycle/background policy |
| Low | قواعد التحليل عطلت lints مفيدة | `analysis_options.yaml` للتطبيقات الثلاثة | إعادة تفعيل curly braces وuse_build_context_synchronously تدريجيًا |
| Low | لا توجد حدود/تحقق UI كافية للسعر والوقت والصورة | Merchant store screen | إضافة validators، مع إبقاء التحقق النهائي على الخادم |

## 3. Customer App

### Findings

- `customer_app/android/app/build.gradle.kts:9,20`: `namespace` و`applicationId` هما `com.mycompany.mimoapp`. هذا اسم placeholder ويجب عدم اعتماده كهوية إنتاجية إلا إذا تم تسجيله رسميًا وثبّتتموه كقرار نهائي.
- `customer_app/android/app/build.gradle.kts:33-38`: release يستخدم `signingConfigs.getByName("debug")`.
- `customer_app/lib/screens/products_screen.dart:49-51`: عند الضغط على إضافة منتج موجود بنفس modifier key، يتم تعيين `quantity: 1` من جديد بدل الزيادة. هذا يجعل الضغط المتكرر على زر `+` لا يزيد الكمية كما يتوقع المستخدم.
- `customer_app/lib/screens/orders_screen.dart:127-143`: يتم عمل `FutureBuilder` لجلب `order_secrets` داخل كل rebuild للطلب؛ يمكن أن يعيد قراءات Firestore كثيرة. خزّن Future أو اعرضه فقط عند الحاجة.
- `customer_app/lib/screens/orders_screen.dart:218-223`: محادثة الطلب تستمع لكل الرسائل دون `limit` أو pagination. محادثة كبيرة ستزيد القراءة والذاكرة.
- `customer_app/lib/common.dart:160-172`: تحديث `fcm_token` صحيح من ناحية التفويض، لكن لا يوجد listener لتغير token بعد تسجيل الدخول/إعادة تثبيت التطبيق.
- `customer_app/lib/common.dart:80-97`: ساعات العمل التي تعبر منتصف الليل مثل `22:00–02:00` تُعامل خطأً على أنها مغلقة بعد منتصف الليل.
- `customer_app/lib/screens/products_screen.dart:64-70`: عرض الخصم محلي فقط؛ جيد أن الخادم يعيد حسابه، لكن يجب إظهار السعر النهائي القادم من الاستجابة/الطلب لتجنب اختلاف واجهة المستخدم عن الخادم.

### إصلاح quantity المقترح

استبدل السطر الحالي في `addProduct`:

```dart
setState(() => cart[key] = {
  ...data,
  'product_id': id,
  'quantity': 1,
  'selected_modifiers': selected,
  'price': (data['price'] ?? 0) + extra,
});
```

بالتالي:

```dart
setState(() {
  final existing = cart[key];
  cart[key] = {
    ...data,
    'product_id': id,
    'quantity': (existing?['quantity'] as int? ?? 0) + 1,
    'selected_modifiers': selected,
    'price': (data['price'] as num? ?? 0) + extra,
  };
});
```

### إصلاح ساعات منتصف الليل

طبّق نفس الدالة في `customer_app/lib/common.dart` و`merchant_app/lib/common.dart`:

```dart
bool isNowInsideHours(String openText, String closeText) {
  int minutes(String value) {
    final parts = value.split(':');
    if (parts.length != 2) throw const FormatException('Invalid HH:mm');
    final hour = int.parse(parts[0]);
    final minute = int.parse(parts[1]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw const FormatException('Invalid HH:mm');
    }
    return hour * 60 + minute;
  }

  final now = TimeOfDay.now();
  final current = now.hour * 60 + now.minute;
  final open = minutes(openText);
  final close = minutes(closeText);
  return open <= close
      ? current >= open && current <= close
      : current >= open || current <= close;
}
```

## 4. Merchant App

### Findings

- `merchant_app/android/app/src/main/AndroidManifest.xml:6`: `android:label="customer_app"` خطأ واضح، ويجب تغييره إلى اسم التاجر.
- `merchant_app/android/app/build.gradle.kts:33-38`: release signing debug.
- `merchant_app/lib/screens/store_screen.dart:24-28`: استعلام الطلبات يستخدم `orderBy('created_at')` مع filter على `vendor_id`. يجب التأكد من وجود composite index في بيئة Firebase الفعلية؛ وإلا سيظهر خطأ index عند أول تشغيل.
- `merchant_app/lib/screens/store_screen.dart:126-165`: ساعات العمل تُحفظ كنص دون validation. يجب منع قيم مثل `99:99` وفرض `HH:mm`.
- `merchant_app/lib/screens/store_screen.dart:363-461`: مدخلات السعر والمعدلات والصورة لا تتحقق من طول/نوع/حدود قبل الكتابة. تحقق الخادم هو الحاجز الأمني، لكن واجهة المستخدم تحتاج منع البيانات الرديئة.
- `merchant_app/lib/screens/store_screen.dart:84-96`: صوت تنبيه كل أربع ثوانٍ داخل الواجهة قد يكون مزعجًا ويستهلك طاقة. الأفضل FCM foreground/local notification مع زر mute.
- `merchant_app/lib/screens/store_screen.dart:471-501`: التقارير تجمع كل الطلبات المسترجعة من stream في الذاكرة. يجب تقليص الفترة الزمنية وإضافة aggregation/server summaries للمتاجر الكبيرة.

### تعديل label

في `merchant_app/android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:label="mimoApp Merchant"
    android:name="${applicationName}"
    android:icon="@mipmap/ic_launcher">
```

## 5. Courier App

### Bug حرج في عرض الطلبات

في `courier_app/lib/screens/orders_screen.dart:143-150` الاستعلام الحالي هو:

```dart
.where('status', whereIn: ['accepted', 'preparing', 'picked_up', 'on_the_way'])
```

لكن الخادم في `functions/index.js:337-341` يعيّن `courier_id` و`dispatch_status: accepted` ولا يغيّر `status` من `pending`. وبعد أن يحوّل التاجر الطلب إلى `ready_for_pickup`، حالة الطلب لا تدخل في استعلام Courier الحالي. النتيجة: طلب مسند قد يختفي من قائمة المندوب قبل الاستلام.

استبدله بـ:

```dart
.where(
  'status',
  whereIn: [
    'pending',
    'preparing',
    'ready_for_pickup',
    'picked_up',
    'on_the_way',
  ],
)
```

ويجب أن تبقى أزرار الواجهة متوافقة مع انتقالات الخادم، لا أن تعتمد على `accepted` إذا كانت هذه قيمة `dispatch_status` وليست `status`.

### Findings إضافية

- `courier_app/lib/screens/orders_screen.dart:91-99`: لا يتم التحقق من `LocationPermission.denied` بعد طلب الإذن؛ يجب الإيقاف إذا بقي denied.
- `courier_app/lib/screens/orders_screen.dart:101-137`: `setState` بعد `await Geolocator.getCurrentPosition` دون فحص `mounted`. قد ينتج `setState() called after dispose` عند مغادرة الشاشة.
- `courier_app/lib/screens/orders_screen.dart:137`: `catch (_) {}` يخفي أخطاء GPS وFirestore تمامًا. هذا يصعّب التشخيص ويجعل المندوب يعتقد أن الموقع يعمل بينما لا يتم تحديثه.
- `courier_app/lib/screens/orders_screen.dart:116-134`: كل tick يجلب كل الطلبات النشطة ثم يكتب tracking لكل طلب بالتتابع. استخدم batch/write throttling، ولا ترفع الموقع إذا لم يكن هناك delivery فعلي.
- `courier_app/lib/common.dart:79-90`: `ensureWallet` يكتب محفظة من التطبيق مباشرة. قواعد Firestore الحالية تمنع هذا للمندوب، لذلك قد يفشل بصمت/واجهة غير واضحة. إنشاء المحفظة يجب أن يكون server-only أو callable.
- `courier_app/lib/screens/orders_screen.dart:380-384`: خطأ `completeDelivery` يُبتلع دون إظهار رسالة؛ سيظن المستخدم أن العملية نجحت.
- `courier_app/lib/screens/orders_screen.dart:402`: `substring(0, 6)` يفترض أن id طوله 6 على الأقل. Firestore auto IDs طويلة، لكن اختبارات emulator قد تستخدم id قصيرًا؛ استخدم `id.substring(0, min(6, id.length))`.
- الموقع والتتبع يحتاجان مراجعة privacy وforeground-service/background permission إذا كان المطلوب تتبعًا أثناء إغلاق التطبيق. التحديث الدوري الحالي ليس background tracking حقيقيًا.

### إصلاح mounted وpermission المقترح

```dart
Future<void> startLocation() async {
  if (!await Geolocator.isLocationServiceEnabled()) return;
  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('يلزم السماح بالموقع لاستلام وتحديث الطلبات')),
      );
    }
    return;
  }
  await sendLocation();
  timer = Timer.periodic(const Duration(minutes: 2), (_) => sendLocation());
}

// بعد await getCurrentPosition:
if (!mounted) return;
setState(() => position = current);
```

## 6. Firebase وSecurity

### نقاط جيدة

- `firestore.rules` يمنع إنشاء الطلبات من العميل مباشرة (`allow create: if false`) ويجعل `createOrder` Callable مصدر الأسعار والإجماليات.
- `createOrder` يستخدم idempotency وtransaction ويعيد حساب أسعار المنتجات والخصومات على الخادم.
- `completeDelivery` يتحقق من courier والطلب وOTP ويحاول قفل المحاولات الفاشلة.
- مفاتيح Firebase الظاهرة في `google-services.json` ليست أسرار خادم بحد ذاتها؛ حماية Firebase تكون عبر Auth وRules وApp Check وقيود API، لا بإخفائها داخل APK.

### مخاطر وإجراءات لازمة

1. **OTP:** `functions/index.js:420` و`:574` يخزنان `otp` و`otp_hash`. إذا كان العميل يحتاج عرض OTP، فالوصول مقيد بقاعدة `order_secrets` لصاحب الطلب، لكنه يظل تسريبًا نصيًا في قاعدة البيانات/النسخ الاحتياطية. الأفضل تصميم projection منفصل للعميل أو تشفير الحقل بمفتاح خارج Firestore، مع إبقاء hash للتحقق. إذا لم تعد ميزة عرض OTP مطلوبة، احذف `otp` واترك `otp_hash` فقط، وعدّل شاشة العميل.
2. فعّل **Firebase App Check** للتطبيقات وCloud Functions بعد اختبار debug providers في staging.
3. راجع **Storage Rules**؛ لا يوجد `storage.rules` ظاهر في الجذر رغم وجود صور/روابط صور في المنتج. لا تعتمد على روابط عامة غير منضبطة.
4. فعّل App Check وrate limits على callable functions، وسجل audit للعمليات المالية والإدارية.
5. أنشئ مشروعَي Firebase منفصلين على الأقل: `staging` و`production`. لا تستخدم emulator/test values في build إنتاجي.
6. قواعد `firestore.rules` يجب اختبارها بواسطة Firebase Rules Unit Testing، خصوصًا الأدوار، إسناد الطلب، chat، tracking، wallets، order secrets.
7. افحص Firestore indexes بعد تشغيل الاستعلامات المركبة فعليًا؛ `firestore.indexes.json` لا يضمن وحده تغطية كل الاستعلامات الحالية.

## 7. Dependencies وToolchain

- التطبيقات تستخدم SDK constraint `^3.13.3` وFirebase packages حديثة نسبيًا، لكن لا يمكن إثبات compatibility مع Flutter Stable الحالي دون `flutter pub get`, `flutter pub outdated`, و`flutter analyze`.
- `customer_app` يضيف `firebase_auth_platform_interface` مباشرة؛ لا يُنصح عادةً بتثبيت platform interface إلا إذا كان API المستخدم يتطلبه فعلًا. راجع ذلك بعد تشغيل analyze.
- لا توجد اختبارات أو coverage، لذلك لا يمكن اعتبار lockfiles وحدها دليلاً على سلامة dependencies.
- `functions/package.json` يعلن Node 22 بينما بعض وثائق المشروع القديمة تشير إلى Node 20؛ وحّد المصدر مع runtime المفعّل في Firebase قبل النشر.
- Gradle يعلن Android Gradle Plugin `9.1.0` وKotlin `2.4.0`. يجب تثبيت هذه الإصدارات في CI ومطابقة Flutter Stable/Java 17، وعدم الاعتماد على بيئة غير محددة.

## 8. Android Release Pipeline المقترح

### إنشاء keystore محليًا مرة واحدة

نفّذ على جهاز آمن، ولا ترفع الملف أو كلمة المرور إلى Git:

```bash
keytool -genkeypair -v \
  -keystore mimoapp-release.jks \
  -alias mimoapp \
  -keyalg RSA -keysize 4096 -validity 10000
```

ضع القيم التالية في GitHub Secrets لكل مستودع/بيئة:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEY_ALIAS=mimoapp`

### استبدال release signing في كل `android/app/build.gradle.kts`

أضف قبل `android {}`:

```kotlin
import java.util.Properties
import java.io.FileInputStream

val releaseProperties = Properties()
val releasePropertiesFile = rootProject.file("key.properties")
if (releasePropertiesFile.exists()) {
    releaseProperties.load(FileInputStream(releasePropertiesFile))
}
```

واستبدل `buildTypes` الحالي بـ:

```kotlin
signingConfigs {
    create("release") {
        val storeFilePath = releaseProperties.getProperty("storeFile")
        if (!storeFilePath.isNullOrBlank()) {
            storeFile = file(storeFilePath)
            storePassword = releaseProperties.getProperty("storePassword")
            keyAlias = releaseProperties.getProperty("keyAlias")
            keyPassword = releaseProperties.getProperty("keyPassword")
        }
    }
}

buildTypes {
    release {
        signingConfig = signingConfigs.getByName("release")
        isMinifyEnabled = true
        isShrinkResources = true
        proguardFiles(
            getDefaultProguardFile("proguard-android-optimize.txt"),
            "proguard-rules.pro",
        )
    }
}
```

أضف إلى `.gitignore` في كل تطبيق:

```gitignore
android/key.properties
android/app/*.jks
android/app/*.keystore
```

> في CI يجب إنشاء `android/key.properties` من secrets قبل `flutter build appbundle`; لا تضع secrets داخل `google-services.json` أو المستودع.

## 9. Workflow بديل لأن الملف مفقود

أنشئ `.github/workflows/build.yml` بهذا المحتوى، ثم عدّل version/IDs حسب قراركم النهائي:

```yaml
name: Flutter Android Release

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'customer_app/**'
      - 'merchant_app/**'
      - 'courier_app/**'
      - '.github/workflows/build.yml'

env:
  FLUTTER_VERSION: 'stable'

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - name: customer
            dir: customer_app
          - name: merchant
            dir: merchant_app
          - name: courier
            dir: courier_app
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - name: Flutter dependencies
        working-directory: ${{ matrix.dir }}
        run: flutter pub get
      - name: Format check
        working-directory: ${{ matrix.dir }}
        run: dart format --output=none --set-exit-if-changed lib
      - name: Analyze
        working-directory: ${{ matrix.dir }}
        run: flutter analyze --fatal-infos --fatal-warnings
      - name: Tests
        working-directory: ${{ matrix.dir }}
        run: flutter test
      - name: Decode release keystore
        env:
          KEYSTORE_B64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          STORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
        run: |
          test -n "$KEYSTORE_B64"
          echo "$KEYSTORE_B64" | base64 --decode > "${{ matrix.dir }}/android/app/mimoapp-release.jks"
          cat > "${{ matrix.dir }}/android/key.properties" <<EOF
          storeFile=mimoapp-release.jks
          storePassword=$STORE_PASSWORD
          keyPassword=$KEY_PASSWORD
          keyAlias=$KEY_ALIAS
          EOF
      - name: Build signed AAB
        working-directory: ${{ matrix.dir }}
        run: flutter build appbundle --release --build-number=${{ github.run_number }}
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: mimoapp-${{ matrix.name }}-${{ github.run_number }}
          path: ${{ matrix.dir }}/build/app/outputs/bundle/release/*.aab
```

**ملاحظة:** إذا كان المطلوب APK فقط، غيّر `appbundle` إلى `apk` والمسار إلى `build/app/outputs/flutter-apk/*.apk`. للنشر على Play Store يفضّل AAB.

## 10. أوامر التحقق قبل git push

بعد توفير Flutter SDK وAndroid SDK وFirebase staging:

```bash
set -e
for app in customer_app merchant_app courier_app; do
  cd "$app"
  flutter clean
  flutter pub get
  dart format --output=none --set-exit-if-changed lib
  flutter analyze --fatal-infos --fatal-warnings
  flutter test
  cd ..
done

cd functions
npm ci
npm run lint
node --check index.js
cd ..

firebase emulators:start --only auth,firestore,functions --project demo-syria-delivery
```

اختبارات قبول يجب تنفيذها يدويًا/آليًا:

- إنشاء مستخدم customer لا يستطيع إنشاء `super_admin`.
- customer لا يقرأ users/couriers غير المسموحين.
- courier لا يستلم طلبًا خارج zone أو بعد إسناده لمندوب آخر.
- merchant لا يغير أسعار الطلبات السابقة.
- تغيير product price بعد إضافته إلى السلة لا يغير حساب الخادم بشكل غير صحيح.
- تكرار `createOrder` بنفس idempotency key لا ينشئ طلبًا ثانيًا.
- OTP خاطئ 5 مرات يؤدي إلى lock، وOTP صحيح يكمل الطلب مرة واحدة.
- طلب مسند ينتقل عبر `preparing -> ready_for_pickup -> picked_up -> on_the_way -> delivered` ويظل ظاهرًا في Courier.
- فقد الشبكة أثناء checkout يعيد الإرسال مرة واحدة فقط.
- logout ثم login بحساب آخر لا يعرض queued orders للحساب السابق.

## 11. أوامر Git المقترحة

بعد تطبيق الإصلاحات ومراجعتها:

```bash
git checkout -b release/mimoapp-production-readiness

git add RELEASE_AUDIT_AR.md .github/workflows/build.yml \
  customer_app/android/app/build.gradle.kts \
  merchant_app/android/app/build.gradle.kts \
  courier_app/android/app/build.gradle.kts \
  merchant_app/android/app/src/main/AndroidManifest.xml \
  customer_app/lib/screens/products_screen.dart \
  courier_app/lib/screens/orders_screen.dart

git diff --cached --check
git commit -m "chore: prepare Flutter apps for production release"
git push -u origin release/mimoapp-production-readiness
```

لا ترفع `mimoapp-release.jks` أو `key.properties` أو أي service-account JSON.

## 12. حكم الجاهزية

**الحالة الحالية: Not production-ready.**

السبب المباشر: debug signing، غياب CI في النسخة المفحوصة، placeholder ID للعميل، خطأ اسم Merchant، وbug في عرض Courier للطلبات الجاهزة للاستلام. بعد إصلاحها وتشغيل `flutter analyze/test/build` فعليًا على CI مع قواعد Firebase staging، يمكن الانتقال إلى اختبار إصدار داخلي ثم Play Console.
