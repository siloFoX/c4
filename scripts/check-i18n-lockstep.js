#!/usr/bin/env node
'use strict';

// (v1.10.517) i18n lockstep check. en.json and ko.json must hold
// the exact same keyset — otherwise locale flips render either
// blank cells (key in en, missing in ko) or unused dead keys.
//
// Usage:
//   node scripts/check-i18n-lockstep.js
//
// Exit codes:
//   0 = lockstep
//   1 = drift detected (missing keys in either bundle)

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '..', 'web', 'src', 'i18n');
const EN_PATH = path.join(I18N_DIR, 'en.json');
const KO_PATH = path.join(I18N_DIR, 'ko.json');

function loadKeys(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const obj = JSON.parse(raw);
  return new Set(Object.keys(obj));
}

const en = loadKeys(EN_PATH);
const ko = loadKeys(KO_PATH);

const inEnNotKo = [...en].filter((k) => !ko.has(k)).sort();
const inKoNotEn = [...ko].filter((k) => !en.has(k)).sort();

console.log(`en.json: ${en.size} keys`);
console.log(`ko.json: ${ko.size} keys`);

if (inEnNotKo.length === 0 && inKoNotEn.length === 0) {
  console.log('✓ Lockstep — same keyset on both sides.');
  process.exit(0);
}

if (inEnNotKo.length > 0) {
  console.error(`\n✗ ${inEnNotKo.length} keys missing from ko.json:`);
  for (const k of inEnNotKo.slice(0, 30)) console.error(`  ${k}`);
  if (inEnNotKo.length > 30) console.error(`  ... +${inEnNotKo.length - 30} more`);
}

if (inKoNotEn.length > 0) {
  console.error(`\n✗ ${inKoNotEn.length} keys missing from en.json (likely dead translations):`);
  for (const k of inKoNotEn.slice(0, 30)) console.error(`  ${k}`);
  if (inKoNotEn.length > 30) console.error(`  ... +${inKoNotEn.length - 30} more`);
}

process.exit(1);
