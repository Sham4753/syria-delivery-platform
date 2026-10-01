const assert = require('node:assert/strict');
const fs = require('node:fs');

const indexes = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
const courierOrders = fs.readFileSync('courier_app/lib/screens/orders_screen.dart', 'utf8');
const functions = fs.readFileSync('functions/index.js', 'utf8');

function hasIndex(collectionGroup, fields) {
  return indexes.indexes.some((index) => index.collectionGroup === collectionGroup &&
    index.fields.length === fields.length &&
    fields.every(([fieldPath, mode], position) => {
      const actual = index.fields[position];
      return actual.fieldPath === fieldPath && (actual.order || actual.arrayConfig) === mode;
    }));
}

assert.equal(hasIndex('users', [['role', 'ASCENDING'], ['fcm_token', 'ASCENDING'], ['__name__', 'ASCENDING']]), true);
assert.equal(hasIndex('couriers', [['zone_id', 'ASCENDING'], ['is_available', 'ASCENDING']]), true);
assert.equal(hasIndex('orders', [['zone_id', 'ASCENDING'], ['courier_id', 'ASCENDING'], ['status', 'ASCENDING'], ['dispatch_candidates', 'CONTAINS']]), true);
assert.equal(hasIndex('orders', [['courier_id', 'ASCENDING'], ['status', 'ASCENDING'], ['delivered_at', 'ASCENDING']]), true);
assert.match(courierOrders, /final Set<String> activeOrderIds/);
assert.match(courierOrders, /for \(final orderId in activeOrderIds\)/);
assert.doesNotMatch(courierOrders, /\.collection\('orders'\)[\s\S]{0,220}\.where\('courier_id', isEqualTo: uid\)[\s\S]{0,220}\.get\(\)/);
assert.match(functions, /where\('dispatch_status', 'in', \['waiting_for_courier', 'requeue'\]\)/);

console.log('batch4 Firestore performance/index contract tests passed');
