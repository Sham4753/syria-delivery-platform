const admin = require('../functions/node_modules/firebase-admin');

const host = process.env.EMULATOR_HOST || '127.0.0.1';
const projectId = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const authUrl = `http://${host}:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`;
const callableUrl = `http://${host}:5001/${projectId}/us-central1/createOrder`;

async function main() {
  const login = await fetch(authUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer01@test.local', password: 'test123456', returnSecureToken: true }) });
  if (!login.ok) throw new Error(`Auth emulator login failed: ${login.status} ${await login.text()}`);
  const auth = await login.json();
  const baseData = {
    vendor_id: 'restaurant-01', zone_id: 'zone-1', coupon_code: '', idempotency_key: 'smoke-order-20260920-01',
    items: [
      { product_id: 'meal', quantity: 1, selected_modifiers: [] },
      { product_id: 'drink', quantity: 2, selected_modifiers: [] },
    ],
    delivery_address: { label: 'المنزل', city: 'دمشق', address: 'عنوان اختبار الشراء - دمشق', landmark: 'قرب المنطقة الأولى', location: { latitude: 33.5138, longitude: 36.2765 } },
    payment_method: 'hybrid', wallet_amount: 10000, loyalty_points: 10, cash_change_for: 100000,
  };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${auth.idToken}` };
  const missingLocation = {...baseData, idempotency_key: 'smoke-order-missing-location-01', delivery_address: {...baseData.delivery_address, location: null}};
  const rejected = await fetch(callableUrl, { method: 'POST', headers, body: JSON.stringify({data: missingLocation}) });
  const rejectedBody = await rejected.json();
  if (rejected.ok || rejectedBody.error?.status !== 'INVALID_ARGUMENT') throw new Error(`createOrder accepted missing location: ${JSON.stringify(rejectedBody)}`);
  const order = await fetch(callableUrl, { method: 'POST', headers, body: JSON.stringify({data: baseData}) });
  const body = await order.json();
  if (!order.ok || body.error) throw new Error(`createOrder failed: ${order.status} ${JSON.stringify(body)}`);
  console.log(JSON.stringify({ status: 'order_created', order_id: body.result.order_id, customer: 'customer01@test.local', vendor: 'restaurant-01', items: 2, payment_method: 'hybrid' }, null, 2));
}
main().catch(error => { console.error(error.message); process.exit(1); });
