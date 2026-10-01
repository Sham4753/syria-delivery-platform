# المرحلة الخامسة: الدفع والتسوية

## النطاق المنفذ

أضيفت طبقة دفع موحدة قابلة للتبديل بدل ربط منطق الطلب بمزود واحد. كل عملية دفع تحمل:

- `provider_id`
- `provider_reference`
- `provider_event_id` عند وصول حدث خارجي
- المبلغ والعملة للتحقق قبل أي قيد
- حالة دفع صريحة قابلة للانتقال مرة واحدة

إعداد المزود موجود في `payment_provider_config/main` ويُحفظ فيه معرف المزود والبيئة والعملة ومرجع Secret فقط. لا تُحفظ مفاتيح API أو أسرار Webhook في Firestore.

## Webhook

النقطة الخادمية هي `paymentWebhook` وتقبل `POST` فقط. قبل قراءة الحدث أو تعديل الرصيد:

1. تتحقق من HMAC-SHA256 عبر `PAYMENT_WEBHOOK_SECRET`.
2. تطبع/تتحقق من معرف الحدث ونوعه ومرجع المزود والمبلغ والعملة.
3. تطابق `provider_reference` مع `payment_intents`.
4. ترفض اختلاف المبلغ أو العملة.
5. تسجل `payment_webhook_events/{eventId}` داخل Transaction.
6. تمنع إعادة كتابة القيود عند إعادة إرسال نفس الحدث.

الأحداث المدعومة:

- `payment.authorized`
- `payment.paid`
- `payment.failed`
- `payment.refunded`

## حالات الدفع

```text
created → pending_provider → authorized → paid
                                  └──────→ failed
paid → refund_pending → refunded
```

يظل تدفق التحويل البنكي اليدوي متوافقًا مع حالات `awaiting_customer_action` و`pending_verification` و`rejected`.

## دفتر القيود

عند حدث `payment.paid` يكتب النظام زوجًا متوازنًا:

```text
Debit:  provider_clearing
Credit: customer_receivable
```

وعند حدث `payment.refunded` يكتب قيدًا عكسيًا:

```text
Debit:  customer_receivable
Credit: provider_clearing
```

الأرصدة لا تُعدّل مباشرة من Webhook أو العميل؛ كل تغيير مالي يمر عبر Transaction ومعرفات قيود حتمية.

## الردود المالية

أضيفت الدالة `requestPaymentRefund` للأدمن أو مدير التاجر. تنشئ `refund_requests/{paymentId}` وتنقل العملية إلى `refund_pending`. لا تُعتبر الأموال مردودة بمجرد إنشاء الطلب؛ يلزم حدث `payment.refunded` موقّع من المزود، ثم تُكتب القيود العكسية ويُحدّث الطلب إلى `payment_status: refunded`.

## لوحة الأدمن

أضيف قسم إعدادات المزود الرسمي لعرض وتعديل:

- معرف المزود.
- البيئة Sandbox أو Production.
- العملة.
- تفعيل استقبال Webhook.

لا يوجد حقل للأسرار، وتوضح الواجهة أن السر يجب أن يُضبط في بيئة الخادم باسم `PAYMENT_WEBHOOK_SECRET`.

## ما لم يُنفذ عمدًا

لم يتم اختيار مزود دفع مرخص أو اختراع API خارجي. لا يمكن إنشاء Checkout حقيقي قبل توفير وثائق المزود وبياناته واختباره في Sandbox. الطبقة الحالية جاهزة لتوصيل Adapter مزود محدد، والتحويل البنكي اليدوي يستخدم `manual_bank_transfer` كمعرف مزود داخلي.

## التحقق قبل الإنتاج

- ضبط Secret في Secret Manager/بيئة Functions.
- اختبار التوقيع والمبلغ والعملة وإعادة إرسال الحدث.
- اختبار `paid → refund_pending → refunded` في Firebase Emulator.
- اختبار فشل الشبكة وإعادة المحاولة دون تكرار القيود.
- تشغيل `firebase deploy --only functions,firestore:rules,firestore:indexes` بعد مراجعة مزود الدفع والامتثال المالي.
