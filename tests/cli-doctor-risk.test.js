'use strict';

// (v1.10.143) `c4 doctor` extended with risk fingerprint + 24h
// activity rows. The earlier rows showed enable / autoDenyLevel
// / pattern count; this release adds fingerprint and recent
// classifier denies / shadow exec / rotation counts so doctor
// surfaces operational signal alongside configured state.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cliSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'cli.js'),
  'utf8'
);

describe('c4 doctor — risk fingerprint + activity (v1.10.143)', () => {
  it('CLI source emits a risk fingerprint check', () => {
    assert.match(cliSrc, /risk fingerprint:/);
    assert.match(cliSrc, /riskCfg\.fingerprint/);
  });

  it('CLI source queries /risk/stats for 24h activity', () => {
    assert.match(cliSrc, /\/risk\/stats\?windowHours=24/);
  });

  it('activity check surfaces denies / shadow exec / rotations', () => {
    assert.match(cliSrc, /risk activity \(24h\)/);
    // The summary line builds detail strings for each non-zero
    // signal — denies always; shadow + rotations conditionally.
    assert.match(cliSrc, /denies/);
    assert.match(cliSrc, /shadow exec/);
    assert.match(cliSrc, /fingerprint rotations/);
  });

  it('rotations > 1 is flagged as warn (config changed mid-window)', () => {
    // Multiple fingerprints in a single 24h window means the
    // rule set was rotated — operator-significant, deserves a
    // warn-level surface.
    assert.match(cliSrc, /rotations\s*>\s*1/);
    assert.match(cliSrc, /level:\s*rotations\s*>\s*1\s*\?\s*'warn'/);
  });
});
