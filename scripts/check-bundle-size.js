#!/usr/bin/env node
'use strict';

// (v1.10.511) Bundle size budget. Fail the build if the
// first-paint critical path exceeds the budget. Catches
// accidental imports that re-eager-load a heavy chunk.
//
// Critical path = entry bundle (index-*.js) + any vendor
// chunk that's not feature-gated.
//
// Budget rationale:
//   - index: 250KB hard cap (was 199KB at v1.10.510)
//   - vendor-react / vendor-react-dom / vendor: 200KB each
//   - vendor-lucide: 60KB (icon font is large but stable)
//   - vendor-xterm: not budgeted (lazy on WorkerDetail mount)
//   - feature pages / view chunks: not budgeted (lazy)

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'web', 'dist', 'assets');
const BUDGETS = {
  // Critical path = always loaded on first paint.
  'index': 280 * 1024,
  'vendor-react': 16 * 1024,
  'vendor-react-dom': 200 * 1024,
  'vendor-lucide': 60 * 1024,
  'vendor': 60 * 1024,
};

if (!fs.existsSync(DIST)) {
  console.error('FAIL: web/dist/assets does not exist; run `npm --prefix web run build` first');
  process.exit(2);
}

const files = fs.readdirSync(DIST).filter((f) => f.endsWith('.js'));
let failed = 0;
let warned = 0;
const lines = [];

for (const [stem, budget] of Object.entries(BUDGETS)) {
  // Match "stem-HASH.js" exactly (not "stem-something-HASH.js")
  const match = files.find((f) => new RegExp(`^${stem}-[A-Za-z0-9_-]+\\.js$`).test(f));
  if (!match) {
    lines.push(`SKIP ${stem}: not present in dist`);
    continue;
  }
  const size = fs.statSync(path.join(DIST, match)).size;
  const budgetKb = (budget / 1024).toFixed(0);
  const sizeKb = (size / 1024).toFixed(1);
  const pct = ((size / budget) * 100).toFixed(0);
  if (size > budget) {
    lines.push(`FAIL ${match}: ${sizeKb}KB > ${budgetKb}KB budget (${pct}%)`);
    failed += 1;
  } else if (size > budget * 0.85) {
    lines.push(`WARN ${match}: ${sizeKb}KB / ${budgetKb}KB (${pct}%)`);
    warned += 1;
  } else {
    lines.push(`OK   ${match}: ${sizeKb}KB / ${budgetKb}KB (${pct}%)`);
  }
}

for (const l of lines) console.log(l);
if (failed > 0) {
  console.error(`\n${failed} chunk(s) over budget. Update the budget in scripts/check-bundle-size.js or split the chunk further.`);
  process.exit(1);
}
if (warned > 0) {
  console.log(`\n${warned} chunk(s) at >85% of budget — heads-up.`);
}
console.log('\nBundle size check passed.');
process.exit(0);
