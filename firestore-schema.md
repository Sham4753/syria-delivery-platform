# Syria Delivery — Firestore Schema

## Collections

### `users/{uid}`
`name`, `phone`, `role` (`customer|courier|vendor_admin|super_admin`), `vendor_id?`, `is_active`, `created_at`.

### `vendors/{vendorId}`
`name`, `category` (`restaurant|pharmacy|grocery`), `zone_id`, `commission_rate`, `is_active`, `opening_hours`, `phone?`, `address?`, `location` (GeoPoint), `created_at`, `updated_at`.

### `public_vendors/{vendorId}`
نسخة كتالوج آمنة للزبون من دون `commission_rate` أو أي حقول مالية داخلية. تُنشأ وتُحدّث خادميًا من `vendors/{vendorId}`، ويقرأ الزبون المزود النشط منها فقط. عند نشر النسخة يجب تشغيل عملية backfill للمزودين الموجودين مسبقًا.

### `vendors/{vendorId}/products/{productId}`
`name`, `description?`, `category_id?`, `price`, `image_url?`, `is_available`, `requires_prescription`, `created_at`, `updated_at`.

### `zones/{zoneId}`
`name`, `delivery_fee_base`, `is_active`, `is_accepting_orders` (افتراضي true), `surge_multiplier` (افتراضي 1), `created_at`.

### `system_config/main`
إعدادات تشغيل قابلة للتخصيص مثل `app_name`, `currency`, `support_phone`, `default_delivery_fee`, `emergency_mode`, `emergency_message`, `surge_enabled`, `surge_multiplier`, `loyalty_point_value`, `config_version`, `updated_by`, `updated_at`. لا تُكتب مباشرة من العميل؛ النشر يمر عبر `publishSystemConfig` مع تحقق نوع وحدود وسجل Revision.

### `system_config_revisions/{version}`
`version`, `actor_id`, `reason`, `before`, `patch`, `after`, `created_at`. سجل غير قابل للكتابة من العميل، ويُستخدم للتدقيق والاسترجاع المنضبط.

### `payment_config/main` و`payment_config_revisions/{version}`
إعدادات الدفع الداخلية وسجل إصداراتها. تحفظ فقط عبر `publishPaymentSettings` وتقرأ من الأدمن. تحتوي المرحلة الأولى على إعداد عرض التحويل البنكي، وحالة المراجعة اليدوية، واسم البنك واسم صاحب الحساب ورقم حساب مقنع فقط. لا تحفظ مفاتيح API أو كلمات المرور أو IBAN أو رقم حساب كامل.

### `public_payment_config/main`
إسقاط عام محدود لإعدادات طرق الدفع التي يمكن عرضها للعميل. لا يكتب إليه أي عميل؛ تنشئه الدالة الخادمية من بيانات الدفع المسموح بها. لا يمثل هذا السجل عملية دفع أو إثبات تسوية.

### `orders/{orderId}` و`orders/{orderId}/events/{eventId}`
الحالات المعتمدة هي: `pending → preparing → ready_for_pickup → picked_up → on_the_way → delivered`، ويمكن الإلغاء من `pending` أو `preparing` فقط. لا يغيّر التاجر أو المندوب الحالة مباشرة من Firestore؛ يستخدمان `transitionOrderStatus`، وتُحفظ كل نقلة مع `from_status`, `to_status`, `actor_id`, `actor_role`, `reason`, و`created_at`. قبول المندوب يتم ذريًا عبر `claimCourierOrder`، والتعيين اليدوي عبر `overrideDispatch`.

### `zones_geo/{zoneId}`
`zone_id`, `name`, `polygon` (array of `{lat, lng}`), `center` (GeoPoint), `is_active`, `updated_at`.

### `orders/{orderId}`
`customer_id`, `vendor_id`, `courier_id` (null until assigned), `zone_id`, `items[]`, `subtotal`, `commission`, `delivery_fee`, `total`, `idempotency_key`, `status` (`pending|preparing|ready_for_pickup|picked_up|on_the_way|delivered|cancelled`), `cancelled_by?` (`customer|vendor|admin`), `cancellation_reason?`, `commission_voided?`, `courier_compensation_due?`, `fulfillment_type` (`delivery|pickup`), `scheduled_for?` (Timestamp), `delivery_address` (snapshot object), `landmark?`, `notes?`, `payment_method` (`cash_on_delivery|bank_transfer|wallet|hybrid`), `payment_status` (`unpaid|pending|paid|failed`), `prep_minutes?`, `prep_started_at?`, `ready_at?`, `dispatch_status?` (`offered|accepted|requeue|waiting_for_courier`), `dispatch_candidates?[]`, `dispatch_offer_ids?[]`, `dispatch_attempt?`, `dispatch_attempted_courier_ids?[]`, `dispatch_expires_at?`, `dispatch_last_reason?`, `created_at`, `updated_at`, `synced`. شاشة KDS تعرض `pending`, `preparing`, `ready_for_pickup`, و`picked_up`. بدء التحضير يكتب `prep_started_at` خادميًا، ولا يغير فريق المطبخ أي حقل مالي.

### أدوار فريق المطعم

تُحفظ في `users/{uid}.role` مع `vendor_id`: `vendor_admin`، `vendor_supervisor`، `vendor_cashier`، `kitchen_staff`. تُفرض صلاحية الانتقال خادميًا؛ يستطيع المطبخ قبول الطلب ووضعه جاهزًا، ويستطيع الكاشير الإلغاء، بينما يملك المشرف صلاحيات التشغيل الأوسع.

### `order_idempotency/{customerId_hash}`

`customer_id`, `fingerprint`, `order_id`, `created_at`. هذا المستند داخلي ولا يقرأه أو يكتبه أي عميل؛ يمنع إعادة إرسال نفس عملية إنشاء الطلب من إنشاء طلب أو خصم مالي ثانٍ.

### `tracking/{orderId}`
`order_id`, `courier_id`, `location` (GeoPoint), `accuracy?`, `updated_at`.

### `chats/{orderId}/messages/{messageId}`
`sender_id`, `sender_role`, `text`, `created_at`, `read_by[]`.

### `couriers/{courierId}`
`name`, `phone`, `is_available`, `zone_id`, `current_location?`, `last_location_at?`, `updated_at`. يستخدم محرك الإسناد حداثة الموقع كعامل ترتيب؛ الموقع القديم لا يُعامل كمرشح موثوق.

### `dispatch_offers/{orderId_courierId}`

عرض إسناد مستقل وغير قابل للكتابة من التطبيقات: `order_id`, `courier_id`, `vendor_id?`, `zone_id`, `status` (`offered|accepted|rejected|expired`), `attempt`, `score`, `score_breakdown`, `offered_at`, `expires_at`, `responded_at?`, `rejection_reason?`, `updated_at`. مدة العرض الافتراضية 90 ثانية، وبعدها يعاد ترتيب مرشحين جدد.

### `users/{uid}/addresses/{addressId}`
`label`, `building`, `floor`, `apartment`, `landmark`, `location` (lat/lng أو GeoPoint), `is_default`, `created_at`.

### `courier_wallets/{courierId}`
`debt`, `credit_limit` (افتراضي 100)، `balance`, `total_earnings`, `updated_at`. عند تسليم COD يزيد `debt` بقيمة `subtotal` وتبقى `delivery_fee` ضمن أرباح المندوب.

### `courier_wallets/{courierId}/settlements/{settlementId}`
`amount`, `received_at`, `received_by`.

### `shifts/{shiftId}`
وردية التاجر أو المندوب: `owner_type` (`vendor|courier`), `owner_id`, `vendor_id?`, `status` (`open|closed`), `opening_cash`, `expected_cash`, `counted_cash`, `variance`, `gross_sales`, `delivery_earnings`, `order_count`, `opened_by`, `opened_at`, `closed_by`, `closed_at`, `close_notes`, `version`. يمنع `active_shifts/{owner_type_owner_id}` وجود ورديتين مفتوحتين لنفس المالك.

### `settlements/{settlementId}`
نتيجة إغلاق الوردية: `shift_id`, المالك، `status` (`pending_approval|approved`), `expected_cash`, `counted_cash`, `variance`, `gross_sales`, `delivery_earnings`, `order_count`, `created_by`, `approved_by`, `created_at`, `approved_at`. لا تُعدّل مباشرة؛ الإغلاق أو اعتماد المدير يتم عبر Cloud Functions.

### `financial_ledger/{entryId}`
دفتر قيود موحّد غير قابل للتعديل من التطبيقات. كل عملية مالية تكتب قيدين متوازنين داخل Transaction، ويحمل القيد `entry_group_id`, `account`, `direction` (`debit|credit`), `amount`, `currency`, `source_type`, `source_id`, `order_id?`, `payment_id?`, `settlement_id?`, `actor_id`, `metadata`, و`created_at`. اعتماد التحويل البنكي اليدوي يثبت زوج `bank_clearing` و`customer_receivable` بمعرفين حتميين. التصحيح مستقبلاً يكون بقيد عكسي، لا بتعديل أو حذف.

### `coupons/{CODE}`
`type` (`percentage|fixed_amount|free_delivery`), `value`, `min_order_amount`, `expires_at?`, `usage_limit_total?`, `usage_limit_per_customer`, `used_count`, `is_active`, `source`, `restricted_to_customer?`.

### `coupons/{CODE}/redemptions/{orderId}`
`customer_id`, `discount_amount`, `redeemed_at`.

### `ratings/{ratingId}`
`order_id`, `customer_id`, `vendor_id`, `courier_id?`, `vendor_rating`, `courier_rating?`, `comment?`, `created_at`.

### `support_tickets/{ticketId}`
`customer_id`, `order_id?`, `subject`, `message`, `status` (`open|in_progress|closed`), `created_at`, `updated_at`.

### `payment_intents/{paymentId}`
عملية دفع مستقلة عن الطلب. تحتوي `order_id`, `customer_id`, `method` (`bank_transfer`), `amount`, `currency`, `status` (`created|awaiting_customer_action|pending_verification|paid|rejected|failed`), `reference?`, `sender_name?`, `note?`, `submitted_at?`, `reviewed_by?`, `reviewed_at?`, `review_reason?`, `version`, `created_at`, `updated_at`. لا يكتب العميل أو الأدمن مباشرة؛ التعديل عبر الدوال.

### `payment_events/{eventId}`
سجل غير قابل للتعديل لأحداث العملية (`proof_submitted`, `approved`, `rejected`) مع `payment_id`, `actor_id`, `reference?`, `reason?`, و`created_at`. تستخدم معرفات حتمية للأحداث الحساسة لمنع التكرار.

### `payments/{paymentId}`
سجل قديم للتوافق فقط. العمليات الجديدة تستخدم `payment_intents` ولا تغيّر `payment_status` مباشرة من التطبيقات.

### `courier_wallets/{courierId}`
`balance`, `total_earnings`, `company_commission`, `updated_at`.

## Offline-first

Flutter enables Firestore local persistence and uses cached snapshots while offline. Writes are queued by the SDK and reconciled when connectivity returns. The `synced` field is application-visible status metadata; it is not a security boundary.

## Recommended indexes

`vendors`: `zone_id ASC, category ASC, is_active ASC`; `orders`: `customer_id ASC, created_at DESC`; `orders`: `courier_id ASC, status ASC`; `orders`: `vendor_id ASC, created_at DESC`; `tracking`: `updated_at DESC`; messages: `created_at ASC`.

### Trust & Safety

`couriers/{courierId}` may contain `photo_url`, `vehicle_plate`, and `vehicle_type`; these are public safety-profile fields and must not contain national ID or private documents. `order_secrets/{orderId}` stores only a server-side OTP hash and is readable by the customer who owns the order. Delivery completion is accepted only through the `completeDelivery` callable after OTP verification.

### Errands and wallet ledger

Orders with `fulfillment_type: "errand"` use `pickup_address`, `delivery_address`, and `errand_description` instead of a vendor and product list. `wallet_ledger/{orderId}` records a one-time `change_to_wallet` operation with `amount`, `currency`, `customer_id`, and `courier_id`.
