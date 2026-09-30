'use strict';
const {normalizePoint, pickZone, haversineKm, computeErrandFee, round2} = require('./geo');

const CHANGE_REQUEST_WINDOW_MS = 48 * 60 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 30 * 1000;
const QUOTE_CACHE_MAX_ENTRIES = 200;
const QUOTE_RATE_WINDOW_MS = 60 * 1000;
const QUOTE_RATE_LIMIT = 20;

// كل الاعتماديات تُحقن من index.js حتى يمكن اختبار المنطق المالي بقاعدة بيانات وهمية.
function buildErrandFunctions({db, onCall, HttpsError, FieldValue, createHash, randomInt, requireRole, money}) {
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  const label = (value) => String(value || '').trim().slice(0, 300);
  const quoteCache = new Map();
  const quoteRate = new Map();

  function enforceQuoteRate(uid) {
    const now = Date.now();
    const current = quoteRate.get(uid);
    if (!current || now - current.windowStart >= QUOTE_RATE_WINDOW_MS) {
      if (current) quoteRate.delete(uid);
      quoteRate.set(uid, {windowStart: now, count: 1});
      return;
    }
    if (current.count >= QUOTE_RATE_LIMIT) throw new HttpsError('resource-exhausted', 'تجاوزت حد طلبات التسعير مؤقتاً');
    current.count += 1;
  }

  function cacheKey(pickup, dropoff) {
    return `${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}`;
  }

  // الخادم وحده يحدد المنطقة والرسم: من zones_geo (المضلعات) و zones (الرسم) و system_config.
  async function loadQuote(pickupRaw, dropoffRaw) {
    const pickup = normalizePoint(pickupRaw);
    const dropoff = normalizePoint(dropoffRaw);
    if (!pickup || !dropoff) throw new HttpsError('invalid-argument', 'حدد إحداثيات نقطة الاستلام ونقطة التسليم');
    const key = cacheKey(pickup, dropoff);
    const cached = quoteCache.get(key);
    if (cached && Date.now() - cached.createdAt < QUOTE_CACHE_TTL_MS) return cached.quote;
    const [geoSnap, configSnap] = await Promise.all([db.collection('zones_geo').get(), db.doc('system_config/main').get()]);
    const zones = geoSnap.docs.map((doc) => ({id: doc.id, polygon: doc.data()?.polygon, active: doc.data()?.is_active !== false}));
    const pickupZone = pickZone(pickup, zones);
    const dropoffZone = pickZone(dropoff, zones);
    if (!pickupZone) throw new HttpsError('failed-precondition', 'نقطة الاستلام خارج مناطق التوصيل');
    if (!dropoffZone) throw new HttpsError('failed-precondition', 'نقطة التسليم خارج مناطق التوصيل');
    if (pickupZone !== dropoffZone) throw new HttpsError('failed-precondition', 'الاستلام والتسليم يجب أن يكونا داخل المنطقة نفسها');
    const zoneSnap = await db.doc(`zones/${pickupZone}`).get();
    const zone = zoneSnap.data();
    if (!zoneSnap.exists || zone.is_active === false || zone.is_accepting_orders === false) throw new HttpsError('failed-precondition', 'التوصيل متوقف مؤقتاً في هذه المنطقة');
    const distanceKm = haversineKm(pickup, dropoff);
    const {fee, breakdown} = computeErrandFee({zone, config: configSnap.data() || {}, distanceKm});
    // إذا كان الرسم صفرًا فالإعدادات ناقصة: نرفض بدل أن نعطي توصيلًا مجانيًا بالخطأ.
    if (!(fee > 0)) throw new HttpsError('failed-precondition', 'رسم التوصيل غير مضبوط لهذه المنطقة');
    const quote = {pickup, dropoff, zoneId: pickupZone, fee, distanceKm: round2(distanceKm), breakdown};
    quoteCache.set(key, {createdAt: Date.now(), quote});
    if (quoteCache.size > QUOTE_CACHE_MAX_ENTRIES) quoteCache.delete(quoteCache.keys().next().value);
    return quote;
  }

  const quoteErrand = onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    enforceQuoteRate(context.auth.uid);
    const quote = await loadQuote(data?.pickup_address, data?.dropoff_address);
    return {zone_id: quote.zoneId, delivery_fee: quote.fee, distance_km: quote.distanceKm};
  });

  const createErrand = onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    const customerId = context.auth.uid;
    const description = String(data?.description || '').trim();
    const pickupLabel = label(data?.pickup_address?.label);
    const dropoffLabel = label(data?.dropoff_address?.label);
    const idempotencyKey = String(data?.idempotency_key || '').trim();
    const expectedFee = data?.expected_fee;
    if (!pickupLabel || !dropoffLabel || !description || description.length > 500) throw new HttpsError('invalid-argument', 'بيانات الأمانة غير صالحة');
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) throw new HttpsError('invalid-argument', 'معرف الطلب المكرر غير صالح');
    if (typeof expectedFee !== 'number' || !Number.isFinite(expectedFee)) throw new HttpsError('invalid-argument', 'يجب تأكيد السعر المعروض قبل الإرسال');

    // نتجاهل أي delivery_fee أو zone_id يرسلهما العميل؛ expected_fee للمقارنة فقط.
    const quote = await loadQuote(data?.pickup_address, data?.dropoff_address);
    if (Math.abs(expectedFee - quote.fee) > 0.01) throw new HttpsError('failed-precondition', 'تغيّر السعر، راجع السعر الجديد ثم أكّد', {reason: 'price_changed', delivery_fee: quote.fee});

    const fingerprint = sha(JSON.stringify({pickup: quote.pickup, dropoff: quote.dropoff, pickupLabel, dropoffLabel, description, expectedFee}));
    const idempotencyRef = db.doc(`order_idempotency/${customerId}_${sha(idempotencyKey).slice(0, 32)}`);
    const rateRef = db.doc(`order_rate_limits/${customerId}`);
    const orderRef = db.collection('orders').doc();
    const secretRef = db.doc(`order_secrets/${orderRef.id}`);
    const otp = String(randomInt(100000, 1000000));

    return db.runTransaction(async (tx) => {
      const now = Date.now();
      const [idempotencySnap, rateSnap] = await Promise.all([tx.get(idempotencyRef), tx.get(rateRef)]);
      if (idempotencySnap.exists) {
        const previous = idempotencySnap.data() || {};
        if (previous.fingerprint !== fingerprint) throw new HttpsError('already-exists', 'معرف الطلب مستخدم مع بيانات مختلفة');
        return {order_id: String(previous.order_id), delivery_fee: quote.fee, zone_id: quote.zoneId, replayed: true};
      }
      const windowStart = Number(rateSnap.data()?.window_start || 0);
      const count = Number(rateSnap.data()?.count || 0);
      const inWindow = windowStart && now - windowStart < 60 * 1000;
      if (inWindow && count >= 5) throw new HttpsError('resource-exhausted', 'تجاوزت حد إنشاء الطلبات مؤقتاً');
      tx.set(rateRef, {window_start: inWindow ? windowStart : now, count: inWindow ? count + 1 : 1, updated_at: FieldValue.serverTimestamp()}, {merge: true});
      tx.create(orderRef, {
        customer_id: customerId, vendor_id: null, courier_id: null, zone_id: quote.zoneId, fulfillment_type: 'errand',
        pickup_address: {label: pickupLabel, latitude: quote.pickup.latitude, longitude: quote.pickup.longitude},
        delivery_address: {label: dropoffLabel, latitude: quote.dropoff.latitude, longitude: quote.dropoff.longitude},
        errand_description: description, errand_distance_km: quote.distanceKm, fee_breakdown: quote.breakdown,
        subtotal: 0, delivery_fee: quote.fee, total: quote.fee, cash_due: quote.fee, cash_change_for: 0,
        wallet_amount: 0, loyalty_points_used: 0, discount_amount: 0, coupon_applied: false,
        payment_method: 'cash_on_delivery', payment_status: 'unpaid', status: 'pending', idempotency_key: idempotencyKey,
        created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), synced: true,
      });
      tx.create(secretRef, {customer_id: customerId, otp, otp_hash: sha(otp), created_at: FieldValue.serverTimestamp()});
      tx.create(idempotencyRef, {customer_id: customerId, fingerprint, order_id: orderRef.id, created_at: FieldValue.serverTimestamp()});
      return {order_id: orderRef.id, delivery_fee: quote.fee, zone_id: quote.zoneId, replayed: false};
    });
  });

  // المندوب يطلب مراجعة فقط: لا رصيد يُضاف هنا، والمبلغ يُحسب في الخادم ولا نثق بما يكتبه المندوب.
  const requestChangeToWallet = onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    const uid = context.auth.uid;
    await requireRole(uid, ['courier']);
    const orderId = String(data?.order_id || '').trim();
    if (!orderId) throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب');
    const claimed = typeof data?.amount === 'number' && Number.isFinite(data.amount) ? data.amount : null;
    const orderRef = db.doc(`orders/${orderId}`);
    const requestRef = db.doc(`change_requests/${orderId}`);
    return db.runTransaction(async (tx) => {
      const [orderSnap, requestSnap] = await Promise.all([tx.get(orderRef), tx.get(requestRef)]);
      if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
      const order = orderSnap.data() || {};
      if (requestSnap.exists || order.change_to_wallet_amount) throw new HttpsError('already-exists', 'تم إرسال طلب لهذا الطلب مسبقًا');
      if (order.courier_id !== uid || order.status !== 'delivered' || !['cash_on_delivery', 'hybrid'].includes(order.payment_method)) throw new HttpsError('failed-precondition', 'لا يمكن طلب تحويل الفكة إلا بعد تسليم طلب نقدي أنت مندوبه');
      const deliveredAt = order.delivered_at?.toMillis?.() || 0;
      if (!deliveredAt || Date.now() - deliveredAt > CHANGE_REQUEST_WINDOW_MS) throw new HttpsError('failed-precondition', 'انتهت مهلة طلب تحويل الفكة لهذا الطلب');
      const cashDue = money(order.cash_due || 0);
      const cashChangeFor = money(order.cash_change_for || 0);
      const amount = money(cashChangeFor - cashDue);
      if (!(amount > 0)) throw new HttpsError('failed-precondition', 'لا توجد فكة قابلة للتحويل');
      const configSnap = await tx.get(db.doc('system_config/main'));
      const configuredMax = Number(configSnap.data()?.max_change_amount || 0);
      const maxChange = configuredMax > 0 ? configuredMax : cashDue * 10;
      const needsManualReview = amount > maxChange;
      tx.create(requestRef, {
        order_id: orderId, courier_id: uid, customer_id: String(order.customer_id || ''), amount, cash_due: cashDue, cash_change_for: cashChangeFor,
        courier_claimed_amount: claimed, needs_manual_review: needsManualReview, status: 'pending', requested_at: FieldValue.serverTimestamp(),
      });
      return {order_id: orderId, amount, status: 'pending', needs_manual_review: needsManualReview};
    });
  });

  // الأدمن وحده يعتمد أو يرفض. عند الاعتماد: رصيد للزبون + التزام على المندوب (لأنه يحتفظ بالنقد) + قيد مالي.
  const reviewChangeRequest = onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    const adminId = context.auth.uid;
    await requireRole(adminId, ['super_admin']);
    const orderId = String(data?.order_id || '').trim();
    const decision = String(data?.decision || '');
    const note = String(data?.note || '').trim().slice(0, 300);
    if (!orderId || !['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'رقم الطلب والقرار مطلوبان');
    const requestRef = db.doc(`change_requests/${orderId}`);
    return db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (!requestSnap.exists) throw new HttpsError('not-found', 'طلب المراجعة غير موجود');
      const request = requestSnap.data() || {};
      if (request.status !== 'pending') throw new HttpsError('failed-precondition', 'تمت مراجعة هذا الطلب مسبقًا');
      const review = {reviewed_by: adminId, reviewed_at: FieldValue.serverTimestamp(), review_note: note};
      if (decision === 'reject') {
        tx.update(requestRef, {status: 'rejected', ...review});
        return {order_id: orderId, status: 'rejected'};
      }
      const amount = money(request.amount || 0);
      if (!(amount > 0)) throw new HttpsError('failed-precondition', 'مبلغ الطلب غير صالح');
      const customerRef = db.doc(`users/${request.customer_id}`);
      const walletRef = db.doc(`courier_wallets/${request.courier_id}`);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists) throw new HttpsError('failed-precondition', 'حساب الزبون غير موجود');
      tx.update(customerRef, {wallet_balance: FieldValue.increment(amount), updated_at: FieldValue.serverTimestamp()});
      tx.create(customerRef.collection('wallet_ledger').doc(`change_${orderId}`), {label: `فكة الطلب ${orderId.slice(0, 6)}`, amount, unit: 'ل.س', direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
      tx.set(walletRef, {debt: FieldValue.increment(amount), updated_at: FieldValue.serverTimestamp()}, {merge: true});
      tx.create(walletRef.collection('ledger').doc(`change_${orderId}`), {type: 'change_to_wallet', order_id: orderId, debt: amount, earnings: 0, created_at: FieldValue.serverTimestamp()});
      tx.create(db.collection('financial_ledger').doc(), {type: 'change_to_wallet', direction: 'credit', amount, order_id: orderId, customer_id: request.customer_id, courier_id: request.courier_id, actor_id: adminId, created_at: FieldValue.serverTimestamp()});
      tx.update(requestRef, {status: 'approved', ...review});
      return {order_id: orderId, status: 'approved', amount};
    });
  });

  return {quoteErrand, createErrand, requestChangeToWallet, reviewChangeRequest};
}

module.exports = {buildErrandFunctions, CHANGE_REQUEST_WINDOW_MS};
