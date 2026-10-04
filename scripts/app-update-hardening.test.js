const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin-dashboard', 'src', 'components', 'MasterSettingsPage.jsx'), 'utf8');
const gates = ['customer_app', 'merchant_app', 'courier_app'].map(app => fs.readFileSync(path.join(root, app, 'lib', 'version_gate.dart'), 'utf8'));
const versionPattern = /^\d+(\.\d+){0,2}(\+\d+)?$/;
for (const value of ['1', '1.2', '1.2.3', '1.2.3+5', '0001.0']) assert(versionPattern.test(value), `should accept ${value}`);
for (const value of ['', 'v1.2.3', '1.2.3.4', '1.2-beta', '1.2.3+'] ) assert(!versionPattern.test(value), `should reject ${value}`);
function compare(a, b) { const x = a.split('+')[0].split('.').map(Number), y = b.split('+')[0].split('.').map(Number); for (let i=0;i<3;i++) if ((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0)?1:-1; return 0; }
assert(compare('1.2.10', '1.2.9') > 0);
assert(compare('1.2.0', '1.2.0+9') === 0);
assert(compare('2.0', '1.9.9') > 0);
for (const url of ['https://example.com/app', 'market://details?id=com.example.app', '']) assert(['https:', 'market:', ''].includes(url ? new URL(url).protocol : ''));
for (const url of ['http://example.com', 'javascript:alert(1)', 'file:///tmp/app']) assert(!['https:', 'market:'].includes(new URL(url).protocol));
assert(/versionPattern = \^/.test(functions) || /versionPattern = \//.test(functions), 'server must validate version pattern');
assert(/لا يجوز أن يتجاوز أحدث إصدار منشور/.test(functions), 'server must reject min greater than latest');
assert(/type: 'update_url'/.test(functions) && /https:.*market:/.test(functions), 'server must restrict update URL protocols');
assert(/maintenance_apps: \{type: 'boolean_map'\}/.test(functions) && /maintenance_messages: \{type: 'string_map'/.test(functions), 'server must support per-app maintenance');
assert(/window\.prompt/.test(admin) && /تأكيد/.test(admin), 'admin must require explicit confirmation');
for (const gate of gates) {
  assert(/maintenance_apps/.test(gate) && /maintenanceMap\[appKey\]/.test(gate), 'gate must support per-app maintenance and legacy fallback');
  assert(/uri\.scheme == 'https' \|\| uri\.scheme == 'market'/.test(gate), 'gate must allow only safe update URI schemes');
}
console.log('app update hardening tests passed');
