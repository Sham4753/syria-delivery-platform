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

### `orders/{orderId}` و`orders/{orderId}/events/{eventId}`
الحالات المعتمدة هي: `pending → preparing → ready_for_pickup → picked_up → on_the_way → delivered`، ويمكن الإلغاء من `pending` أو `preparing` فقط. لا يغيّر التاجر أو المندوب الحالة مباشرة من Firestore؛ يستخدمان `transitionOrderStatus`، وتُحفظ كل نقلة مع `from_status`, `to_status`, `actor_id`, `actor_role`, `reason`, و`created_at`. قبول المندوب يتم ذريًا عبر `claimCourierOrder`، والتعيين اليدوي عبر `overrideDispatch`.

### `zones_geo/{zoneId}`
`zone_id`, `name`, `polygon` (array of `{lat, lng}`), `center` (GeoPoint), `is_active`, `updated_at`.

### `orders/{orderId}`
`customer_id`, `vendor_id`, `courier_id` (null until assigned), `zone_id`, `items[]`, `subtotal`, `commission`, `delivery_fee`, `total`, `idempotency_key`, `status` (`pending|preparing|ready_for_pickup|picked_up|on_the_way|delivered|cancelled`), `cancelled_by?` (`customer|vendor|admin`), `cancellation_reason?`, `commission_voided?`, `courier_compensation_due?`, `fulfillment_type` (`delivery|pickup`), `scheduled_for?` (Timestamp), `delivery_address` (snapshot object), `landmark?`, `notes?`, `payment_method` (`cash_on_delivery|syrtel_cash|bemo_wallet`), `payment_status` (`unpaid|pending|paid|failed`), `prep_minutes?`, `created_at`, `updated_at`, `synced`. التاجر يغير `status` إلى `preparing` دون تعيين المندوب؛ المندوب يكتب `courier_id` فقط، وتبقى الحالة كما هي.

### `order_idempotency/{customerId_hash}`

`customer_id`, `fingerprint`, `order_id`, `created_at`. هذا المستند داخلي ولا يقرأه أو يكتبه أي عميل؛ يمنع إعادة إرسال نفس عملية إنشاء الطلب من إنشاء طلب أو خصم مالي ثانٍ.

### `tracking/{orderId}`
`order_id`, `courier_id`, `location` (GeoPoint), `accuracy?`, `updated_at`.

### `chats/{orderId}/messages/{messageId}`
`sender_id`, `sender_role`, `text`, `created_at`, `read_by[]`.

### `couriers/{courierId}`
`name`, `phone`, `is_available`, `zone_id`, `current_location?`, `updated_at`.

### `users/{uid}/addresses/{addressId}`
`label`, `building`, `floor`, `apartment`, `landmark`, `location` (lat/lng أو GeoPoint), `is_default`, `created_at`.

### `courier_wallets/{courierId}`
`debt`, `credit_limit` (افتراضي 1,000,000 ل.س؛ تُرقّى القيمة القديمة 100 تلقائياً)، `balance`, `total_earnings`, `updated_at`. عند التسليم يزيد `debt` بقيمة الجزء النقدي المستحق للمتجر بعد طرح رسم التوصيل؛ طلبات المحفظة لا تزيد الدين، وتبقى `delivery_fee` ضمن أرباح المندوب.

### `courier_wallets/{courierId}/settlements/{settlementId}`
`amount`, `received_at`, `received_by`.

### `shifts/{shiftId}`
وردية التاجر أو المندوب: `owner_type` (`vendor|courier`), `owner_id`, `vendor_id?`, `status` (`open|closed`), `opening_cash`, `expected_cash`, `counted_cash`, `variance`, `gross_sales`, `delivery_earnings`, `order_count`, `opened_by`, `opened_at`, `closed_by`, `closed_at`, `close_notes`, `version`. يمنع `active_shifts/{owner_type_owner_id}` وجود ورديتين مفتوحتين لنفس المالك.

### `settlements/{settlementId}`
نتيجة إغلاق الوردية: `shift_id`, المالك، `status` (`pending_approval|approved`), `expected_cash`, `counted_cash`, `variance`, `gross_sales`, `delivery_earnings`, `order_count`, `created_by`, `approved_by`, `created_at`, `approved_at`. لا تُعدّل مباشرة؛ الإغلاق أو اعتماد المدير يتم عبر Cloud Functions.

### `financial_ledger/{entryId}`
دفتر مالي غير قابل للتعديل من التطبيقات. كل قيد يحمل `type`, `direction`, `amount`, `shift_id?`, `settlement_id?`, `owner_id?`, `actor_id`, و`created_at`. اعتماد التسوية يكتب قيد الفروقات مرة واحدة داخل Transaction.

### `wallet_topups/{topupId}`
`customer_id`, `method` (`local_transfer|change_to_wallet`), `reference`, `status` (`pending|approved|denied`), `amount?`, `reviewed_by?`, `reviewed_at?`, `created_at`. تُنشأ عبر `topUpWallet` ويُحسم الطلب عبر `approveWalletTopUp` فقط.

### `coupons/{CODE}`
`type` (`percentage|fixed_amount|free_delivery`), `value`, `min_order_amount`, `expires_at?`, `usage_limit_total?`, `usage_limit_per_customer`, `used_count`, `is_active`, `source`, `restricted_to_customer?`.

### `coupons/{CODE}/redemptions/{orderId}`
`customer_id`, `discount_amount`, `redeemed_at`.

### `ratings/{ratingId}`
`order_id`, `customer_id`, `vendor_id`, `courier_id?`, `vendor_rating`, `courier_rating?`, `comment?`, `created_at`.

### `support_tickets/{ticketId}`
`customer_id`, `order_id?`, `subject`, `message`, `status` (`open|in_progress|closed`), `created_at`, `updated_at`.

### `payments/{paymentId}`
`order_id`, `customer_id`, `method`, `amount`, `status`, `provider_reference?`, `created_at`, `updated_at`.

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
