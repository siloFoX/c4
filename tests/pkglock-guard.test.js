// pkglock-guard tests (7.29).
//
// Covers src/pkglock-guard.js: the analyzeDiff detector, the buildAdvice
// formatter, and the runCli entry point used by .githooks/pre-commit.

'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

const {
  analyzeDiff,
  buildAdvice,
  runCli,
  PEER_LINE,
} = require('../src/pkglock-guard');

describe('PEER_LINE regex', () => {
  it('matches a minus-removed peer:true line', () => {
    assert.ok(PEER_LINE.test('-      "peer": true,'));
  });
  it('matches a plus-added peer:true line', () => {
    assert.ok(PEER_LINE.test('+      "peer": true,'));
  });
  it('matches peer:true without trailing comma (last key case)', () => {
    assert.ok(PEER_LINE.test('-      "peer": true'));
  });
  it('does not match an integrity line', () => {
    assert.ok(!PEER_LINE.test('-      "integrity": "sha512-..."'));
  });
  it('does not match a dev:true line', () => {
    assert.ok(!PEER_LINE.test('-      "dev": true,'));
  });
});

describe('analyzeDiff', () => {
  it('returns not-drift on empty string', () => {
    assert.deepStrictEqual(analyzeDiff(''), {
      isPeerDriftOnly: false,
      peerLines: 0,
      otherLines: 0,
    });
  });

  it('returns not-drift on null', () => {
    assert.strictEqual(analyzeDiff(null).isPeerDriftOnly, false);
  });

  it('returns not-drift on non-string input', () => {
    assert.strictEqual(analyzeDiff(42).isPeerDriftOnly, false);
    assert.strictEqual(analyzeDiff(undefined).isPeerDriftOnly, false);
  });

  it('flags a single peer:true removal as drift', () => {
    const diff = [
      'diff --git a/web/package-lock.json b/web/package-lock.json',
      'index abc..def 100644',
      '--- a/web/package-lock.json',
      '+++ b/web/package-lock.json',
      '@@ -1,3 +1,2 @@',
      '       "license": "MIT",',
      '-      "peer": true,',
      '       "dependencies": {}',
    ].join('\n');
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 1);
    assert.strictEqual(result.otherLines, 0);
  });

  it('flags multiple peer:true removals as drift', () => {
    const diff = [
      '@@ -1,6 +1,3 @@',
      '-      "peer": true,',
      '-      "peer": true,',
      '-      "peer": true,',
    ].join('\n');
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 3);
    assert.strictEqual(result.otherLines, 0);
  });

  it('flags peer:true additions (reverse drift) as drift', () => {
    const diff = '@@ -1 +1,2 @@\n+      "peer": true,';
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 1);
    assert.strictEqual(result.otherLines, 0);
  });

  it('does not flag drift when a non-peer line also changed', () => {
    const diff = [
      '@@ -1,3 +1,3 @@',
      '-      "peer": true,',
      '+      "version": "18.3.2",',
    ].join('\n');
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, false);
    assert.strictEqual(result.peerLines, 1);
    assert.strictEqual(result.otherLines, 1);
  });

  it('does not flag drift when only non-peer lines changed', () => {
    const diff = [
      '@@ -1,2 +1,2 @@',
      '-      "version": "1.0.0",',
      '+      "version": "2.0.0",',
    ].join('\n');
    assert.strictEqual(analyzeDiff(diff).isPeerDriftOnly, false);
  });

  it('does not flag drift on an empty hunk with only headers', () => {
    const diff = [
      'diff --git a/web/package-lock.json b/web/package-lock.json',
      'index abc..def 100644',
      '--- a/web/package-lock.json',
      '+++ b/web/package-lock.json',
    ].join('\n');
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, false);
    assert.strictEqual(result.peerLines, 0);
    assert.strictEqual(result.otherLines, 0);
  });

  it('ignores context lines, hunk headers, and \\ No newline markers', () => {
    const diff = [
      'diff --git a/web/package-lock.json b/web/package-lock.json',
      'index 50c602e..2db4057 100644',
      '--- a/web/package-lock.json',
      '+++ b/web/package-lock.json',
      '@@ -66,7 +66,6 @@',
      '       "integrity": "sha512-abc==",',
      '       "dev": true,',
      '       "license": "MIT",',
      '-      "peer": true,',
      '       "dependencies": {',
      '\\ No newline at end of file',
    ].join('\n');
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 1);
    assert.strictEqual(result.otherLines, 0);
  });

  it('handles CRLF line endings', () => {
    const diff = '@@ -1 +1 @@\r\n-      "peer": true,\r\n';
    const result = analyzeDiff(diff);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 1);
  });

  it('matches the real-world web/package-lock.json drift diff fixture', () => {
    const fixture = fs.readFileSync(
      path.join(__dirname, 'fixtures', 'pkglock-peer-drift.diff'),
      'utf8'
    );
    const result = analyzeDiff(fixture);
    assert.strictEqual(result.isPeerDriftOnly, true);
    assert.strictEqual(result.peerLines, 8);
    assert.strictEqual(result.otherLines, 0);
  });
});

describe('buildAdvice', () => {
  it('includes the path and the peer-line count', () => {
    const out = buildAdvice('web/package-lock.json', 8);
    assert.ok(out.includes('web/package-lock.json'));
    assert.ok(out.includes('8'));
  });

  it('mentions npm version, git checkout, and TODO 7.29', () => {
    const out = buildAdvice('web/package-lock.json', 1);
    assert.ok(out.includes('npm --version'));
    assert.ok(out.includes('git checkout'));
    assert.ok(out.includes('7.29'));
  });

  it('says the commit proceeds (warning, not block)', () => {
    const out = buildAdvice('web/package-lock.json', 1);
    assert.ok(/warning/i.test(out));
    assert.ok(/proceeds/i.test(out));
  });
});

function captureStream() {
  let captured = '';
  return {
    write(chunk) { captured += chunk; },
    get value() { return captured; },
  };
}

describe('runCli', () => {
  it('is a no-op when no paths are given', () => {
    let spawned = 0;
    const spawn = () => { spawned += 1; return { status: 0, stdout: '' }; };
    const stderr = captureStream();
    const code = runCli(['node', 'script'], { spawn, stderr });
    assert.strictEqual(code, 0);
    assert.strictEqual(spawned, 0);
    assert.strictEqual(stderr.value, '');
  });

  it('prints advice when the staged diff is peer-drift only', () => {
    const spawn = (cmd, args) => {
      assert.strictEqual(cmd, 'git');
      assert.deepStrictEqual(args, ['diff', '--cached', '--', 'web/package-lock.json']);
      return {
        status: 0,
        stdout: '@@ -1 +1 @@\n-      "peer": true,\n',
      };
    };
    const stderr = captureStream();
    const code = runCli(['node', 'script', 'web/package-lock.json'], { spawn, stderr });
    assert.strictEqual(code, 0);
    assert.ok(stderr.value.includes('web/package-lock.json'));
    assert.ok(/peer/i.test(stderr.value));
  });

  it('stays silent when the staged diff has real dependency churn', () => {
    const spawn = () => ({
      status: 0,
      stdout: '@@ -1 +1 @@\n-      "version": "1.0.0",\n+      "version": "2.0.0",\n',
    });
    const stderr = captureStream();
    const code = runCli(['node', 'script', 'web/package-lock.json'], { spawn, stderr });
    assert.strictEqual(code, 0);
    assert.strictEqual(stderr.value, '');
  });

  it('stays silent when git diff returns a non-zero status', () => {
    const spawn = () => ({ status: 128, stdout: '', stderr: 'fatal' });
    const stderr = captureStream();
    const code = runCli(['node', 'script', 'web/package-lock.json'], { spawn, stderr });
    assert.strictEqual(code, 0);
    assert.strictEqual(stderr.value, '');
  });

  it('stays silent when git diff returns empty stdout (file not staged)', () => {
    const spawn = () => ({ status: 0, stdout: '' });
    const stderr = captureStream();
    const code = runCli(['node', 'script', 'web/package-lock.json'], { spawn, stderr });
    assert.strictEqual(code, 0);
    assert.strictEqual(stderr.value, '');
  });

  it('checks every path passed on the argv', () => {
    const seen = [];
    const spawn = (cmd, args) => {
      seen.push(args[args.length - 1]);
      return { status: 0, stdout: '' };
    };
    const stderr = captureStream();
    runCli(['node', 'script', 'a', 'b', 'c'], { spawn, stderr });
    assert.deepStrictEqual(seen, ['a', 'b', 'c']);
  });
});

describe('.githooks/pre-commit integration', () => {
  it('invokes src/pkglock-guard.js for package-lock.json paths', () => {
    const hookPath = path.join(__dirname, '..', '.githooks', 'pre-commit');
    const src = fs.readFileSync(hookPath, 'utf8');
    assert.ok(src.includes('pkglock-guard.js'), 'hook should call pkglock-guard.js');
    assert.ok(src.includes('web/package-lock.json'), 'hook should mention the web lockfile path');
  });
});
