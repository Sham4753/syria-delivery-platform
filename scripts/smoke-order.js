const {createHash} = require('crypto');

const target = process.env.SMOKE_TARGET || 'emulator';
const host = process.env.EMULATOR_HOST || '127.0.0.1';
const projectId = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const authUrl = process.env.SMOKE_AUTH_URL || `http://${host}:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`;
const callableUrl = process.env.SMOKE_CALLABLE_URL || `http://${host}:5001/${projectId}/us-central1/createOrder`;
const firestoreUrl = process.env.SMOKE_FIRESTORE_URL || `http://${host}:8080/v1/projects/${projectId}/databases/(default)/documents`;
const testPassword = process.env.SMOKE_TEST_PASSWORD || 'test123456';
const customerEmail = process.env.SMOKE_CUSTOMER_EMAIL || 'customer01@test.local';
const otherCustomerEmail = process.env.SMOKE_OTHER_CUSTOMER_EMAIL || 'customer02@test.local';
const vendorEmail = process.env.SMOKE_VENDOR_EMAIL || 'vendor@test.local';

if (target === 'emulator' && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Smoke test requires FIRESTORE_EMULATOR_HOST; do not run against production');
}
if (!['emulator', 'staging'].includes(target)) throw new Error(`Unsupported SMOKE_TARGET: ${target}`);
if (target === 'staging' && (!process.env.SMOKE_AUTH_URL || !process.env.SMOKE_CALLABLE_URL || !process.env.SMOKE_FIRESTORE_URL)) {
  throw new Error('Staging Smoke requires SMOKE_AUTH_URL, SMOKE_CALLABLE_URL, and SMOKE_FIRESTORE_URL');
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

async function callCreateOrder(headers, data) {
  const response = await fetch(callableUrl, {
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
  if (db) await db.doc(`order_rate_limits/${auth.localId}`).delete();
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

  assertRejected(await callCreateOrder({'content-type': 'application/json'}, baseData), 'UNAUTHENTICATED', 'تسجيل الدخول', 'unauthenticated caller');
  assertRejected(await callCreateOrder(vendorHeaders, {...baseData, idempotency_key: `smoke-order-vendor-${runId}`}), 'PERMISSION_DENIED', 'للعملاء فقط', 'non-customer role');
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
      'unauthenticated_rejected', 'non_customer_rejected', 'direct_write_denied', 'other_customer_read_denied', 'unfiltered_order_list_denied', 'sensitive_updates_denied', 'missing_location',
      'outside_zone_no_side_effect', 'swapped_coordinates', 'invalid_values', 'boundary_inclusive',
      'idempotency_replay_no_new_order', 'idempotency_payload_conflict', 'concurrent_idempotency', 'customer_scoped_order_query',
      ...(process.env.SMOKE_ATOMICITY_TEST === '1' ? ['atomicity_injected_failure_no_artifacts'] : []),
    ],
  }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exit(1); });
