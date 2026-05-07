#!/bin/sh
# (v1.10.525) Full check — runs everything `npm run check` does
# AND the daemon-dependent ones (i18n-visual, a11y, snapshot:diff)
# by spawning a temporary daemon on :3458.
#
# Used before merging large UI changes when the standard
# `npm run check` (no daemon) isn't enough.
#
# Exit codes:
#   0 = clean
#   1 = check failed (any of lint/test/build/bundle/visual/a11y/snapshot)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/4] standard check (lint + test + build + bundle)..."
npm run check

echo ""
echo "[2/4] spawning temp daemon on :3458..."
PORT=3458 node "$ROOT/src/daemon.js" > /tmp/c4-check-daemon.log 2>&1 &
DAEMON_PID=$!
trap 'kill $DAEMON_PID 2>/dev/null || true' EXIT
sleep 3

if ! curl -sf http://localhost:3458/api/health > /dev/null; then
  echo "FAIL: temp daemon failed to come up"
  cat /tmp/c4-check-daemon.log
  exit 1
fi

echo ""
echo "[3/4] visual i18n + a11y..."
node "$ROOT/scripts/i18n-visual-check.js"
node "$ROOT/scripts/a11y-audit.js"

echo ""
echo "[4/4] snapshot diff..."
node "$ROOT/scripts/visual-snapshot-diff.js"

echo ""
echo "✓ All checks passed."
