'use strict';

// (v1.10.537) tsconfig strict-flag pin. The web/tsconfig.json
// has been ratcheted progressively from v1.10.515 (noImplicitOverride)
// through v1.10.534 (exactOptionalPropertyTypes). All 8 strict
// flags are now enforced. This test makes the flags brittle to
// silent regression — turning one off must produce a failing test,
// not a quiet drop in safety.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const TSCONFIG_PATH = path.join(__dirname, '..', 'web', 'tsconfig.json');

// Strip line-comments + trailing commas before parsing — tsconfig
// permits both, but JSON.parse doesn't.
function readJsonc(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = raw
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(stripped);
}

describe('web/tsconfig.json strict ratchet', () => {
  const cfg = readJsonc(TSCONFIG_PATH);
  const co = cfg.compilerOptions;

  it('strict: true', () => {
    assert.strictEqual(co.strict, true, 'strict must be true');
  });

  it('noUnusedLocals: true', () => {
    assert.strictEqual(co.noUnusedLocals, true);
  });

  it('noUnusedParameters: true', () => {
    assert.strictEqual(co.noUnusedParameters, true);
  });

  it('noFallthroughCasesInSwitch: true', () => {
    assert.strictEqual(co.noFallthroughCasesInSwitch, true);
  });

  it('noImplicitOverride: true (v1.10.515)', () => {
    assert.strictEqual(co.noImplicitOverride, true);
  });

  it('noUncheckedIndexedAccess: true (v1.10.522)', () => {
    assert.strictEqual(co.noUncheckedIndexedAccess, true);
  });

  it('noPropertyAccessFromIndexSignature: true (v1.10.533)', () => {
    assert.strictEqual(co.noPropertyAccessFromIndexSignature, true);
  });

  it('exactOptionalPropertyTypes: true (v1.10.534)', () => {
    assert.strictEqual(co.exactOptionalPropertyTypes, true);
  });

  it('all 8 strict flags enabled — full ratchet', () => {
    const requiredFlags = [
      'strict',
      'noUnusedLocals',
      'noUnusedParameters',
      'noFallthroughCasesInSwitch',
      'noImplicitOverride',
      'noUncheckedIndexedAccess',
      'noPropertyAccessFromIndexSignature',
      'exactOptionalPropertyTypes',
    ];
    for (const flag of requiredFlags) {
      assert.strictEqual(
        co[flag],
        true,
        `${flag} must be true — see CHANGELOG for the version that enabled it`,
      );
    }
  });
});
