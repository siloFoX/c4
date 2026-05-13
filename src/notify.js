'use strict';

// (v1.11.95 / TODO 11.77) Lifecycle webhook notifier for the autonomous
// loop.
//
// sendWebhook({ kind, payload, config }) posts a one-line summary to
// Slack and/or Discord when `kind` is listed in
// `config.notifications.events`. Uses Node's built-in https module — no
// external dependency. Fire-and-forget: the function returns
// synchronously after dispatching the request(s); the response is read
// only to log a single warn line on 4xx/5xx, never to retry.
//
// Config shape (top-level, opt-in):
//   {
//     notifications: {
//       slack:   'https://hooks.slack.com/...' | null,
//       discord: 'https://discord.com/api/webhooks/...' | null,
//       events:  ['halt', 'dispatch', 'complete', 'escalation']
//     }
//   }
//
// Body shapes:
//   Slack   -> { text:    '<one-line summary>' }
//   Discord -> { content: '<one-line summary>' }
//
// Escape hatches:
//   - NOTIFY_DISABLED=1 env var skips every POST entirely. Tests use
//     this to assert "no network call happened".
//   - opts._request lets tests inject a stub https.request (mirrors the
//     `opts.kill` / `opts.writeCheckpoint` injection pattern in
//     src/daemon-checkpoint.js so the suite never needs to monkey-patch
//     the real https module).

const https = require('https');
const { getLogger } = require('./logger');
const _log = getLogger();

const ALLOWED_EVENTS = Object.freeze(['halt', 'dispatch', 'complete', 'escalation']);
const ALLOWED_EVENT_SET = new Set(ALLOWED_EVENTS);

// Default logger writes a single warn line via the structured logger.
// Tests inject opts.log to assert the wording / count without polluting
// stdout.
function defaultLog(level, message) {
  if (level === 'warn') {
    _log.warn({ component: 'notify' }, message);
  } else if (level === 'info') {
    _log.info({ component: 'notify' }, message);
  }
}

// (Slack supports a light markdown subset in `text`; Discord likewise
// in `content`. We stick to plain backticks + bullets so a renderer
// that strips markdown still produces a legible line.)
function formatSummary(kind, payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const parts = ['[c4 autonomous] ' + String(kind || 'event')];
  if (p.todo && typeof p.todo === 'object') {
    if (p.todo.id) parts.push('todo=' + p.todo.id);
    if (p.todo.title) parts.push('title=' + String(p.todo.title).slice(0, 120));
  }
  if (p.worker) parts.push('worker=' + p.worker);
  if (p.branch) parts.push('branch=' + p.branch);
  if (p.reason) parts.push('reason=' + String(p.reason).slice(0, 160));
  if (p.version) parts.push('v' + p.version);
  return parts.join(' | ');
}

function _isTruthyEnv(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

// Resolve the lifecycle URLs from config. Returns { slackUrl, discordUrl }
// — each entry is either an https:// string or null. Defensive against
// malformed shapes (legacy object form, non-string, etc.).
function _resolveUrls(config) {
  const out = { slackUrl: null, discordUrl: null };
  if (!config || typeof config !== 'object') return out;
  const n = config.notifications;
  if (!n || typeof n !== 'object') return out;
  if (typeof n.slack === 'string' && n.slack.startsWith('https://')) {
    out.slackUrl = n.slack;
  }
  if (typeof n.discord === 'string' && n.discord.startsWith('https://')) {
    out.discordUrl = n.discord;
  }
  return out;
}

function _resolveEvents(config) {
  if (!config || typeof config !== 'object') return [];
  const n = config.notifications;
  if (!n || typeof n !== 'object') return [];
  if (!Array.isArray(n.events)) return [];
  return n.events.filter((e) => ALLOWED_EVENT_SET.has(e));
}

// One-shot POST. Fire and forget at the caller level: this helper
// resolves immediately after `req.end()` is dispatched (no response
// await on the success path). The response handler only logs a single
// warn line on 4xx/5xx so the operator notices a misconfigured webhook
// without retries causing a thundering herd.
function _postJson(url, body, opts) {
  const request = (opts && opts._request) || https.request;
  const log = (opts && opts.log) || defaultLog;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    log('warn', '[notify] invalid webhook URL: ' + ((err && err.message) || err));
    return;
  }
  const host = parsed.host;
  const payload = JSON.stringify(body);
  const reqOpts = {
    hostname: parsed.hostname,
    port: parsed.port || 443,
    path: parsed.pathname + (parsed.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  let req;
  try {
    req = request(reqOpts, (res) => {
      // Drain so the socket can release. We do NOT read or parse the
      // body — the server response is irrelevant beyond the status
      // class; this keeps the helper one-shot.
      if (res && typeof res.resume === 'function') res.resume();
      const status = res && typeof res.statusCode === 'number' ? res.statusCode : 0;
      if (status >= 400) {
        log('warn', '[notify] ' + host + ' returned ' + status);
      }
    });
  } catch (err) {
    log('warn', '[notify] ' + host + ' request setup failed: ' + ((err && err.message) || err));
    return;
  }
  if (req && typeof req.on === 'function') {
    req.on('error', (err) => {
      log('warn', '[notify] ' + host + ' network error: ' + ((err && err.message) || err));
    });
  }
  try {
    if (req && typeof req.write === 'function') req.write(payload);
    if (req && typeof req.end === 'function') req.end();
  } catch (err) {
    log('warn', '[notify] ' + host + ' write failed: ' + ((err && err.message) || err));
  }
}

// Public entry. Returns an object describing the dispatch decision so
// the caller (and tests) can assert without inspecting network state:
//   { fired: ['slack', 'discord'], skipped: 'reason' | null }
//
// Fire-and-forget contract: this function NEVER awaits the response;
// the autonomous loop must never block on Slack / Discord latency.
function sendWebhook(opts) {
  const o = opts || {};
  const kind = String(o.kind || '');
  const payload = o.payload && typeof o.payload === 'object' ? o.payload : {};
  const config = o.config && typeof o.config === 'object' ? o.config : {};
  const log = typeof o.log === 'function' ? o.log : defaultLog;
  const envSource = o.env && typeof o.env === 'object' ? o.env : process.env;

  // (1) NOTIFY_DISABLED short-circuit — tests + staging.
  if (_isTruthyEnv(envSource.NOTIFY_DISABLED)) {
    return { fired: [], skipped: 'env-disabled' };
  }

  // (2) Unknown kind — defensive guard so a typo at the call site
  // doesn't silently mis-route. The caller can pass any string but
  // only the four lifecycle kinds participate.
  if (!ALLOWED_EVENT_SET.has(kind)) {
    return { fired: [], skipped: 'unknown-kind' };
  }

  // (3) Event not in the configured events[] — opt-in gate.
  const events = _resolveEvents(config);
  if (!events.includes(kind)) {
    return { fired: [], skipped: 'event-not-subscribed' };
  }

  // (4) No URLs configured — nothing to send.
  const { slackUrl, discordUrl } = _resolveUrls(config);
  if (!slackUrl && !discordUrl) {
    return { fired: [], skipped: 'no-urls' };
  }

  const summary = formatSummary(kind, payload);
  const fired = [];

  // Slack first, then Discord. Order is deterministic for tests.
  if (slackUrl) {
    _postJson(slackUrl, { text: summary }, { _request: o._request, log });
    fired.push('slack');
  }
  if (discordUrl) {
    _postJson(discordUrl, { content: summary }, { _request: o._request, log });
    fired.push('discord');
  }

  return { fired, skipped: null };
}

module.exports = {
  sendWebhook,
  formatSummary,
  ALLOWED_EVENTS,
  // Exposed for tests + future callers that need to introspect
  // configuration without re-implementing the parse rules.
  _resolveUrls,
  _resolveEvents,
};
