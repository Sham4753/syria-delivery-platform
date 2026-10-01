const assert = require('assert');
const {VENDOR_ROLES, KDS_COLUMNS, isVendorRole, canTransition, kdsColumnFor} = require('../functions/kds-policy');

assert.deepStrictEqual(VENDOR_ROLES, ['vendor_admin', 'vendor_supervisor', 'vendor_cashier', 'kitchen_staff']);
assert.deepStrictEqual(KDS_COLUMNS, ['pending', 'preparing', 'ready_for_pickup', 'picked_up']);
assert.strictEqual(isVendorRole('kitchen_staff'), true);
assert.strictEqual(isVendorRole('courier'), false);
assert.strictEqual(canTransition('kitchen_staff', 'pending', 'preparing'), true);
assert.strictEqual(canTransition('kitchen_staff', 'preparing', 'cancelled'), false);
assert.strictEqual(canTransition('vendor_cashier', 'pending', 'cancelled'), true);
assert.strictEqual(canTransition('vendor_supervisor', 'ready_for_pickup', 'cancelled'), true);
assert.strictEqual(canTransition('vendor_admin', 'preparing', 'ready_for_pickup'), true);
assert.strictEqual(kdsColumnFor('ready_for_pickup'), 'ready_for_pickup');
assert.strictEqual(kdsColumnFor('delivered'), null);
console.log('KDS policy tests passed.');
