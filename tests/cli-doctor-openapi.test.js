'use strict';

// Verifies the v1.10.35 openapi + sdk checks added to `c4 doctor`.
// Boots the doctor in-process by exercising the same builders the
// CLI uses (openapi-gen.buildSpec + sdk file existence) — spawning
// the actual `node src/cli.js doctor` subprocess would also need
// a live daemon, which the static tests can't depend on.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSpec } = require('../src/openapi-gen');

describe('c4 doctor openapi spec check', () => {
  it('every operation has a 200 response with content', () => {
    const spec = buildSpec();
    let total = 0, withResp = 0;
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops)) {
        if (typeof op !== 'object' || !op.responses) continue;
        total++;
        const r200 = op.responses['200'];
        if (r200 && r200.content && Object.keys(r200.content).length > 0) withResp++;
      }
    }
    assert.equal(withResp, total, `${total - withResp}/${total} operations missing 200 response content`);
  });

  it('opCount > 100 (sanity floor for the daemon API surface)', () => {
    const spec = buildSpec();
    let total = 0;
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops)) {
        if (typeof op === 'object' && op.responses) total++;
      }
    }
    assert.ok(total >= 100, `expected 100+ operations, got ${total}`);
  });

  it('sdk/c4-client.ts exists and is non-trivially sized', () => {
    const sdkPath = path.resolve(__dirname, '..', 'sdk', 'c4-client.ts');
    assert.ok(fs.existsSync(sdkPath), 'sdk/c4-client.ts missing');
    const stat = fs.statSync(sdkPath);
    // The generated SDK is ~75KB at v1.10.35; 1000 bytes is the
    // floor below which someone clearly wrote a stub by hand.
    assert.ok(stat.size > 1000, `sdk/c4-client.ts unexpectedly small (${stat.size} bytes)`);
  });
});
