'use strict';

// (8.15) Daemon-level Slack event emitter.
//
// Separate from src/notifications.js on purpose: Notifications owns
// buffered digest-style alerts that ride the health-check tick and the
// legacy stall path. This module is the autonomous event fabric — every
// interesting daemon state change (worker_spawn, task_start, merge_*,
// halt_detected, approval_request, ...) flows through emit() so an
// operator can watch progress from Slack alone without touching the Web
// UI. Design notes:
//
// 1. emit(eventType, payload) is the single entry point. It validates
//    the type, dedupes within a sliding window, filters by level, and
//    posts to the Slack webhook via an injectable http client (tests
//    never hit the real network). emit() is best-effort; failures are
//    swallowed so a broken webhook does not take the daemon down.
// 2. configure({webhookUrl, minLevel, dedupeWindowMs, events, enabled})
//    swaps the live config in place. A config.slack.enabled=false flip
//    suppresses every emit() without discarding queued local listeners.
// 3. listen(callback) registers an in-process subscriber. The Web UI
//    endpoint and tests use this to observe events without depending on
//    the Slack side effect. Callbacks run synchronously after the Slack
//    POST is scheduled, so a listener throw cannot block the webhook.
// 4. Recent event log is kept as an in-memory LRU (capped at 100 by
//    default) so GET /slack/events can answer without reading from disk.

const https = require('https');
const http = require('http');
const crypto = require('crypto');

const LEVELS = Object.freeze(['info', 'warn', 'error']);
const LEVEL_ORDER = Object.freeze({ info: 0, warn: 1, error: 2 });

// Canonical event types + their default severity. New types land here
// first so the level filter stays deterministic and the validator can
// reject typos at the call site.
const EVENT_LEVELS = Object.freeze({
  task_start: 'info',
  task_complete: 'info',
  worker_spawn: 'info',
  worker_close: 'info',
  merge_success: 'info',
  push_success: 'info',
  halt_detected: 'warn',
  approval_request: 'warn',
  merge_fail: 'error',
  error: 'error',
});

const EVENT_TYPES = Object.freeze(Object.keys(EVENT_LEVELS));

const DEFAULT_DEDUPE_WINDOW_MS = 60000;
const DEFAULT_RECENT_CAP = 100;

function isEventType(t) {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(EVENT_LEVELS, t);
}

function isLevel(l) {
  return typeof l === 'string' && LEVELS.includes(l);
}

function levelFor(eventType, payload) {
  if (payload && isLevel(payload.level)) return payload.level;
  return EVENT_LEVELS[eventType] || 'info';
}

function dedupeKey(eventType, payload) {
  // Key by eventType + the stable bits of payload. JSON.stringify with
  // sorted keys keeps the hash deterministic so identical events
  // collapse even when the caller passes the same fields in different
  // order.
  const base = payload && typeof payload === 'object' ? payload : {};
  const keys = Object.keys(base).sort();
  const canonical = {};
  for (const k of keys) canonical[k] = base[k];
  const hash = crypto
    .createHash('sha1')
    .update(eventType + '|' + JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 16);
  return hash;
}

function formatMessage(eventType, payload) {
  const base = payload && typeof payload === 'object' ? payload : {};
  const parts = [];
  const fields = ['worker', 'branch', 'sha', 'reason', 'message', 'error', 'task'];
  for (const f of fields) {
    const v = base[f];
    if (v == null) continue;
    const s = String(v);
    const short = s.length > 200 ? s.slice(0, 200) + '...' : s;
    parts.push(f + '=' + short);
  }
  if (parts.length === 0 && base.text) parts.push(String(base.text).slice(0, 200));
  const suffix = parts.length > 0 ? ' ' + parts.join(' ') : '';
  return '[c4:event] ' + eventType + suffix;
}

function defaultHttpClient() {
  return {
    post(url, payload) {
      return new Promise((resolve) => {
        try {
          const parsed = new URL(url);
          const lib = parsed.protocol === 'https:' ? https : http;
          const data = JSON.stringify(payload);
          const req = lib.request({
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(data),
            },
          }, (res) => {
            res.resume();
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
          });
          req.on('error', (e) => resolve({ ok: false, error: e.message }));
          req.write(data);
          req.end();
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    },
  };
}

class SlackEventEmitter {
  constructor(options) {
    const opts = options || {};
    this._config = this._normalizeConfig(opts.config || {});
    this._http = opts.httpClient || defaultHttpClient();
    this._now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this._recentCap = Number.isFinite(opts.recentCap) && opts.recentCap > 0
      ? Math.floor(opts.recentCap) : DEFAULT_RECENT_CAP;
    this._dedupe = new Map(); // key -> timestamp
    this._recent = [];
    this._listeners = [];
  }

  _normalizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const minLevel = isLevel(cfg.minLevel) ? cfg.minLevel : 'info';
    const dedupeWindowMs = Number.isFinite(cfg.dedupeWindowMs) && cfg.dedupeWindowMs >= 0
      ? Math.floor(cfg.dedupeWindowMs) : DEFAULT_DEDUPE_WINDOW_MS;
    let events;
    if (Array.isArray(cfg.events) && cfg.events.length > 0) {
      const filtered = cfg.events.filter(isEventType);
      // A nominally non-empty list that filters down to zero valid types
      // likely means the operator meant to allow everything but typoed,
      // so we fall back to the full canonical list instead of silently
      // suppressing every emit.
      events = filtered.length > 0 ? filtered : EVENT_TYPES.slice();
    } else {
      events = EVENT_TYPES.slice();
    }
    return {
      enabled: Boolean(cfg.enabled),
      webhookUrl: typeof cfg.webhookUrl === 'string' ? cfg.webhookUrl : '',
      minLevel,
      dedupeWindowMs,
      events,
    };
  }

  configure(partial) {
    const next = Object.assign({}, this._config, partial || {});
    this._config = this._normalizeConfig(next);
    // Window changed — purge entries that are already stale under the
    // new window so old hashes do not linger past their welcome.
    this._purgeStaleDedupes();
    return this.getConfig();
  }

  getConfig() {
    return {
      enabled: this._config.enabled,
      webhookUrl: this._config.webhookUrl,
      minLevel: this._config.minLevel,
      dedupeWindowMs: this._config.dedupeWindowMs,
      events: this._config.events.slice(),
    };
  }

  listen(callback) {
    if (typeof callback !== 'function') return () => {};
    this._listeners.push(callback);
    return () => {
      const idx = this._listeners.indexOf(callback);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  recentEvents(limit) {
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : this._recent.length;
    return this._recent.slice(-cap);
  }

  clearRecent() {
    this._recent = [];
    this._dedupe.clear();
  }

  async emit(eventType, payload) {
    const now = this._now();
    if (!isEventType(eventType)) {
      return { sent: false, reason: 'invalid-event-type', eventType };
    }
    const level = levelFor(eventType, payload);
    if (!isLevel(level)) {
      return { sent: false, reason: 'invalid-level', eventType, level };
    }
    if (!this._config.enabled) {
      return { sent: false, reason: 'disabled', eventType, level };
    }
    if (!this._config.events.includes(eventType)) {
      return { sent: false, reason: 'filtered-type', eventType, level };
    }
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this._config.minLevel]) {
      return { sent: false, reason: 'below-min-level', eventType, level };
    }

    const key = dedupeKey(eventType, payload);
    this._purgeStaleDedupes(now);
    const lastAt = this._dedupe.get(key);
    if (lastAt != null && (now - lastAt) < this._config.dedupeWindowMs) {
      return { sent: false, reason: 'deduped', eventType, level, key };
    }
    this._dedupe.set(key, now);

    const message = formatMessage(eventType, payload);
    const record = {
      eventType,
      level,
      payload: payload && typeof payload === 'object' ? Object.assign({}, payload) : {},
      message,
      ts: now,
      key,
    };
    this._recent.push(record);
    if (this._recent.length > this._recentCap) {
      this._recent.splice(0, this._recent.length - this._recentCap);
    }

    let postResult = { ok: false, reason: 'no-webhook' };
    if (this._config.webhookUrl) {
      try {
        postResult = await this._http.post(this._config.webhookUrl, { text: message });
      } catch (e) {
        postResult = { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    for (const cb of this._listeners.slice()) {
      try { cb(record); } catch { /* listener errors must not block emits */ }
    }

    return { sent: true, eventType, level, message, key, webhook: postResult };
  }

  _purgeStaleDedupes(nowArg) {
    const now = nowArg != null ? nowArg : this._now();
    const window = this._config.dedupeWindowMs;
    if (!(window > 0)) return;
    for (const [key, ts] of this._dedupe.entries()) {
      if ((now - ts) >= window) this._dedupe.delete(key);
    }
  }
}

let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new SlackEventEmitter(opts || {});
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  SlackEventEmitter,
  EVENT_TYPES,
  EVENT_LEVELS,
  LEVELS,
  LEVEL_ORDER,
  DEFAULT_DEDUPE_WINDOW_MS,
  DEFAULT_RECENT_CAP,
  isEventType,
  isLevel,
  levelFor,
  dedupeKey,
  formatMessage,
  defaultHttpClient,
  getShared,
  resetShared,
};
