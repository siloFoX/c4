// 10.7: c4 scheduler. Runs configured cron-like entries on a tick and
// dispatches them via the local PtyManager (or fleet dispatch).
//
// Schedules live in `scheduler-state.json` next to other c4 state files,
// merged with `config.schedules` at boot. Each entry:
// {
//   id: 'nightly-train',
//   cron: '0 2 * * *',                  // 5-field cron
//   task: 'Run model training',
//   target: 'local' | 'dispatch',       // dispatch via 9.7 dispatcher
//   tags: [...],                        // when target='dispatch'
//   strategy: 'least-load' | ...,
//   workerName: 'trainer',              // optional name for the worker
//   options: { branch: 'c4/train', autoMode: true },
//   enabled: true,
//   lastRunAt: null,
//   lastResult: null,
// }
//
// Tick interval: 30s by default. We round each tick down to the minute and
// fire any entry whose cron matches that minute and was not already fired
// at that minute.

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'scheduler-state.json');

class Scheduler {
  constructor(manager, opts = {}) {
    this.manager = manager;
    this.tickMs = opts.tickMs || 30000;
    this._timer = null;
    this._entries = new Map();
    this._loadState();
    this._mergeConfig();
  }

  _loadState() {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.schedules)) {
        for (const s of data.schedules) this._entries.set(s.id, s);
      }
    } catch { /* fresh */ }
  }

  _saveState() {
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify({
        schedules: Array.from(this._entries.values()),
      }, null, 2));
    } catch { /* swallow */ }
  }

  _mergeConfig() {
    const fromCfg = (this.manager.config && this.manager.config.schedules) || [];
    for (const s of fromCfg) {
      if (!s.id) continue;
      // Config wins for static fields; runtime stats from state are kept.
      const existing = this._entries.get(s.id) || {};
      this._entries.set(s.id, { ...existing, ...s, fromConfig: true });
    }
  }

  start() {
    if (this._timer) return { running: true };
    this._tick(); // run once immediately
    this._timer = setInterval(() => this._tick(), this.tickMs);
    return { running: true };
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    return { running: false };
  }

  add(entry) {
    if (!entry || !entry.id) return { error: 'id is required' };
    if (!entry.cron) return { error: 'cron is required' };
    if (!entry.task) return { error: 'task is required' };
    if (!Scheduler._validateCron(entry.cron)) return { error: `invalid cron: ${entry.cron}` };
    const merged = {
      enabled: true,
      target: 'local',
      ...entry,
      lastRunAt: null,
      lastResult: null,
      fromConfig: false,
    };
    this._entries.set(entry.id, merged);
    this._saveState();
    return { success: true, entry: merged };
  }

  remove(id) {
    const entry = this._entries.get(id);
    if (!entry) return { error: `Unknown schedule id: ${id}` };
    if (entry.fromConfig) return { error: `Schedule '${id}' came from config; remove it from config.schedules instead` };
    this._entries.delete(id);
    this._saveState();
    return { success: true };
  }

  enable(id, on = true) {
    const entry = this._entries.get(id);
    if (!entry) return { error: `Unknown schedule id: ${id}` };
    entry.enabled = !!on;
    this._saveState();
    return { success: true, enabled: entry.enabled };
  }

  list() {
    const now = new Date();
    return {
      schedules: Array.from(this._entries.values()).map((entry) => ({
        ...entry,
        nextRunAt: entry.enabled ? Scheduler._nextRunAfter(entry.cron, now) : null,
      })),
    };
  }

  // Compute the next datetime (>= base) that matches the cron expression.
  // Brute-force minute-by-minute scan capped at 31 days. Returns ISO string
  // or null when no match is found in window / invalid cron.
  static _nextRunAfter(expr, base) {
    if (!Scheduler._validateCron(expr)) return null;
    const t = new Date(base);
    t.setSeconds(0, 0);
    t.setMinutes(t.getMinutes() + 1); // start scan at next whole minute
    const limitMin = 31 * 24 * 60;
    for (let i = 0; i < limitMin; i++) {
      if (Scheduler._cronMatches(expr, t)) return t.toISOString();
      t.setMinutes(t.getMinutes() + 1);
    }
    return null;
  }

  // Force-run an entry immediately, ignoring cron + enabled.
  async runNow(id) {
    const entry = this._entries.get(id);
    if (!entry) return { error: `Unknown schedule id: ${id}` };
    return this._fire(entry, new Date());
  }

  async _tick() {
    const now = new Date();
    for (const entry of this._entries.values()) {
      if (!entry.enabled) continue;
      if (!Scheduler._cronMatches(entry.cron, now)) continue;
      // Ensure we don't double-fire within the same minute.
      if (entry.lastRunAt) {
        const last = new Date(entry.lastRunAt);
        if (last.getUTCFullYear() === now.getUTCFullYear()
          && last.getUTCMonth() === now.getUTCMonth()
          && last.getUTCDate() === now.getUTCDate()
          && last.getUTCHours() === now.getUTCHours()
          && last.getUTCMinutes() === now.getUTCMinutes()) {
          continue;
        }
      }
      await this._fire(entry, now);
    }
  }

  async _fire(entry, now) {
    let result;
    try {
      if (entry.target === 'dispatch' && typeof this.manager.dispatch === 'function') {
        result = await this.manager.dispatch({
          name: entry.workerName,
          task: entry.task,
          tags: entry.tags || [],
          strategy: entry.strategy || 'least-load',
          ...(entry.options || {}),
        });
      } else if (typeof this.manager.sendTask === 'function') {
        const name = entry.workerName || `sched-${entry.id}-${Date.now().toString(36)}`;
        if (this.manager.create) {
          this.manager.create(name, 'claude', [], {});
        }
        result = await this.manager.sendTask(name, entry.task, entry.options || {});
      } else {
        result = { error: 'manager has no dispatch/sendTask' };
      }
    } catch (e) {
      result = { error: e.message };
    }
    entry.lastRunAt = now.toISOString();
    entry.lastResult = result;
    this._saveState();
    if (typeof this.manager.audit === 'function') {
      this.manager.audit({
        actor: 'scheduler',
        action: '/scheduler/fire',
        worker: entry.workerName || null,
        ok: !(result && result.error),
        error: result && result.error ? result.error : null,
        scheduleId: entry.id,
      });
    }
    if (typeof this.manager._emitSSE === 'function') {
      this.manager._emitSSE('schedule_fire', {
        id: entry.id,
        cron: entry.cron,
        ok: !(result && result.error),
      });
    }
    // (TODO #102) Slack/notification on schedule failure. Block Kit
    // formatter maps the [SCHEDULE FAIL] prefix to a warning-color
    // attachment.
    if (result && result.error && this.manager._notifications && typeof this.manager._notifications.pushAll === 'function') {
      try {
        this.manager._notifications.pushAll(`[SCHEDULE FAIL] ${entry.id} (${entry.cron}): ${String(result.error).slice(0, 200)}`);
      } catch { /* swallow */ }
    }
    return result;
  }

  // ---- cron parsing (5 fields: minute hour day-of-month month day-of-week) ----

  static _validateCron(expr) {
    if (typeof expr !== 'string') return false;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const ranges = [
      [0, 59], [0, 23], [1, 31], [1, 12], [0, 6],
    ];
    for (let i = 0; i < 5; i++) {
      if (!Scheduler._validField(parts[i], ranges[i])) return false;
    }
    return true;
  }

  static _validField(field, [min, max]) {
    if (field === '*') return true;
    return field.split(',').every((part) => {
      const stepMatch = part.match(/^(.+)\/(\d+)$/);
      const head = stepMatch ? stepMatch[1] : part;
      if (stepMatch && (parseInt(stepMatch[2], 10) <= 0)) return false;
      if (head === '*') return true;
      const range = head.split('-');
      if (range.length === 1) {
        const n = parseInt(range[0], 10);
        return Number.isInteger(n) && n >= min && n <= max;
      }
      if (range.length === 2) {
        const a = parseInt(range[0], 10), b = parseInt(range[1], 10);
        return Number.isInteger(a) && Number.isInteger(b) && a >= min && b <= max && a <= b;
      }
      return false;
    });
  }

  static _cronMatches(expr, date) {
    if (!Scheduler._validateCron(expr)) return false;
    const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const weekday = date.getDay();
    return Scheduler._fieldMatches(m, minute, [0, 59])
      && Scheduler._fieldMatches(h, hour, [0, 23])
      && Scheduler._fieldMatches(dom, day, [1, 31])
      && Scheduler._fieldMatches(mon, month, [1, 12])
      && Scheduler._fieldMatches(dow, weekday, [0, 6]);
  }

  static _fieldMatches(field, value, [min, max]) {
    if (field === '*') return true;
    return field.split(',').some((part) => {
      const stepMatch = part.match(/^(.+)\/(\d+)$/);
      const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
      const head = stepMatch ? stepMatch[1] : part;
      let lo, hi;
      if (head === '*') { lo = min; hi = max; }
      else {
        const range = head.split('-');
        if (range.length === 1) {
          lo = parseInt(range[0], 10); hi = lo;
        } else {
          lo = parseInt(range[0], 10); hi = parseInt(range[1], 10);
        }
      }
      if (value < lo || value > hi) return false;
      return ((value - lo) % step) === 0;
    });
  }
}

module.exports = Scheduler;
