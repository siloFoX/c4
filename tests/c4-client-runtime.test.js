'use strict';

// Runtime exercise of the generated TS SDK against a mock fetch.
// We can't `require()` a .ts file directly, so we spawn a child node
// process with --experimental-strip-types pointed at a helper script
// that imports sdk/c4-client.ts and prints `OK <label>` /
// `FAIL <label>` for each runtime check. Parent parses stdout.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// --experimental-strip-types is Node 22.6+. Skip the suite gracefully
// on older Node so the CI matrix (Node 20 + 22) doesn't fail
// because of a feature gap.
const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
const NODE_MINOR = parseInt(process.versions.node.split('.')[1], 10);
const HAS_STRIP_TYPES = NODE_MAJOR > 22 || (NODE_MAJOR === 22 && NODE_MINOR >= 6);

describe('sdk/c4-client.ts runtime (via --experimental-strip-types)', () => {
  it('all SDK runtime checks pass', { skip: !HAS_STRIP_TYPES && 'requires Node 22.6+ --experimental-strip-types' }, () => {
    const helper = path.join(__dirname, '_helpers', 'run-sdk-runtime.mjs');
    const result = spawnSync('node', [
      '--experimental-strip-types',
      '--experimental-detect-module',
      '--no-warnings',
      helper,
    ], { encoding: 'utf8', timeout: 30000 });

    if (result.error) throw result.error;
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    // Parse summary line: `<n> pass, <n> fail`
    const summary = stdout.match(/(\d+) pass, (\d+) fail/);
    if (!summary) {
      throw new Error(`no summary line in stdout. stdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    const pass = Number(summary[1]);
    const fail = Number(summary[2]);

    // Surface each FAIL line as part of the assertion message so a
    // failure points at the specific runtime check that broke.
    const failures = stdout.split('\n').filter((l) => l.startsWith('FAIL'));

    assert.equal(fail, 0, `${fail} runtime checks failed:\n  ${failures.join('\n  ')}`);
    assert.ok(pass >= 19, `expected 19+ passing checks, got ${pass}`);
    assert.equal(result.status, 0, `helper exited ${result.status}`);
  });
});
