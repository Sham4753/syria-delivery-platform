#!/usr/bin/env node
// Points every client at the region the Cloud Functions are deployed to.
// The region is READ from functions/index.js (FUNCTION_REGION), so the clients cannot drift from the backend.
//   node scripts/set-functions-region.js            -> dry run, prints what would change
//   node scripts/set-functions-region.js --apply    -> rewrites the files
// Safe to run twice. It works on whatever the current files look like, so it does not depend on a patch base.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const SKIP = new Set(['node_modules', 'build', '.dart_tool', '.git', 'dist', '.gradle', 'Pods']);

const indexSource = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const match = indexSource.match(/const\s+FUNCTION_REGION\s*=\s*'([a-z0-9-]+)'/);
if (!match) { console.error('Could not find FUNCTION_REGION in functions/index.js; refusing to guess.'); process.exit(2); }
const region = match[1];

// [file filter, pattern, replacement]
const rules = [
  // Flutter apps (and the generator script that writes Dart code): FirebaseFunctions.instance -> instanceFor(region: ...)
  {test: (f) => /^(customer_app|courier_app|merchant_app)\/.*\.dart$/.test(f) || f === 'scripts/fix-flutter-errors.js',
    pattern: /FirebaseFunctions\.instance(?!For)\b/g, replacement: `FirebaseFunctions.instanceFor(region: '${region}')`},
  // Admin dashboard: getFunctions(app) -> getFunctions(app, region). connectFunctionsEmulator uses the same instance.
  {test: (f) => /^admin-dashboard\/src\/.*\.(js|jsx|ts|tsx)$/.test(f),
    pattern: /getFunctions\(\s*app\s*\)/g, replacement: `getFunctions(app, '${region}')`},
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full); else yield full;
  }
}

let files = 0; let hits = 0;
for (const full of walk(root)) {
  const rel = path.relative(root, full).split(path.sep).join('/');
  const applicable = rules.filter((rule) => rule.test(rel));
  if (!applicable.length) continue;
  const original = fs.readFileSync(full, 'utf8');
  let updated = original; let count = 0;
  for (const rule of applicable) updated = updated.replace(rule.pattern, () => { count += 1; return rule.replacement; });
  if (!count) continue;
  files += 1; hits += count;
  console.log(`${apply ? 'updated ' : 'would update'} ${rel} (${count})`);
  if (apply) fs.writeFileSync(full, updated);
}
console.log(`\n${apply ? 'Updated' : 'Would update'} ${hits} call site(s) in ${files} file(s) -> region "${region}".`);
if (!apply) console.log('Dry run only. Re-run with --apply to write the changes.');

// Anything still on the default region after --apply is a bug in this script; fail loudly.
if (apply) {
  const leftovers = [];
  for (const full of walk(root)) {
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (!rules.some((rule) => rule.test(rel))) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/FirebaseFunctions\.instance(?!For)\b/.test(text) || /getFunctions\(\s*app\s*\)/.test(text)) leftovers.push(rel);
  }
  if (leftovers.length) { console.error(`Still using the default region: ${leftovers.join(', ')}`); process.exit(1); }
  console.log('Verified: no client call site uses the default region any more.');
}
