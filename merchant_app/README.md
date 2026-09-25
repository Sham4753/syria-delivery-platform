# Merchant App — Syria Delivery

تطبيق التاجر/المتجر المبني بـ Flutter وFirebase. يوفر استقبال الطلبات وقبولها أو رفضها، تحديد زمن التحضير، وضع المشغول، إدارة توفر أصناف المنيو، وتقارير المبيعات والعمولات.

## الإعداد

```bash
flutter pub get
flutterfire configure
flutter run
```

فعّل Email/Password في Firebase Authentication. أنشئ مستخدمًا من Firebase Console ثم أنشئ `users/{uid}` من Firestore Console بالقيمتين:

```text
role: vendor_admin
vendor_id: <معرّف مستند المتجر في vendors>
```

لا يملك التطبيق صلاحية إنشاء دور `vendor_admin` تلقائيًا. يجب ربطه بمتجر محدد قبل الدخول.

## حالة الدفع

يعرض التطبيق طريقة الدفع الموجودة في الطلب، بينما ربط المحافظ الإلكترونية المحلية يحتاج بيانات اعتماد API رسمية من مزود الدفع وتحققًا خلفيًا للـ webhook. الدفع النقدي هو المسار الافتراضي الآمن في النسخة الحالية.
