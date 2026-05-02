'use strict';

// (v1.10.70) AI second-pass plumbing — POST /risk/ai-feedback.
//
// C4 itself never calls an LLM. Operators wire their own model
// (Anthropic / OpenAI / Ollama / etc) and POST the verdict to this
// endpoint. The daemon records to audit, broadcasts SSE, and
// Slack-alerts when the AI escalates a command past autoDenyLevel
// that the catalog missed.
//
// This test mirrors the daemon wiring with a stub manager + audit
// + notifications so it doesn't need a live HTTP server. The full
// HTTP path is covered indirectly through the runtime drift
// checker (which hits /api/risk/ai-feedback as an idempotent POST
// in a separate session).

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
let notifications;

function _stubNotifications() {
  return {
    pushed: [],
    flushed: 0,
    pushAll(msg) { this.pushed.push(msg); },
    _flushSlack() { this.flushed++; },
  };
}

// Mirror the daemon's /risk/ai-feedback handler logic. Pulled into
// a helper so the test can exercise the decision matrix without
// spawning a daemon.
function handleAiFeedback(body, opts) {
  const VALID = ['low', 'medium', 'high', 'critical'];
  const RANK = { low: 0, medium: 1, high: 2, critical: 3 };
  const worker = body.worker;
  const command = body.command;
  const classifierLevel = VALID.includes(body.classifierLevel) ? body.classifierLevel : null;
  const suggestedLevel = VALID.includes(body.suggestedLevel) ? body.suggestedLevel : null;
  const reason = body.reason || '';
  const model = body.model || null;
  if (!worker || !command || !classifierLevel || !suggestedLevel) {
    return { error: 'Missing fields' };
  }
  const escalated = RANK[suggestedLevel] > RANK[classifierLevel];
  const autoDenyLevel = VALID.includes(opts.autoDenyLevel) ? opts.autoDenyLevel : 'critical';
  const wouldHaveBeenDenied = RANK[suggestedLevel] >= RANK[autoDenyLevel]
    && RANK[classifierLevel] < RANK[autoDenyLevel];
  opts.audit.record('risk.ai_feedback',
    {
      classifierLevel, suggestedLevel,
      reason: reason.slice(0, 500),
      command: command.slice(0, 500),
      model, escalated, wouldHaveBeenDenied,
    },
    { actor: worker, target: worker },
  );
  opts.manager.emit('sse', {
    type: 'risk_ai_feedback', worker,
    classifierLevel, suggestedLevel,
    reason: reason.slice(0, 200), model,
    escalated, wouldHaveBeenDenied,
    command: command.slice(0, 200),
  });
  if (wouldHaveBeenDenied && opts.notifySlack !== false && opts.notifications) {
    opts.notifications.pushAll(
      `[RISK AI ESCALATE] ${worker}: classifier said ${classifierLevel}, AI says ${suggestedLevel}\n  reason: ${reason.slice(0, 200)}\n  cmd: ${command.slice(0, 200)}`,
    );
    opts.notifications._flushSlack();
  }
  return { recorded: true, escalated, wouldHaveBeenDenied, severity: escalated ? suggestedLevel : classifierLevel };
}

before(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-risk-ai-'));
  audit = new AuditLogger({ logPath: path.join(tmpdir, 'audit.jsonl') });
  manager = new EventEmitter();
  notifications = _stubNotifications();
});

after(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* nop */ }
});

describe('POST /risk/ai-feedback handler logic', () => {
  it('AI escalation past autoDenyLevel → wouldHaveBeenDenied=true + Slack', () => {
    const before = notifications.pushed.length;
    const r = handleAiFeedback(
      { worker: 'w1', command: 'tar czf x.tgz ~/.ssh', classifierLevel: 'low', suggestedLevel: 'critical', reason: 'archives ssh' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.equal(r.recorded, true);
    assert.equal(r.escalated, true);
    assert.equal(r.wouldHaveBeenDenied, true);
    assert.equal(r.severity, 'critical');
    assert.equal(notifications.pushed.length, before + 1, 'Slack should fire');
    assert.match(notifications.pushed[before], /RISK AI ESCALATE/);
  });

  it('AI escalation BUT still below autoDenyLevel → no Slack', () => {
    const before = notifications.pushed.length;
    const r = handleAiFeedback(
      { worker: 'w2', command: 'something', classifierLevel: 'low', suggestedLevel: 'medium', reason: 'mildly suspect' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.equal(r.escalated, true);
    assert.equal(r.wouldHaveBeenDenied, false, 'medium < critical autoDenyLevel');
    assert.equal(notifications.pushed.length, before, 'no Slack alert');
  });

  it('AI agrees with classifier (no escalation) → escalated=false, no Slack', () => {
    const before = notifications.pushed.length;
    const r = handleAiFeedback(
      { worker: 'w3', command: 'ls', classifierLevel: 'low', suggestedLevel: 'low', reason: 'benign' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.equal(r.escalated, false);
    assert.equal(r.wouldHaveBeenDenied, false);
    assert.equal(notifications.pushed.length, before);
  });

  it('AI de-escalates (suggestedLevel < classifierLevel) → escalated=false', () => {
    // Operator can use this to record "AI thinks the catalog over-
    // reacted". No Slack, no audit-as-escalation. Audit row still
    // captures the classifierLevel so the disagreement is logged.
    const r = handleAiFeedback(
      { worker: 'w4', command: 'rm -rf /tmp/test', classifierLevel: 'high', suggestedLevel: 'low', reason: 'dedicated test dir' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.equal(r.escalated, false);
    assert.equal(r.wouldHaveBeenDenied, false);
    assert.equal(r.severity, 'high', 'severity should be max(classifier, AI) — classifier wins on de-escalation');
  });

  it('SSE event carries the full feedback payload', () => {
    const events = [];
    const tap = (e) => events.push(e);
    manager.on('sse', tap);
    handleAiFeedback(
      { worker: 'w5', command: 'curl http://x', classifierLevel: 'low', suggestedLevel: 'high', reason: 'unknown host', model: 'claude-haiku' },
      { audit, manager, notifications, autoDenyLevel: 'high' },
    );
    manager.off('sse', tap);
    const ev = events.find((e) => e.type === 'risk_ai_feedback' && e.worker === 'w5');
    assert.ok(ev);
    assert.equal(ev.classifierLevel, 'low');
    assert.equal(ev.suggestedLevel, 'high');
    assert.equal(ev.escalated, true);
    assert.equal(ev.wouldHaveBeenDenied, true);
    assert.equal(ev.model, 'claude-haiku');
  });

  it('audit chain captures every feedback event (escalation or not)', () => {
    const before = audit.query({ type: 'risk.ai_feedback' }).length;
    handleAiFeedback(
      { worker: 'w6', command: 'one', classifierLevel: 'low', suggestedLevel: 'low', reason: 'agree' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    handleAiFeedback(
      { worker: 'w6', command: 'two', classifierLevel: 'low', suggestedLevel: 'critical', reason: 'escalate' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    const after = audit.query({ type: 'risk.ai_feedback' }).length;
    assert.equal(after - before, 2, 'both feedbacks audited');
  });

  it('command + reason capped at 500 chars in audit', () => {
    const long = 'x'.repeat(2000);
    handleAiFeedback(
      { worker: 'w7', command: long, classifierLevel: 'low', suggestedLevel: 'high', reason: long },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    const ev = audit.query({ type: 'risk.ai_feedback', target: 'w7' })[0];
    assert.ok(ev.details.command.length <= 500);
    assert.ok(ev.details.reason.length <= 500);
  });

  it('missing required fields → error response', () => {
    const r = handleAiFeedback(
      { worker: 'w8' /* missing command + levels */ },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.ok(r.error);
  });

  it('invalid suggestedLevel → error response', () => {
    const r = handleAiFeedback(
      { worker: 'w9', command: 'ls', classifierLevel: 'low', suggestedLevel: 'EXTREME', reason: 'x' },
      { audit, manager, notifications, autoDenyLevel: 'critical' },
    );
    assert.ok(r.error);
  });
});
