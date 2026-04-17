// (9.9) Manager-Worker validation object tests
// Exercises src/validation.js directly: JSON extraction, synthesis
// fallback, pre-merge gate, missing-file sentinel. The module has no
// node-pty dependency so the tests can require it without the regex +
// new Function extraction trick used for pty-manager helpers.

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  VALIDATION_FILENAME,
  TEST_STDOUT_FILENAME,
  parseValidationObject,
  readValidationFile,
  synthesizeValidation,
  captureValidation,
  extractNpmTestCount,
  checkPreMerge,
} = require('../src/validation');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-validation-test-'));
}

function writeJson(dir, obj) {
  fs.writeFileSync(path.join(dir, VALIDATION_FILENAME), JSON.stringify(obj));
}

function fakeExec(table) {
  return function exec(cmd) {
    if (cmd in table) {
      const val = table[cmd];
      if (val instanceof Error) throw val;
      return val;
    }
    const err = new Error(`unexpected exec: ${cmd}`);
    throw err;
  };
}

describe('(9.9) parseValidationObject', () => {
  test('(a) parses well-formed JSON string into canonical shape', () => {
    const raw = JSON.stringify({
      test_passed: true,
      test_count: 42,
      files_changed: ['src/a.js', 'src/b.js'],
      merge_commit_hash: 'abc123',
      lint_clean: true,
      implementation_summary: 'added validation',
    });
    const v = parseValidationObject(raw);
    expect(v).toEqual({
      test_passed: true,
      test_count: 42,
      files_changed: ['src/a.js', 'src/b.js'],
      merge_commit_hash: 'abc123',
      lint_clean: true,
      implementation_summary: 'added validation',
      _source: 'file',
    });
  });

  test('(a) fills defaults for missing fields so callers can trust the shape', () => {
    const v = parseValidationObject('{}');
    expect(v.test_passed).toBe(false);
    expect(v.test_count).toBe(0);
    expect(v.files_changed).toEqual([]);
    expect(v.merge_commit_hash).toBe('');
    expect(v.lint_clean).toBe(false);
    expect(v.implementation_summary).toBe('');
  });

  test('(a) coerces truthy non-boolean test_passed to false (strict === true)', () => {
    const v = parseValidationObject(JSON.stringify({ test_passed: 'yes' }));
    expect(v.test_passed).toBe(false);
  });

  test('(a) accepts an already-parsed object, not only JSON strings', () => {
    const v = parseValidationObject({ test_passed: true, test_count: 3 });
    expect(v.test_passed).toBe(true);
    expect(v.test_count).toBe(3);
  });

  test('(a) malformed JSON returns null, not a thrown error', () => {
    expect(parseValidationObject('{not-json')).toBeNull();
  });

  test('(a) empty / non-object inputs return null', () => {
    expect(parseValidationObject('')).toBeNull();
    expect(parseValidationObject(null)).toBeNull();
    expect(parseValidationObject(undefined)).toBeNull();
    expect(parseValidationObject('[]')).toBeNull();
    expect(parseValidationObject('"string"')).toBeNull();
  });

  test('(a) test_count coerces numeric strings and floors fractional values', () => {
    expect(parseValidationObject('{"test_count":"12"}').test_count).toBe(12);
    expect(parseValidationObject('{"test_count":12.9}').test_count).toBe(12);
    expect(parseValidationObject('{"test_count":-1}').test_count).toBe(0);
    expect(parseValidationObject('{"test_count":"bad"}').test_count).toBe(0);
  });

  test('(a) files_changed stringifies non-string entries for safety', () => {
    const v = parseValidationObject('{"files_changed":["a.js", 42, null]}');
    expect(v.files_changed).toEqual(['a.js', '42', 'null']);
  });
});

describe('(9.9) readValidationFile', () => {
  let tmp;
  test('(a) reads and parses .c4-validation.json from worktree root', () => {
    tmp = mkTmpDir();
    writeJson(tmp, {
      test_passed: true,
      test_count: 5,
      files_changed: ['a.js'],
      merge_commit_hash: 'deadbeef',
      lint_clean: true,
      implementation_summary: 'x',
    });
    const v = readValidationFile(tmp);
    expect(v.test_passed).toBe(true);
    expect(v.test_count).toBe(5);
    expect(v._source).toBe('file');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('(d) missing file returns null', () => {
    tmp = mkTmpDir();
    expect(readValidationFile(tmp)).toBeNull();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('(d) null / empty worktree path returns null (no crash)', () => {
    expect(readValidationFile(null)).toBeNull();
    expect(readValidationFile('')).toBeNull();
    expect(readValidationFile(undefined)).toBeNull();
  });

  test('(d) malformed JSON file returns null, not thrown', () => {
    tmp = mkTmpDir();
    fs.writeFileSync(path.join(tmp, VALIDATION_FILENAME), '{broken');
    expect(readValidationFile(tmp)).toBeNull();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('(d) fs.readFileSync failure surfaces as null (injected fsImpl)', () => {
    const fakeFs = {
      existsSync: () => true,
      readFileSync: () => { throw new Error('boom'); },
    };
    expect(readValidationFile('/nonexistent', { fsImpl: fakeFs })).toBeNull();
  });
});

describe('(9.9) synthesizeValidation', () => {
  test('(c) builds object from git diff + rev-parse + log when file is missing', () => {
    const exec = fakeExec({
      'git -C "/wt" diff main...HEAD --name-only': 'src/a.js\nsrc/b.js\n',
      'git -C "/wt" rev-parse HEAD': 'cafef00d\n',
      'git -C "/wt" log main..HEAD --format=%s': 'fix: bug one\nfeat: bug two\n',
    });
    const fakeFs = { existsSync: () => false, readFileSync: () => '' };
    const v = synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs });
    expect(v.files_changed).toEqual(['src/a.js', 'src/b.js']);
    expect(v.merge_commit_hash).toBe('cafef00d');
    expect(v.implementation_summary).toBe('fix: bug one; feat: bug two');
    expect(v.test_passed).toBe(false);
    expect(v.test_count).toBe(0);
    expect(v._source).toBe('synthesized');
  });

  test('(c) pulls test_count + test_passed from .c4-last-test.txt when present', () => {
    const exec = fakeExec({
      'git -C "/wt" diff main...HEAD --name-only': '',
      'git -C "/wt" rev-parse HEAD': 'abc\n',
      'git -C "/wt" log main..HEAD --format=%s': '',
    });
    const fakeFs = {
      existsSync: (p) => p.endsWith(TEST_STDOUT_FILENAME),
      readFileSync: () => 'Tests: 63 passed\n',
    };
    const v = synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs });
    expect(v.test_count).toBe(63);
    expect(v.test_passed).toBe(true);
  });

  test('(c) test_passed stays false when the stdout has failing tests', () => {
    const exec = fakeExec({
      'git -C "/wt" diff main...HEAD --name-only': '',
      'git -C "/wt" rev-parse HEAD': '',
      'git -C "/wt" log main..HEAD --format=%s': '',
    });
    const fakeFs = {
      existsSync: (p) => p.endsWith(TEST_STDOUT_FILENAME),
      readFileSync: () => '5 passed, 2 failed',
    };
    const v = synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs });
    expect(v.test_count).toBe(5);
    expect(v.test_passed).toBe(false);
  });

  test('(c) git failures do not throw - falls back to empty fields', () => {
    const exec = () => { throw new Error('not a git repo'); };
    const fakeFs = { existsSync: () => false, readFileSync: () => '' };
    const v = synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs });
    expect(v.files_changed).toEqual([]);
    expect(v.merge_commit_hash).toBe('');
    expect(v.implementation_summary).toBe('');
    expect(v._source).toBe('synthesized');
  });

  test('(c) uses custom mainBranch option in git commands', () => {
    let seen = null;
    const exec = (cmd) => {
      seen = (seen || '') + cmd + '\n';
      if (cmd.includes('diff')) return '';
      if (cmd.includes('rev-parse')) return 'h\n';
      if (cmd.includes('log')) return '';
      return '';
    };
    const fakeFs = { existsSync: () => false, readFileSync: () => '' };
    synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs, mainBranch: 'trunk' });
    expect(seen).toContain('diff trunk...HEAD');
    expect(seen).toContain('log trunk..HEAD');
  });

  test('(c) returns default shape when worktreePath is empty', () => {
    const v = synthesizeValidation('', null);
    expect(v.files_changed).toEqual([]);
    expect(v.test_passed).toBe(false);
    expect(v._source).toBe('synthesized');
  });
});

describe('(9.9) captureValidation (file first, fallback second)', () => {
  test('prefers .c4-validation.json when it exists', () => {
    const tmp = mkTmpDir();
    writeJson(tmp, { test_passed: true, test_count: 7 });
    const v = captureValidation(tmp, 'c4/feat');
    expect(v._source).toBe('file');
    expect(v.test_count).toBe(7);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('falls back to synthesis when the file is missing', () => {
    const tmp = mkTmpDir();
    const exec = fakeExec({
      [`git -C "${tmp.replace(/\\/g, '/')}" diff main...HEAD --name-only`]: 'src/x.js\n',
      [`git -C "${tmp.replace(/\\/g, '/')}" rev-parse HEAD`]: 'f00\n',
      [`git -C "${tmp.replace(/\\/g, '/')}" log main..HEAD --format=%s`]: 'feat: x\n',
    });
    const v = captureValidation(tmp, 'c4/feat', { exec });
    expect(v._source).toBe('synthesized');
    expect(v.files_changed).toEqual(['src/x.js']);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('(9.9) extractNpmTestCount', () => {
  test('parses Tests: N passed summary (jest-style)', () => {
    expect(extractNpmTestCount('Tests: 63 passed\n')).toBe(63);
  });

  test('parses N passed, M failed combined line', () => {
    expect(extractNpmTestCount('5 passed, 2 failed')).toBe(5);
  });

  test('parses bare N passed line', () => {
    expect(extractNpmTestCount('8 passed\n')).toBe(8);
  });

  test('returns null when the transcript has no passed tally', () => {
    expect(extractNpmTestCount('no tests here')).toBeNull();
    expect(extractNpmTestCount('')).toBeNull();
    expect(extractNpmTestCount(null)).toBeNull();
  });
});

describe('(9.9) checkPreMerge - pre-merge gate', () => {
  test('(b) rejects when validation.test_passed is false', () => {
    const v = parseValidationObject(JSON.stringify({
      test_passed: false, test_count: 0,
    }));
    const gate = checkPreMerge(v);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('test-not-passed');
    expect(gate.detail).toContain('test_passed');
  });

  test('(b) accepts when test_passed=true and no count cross-check', () => {
    const v = parseValidationObject(JSON.stringify({
      test_passed: true, test_count: 10,
    }));
    const gate = checkPreMerge(v);
    expect(gate.ok).toBe(true);
  });

  test('(b) rejects on test_count mismatch against npm test output', () => {
    const v = parseValidationObject(JSON.stringify({
      test_passed: true, test_count: 63,
    }));
    const gate = checkPreMerge(v, { npmTestCount: 58 });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('test-count-mismatch');
    expect(gate.detail).toContain('63');
    expect(gate.detail).toContain('58');
  });

  test('(b) accepts when test_count matches npm test output', () => {
    const v = parseValidationObject(JSON.stringify({
      test_passed: true, test_count: 63,
    }));
    const gate = checkPreMerge(v, { npmTestCount: 63 });
    expect(gate.ok).toBe(true);
  });

  test('(b) null npmTestCount skips the count cross-check', () => {
    const v = parseValidationObject(JSON.stringify({
      test_passed: true, test_count: 63,
    }));
    expect(checkPreMerge(v, { npmTestCount: null }).ok).toBe(true);
  });

  test('(b) missing validation object yields missing-validation reason', () => {
    const gate = checkPreMerge(null);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('missing-validation');
  });

  test('(b) synthesized object with test_passed=false rejects merge', () => {
    const exec = fakeExec({
      'git -C "/wt" diff main...HEAD --name-only': '',
      'git -C "/wt" rev-parse HEAD': 'abc\n',
      'git -C "/wt" log main..HEAD --format=%s': '',
    });
    const fakeFs = { existsSync: () => false, readFileSync: () => '' };
    const v = synthesizeValidation('/wt', 'c4/feat', { exec, fsImpl: fakeFs });
    const gate = checkPreMerge(v, { npmTestCount: 5 });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('test-not-passed');
  });
});
