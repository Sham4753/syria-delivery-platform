#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PORT="${PORT:-4173}"
URL="http://127.0.0.1:${PORT}/"
test -s admin-dashboard/dist/index.html || { echo "Missing admin-dashboard/dist/index.html" >&2; exit 2; }
if command -v node >/dev/null 2>&1; then
  node scripts/local-demo-server.cjs &
else
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory admin-dashboard/dist &
fi
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi
printf 'Syria Delivery demo: %s\nPress Ctrl+C to stop.\n' "$URL"
wait "$SERVER_PID"
