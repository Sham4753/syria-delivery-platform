const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  deleteObject,
  getMetadata,
  ref,
  uploadBytes,
} = require('firebase/storage');

const root = path.resolve(__dirname, '..');
const projectId = process.env.GCLOUD_PROJECT || 'demo-syria-delivery';
const bucket = `gs://${projectId}.appspot.com`;
let testEnv;

async function allow(label, operation) {
  await assertSucceeds(operation());
  return label;
}

async function deny(label, operation) {
  await assertFails(operation());
  return label;
}

function storageFor(uid) {
  const context = uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext();
  return context.storage(bucket);
}

function objectRef(storage, objectPath) {
  return ref(storage, objectPath);
}

async function upload(storage, objectPath, bytes, contentType) {
  return uploadBytes(objectRef(storage, objectPath), bytes, {contentType});
}

async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('users/admin_1').set({role: 'super_admin'});
    await db.doc('users/vendor_1').set({role: 'vendor_admin', vendor_id: 'vendor_1'});
    await db.doc('users/vendor_2').set({role: 'vendor_supervisor', vendor_id: 'vendor_2'});
  });
}

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8')},
    storage: {rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8')},
  });
  await seedUsers();

  const image = Buffer.from('valid image bytes');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
  const admin = storageFor('admin_1');
  const vendor = storageFor('vendor_1');
  const otherVendor = storageFor('vendor_2');
  const customer = storageFor('customer_1');
  const guest = storageFor(null);

  // Public reads work without authentication after an authorized upload.
  await allow('admin uploads branding', () => upload(admin, 'branding/logo.webp', image, 'image/webp'));
  await allow('guest reads branding', () => getMetadata(objectRef(guest, 'branding/logo.webp')));
  await deny('customer cannot delete branding', () => deleteObject(objectRef(customer, 'branding/logo.webp')));
  await allow('admin deletes branding', () => deleteObject(objectRef(admin, 'branding/logo.webp')));
  await allow('admin uploads banners', () => upload(admin, 'banners/home.webp', image, 'image/webp'));
  await allow('admin deletes banners', () => deleteObject(objectRef(admin, 'banners/home.webp')));
  await allow('admin uploads app-assets', () => upload(admin, 'app-assets/icon.webp', image, 'image/webp'));
  await allow('admin deletes app-assets', () => deleteObject(objectRef(admin, 'app-assets/icon.webp')));

  // Non-admin users cannot write or delete admin-owned paths.
  await deny('customer cannot upload branding', () => upload(customer, 'branding/customer.webp', image, 'image/webp'));
  await allow('admin uploads protected banner for delete test', () => upload(admin, 'banners/protected.webp', image, 'image/webp'));
  await deny('customer cannot delete banners', () => deleteObject(objectRef(customer, 'banners/protected.webp')));
  await allow('admin deletes protected banner', () => deleteObject(objectRef(admin, 'banners/protected.webp')));

  // Vendor managers are restricted to their own vendor path.
  await allow('vendor manager uploads own asset', () => upload(vendor, 'vendor-assets/vendor_1/menu.webp', image, 'image/webp'));
  await allow('vendor manager deletes own asset', () => deleteObject(objectRef(vendor, 'vendor-assets/vendor_1/menu.webp')));
  await allow('admin uploads other vendor asset for delete test', () => upload(admin, 'vendor-assets/vendor_2/admin.webp', image, 'image/webp'));
  await deny('vendor manager cannot upload other vendor asset', () => upload(vendor, 'vendor-assets/vendor_2/menu.webp', image, 'image/webp'));
  await deny('vendor manager cannot delete other vendor asset', () => deleteObject(objectRef(vendor, 'vendor-assets/vendor_2/admin.webp')));
  await allow('other vendor deletes own asset', () => deleteObject(objectRef(otherVendor, 'vendor-assets/vendor_2/admin.webp')));
  await deny('other vendor cannot upload vendor one asset', () => upload(otherVendor, 'vendor-assets/vendor_1/other.webp', image, 'image/webp'));

  // Content type and size constraints apply to creates and updates.
  await deny('SVG upload is rejected', () => upload(admin, 'branding/logo.svg', svg, 'image/svg+xml'));
  await deny('oversized image is rejected', () => upload(admin, 'branding/oversized.webp', oversized, 'image/webp'));

  await testEnv.clearStorage();
  await testEnv.cleanup();
  console.log('Storage emulator rules tests passed.');
}

run().catch(async (error) => {
  if (testEnv) await testEnv.cleanup();
  console.error(error);
  process.exitCode = 1;
});
