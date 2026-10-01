const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(...parts) { return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'); }

const courierApp = read('courier_app', 'lib', 'app.dart');
const merchantApp = read('merchant_app', 'lib', 'app.dart');
const courierGate = read('courier_app', 'lib', 'screens', 'orders_screen.dart');
const rules = read('firestore.rules');

assert.match(courierApp, /idTokenChanges\(\)/);
assert.match(merchantApp, /idTokenChanges\(\)/);
assert.match(courierGate, /profile\?\['role'\] != 'courier'/);
assert.match(courierGate, /SessionDeniedPage/);
assert.match(rules, /allow read: if admin\(\) \|\| \(signedIn\(\) && orderParty\(resource\.data\.order_id\)\);/);
assert.match(rules, /match \/couriers\/\{courierId\}/);

console.log('batch3 session/security contract tests passed');
