const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const errands = fs.readFileSync(path.join(root, 'functions', 'errands.js'), 'utf8');
const errandScreen = fs.readFileSync(path.join(root, 'customer_app', 'lib', 'screens', 'errand_screen.dart'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const customer = fs.readFileSync(path.join(root, 'customer_app', 'lib', 'common.dart'), 'utf8');
const adminSettings = fs.readFileSync(path.join(root, 'admin-dashboard', 'src', 'components', 'OperationsPages.jsx'), 'utf8');
const changeRequests = fs.readFileSync(path.join(root, 'admin-dashboard', 'src', 'components', 'ChangeRequestsPage.jsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`SECURITY CONTRACT FAILED: ${message}`);
}

assert(/if \(nextStatus === 'delivered'\) throw/.test(functions), 'direct delivered transition must be rejected');
assert(/exports\.completeDelivery/.test(functions), 'OTP delivery callable must exist');
assert(/Number\.isInteger\(quantity\)/.test(functions), 'order quantity must be integer validated');
assert(/normalizePoint\(address\.location\)/.test(functions) && /pickZone\(deliveryPoint, zones\)/.test(functions), 'delivery location must be valid and inside the requested zone');
assert(/exports\.cancelOrder/.test(functions), 'refund-aware cancellation callable must exist');
assert(/exports\.createErrand|createErrand = onCall/.test(errands), 'errand callable must exist');
assert(!/exports\.changeToWallet/.test(functions) && !/changeToWallet = onCall/.test(errands), 'old auto-credit changeToWallet must not exist');
assert(/buildErrandFunctions/.test(functions), 'index.js must load errands.js');
assert(!/data\?\.(delivery_fee|zone_id)/.test(errands), 'errand fee and zone must never be read from the client');
assert(/zones_geo/.test(errands) && /pickZone/.test(errands), 'errand zone must be derived from zones_geo polygons');
assert(/expected_fee/.test(errands), 'errand creation must require the confirmed quote');
assert(/idempotency_key/.test(errands), 'errand creation must be idempotent');
const requestBlock = errands.slice(errands.indexOf('const requestChangeToWallet'), errands.indexOf('const reviewChangeRequest'));
assert(requestBlock.length > 100 && !/wallet_balance/.test(requestBlock), 'requesting change must never credit the wallet');
assert(/change_requests/.test(requestBlock) && /order\.status !== 'delivered'/.test(requestBlock), 'change request must require a delivered order');
const reviewBlock = errands.slice(errands.indexOf('const reviewChangeRequest'));
assert(/requireRole\(adminId, \['super_admin'\]\)/.test(reviewBlock) && /wallet_balance/.test(reviewBlock), 'only admins may credit the wallet after review');
assert(/match \/change_requests\/{orderId}[^\n]*allow write: if false;/.test(rules), 'change_requests must be callable-only');
assert(!/['"]delivery_fee['"]\s*:/.test(errandScreen) && !/['"]zone_id['"]\s*:/.test(errandScreen), 'customer errand screen must not send fee or zone');
assert(/maxChange/.test(functions), 'createOrder must cap the cash change amount');
const smokeOrder = fs.readFileSync(path.join(root, 'scripts', 'smoke-order.js'), 'utf8');
assert(/missingLocation/.test(smokeOrder) && /outsideZone/.test(smokeOrder) && /invalidValues/.test(smokeOrder) && /boundary_inclusive/.test(smokeOrder) && /INVALID_ARGUMENT/.test(smokeOrder), 'createOrder smoke test must cover invalid, outside-zone, boundary, and valid locations');
assert(/max_change_amount: \{type: 'number'/.test(functions) && /max_change_amount: Number\(config\.max_change_amount\) \|\| 0/.test(adminSettings), 'max_change_amount must be allowlisted, fallback-safe, and published from admin settings');
assert(/where\('status', '==', 'pending'\)/.test(changeRequests) && /orderBy\('requested_at', 'desc'\)/.test(changeRequests) && /orderBy\('reviewed_at', 'desc'\)/.test(changeRequests) && /limit\(100\)/.test(changeRequests) && /limit\(50\)/.test(changeRequests), 'change request dashboard must bound and order pending and reviewed reads');
assert(/window\.confirm/.test(changeRequests) && /courier_claimed_amount/.test(changeRequests), 'change request approval must confirm and show claimed amount');
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
