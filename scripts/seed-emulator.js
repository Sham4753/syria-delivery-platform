const path = require('path');
const fs = require('fs');
const admin = require(path.join('..', 'functions', 'node_modules', 'firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('رفض التشغيل: seed-emulator.js يعمل فقط عند تشغيل FIRESTORE_EMULATOR_HOST و FIREBASE_AUTH_EMULATOR_HOST.');
  process.exit(1);
}

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'syria-delivery-2026-majed' });
const db = admin.firestore();
const auth = admin.auth();
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'syria-business-fixtures.json'), 'utf8'));
const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

async function ensureUser(email, password, role, extra = {}) {
  let user;
  try { user = await auth.createUser({ email, password }); }
  catch (error) { if (error.code !== 'auth/email-already-exists') throw error; user = await auth.getUserByEmail(email); }
  await db.doc(`users/${user.uid}`).set({ role, ...extra, email, updated_at: timestamp() }, { merge: true });
  return user;
}

function productsFor(category, index) {
  if (category === 'restaurant') return [
    { id: 'meal', name: `وجبة تجريبية ${index}`, price: 250 },
    { id: 'sandwich', name: 'سندويشة دجاج', price: 180 },
    { id: 'drink', name: 'مشروب بارد', price: 50 },
  ];
  if (category === 'pharmacy') return [
    { id: 'vitamins', name: 'فيتامينات تجريبية', price: 220 },
    { id: 'care', name: 'منتج عناية شخصية', price: 160 },
    { id: 'mask', name: 'كمامات', price: 60 },
  ];
  return [
    { id: 'rice', name: 'رز 1 كغ', price: 140 },
    { id: 'milk', name: 'حليب', price: 90 },
    { id: 'water', name: 'مياه معدنية', price: 40 },
  ];
}

async function seedVendor(category, item, index) {
  const vendorId = `${category}-${String(index + 1).padStart(2, '0')}`;
  const vendor = {
    name: item.name,
    category,
    zone_id: 'zone-1',
    is_active: true,
    is_busy: false,
    commission_rate: 10,
    opening_hours: { open: '00:00', close: '23:59' },
    address: item.address,
    phone: item.phone || '',
    source_url: item.source_url,
    source_note: 'بيانات نشاط تجاري عامة من دليل/صفحة عامة؛ العنوان يحتاج تحققًا ميدانيًا قبل التشغيل التجاري.',
    demo_seeded: true,
    updated_at: timestamp(),
  };
  await db.doc(`vendors/${vendorId}`).set(vendor, { merge: true });
  await db.doc(`public_vendors/${vendorId}`).set({
    name: vendor.name,
    category: vendor.category,
    zone_id: vendor.zone_id,
    is_active: vendor.is_active,
    is_busy: vendor.is_busy,
    address: vendor.address,
    phone: vendor.phone,
    opening_hours: vendor.opening_hours,
    updated_at: timestamp(),
  }, { merge: true });
  for (const product of productsFor(category, index + 1)) {
    await db.doc(`vendors/${vendorId}/products/${product.id}`).set({ ...product, is_available: true, updated_at: timestamp() }, { merge: true });
  }
  return vendorId;
}

async function main() {
  const adminUser = await ensureUser('admin@test.local', 'test123456', 'super_admin');
  const firstVendor = fixtures.restaurants[0];
  const vendorUser = await ensureUser('vendor@test.local', 'test123456', 'vendor_admin', { vendor_id: 'restaurant-01' });
  const courierUser = await ensureUser('courier@test.local', 'test123456', 'courier');
  const customerUser = await ensureUser('customer@test.local', 'test123456', 'customer');

  await db.doc('system_config/main').set({
    app_name: 'Syria Delivery Demo', currency: 'SYP', surge_enabled: false, surge_multiplier: 1,
    batching_enabled: false, max_batch_orders: 2, loyalty_points_rate: 1, loyalty_point_value: 0.1, loyalty_points_divisor: 10,
    enable_guest_shopping: true, enable_google_auth: true, enable_facebook_auth: false,
    enable_whatsapp_otp: false, low_bandwidth_mode: true, updated_at: timestamp(),
  }, { merge: true });
  await db.doc('zones/zone-1').set({ name: 'دمشق وريف دمشق - تجربة', delivery_fee_base: 100, is_active: true, is_accepting_orders: true, surge_multiplier: 1, updated_at: timestamp() }, { merge: true });
  await db.doc('zones_geo/zone-1').set({
    polygon: [{lat: 32.9, lng: 35.8}, {lat: 32.9, lng: 37.2}, {lat: 34.2, lng: 37.2}, {lat: 34.2, lng: 35.8}],
    is_active: true,
    updated_at: timestamp(),
  }, { merge: true });

  const seededVendors = [];
  for (const [category, items] of Object.entries(fixtures)) {
    for (let index = 0; index < items.length; index += 1) seededVendors.push(await seedVendor(category === 'restaurants' ? 'restaurant' : category === 'pharmacies' ? 'pharmacy' : 'grocery', items[index], index));
  }

  const existingVendors = await db.collection('vendors').get();
  for (const vendorDoc of existingVendors.docs) {
    const vendor = vendorDoc.data() || {};
    await db.doc(`public_vendors/${vendorDoc.id}`).set({
      name: String(vendor.name || ''),
      category: String(vendor.category || ''),
      zone_id: vendor.zone_id || null,
      is_active: vendor.is_active === true,
      is_busy: vendor.is_busy === true,
      address: String(vendor.address || ''),
      phone: String(vendor.phone || ''),
      opening_hours: vendor.opening_hours || null,
      updated_at: timestamp(),
    }, { merge: true });
  }

  const courierIds = [];
  for (let index = 1; index <= 10; index += 1) {
    const email = `courier${String(index).padStart(2, '0')}@test.local`;
    const user = await ensureUser(email, 'test123456', 'courier', { display_name: `مندوب تجريبي ${index}` });
    courierIds.push(user.uid);
    await db.doc(`couriers/${user.uid}`).set({ name: `مندوب تجريبي ${index}`, phone: `0900000${String(index).padStart(3, '0')}`, vehicle_plate: `DEMO-${index}`, vehicle_type: 'دراجة', zone_id: 'zone-1', is_available: true, demo_seeded: true, updated_at: timestamp() }, { merge: true });
    await db.doc(`courier_wallets/${user.uid}`).set({ debt: 0, credit_limit: 100, balance: 0, total_earnings: 0, updated_at: timestamp() }, { merge: true });
  }

  const customerIds = [];
  for (let index = 1; index <= 10; index += 1) {
    const email = `customer${String(index).padStart(2, '0')}@test.local`;
    const user = await ensureUser(email, 'test123456', 'customer', { display_name: `زبون تجريبي ${index}`, phone: `0910000${String(index).padStart(3, '0')}`, wallet_balance: 1000, loyalty_points: 100, demo_seeded: true });
    customerIds.push(user.uid);
    await db.doc(`users/${user.uid}/addresses/home`).set({ label: 'المنزل', city: 'دمشق', address: `عنوان تجريبي ${index} - دمشق`, landmark: 'قرب المنطقة الأولى', location: new admin.firestore.GeoPoint(33.5138, 36.2765), updated_at: timestamp() }, { merge: true });
  }

  await db.doc('coupons/FIRST50').set({ type: 'percentage', value: 50, min_order_amount: 100, expires_at: null, usage_limit_total: 100, usage_limit_per_customer: 1, used_count: 0, is_active: true, source: 'demo' }, { merge: true });
  console.log(JSON.stringify({
    status: 'seeded', vendors: seededVendors.length, restaurants: 10, pharmacies: 10, groceries: 10,
    couriers: courierIds.length, customers: customerIds.length,
    demo_accounts: { admin: ['admin@test.local', 'test123456'], vendor: ['vendor@test.local', 'test123456'], courier: ['courier@test.local', 'test123456'], customer: ['customer@test.local', 'test123456'] },
    sample_vendor: firstVendor.name,
  }, null, 2));
}
main().catch(error => { console.error(error); process.exit(1); });
