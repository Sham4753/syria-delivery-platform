const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const functions = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin-dashboard', 'src', 'components', 'MasterSettingsPage.jsx'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'system-config.example.json'), 'utf8'));
const seed = fs.readFileSync(path.join(root, 'scripts', 'seed-emulator.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
function assertMatch(pattern, source, message) { assert(pattern.test(source), message); }
for (const key of ['min_app_version', 'latest_app_version', 'update_url', 'maintenance_mode', 'maintenance_message']) {
  assertMatch(new RegExp(`${key}`), functions, `${key} must be in Functions config`);
  assertMatch(new RegExp(`${key}`), admin, `${key} must be editable in admin`);
  assert(Object.prototype.hasOwnProperty.call(config, key), `${key} must be in production config example`);
  assertMatch(new RegExp(`${key}`), seed, `${key} must be in seed`);
}
assertMatch(/type: 'version_map'/, functions, 'version maps must be validated');
assertMatch(/customer.*merchant.*courier/, JSON.stringify(config.min_app_version), 'version map must include all apps');
assertMatch(/'min_app_version'.*'latest_app_version'.*'update_url'.*'maintenance_mode'.*'maintenance_message'/s, functions, 'update fields must be public');
assertMatch(/match \/public_config\/{configId} \{ allow read: if configId == 'main'; allow write: if false; \}/, rules, 'public_config remains readable without rule changes');
console.log('app update config schema tests passed');
