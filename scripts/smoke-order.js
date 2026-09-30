const {createHash} = require('crypto');

const target = process.env.SMOKE_TARGET || 'emulator';
const host = process.env.EMULATOR_HOST || '127.0.0.1';
const projectId = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const authUrl = process.env.SMOKE_AUTH_URL || `http://${host}:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`;
const callableUrl = process.env.SMOKE_CALLABLE_URL || `http://${host}:5001/${projectId}/us-central1/createOrder`;
const cancelCallableUrl = process.env.SMOKE_CANCEL_CALLABLE_URL || `http://${host}:5001/${projectId}/us-central1/cancelOrder`;
const firestoreUrl = process.env.SMOKE_FIRESTORE_URL || `http://${host}:8080/v1/projects/${projectId}/databases/(default)/documents`;
const testPassword = process.env.SMOKE_TEST_PASSWORD || 'test123456';
const customerEmail = process.env.SMOKE_CUSTOMER_EMAIL || 'customer01@test.local';
const otherCustomerEmail = process.env.SMOKE_OTHER_CUSTOMER_EMAIL || 'customer02@test.local';
const vendorEmail = process.env.SMOKE_VENDOR_EMAIL || 'vendor@test.local';

if (target === 'emulator' && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Smoke test requires FIRESTORE_EMULATOR_HOST; do not run against production');
}
if (!['emulator', 'staging'].includes(target)) throw new Error(`Unsupported SMOKE_TARGET: ${target}`);
if (target === 'staging' && (!process.env.SMOKE_AUTH_URL || !process.env.SMOKE_CALLABLE_URL || !process.env.SMOKE_CANCEL_CALLABLE_URL || !process.env.SMOKE_FIRESTORE_URL)) {
  throw new Error('Staging Smoke requires SMOKE_AUTH_URL, SMOKE_CALLABLE_URL, SMOKE_CANCEL_CALLABLE_URL, and SMOKE_FIRESTORE_URL');
}
if (target !== 'emulator' && process.env.SMOKE_ATOMICITY_TEST === '1') {
  throw new Error('SMOKE_ATOMICITY_TEST is allowed only with SMOKE_TARGET=emulator');
}

let db = null;
if (target === 'emulator') {
  const admin = require('../functions/node_modules/firebase-admin');
  admin.initializeApp({projectId});
  db = admin.firestore();
}

async function login(email) {
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password: testPassword, returnSecureToken: true}),
  });
  if (!response.ok) throw new Error(`Auth emulator login failed for ${email}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function callCallable(url, headers, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({data}),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    throw new Error(`createOrder returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  return {response, body};
}

async function callCreateOrder(headers, data) {
  return callCallable(callableUrl, headers, data);
}

async function callCancelOrder(headers, data) {
  return callCallable(cancelCallableUrl, headers, data);
}

function assertRejected(result, status, message, label) {
  const error = result.body?.error;
  const normalize = (value) => String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  const actualStatus = normalize(error?.status);
  const actualMessage = normalize(error?.message);
  const expectedStatus = normalize(status);
  const expectedMessage = normalize(message);
  if (actualStatus === expectedStatus && actualMessage.includes(expectedMessage)) return;
  throw new Error(`${label}: expected ${expectedStatus}/${expectedMessage}, got status=${JSON.stringify(actualStatus)} message=${JSON.stringify(actualMessage)} body=${JSON.stringify(result.body)}`);
}

async function customerOrderQuery(idToken, customerId) {
  const response = await fetch(`${firestoreUrl}:runQuery`, {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: `Bearer ${idToken}`},
    body: JSON.stringify({structuredQuery: {
      from: [{collectionId: 'orders'}],
      where: {fieldFilter: {field: {fieldPath: 'customer_id'}, op: 'EQUAL', value: {stringValue: customerId}}},
      limit: 100,
    }}),
  });
  const result = await response.json();
  if (!response.ok || !Array.isArray(result)) throw new Error(`customer-scoped order query failed: ${response.status} ${JSON.stringify(result)}`);
  return result.filter((item) => item.document?.fields?.customer_id?.stringValue === customerId);
}

async function orderCount(idToken, customerId) {
  return (await customerOrderQuery(idToken, customerId)).length;
}

async function resetEmulatorRateLimit(uid) {
  if (db) await db.doc(`order_rate_limits/${uid}`).delete();
}

async function assertCustomerOrderQueryWorks(idToken, customerId) {
  const result = await customerOrderQuery(idToken, customerId);
  if (!result.some((item) => item.document?.fields?.customer_id?.stringValue === customerId)) {
    throw new Error(`customer-scoped order query returned no matching orders: ${JSON.stringify(result)}`);
  }
}

async function assertDirectOrderWriteDenied(idToken, documentId) {
  const response = await fetch(`${firestoreUrl}/orders/${documentId}`, {
    method: 'PATCH',
    headers: {'content-type': 'application/json', authorization: `Bearer ${idToken}`},
    body: JSON.stringify({fields: {
      customer_id: {stringValue: 'direct-write-test'},
      vendor_id: {stringValue: 'restaurant-01'},
      zone_id: {stringValue: 'zone-1'},
      status: {stringValue: 'pending'},
    }}),
  });
  const text = await response.text();
  if (response.status !== 403) throw new Error(`direct order write was not denied: ${response.status} ${text.slice(0, 200)}`);
}

async function assertDirectOrderRequestDenied(response, label) {
  const text = await response.text();
  if (response.status !== 403) throw new Error(`${label} was not denied: ${response.status} ${text.slice(0, 200)}`);
}

async function main() {
  const auth = await login(customerEmail);
  const otherCustomerAuth = await login(otherCustomerEmail);
  const vendorAuth = await login(vendorEmail);
  const headers = {'content-type': 'application/json', authorization: `Bearer ${auth.idToken}`};
  const vendorHeaders = {'content-type': 'application/json', authorization: `Bearer ${vendorAuth.idToken}`};
  const runId = Date.now().toString();
  await resetEmulatorRateLimit(auth.localId);
  const baseData = {
    vendor_id: 'restaurant-01', zone_id: 'zone-1', coupon_code: '', idempotency_key: 'smoke-order-20260920-01',
    items: [
      {product_id: 'meal', quantity: 1, selected_modifiers: []},
      {product_id: 'drink', quantity: 2, selected_modifiers: []},
    ],
    delivery_address: {
      label: 'المنزل', city: 'دمشق', address: 'عنوان اختبار الشراء - دمشق', landmark: 'قرب المنطقة الأولى',
      location: {latitude: 33.5138, longitude: 36.2765},
    },
    payment_method: 'cash_on_delivery', wallet_amount: 0, loyalty_points: 0, cash_change_for: 100000,
  };

  assertRejected(await callCancelOrder({'content-type': 'application/json'}, {order_id: ''}), 'UNAUTHENTICATED', 'تسجيل الدخول', 'cancel unauthenticated caller');
  assertRejected(await callCancelOrder(vendorHeaders, {order_id: 'missing'}), 'PERMISSION_DENIED', 'للعملاء فقط', 'cancel non-customer role');
  assertRejected(await callCancelOrder(headers, {order_id: ''}), 'INVALID_ARGUMENT', 'رقم الطلب مطلوب', 'cancel invalid order id');
  assertRejected(await callCancelOrder(headers, {order_id: 'missing-order-for-smoke'}), 'NOT_FOUND', 'الطلب غير موجود', 'cancel missing order');

  assertRejected(await callCreateOrder({'content-type': 'application/json'}, baseData), 'UNAUTHENTICATED', 'تسجيل الدخول', 'unauthenticated caller');
  assertRejected(await callCreateOrder(vendorHeaders, {...baseData, idempotency_key: `smoke-order-vendor-${runId}`}), 'PERMISSION_DENIED', 'للعملاء فقط', 'non-customer role');
  assertRejected(await callCreateOrder(headers, {...baseData, idempotency_key: `smoke-order-unknown-field-${runId}`, __smoke_unknown: true}), 'INVALID_ARGUMENT', 'حقول الاختبار المحلي', 'unknown smoke field');
  if (target === 'staging') {
    assertRejected(await callCreateOrder(headers, {...baseData, idempotency_key: `smoke-order-injection-on-staging-${runId}`, __smoke_fail_after_order_write: true}), 'INVALID_ARGUMENT', 'حقول الاختبار المحلي', 'atomicity injection blocked on staging');
  }
  await assertDirectOrderWriteDenied(auth.idToken, `smoke-direct-write-${runId}`);

  const missingLocation = {...baseData, idempotency_key: 'smoke-order-missing-location-01', delivery_address: {...baseData.delivery_address, location: null}};
  assertRejected(await callCreateOrder(headers, missingLocation), 'INVALID_ARGUMENT', 'موقع تسليم صالح', 'missing location');

  const outsideZone = {...baseData, idempotency_key: 'smoke-order-outside-zone-01', delivery_address: {...baseData.delivery_address, location: {latitude: 40, longitude: 40}}};
  const beforeOutside = await orderCount(auth.idToken, auth.localId);
  assertRejected(await callCreateOrder(headers, outsideZone), 'FAILED_PRECONDITION', 'خارج منطقة التوصيل المحددة', 'outside zone');
  const afterOutside = await orderCount(auth.idToken, auth.localId);
  if (afterOutside !== beforeOutside) throw new Error(`outside-zone rejection created an order: ${beforeOutside} -> ${afterOutside}`);

  const swappedCoordinates = {...baseData, idempotency_key: 'smoke-order-swapped-coordinates-01', delivery_address: {...baseData.delivery_address, location: {latitude: 36.2765, longitude: 33.5138}}};
  assertRejected(await callCreateOrder(headers, swappedCoordinates), 'FAILED_PRECONDITION', 'خارج منطقة التوصيل المحددة', 'swapped coordinates');

  const invalidValues = [
    {latitude: 999, longitude: 36.2765},
    {latitude: '33.5138', longitude: 36.2765},
    {latitude: Number.NaN, longitude: 36.2765},
  ];
  for (let index = 0; index < invalidValues.length; index += 1) {
    const invalid = {...baseData, idempotency_key: `smoke-order-invalid-location-${index}`, delivery_address: {...baseData.delivery_address, location: invalidValues[index]}};
    assertRejected(await callCreateOrder(headers, invalid), 'INVALID_ARGUMENT', 'موقع تسليم صالح', `invalid location ${index}`);
  }

  // Zone polygon is inclusive: the seeded north edge (latitude 34.2) is accepted.
  const edgeLocation = {...baseData, idempotency_key: 'smoke-order-boundary-01', delivery_address: {...baseData.delivery_address, location: {latitude: 34.2, longitude: 36.5}}};
  const edgeResult = await callCreateOrder(headers, edgeLocation);
  if (!edgeResult.response.ok || edgeResult.body.error) throw new Error(`boundary location rejected: ${JSON.stringify(edgeResult.body)}`);

  const order = await callCreateOrder(headers, baseData);
  if (!order.response.ok || order.body.error) throw new Error(`createOrder failed: ${order.response.status} ${JSON.stringify(order.body)}`);

  await assertCustomerOrderQueryWorks(auth.idToken, auth.localId);

  if (process.env.SMOKE_ATOMICITY_TEST === '1') {
    const atomicKey = `smoke-order-atomic-failure-${runId}`;
    const atomicData = {...baseData, idempotency_key: atomicKey, __smoke_fail_after_order_write: true};
    const atomicResult = await callCreateOrder(headers, atomicData);
    if (atomicResult.response.ok && !atomicResult.body.error) throw new Error('atomicity injection was not activated; restart the Firebase emulators and ensure SMOKE_TARGET=emulator');
    assertRejected(atomicResult, 'INTERNAL', 'اختبار ذريّة', 'atomicity injected failure');
    const atomicOrder = await db.collection('orders').where('idempotency_key', '==', atomicKey).get();
    const atomicMarker = await db.doc(`order_idempotency/${auth.localId}_${createHash('sha256').update(atomicKey).digest('hex').slice(0, 32)}`).get();
    if (!atomicOrder.empty || atomicMarker.exists) throw new Error('atomicity failure left order or idempotency marker behind');
  }

  const otherCustomerRead = await fetch(`${firestoreUrl}/orders/${order.body.result.order_id}`, {
    headers: {authorization: `Bearer ${otherCustomerAuth.idToken}`},
  });
  await assertDirectOrderRequestDenied(otherCustomerRead, 'other customer order read');
  const unfilteredOrderList = await fetch(`${firestoreUrl}/orders`, {
    headers: {authorization: `Bearer ${otherCustomerAuth.idToken}`},
  });
  await assertDirectOrderRequestDenied(unfilteredOrderList, 'unfiltered order list');
  const sensitiveFields = [
    ['total', {doubleValue: 1}],
    ['status', {stringValue: 'preparing'}],
    ['payment_method', {stringValue: 'wallet'}],
    ['vendor_id', {stringValue: 'vendor-evil'}],
    ['customer_id', {stringValue: 'customer-evil'}],
    ['delivery_address', {mapValue: {fields: {location: {mapValue: {fields: {latitude: {doubleValue: 1}, longitude: {doubleValue: 1}}}}}}}],
  ];
  for (const [field, value] of sensitiveFields) {
    const sensitiveUpdate = await fetch(`${firestoreUrl}/orders/${order.body.result.order_id}?updateMask.fieldPaths=${encodeURIComponent(field)}`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json', authorization: `Bearer ${auth.idToken}`},
      body: JSON.stringify({fields: {[field]: value}}),
    });
    await assertDirectOrderRequestDenied(sensitiveUpdate, `sensitive order update: ${field}`);
  }

  const cancelData = {...baseData, idempotency_key: `smoke-order-cancel-${runId}`};
  const cancelOrder = await callCreateOrder(headers, cancelData);
  if (!cancelOrder.response.ok || cancelOrder.body.error) throw new Error(`cancel fixture order failed: ${JSON.stringify(cancelOrder.body)}`);
  const cancelId = cancelOrder.body.result.order_id;
  const cancelFields = {
    status: {stringValue: 'cancelled'},
    cancelled_by: {stringValue: 'customer'},
    cancellation_reason: {stringValue: 'smoke test'},
    updated_at: {timestampValue: new Date().toISOString()},
  };
  const cancelMask = new URLSearchParams([
    ['updateMask.fieldPaths', 'status'],
    ['updateMask.fieldPaths', 'cancelled_by'],
    ['updateMask.fieldPaths', 'cancellation_reason'],
    ['updateMask.fieldPaths', 'updated_at'],
  ]);
  const otherCustomerCancel = await fetch(`${firestoreUrl}/orders/${cancelId}?${cancelMask}`, {
    method: 'PATCH',
    headers: {'content-type': 'application/json', authorization: `Bearer ${otherCustomerAuth.idToken}`},
    body: JSON.stringify({fields: cancelFields}),
  });
  await assertDirectOrderRequestDenied(otherCustomerCancel, 'other customer cancellation');
  const directOwnerCancel = await fetch(`${firestoreUrl}/orders/${cancelId}?${cancelMask}`, {
    method: 'PATCH',
    headers: {'content-type': 'application/json', authorization: `Bearer ${auth.idToken}`},
    body: JSON.stringify({fields: cancelFields}),
  });
  await assertDirectOrderRequestDenied(directOwnerCancel, 'direct owner cancellation');
  const callableCancel = await callCancelOrder(headers, {order_id: cancelId, reason: 'smoke test'});
  if (!callableCancel.response.ok || callableCancel.body.error || callableCancel.body.result?.status !== 'cancelled') {
    throw new Error(`callable customer cancellation failed: ${JSON.stringify(callableCancel.body)}`);
  }
  assertRejected(await callCancelOrder(headers, {order_id: cancelId, reason: 'repeat'}), 'FAILED_PRECONDITION', 'لا يمكن إلغاء الطلب', 'cancellation after terminal status');

  const advancedStatusChecks = [];
  let hybridRefundCheck = false;
  if (db) {
    await resetEmulatorRateLimit(auth.localId);
    const advancedOrder = await callCreateOrder(headers, {...baseData, idempotency_key: `smoke-order-advanced-status-${runId}`});
    if (!advancedOrder.response.ok || advancedOrder.body.error) throw new Error(`advanced-status fixture failed: ${JSON.stringify(advancedOrder.body)}`);
    const advancedId = advancedOrder.body.result.order_id;
    for (const status of ['preparing', 'ready_for_pickup', 'picked_up', 'on_the_way', 'delivering', 'delivered']) {
      await db.doc(`orders/${advancedId}`).update({status});
      const rejected = await callCancelOrder(headers, {order_id: advancedId, reason: `status ${status}`});
      assertRejected(rejected, 'FAILED_PRECONDITION', 'لا يمكن إلغاء الطلب', `cancel advanced status ${status}`);
      const unchanged = await db.doc(`orders/${advancedId}`).get();
      if (unchanged.data()?.status !== status) throw new Error(`status changed after rejected cancellation: ${status}`);
      advancedStatusChecks.push(status);
    }

    await resetEmulatorRateLimit(auth.localId);
    const hybridData = {...baseData, idempotency_key: `smoke-order-hybrid-cancel-${runId}`, payment_method: 'hybrid', wallet_amount: 10000, loyalty_points: 10};
    const beforeHybridCreate = (await db.doc(`users/${auth.localId}`).get()).data() || {};
    const hybridOrder = await callCreateOrder(headers, hybridData);
    if (!hybridOrder.response.ok || hybridOrder.body.error) throw new Error(`hybrid fixture failed: ${JSON.stringify(hybridOrder.body)}`);
    const hybridId = hybridOrder.body.result.order_id;
    const afterHybridCreate = (await db.doc(`users/${auth.localId}`).get()).data() || {};
    if (Number(beforeHybridCreate.wallet_balance) - Number(afterHybridCreate.wallet_balance) !== hybridData.wallet_amount ||
        Number(beforeHybridCreate.loyalty_points) - Number(afterHybridCreate.loyalty_points) !== hybridData.loyalty_points) {
      throw new Error(`hybrid payment debit was not exact: ${JSON.stringify({beforeHybridCreate, afterHybridCreate, expected: {wallet: hybridData.wallet_amount, points: hybridData.loyalty_points}})}`);
    }
    const cancelRace = await Promise.all([callCancelOrder(headers, {order_id: hybridId, reason: 'race 1'}), callCancelOrder(headers, {order_id: hybridId, reason: 'race 2'})]);
    const successfulCancels = cancelRace.filter((result) => result.response.ok && !result.body.error);
    const rejectedCancels = cancelRace.filter((result) => result.body.error);
    if (successfulCancels.length !== 1 || rejectedCancels.length !== 1) throw new Error(`cancel concurrency expected one success/one rejection: ${JSON.stringify(cancelRace.map((result) => result.body))}`);
    assertRejected(rejectedCancels[0], 'FAILED_PRECONDITION', 'لا يمكن إلغاء الطلب', 'cancel concurrency rejection');
    const afterRefund = (await db.doc(`users/${auth.localId}`).get()).data() || {};
    const hybridSnap = await db.doc(`orders/${hybridId}`).get();
    const hybrid = hybridSnap.data() || {};
    if (Number(afterRefund.wallet_balance) - Number(afterHybridCreate.wallet_balance) !== Number(hybrid.wallet_refunded) ||
        Number(afterRefund.loyalty_points) - Number(afterHybridCreate.loyalty_points) !== Number(hybrid.loyalty_points_refunded) ||
        Number(afterRefund.wallet_balance) !== Number(beforeHybridCreate.wallet_balance) ||
        Number(afterRefund.loyalty_points) !== Number(beforeHybridCreate.loyalty_points) ||
        Number(hybrid.wallet_refunded) !== 10000 || Number(hybrid.loyalty_points_refunded) !== 10 ||
        !(await db.doc(`users/${auth.localId}/wallet_ledger/refund_${hybridId}`).get()).exists ||
        !(await db.doc(`users/${auth.localId}/loyalty_ledger/${hybridId}`).get()).exists) {
      throw new Error(`hybrid cancellation debit/refund was not exact: ${JSON.stringify({beforeHybridCreate, afterHybridCreate, afterRefund, hybrid})}`);
    }
    hybridRefundCheck = true;
  }

  const replayCountBefore = await orderCount(auth.idToken, auth.localId);
  const replay = await callCreateOrder(headers, baseData);
  const replayCountAfter = await orderCount(auth.idToken, auth.localId);
  if (!replay.response.ok || replay.body.error || replay.body.result?.order_id !== order.body.result?.order_id || replayCountAfter !== replayCountBefore) {
    throw new Error(`idempotency replay failed: ${JSON.stringify(replay.body)} count ${replayCountBefore}->${replayCountAfter}`);
  }

  const conflictingPayload = {...baseData, items: [{product_id: 'meal', quantity: 2, selected_modifiers: []}]};
  assertRejected(await callCreateOrder(headers, conflictingPayload), 'ALREADY_EXISTS', 'بيانات مختلفة', 'idempotency payload conflict');

  const concurrent = {...baseData, idempotency_key: `smoke-order-concurrent-${runId}`};
  const concurrentBefore = await orderCount(auth.idToken, auth.localId);
  const concurrentResults = await Promise.all(Array.from({length: 20}, () => callCreateOrder(headers, concurrent)));
  const concurrentIds = concurrentResults.map((result) => result.body.result?.order_id);
  const concurrentAfter = await orderCount(auth.idToken, auth.localId);
  if (concurrentResults.some((result) => !result.response.ok || result.body.error) ||
      new Set(concurrentIds).size !== 1 || concurrentAfter !== concurrentBefore + 1) {
    throw new Error(`concurrent idempotency failed: ${JSON.stringify(concurrentResults.map((result) => result.body))} count ${concurrentBefore}->${concurrentAfter}`);
  }

  console.log(JSON.stringify({
    status: 'order_created',
    order_id: order.body.result.order_id,
    boundary_order_id: edgeResult.body.result?.order_id,
    concurrent_order_id: concurrentIds[0],
    customer: customerEmail,
    vendor: 'restaurant-01',
    checks: [
      'unauthenticated_rejected', 'non_customer_rejected', 'smoke_fields_rejected', 'cancel_unauthenticated_rejected', 'cancel_non_customer_rejected', 'cancel_invalid_id_rejected', 'cancel_missing_order_rejected', 'direct_write_denied', 'other_customer_read_denied', 'unfiltered_order_list_denied', 'sensitive_updates_denied', 'customer_cancel_other_customer_denied', 'customer_cancel_direct_write_denied', 'customer_cancel_callable_allowed', 'customer_cancel_wrong_status_denied', 'missing_location',
      'outside_zone_no_side_effect', 'swapped_coordinates', 'invalid_values', 'boundary_inclusive',
      'idempotency_replay_no_new_order', 'idempotency_payload_conflict', 'concurrent_idempotency', 'customer_scoped_order_query',
      ...(advancedStatusChecks.length ? ['customer_cancel_advanced_statuses_denied'] : []),
      ...(hybridRefundCheck ? ['hybrid_balance_debit_and_refund_exact_once'] : []),
      ...(process.env.SMOKE_ATOMICITY_TEST === '1' ? ['atomicity_injected_failure_no_artifacts'] : []),
    ],
  }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exit(1); });
