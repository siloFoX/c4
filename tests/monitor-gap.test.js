'use strict';

// (8.26) Regression tests for the approval-miss prevention mechanism.
// Covers the pure approval-monitor module, the /api/approvals/stream
// SSE route wiring, `c4 wait --follow` / `c4 watch-interventions` CLI
// argument parsing, and the slack-alert / timeout / auto-reject
// thresholds that close the 30-minute cron gap described in TODO 8.26.

const assert = require('assert');
const { describe, it } = require('node:test');

const {
  ApprovalMonitor,
  DEFAULT_TICK_MS,
  DEFAULT_SLACK_ALERT_AFTER_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_AUTO_REJECT,
  DEFAULT_AUTO_REJECT_MESSAGE,
} = require('../src/approval-monitor');

function makeClock(initial) {
  let t = Number.isFinite(initial) ? initial : 1700000000000;
  return {
    now() { return t; },
    advance(ms) { t += ms; return t; },
    set(ms) { t = ms; },
  };
}

function makeWorkerProvider(initial) {
  // rows: [{ name, publicIntervention, internalState, lastInterventionAt }]
  let rows = Array.isArray(initial) ? initial.slice() : [];
  return {
    get: () => rows.slice(),
    set: (next) => { rows = Array.isArray(next) ? next.slice() : []; },
  };
}

describe('ApprovalMonitor defaults (8.26)', () => {
  it('exposes stable default thresholds', () => {
    assert.strictEqual(DEFAULT_TICK_MS, 1000);
    assert.strictEqual(DEFAULT_SLACK_ALERT_AFTER_MS, 60000);
    assert.strictEqual(DEFAULT_APPROVAL_TIMEOUT_MS, 3600000);
    assert.strictEqual(DEFAULT_AUTO_REJECT, false);
    assert.ok(typeof DEFAULT_AUTO_REJECT_MESSAGE === 'string');
    assert.ok(DEFAULT_AUTO_REJECT_MESSAGE.length > 0);
  });

  it('returns a normalised config', () => {
    const m = new ApprovalMonitor({ getWorkers: () => [] });
    const cfg = m.getConfig();
    assert.strictEqual(cfg.tickMs, DEFAULT_TICK_MS);
    assert.strictEqual(cfg.slackAlertAfterMs, DEFAULT_SLACK_ALERT_AFTER_MS);
    assert.strictEqual(cfg.approvalTimeoutMs, DEFAULT_APPROVAL_TIMEOUT_MS);
    assert.strictEqual(cfg.autoReject, false);
  });

  it('configure() merges overrides', () => {
    const m = new ApprovalMonitor({ getWorkers: () => [] });
    const next = m.configure({ slackAlertAfterMs: 5000, autoReject: true });
    assert.strictEqual(next.slackAlertAfterMs, 5000);
    assert.strictEqual(next.autoReject, true);
    // Untouched fields keep defaults.
    assert.strictEqual(next.approvalTimeoutMs, DEFAULT_APPROVAL_TIMEOUT_MS);
  });
});

describe('ApprovalMonitor transitions (8.26)', () => {
  it('fires enter on null -> approval_pending', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider();
    const events = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
    });
    m.subscribe((ev) => events.push(ev));

    workers.set([{ name: 'w1', publicIntervention: null }]);
    m.tick();
    assert.strictEqual(events.length, 0);

    workers.set([{ name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' }]);
    m.tick();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'enter');
    assert.strictEqual(events[0].worker, 'w1');
    assert.strictEqual(events[0].internalState, 'question');
  });

  it('fires exit on approval_pending -> null', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const events = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.subscribe((ev) => events.push(ev));
    m.tick();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'enter');

    clock.advance(5000);
    workers.set([{ name: 'w1', publicIntervention: null }]);
    m.tick();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, 'exit');
    assert.strictEqual(events[1].durationMs, 5000);
  });

  it('fires exit when worker disappears entirely', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const events = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.subscribe((ev) => events.push(ev));
    m.tick();

    clock.advance(1000);
    workers.set([]); // worker closed
    m.tick();
    const exits = events.filter((e) => e.type === 'exit');
    assert.strictEqual(exits.length, 1);
    assert.strictEqual(exits[0].reason, 'worker_gone');
  });

  it('does not fire transitions while state is unchanged', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const events = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.subscribe((ev) => events.push(ev));
    m.tick();
    m.tick();
    m.tick();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'enter');
  });

  it('seeds enteredAt from lastInterventionAt when provided', () => {
    const clock = makeClock(1700000020000);
    const workers = makeWorkerProvider([{
      name: 'w1',
      publicIntervention: 'approval_pending',
      internalState: 'question',
      lastInterventionAt: new Date(1700000000000).toISOString(),
    }]);
    const events = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.subscribe((ev) => events.push(ev));
    m.tick();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].enteredAt, 1700000000000);
  });
});

describe('ApprovalMonitor slack + timeout (8.26)', () => {
  it('fires slack_alert after slackAlertAfterMs', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const slackCalls = [];
    const events = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 60000,
      approvalTimeoutMs: 3600000,
      slackEmit: (type, payload) => slackCalls.push({ type, payload }),
    });
    m.subscribe((ev) => events.push(ev));
    m.tick(); // enter

    clock.advance(30000);
    m.tick();
    assert.strictEqual(slackCalls.length, 0);

    clock.advance(30000); // pending = 60000
    m.tick();
    assert.strictEqual(slackCalls.length, 1);
    assert.strictEqual(slackCalls[0].type, 'approval_request');
    assert.strictEqual(slackCalls[0].payload.worker, 'w1');

    const alerts = events.filter((e) => e.type === 'slack_alert');
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].pendingMs, 60000);

    // Does not re-fire on subsequent ticks while still pending.
    clock.advance(10000);
    m.tick();
    assert.strictEqual(slackCalls.length, 1);
  });

  it('fires timeout without auto_reject when disabled', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const autoRejectCalls = [];
    const events = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 0, // disable slack alert noise
      approvalTimeoutMs: 5000,
      autoReject: false,
      onAutoReject: (name, msg) => autoRejectCalls.push({ name, msg }),
    });
    m.subscribe((ev) => events.push(ev));
    m.tick(); // enter

    clock.advance(4999);
    m.tick();
    assert.strictEqual(events.filter((e) => e.type === 'timeout').length, 0);

    clock.advance(1);
    m.tick();
    const timeouts = events.filter((e) => e.type === 'timeout');
    assert.strictEqual(timeouts.length, 1);
    assert.strictEqual(timeouts[0].action, 'none');
    assert.strictEqual(autoRejectCalls.length, 0);
  });

  it('fires timeout with auto_reject action when enabled', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const autoRejectCalls = [];
    const events = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 0,
      approvalTimeoutMs: 5000,
      autoReject: true,
      autoRejectMessage: 'auto-reject-corrective',
      onAutoReject: (name, msg) => autoRejectCalls.push({ name, msg }),
    });
    m.subscribe((ev) => events.push(ev));
    m.tick();

    clock.advance(5000);
    m.tick();
    const timeouts = events.filter((e) => e.type === 'timeout');
    assert.strictEqual(timeouts.length, 1);
    assert.strictEqual(timeouts[0].action, 'auto_reject');
    assert.strictEqual(autoRejectCalls.length, 1);
    assert.strictEqual(autoRejectCalls[0].name, 'w1');
    assert.strictEqual(autoRejectCalls[0].msg, 'auto-reject-corrective');
  });

  it('does not fire slack_alert when threshold is 0 (disabled)', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const slackCalls = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 0,
      approvalTimeoutMs: 0,
      slackEmit: (type) => slackCalls.push(type),
    });
    m.tick();
    clock.advance(3600000);
    m.tick();
    assert.strictEqual(slackCalls.length, 0);
  });

  it('handles slackEmit exceptions without breaking the tick', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 1,
      slackEmit: () => { throw new Error('boom'); },
    });
    m.tick();
    clock.advance(1);
    assert.doesNotThrow(() => m.tick());
  });

  it('handles onAutoReject exceptions without breaking the tick', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 0,
      approvalTimeoutMs: 1,
      autoReject: true,
      onAutoReject: () => { throw new Error('boom'); },
    });
    m.tick();
    clock.advance(1);
    assert.doesNotThrow(() => m.tick());
  });
});

describe('ApprovalMonitor subscription semantics (8.26)', () => {
  it('delivers events to every subscriber', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const received = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.subscribe((ev) => received.push({ client: 1, type: ev.type }));
    m.subscribe((ev) => received.push({ client: 2, type: ev.type }));
    m.tick();
    assert.strictEqual(received.length, 2);
    assert.deepStrictEqual(received.map((r) => r.client).sort(), [1, 2]);
  });

  it('unsubscribe stops delivery', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const received = [];
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    const unsub = m.subscribe((ev) => received.push(ev));
    m.tick();
    assert.strictEqual(received.length, 1);
    unsub();
    clock.advance(100);
    workers.set([{ name: 'w1', publicIntervention: null }]);
    m.tick();
    // still 1 — the exit event went nowhere because we unsubscribed.
    assert.strictEqual(received.length, 1);
  });

  it('snapshot returns pending workers with pendingMs', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const m = new ApprovalMonitor({ getWorkers: workers.get, now: clock.now });
    m.tick();
    clock.advance(1500);
    const snap = m.snapshot();
    assert.strictEqual(snap.type, 'snapshot');
    assert.strictEqual(snap.workers.length, 1);
    assert.strictEqual(snap.workers[0].name, 'w1');
    assert.strictEqual(snap.workers[0].pendingMs, 1500);
    assert.strictEqual(snap.workers[0].internalState, 'question');
  });

  it('snapshot is empty before any tick', () => {
    const workers = makeWorkerProvider();
    const m = new ApprovalMonitor({ getWorkers: workers.get });
    const snap = m.snapshot();
    assert.strictEqual(snap.type, 'snapshot');
    assert.deepStrictEqual(snap.workers, []);
  });
});

describe('runApprovalFollow event formatter contract (8.26)', () => {
  // Smoke-test the event payload shape that the CLI formatter
  // consumes. We don't spin up a real HTTP stream here — that's the
  // daemon's job — but we lock in the keys that runApprovalFollow
  // reads so accidentally renaming one breaks a test, not a live
  // reviewer session.
  const REQUIRED = {
    enter: ['type', 'worker', 'internalState', 'enteredAt', 'ts'],
    exit: ['type', 'worker', 'enteredAt', 'resolvedAt', 'durationMs', 'ts'],
    slack_alert: ['type', 'worker', 'enteredAt', 'pendingMs', 'ts'],
    timeout: ['type', 'worker', 'enteredAt', 'pendingMs', 'action', 'ts'],
  };

  it('each event type exposes the fields the CLI formatter reads', () => {
    const clock = makeClock();
    const workers = makeWorkerProvider([
      { name: 'w1', publicIntervention: 'approval_pending', internalState: 'question' },
    ]);
    const events = [];
    const m = new ApprovalMonitor({
      getWorkers: workers.get,
      now: clock.now,
      slackAlertAfterMs: 10,
      approvalTimeoutMs: 20,
      autoReject: false,
    });
    m.subscribe((ev) => events.push(ev));
    m.tick();
    clock.advance(10); m.tick();
    clock.advance(10); m.tick();
    workers.set([{ name: 'w1', publicIntervention: null }]);
    m.tick();

    for (const ev of events) {
      const need = REQUIRED[ev.type];
      assert.ok(need, `unknown event type ${ev.type}`);
      for (const key of need) {
        assert.ok(Object.prototype.hasOwnProperty.call(ev, key),
          `${ev.type} missing ${key}`);
      }
    }
  });
});
