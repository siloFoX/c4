'use strict';

// (v1.10.51) risk_deny → audit hash chain integration.
//
// The daemon listens to `manager.on('sse', ...)` for `risk_deny`
// events from the PreToolUse hook and routes them into the audit
// log so compliance reviewers can see denies alongside auth /
// worker / merge events. This test mirrors the daemon's wiring:
// spawn an AuditLogger pointed at a tmpdir, emit a synthetic
// risk_deny event, assert the audit chain captures it with the
// right type / details / hash.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { AuditLogger } = require('../src/audit-log');

let tmpdir;
let audit;
let manager;

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-risk-audit-'));
  audit = new AuditLogger({ logPath: path.join(tmpdir, 'audit.jsonl') });
  manager = new EventEmitter();

  // Mirror the daemon wiring (src/daemon.js v1.10.51 + v1.10.63).
  manager.on('sse', (event) => {
    if (!event || event.type !== 'risk_deny' || !event.worker) return;
    const auditType = event.dryRun ? 'risk.dryRun' : 'risk.denied';
    audit.record(auditType,
      {
        level: event.level,
        reasons: Array.isArray(event.reasons)
          ? event.reasons.map((r) => ({ code: r.code, label: r.label })).slice(0, 8)
          : [],
        command: typeof event.command === 'string' ? event.command.slice(0, 500) : '',
        decoded: typeof event.decoded === 'string' ? event.decoded.slice(0, 500) : null,
        dryRun: event.dryRun === true,
      },
      { actor: event.worker, target: event.worker },
    );
  });
});

after(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* nop */ }
});

describe('risk_deny → audit chain', () => {
  it('writes a risk.denied event with level + reasons + command', () => {
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-1',
      level: 'critical',
      command: 'rm -rf /',
      reasons: [
        { code: 'rm-rf-root', label: 'rm -rf / (filesystem destroy)' },
      ],
      decoded: null,
    });
    const events = audit.query({ type: 'risk.denied' });
    assert.equal(events.length, 1);
    const ev = events[0];
    assert.equal(ev.type, 'risk.denied');
    assert.equal(ev.actor, 'fixture-1');
    assert.equal(ev.target, 'fixture-1');
    assert.equal(ev.details.level, 'critical');
    assert.equal(ev.details.command, 'rm -rf /');
    assert.deepEqual(ev.details.reasons, [
      { code: 'rm-rf-root', label: 'rm -rf / (filesystem destroy)' },
    ]);
  });

  it('hash chain extends — verify() stays valid after the deny event', () => {
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-2',
      level: 'high',
      command: 'git push --force',
      reasons: [{ code: 'git-force-push', label: 'force push' }],
    });
    const verdict = audit.verify();
    assert.equal(verdict.valid, true, 'audit chain must still verify after deny');
  });

  it('preserves decoded payload when the command was obfuscated', () => {
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-3',
      level: 'critical',
      command: 'echo "cm0gLXJmIC8=" | base64 -d | sh',
      reasons: [{ code: 'eval-base64', label: 'base64 → shell' }],
      decoded: 'echo "rm -rf /" | sh',
    });
    const events = audit.query({ type: 'risk.denied', target: 'fixture-3' });
    assert.equal(events.length, 1);
    assert.equal(events[0].details.decoded, 'echo "rm -rf /" | sh');
  });

  it('caps reasons[] at 8 entries to keep audit rows bounded', () => {
    const reasons = Array.from({ length: 12 }, (_, i) => ({
      code: `code-${i}`,
      label: `label ${i}`,
    }));
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-4',
      level: 'critical',
      command: 'multi-hit',
      reasons,
    });
    const events = audit.query({ type: 'risk.denied', target: 'fixture-4' });
    assert.equal(events.length, 1);
    assert.equal(events[0].details.reasons.length, 8);
  });

  it('truncates long commands to 500 chars (audit row size guard)', () => {
    const long = 'rm -rf '.repeat(200); // ~1400 chars
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-5',
      level: 'critical',
      command: long,
      reasons: [{ code: 'rm-rf-loop', label: 'long' }],
    });
    const events = audit.query({ type: 'risk.denied', target: 'fixture-5' });
    assert.equal(events.length, 1);
    assert.ok(events[0].details.command.length <= 500);
  });

  it('dryRun event lands in risk.dryRun (not risk.denied)', () => {
    manager.emit('sse', {
      type: 'risk_deny',
      worker: 'fixture-dryrun',
      level: 'critical',
      command: 'rm -rf /',
      reasons: [{ code: 'rm-rf-root', label: 'rm -rf /' }],
      dryRun: true,
    });
    const denied = audit.query({ type: 'risk.denied', target: 'fixture-dryrun' });
    const dryRun = audit.query({ type: 'risk.dryRun', target: 'fixture-dryrun' });
    assert.equal(denied.length, 0, 'should NOT land in risk.denied');
    assert.equal(dryRun.length, 1, 'should land in risk.dryRun');
    assert.equal(dryRun[0].details.dryRun, true);
  });

  it('non-risk_deny SSE events do NOT touch the audit log', () => {
    const beforeCount = audit.query({}).length;
    manager.emit('sse', { type: 'permission', worker: 'fixture-6' });
    manager.emit('sse', { type: 'output', worker: 'fixture-6' });
    manager.emit('sse', { type: 'risk_deny' /* missing worker */ });
    const afterCount = audit.query({}).length;
    assert.equal(afterCount, beforeCount, 'count should not change');
  });
});
