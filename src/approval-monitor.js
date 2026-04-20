'use strict';

// (8.26) Approval-miss prevention: centralized approval_pending watcher.
//
// Before this module the monitor cron was the only thing that reacted
// to a worker sitting on an approval prompt. `c4 wait
// --interrupt-on-intervention` returned immediately once the worker
// went idle, and nothing re-armed the waiter afterwards, so an
// approval that appeared seconds later could sit unnoticed until the
// 30-minute stall-detection tick surfaced it.
//
// This module closes the gap:
//
//   - `subscribe(cb)` registers a listener. Events: enter / exit /
//     slack_alert / timeout. The same callback is what powers the
//     `/api/approvals/stream` SSE route, `c4 wait --follow`, and
//     `c4 watch-interventions`.
//   - `tick()` runs on a short interval (default 1s). For each live
//     worker it computes the public intervention shape via
//     `intervention-state.mapInterventionToPublic`. On a
//     null -> approval_pending transition the monitor fires `enter`;
//     on the reverse it fires `exit`. A worker that stays pending
//     past `slackAlertAfterMs` fires `slack_alert` once; past
//     `approvalTimeoutMs` fires `timeout` once, and — if auto-reject
//     is enabled — dispatches `onAutoReject(worker, message)` so the
//     caller can send a corrective message.
//   - `snapshot()` returns the current approval_pending workers.
//     New SSE clients receive this as an initial snapshot frame so
//     the reviewer sees existing pending approvals without waiting
//     for the next transition.
//
// The design keeps the module pure: it owns no timers on construction,
// no side effects, and no references to pty-manager internals. The
// caller (PtyManager) wires tick() onto setInterval and passes
// `getWorkers` / `slackEmit` / `onAutoReject` collaborators. This
// means approval-monitor is testable in isolation with a fake clock
// and a stub worker list.

const DEFAULT_TICK_MS = 1000;
const DEFAULT_SLACK_ALERT_AFTER_MS = 60000;          // 60s
const DEFAULT_APPROVAL_TIMEOUT_MS = 3600000;         // 1h
const DEFAULT_AUTO_REJECT = false;
const DEFAULT_AUTO_REJECT_MESSAGE =
  '[c4 monitor-gap] Auto-rejecting stale approval after 1h. ' +
  'Please restate the action or pick an alternative approach that ' +
  'does not require this approval.';

class ApprovalMonitor {
  constructor(options) {
    const opts = options || {};
    this._getWorkers = typeof opts.getWorkers === 'function'
      ? opts.getWorkers
      : () => [];
    this._now = typeof opts.now === 'function'
      ? opts.now
      : () => Date.now();
    this._slackEmit = typeof opts.slackEmit === 'function'
      ? opts.slackEmit
      : () => {};
    this._onAutoReject = typeof opts.onAutoReject === 'function'
      ? opts.onAutoReject
      : () => {};
    this._config = this._normalizeConfig(opts);
    this._listeners = new Set();
    // name -> { enteredAt, internalState, slackAlertedAt, timeoutFiredAt }
    this._state = new Map();
    this._stopped = false;
  }

  _normalizeConfig(opts) {
    const tickMs = Number.isFinite(opts.tickMs) && opts.tickMs > 0
      ? Math.floor(opts.tickMs) : DEFAULT_TICK_MS;
    const slackAlertAfterMs = Number.isFinite(opts.slackAlertAfterMs) && opts.slackAlertAfterMs >= 0
      ? Math.floor(opts.slackAlertAfterMs) : DEFAULT_SLACK_ALERT_AFTER_MS;
    const approvalTimeoutMs = Number.isFinite(opts.approvalTimeoutMs) && opts.approvalTimeoutMs >= 0
      ? Math.floor(opts.approvalTimeoutMs) : DEFAULT_APPROVAL_TIMEOUT_MS;
    const autoReject = Boolean(opts.autoReject != null ? opts.autoReject : DEFAULT_AUTO_REJECT);
    const autoRejectMessage = typeof opts.autoRejectMessage === 'string' && opts.autoRejectMessage
      ? opts.autoRejectMessage : DEFAULT_AUTO_REJECT_MESSAGE;
    return { tickMs, slackAlertAfterMs, approvalTimeoutMs, autoReject, autoRejectMessage };
  }

  configure(partial) {
    // Re-derive config on the fly so a daemon config reload picks up
    // new thresholds without re-creating the monitor.
    const merged = Object.assign({}, this._config, partial || {});
    this._config = this._normalizeConfig(merged);
    return this.getConfig();
  }

  getConfig() {
    return Object.assign({}, this._config);
  }

  subscribe(cb) {
    if (typeof cb !== 'function') return () => {};
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  listenerCount() {
    return this._listeners.size;
  }

  _emit(event) {
    // Listeners get a defensive copy so a misbehaving subscriber
    // cannot mutate another subscriber's payload.
    for (const cb of Array.from(this._listeners)) {
      try { cb(Object.assign({}, event)); }
      catch { /* listener errors must never break the tick */ }
    }
  }

  snapshot() {
    const workers = [];
    for (const [name, st] of this._state.entries()) {
      workers.push({
        name,
        enteredAt: st.enteredAt,
        internalState: st.internalState || null,
        pendingMs: Math.max(0, this._now() - st.enteredAt),
        slackAlertedAt: st.slackAlertedAt || null,
        timeoutFiredAt: st.timeoutFiredAt || null,
      });
    }
    return {
      type: 'snapshot',
      ts: this._now(),
      workers,
    };
  }

  // tick(): diff the current worker list against this._state and fire
  // transitions. Called from PtyManager's setInterval(tickMs).
  tick() {
    if (this._stopped) return { fired: [] };
    const now = this._now();
    const fired = [];
    const seen = new Set();
    const workers = this._getWorkers() || [];

    for (const row of workers) {
      if (!row || !row.name) continue;
      seen.add(row.name);
      const isPending = row.publicIntervention === 'approval_pending';
      const prev = this._state.get(row.name) || null;

      if (isPending && !prev) {
        // Transition: null -> approval_pending
        const enteredAt = row.lastInterventionAt
          ? Date.parse(row.lastInterventionAt) || now
          : now;
        const entry = {
          enteredAt,
          internalState: row.internalState || null,
          slackAlertedAt: null,
          timeoutFiredAt: null,
        };
        this._state.set(row.name, entry);
        const event = {
          type: 'enter',
          worker: row.name,
          internalState: entry.internalState,
          enteredAt,
          ts: now,
        };
        fired.push(event);
        this._emit(event);
        continue;
      }

      if (!isPending && prev) {
        // Transition: approval_pending -> null / exit
        const event = {
          type: 'exit',
          worker: row.name,
          enteredAt: prev.enteredAt,
          resolvedAt: now,
          durationMs: Math.max(0, now - prev.enteredAt),
          ts: now,
        };
        this._state.delete(row.name);
        fired.push(event);
        this._emit(event);
        continue;
      }

      if (isPending && prev) {
        // Still pending. Check slack-alert and timeout thresholds.
        const pendingMs = Math.max(0, now - prev.enteredAt);
        if (
          !prev.slackAlertedAt &&
          this._config.slackAlertAfterMs > 0 &&
          pendingMs >= this._config.slackAlertAfterMs
        ) {
          prev.slackAlertedAt = now;
          const event = {
            type: 'slack_alert',
            worker: row.name,
            enteredAt: prev.enteredAt,
            pendingMs,
            ts: now,
          };
          // Re-use 8.15 approval_request event so operators already
          // subscribed to the Slack webhook see the same channel.
          try {
            this._slackEmit('approval_request', {
              worker: row.name,
              reason: `approval_pending for ${Math.round(pendingMs / 1000)}s`,
              pendingMs,
            });
          } catch { /* never block the tick */ }
          fired.push(event);
          this._emit(event);
        }
        if (
          !prev.timeoutFiredAt &&
          this._config.approvalTimeoutMs > 0 &&
          pendingMs >= this._config.approvalTimeoutMs
        ) {
          prev.timeoutFiredAt = now;
          const action = this._config.autoReject ? 'auto_reject' : 'none';
          const event = {
            type: 'timeout',
            worker: row.name,
            enteredAt: prev.enteredAt,
            pendingMs,
            action,
            ts: now,
          };
          if (action === 'auto_reject') {
            try {
              this._onAutoReject(row.name, this._config.autoRejectMessage);
            } catch { /* never block the tick */ }
          }
          fired.push(event);
          this._emit(event);
        }
      }
    }

    // Workers that disappeared (closed, renamed) between ticks exit
    // the pending set even without an explicit state change.
    for (const name of Array.from(this._state.keys())) {
      if (seen.has(name)) continue;
      const prev = this._state.get(name);
      const event = {
        type: 'exit',
        worker: name,
        enteredAt: prev.enteredAt,
        resolvedAt: now,
        durationMs: Math.max(0, now - prev.enteredAt),
        reason: 'worker_gone',
        ts: now,
      };
      this._state.delete(name);
      fired.push(event);
      this._emit(event);
    }

    return { fired };
  }

  // Test helper: clear all tracked pending state without firing exit
  // events. Useful for tests that reset between assertions.
  _reset() {
    this._state.clear();
  }

  stop() {
    this._stopped = true;
    this._listeners.clear();
  }
}

module.exports = {
  ApprovalMonitor,
  DEFAULT_TICK_MS,
  DEFAULT_SLACK_ALERT_AFTER_MS,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  DEFAULT_AUTO_REJECT,
  DEFAULT_AUTO_REJECT_MESSAGE,
};
