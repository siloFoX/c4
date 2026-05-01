'use strict';

// Smoke test for the COMPILED SDK at sdk/dist/c4-client.js. Runs only
// when sdk/dist/ exists — generated locally via `npm --prefix sdk run
// build` or shipped via `npm pack`. CI runs build first via the
// workflow's web build step + an explicit sdk build step (added when
// publishing).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const distPath = path.join(__dirname, '..', 'sdk', 'dist', 'c4-client.js');

describe('sdk/dist/c4-client.js (compiled)', () => {
  it('runs and behaves like the source SDK', { skip: !fs.existsSync(distPath) && 'run `cd sdk && npx tsc` to build' }, () => {
    const helper = path.join(__dirname, '_helpers', 'run-sdk-compiled.mjs');
    const result = spawnSync('node', ['--no-warnings', helper], {
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result.error) throw result.error;
    const stdout = result.stdout || '';
    const summary = stdout.match(/(\d+) pass, (\d+) fail/);
    assert.ok(summary, `no summary in stdout:\n${stdout}\n${result.stderr}`);
    assert.equal(Number(summary[2]), 0, `compiled SDK checks failed:\n${stdout}`);
    assert.ok(Number(summary[1]) >= 4, `expected 4+ checks`);
  });
});
