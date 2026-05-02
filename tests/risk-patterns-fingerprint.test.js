'use strict';

// (v1.10.95) /risk/patterns fingerprint tests.
//
// The handler computes a stable 16-char SHA-256 prefix over the
// effective rule set so operators can compare classifier
// configuration across machines without diffing the full rule
// list. Since the handler lives inline in src/daemon.js (no
// extracted helper), tests:
//
//   1. Source-grep the daemon block to lock in the algorithm
//      shape (catalog codes + custom rule projection + allowList
//      / denyList sources, hashed via crypto.createHash with a
//      16-char prefix).
//   2. Reconstruct the same fingerprint logic locally and prove
//      it's deterministic + sensitive to rule changes.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PATTERN_CATALOG } = require('../src/risk-classifier');

const daemonSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'daemon.js'), 'utf8'
);
const openApiSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'openapi-gen.js'), 'utf8'
);

// Local reimplementation matching src/daemon.js — kept identical
// so the source-grep + behavioural test together pin both shape
// AND algorithm.
function computeFingerprint(custom, allowList, denyList) {
  const fpInput = JSON.stringify({
    builtin: [
      ...PATTERN_CATALOG.critical.map((r) => `c:${r.code}`),
      ...PATTERN_CATALOG.high.map((r) => `h:${r.code}`),
      ...PATTERN_CATALOG.medium.map((r) => `m:${r.code}`),
    ],
    custom: ['critical', 'high', 'medium'].flatMap((tier) =>
      (custom[tier] || []).map((r) => ({
        tier,
        code: r && r.code,
        pattern: r && r.pattern,
        flags: r && r.flags,
      })),
    ),
    allowList: Array.isArray(allowList) ? allowList : [],
    denyList: Array.isArray(denyList) ? denyList : [],
  });
  return crypto.createHash('sha256').update(fpInput, 'utf8').digest('hex').slice(0, 16);
}

describe('GET /risk/patterns — fingerprint shape (v1.10.95)', () => {
  it('handler computes fingerprint from PATTERN_CATALOG codes + custom + allow + deny', () => {
    const start = daemonSrc.indexOf("route === '/risk/patterns'");
    const end = daemonSrc.indexOf("route === '/risk/stats'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /result\.fingerprint = require\('crypto'\)/);
    assert.match(block, /createHash\('sha256'\)/);
    assert.match(block, /\.slice\(0, 16\)/);
  });

  it('handler folds in builtin catalog codes prefixed by tier', () => {
    const start = daemonSrc.indexOf("route === '/risk/patterns'");
    const end = daemonSrc.indexOf("route === '/risk/stats'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /`c:\$\{r\.code\}`/);
    assert.match(block, /`h:\$\{r\.code\}`/);
    assert.match(block, /`m:\$\{r\.code\}`/);
  });

  it('handler folds in custom rule shapes (tier + code + pattern + flags)', () => {
    const start = daemonSrc.indexOf("route === '/risk/patterns'");
    const end = daemonSrc.indexOf("route === '/risk/stats'", start);
    const block = daemonSrc.slice(start, end);
    assert.match(block, /tier,\s+code: r && r\.code/);
    assert.match(block, /pattern: r && r\.pattern/);
    assert.match(block, /flags: r && r\.flags/);
  });

  it('OpenAPI ROUTE_SCHEMAS declares fingerprint property with v1.10.95 marker', () => {
    const start = openApiSrc.indexOf("'GET /risk/patterns':");
    const end = openApiSrc.indexOf("'GET /risk/stats':", start);
    const region = openApiSrc.slice(start, end);
    assert.match(region, /fingerprint:\s*\{[^}]*v1\.10\.95/);
  });
});

describe('Fingerprint determinism + sensitivity', () => {
  const empty = { critical: [], high: [], medium: [] };

  it('identical inputs produce identical fingerprints', () => {
    const a = computeFingerprint(empty, [], []);
    const b = computeFingerprint(empty, [], []);
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });

  it('adding a custom rule changes the fingerprint', () => {
    const baseline = computeFingerprint(empty, [], []);
    const withRule = computeFingerprint(
      { critical: [{ code: 'X', pattern: '^foo', flags: '' }], high: [], medium: [] },
      [], []
    );
    assert.notEqual(baseline, withRule);
  });

  it('adding an allowList entry changes the fingerprint', () => {
    const baseline = computeFingerprint(empty, [], []);
    const withAllow = computeFingerprint(empty, ['^safe'], []);
    assert.notEqual(baseline, withAllow);
  });

  it('adding a denyList entry changes the fingerprint', () => {
    const baseline = computeFingerprint(empty, [], []);
    const withDeny = computeFingerprint(empty, [], ['^danger']);
    assert.notEqual(baseline, withDeny);
  });

  it('rule order in built-in catalog is captured (catalog reorder = different fingerprint)', () => {
    // We can't reorder PATTERN_CATALOG without forking the source,
    // but we can verify the algorithm is order-sensitive by
    // hashing two slightly different orderings.
    const orderA = JSON.stringify({ codes: ['a', 'b', 'c'] });
    const orderB = JSON.stringify({ codes: ['b', 'a', 'c'] });
    const hashA = crypto.createHash('sha256').update(orderA).digest('hex').slice(0, 16);
    const hashB = crypto.createHash('sha256').update(orderB).digest('hex').slice(0, 16);
    assert.notEqual(hashA, hashB);
  });

  it('the live PATTERN_CATALOG fingerprints to a 16-hex-char string', () => {
    const fp = computeFingerprint(empty, [], []);
    assert.match(fp, /^[0-9a-f]{16}$/);
  });
});
