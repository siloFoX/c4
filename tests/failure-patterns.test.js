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
});
