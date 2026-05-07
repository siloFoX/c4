#!/usr/bin/env node
'use strict';

// (v1.10.535) Console error audit. Drives Playwright over the
// dashboard's main surfaces and asserts no `console.error()` /
// `console.warn()` fires from app code during navigation.
//
// Usage:
//   PORT=3458 node src/daemon.js &      # spawn a test daemon
//   npm run lint:console                # or: node scripts/console-error-audit.js
//
// Override the base URL with C4_TEST_URL=http://10.40:3456.
//
// Exit codes:
//   0 = no errors / warnings (or only ignored ones)
//   1 = console errors / warnings fired during navigation
//   2 = navigation / setup failure

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.C4_TEST_URL || 'http://localhost:3458';
const OUT_DIR = '/tmp/c4-console-audit';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Surfaces to walk. Same set as a11y-audit.js so the two
// gates cover the same surface area.
const SURFACES = [
  { id: 'home', tab: '워커' },
  { id: 'history', tab: '기록' },
  { id: 'sessions', tab: '세션' },
  { id: 'meetings', tab: '회의' },
  { id: 'specialists', tab: '전문가' },
  { id: 'wiki', tab: '위키' },
  { id: 'autonomous', tab: '자율' },
  { id: 'features', tab: '기능' },
  { id: 'settings', tab: '설정' },
];

// Patterns we deliberately ignore. Each entry is a regex that
// matches the console message text. Use sparingly and document
// the rationale.
const IGNORE_PATTERNS = [
  // Vite HMR warnings during dev server runs (only fires when
  // BASE points at a dev server, not the production build).
  /\[vite\]/i,
  // React strict-mode double-invocation warnings: not bugs in
  // app code; React intentionally double-renders effects.
  /Warning: React has detected/i,
  // Auth prompt on load: a benign 401 the app handles by
  // showing the login modal. Not an error, but the fetch
  // layer logs it.
  /HTTP 401/,
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const events = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (IGNORE_PATTERNS.some((re) => re.test(text))) return;
    events.push({ type, text, location: msg.location() });
  });
  page.on('pageerror', (err) => {
    events.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });

  console.log(`[console] navigating ${BASE}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    window.localStorage.setItem('c4.locale', 'ko');
    window.localStorage.setItem('c4.help.firstSeen', '1');
    window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
    window.localStorage.setItem('sessions-tour-v1', 'seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  for (const s of SURFACES) {
    try {
      const before = events.length;
      await page.evaluate((label) => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]'))
          .find((b) => b.getAttribute('aria-label') === label);
        if (tab) tab.click();
      }, s.tab);
      await page.waitForTimeout(700);
      const after = events.length;
      const surfaceEvents = after - before;
      console.log(`[console] ${s.id.padEnd(14)} ${surfaceEvents} new event(s)`);
    } catch (e) {
      console.warn(`[console] ${s.id}: SKIP (${e.message.split('\n')[0]})`);
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT_DIR, 'events.json'),
    JSON.stringify(events, null, 2),
  );

  if (events.length === 0) {
    console.log('\n[console] Audit clean.');
    process.exit(0);
  }

  console.log(`\n[console] ${events.length} event(s):`);
  for (const e of events.slice(0, 20)) {
    console.log(`  [${e.type}] ${e.text}`);
    if (e.location && e.location.url) {
      console.log(`    @ ${e.location.url}:${e.location.lineNumber || '?'}`);
    }
  }
  if (events.length > 20) console.log(`  ... ${events.length - 20} more (see ${path.join(OUT_DIR, 'events.json')})`);
  process.exit(1);
}

main().catch((err) => {
  console.error('[console] FATAL:', err);
  process.exit(2);
});
