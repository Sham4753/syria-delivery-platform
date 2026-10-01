const express = require('express');
const {createHash, randomUUID} = require('node:crypto');
const {logError, logWarn, logInfo} = require('./logger');
const cors = require('cors');
const helmet = require('helmet');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const {safeReference} = require('./domain');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const app = express();
app.use(helmet());
app.use(cors({origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true}));
app.use(express.json({limit: '256kb'}));
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id')?.slice(0, 80) || randomUUID();
  res.set('x-request-id', req.requestId);
  const started = Date.now();
  res.on('finish', () => logInfo('http_request', {request_id: req.requestId, method: req.method, path: req.path, status: res.statusCode, duration_ms: Date.now() - started}));
  next();
});

const attempts = new Map();
function rateLimit(key, max = 10, windowMs = 60_000) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.expiresAt <= now) { attempts.set(key, {count: 1, expiresAt: now + windowMs}); return true; }
  record.count += 1;
  return record.count <= max;
}

async function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({error: 'unauthenticated'});
  try { req.user = await auth.verifyIdToken(header.slice(7)); next(); }
  catch (error) { logWarn('invalid_token', {request_id: req.requestId, code: error.code || 'invalid_token'}); return res.status(401).json({error: 'invalid_token', request_id: req.requestId}); }
}

function fail(res, status, message) { return res.status(status).json({error: message, request_id: res.get('x-request-id')}); }

app.get('/health', (_req, res) => res.json({ok: true, service: 'syria-delivery-private-server', time: new Date().toISOString()}));

app.post('/v1/call/topUpWallet', requireUser, async (req, res) => {
  const method = String(req.body?.method || '');
  const reference = method === 'voucher' ? safeReference(req.body?.reference) : String(req.body?.reference || '').trim().slice(0, 120);
  if (!['voucher', 'local_transfer', 'change_to_wallet'].includes(method) || !reference) return fail(res, 400, 'طريقة الشحن والمرجع مطلوبان');
  if (!rateLimit(`wallet:${req.user.uid}`, 5)) return fail(res, 429, 'محاولات كثيرة، حاول لاحقاً');
  try {
    if (method === 'voucher') {
      const voucherRef = db.doc(`wallet_vouchers/${reference}`); const userRef = db.doc(`users/${req.user.uid}`);
      await db.runTransaction(async (tx) => {
        const [voucher, user] = await Promise.all([tx.get(voucherRef), tx.get(userRef)]);
        const amount = Number(voucher.data()?.amount || 0);
        if (!voucher.exists || voucher.data()?.used === true || amount <= 0 || !user.exists) throw new Error('invalid_voucher');
        tx.update(userRef, {wallet_balance: FieldValue.increment(amount), updated_at: FieldValue.serverTimestamp()});
        tx.update(voucherRef, {used: true, used_by: req.user.uid, used_at: FieldValue.serverTimestamp()});
        tx.create(userRef.collection('wallet_ledger').doc(), {label: 'شحن عبر كود', amount, unit: 'ل.س', direction: 'credit', created_at: FieldValue.serverTimestamp()});
      });
      return res.json({status: 'completed'});
    }
    await db.collection('wallet_topups').add({customer_id: req.user.uid, method, reference, status: 'pending', created_at: FieldValue.serverTimestamp()});
    return res.json({status: 'pending'});
  } catch (error) { return fail(res, error.message === 'invalid_voucher' ? 412 : 500, error.message === 'invalid_voucher' ? 'كود الشحن غير صالح أو مستخدم' : 'تعذر تنفيذ الشحن'); }
});

app.post('/v1/call/claimCourierOrder', requireUser, async (req, res) => {
  const orderId = String(req.body?.order_id || '').trim();
  if (!orderId || !rateLimit(`claim:${req.user.uid}`, 30)) return fail(res, 400, 'رقم الطلب غير صالح');
  const orderRef = db.doc(`orders/${orderId}`); const courierRef = db.doc(`couriers/${req.user.uid}`); const offerRef = db.doc(`dispatch_offers/${orderId}_${req.user.uid}`);
  try {
    await db.runTransaction(async (tx) => {
      const [orderSnap, courierSnap, offerSnap] = await Promise.all([tx.get(orderRef), tx.get(courierRef), tx.get(offerRef)]);
      const order = orderSnap.data() || {}; const courier = courierSnap.data() || {};
      if (!orderSnap.exists || order.courier_id || !['pending', 'preparing', 'ready_for_pickup'].includes(order.status)) throw new Error('order_unavailable');
      if (courier.is_available !== true || courier.zone_id !== order.zone_id) throw new Error('courier_unavailable');
      if (order.dispatch_candidates?.length && !order.dispatch_candidates.includes(req.user.uid)) throw new Error('not_candidate');
      if (offerSnap.exists && offerSnap.data()?.status === 'offered') tx.update(offerRef, {status: 'accepted', responded_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()});
      tx.update(orderRef, {courier_id: req.user.uid, dispatch_status: 'accepted', dispatch_expires_at: null, updated_at: FieldValue.serverTimestamp()});
    });
    return res.json({order_id: orderId, courier_id: req.user.uid});
  } catch (error) { return fail(res, 412, error.message === 'not_candidate' ? 'لم يتم عرض هذا الطلب على المندوب' : 'الطلب لم يعد متاحاً للإسناد'); }
});

app.post('/v1/call/rejectCourierOrder', requireUser, async (req, res) => {
  const orderId = String(req.body?.order_id || '').trim();
  if (!orderId) return fail(res, 400, 'رقم الطلب مطلوب');
  const offerRef = db.doc(`dispatch_offers/${orderId}_${req.user.uid}`); const orderRef = db.doc(`orders/${orderId}`);
  try { await db.runTransaction(async (tx) => { const [offer, order] = await Promise.all([tx.get(offerRef), tx.get(orderRef)]); if (!offer.exists || offer.data()?.status !== 'offered' || !order.exists) throw new Error('invalid_offer'); tx.update(offerRef, {status: 'rejected', rejection_reason: String(req.body?.reason || 'رفض المندوب').slice(0, 200), responded_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()}); tx.update(orderRef, {dispatch_status: 'requeue', updated_at: FieldValue.serverTimestamp()}); }); return res.json({order_id: orderId, status: 'requeued'}); }
  catch (_) { return fail(res, 412, 'عرض الإسناد غير صالح أو منتهٍ'); }
});

app.post('/v1/call/completeDelivery', requireUser, async (req, res) => {
  const orderId = String(req.body?.order_id || '').trim(); const otp = String(req.body?.otp || '').trim();
  if (!orderId || !/^\d{6}$/.test(otp)) return fail(res, 400, 'رمز التسليم من ستة أرقام مطلوب');
  const orderRef = db.doc(`orders/${orderId}`); const secretRef = db.doc(`order_secrets/${orderId}`);
  try {
    const result = await db.runTransaction(async (tx) => {
      const [orderSnap, secretSnap] = await Promise.all([tx.get(orderRef), tx.get(secretRef)]);
      const order = orderSnap.data() || {}; const secret = secretSnap.data() || {};
      if (!orderSnap.exists || order.courier_id !== req.user.uid || !['on_the_way', 'delivered'].includes(order.status)) throw new Error('order_unavailable');
      if (!secretSnap.exists) throw new Error('invalid_otp');
      const lockedUntil = secret.locked_until?.toMillis?.() || 0;
      if (lockedUntil > Date.now()) throw new Error('otp_locked');
      if (createHash('sha256').update(otp).digest('hex') !== secret.otp_hash) {
        const attempts = Number(secret.failed_attempts || 0) + 1;
        tx.update(secretRef, {failed_attempts: attempts >= 5 ? 0 : attempts, ...(attempts >= 5 ? {locked_until: new Date(Date.now() + 5 * 60 * 1000)} : {}), updated_at: FieldValue.serverTimestamp()});
        throw new Error(attempts >= 5 ? 'otp_locked' : 'invalid_otp');
      }
      if (order.status === 'on_the_way') tx.update(orderRef, {status: 'delivered', delivery_otp_verified: true, delivered_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), status_changed_by: req.user.uid});
      tx.update(secretRef, {failed_attempts: 0, locked_until: FieldValue.delete(), updated_at: FieldValue.serverTimestamp()});
      return {order_id: orderId, status: 'delivered'};
    });
    return res.json(result);
  } catch (error) { return fail(res, error.message === 'otp_locked' ? 429 : 412, error.message === 'otp_locked' ? 'تم تجاوز عدد المحاولات المسموح، انتظر قليلاً' : 'رمز التسليم غير صحيح أو الطلب غير جاهز'); }
});

app.use((error, req, res, _next) => { logError('http_unhandled_error', error, {request_id: req.requestId, method: req.method, path: req.path}); res.status(500).json({error: 'internal', request_id: req.requestId}); });

async function requeueWaitingOrders() {
  const snapshot = await db.collection('orders').where('dispatch_status', 'in', ['waiting_for_courier', 'requeue']).limit(100).get();
  for (const doc of snapshot.docs) await doc.ref.set({dispatch_status: 'requeue', dispatch_retry_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()}, {merge: true});
}
const interval = Number(process.env.DISPATCH_INTERVAL_MS || 60000);
const timer = setInterval(() => requeueWaitingOrders().catch((error) => logError('dispatch_scheduler_failed', error)), interval);
timer.unref();

if (require.main === module) app.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0', () => logInfo('server_started', {host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 8080)}));
module.exports = {app, requeueWaitingOrders};
