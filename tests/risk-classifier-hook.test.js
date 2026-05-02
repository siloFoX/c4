'use strict';

// (v1.10.49) PreToolUse hook → risk-classifier integration.
//
// Exercises the `_handlePreToolUse` Bash branch with a stubbed
// PtyManager — no PTY spawn, no SSE wiring. Asserts:
//   - opt-in via config.riskClassifier.enabled (default off)
//   - autoDenyLevel threshold is honoured
//   - critical-rated commands blocked even with empty scope guard
//   - low-rated commands pass through
//   - block path emits a snapshot, fires SSE, returns action='deny'
//   - reasons + decoded payload land on the SSE event

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');

function _makeManager(riskCfg) {
  const m = Object.create(PtyManager.prototype);
  m.config = { riskClassifier: riskCfg || {} };
  m._sseEvents = [];
  m._emitSSE = function (type, payload) {
    this._sseEvents.push({ type, payload });
  };
  m._notifications = null;
  m._appendEventLog = () => {};
  return m;
}
function _makeWorker() {
  return {
    snapshots: [],
    scopeGuard: { hasRestrictions: () => false, checkBash: () => ({ allowed: true }) },
  };
}

describe('PreToolUse → risk-classifier integration', () => {
  it('classifier disabled (default) → no block, no SSE', () => {
    const m = _makeManager({});
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    assert.notEqual(r.action, 'deny');
    assert.equal(m._sseEvents.length <= 1, true,
      'permission event is fine; risk_deny should not fire');
    assert.ok(!m._sseEvents.some((e) => e.type === 'risk_deny'));
  });

  it('classifier enabled + critical command → action=deny', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    assert.equal(r.action, 'deny');
    assert.equal(r.riskLevel, 'critical');
    assert.match(r.reason, /risk-classifier critical/);
    assert.equal(w.snapshots.length, 1);
    assert.match(w.snapshots[0].screen, /HOOK RISK CRITICAL/);
    assert.equal(w.snapshots[0].riskBlock, true);
  });

  it('SSE risk_deny payload carries level + reasons', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    const ev = m._sseEvents.find((e) => e.type === 'risk_deny');
    assert.ok(ev, 'expected risk_deny SSE event');
    assert.equal(ev.payload.worker, 'w1');
    assert.equal(ev.payload.level, 'critical');
    assert.ok(Array.isArray(ev.payload.reasons));
    assert.ok(ev.payload.reasons.length >= 1);
    assert.ok(typeof ev.payload.reasons[0].code === 'string');
    assert.ok(typeof ev.payload.reasons[0].label === 'string');
  });

  it('autoDenyLevel=critical lets HIGH-rated commands through', () => {
    const m = _makeManager({ enabled: true, autoDenyLevel: 'critical' });
    const w = _makeWorker();
    // git push --force is HIGH per the catalog; should pass at
    // critical-only since 'high' < 'critical'.
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'git push --force origin main' }, { hook_type: 'PreToolUse' });
    assert.notEqual(r.action, 'deny');
  });

  it('autoDenyLevel=high blocks HIGH-rated commands', () => {
    const m = _makeManager({ enabled: true, autoDenyLevel: 'high' });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'git push --force origin main' }, { hook_type: 'PreToolUse' });
    assert.equal(r.action, 'deny');
    assert.equal(r.riskLevel, 'high');
  });

  it('low-rated commands always pass', () => {
    const m = _makeManager({ enabled: true, autoDenyLevel: 'low' });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'ls -la' }, { hook_type: 'PreToolUse' });
    // 'low' threshold + 'low' classification = block by spec; 'ls -la'
    // is unrated so falls into 'low'. With autoDenyLevel=low the rule
    // intentionally blocks everything. Prove the path fires by
    // checking riskLevel populates.
    assert.equal(r.action, 'deny');
    assert.equal(r.riskLevel, 'low');
  });

  it('non-Bash tools never trigger risk gate', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Read',
      { file_path: '/etc/passwd' }, { hook_type: 'PreToolUse' });
    assert.notEqual(r.action, 'deny');
    assert.ok(!m._sseEvents.some((e) => e.type === 'risk_deny'));
  });

  it('empty command short-circuits — no classifier call', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: '' }, { hook_type: 'PreToolUse' });
    assert.notEqual(r.action, 'deny');
  });

  it('invalid autoDenyLevel falls back to critical', () => {
    const m = _makeManager({ enabled: true, autoDenyLevel: 'BOGUS' });
    const w = _makeWorker();
    // git push --force (high) should NOT trigger — fallback is critical
    const r1 = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'git push --force origin main' }, { hook_type: 'PreToolUse' });
    assert.notEqual(r1.action, 'deny');
    // rm -rf / (critical) should trigger
    const w2 = _makeWorker();
    const r2 = m._handlePreToolUse('w1', w2, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    assert.equal(r2.action, 'deny');
  });

  it('dryRun mode: classifies + audits but does NOT deny', () => {
    const m = _makeManager({ enabled: true, dryRun: true });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    // Action must NOT be deny — dryRun is observation mode.
    assert.notEqual(r.action, 'deny');
    // SSE event still fires (with dryRun:true), so audit chain
    // captures it as risk.dryRun.
    const ev = m._sseEvents.find((e) => e.type === 'risk_deny');
    assert.ok(ev, 'risk_deny SSE event still emitted');
    assert.equal(ev.payload.dryRun, true);
    // Snapshot tag uses RISK DRYRUN (not HOOK RISK).
    assert.equal(w.snapshots.length, 1);
    assert.match(w.snapshots[0].screen, /RISK DRYRUN CRITICAL/);
    assert.equal(w.snapshots[0].riskBlock, false);
    assert.equal(w.snapshots[0].riskDryRun, true);
  });

  it('dryRun=false (default) preserves enforcement behaviour', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    assert.equal(r.action, 'deny');
    const ev = m._sseEvents.find((e) => e.type === 'risk_deny');
    // dryRun should be false (or undefined) on the SSE event.
    assert.notEqual(ev.payload.dryRun, true);
  });

  it('runs BEFORE scope guard (catastrophic commands blocked even when scope is permissive)', () => {
    const m = _makeManager({ enabled: true });
    const w = _makeWorker();
    // ScopeGuard would normally allow; risk gate must still fire first.
    w.scopeGuard = {
      hasRestrictions: () => true,
      checkBash: () => ({ allowed: true }), // permissive
    };
    const r = m._handlePreToolUse('w1', w, 'Bash',
      { command: 'rm -rf /' }, { hook_type: 'PreToolUse' });
    assert.equal(r.action, 'deny');
    assert.equal(r.riskLevel, 'critical');
  });
});
