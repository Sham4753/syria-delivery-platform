// Integration test for the customer-facing vendor catalog publication trigger.
const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('This test must run inside Firebase emulators:exec.');
  process.exit(1);
}

const admin = require(path.join('..', 'functions', 'node_modules', 'firebase-admin'));

if (admin.apps.length === 0) {
  admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || 'demo-syria-delivery'});
}

const db = admin.firestore();
const id = `vendor-publication-test-${Date.now()}`;
const vendorRef = db.doc(`vendors/${id}`);
const publicRef = db.doc(`public_vendors/${id}`);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(description, predicate, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const snapshot = await publicRef.get();
    if (predicate(snapshot)) return snapshot;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function main() {
  await vendorRef.set({
    name: 'مطعم اختبار النشر',
    category: 'restaurant',
    zone_id: 'zone-test',
    is_active: true,
    is_busy: false,
    address: 'دمشق',
    phone: '0999999999',
    opening_hours: {open: '09:00', close: '22:00'},
    private_financial_note: 'must not be public',
  });

  let publicVendor = await waitFor('initial public vendor projection', (snapshot) => {
    const data = snapshot.data() || {};
    return snapshot.exists && data.name === 'مطعم اختبار النشر' && data.is_active === true;
  });
  if (publicVendor.data().private_financial_note !== undefined) {
    throw new Error('Private vendor fields leaked into public_vendors.');
  }

  await vendorRef.update({name: 'مطعم اختبار النشر المحدّث', is_busy: true});
  publicVendor = await waitFor('updated public vendor projection', (snapshot) => {
    const data = snapshot.data() || {};
    return snapshot.exists && data.name === 'مطعم اختبار النشر المحدّث' && data.is_busy === true;
  });
  if (publicVendor.data().zone_id !== 'zone-test') {
    throw new Error('Updated public vendor projection lost its zone.');
  }

  await vendorRef.delete();
  await waitFor('public vendor deletion', (snapshot) => !snapshot.exists);
  console.log('Vendor publication trigger integration test passed.');
}

main().catch((error) => {
  console.error(`Vendor publication trigger integration test failed: ${error.message}`);
  process.exit(1);
});
