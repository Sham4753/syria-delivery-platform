# حل خطأ Firebase Project ID على Windows

## التشغيل المحلي بالمحاكي

تم إعداد `.firebaserc` داخل هذه الحزمة بالمعرف التجريبي:

```text
demo-syria-delivery
```

هذا معرف محلي للمحاكي وليس مشروع Firebase إنتاجياً. من مجلد `syria-delivery` شغّل:

```bat
firebase emulators:start --project demo-syria-delivery
```

أو شغّل `dev.sh` من Git Bash/WSL.

## النشر على Firebase حقيقي

لا تستخدم `demo-syria-delivery` للنشر الحقيقي. أنشئ مشروعاً من Firebase Console ثم انسخ **Project ID**، وليس اسم المشروع الظاهر للمستخدم. يجب أن يكون المعرف بأحرف صغيرة، وأرقام، وشرطات فقط.

مثال صحيح:

```text
syria-delivery-prod-123
```

بعد الحصول على المعرف الحقيقي من داخل مجلد المشروع نفّذ:

```bat
firebase use --add
```

ثم اختر مشروعك، أو اكتب مباشرة:

```bat
firebase use YOUR_REAL_PROJECT_ID
```

إذا أردت التعديل يدوياً افتح `.firebaserc` واجعل محتواه مثل:

```json
{
  "projects": {
    "default": "syria-delivery-prod-123"
  }
}
```

استبدل `syria-delivery-prod-123` بالمعرف الحقيقي فقط. لا تضع اسم المشروع العربي أو الرابط أو البريد الإلكتروني مكان Project ID.

بعدها تحقق من الإعداد:

```bat
firebase use
firebase projects:list
```

ثم نفّذ النشر المطلوب فقط:

```bat
firebase deploy --only firestore:rules
firebase deploy --only functions
```

## تنبيه

ملفات إعداد Flutter ولوحة الإدارة تحتاج أيضاً إعدادات Firebase الحقيقية عند استخدام الإنتاج. شغّل `flutterfire configure` داخل كل تطبيق Flutter، وعبّئ `.env.local` للوحة الإدارة، ولا تضع مفاتيح الإنتاج داخل ZIP عام أو Git.
