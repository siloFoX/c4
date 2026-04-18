'use strict';

// (8.15) Slack autonomous event emitter tests.
//
// Covers the SlackEventEmitter unit surface: event-type + level
// validation, dedupe inside the sliding window, config.slack.enabled=false
// suppression, minLevel filtering, event-list filtering, webhook POST
// via an injectable http client stub, recent-event buffer cap, shared
// singleton lifecycle, and message formatting helpers. Nothing in this
// file touches the network — every test wires a fake http client so CI
// never depends on reaching api.slack.com.

require('./jest-shim');

const {
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
} = require('../src/slack-events');

function mockHttp() {
  const calls = [];
  let nextResult = { ok: true, status: 200 };
  return {
    calls,
    setNext(result) { nextResult = result; },
    post(url, payload) {
      calls.push({ url, payload });
      return Promise.resolve(nextResult);
    },
  };
}

function makeEmitter(overrides = {}) {
  const http = mockHttp();
  let clock = 1000;
  const now = () => clock;
  const cfg = Object.assign({
    enabled: true,
    webhookUrl: 'https://hooks.example.test/webhook',
    minLevel: 'info',
    dedupeWindowMs: 60000,
  }, overrides.config || {});
  const emitter = new SlackEventEmitter({
    config: cfg,
    httpClient: http,
    now,
  });
  return {
    emitter,
    http,
    setNow: (ms) => { clock = ms; },
    advance: (ms) => { clock += ms; },
    getNow: () => clock,
  };
}

describe('(8.15) slack-events helpers', () => {
  test('(a) EVENT_TYPES lists all 10 canonical types', () => {
    expect(EVENT_TYPES).toHaveLength(10);
    expect(EVENT_TYPES).toContain('task_start');
    expect(EVENT_TYPES).toContain('task_complete');
    expect(EVENT_TYPES).toContain('worker_spawn');
    expect(EVENT_TYPES).toContain('worker_close');
    expect(EVENT_TYPES).toContain('merge_success');
    expect(EVENT_TYPES).toContain('merge_fail');
    expect(EVENT_TYPES).toContain('push_success');
    expect(EVENT_TYPES).toContain('halt_detected');
    expect(EVENT_TYPES).toContain('approval_request');
    expect(EVENT_TYPES).toContain('error');
  });

  test('(b) EVENT_LEVELS map assigns info/warn/error by type group', () => {
    expect(EVENT_LEVELS.task_start).toBe('info');
    expect(EVENT_LEVELS.merge_success).toBe('info');
    expect(EVENT_LEVELS.push_success).toBe('info');
    expect(EVENT_LEVELS.halt_detected).toBe('warn');
    expect(EVENT_LEVELS.approval_request).toBe('warn');
    expect(EVENT_LEVELS.merge_fail).toBe('error');
    expect(EVENT_LEVELS.error).toBe('error');
  });

  test('(c) LEVELS exposes info/warn/error in priority order', () => {
    expect(LEVELS).toEqual(['info', 'warn', 'error']);
    expect(LEVEL_ORDER.info).toBe(0);
    expect(LEVEL_ORDER.warn).toBe(1);
    expect(LEVEL_ORDER.error).toBe(2);
  });

  test('(d) isEventType validates type against enum', () => {
    expect(isEventType('task_start')).toBe(true);
    expect(isEventType('merge_fail')).toBe(true);
    expect(isEventType('unknown_event')).toBe(false);
    expect(isEventType('')).toBe(false);
    expect(isEventType(null)).toBe(false);
  });

  test('(e) isLevel only accepts the three canonical levels', () => {
    expect(isLevel('info')).toBe(true);
    expect(isLevel('warn')).toBe(true);
    expect(isLevel('error')).toBe(true);
    expect(isLevel('debug')).toBe(false);
    expect(isLevel('')).toBe(false);
  });

  test('(f) levelFor honours payload.level override, falls back to default', () => {
    expect(levelFor('task_start')).toBe('info');
    expect(levelFor('task_start', { level: 'error' })).toBe('error');
    expect(levelFor('halt_detected')).toBe('warn');
    expect(levelFor('bad-type')).toBe('info');
  });

  test('(g) dedupeKey is deterministic + payload-order-independent', () => {
    const a = dedupeKey('task_start', { worker: 'w1', branch: 'b1' });
    const b = dedupeKey('task_start', { branch: 'b1', worker: 'w1' });
    expect(a).toBe(b);
    const c = dedupeKey('task_start', { worker: 'w2' });
    expect(a).not.toBe(c);
  });

  test('(h) formatMessage emits [c4:event] <type> <fields>', () => {
    const msg = formatMessage('merge_success', { branch: 'c4/x', sha: 'abc123' });
    expect(msg).toContain('[c4:event]');
    expect(msg).toContain('merge_success');
    expect(msg).toContain('branch=c4/x');
    expect(msg).toContain('sha=abc123');
  });

  test('(i) formatMessage truncates long values to 200 chars', () => {
    const long = 'x'.repeat(500);
    const msg = formatMessage('error', { message: long });
    expect(msg.length).toBeLessThan(300);
    expect(msg).toContain('...');
  });

  test('(j) defaultHttpClient is an object with a post() function', () => {
    const c = defaultHttpClient();
    expect(typeof c.post).toBe('function');
  });
});

describe('(8.15) SlackEventEmitter.emit', () => {
  test('(a) emit returns sent=true with webhook result on success', async () => {
    const { emitter, http } = makeEmitter();
    const res = await emitter.emit('task_start', { worker: 'w1' });
    expect(res.sent).toBe(true);
    expect(res.eventType).toBe('task_start');
    expect(res.level).toBe('info');
    expect(res.webhook.ok).toBe(true);
    expect(http.calls.length).toBe(1);
    expect(http.calls[0].payload.text).toContain('task_start');
  });

  test('(b) enabled=false suppresses all emits', async () => {
    const { emitter, http } = makeEmitter({ config: { enabled: false } });
    const res1 = await emitter.emit('task_start', { worker: 'w1' });
    const res2 = await emitter.emit('error', { message: 'boom' });
    expect(res1.sent).toBe(false);
    expect(res1.reason).toBe('disabled');
    expect(res2.sent).toBe(false);
    expect(http.calls.length).toBe(0);
  });

  test('(c) invalid event type rejected without webhook call', async () => {
    const { emitter, http } = makeEmitter();
    const res = await emitter.emit('not_a_real_event', {});
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('invalid-event-type');
    expect(http.calls.length).toBe(0);
  });

  test('(d) dedupe within window suppresses duplicates', async () => {
    const { emitter, http, advance } = makeEmitter();
    const r1 = await emitter.emit('task_start', { worker: 'w1', branch: 'b1' });
    const r2 = await emitter.emit('task_start', { worker: 'w1', branch: 'b1' });
    expect(r1.sent).toBe(true);
    expect(r2.sent).toBe(false);
    expect(r2.reason).toBe('deduped');
    expect(http.calls.length).toBe(1);
    // Advance past the window -> next emit fires again.
    advance(60001);
    const r3 = await emitter.emit('task_start', { worker: 'w1', branch: 'b1' });
    expect(r3.sent).toBe(true);
    expect(http.calls.length).toBe(2);
  });

  test('(e) different payloads are not deduped together', async () => {
    const { emitter, http } = makeEmitter();
    await emitter.emit('task_start', { worker: 'w1' });
    await emitter.emit('task_start', { worker: 'w2' });
    expect(http.calls.length).toBe(2);
  });

  test('(f) minLevel=warn filters info events out', async () => {
    const { emitter, http } = makeEmitter({ config: { minLevel: 'warn' } });
    const info = await emitter.emit('task_start', { worker: 'w1' });
    const warn = await emitter.emit('halt_detected', { worker: 'w1', reason: 'stall' });
    const err = await emitter.emit('merge_fail', { branch: 'b1', error: 'conflict' });
    expect(info.sent).toBe(false);
    expect(info.reason).toBe('below-min-level');
    expect(warn.sent).toBe(true);
    expect(err.sent).toBe(true);
    expect(http.calls.length).toBe(2);
  });

  test('(g) events allowlist filters types not in config.slack.events', async () => {
    const { emitter, http } = makeEmitter({
      config: { events: ['merge_success', 'merge_fail'] },
    });
    const r1 = await emitter.emit('task_start', { worker: 'w1' });
    const r2 = await emitter.emit('merge_success', { branch: 'b1', sha: 'a' });
    expect(r1.sent).toBe(false);
    expect(r1.reason).toBe('filtered-type');
    expect(r2.sent).toBe(true);
    expect(http.calls.length).toBe(1);
  });

  test('(h) webhook failure returns ok=false but does not throw', async () => {
    const { emitter, http } = makeEmitter();
    http.setNext({ ok: false, status: 500 });
    const res = await emitter.emit('merge_success', { branch: 'b1', sha: 'abc' });
    expect(res.sent).toBe(true);
    expect(res.webhook.ok).toBe(false);
    expect(res.webhook.status).toBe(500);
  });

  test('(i) no webhookUrl configured yields no-webhook reason', async () => {
    const { emitter } = makeEmitter({ config: { webhookUrl: '' } });
    const res = await emitter.emit('task_start', { worker: 'w1' });
    expect(res.sent).toBe(true);
    expect(res.webhook.reason).toBe('no-webhook');
  });

  test('(j) recent events captures structured record per emit', async () => {
    const { emitter } = makeEmitter();
    await emitter.emit('task_start', { worker: 'w1' });
    await emitter.emit('merge_success', { branch: 'b1', sha: 'abc' });
    const recent = emitter.recentEvents();
    expect(recent.length).toBe(2);
    expect(recent[0].eventType).toBe('task_start');
    expect(recent[1].eventType).toBe('merge_success');
    expect(recent[0].level).toBe('info');
    expect(recent[0].message).toContain('[c4:event]');
  });

  test('(k) recentEvents(limit) honours tail slice', async () => {
    const { emitter } = makeEmitter();
    await emitter.emit('task_start', { worker: 'a' });
    await emitter.emit('task_start', { worker: 'b' });
    await emitter.emit('task_start', { worker: 'c' });
    const recent = emitter.recentEvents(1);
    expect(recent.length).toBe(1);
    expect(recent[0].payload.worker).toBe('c');
  });

  test('(l) recent buffer is capped at recentCap', async () => {
    const http = mockHttp();
    const emitter = new SlackEventEmitter({
      config: { enabled: true, webhookUrl: 'https://h.test' },
      httpClient: http,
      now: (function () { let t = 0; return () => (t += 100000); })(),
      recentCap: 3,
    });
    for (let i = 0; i < 7; i++) {
      await emitter.emit('task_start', { worker: 'w' + i });
    }
    expect(emitter.recentEvents().length).toBe(3);
  });
});

describe('(8.15) SlackEventEmitter.configure + listen', () => {
  test('(a) configure swaps config live, next emit uses new rules', async () => {
    const { emitter, http } = makeEmitter({ config: { enabled: false } });
    await emitter.emit('task_start', { worker: 'w1' });
    expect(http.calls.length).toBe(0);
    emitter.configure({ enabled: true, webhookUrl: 'https://h.test' });
    await emitter.emit('task_start', { worker: 'w1' });
    expect(http.calls.length).toBe(1);
    expect(emitter.getConfig().enabled).toBe(true);
  });

  test('(b) configure falls back to defaults for malformed fields', () => {
    const { emitter } = makeEmitter();
    emitter.configure({ minLevel: 'chatter', dedupeWindowMs: -5, events: ['nope'] });
    const c = emitter.getConfig();
    expect(c.minLevel).toBe('info');
    expect(c.dedupeWindowMs).toBe(DEFAULT_DEDUPE_WINDOW_MS);
    expect(c.events).toEqual(EVENT_TYPES.slice());
  });

  test('(c) listen callback fires per emit with the record', async () => {
    const { emitter } = makeEmitter();
    const seen = [];
    const off = emitter.listen((rec) => seen.push(rec));
    await emitter.emit('task_start', { worker: 'w1' });
    await emitter.emit('merge_success', { branch: 'b1', sha: 'abc' });
    expect(seen.length).toBe(2);
    expect(seen[0].eventType).toBe('task_start');
    off();
    await emitter.emit('task_complete', { worker: 'w1' });
    expect(seen.length).toBe(2);
  });

  test('(d) listener errors do not break emit', async () => {
    const { emitter } = makeEmitter();
    emitter.listen(() => { throw new Error('listener kaboom'); });
    const res = await emitter.emit('task_start', { worker: 'w1' });
    expect(res.sent).toBe(true);
  });

  test('(e) clearRecent drops both buffer and dedupe state', async () => {
    const { emitter, http } = makeEmitter();
    await emitter.emit('task_start', { worker: 'w1' });
    expect(emitter.recentEvents().length).toBe(1);
    emitter.clearRecent();
    expect(emitter.recentEvents().length).toBe(0);
    // Same payload + same timestamp now emits again because dedupe LRU cleared.
    const res = await emitter.emit('task_start', { worker: 'w1' });
    expect(res.sent).toBe(true);
    expect(http.calls.length).toBe(2);
  });

  test('(f) getConfig returns a defensive copy of events array', () => {
    const { emitter } = makeEmitter();
    const a = emitter.getConfig().events;
    a.push('task_complete');
    const b = emitter.getConfig().events;
    expect(b.includes('task_complete')).toBe(true);
    // Mutation of `a` must not leak into `b` beyond the push we made on
    // `a` itself — the returned array is a fresh slice.
    expect(a).not.toBe(b);
  });
});

describe('(8.15) SlackEventEmitter shared singleton', () => {
  test('(a) getShared returns the same instance on repeat calls', () => {
    resetShared();
    const a = getShared({ config: { enabled: false } });
    const b = getShared();
    expect(a).toBe(b);
    resetShared();
  });

  test('(b) resetShared forces a fresh instance', () => {
    resetShared();
    const a = getShared();
    resetShared();
    const b = getShared();
    expect(a).not.toBe(b);
  });
});

describe('(8.15) Message formatting + webhook payload', () => {
  test('(a) emit POSTs Slack-style {text: "[c4:event] ..."} payload', async () => {
    const { emitter, http } = makeEmitter();
    await emitter.emit('merge_success', { branch: 'c4/x', sha: 'abc123' });
    const call = http.calls[0];
    expect(call.url).toBe('https://hooks.example.test/webhook');
    expect(typeof call.payload.text).toBe('string');
    expect(call.payload.text.startsWith('[c4:event] merge_success')).toBe(true);
    expect(call.payload.text).toContain('branch=c4/x');
  });

  test('(b) payload.level overrides the default event level for filtering', async () => {
    const { emitter, http } = makeEmitter({ config: { minLevel: 'error' } });
    const normal = await emitter.emit('task_start', { worker: 'w1' });
    expect(normal.sent).toBe(false);
    const forced = await emitter.emit('task_start', { worker: 'w1', level: 'error' });
    expect(forced.sent).toBe(true);
    expect(http.calls.length).toBe(1);
  });
});
