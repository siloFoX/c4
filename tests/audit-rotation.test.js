// Audit log rotation tests. Verifies that maxSizeBytes triggers a
// rename to audit-<ts>.jsonl, that the hash chain continues across
// the rotation (verify still passes when both files concatenated),
// and that `keep` caps the rotated file count.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { AuditLogger } = require('../src/audit-log');

let tmpDir;
let logPath;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-rot-'));
  logPath = path.join(tmpDir, 'audit.jsonl');
});
afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

describe('AuditLogger rotation', () => {
  it('does not rotate when maxSizeBytes is 0', () => {
    const a = new AuditLogger({ logPath });
    for (let i = 0; i < 10; i++) a.record('worker.created', { i, pad: 'x'.repeat(100) });
    const dir = fs.readdirSync(tmpDir);
    const rotated = dir.filter((n) => /^audit-.*\.jsonl$/.test(n));
    assert.strictEqual(rotated.length, 0);
  });

  it('rotates audit.jsonl when it grows past maxSizeBytes', () => {
    const a = new AuditLogger({ logPath, maxSizeBytes: 500 });
    // Two pre-rotation writes — file stays under 500.
    a.record('worker.created', { pad: 'x'.repeat(50) });
    a.record('worker.created', { pad: 'x'.repeat(50) });
    let dir = fs.readdirSync(tmpDir);
    assert.strictEqual(dir.filter((n) => /^audit-/.test(n)).length, 0, 'no rotation yet');
    // Now push past 500 with a larger record + one more to trigger.
    a.record('worker.created', { pad: 'X'.repeat(800) });
    a.record('worker.created', { trigger: true });
    dir = fs.readdirSync(tmpDir);
    const rotated = dir.filter((n) => /^audit-.*\.jsonl$/.test(n));
    assert.strictEqual(rotated.length, 1, 'one rotated file');
    const fresh = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.strictEqual(fresh.length, 1, 'fresh audit.jsonl has the post-rotation entry');
    assert.match(fresh[0], /trigger/);
  });

  it('keeps the hash chain intact across rotation', () => {
    const a = new AuditLogger({ logPath, maxSizeBytes: 200 });
    for (let i = 0; i < 8; i++) {
      a.record('task.sent', { i, pad: 'p'.repeat(60) });
    }
    const dir = fs.readdirSync(tmpDir);
    const rotatedFiles = dir.filter((n) => /^audit-.*\.jsonl$/.test(n))
      .map((n) => path.join(tmpDir, n))
      .sort((x, y) => fs.statSync(x).mtimeMs - fs.statSync(y).mtimeMs);
    assert.ok(rotatedFiles.length >= 1, 'rotation occurred');
    // Concatenate rotated + live → verify() must still pass.
    const merged = path.join(tmpDir, 'merged.jsonl');
    let combined = '';
    for (const f of rotatedFiles) combined += fs.readFileSync(f, 'utf8');
    combined += fs.readFileSync(logPath, 'utf8');
    fs.writeFileSync(merged, combined);
    const verifier = new AuditLogger({ logPath: merged });
    const r = verifier.verify();
    assert.strictEqual(r.valid, true, 'hash chain valid across rotation boundaries');
    assert.ok(r.total >= 8, `${r.total} events`);
  });

  it('keep=N retains only the newest N rotated files', () => {
    const a = new AuditLogger({ logPath, maxSizeBytes: 100, keep: 2 });
    for (let i = 0; i < 12; i++) {
      a.record('task.sent', { i, pad: 'q'.repeat(50) });
    }
    const dir = fs.readdirSync(tmpDir);
    const rotated = dir.filter((n) => /^audit-.*\.jsonl$/.test(n));
    assert.ok(rotated.length <= 2, `expected ≤2 rotated, got ${rotated.length}`);
  });
});
