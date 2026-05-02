'use strict';

// (v1.10.60) End-to-end integration test: real PtyManager.hookEvent →
// _handlePreToolUse → SSE emit → audit chain wiring.
//
// The earlier `risk-classifier-hook.test.js` exercises
// `_handlePreToolUse` directly with a stubbed manager. The earlier
// `risk-classifier-audit.test.js` exercises the daemon's
// SSE-to-audit handler with synthetic events. Neither tests the
// pipeline end-to-end through the public hookEvent() entry point —
// the path the daemon actually takes when /api/hook-event fires.
//
// This test:
//   1. Spawns a real PtyManager with riskClassifier.enabled=true
//   2. Stubs a worker entry so hookEvent('w1', ...) finds it
//   3. Wires the daemon's SSE-to-audit handler against an in-process
//      AuditLogger pointing at a tmpdir
//   4. Calls hookEvent with a critical Bash command
//   5. Asserts the hook returns action:'deny' AND the audit chain
//      captures a `risk.denied` event with the right level / reason

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const PtyManager = require('../src/pty-manager');
const { AuditLogger } = require('../src/audit-log');

let tmpdir;
let manager;
let audit;

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-risk-e2e-'));
  audit = new AuditLogger({ logPath: path.join(tmpdir, 'audit.jsonl') });

  // Build a real PtyManager. Override config so riskClassifier is
  // enabled — production default is off.
  manager = new PtyManager({ stateDir: tmpdir });
  manager.config = {
    ...(manager.config || {}),
    riskClassifier: { enabled: true, autoDenyLevel: 'critical', notifySlack: false },
  };

  // Stub a worker entry so _handlePreToolUse has something to work
  // against. snapshots[] is the only field the deny path writes to.
  manager.workers.set('w1', {
    name: 'w1',
    snapshots: [],
    scopeGuard: { hasRestrictions: () => false, checkBash: () => ({ allowed: true }) },
    alive: true,
    proc: null,
  });

  // Wire the daemon's risk_deny → audit handler (mirror of
  // src/daemon.js v1.10.51).
  manager.on('sse', (event) => {
    if (!event || event.type !== 'risk_deny' || !event.worker) return;
    audit.record('risk.denied',
      {
        level: event.level,
        reasons: Array.isArray(event.reasons)
          ? event.reasons.map((r) => ({ code: r.code, label: r.label })).slice(0, 8)
          : [],
        command: typeof event.command === 'string' ? event.command.slice(0, 500) : '',
        decoded: typeof event.decoded === 'string' ? event.decoded.slice(0, 500) : null,
      },
      { actor: event.worker, target: event.worker },
    );
  });
});

after(() => {
  // Cleanup any timers/subscriptions PtyManager may have started.
  try { manager.stopHealthCheck && manager.stopHealthCheck(); } catch { /* nop */ }
  try { manager.stopWorktreeGc && manager.stopWorktreeGc(); } catch { /* nop */ }
  try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* nop */ }
});

describe('hookEvent → risk gate → audit chain (end-to-end)', () => {
  it('critical Bash command → deny + audit captures risk.denied', () => {
    const r = manager.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    assert.equal(r.action, 'deny');
    assert.equal(r.riskLevel, 'critical');

    // Audit chain should have one risk.denied entry.
    const events = audit.query({ type: 'risk.denied' });
    assert.equal(events.length, 1);
    assert.equal(events[0].details.level, 'critical');
    assert.equal(events[0].details.command, 'rm -rf /');
    assert.equal(events[0].actor, 'w1');
    assert.ok(events[0].details.reasons.some((x) => x.code === 'rm-rf-root'));
  });

  it('benign Bash command → no audit entry, no deny', () => {
    const before = audit.query({ type: 'risk.denied' }).length;
    const r = manager.hookEvent('w1', {
      hook_type: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    assert.notEqual(r.action, 'deny');
    const after = audit.query({ type: 'risk.denied' }).length;
    assert.equal(after, before, 'audit count should not change');
  });

  it('audit.verify() stays valid after deny event', () => {
    const verdict = audit.verify();
    assert.equal(verdict.valid, true, 'hash chain must verify');
  });

  it('classifier disabled → command passes through (config-respecting)', () => {
    // Flip the master switch off mid-test; same critical command
    // should now NOT trigger the gate.
    const beforeAudit = audit.query({ type: 'risk.denied' }).length;
    manager.config.riskClassifier.enabled = false;
    try {
      const r = manager.hookEvent('w1', {
        hook_type: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      });
      assert.notEqual(r.action, 'deny');
      const afterAudit = audit.query({ type: 'risk.denied' }).length;
      assert.equal(afterAudit, beforeAudit);
    } finally {
      manager.config.riskClassifier.enabled = true;
    }
  });

  it('autoDenyLevel=high blocks high-tier — pipe still deny + audit', () => {
    manager.config.riskClassifier.autoDenyLevel = 'high';
    try {
      const beforeAudit = audit.query({ type: 'risk.denied' }).length;
      const r = manager.hookEvent('w1', {
        hook_type: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git push --force origin main' },
      });
      assert.equal(r.action, 'deny');
      assert.equal(r.riskLevel, 'high');
      const ev = audit.query({ type: 'risk.denied' }).slice(-1)[0];
      assert.equal(ev.details.level, 'high');
      assert.ok(ev.details.reasons.some((x) => x.code === 'git-force-push'));
      assert.equal(audit.query({ type: 'risk.denied' }).length, beforeAudit + 1);
    } finally {
      manager.config.riskClassifier.autoDenyLevel = 'critical';
    }
  });
});
