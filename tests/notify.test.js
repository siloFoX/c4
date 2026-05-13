'use strict';

// Tests for src/notify.js — lifecycle webhook helper (v1.11.95 / TODO 11.77).
//
// Mock https.request via the opts._request injection point (same
// pattern as daemon-checkpoint's opts.kill / opts.writeCheckpoint). No
// real network calls; every test asserts on captured request shapes
// and the structured { fired, skipped } return value.

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');

const {
  sendWebhook,
  formatSummary,
  ALLOWED_EVENTS,
  _resolveUrls,
  _resolveEvents,
} = require('../src/notify');

// Fake https.request shaped like the real one for opts._request injection.
// Captures { reqOpts, body, hostHeader } for the assertion phase and
// invokes the response callback with a configurable statusCode so 4xx /
// 5xx / 2xx paths can be exercised. The returned object satisfies the
// .write / .end / .on contract sendWebhook expects.
function makeRequestStub(opts = {}) {
  const calls = [];
  const errorAfterEnd = opts.errorAfterEnd || null;
  const statusCode = typeof opts.statusCode === 'number' ? opts.statusCode : 200;
  const throwOnRequest = opts.throwOnRequest === true;
  const throwOnEnd = opts.throwOnEnd === true;
  const errorEvent = opts.errorEvent || null;

  function request(reqOpts, responseCb) {
    if (throwOnRequest) throw new Error('boom-on-request');
    const captured = { reqOpts, body: '' };
    calls.push(captured);
    const errorHandlers = [];
    const req = {
      write(chunk) {
        captured.body += chunk;
      },
      end() {
        if (throwOnEnd) throw new Error('boom-on-end');
        // Fire the response callback async-ish (synchronously is fine
        // for our purposes — fire-and-forget at the helper level).
        if (typeof responseCb === 'function') {
          responseCb({
            statusCode,
            resume() { /* no-op drain */ },
          });
        }
        if (errorEvent) {
          for (const h of errorHandlers) h(errorEvent);
        }
        if (errorAfterEnd) {
          for (const h of errorHandlers) h(errorAfterEnd);
        }
      },
      on(event, handler) {
        if (event === 'error') errorHandlers.push(handler);
      },
    };
    return req;
  }

  return { request, calls };
}

// Capture logs so a test can assert (1) the count of warn lines and
// (2) that no body / URL leaks into the log (only the host).
function makeLog() {
  const lines = [];
  return {
    log(level, message) { lines.push({ level, message }); },
    lines,
    warns() { return lines.filter((l) => l.level === 'warn'); },
  };
}

const FULL_CONFIG = Object.freeze({
  notifications: {
    slack: 'https://hooks.slack.com/services/T/B/X',
    discord: 'https://discord.com/api/webhooks/123/abc',
    events: ['halt', 'dispatch', 'complete', 'escalation'],
  },
});

describe('sendWebhook: gating', () => {
  it('short-circuits when kind is not in events[]', () => {
    const stub = makeRequestStub();
    const cfg = {
      notifications: {
        slack: 'https://hooks.slack.com/services/X',
        events: ['halt'], // dispatch NOT subscribed
      },
    };
    const r = sendWebhook({
      kind: 'dispatch',
      payload: { worker: 'auto-w64' },
      config: cfg,
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r, { fired: [], skipped: 'event-not-subscribed' });
    assert.strictEqual(stub.calls.length, 0);
  });

  it('short-circuits when notifications block is absent', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: {},
      _request: stub.request,
      env: {},
    });
    assert.strictEqual(r.skipped, 'event-not-subscribed');
    assert.strictEqual(stub.calls.length, 0);
  });

  it('short-circuits on unknown kind even when subscribed', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'made-up-kind',
      config: FULL_CONFIG,
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r, { fired: [], skipped: 'unknown-kind' });
    assert.strictEqual(stub.calls.length, 0);
  });

  it('returns no-urls when events are subscribed but no URL is configured', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'dispatch',
      config: { notifications: { events: ['dispatch'] } },
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r, { fired: [], skipped: 'no-urls' });
    assert.strictEqual(stub.calls.length, 0);
  });

  it('rejects non-https slack URL (resolves as null)', () => {
    const stub = makeRequestStub();
    const cfg = {
      notifications: {
        slack: 'http://insecure.example.com/hook',
        events: ['dispatch'],
      },
    };
    const r = sendWebhook({
      kind: 'dispatch',
      config: cfg,
      _request: stub.request,
      env: {},
    });
    assert.strictEqual(r.skipped, 'no-urls');
    assert.strictEqual(stub.calls.length, 0);
  });
});

describe('sendWebhook: body shapes', () => {
  it('Slack body uses { text } with formatted summary', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'dispatch',
      payload: {
        worker: 'auto-w64',
        todo: { id: '11.77', title: 'Webhook notifications' },
      },
      config: {
        notifications: {
          slack: 'https://hooks.slack.com/services/A/B/C',
          events: ['dispatch'],
        },
      },
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r.fired, ['slack']);
    assert.strictEqual(stub.calls.length, 1);
    const body = JSON.parse(stub.calls[0].body);
    assert.strictEqual(Object.keys(body).length, 1);
    assert.ok(typeof body.text === 'string');
    assert.ok(body.text.includes('dispatch'));
    assert.ok(body.text.includes('11.77'));
    assert.ok(body.text.includes('auto-w64'));
  });

  it('Discord body uses { content } with formatted summary', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'complete',
      payload: {
        worker: 'auto-w64',
        todo: { id: '11.77', title: 'done' },
      },
      config: {
        notifications: {
          discord: 'https://discord.com/api/webhooks/1/x',
          events: ['complete'],
        },
      },
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r.fired, ['discord']);
    assert.strictEqual(stub.calls.length, 1);
    const body = JSON.parse(stub.calls[0].body);
    assert.strictEqual(Object.keys(body).length, 1);
    assert.ok(typeof body.content === 'string');
    assert.ok(body.content.includes('complete'));
  });

  it('fires both URLs when both are configured (Slack first, then Discord)', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'halt',
      payload: { worker: 'auto-w64', reason: 'circuit-breaker' },
      config: FULL_CONFIG,
      _request: stub.request,
      env: {},
    });
    assert.deepStrictEqual(r.fired, ['slack', 'discord']);
    assert.strictEqual(stub.calls.length, 2);
    // Order: Slack first, Discord second.
    assert.ok(stub.calls[0].reqOpts.hostname.includes('slack.com'));
    assert.ok(stub.calls[1].reqOpts.hostname.includes('discord.com'));
    // Each carries its own shape — body keys are not shared.
    assert.ok(JSON.parse(stub.calls[0].body).text);
    assert.ok(JSON.parse(stub.calls[1].body).content);
  });

  it('sets POST + Content-Type: application/json', () => {
    const stub = makeRequestStub();
    sendWebhook({
      kind: 'escalation',
      payload: {},
      config: FULL_CONFIG,
      _request: stub.request,
      env: {},
    });
    for (const call of stub.calls) {
      assert.strictEqual(call.reqOpts.method, 'POST');
      assert.strictEqual(call.reqOpts.headers['Content-Type'], 'application/json');
      assert.ok(call.reqOpts.headers['Content-Length'] > 0);
    }
  });
});

describe('sendWebhook: error handling (fire-and-forget)', () => {
  it('logs a single warn line on a 4xx response and does not throw', () => {
    const stub = makeRequestStub({ statusCode: 429 });
    const logger = makeLog();
    let threw = false;
    try {
      sendWebhook({
        kind: 'dispatch',
        payload: {},
        config: {
          notifications: {
            slack: 'https://hooks.slack.com/services/X',
            events: ['dispatch'],
          },
        },
        _request: stub.request,
        log: logger.log,
        env: {},
      });
    } catch { threw = true; }
    assert.strictEqual(threw, false);
    const warns = logger.warns();
    assert.strictEqual(warns.length, 1);
    assert.ok(/429/.test(warns[0].message));
    // No body leak.
    assert.ok(!/T\/B\/X/.test(warns[0].message));
  });

  it('logs a single warn line on a 5xx response and does not throw', () => {
    const stub = makeRequestStub({ statusCode: 503 });
    const logger = makeLog();
    sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: {
        notifications: {
          slack: 'https://hooks.slack.com/services/Y',
          events: ['dispatch'],
        },
      },
      _request: stub.request,
      log: logger.log,
      env: {},
    });
    const warns = logger.warns();
    assert.strictEqual(warns.length, 1);
    assert.ok(/503/.test(warns[0].message));
  });

  it('does not warn on 2xx responses', () => {
    const stub = makeRequestStub({ statusCode: 200 });
    const logger = makeLog();
    const r = sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: {
        notifications: {
          slack: 'https://hooks.slack.com/services/Z',
          events: ['dispatch'],
        },
      },
      _request: stub.request,
      log: logger.log,
      env: {},
    });
    assert.deepStrictEqual(r.fired, ['slack']);
    assert.strictEqual(logger.warns().length, 0);
  });

  it('logs a warn line when the request throws synchronously', () => {
    const stub = makeRequestStub({ throwOnRequest: true });
    const logger = makeLog();
    let threw = false;
    try {
      sendWebhook({
        kind: 'dispatch',
        payload: {},
        config: {
          notifications: {
            slack: 'https://hooks.slack.com/services/A',
            events: ['dispatch'],
          },
        },
        _request: stub.request,
        log: logger.log,
        env: {},
      });
    } catch { threw = true; }
    assert.strictEqual(threw, false);
    const warns = logger.warns();
    assert.strictEqual(warns.length, 1);
    assert.ok(/setup failed/i.test(warns[0].message) || /boom-on-request/.test(warns[0].message));
  });

  it('logs a warn line on network "error" event', () => {
    const stub = makeRequestStub({ errorEvent: new Error('ECONNRESET') });
    const logger = makeLog();
    sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: {
        notifications: {
          slack: 'https://hooks.slack.com/services/B',
          events: ['dispatch'],
        },
      },
      _request: stub.request,
      log: logger.log,
      env: {},
    });
    // Note: ALSO captures the 200-by-default response from end() above
    // the error fire; the response itself is 2xx so no warn there. We
    // expect exactly one warn (the network error).
    const warns = logger.warns();
    assert.strictEqual(warns.length, 1);
    assert.ok(/ECONNRESET/.test(warns[0].message));
  });
});

describe('sendWebhook: NOTIFY_DISABLED + env handling', () => {
  it('NOTIFY_DISABLED=1 skips every POST', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: FULL_CONFIG,
      _request: stub.request,
      env: { NOTIFY_DISABLED: '1' },
    });
    assert.deepStrictEqual(r, { fired: [], skipped: 'env-disabled' });
    assert.strictEqual(stub.calls.length, 0);
  });

  it('NOTIFY_DISABLED=true is also honoured (case-insensitive)', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'halt',
      config: FULL_CONFIG,
      _request: stub.request,
      env: { NOTIFY_DISABLED: 'TRUE' },
    });
    assert.strictEqual(r.skipped, 'env-disabled');
    assert.strictEqual(stub.calls.length, 0);
  });

  it('NOTIFY_DISABLED=0 still fires (falsy value)', () => {
    const stub = makeRequestStub();
    const r = sendWebhook({
      kind: 'halt',
      payload: {},
      config: FULL_CONFIG,
      _request: stub.request,
      env: { NOTIFY_DISABLED: '0' },
    });
    assert.deepStrictEqual(r.fired, ['slack', 'discord']);
  });
});

describe('formatSummary + helpers', () => {
  it('formatSummary includes kind, todo id/title, worker, version', () => {
    const s = formatSummary('dispatch', {
      worker: 'auto-w64',
      todo: { id: '11.77', title: 'Webhook notifications' },
      version: '1.11.95',
    });
    assert.ok(s.startsWith('[c4 autonomous] dispatch'));
    assert.ok(s.includes('todo=11.77'));
    assert.ok(s.includes('title=Webhook notifications'));
    assert.ok(s.includes('worker=auto-w64'));
    assert.ok(s.includes('v1.11.95'));
  });

  it('formatSummary is defensive against null payload', () => {
    const s = formatSummary('halt', null);
    assert.ok(s.startsWith('[c4 autonomous] halt'));
  });

  it('ALLOWED_EVENTS lists the four canonical kinds', () => {
    assert.deepStrictEqual(
      Array.from(ALLOWED_EVENTS).sort(),
      ['complete', 'dispatch', 'escalation', 'halt']
    );
  });

  it('_resolveUrls ignores non-string slack/discord values', () => {
    const r = _resolveUrls({
      notifications: {
        slack: { enabled: true, webhookUrl: 'https://x' }, // legacy object form
        discord: 42,
      },
    });
    assert.strictEqual(r.slackUrl, null);
    assert.strictEqual(r.discordUrl, null);
  });

  it('_resolveEvents drops unknown kinds', () => {
    const r = _resolveEvents({
      notifications: { events: ['halt', 'made-up', 'dispatch'] },
    });
    assert.deepStrictEqual(r, ['halt', 'dispatch']);
  });
});

describe('sendWebhook: hostname extraction (no body leakage in log)', () => {
  it('warn line on 4xx includes hostname but not the full URL path', () => {
    const stub = makeRequestStub({ statusCode: 401 });
    const logger = makeLog();
    sendWebhook({
      kind: 'dispatch',
      payload: {},
      config: {
        notifications: {
          slack: 'https://hooks.slack.com/services/SECRETPATH/XYZ',
          events: ['dispatch'],
        },
      },
      _request: stub.request,
      log: logger.log,
      env: {},
    });
    const warn = logger.warns()[0];
    assert.ok(/hooks\.slack\.com/.test(warn.message));
    assert.ok(!/SECRETPATH/.test(warn.message));
    assert.ok(!/XYZ/.test(warn.message));
  });
});
