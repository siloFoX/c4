// 10.2 audit log tests.
// Use a tmp logs dir so we don't pollute the real one.

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PtyManager = require('../src/pty-manager');

let tmpDir;

function makeManager(extraConfig = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.workers = new Map();
  mgr.config = extraConfig;
  mgr.logsDir = tmpDir;
  return mgr;
}

describe('audit log (10.2)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('appends one JSON line per audit() call', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create', worker: 'w1' });
    mgr.audit({ actor: 'alice', action: '/task', worker: 'w1' });
    const file = path.join(tmpDir, 'audit.jsonl');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.strictEqual(first.actor, 'alice');
    assert.strictEqual(first.action, '/create');
    assert.ok(first.ts);
  });

  it('disabled config skips writes', () => {
    const mgr = makeManager({ audit: { enabled: false } });
    mgr.audit({ actor: 'a', action: '/x' });
    assert.ok(!fs.existsSync(path.join(tmpDir, 'audit.jsonl')));
  });

  it('getAudit filters by action / worker / actor', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create', worker: 'w1' });
    mgr.audit({ actor: 'bob',   action: '/task',   worker: 'w2' });
    mgr.audit({ actor: 'alice', action: '/close',  worker: 'w1' });

    const byAction = mgr.getAudit({ action: '/task' });
    assert.strictEqual(byAction.records.length, 1);
    assert.strictEqual(byAction.records[0].actor, 'bob');

    const byActor = mgr.getAudit({ actor: 'alice' });
    assert.strictEqual(byActor.records.length, 2);

    const byWorker = mgr.getAudit({ worker: 'w1' });
    assert.strictEqual(byWorker.records.length, 2);
  });

  it('getAudit returns latest first and respects limit', () => {
    const mgr = makeManager();
    for (let i = 0; i < 10; i++) {
      mgr.audit({ actor: 'a', action: '/n', worker: `w${i}` });
    }
    const r = mgr.getAudit({ limit: 3 });
    assert.strictEqual(r.records.length, 3);
    assert.strictEqual(r.records[0].worker, 'w9');
    assert.strictEqual(r.records[2].worker, 'w7');
  });

  it('getAudit returns empty when log file missing', () => {
    const mgr = makeManager();
    const r = mgr.getAudit();
    assert.deepStrictEqual(r.records, []);
  });

  it('audit never throws even on bad input', () => {
    const mgr = makeManager();
    // Force write failure by pointing logsDir at a read-only sentinel.
    mgr.logsDir = '/nonexistent/forbidden/dir';
    assert.doesNotThrow(() => mgr.audit({ actor: 'a', action: '/x' }));
  });

  // --- export ---

  it('exportAudit json returns parsed array as a string body', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create', worker: 'w1' });
    mgr.audit({ actor: 'bob',   action: '/task',   worker: 'w1' });
    const out = mgr.exportAudit({ format: 'json' });
    assert.strictEqual(out.contentType, 'application/json');
    const parsed = JSON.parse(out.body);
    assert.strictEqual(parsed.length, 2);
  });

  it('exportAudit csv emits header + rows', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create', worker: 'w1' });
    const out = mgr.exportAudit({ format: 'csv' });
    assert.strictEqual(out.contentType, 'text/csv');
    const lines = out.body.trim().split('\n');
    assert.strictEqual(lines[0], 'ts,actor,action,worker,ok,error,bodyKeys');
    assert.match(lines[1], /alice,\/create,w1/);
  });

  it('exportAudit jsonl emits one record per line', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create' });
    mgr.audit({ actor: 'alice', action: '/close'  });
    const out = mgr.exportAudit({ format: 'jsonl' });
    assert.strictEqual(out.contentType, 'application/x-ndjson');
    const lines = out.body.trim().split('\n');
    assert.strictEqual(lines.length, 2);
    assert.doesNotThrow(() => JSON.parse(lines[0]));
  });

  it('exportAudit honors filters', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/create', worker: 'w1' });
    mgr.audit({ actor: 'bob',   action: '/task',   worker: 'w2' });
    const out = mgr.exportAudit({ format: 'csv', actor: 'alice' });
    const rows = out.body.trim().split('\n').slice(1);
    assert.strictEqual(rows.length, 1);
    assert.match(rows[0], /alice,\/create/);
  });

  it('exportAudit csv quotes commas/newlines safely', () => {
    const mgr = makeManager();
    mgr.audit({ actor: 'alice', action: '/x', worker: 'has,comma', error: 'line1\nline2' });
    const out = mgr.exportAudit({ format: 'csv' });
    // Quoted worker + quoted error with embedded newline.
    assert.match(out.body, /"has,comma"/);
    assert.match(out.body, /"line1\nline2"/);
  });
});
