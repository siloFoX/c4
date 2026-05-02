'use strict';

// (v1.10.142) `c4 audit query --ruleFingerprint <fp>` flag.
//
// The daemon's /audit/query endpoint accepts a ruleFingerprint
// filter (added in v1.10.115); the CLI now exposes it. With a
// closed-port C4_URL the request fails before any classification,
// so test by source-grep for the flag-parse + query-string
// passthrough.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cliSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'cli.js'),
  'utf8'
);

describe('c4 audit query --ruleFingerprint (v1.10.142)', () => {
  it('CLI source declares --ruleFingerprint flag', () => {
    assert.match(cliSrc, /args\[i\]\s*===\s*'--ruleFingerprint'/);
  });

  it('flag value is passed through to /audit/query as query param', () => {
    // The query-string builder must include ruleFingerprint when
    // the operator passes the flag.
    assert.match(cliSrc, /qs\.set\('ruleFingerprint',\s*ruleFingerprint\)/);
  });

  it('usage line documents the flag for discoverability', () => {
    // Help text must mention the flag so operators find it.
    assert.match(cliSrc, /\[--ruleFingerprint\s+FP\]/);
  });
});
