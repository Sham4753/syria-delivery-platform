// Safely rebuild the customer-facing vendor catalog in the local Firestore emulator.
// This script never connects to a production Firebase project.
const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('رفض التشغيل: شغّل Firestore Emulator أولاً ثم نفّذ هذا السكربت.');
  process.exit(1);
}

const admin = require(path.join('..', 'functions', 'node_modules', 'firebase-admin'));

if (admin.apps.length === 0) {
  admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || 'demo-syria-delivery'});
}

const db = admin.firestore();

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
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function main() {
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

  console.log(`تمت مزامنة ${synced} مزود وحذف ${removed} سجل قديم من public_vendors.`);
}

main().catch((error) => {
  console.error('فشلت مزامنة كتالوج الزائر:', error.message);
  process.exit(1);
});
