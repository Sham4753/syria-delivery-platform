#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v firebase >/dev/null || { echo 'Firebase CLI غير مثبت. نفّذ: npm install -g firebase-tools && firebase login'; exit 1; }
command -v node >/dev/null || { echo 'Node.js غير مثبت.'; exit 1; }
if [ ! -d functions/node_modules ]; then (cd functions && npm install); fi
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export GCLOUD_PROJECT=demo-syria-delivery
firebase emulators:start --only auth,firestore,functions > .emulator.log 2>&1 &
EMULATOR_PID=$!
cleanup() { kill "$EMULATOR_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4000 >/dev/null 2>&1 || curl -fsS http://127.0.0.1:8080 >/dev/null 2>&1; then break; fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then cat .emulator.log; exit 1; fi
  sleep 1
done
node scripts/seed-emulator.js
echo
echo '=== Syria Delivery Local Emulator جاهز ==='
echo 'Emulator UI: http://127.0.0.1:4000'
echo 'Admin:   admin@test.local / test123456'
echo 'Vendor:  vendor@test.local / test123456'
echo 'Courier: courier@test.local / test123456'
echo 'Customer: customer@test.local / test123456'
echo
echo 'شغّل التطبيقات في نوافذ منفصلة كما هو موضح في README.'
echo 'اترك هذه النافذة مفتوحة لإبقاء المحاكيات تعمل.'
wait "$EMULATOR_PID"
