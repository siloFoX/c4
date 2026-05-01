// Failure-pattern hint tests (TODO 8.4 / #101).

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const { findHint, PATTERNS } = require('../src/failure-patterns');

describe('failure-patterns.findHint', () => {
  it('returns null on empty inputs', () => {
    assert.strictEqual(findHint([], ''), null);
    assert.strictEqual(findHint(null, null), null);
  });

  it('matches ENOSPC -> disk full hint', () => {
    const r = findHint([{ line: 'ENOSPC: no space left on device, write', count: 2 }]);
    assert.ok(r);
    assert.strictEqual(r.id, 'enospc');
    assert.match(r.hint, /Disk full/i);
    assert.strictEqual(r.count, 2);
  });

  it('matches ESLint failure', () => {
    const r = findHint([{ line: '✖ 12 problems (12 errors, 0 warnings)', count: 1 }]);
    assert.strictEqual(r && r.id, 'eslint-fail');
  });

  it('matches merge conflict', () => {
    const r = findHint([{ line: 'CONFLICT (content): Merge conflict in src/foo.js', count: 1 }]);
    assert.strictEqual(r && r.id, 'git-conflict');
  });

  it('matches rate limit (429)', () => {
    const r = findHint([{ line: 'HTTP 429 Too Many Requests', count: 1 }]);
    assert.strictEqual(r && r.id, 'rate-limit');
  });

  it('matches port collision', () => {
    const r = findHint([{ line: 'Error: listen EADDRINUSE: address already in use 127.0.0.1:3456', count: 1 }]);
    assert.strictEqual(r && r.id, 'port-in-use');
  });

  it('prefers higher-count entries when multiple match', () => {
    const r = findHint([
      { line: 'ENOENT: no such file or directory', count: 1 },
      { line: 'EACCES: permission denied', count: 5 },
    ]);
    assert.strictEqual(r.id, 'eacces');
    assert.strictEqual(r.count, 5);
  });

  it('falls back to recent screen text when history empty', () => {
    const r = findHint([], 'JavaScript heap out of memory — process aborted');
    assert.strictEqual(r && r.id, 'oom');
    // Sample contains a snippet around the matched substring.
    assert.match(r.sample, /heap out of memory/);
  });

  it('matches Korean disk-full message', () => {
    const r = findHint([{ line: '디스크 공간이 부족합니다 — 작업 중단', count: 1 }]);
    assert.strictEqual(r && r.id, 'enospc');
  });

  it('matches Korean permission-denied message', () => {
    const r = findHint([{ line: '파일 접근 권한이 없습니다', count: 1 }]);
    assert.strictEqual(r && r.id, 'eacces');
  });

  it('returns null when nothing matches', () => {
    assert.strictEqual(findHint([{ line: 'all good, just a status update', count: 1 }]), null);
  });

  it('all PATTERNS have id, label, hint, regex', () => {
    for (const p of PATTERNS) {
      assert.ok(p.id, 'has id');
      assert.ok(p.label, 'has label');
      assert.ok(p.hint && p.hint.length > 10, 'hint substantive');
      assert.ok(p.regex instanceof RegExp);
    }
  });

  // Extended pattern coverage.
  it('matches connection-refused', () => {
    const r = findHint([{ line: 'Error: connect ECONNREFUSED 127.0.0.1:3456', count: 1 }]);
    assert.strictEqual(r && r.id, 'connection-refused');
  });
  it('matches connection-reset', () => {
    const r = findHint([{ line: 'read ECONNRESET', count: 1 }]);
    assert.strictEqual(r && r.id, 'connection-reset');
  });
  it('matches DNS lookup failure', () => {
    const r = findHint([{ line: 'getaddrinfo ENOTFOUND api.example.com', count: 1 }]);
    assert.strictEqual(r && r.id, 'dns-fail');
  });
  it('matches expired TLS cert', () => {
    const r = findHint([{ line: 'Error: certificate has expired (CERT_HAS_EXPIRED)', count: 1 }]);
    assert.strictEqual(r && r.id, 'tls-cert');
  });
  it('matches SIGKILL', () => {
    const r = findHint([{ line: 'process killed by signal SIGKILL', count: 1 }]);
    assert.strictEqual(r && r.id, 'subprocess-killed');
  });
  it('matches Node heap allocation', () => {
    const r = findHint([{ line: 'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory', count: 1 }]);
    // OOM matches first (more specific phrase); node-stack covers the
    // broader 'Allocation failed' line. Either is acceptable.
    assert.ok(r && (r.id === 'oom' || r.id === 'node-stack'));
  });
  it('matches git index.lock contention', () => {
    const r = findHint([{ line: "fatal: Unable to create '/repo/.git/index.lock': File exists. Another git process seems to be running", count: 1 }]);
    assert.strictEqual(r && r.id, 'lockfile');
  });
  it('matches npm EINTEGRITY', () => {
    const r = findHint([{ line: 'npm ERR! code EINTEGRITY npm ERR! sha512-... integrity checksum failed', count: 1 }]);
    assert.strictEqual(r && r.id, 'npm-eintegrity');
  });
});
