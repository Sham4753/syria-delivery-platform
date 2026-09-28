const {onDocumentCreated, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onCall, HttpsError} = require('firebase-functions/v1/https');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {getMessaging} = require('firebase-admin/messaging');
const {createHash, randomInt} = require('crypto');

initializeApp();
const db = getFirestore();

// Customers can read only this deliberately small, public-safe projection.
// Keep operational/vendor-admin fields exclusively in `vendors`.
function publicVendorProjection(vendor = {}) {
  const openingHours = vendor.opening_hours && typeof vendor.opening_hours === 'object' ? {
    open: String(vendor.opening_hours.open || '00:00'),
    close: String(vendor.opening_hours.close || '23:59'),
  } : null;
  return {
    name: String(vendor.name || '').trim(),
    category: String(vendor.category || '').trim(),
    zone_id: vendor.zone_id == null ? null : String(vendor.zone_id),
    is_active: vendor.is_active === true,
    is_busy: vendor.is_busy === true,
    address: String(vendor.address || '').trim(),
    phone: String(vendor.phone || '').trim(),
    ...(openingHours ? {opening_hours: openingHours} : {}),
    updated_at: FieldValue.serverTimestamp(),
  };
}

// One-time repair for catalogs created before the trigger was deployed.
exports.backfillPublicVendors = onCall(async (_, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const caller = await db.doc(`users/${context.auth.uid}`).get();
  if (caller.data()?.role !== 'super_admin') throw new HttpsError('permission-denied', 'هذه العملية متاحة للأدمن فقط');

  const [vendorsSnap, publicSnap] = await Promise.all([
    db.collection('vendors').get(),
    db.collection('public_vendors').get(),
  ]);
  const vendorIds = new Set(vendorsSnap.docs.map((vendor) => vendor.id));
  let batch = db.batch();
  let writes = 0;
  let synced = 0;
  let removed = 0;
  const commitIfFull = async () => {
    if (writes < 400) return;
    await batch.commit();
    batch = db.batch();
    writes = 0;
  };

  for (const vendor of vendorsSnap.docs) {
    batch.set(db.doc(`public_vendors/${vendor.id}`), publicVendorProjection(vendor.data()));
    writes += 1;
    synced += 1;
    await commitIfFull();
  }
  for (const publicVendor of publicSnap.docs) {
    if (vendorIds.has(publicVendor.id)) continue;
    batch.delete(publicVendor.ref);
    writes += 1;
    removed += 1;
    await commitIfFull();
  }
  if (writes > 0) await batch.commit();
  return {synced, removed};
});

function couponDiscount(coupon, subtotal, deliveryFee) {
  if (coupon.type === 'percentage') return Math.min(subtotal + deliveryFee, subtotal * Number(coupon.value || 0) / 100);
  if (coupon.type === 'fixed_amount') return Math.min(subtotal + deliveryFee, Number(coupon.value || 0));
  if (coupon.type === 'free_delivery') return Math.min(deliveryFee, subtotal + deliveryFee);
  return 0;
}

exports.createStaffAccount = onCall(async (data, context) => {
  const caller = context.auth;
  if (!caller) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const callerUser = await db.doc(`users/${caller.uid}`).get();
  if (callerUser.data()?.role !== 'super_admin') throw new HttpsError('permission-denied', 'هذه العملية متاحة للأدمن فقط');
  const {role, email, password, name, phone, photo_url: photoUrl, vehicle_plate: vehiclePlate, vehicle_type: vehicleType, zone_id: zoneId, vendor_id: vendorId} = data || {};
  if (!['courier', 'vendor_admin'].includes(role)) throw new HttpsError('invalid-argument', 'نوع الحساب غير مدعوم');
  if (!email || !password || String(password).length < 6) throw new HttpsError('invalid-argument', 'البريد وكلمة المرور (6 أحرف على الأقل) مطلوبان');
  if (role === 'courier' && (!name || !phone || !zoneId)) throw new HttpsError('invalid-argument', 'اسم المندوب وهاتفه ومنطقته مطلوبة');
  if (role === 'vendor_admin' && !vendorId) throw new HttpsError('invalid-argument', 'اختر المزود المرتبط بالحساب');
  if (role === 'vendor_admin' && !(await db.doc(`vendors/${vendorId}`).get()).exists) throw new HttpsError('not-found', 'المزود غير موجود');

  let userRecord;
  try {
    userRecord = await getAuth().createUser({email: String(email).trim().toLowerCase(), password: String(password), displayName: name || undefined});
    const batch = db.batch();
    batch.set(db.doc(`users/${userRecord.uid}`), {role, email: userRecord.email, ...(role === 'vendor_admin' ? {vendor_id: vendorId} : {}), created_at: FieldValue.serverTimestamp(), created_by: caller.uid});
    if (role === 'courier') {
      batch.set(db.doc(`couriers/${userRecord.uid}`), {name: String(name).trim(), phone: String(phone).trim(), photo_url: String(photoUrl || '').trim(), vehicle_plate: String(vehiclePlate || '').trim(), vehicle_type: String(vehicleType || '').trim(), zone_id: zoneId, is_available: true, created_at: FieldValue.serverTimestamp()});
      batch.set(db.doc(`courier_wallets/${userRecord.uid}`), {debt: 0, credit_limit: 100, balance: 0, total_earnings: 0, created_at: FieldValue.serverTimestamp()});
    }
    await batch.commit();
    return {uid: userRecord.uid, role};
  } catch (error) {
    if (userRecord?.uid) await getAuth().deleteUser(userRecord.uid).catch(() => {});
    if (error instanceof HttpsError) throw error;
    if (error.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'البريد الإلكتروني مستخدم مسبقاً');
    throw new HttpsError('internal', 'تعذر إنشاء الحساب');
  }
});


exports.sendBroadcastNotification = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const caller = (await db.doc(`users/${context.auth.uid}`).get()).data();
  if (caller?.role !== 'super_admin') throw new HttpsError('permission-denied', 'هذه العملية متاحة للأدمن فقط');
  const title = String(data?.title || '').trim(); const body = String(data?.body || '').trim();
  const targetRole = String(data?.target_role || 'customer');
  if (!title || !body || !['customer', 'courier', 'vendor_admin', 'all'].includes(targetRole)) throw new HttpsError('invalid-argument', 'عنوان ونص الإشعار والفئة مطلوبة');
  let query = db.collection('users').where('fcm_token', '!=', null).limit(500);
  if (targetRole !== 'all') query = query.where('role', '==', targetRole);
  const snap = await query.get();
  const tokens = snap.docs.map((d) => d.data()?.fcm_token).filter(Boolean);
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const result = await getMessaging().sendEachForMulticast({tokens: tokens.slice(i, i + 500), notification: {title, body}});
    sent += result.successCount;
  }
  await db.collection('notification_logs').add({title, body, target_role: targetRole, sent, actor_id: context.auth.uid, created_at: FieldValue.serverTimestamp()});
  return {sent};
});

const CONFIG_LIMITS = {
  app_name: {type: 'string', max: 80}, currency: {type: 'string', max: 8}, support_phone: {type: 'string', max: 32},
  default_delivery_fee: {type: 'number', min: 0, max: 1000000000}, emergency_mode: {type: 'boolean'}, emergency_message: {type: 'string', max: 500},
  surge_enabled: {type: 'boolean'}, surge_multiplier: {type: 'number', min: 0.1, max: 10}, loyalty_point_value: {type: 'number', min: 0, max: 1000000},
};

function validateConfigPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpsError('invalid-argument', 'إعدادات التخصيص غير صالحة');
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    const rule = CONFIG_LIMITS[key];
    if (!rule) throw new HttpsError('invalid-argument', `الإعداد غير مسموح: ${key}`);
    if (rule.type === 'string') {
      if (typeof value !== 'string' || value.length > rule.max) throw new HttpsError('invalid-argument', `قيمة ${key} غير صالحة`);
      clean[key] = value.trim();
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `قيمة ${key} غير صالحة`);
      clean[key] = value;
    } else {
      const number = Number(value);
      if (!Number.isFinite(number) || number < rule.min || number > rule.max) throw new HttpsError('invalid-argument', `قيمة ${key} خارج الحدود`);
      clean[key] = number;
    }
  }
  if (clean.emergency_mode === true && clean.emergency_message !== undefined && !clean.emergency_message) throw new HttpsError('invalid-argument', 'رسالة الطوارئ مطلوبة عند تفعيل الوضع');
  return clean;
}

exports.publishSystemConfig = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const caller = (await db.doc(`users/${context.auth.uid}`).get()).data();
  if (caller?.role !== 'super_admin') throw new HttpsError('permission-denied', 'هذه العملية متاحة للأدمن فقط');
  const patch = validateConfigPatch(data?.patch);
  const reason = String(data?.reason || 'admin_settings').trim().slice(0, 120);
  const mainRef = db.doc('system_config/main');
  const result = await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(mainRef);
    const before = currentSnap.data() || {};
    const version = Number(before.config_version || 0) + 1;
    const after = {...before, ...patch, config_version: version, updated_by: context.auth.uid, updated_at: FieldValue.serverTimestamp()};
    const revisionRef = db.doc(`system_config_revisions/${String(version).padStart(12, '0')}`);
    tx.set(mainRef, after, {merge: true});
    tx.create(revisionRef, {version, actor_id: context.auth.uid, reason, before, patch, after, created_at: FieldValue.serverTimestamp()});
    return {version};
  });
  return {status: 'published', ...result};
});

const ORDER_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['picked_up'],
  picked_up: ['on_the_way'],
  on_the_way: ['delivered'],
  delivered: [],
  cancelled: [],
};

async function requireRole(uid, roles) {
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() || {};
  if (!roles.includes(user.role)) throw new HttpsError('permission-denied', 'هذا الإجراء غير مسموح لهذا الدور');
  return user;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function shiftKey(ownerType, ownerId) {
  return `${ownerType}_${ownerId}`;
}

async function resolveShiftOwner(uid, requestedOwnerType, requestedOwnerId) {
  const user = await db.doc(`users/${uid}`).get();
  const profile = user.data() || {};
  const ownerType = String(requestedOwnerType || (profile.role === 'courier' ? 'courier' : 'vendor'));
  const ownerId = String(requestedOwnerId || (ownerType === 'courier' ? uid : profile.vendor_id || ''));
  const isAdmin = profile.role === 'super_admin';
  const allowed = isAdmin || (ownerType === 'courier' && profile.role === 'courier' && ownerId === uid) || (ownerType === 'vendor' && profile.role === 'vendor_admin' && ownerId === profile.vendor_id);
  if (!allowed || !['vendor', 'courier'].includes(ownerType) || !ownerId) throw new HttpsError('permission-denied', 'لا تملك صلاحية هذه الوردية');
  return {ownerType, ownerId, isAdmin, profile};
}

exports.openShift = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const {ownerType, ownerId, profile} = await resolveShiftOwner(context.auth.uid, data?.owner_type, data?.owner_id);
  const openingCash = Number(data?.opening_cash || 0);
  if (!Number.isFinite(openingCash) || openingCash < 0) throw new HttpsError('invalid-argument', 'الرصيد الافتتاحي غير صالح');
  const activeRef = db.doc(`active_shifts/${shiftKey(ownerType, ownerId)}`);
  const shiftRef = db.collection('shifts').doc();
  await db.runTransaction(async (tx) => {
    const active = await tx.get(activeRef);
    if (active.exists) {
      const activeData = active.data() || {};
      const current = activeData.shift_id ? await tx.get(db.doc(`shifts/${activeData.shift_id}`)) : null;
      if (current?.exists && current.data()?.status === 'open') throw new HttpsError('failed-precondition', 'توجد وردية مفتوحة بالفعل');
    }
    const vendorId = ownerType === 'vendor' ? ownerId : String(profile.vendor_id || '');
    tx.create(shiftRef, {
      owner_type: ownerType, owner_id: ownerId, vendor_id: vendorId || null, status: 'open', opening_cash: money(openingCash), expected_cash: money(openingCash), counted_cash: null, variance: null,
      opened_by: context.auth.uid, opened_at: FieldValue.serverTimestamp(), created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), version: 1,
    });
    tx.set(activeRef, {shift_id: shiftRef.id, owner_type: ownerType, owner_id: ownerId, opened_by: context.auth.uid, updated_at: FieldValue.serverTimestamp()});
  });
  return {shift_id: shiftRef.id, owner_type: ownerType, owner_id: ownerId, status: 'open'};
});

async function calculateShiftTotals(shift) {
  const startedAt = shift.opened_at?.toDate?.() || new Date(0);
  const delivered = db.collection('orders').where('status', '==', 'delivered').where('delivered_at', '>=', startedAt).where('delivered_at', '<=', new Date());
  const snap = await delivered.get();
  let cashExpected = 0; let grossSales = 0; let orderCount = 0; let deliveryEarnings = 0;
  snap.docs.forEach((doc) => {
    const order = doc.data() || {};
    const belongs = shift.owner_type === 'vendor' ? order.vendor_id === shift.owner_id : order.courier_id === shift.owner_id;
    if (!belongs) return;
    const cashDue = Math.max(0, Number(order.cash_due || 0));
    const deliveryFee = Math.max(0, Number(order.delivery_fee || 0));
    cashExpected += shift.owner_type === 'vendor' ? Math.max(0, cashDue - deliveryFee) : cashDue;
    grossSales += Number(order.total || 0); deliveryEarnings += deliveryFee; orderCount += 1;
  });
  return {cashExpected: money(cashExpected + Number(shift.opening_cash || 0)), grossSales: money(grossSales), deliveryEarnings: money(deliveryEarnings), orderCount};
}

exports.closeShift = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const shiftId = String(data?.shift_id || '').trim(); const countedCash = Number(data?.counted_cash); const notes = String(data?.notes || '').trim().slice(0, 500);
  if (!shiftId || !Number.isFinite(countedCash) || countedCash < 0) throw new HttpsError('invalid-argument', 'رقم الوردية والعد النقدي مطلوبان');
  const shiftRef = db.doc(`shifts/${shiftId}`); const shiftSnap = await shiftRef.get();
  if (!shiftSnap.exists) throw new HttpsError('not-found', 'الوردية غير موجودة');
  const shift = shiftSnap.data() || {}; const owner = await resolveShiftOwner(context.auth.uid, shift.owner_type, shift.owner_id);
  const totals = await calculateShiftTotals(shift); const variance = money(countedCash - totals.cashExpected); const activeRef = db.doc(`active_shifts/${shiftKey(shift.owner_type, shift.owner_id)}`); const settlementRef = db.collection('settlements').doc();
  await db.runTransaction(async (tx) => {
    const current = await tx.get(shiftRef);
    if (!current.exists || current.data()?.status !== 'open') throw new HttpsError('failed-precondition', 'الوردية مغلقة أو غير صالحة');
    tx.update(shiftRef, {status: 'closed', counted_cash: money(countedCash), expected_cash: totals.cashExpected, variance, gross_sales: totals.grossSales, delivery_earnings: totals.deliveryEarnings, order_count: totals.orderCount, close_notes: notes, closed_by: context.auth.uid, closed_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), version: FieldValue.increment(1)});
    tx.set(settlementRef, {shift_id: shiftId, owner_type: shift.owner_type, owner_id: shift.owner_id, vendor_id: shift.vendor_id || null, status: owner.isAdmin ? 'approved' : 'pending_approval', expected_cash: totals.cashExpected, counted_cash: money(countedCash), variance, gross_sales: totals.grossSales, delivery_earnings: totals.deliveryEarnings, order_count: totals.orderCount, created_by: context.auth.uid, created_at: FieldValue.serverTimestamp(), approved_by: owner.isAdmin ? context.auth.uid : null, approved_at: owner.isAdmin ? FieldValue.serverTimestamp() : null});
    tx.delete(activeRef);
  });
  return {shift_id: shiftId, settlement_id: settlementRef.id, status: owner.isAdmin ? 'approved' : 'pending_approval', expected_cash: totals.cashExpected, counted_cash: money(countedCash), variance};
});

exports.approveSettlement = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  await requireRole(context.auth.uid, ['super_admin']);
  const settlementId = String(data?.settlement_id || '').trim(); if (!settlementId) throw new HttpsError('invalid-argument', 'رقم التسوية مطلوب');
  const settlementRef = db.doc(`settlements/${settlementId}`); const ledgerRef = db.collection('financial_ledger').doc();
  await db.runTransaction(async (tx) => {
    const settlement = await tx.get(settlementRef); if (!settlement.exists) throw new HttpsError('not-found', 'التسوية غير موجودة');
    if (settlement.data()?.status !== 'pending_approval') throw new HttpsError('failed-precondition', 'التسوية ليست بانتظار الاعتماد');
    tx.update(settlementRef, {status: 'approved', approved_by: context.auth.uid, approved_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
    tx.create(ledgerRef, {type: 'shift_settlement', direction: 'variance', amount: Number(settlement.data()?.variance || 0), settlement_id: settlementId, shift_id: settlement.data()?.shift_id, owner_type: settlement.data()?.owner_type, owner_id: settlement.data()?.owner_id, actor_id: context.auth.uid, created_at: FieldValue.serverTimestamp()});
  });
  return {settlement_id: settlementId, status: 'approved'};
});

exports.transitionOrderStatus = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const orderId = String(data?.order_id || '').trim();
  const nextStatus = String(data?.status || '').trim();
  const reason = String(data?.reason || '').trim().slice(0, 200);
  const prepMinutes = data?.prep_minutes === undefined ? null : Number(data.prep_minutes);
  if (!orderId || !ORDER_TRANSITIONS[nextStatus]) throw new HttpsError('invalid-argument', 'الطلب والحالة الجديدة مطلوبان');
  if (prepMinutes !== null && (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 240)) throw new HttpsError('invalid-argument', 'مدة التحضير غير صالحة');
  const uid = context.auth.uid;
  const user = await requireRole(uid, ['super_admin', 'vendor_admin', 'courier']);
  const orderRef = db.doc(`orders/${orderId}`);
  const eventRef = orderRef.collection('events').doc();
  let result;
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
    const before = orderSnap.data() || {};
    const current = String(before.status || 'pending');
    if (!ORDER_TRANSITIONS[current]?.includes(nextStatus)) throw new HttpsError('failed-precondition', `لا يمكن نقل الطلب من ${current} إلى ${nextStatus}`);
    if (nextStatus === 'delivered') throw new HttpsError('permission-denied', 'تأكيد التسليم يتطلب رمز OTP من العميل');
    if (user.role === 'vendor_admin' && (before.vendor_id !== user.vendor_id || !['preparing', 'ready_for_pickup', 'cancelled'].includes(nextStatus))) throw new HttpsError('permission-denied', 'انتقال الحالة غير مسموح للتاجر');
    if (user.role === 'courier' && (before.courier_id !== uid || !['picked_up', 'on_the_way'].includes(nextStatus))) throw new HttpsError('permission-denied', 'انتقال الحالة غير مسموح للمندوب');
    if (user.role === 'super_admin' && nextStatus === 'delivered') throw new HttpsError('permission-denied', 'التسليم لا يتم من لوحة الإدارة');
    const changes = {status: nextStatus, updated_at: FieldValue.serverTimestamp(), status_changed_by: uid};
    if (prepMinutes !== null) changes.prep_minutes = prepMinutes;
    if (nextStatus === 'cancelled') {
      changes.cancelled_by = user.role === 'vendor_admin' ? 'vendor' : 'admin';
      changes.cancellation_reason = reason || 'بدون سبب';
    }
    if (nextStatus === 'ready_for_pickup') changes.ready_at = FieldValue.serverTimestamp();
    if (nextStatus === 'picked_up') changes.picked_up_at = FieldValue.serverTimestamp();
    if (nextStatus === 'on_the_way') changes.on_the_way_at = FieldValue.serverTimestamp();
    if (nextStatus === 'delivered') changes.delivered_at = FieldValue.serverTimestamp();
    if (nextStatus === 'cancelled' && !before.refund_processed) {
      const walletRefund = Math.max(0, Number(before.wallet_amount || 0));
      const pointsRefund = Math.max(0, Number(before.loyalty_points_used || 0));
      if (walletRefund || pointsRefund) {
        const customerRef = db.doc(`users/${before.customer_id}`);
        const customerSnap = await tx.get(customerRef);
        if (!customerSnap.exists) throw new HttpsError('failed-precondition', 'حساب العميل غير موجود لاسترداد الرصيد');
        tx.update(customerRef, {wallet_balance: FieldValue.increment(walletRefund), loyalty_points: FieldValue.increment(pointsRefund), updated_at: FieldValue.serverTimestamp()});
        if (walletRefund) tx.create(customerRef.collection('wallet_ledger').doc(`refund_${orderId}`), {label: `استرجاع الطلب ${orderId.slice(0, 6)}`, amount: walletRefund, unit: 'ل.س', direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
        if (pointsRefund) tx.create(customerRef.collection('loyalty_ledger').doc(`refund_${orderId}`), {label: 'استرجاع نقاط الطلب الملغى', points: pointsRefund, direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
      }
      if (before.coupon_code && before.coupon_applied === true) {
        const couponRef = db.doc(`coupons/${before.coupon_code}`);
        tx.update(couponRef, {used_count: FieldValue.increment(-1)});
        tx.delete(couponRef.collection('redemptions').doc(String(before.customer_id)));
      }
      changes.refund_processed = true;
    }
    tx.update(orderRef, changes);
    tx.create(eventRef, {from_status: current, to_status: nextStatus, actor_id: uid, actor_role: user.role, reason, created_at: FieldValue.serverTimestamp()});
    result = {order_id: orderId, from_status: current, status: nextStatus, event_id: eventRef.id};
  });
  return result;
});

exports.claimCourierOrder = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const uid = context.auth.uid;
  await requireRole(uid, ['courier']);
  const orderId = String(data?.order_id || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب');
  const orderRef = db.doc(`orders/${orderId}`); const courierRef = db.doc(`couriers/${uid}`); const walletRef = db.doc(`courier_wallets/${uid}`); const eventRef = orderRef.collection('events').doc();
  await db.runTransaction(async (tx) => {
    const [orderSnap, courierSnap, walletSnap] = await Promise.all([tx.get(orderRef), tx.get(courierRef), tx.get(walletRef)]);
    const order = orderSnap.data() || {}; const courier = courierSnap.data() || {}; const wallet = walletSnap.data() || {};
    if (!orderSnap.exists || !['pending', 'preparing', 'ready_for_pickup'].includes(order.status) || order.courier_id) throw new HttpsError('failed-precondition', 'الطلب لم يعد متاحاً للإسناد');
    if (courier.is_available !== true || courier.zone_id !== order.zone_id) throw new HttpsError('failed-precondition', 'المندوب غير متاح لهذه المنطقة');
    if (Number(wallet.debt || 0) >= Number(wallet.credit_limit || 0)) throw new HttpsError('failed-precondition', 'تجاوز المندوب حد الائتمان');
    tx.update(orderRef, {courier_id: uid, dispatch_status: 'accepted', dispatch_accepted_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
    tx.create(eventRef, {from_status: order.status, to_status: order.status, actor_id: uid, actor_role: 'courier', action: 'claim', created_at: FieldValue.serverTimestamp()});
  });
  return {order_id: orderId, courier_id: uid};
});

exports.completeDelivery = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const orderId = String(data?.order_id || ''); const otp = String(data?.otp || '').trim();
  if (!orderId || !/^\d{6}$/.test(otp)) throw new HttpsError('invalid-argument', 'رمز التسليم من ستة أرقام مطلوب');
  const orderRef = db.doc(`orders/${orderId}`); const secretRef = db.doc(`order_secrets/${orderId}`);
  const eventRef = orderRef.collection('events').doc();
  const otpHash = createHash('sha256').update(otp).digest('hex');
  const verification = await db.runTransaction(async (tx) => {
    const [orderSnap, secretSnap] = await Promise.all([tx.get(orderRef), tx.get(secretRef)]);
    const order = orderSnap.data(); const secret = secretSnap.data();
    if (!orderSnap.exists || order?.courier_id !== context.auth.uid || !['on_the_way', 'delivered'].includes(order.status)) throw new HttpsError('failed-precondition', 'الطلب غير جاهز للتسليم');
    if (!secretSnap.exists) return {verified: false, reason: 'invalid'};
    const failedAttempts = Number(secret.failed_attempts || 0);
    const lockedUntil = secret.locked_until?.toMillis?.() || 0;
    if (lockedUntil > Date.now()) return {verified: false, reason: 'locked'};
    if (secret.customer_id !== order.customer_id || otpHash !== secret.otp_hash) {
      const attempts = failedAttempts + 1;
      const patch = {failed_attempts: attempts, updated_at: FieldValue.serverTimestamp()};
      if (attempts >= 5) {
        patch.locked_until = new Date(Date.now() + 5 * 60 * 1000);
        patch.failed_attempts = 0;
      }
      tx.update(secretRef, patch);
      return {verified: false, reason: attempts >= 5 ? 'locked' : 'invalid'};
    }
    if (failedAttempts > 0 || lockedUntil) tx.update(secretRef, {failed_attempts: 0, locked_until: FieldValue.delete()});
    if (order.status === 'on_the_way') {
      tx.update(orderRef, {status: 'delivered', delivery_otp_verified: true, delivered_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), status_changed_by: context.auth.uid});
      tx.create(eventRef, {from_status: 'on_the_way', to_status: 'delivered', actor_id: context.auth.uid, actor_role: 'courier', reason: 'otp_verified', created_at: FieldValue.serverTimestamp()});
    }
    return {verified: true};
  });
  if (!verification.verified) {
    if (verification.reason === 'locked') throw new HttpsError('resource-exhausted', 'تم تجاوز عدد المحاولات المسموح، انتظر قليلاً وحاول مجدداً');
    throw new HttpsError('permission-denied', 'رمز التسليم غير صحيح');
  }
  return {order_id: orderId, status: 'delivered'};
});

exports.cancelOrder = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const orderId = String(data?.order_id || '').trim();
  const reason = String(data?.reason || '').trim().slice(0, 200);
  if (!orderId) throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب');
  const orderRef = db.doc(`orders/${orderId}`);
  const userRef = db.doc(`users/${context.auth.uid}`);
  const eventRef = orderRef.collection('events').doc();
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
    const order = orderSnap.data() || {};
    if (order.customer_id !== context.auth.uid || order.status !== 'pending') throw new HttpsError('failed-precondition', 'لا يمكن إلغاء الطلب في حالته الحالية');
    const walletRefund = Math.max(0, Number(order.wallet_amount || 0));
    const pointsRefund = Math.max(0, Number(order.loyalty_points_used || 0));
    tx.update(orderRef, {status: 'cancelled', cancelled_by: 'customer', cancellation_reason: reason || 'إلغاء من العميل', wallet_refunded: walletRefund, loyalty_points_refunded: pointsRefund, updated_at: FieldValue.serverTimestamp()});
    if (walletRefund || pointsRefund) {
      tx.update(userRef, {wallet_balance: FieldValue.increment(walletRefund), loyalty_points: FieldValue.increment(pointsRefund), updated_at: FieldValue.serverTimestamp()});
      if (walletRefund) tx.create(userRef.collection('wallet_ledger').doc(`refund_${orderId}`), {label: `استرجاع الطلب ${orderId.slice(0, 6)}`, amount: walletRefund, unit: 'ل.س', direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
      if (pointsRefund) tx.create(userRef.collection('loyalty_ledger').doc(`refund_${orderId}`), {label: 'استرجاع نقاط الطلب الملغى', points: pointsRefund, direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
    }
    if (order.coupon_code && order.coupon_applied === true) {
      const couponRef = db.doc(`coupons/${order.coupon_code}`);
      const redemptionRef = couponRef.collection('redemptions').doc(context.auth.uid);
      tx.update(couponRef, {used_count: FieldValue.increment(-1)});
      tx.delete(redemptionRef);
    }
    tx.create(eventRef, {from_status: 'pending', to_status: 'cancelled', actor_id: context.auth.uid, actor_role: 'customer', reason, refund_wallet: walletRefund, refund_points: pointsRefund, created_at: FieldValue.serverTimestamp()});
  });
  return {order_id: orderId, status: 'cancelled'};
});

exports.createErrand = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const pickup = data?.pickup_address; const dropoff = data?.dropoff_address;
  const description = String(data?.description || '').trim(); const deliveryFee = Number(data?.delivery_fee);
  if (!pickup?.label || !dropoff?.label || !description || description.length > 500 || !Number.isFinite(deliveryFee) || deliveryFee < 0 || deliveryFee > 100000000) throw new HttpsError('invalid-argument', 'بيانات الأمانة أو الرسم غير صالحة');
  const orderRef = db.collection('orders').doc(); const secretRef = db.doc(`order_secrets/${orderRef.id}`); const otp = String(randomInt(100000, 1000000));
  await db.runTransaction(async (tx) => {
    tx.create(orderRef, {customer_id: context.auth.uid, vendor_id: null, courier_id: null, zone_id: null, fulfillment_type: 'errand', pickup_address: {label: String(pickup.label).slice(0, 300)}, delivery_address: {label: String(dropoff.label).slice(0, 300)}, errand_description: description, subtotal: 0, delivery_fee: deliveryFee, total: deliveryFee, cash_due: deliveryFee, payment_method: 'cash_on_delivery', payment_status: 'unpaid', status: 'pending', created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), synced: true});
    tx.create(secretRef, {customer_id: context.auth.uid, otp, otp_hash: createHash('sha256').update(otp).digest('hex'), created_at: FieldValue.serverTimestamp()});
  });
  return {order_id: orderRef.id};
});

exports.changeToWallet = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  await requireRole(context.auth.uid, ['courier']);
  const orderId = String(data?.order_id || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'رقم الطلب مطلوب');
  const orderRef = db.doc(`orders/${orderId}`);
  let amount = 0;
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef); if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
    const order = orderSnap.data() || {};
    if (order.courier_id !== context.auth.uid || order.status !== 'delivered' || !['cash_on_delivery', 'hybrid'].includes(order.payment_method)) throw new HttpsError('failed-precondition', 'لا يمكن تحويل الفكة إلا بعد تسليم طلب نقدي');
    const cashDue = money(Number(order.cash_due || 0));
    amount = money(Number(order.cash_change_for || 0) - cashDue);
    if (!Number.isFinite(amount) || amount <= 0 || order.change_to_wallet_amount) throw new HttpsError('failed-precondition', 'لا توجد فكة قابلة للتحويل أو تم تحويلها سابقًا');
    const customerId = String(order.customer_id || ''); const userRef = db.doc(`users/${customerId}`); const ledgerRef = userRef.collection('wallet_ledger').doc(`change_${orderId}`);
    tx.update(orderRef, {change_to_wallet_amount: amount, change_to_wallet_by: context.auth.uid, updated_at: FieldValue.serverTimestamp()});
    tx.update(userRef, {wallet_balance: FieldValue.increment(amount), updated_at: FieldValue.serverTimestamp()});
    tx.create(ledgerRef, {label: `فكة الطلب ${orderId.slice(0, 6)}`, amount, unit: 'ل.س', direction: 'credit', order_id: orderId, created_at: FieldValue.serverTimestamp()});
  });
  return {order_id: orderId, amount, status: 'completed'};
});

exports.topUpWallet = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const method = String(data?.method || '');
  const reference = String(data?.reference || '').trim();
  if (!['voucher', 'local_transfer', 'change_to_wallet'].includes(method) || !reference) throw new HttpsError('invalid-argument', 'طريقة الشحن والمرجع مطلوبان');
  const uid = context.auth.uid;
  if (method === 'voucher') {
    const voucherRef = db.doc('wallet_vouchers/' + reference.toUpperCase());
    const userRef = db.doc('users/' + uid);
    await db.runTransaction(async (tx) => {
      const [voucher, user] = await Promise.all([tx.get(voucherRef), tx.get(userRef)]);
      if (!voucher.exists || voucher.data()?.used === true || Number(voucher.data()?.amount || 0) <= 0 || !user.exists) throw new HttpsError('failed-precondition', 'كود الشحن غير صالح أو مستخدم');
      const amount = Number(voucher.data().amount);
      tx.update(userRef, {wallet_balance: FieldValue.increment(Number(voucher.data().amount)), updated_at: FieldValue.serverTimestamp()});
      tx.update(voucherRef, {used: true, used_by: uid, used_at: FieldValue.serverTimestamp()});
      tx.create(userRef.collection('wallet_ledger').doc(), {label: 'شحن عبر كود', amount, unit: 'ل.س', direction: 'credit', created_at: FieldValue.serverTimestamp()});
    });
    return {status: 'completed'};
  }
  await db.collection('wallet_topups').add({customer_id: uid, method, reference, status: 'pending', created_at: FieldValue.serverTimestamp()});
  return {status: 'pending'};
});

exports.createOrder = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const customerId = context.auth.uid;
  const vendorId = String(data?.vendor_id || '');
  const zoneId = String(data?.zone_id || '');
  const address = data?.delivery_address;
  const rawItems = Array.isArray(data?.items) ? data.items : [];
  const idempotencyKey = String(data?.idempotency_key || '').trim();
  if (!vendorId || !zoneId || !address || rawItems.length === 0 || rawItems.length > 50) {
    throw new HttpsError('invalid-argument', 'بيانات الطلب غير مكتملة أو عدد الأصناف غير صالح');
  }
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) throw new HttpsError('invalid-argument', 'معرف الطلب المكرر غير صالح');

  const rateRef = db.doc(`order_rate_limits/${customerId}`);
  const vendorRef = db.doc(`vendors/${vendorId}`);
  const zoneRef = db.doc(`zones/${zoneId}`);
  const userRef = db.doc(`users/${customerId}`);
  const productRefs = rawItems.map((item) => vendorRef.collection('products').doc(String(item.product_id || '')));
  const couponCode = String(data?.coupon_code || '').trim().toUpperCase();
  const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;
  const paymentMethod = String(data?.payment_method || 'cash_on_delivery');
  const requestedWallet = Number(data?.wallet_amount || 0);
  const requestedPoints = Number(data?.loyalty_points || 0);
  const cashChangeFor = Number(data?.cash_change_for || 0);
  if (!['cash_on_delivery', 'wallet', 'hybrid'].includes(paymentMethod)) throw new HttpsError('invalid-argument', 'طريقة الدفع غير مدعومة');
  if (![requestedWallet, requestedPoints, cashChangeFor].every((value) => Number.isFinite(value) && value >= 0)) throw new HttpsError('invalid-argument', 'قيم الدفع يجب أن تكون أرقامًا موجبة');
  if (paymentMethod === 'wallet' && cashChangeFor !== 0) throw new HttpsError('invalid-argument', 'الفكة النقدية متاحة فقط للطلبات النقدية');
  const requestFingerprint = createHash('sha256').update(JSON.stringify({vendorId, zoneId, rawItems, address, couponCode, paymentMethod, requestedWallet, requestedPoints, cashChangeFor})).digest('hex');
  const idempotencyRef = db.doc(`order_idempotency/${customerId}_${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`);
  const orderRef = db.collection('orders').doc(); const secretRef = db.doc(`order_secrets/${orderRef.id}`); const deliveryOtp = String(randomInt(100000, 1000000));

  const result = await db.runTransaction(async (tx) => {
    const now = Date.now();
    const configRef = db.doc('system_config/main'); const [idempotencySnap, rateSnap, vendorSnap, zoneSnap, userSnap, configSnap, ...productSnaps] = await Promise.all([
      tx.get(idempotencyRef), tx.get(rateRef), tx.get(vendorRef), tx.get(zoneRef), tx.get(userRef), tx.get(configRef), ...productRefs.map((ref) => tx.get(ref)),
    ]);
    if (idempotencySnap.exists) {
      const previous = idempotencySnap.data() || {};
      if (previous.fingerprint !== requestFingerprint) throw new HttpsError('already-exists', 'معرف الطلب مستخدم مع بيانات مختلفة');
      return {order_id: String(previous.order_id), replayed: true};
    }
    if (!vendorSnap.exists || vendorSnap.data()?.is_active !== true) throw new HttpsError('failed-precondition', 'المزود غير متاح');
    if (vendorSnap.data()?.zone_id !== zoneId || vendorSnap.data()?.is_busy === true) throw new HttpsError('failed-precondition', 'المزود مشغول أو خارج المنطقة');
    if (!zoneSnap.exists || zoneSnap.data()?.is_accepting_orders === false) throw new HttpsError('failed-precondition', 'التوصيل متوقف مؤقتاً');
    const windowStart = Number(rateSnap.data()?.window_start || 0);
    const count = Number(rateSnap.data()?.count || 0);
    if (now - windowStart < 60 * 1000 && count >= 5) throw new HttpsError('resource-exhausted', 'تجاوزت حد إنشاء الطلبات مؤقتاً');

    let subtotal = 0;
    const items = rawItems.map((item, index) => {
      const product = productSnaps[index].data();
      const quantity = Number(item.quantity === undefined ? 1 : item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new HttpsError('invalid-argument', 'كمية الصنف غير صالحة');
      if (!productSnaps[index].exists || product?.is_available === false) throw new HttpsError('failed-precondition', 'أحد الأصناف لم يعد متاحاً');
      const selected = Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [];
      const allowed = Array.isArray(product.modifiers) ? product.modifiers : [];
      let modifierTotal = 0;
      const modifiers = selected.map((chosen) => {
        const match = allowed.find((m) => String(m.name) === String(chosen.name));
        if (!match) throw new HttpsError('invalid-argument', 'إضافة غير صالحة');
        modifierTotal += Number(match.price || 0);
        return {name: String(match.name), price: Number(match.price || 0)};
      });
      const unitPrice = Number(product.price || 0) + modifierTotal;
      subtotal += unitPrice * quantity;
      return {product_id: productSnaps[index].id, name: String(product.name || ''), price: unitPrice, quantity, selected_modifiers: modifiers};
    });

    const config = configSnap.data() || {}; const zoneMultiplier = Number(zoneSnap.data()?.surge_multiplier || 1); const globalMultiplier = config.surge_enabled === true ? Number(config.surge_multiplier || 1) : 1; const freeDelivery = Array.isArray(config.free_delivery_vendor_ids) && config.free_delivery_vendor_ids.includes(vendorId); const deliveryFee = freeDelivery ? 0 : Number(zoneSnap.data()?.delivery_fee_base || config.default_delivery_fee || 0) * zoneMultiplier * globalMultiplier;
    let discount = 0;
    if (couponRef) {
      const couponSnap = await tx.get(couponRef);
      const coupon = couponSnap.data();
      const redemptionRef = couponRef.collection('redemptions').doc(customerId);
      const customerRedemption = await tx.get(redemptionRef);
      const expires = coupon?.expires_at?.toMillis?.() || null;
      if (couponSnap.exists && coupon.is_active === true && (!expires || expires > now) && subtotal >= Number(coupon.min_order_amount || 0) && (!coupon.usage_limit_total || Number(coupon.used_count || 0) < Number(coupon.usage_limit_total)) && (!coupon.usage_limit_per_customer || !customerRedemption.exists) && (!coupon.restricted_to_customer || coupon.restricted_to_customer === customerId)) {
        discount = couponDiscount(coupon, subtotal, deliveryFee);
        tx.set(redemptionRef, {customer_id: customerId, order_id: orderRef.id, discount_amount: discount, redeemed_at: FieldValue.serverTimestamp()});
        tx.update(couponRef, {used_count: FieldValue.increment(1)});
      }
    }
    const userData = userSnap.data() || {};
    const totalBeforePayment = Math.max(0, subtotal + deliveryFee - discount);
    const walletBalance = Number(userData.wallet_balance || 0);
    const loyaltyBalance = Number(userData.loyalty_points || 0);
    const pointValue = Number(config.loyalty_point_value || 0);
    const pointsDiscount = Math.min(totalBeforePayment, requestedPoints * pointValue);
    const walletUsed = paymentMethod === 'cash_on_delivery' ? 0 : Math.min(totalBeforePayment - pointsDiscount, requestedWallet, walletBalance);
    if (paymentMethod === 'wallet' && walletUsed < totalBeforePayment) throw new HttpsError('failed-precondition', 'رصيد المحفظة غير كاف');
    if (requestedPoints > loyaltyBalance) throw new HttpsError('failed-precondition', 'نقاط الولاء غير كافية');
    const cashDue = Math.max(0, totalBeforePayment - walletUsed - pointsDiscount);
    if (cashChangeFor > 0 && cashChangeFor < cashDue) throw new HttpsError('invalid-argument', 'الفئة النقدية يجب أن تكون أكبر أو تساوي المبلغ المطلوب');
    if (cashDue === 0 && cashChangeFor > 0) throw new HttpsError('invalid-argument', 'لا توجد فكة مطلوبة عند عدم وجود مبلغ نقدي');
    tx.set(rateRef, {window_start: windowStart && now - windowStart < 60 * 1000 ? windowStart : now, count: windowStart && now - windowStart < 60 * 1000 ? count + 1 : 1, updated_at: FieldValue.serverTimestamp()}, {merge: true});
    tx.create(orderRef, {
      customer_id: customerId, vendor_id: vendorId, zone_id: zoneId, items, subtotal, delivery_fee: deliveryFee,
      coupon_code: discount > 0 ? couponCode : null, coupon_applied: discount > 0, discount_amount: discount, loyalty_discount_redeemed: pointsDiscount, total: totalBeforePayment,
      idempotency_key: idempotencyKey,
      status: 'pending', courier_id: null, fulfillment_type: 'delivery', payment_method: paymentMethod, payment_status: cashDue === 0 ? 'paid' : 'unpaid', wallet_amount: walletUsed, loyalty_points_used: requestedPoints, cash_due: cashDue, cash_change_for: cashChangeFor,
      delivery_address: {...address}, landmark: String(address.landmark || ''), emergency_mode_seen: userData.emergency_mode_seen || false, loyalty_points_earned: 0,
      created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), synced: true, free_delivery_applied: freeDelivery,
    });
    if (walletUsed > 0 || requestedPoints > 0) {
      tx.update(userRef, {wallet_balance: FieldValue.increment(-walletUsed), loyalty_points: FieldValue.increment(-requestedPoints), updated_at: FieldValue.serverTimestamp()});
      if (walletUsed > 0) tx.create(userRef.collection('wallet_ledger').doc(), {label: 'دفع الطلب ' + orderRef.id.slice(0, 6), amount: walletUsed, unit: 'ل.س', direction: 'debit', order_id: orderRef.id, created_at: FieldValue.serverTimestamp()});
      if (requestedPoints > 0) tx.create(userRef.collection('loyalty_ledger').doc(orderRef.id), {label: 'استبدال نقاط للطلب', points: requestedPoints, direction: 'debit', created_at: FieldValue.serverTimestamp()});
    }
    tx.create(secretRef, {customer_id: customerId, otp: deliveryOtp, otp_hash: createHash('sha256').update(deliveryOtp).digest('hex'), created_at: FieldValue.serverTimestamp()});
    tx.create(idempotencyRef, {customer_id: customerId, fingerprint: requestFingerprint, order_id: orderRef.id, created_at: FieldValue.serverTimestamp()});
    return {order_id: orderRef.id};
  });
  return result;
});

exports.overrideDispatch = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const adminUser = await db.doc(`users/${context.auth.uid}`).get();
  if (adminUser.data()?.role !== 'super_admin') throw new HttpsError('permission-denied', 'هذه العملية متاحة للأدمن فقط');
  const orderId = String(data?.order_id || ''); const courierId = String(data?.courier_id || '');
  if (!orderId || !courierId) throw new HttpsError('invalid-argument', 'الطلب والمندوب مطلوبان');
  const orderRef = db.doc(`orders/${orderId}`); const courierRef = db.doc(`couriers/${courierId}`); const eventRef = orderRef.collection('events').doc();
  await db.runTransaction(async (tx) => {
    const [orderSnap, courierSnap] = await Promise.all([tx.get(orderRef), tx.get(courierRef)]);
    const order = orderSnap.data() || {};
    if (!orderSnap.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
    if (!courierSnap.exists || courierSnap.data()?.is_available !== true || courierSnap.data()?.zone_id !== order.zone_id) throw new HttpsError('failed-precondition', 'المندوب غير متاح لهذه المنطقة');
    if (!['pending', 'preparing', 'ready_for_pickup'].includes(order.status) || ['delivered', 'cancelled'].includes(order.status)) throw new HttpsError('failed-precondition', 'لا يمكن إسناد الطلب في حالته الحالية');
    tx.update(orderRef, {courier_id: courierId, dispatch_status: 'manually_assigned', dispatch_overridden_by: context.auth.uid, dispatch_overridden_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
    tx.create(eventRef, {from_status: order.status, to_status: order.status, actor_id: context.auth.uid, actor_role: 'super_admin', action: 'manual_dispatch', courier_id: courierId, created_at: FieldValue.serverTimestamp()});
  });
  await notifyUser(courierId, 'تم إسناد طلب إليك', `طلب جديد #${orderId.slice(0, 6)}`, {order_id: orderId});
  return {order_id: orderId, courier_id: courierId};
});

exports.initializeCustomerReferral = onDocumentCreated('users/{uid}', async (event) => {
  const snap = event.data; if (!snap || snap.data()?.role !== 'customer') return;
  const code = String(event.params.uid).slice(0, 6).toUpperCase();
  await snap.ref.set({referral_code: code, referral_rewarded: false, wallet_balance: 0, loyalty_points: 0, updated_at: FieldValue.serverTimestamp()}, {merge: true});
});

async function notifyUser(uid, title, body, data = {}) {
  if (!uid) return;
  const snap = await db.doc(`users/${uid}`).get();
  const token = snap.data()?.fcm_token;
  if (token) {
    try {
      await getMessaging().send({token, notification: {title, body}, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))});
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') await snap.ref.update({fcm_token: FieldValue.delete()});
      console.warn(`Notification failed for ${uid}: ${error.code || error.message}`);
    }
  }
}

async function writeAudit(target, before, after) {
  await db.collection('audit_logs').add({target, action: before ? (after ? 'update' : 'delete') : 'create', actor_id: after?.updated_by || after?.created_by || before?.updated_by || before?.created_by || null, details: {before: before || null, after: after || null}, created_at: FieldValue.serverTimestamp()});
}

exports.auditVendorChanges = onDocumentWritten('vendors/{vendorId}', async (event) => writeAudit(`vendors/${event.params.vendorId}`, event.data?.before?.data(), event.data?.after?.data()));
exports.auditCourierChanges = onDocumentWritten('couriers/{courierId}', async (event) => writeAudit(`couriers/${event.params.courierId}`, event.data?.before?.data(), event.data?.after?.data()));
// The admin dashboard writes privately to `vendors`; customers receive only a
// small public-safe projection, kept in sync for every create/update/delete.
exports.syncPublicVendor = onDocumentWritten('vendors/{vendorId}', async (event) => {
  const publicRef = db.doc(`public_vendors/${event.params.vendorId}`);
  if (!event.data?.after.exists) return publicRef.delete();
  return publicRef.set(publicVendorProjection(event.data.after.data()));
});

exports.calculateOrderCommission = onDocumentCreated('orders/{orderId}', async (event) => {
  const snap = event.data; if (!snap) return;
  const order = snap.data();
  // createOrder is the single source of truth for coupon validation and totals.
  // Re-reading the coupon here could overwrite a valid discount after used_count changed.
  const discount = Math.max(0, Number(order.discount_amount || 0));
  const vendor = await db.doc(`vendors/${order.vendor_id}`).get(); const rate = Number(vendor.data()?.commission_rate || 0); const commission = Math.round(Number(order.subtotal || 0) * rate / 100 * 100) / 100;
  const etaMinutes = Math.max(10, Number(order.prep_minutes || 20) + 15);
  await snap.ref.update({commission, discount_amount: discount, total: Number(order.total || Math.max(0, Number(order.subtotal || 0) + Number(order.delivery_fee || 0) - discount)), eta_minutes: etaMinutes, synced: true, updated_at: FieldValue.serverTimestamp()});
});

exports.dispatchPendingOrder = onDocumentCreated('orders/{orderId}', async (event) => {
  const snap = event.data; if (!snap) return; const order = snap.data(); if (order.fulfillment_type === 'pickup') return;
  const candidates = await db.collection('couriers').where('zone_id', '==', order.zone_id).where('is_available', '==', true).limit(50).get(); if (candidates.empty) return;
  const vendor = (await db.doc(`vendors/${order.vendor_id}`).get()).data() || {};
  const vendorPoint = vendor.location;
  const distance = (a, b) => {
    if (!a || !b) return Number.MAX_SAFE_INTEGER; const lat = (a.latitude - b.latitude) * Math.PI / 180; const lng = (a.longitude - b.longitude) * Math.PI / 180; const x = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(lng / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const courier = candidates.docs.sort((left, right) => distance(left.data().current_location, vendorPoint) - distance(right.data().current_location, vendorPoint))[0];
  await snap.ref.update({dispatch_candidates: [courier.id], dispatch_status: 'offered', dispatch_distance_km: distance(courier.data().current_location, vendorPoint), updated_at: FieldValue.serverTimestamp()}); await notifyUser(courier.id, 'طلب توصيل جديد', 'يوجد طلب جديد قريب من منطقتك', {order_id: event.params.orderId});
});

exports.notifyOrderChange = onDocumentWritten('orders/{orderId}', async (event) => {
  const before = event.data?.before?.data() || {}; const after = event.data?.after?.data(); if (!after) return; const statusChanged = before.status !== after.status;
  if (statusChanged && after.status === 'cancelled') {
    const compensation = ['picked_up', 'on_the_way'].includes(before.status); await event.data.after.ref.update({commission: 0, commission_voided: true, ...(compensation ? {courier_compensation_due: true} : {}), updated_at: FieldValue.serverTimestamp()});
  }
  const body = `حالة طلبك: ${after.status}`; await notifyUser(after.customer_id, 'تحديث الطلب', body, {order_id: event.params.orderId}); await notifyUser(after.courier_id, 'تحديث مهمة التوصيل', body, {order_id: event.params.orderId});
  if (after.vendor_id) {
    const admin = await db.collection('users').where('vendor_id', '==', after.vendor_id).where('role', '==', 'vendor_admin').limit(1).get(); if (!admin.empty) await notifyUser(admin.docs[0].id, 'تحديث طلب المتجر', body, {order_id: event.params.orderId});
  }
  if (statusChanged && after.status === 'delivered' && after.courier_id) {
    const earnings = Math.max(0, Number(after.delivery_fee || 0)); const debt = Math.max(0, Number(after.subtotal || 0)); const walletRef = db.doc(`courier_wallets/${after.courier_id}`); const eventRef = walletRef.collection('ledger').doc(event.params.orderId); await db.runTransaction(async (tx) => {
      const existing = await tx.get(eventRef); if (existing.exists) return; tx.set(walletRef, {debt: FieldValue.increment(debt), total_earnings: FieldValue.increment(earnings), balance: FieldValue.increment(earnings), updated_at: FieldValue.serverTimestamp()}, {merge: true}); tx.create(eventRef, {type: 'delivery', order_id: event.params.orderId, debt, earnings, created_at: FieldValue.serverTimestamp()});
    }); const customerRef = db.doc(`users/${after.customer_id}`); const loyaltyRef = customerRef.collection('loyalty_ledger').doc(event.params.orderId); await db.runTransaction(async (tx) => {
      const existing = await tx.get(loyaltyRef); if (existing.exists) return; const points = Math.floor(Number(after.subtotal || 0) / 1000 * Number((await db.doc('system_config/main').get()).data()?.loyalty_points_rate || 0)); tx.set(customerRef, {loyalty_points: FieldValue.increment(points), updated_at: FieldValue.serverTimestamp()}, {merge: true}); tx.create(loyaltyRef, {points, order_id: event.params.orderId, created_at: FieldValue.serverTimestamp()});
    });
  }
  if (statusChanged && after.status === 'delivered' && after.customer_id) {
    const userRef = db.doc(`users/${after.customer_id}`); const userSnap = await userRef.get(); const user = userSnap.data() || {}; const completed = await db.collection('orders').where('customer_id', '==', after.customer_id).where('status', '==', 'delivered').limit(2).get(); if (completed.size === 1 && user.referred_by && !user.referral_rewarded) {
      const code = `REF${event.params.orderId.slice(0, 7).toUpperCase()}`; await db.doc(`coupons/${code}`).set({type: 'free_delivery', value: 0, min_order_amount: 0, expires_at: null, usage_limit_total: 1, usage_limit_per_customer: 1, used_count: 0, is_active: true, source: 'referral_reward', restricted_to_customer: user.referred_by, created_at: FieldValue.serverTimestamp()}); await userRef.update({referral_rewarded: true}); await notifyUser(user.referred_by, 'مكافأة إحالة', `حصلت على كوبون توصيل مجاني: ${code}`, {coupon_code: code});
    }
  }
});

exports.notifyNewChatMessage = onDocumentCreated('chats/{orderId}/messages/{messageId}', async (event) => {
  const message = event.data?.data(); if (!message) return; const order = (await db.doc(`orders/${event.params.orderId}`).get()).data() || {}; const recipient = message.sender_id === order.customer_id ? order.courier_id : order.customer_id; await notifyUser(recipient, 'رسالة جديدة', message.text || 'لديك رسالة جديدة', {order_id: event.params.orderId});
});
