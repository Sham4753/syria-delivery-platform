const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(...parts) { return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8'); }

const courierLogin = read('courier_app', 'lib', 'screens', 'login_screen.dart');
const merchantLogin = read('merchant_app', 'lib', 'screens', 'login_screen.dart');
const courierOrders = read('courier_app', 'lib', 'screens', 'orders_screen.dart');
const functions = read('functions', 'index.js');

assert.match(courierLogin, /if \(busy\) return;/);
assert.match(courierLogin, /on FirebaseAuthException/);
assert.match(courierLogin, /busy \? null : login/);
assert.match(merchantLogin, /if \(busy\) return;/);
assert.match(merchantLogin, /busy \? null : login/);
assert.match(courierOrders, /bool sendingLocation = false/);
assert.match(courierOrders, /if \(sendingLocation\) return;/);
assert.match(courierOrders, /'is_available': false/);
assert.match(courierOrders, /'is_available': true/);
assert.match(functions, /last_location_at/);
assert.match(functions, /waiting_for_courier/);

console.log('batch2 contract tests passed');
