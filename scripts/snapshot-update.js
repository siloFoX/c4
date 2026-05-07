#!/usr/bin/env node
'use strict';

// (v1.10.523) Update the visual baseline. Copies the latest
// /tmp/c4-i18n-screens/ over tests/baseline-screenshots/ so the
// next snapshot diff treats this state as the canon.
//
// Run after intentional UI changes:
//   npm run lint:i18n-visual    # produces /tmp/c4-i18n-screens/
//   npm run snapshot:update     # → tests/baseline-screenshots/
//   git add tests/baseline-screenshots/

const fs = require('fs');
const path = require('path');

const CURRENT_DIR = '/tmp/c4-i18n-screens';
const BASELINE_DIR = path.join(__dirname, '..', 'tests', 'baseline-screenshots');

if (!fs.existsSync(CURRENT_DIR)) {
  console.error(`FAIL: ${CURRENT_DIR} missing. Run \`npm run lint:i18n-visual\` first.`);
  process.exit(2);
}
fs.mkdirSync(BASELINE_DIR, { recursive: true });

const files = fs.readdirSync(CURRENT_DIR).filter((f) => f.endsWith('.png') && !f.startsWith('_ko_flip_failed'));
let copied = 0;
for (const file of files) {
  fs.copyFileSync(path.join(CURRENT_DIR, file), path.join(BASELINE_DIR, file));
  copied += 1;
}
console.log(`Copied ${copied} screenshot(s) → ${BASELINE_DIR}`);
console.log('Next: git add tests/baseline-screenshots/');
