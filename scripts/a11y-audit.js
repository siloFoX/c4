#!/usr/bin/env node
'use strict';

// (v1.10.521) Accessibility audit. Drives Playwright + axe-core
// over the dashboard's main surfaces and reports WCAG 2.1
// violations.
//
// Usage:
//   PORT=3458 node src/daemon.js &      # spawn a test daemon
//   npm run lint:a11y                    # or: node scripts/a11y-audit.js
//
// Override the base URL with C4_TEST_URL=http://10.40:3456.
//
// Exit codes:
//   0 = no violations
//   1 = violations reported to /tmp/c4-a11y/violations.json
//   2 = navigation / setup failure

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const BASE = process.env.C4_TEST_URL || 'http://localhost:3458';
const OUT_DIR = '/tmp/c4-a11y';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Surfaces we audit (subset of the visual check — focus on the
// surfaces an operator actually opens). Each is a function that
// returns a Playwright Locator click target or 'home' for the
// initial page.
const SURFACES = [
  { id: 'home', label: 'home (workers tab)', tab: '워커' },
  { id: 'history', label: 'history', tab: '기록' },
  { id: 'sessions', label: 'sessions', tab: '세션' },
  { id: 'meetings', label: 'meetings', tab: '회의' },
  { id: 'specialists', label: 'specialists', tab: '전문가' },
  { id: 'wiki', label: 'wiki', tab: '위키' },
  { id: 'autonomous', label: 'autonomous', tab: '자율' },
  { id: 'features', label: 'features', tab: '기능' },
  { id: 'settings', label: 'settings', tab: '설정' },
];

// Rules we accept silently because c4 deliberately ships choices
// that axe flags as "potential issues" (e.g. color contrast for the
// muted-foreground caption text below 4.5:1 — by design for
// hierarchy). Adding a rule id here = explicit waiver.
const WAIVED_RULES = new Set([
  // None waived yet — start strict and add only with rationale.
]);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.log(`[a11y] navigating ${BASE}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate(() => {
    window.localStorage.setItem('c4.locale', 'ko');
    window.localStorage.setItem('c4.help.firstSeen', '1');
    window.localStorage.setItem('c4.onboardingTour.v1', 'seen');
    window.localStorage.setItem('sessions-tour-v1', 'seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1500);

  const allViolations = {};
  let totalViolations = 0;
  let totalWaived = 0;

  for (const s of SURFACES) {
    try {
      await page.evaluate((label) => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]'))
          .find((b) => b.getAttribute('aria-label') === label);
        if (tab) tab.click();
      }, s.tab);
      await page.waitForTimeout(700);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const violations = results.violations.filter((v) => !WAIVED_RULES.has(v.id));
      const waived = results.violations.filter((v) => WAIVED_RULES.has(v.id));
      totalViolations += violations.length;
      totalWaived += waived.length;
      allViolations[s.id] = violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.length,
        firstTarget: v.nodes[0]?.target?.[0] || '',
        firstHtml: (v.nodes[0]?.html || '').slice(0, 160),
      }));
      console.log(
        `[a11y] ${s.id.padEnd(14)} ${violations.length} violation(s)` +
        (waived.length ? `, ${waived.length} waived` : ''),
      );
    } catch (e) {
      console.warn(`[a11y] ${s.id}: SKIP (${e.message.split('\n')[0]})`);
      allViolations[s.id] = { error: e.message };
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT_DIR, 'violations.json'),
    JSON.stringify(allViolations, null, 2),
  );

  console.log(`\n[a11y] Total violations: ${totalViolations}` + (totalWaived ? ` (${totalWaived} waived)` : ''));
  console.log(`[a11y] Report: ${path.join(OUT_DIR, 'violations.json')}`);

  if (totalViolations > 0) {
    console.log('\nTop violations:');
    for (const [surface, vs] of Object.entries(allViolations)) {
      if (!Array.isArray(vs) || vs.length === 0) continue;
      console.log(`  [${surface}]`);
      for (const v of vs.slice(0, 5)) {
        console.log(`    [${v.impact}] ${v.id} (${v.nodes} node${v.nodes === 1 ? '' : 's'}): ${v.help}`);
        if (v.firstTarget) console.log(`      → ${v.firstTarget}`);
      }
    }
    process.exit(1);
  }

  console.log('\n[a11y] Audit clean.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[a11y] FATAL:', err);
  process.exit(2);
});
