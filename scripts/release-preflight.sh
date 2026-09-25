#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 scripts/validate-project.py

node --check functions/index.js
(
  cd functions
  npm run lint
)
(
  cd admin-dashboard
  npm run lint
  npm run build
)

if command -v flutter >/dev/null 2>&1; then
  for app in customer_app courier_app merchant_app; do
    (cd "$app" && flutter analyze)
  done
else
  echo "NOTICE: Flutter SDK not installed; Flutter analyze/build remains pending." >&2
fi

echo "Release preflight completed. Review FINAL_ACCEPTANCE_REPORT_AR.md before production deployment."
