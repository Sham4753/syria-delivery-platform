const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'functions/index.js');
let source = fs.readFileSync(file, 'utf8');
const marker = "exports.createOrder = onCall(async (data, context) => {";
const walletFn = `exports.topUpWallet = onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  const method = String(data?.method || '');
  const reference = String(data?.reference || '').trim();
  if (!['voucher', 'local_transfer', 'change_to_wallet'].includes(method) || !reference) throw new HttpsError('invalid-argument', 'طريقة الشحن والمرجع مطلوبان');
  const uid = context.auth.uid;
  if (method === 'voucher') {
    const voucherRef = db.doc('wallet_vouchers/' + reference.toUpperCase());
    const voucher = await voucherRef.get();
    if (!voucher.exists || voucher.data()?.used === true || Number(voucher.data()?.amount || 0) <= 0) throw new HttpsError('failed-precondition', 'كود الشحن غير صالح أو مستخدم');
    const userRef = db.doc('users/' + uid);
    await db.runTransaction(async (tx) => {
      const current = await tx.get(userRef);
      tx.update(userRef, { wallet_balance: FieldValue.increment(Number(voucher.data().amount)), updated_at: FieldValue.serverTimestamp() });
      tx.update(voucherRef, { used: true, used_by: uid, used_at: FieldValue.serverTimestamp() });
      tx.create(userRef.collection('wallet_ledger').doc(), { label: 'شحن عبر كود', amount: Number(voucher.data().amount), unit: 'ل.س', direction: 'credit', created_at: FieldValue.serverTimestamp() });
    });
    return { status: 'completed' };
  }
  await db.collection('wallet_topups').add({ customer_id: uid, method, reference, status: 'pending', created_at: FieldValue.serverTimestamp() });
  return { status: 'pending' };
});

`;
if (!source.includes('exports.topUpWallet')) source = source.replace(marker, walletFn + marker);
source = source.replace("const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;", "const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;\n  const paymentMethod = String(data?.payment_method || 'cash_on_delivery');\n  const requestedWallet = Math.max(0, Number(data?.wallet_amount || 0));\n  const requestedPoints = Math.max(0, Number(data?.loyalty_points || 0));\n  const cashChangeFor = Math.max(0, Number(data?.cash_change_for || 0));\n  if (!['cash_on_delivery', 'wallet', 'hybrid'].includes(paymentMethod)) throw new HttpsError('invalid-argument', 'طريقة الدفع غير مدعومة');");
source = source.replace("const userData = userSnap.data() || {};\n    tx.set(rateRef", "const userData = userSnap.data() || {};\n    const totalBeforePayment = Math.max(0, subtotal + deliveryFee - discount);\n    const walletBalance = Number(userData.wallet_balance || 0);\n    const loyaltyBalance = Number(userData.loyalty_points || 0);\n    const pointValue = Number(config.loyalty_point_value || 0);\n    const pointsDiscount = Math.min(totalBeforePayment, requestedPoints * pointValue);\n    const walletUsed = paymentMethod === 'cash_on_delivery' ? 0 : Math.min(totalBeforePayment - pointsDiscount, requestedWallet, walletBalance);\n    if (paymentMethod === 'wallet' && walletUsed < totalBeforePayment) throw new HttpsError('failed-precondition', 'رصيد المحفظة غير كاف');\n    if (requestedPoints > loyaltyBalance) throw new HttpsError('failed-precondition', 'نقاط الولاء غير كافية');\n    const cashDue = Math.max(0, totalBeforePayment - walletUsed - pointsDiscount);\n    tx.set(rateRef");
source = source.replace("coupon_code: couponCode || null, discount_amount: discount, total: Math.max(0, subtotal + deliveryFee - discount),\n      status: 'pending', courier_id: null, fulfillment_type: 'delivery', payment_method: 'cash_on_delivery', payment_status: 'unpaid',", "coupon_code: couponCode || null, discount_amount: discount, loyalty_discount_redeemed: pointsDiscount, total: totalBeforePayment,\n      status: 'pending', courier_id: null, fulfillment_type: 'delivery', payment_method: paymentMethod, payment_status: cashDue === 0 ? 'paid' : 'unpaid', wallet_amount: walletUsed, loyalty_points_used: requestedPoints, cash_due: cashDue, cash_change_for: cashChangeFor,");
source = source.replace("created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), synced: true, free_delivery_applied: freeDelivery,\n    });", "created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp(), synced: true, free_delivery_applied: freeDelivery,\n    });\n    if (walletUsed > 0 || requestedPoints > 0) {\n      tx.update(userRef, { wallet_balance: FieldValue.increment(-walletUsed), loyalty_points: FieldValue.increment(-requestedPoints), updated_at: FieldValue.serverTimestamp() });\n      if (walletUsed > 0) tx.create(userRef.collection('wallet_ledger').doc(), { label: 'دفع الطلب ' + orderRef.id.slice(0, 6), amount: walletUsed, unit: 'ل.س', direction: 'debit', order_id: orderRef.id, created_at: FieldValue.serverTimestamp() });\n      if (requestedPoints > 0) tx.create(userRef.collection('loyalty_ledger').doc(orderRef.id), { label: 'استبدال نقاط للطلب', points: requestedPoints, direction: 'debit', created_at: FieldValue.serverTimestamp() });\n    }");
source = source.replace("referral_rewarded: false, updated_at", "referral_rewarded: false, wallet_balance: 0, loyalty_points: 0, updated_at");
fs.writeFileSync(file, source);

const rulesFile = path.join(root, 'firestore.rules');
let rules = fs.readFileSync(rulesFile, 'utf8');
rules = rules.replace("'updated_at', 'emergency_mode_seen'", "'updated_at', 'emergency_mode_seen', 'display_name', 'phone'");
rules = rules.replace("match /courier_wallets/{courierId} {", "match /users/{uid}/wallet_ledger/{entryId} { allow read: if signedIn() && request.auth.uid == uid; allow write: if false; }\n    match /users/{uid}/loyalty_ledger/{entryId} { allow read: if signedIn() && request.auth.uid == uid; allow write: if false; }\n    match /wallet_topups/{topupId} { allow read: if signedIn() && resource.data.customer_id == request.auth.uid; allow create: if signedIn() && request.resource.data.customer_id == request.auth.uid; allow update, delete: if admin(); }\n    match /wallet_vouchers/{code} { allow read, write: if admin(); }\n    match /courier_wallets/{courierId} {");
fs.writeFileSync(rulesFile, rules);
