const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const customer = fs.readFileSync(path.join(root, 'customer_app', 'lib', 'common.dart'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`SECURITY CONTRACT FAILED: ${message}`);
}

assert(/if \(nextStatus === 'delivered'\) throw/.test(functions), 'direct delivered transition must be rejected');
assert(/exports\.completeDelivery/.test(functions), 'OTP delivery callable must exist');
assert(/Number\.isInteger\(quantity\)/.test(functions), 'order quantity must be integer validated');
assert(/exports\.cancelOrder/.test(functions), 'refund-aware cancellation callable must exist');
assert(/exports\.createErrand/.test(functions), 'errand callable must exist');
assert(/exports\.changeToWallet/.test(functions), 'change-to-wallet callable must exist');
assert(/order\.status !== 'delivered'/.test(functions), 'change-to-wallet must require delivered order');
assert(/order\.payment_method\)\)/.test(functions), 'change-to-wallet must restrict payment method');
assert(/messaging\/registration-token-not-registered/.test(functions), 'notification failure must not abort accounting');
assert(/request\.resource\.data\.role == 'customer'/.test(rules), 'self-created users must be customers only');
assert(/request\.resource\.data\.keys\(\)\.hasOnly/.test(rules), 'user creation fields must be allowlisted');
assert(/match \/public_vendors\/{vendorId}/.test(rules), 'public vendor projection rule must exist');
assert(/match \/system_config\/{configId} \{ allow read: if configId == 'main';/.test(rules), 'guest config read must be limited to main');
assert(/allow read: if resource\.data\.is_available == true \|\| admin\(\) \|\| vendorOwner\(vendorId\)/.test(rules), 'available products must be browsable by guests');
assert(/match \/wallet_topups\/{topupId} \{ allow read: if signedIn\(\) && resource\.data\.customer_id == request\.auth\.uid; allow create: if false;/.test(rules), 'wallet topups must be callable-only');
assert(/role\('customer'\).*request\.resource\.data\.customer_id == request\.auth\.uid/.test(rules), 'ratings must be created by customers only');
assert(/collection\('public_vendors'\)/.test(customer), 'customer must read sanitized public vendor catalog');
assert(!/defaultValue: true/.test(customer.match(/const useFirebaseEmulators[\s\S]{0,160}/)?.[0] || ''), 'production must not default to Firebase emulators');
console.log('Security contract tests passed.');
