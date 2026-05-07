#!/usr/bin/env node
'use strict';

// (v1.10.523) Visual snapshot diff. Compares the screenshots
// produced by scripts/i18n-visual-check.js against a baseline
// committed to tests/baseline-screenshots/. Any drift > threshold
// flagged.
//
// Workflow:
//   # First time / when intentional layout change ships
//   npm run lint:i18n-visual              # produces /tmp/c4-i18n-screens/
//   npm run snapshot:update                # copy → tests/baseline-screenshots/
//   git add tests/baseline-screenshots/
//
//   # Every CI run
//   npm run lint:i18n-visual               # fresh screenshots
//   npm run snapshot:diff                  # compare to baseline
//
// Exit codes:
//   0 = all snapshots within threshold
//   1 = drift detected (review /tmp/c4-snapshot-diff/*.png)
//   2 = setup error (missing baseline / current dirs)

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

let pixelmatch;
try {
  pixelmatch = require('pixelmatch').default ?? require('pixelmatch');
} catch (e) {
  console.error('FAIL: pixelmatch not installed. Run `npm install`.');
  process.exit(2);
}

const CURRENT_DIR = '/tmp/c4-i18n-screens';
const BASELINE_DIR = path.join(__dirname, '..', 'tests', 'baseline-screenshots');
const DIFF_DIR = '/tmp/c4-snapshot-diff';

// Per-pixel difference threshold (0..1). pixelmatch's default 0.1
// catches anti-aliasing as differences too. 0.2 trades a bit of
// sensitivity for less noise on font kerning shifts.
const PIXEL_THRESHOLD = 0.2;

// Total-pixel-mismatch threshold. We allow up to 2% pixel
// disagreement before failing. Data-dependent surfaces (Risk
// sandbox preview output, MetricsBar uptime ticker, relative
// timestamps) churn easily 1-1.5% across runs while looking
// visually identical.
const FAIL_PCT = 0.02;

if (!fs.existsSync(CURRENT_DIR)) {
  console.error(`FAIL: ${CURRENT_DIR} missing. Run \`npm run lint:i18n-visual\` first.`);
  process.exit(2);
}
if (!fs.existsSync(BASELINE_DIR)) {
  console.error(`FAIL: ${BASELINE_DIR} missing. Run \`npm run snapshot:update\` to seed it.`);
  process.exit(2);
}
fs.mkdirSync(DIFF_DIR, { recursive: true });

function readPng(file) {
  const buf = fs.readFileSync(file);
  return PNG.sync.read(buf);
}

const currentFiles = fs.readdirSync(CURRENT_DIR)
  .filter((f) => f.endsWith('.png') && !f.startsWith('_ko_flip_failed'));
const baselineFiles = new Set(fs.readdirSync(BASELINE_DIR).filter((f) => f.endsWith('.png')));

let failures = 0;
let warnings = 0;
let added = 0;

for (const file of currentFiles) {
  const cur = path.join(CURRENT_DIR, file);
  const base = path.join(BASELINE_DIR, file);
  if (!baselineFiles.has(file)) {
    console.log(`NEW   ${file} (no baseline yet — add to tests/baseline-screenshots/ if intentional)`);
    added += 1;
    continue;
  }
  baselineFiles.delete(file);

  let curPng, basePng;
  try {
    curPng = readPng(cur);
    basePng = readPng(base);
  } catch (e) {
    console.warn(`SKIP  ${file}: read error ${e.message}`);
    continue;
  }
  if (curPng.width !== basePng.width || curPng.height !== basePng.height) {
    console.log(
      `FAIL  ${file}: size changed ` +
      `${basePng.width}x${basePng.height} → ${curPng.width}x${curPng.height}`,
    );
    failures += 1;
    continue;
  }

  const diff = new PNG({ width: curPng.width, height: curPng.height });
  const mismatch = pixelmatch(
    basePng.data,
    curPng.data,
    diff.data,
    curPng.width,
    curPng.height,
    { threshold: PIXEL_THRESHOLD },
  );
  const total = curPng.width * curPng.height;
  const pct = mismatch / total;

  if (pct >= FAIL_PCT) {
    fs.writeFileSync(path.join(DIFF_DIR, file), PNG.sync.write(diff));
    console.log(
      `FAIL  ${file}: ${(pct * 100).toFixed(2)}% mismatch ` +
      `(${mismatch}/${total}) — diff at ${path.join(DIFF_DIR, file)}`,
    );
    failures += 1;
  } else if (pct > FAIL_PCT * 0.5) {
    warnings += 1;
    console.log(`WARN  ${file}: ${(pct * 100).toFixed(2)}% (under threshold)`);
  } else {
    console.log(`OK    ${file}: ${(pct * 100).toFixed(2)}%`);
  }
}

if (baselineFiles.size > 0) {
  console.log(`\n${baselineFiles.size} baseline file(s) without a current snapshot:`);
  for (const f of baselineFiles) console.log(`  ${f}`);
}

console.log(`\nResult: ${failures} failure(s), ${warnings} warning(s), ${added} new`);
if (failures > 0) {
  console.log(`Review diffs at: ${DIFF_DIR}`);
  process.exit(1);
}
process.exit(0);
