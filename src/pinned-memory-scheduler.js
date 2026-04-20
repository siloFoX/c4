'use strict';

// pinned-memory-scheduler (8.46)
//
// Per-worker persistent rules. A worker can be created with `--pin-memory
// <file>` or `--pin-rules <text>` (repeatable); the manager stores the
// resulting string[] under worker metadata and this scheduler re-injects
// them on a timer (default every 5 min) and immediately after an
// auto-compact event (8.45). Re-injection prepends `PINNED RULES
// REFRESHED:` so ack lines in the PTY scrollback are easy to grep for in
// tests and in the manager console.
//
// The coupling to 8.45 is intentionally loose: the scheduler subscribes to
// the `post-compact` event on the manager (an EventEmitter). If 8.45 never
// emits the event, only the interval fires. If 8.45 ships later, no change
// is needed here - emit `post-compact` with `{ worker: name }` and the
// scheduler will re-inject on the next tick of the event loop.

const fs = require('fs');
const path = require('path');

const REFRESH_PREFIX = 'PINNED RULES REFRESHED:';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_INTERVAL_MS = 10 * 1000;         // 10 seconds - sanity floor

const ROLE_TEMPLATES = {
  manager: 'role-manager',
  worker: 'role-worker',
  attached: 'role-attached',
};

function clampInterval(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MS;
  if (n < MIN_INTERVAL_MS) return MIN_INTERVAL_MS;
  return n;
}

function resolveRoleTemplate(role, rulesDir) {
  const key = typeof role === 'string' ? role.toLowerCase() : '';
  const templateName = ROLE_TEMPLATES[key];
  if (!templateName) return null;
  const file = path.join(rulesDir, `${templateName}.md`);
  try {
    const text = fs.readFileSync(file, 'utf8').trim();
    return { name: templateName, text };
  } catch {
    return { name: templateName, text: '' };
  }
}

function formatRefreshBlock(rules, opts = {}) {
  const joined = (Array.isArray(rules) ? rules : [])
    .map(r => String(r || '').trim())
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (!joined) return '';
  const tag = opts.trigger ? ` (${opts.trigger})` : '';
  return `${REFRESH_PREFIX}${tag}\n${joined}`;
}

class PinnedMemoryScheduler {
  constructor(manager, options = {}) {
    if (!manager || typeof manager.send !== 'function') {
      throw new Error('PinnedMemoryScheduler requires a manager with send()');
    }
    this.manager = manager;
    this.intervalMs = clampInterval(options.intervalMs);
    this.rulesDir = options.rulesDir || path.join(__dirname, '..', 'docs', 'rules');
    this._timers = new Map(); // name -> Timeout
    this._lastRefreshAt = new Map(); // name -> ms timestamp
    this._onPostCompact = (payload) => this._handlePostCompact(payload);
    this._subscribed = false;
  }

  // Subscribe to manager events. Call once after construction.
  attach() {
    if (this._subscribed) return;
    if (typeof this.manager.on === 'function') {
      this.manager.on('post-compact', this._onPostCompact);
      this._subscribed = true;
    }
  }

  detach() {
    if (!this._subscribed) return;
    if (typeof this.manager.off === 'function') {
      this.manager.off('post-compact', this._onPostCompact);
    }
    this._subscribed = false;
    for (const t of this._timers.values()) clearInterval(t);
    this._timers.clear();
  }

  // Register a worker. Starts an interval that re-injects the effective
  // pinned memory (role template plus userRules). A worker with no rules
  // resolved is still tracked so calls to setPinnedMemory() can take effect
  // without a full re-register.
  register(name) {
    if (!name) return;
    this.unregister(name);
    const tick = () => {
      const rules = this._resolveRules(name);
      if (!rules || rules.length === 0) return;
      this._inject(name, rules, 'interval');
    };
    const timer = setInterval(tick, this.intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    this._timers.set(name, timer);
  }

  unregister(name) {
    const t = this._timers.get(name);
    if (t) {
      clearInterval(t);
      this._timers.delete(name);
    }
    this._lastRefreshAt.delete(name);
  }

  // Immediate re-injection. Used by setPinnedMemory() and by the Web UI
  // "refresh now" button. Does not reset the interval.
  refreshNow(name, trigger = 'manual') {
    const rules = this._resolveRules(name);
    if (!rules || rules.length === 0) return { ok: false, reason: 'no-rules' };
    return this._inject(name, rules, trigger);
  }

  lastRefreshAt(name) {
    return this._lastRefreshAt.get(name) || null;
  }

  _handlePostCompact(payload) {
    const name = payload && payload.worker;
    if (!name) return;
    // Re-inject immediately - auto-compact may have dropped the rules from
    // the model's context.
    this.refreshNow(name, 'post-compact');
  }

  _resolveRules(name) {
    const meta = typeof this.manager.getPinnedMemory === 'function'
      ? this.manager.getPinnedMemory(name)
      : null;
    if (!meta) return null;
    const { userRules = [], defaultTemplate = null } = meta;
    const effective = [];
    if (defaultTemplate) {
      const tpl = resolveRoleTemplate(defaultTemplate, this.rulesDir);
      if (tpl && tpl.text) effective.push(tpl.text);
    }
    for (const r of userRules) {
      if (typeof r === 'string' && r.trim()) effective.push(r.trim());
    }
    return effective;
  }

  _inject(name, rules, trigger) {
    const block = formatRefreshBlock(rules, { trigger });
    if (!block) return { ok: false, reason: 'empty' };
    this._lastRefreshAt.set(name, Date.now());
    try {
      const p = this.manager.send(name, block, false);
      if (p && typeof p.then === 'function') p.catch(() => { /* swallow */ });
    } catch {
      // swallow - worker may have exited. The next tick or post-compact will
      // retry; no point killing the scheduler for a transient send error.
    }
    return { ok: true, trigger, bytes: block.length };
  }
}

module.exports = {
  PinnedMemoryScheduler,
  REFRESH_PREFIX,
  DEFAULT_INTERVAL_MS,
  MIN_INTERVAL_MS,
  ROLE_TEMPLATES,
  clampInterval,
  resolveRoleTemplate,
  formatRefreshBlock,
};
