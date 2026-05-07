#!/bin/sh
# (v1.10.525) Full check — runs everything `npm run check` does
# AND the daemon-dependent ones (i18n-visual, a11y, console,
# snapshot:diff) by spawning a temporary daemon on :3458.
#
# Used before merging large UI changes when the standard
# `npm run check` (no daemon) isn't enough.
#
# Each daemon-dependent step runs independently — failures are
# aggregated and reported at the end so all gates fire on every
# run (rather than short-circuiting after the first failure).
#
# Exit codes:
#   0 = clean
#   1 = check failed (any of lint/test/build/bundle/visual/a11y/console/snapshot)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/5] standard check (lint + test + build + bundle)..."
npm run check || exit 1

echo ""
echo "[2/5] spawning temp daemon on :3458..."
PORT=3458 node "$ROOT/src/daemon.js" > /tmp/c4-check-daemon.log 2>&1 &
DAEMON_PID=$!
trap 'kill $DAEMON_PID 2>/dev/null || true' EXIT
sleep 3

if ! curl -sf http://localhost:3458/api/health > /dev/null; then
  echo "FAIL: temp daemon failed to come up"
  cat /tmp/c4-check-daemon.log
  exit 1
fi

FAILED=""

echo ""
echo "[3/5] visual i18n + a11y..."
node "$ROOT/scripts/i18n-visual-check.js" || FAILED="${FAILED} i18n-visual"
node "$ROOT/scripts/a11y-audit.js" || FAILED="${FAILED} a11y"

echo ""
echo "[4/5] console error audit..."
node "$ROOT/scripts/console-error-audit.js" || FAILED="${FAILED} console"

echo ""
echo "[5/5] snapshot diff..."
node "$ROOT/scripts/visual-snapshot-diff.js" || FAILED="${FAILED} snapshot"

echo ""
if [ -n "$FAILED" ]; then
  echo "✗ Checks failed:${FAILED}"
  exit 1
fi
echo "✓ All checks passed."
