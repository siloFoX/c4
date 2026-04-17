// (10.2) Audit log tests.
//
// Exercises src/audit-log.js directly: JSONL append, ISO timestamps,
// SHA-256 hash chain, query filters, verify() tamper detection, and
// concurrent-write ordering through the internal promise queue.
//
// Every test writes to a tmpdir path so we never touch the operator's
// real ~/.c4/audit.jsonl.

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  AuditLogger,
  EVENT_TYPES,
  DEFAULT_ACTOR,
  defaultLogPath,
  canonicalize,
  hashEvent,
  getShared,
  resetShared,
} = require('../src/audit-log');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-audit-test-'));
}

function readLines(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
}

describe('(10.2) AuditLogger helpers', () => {
  test('(a) defaultLogPath points under home/.c4/audit.jsonl', () => {
    const p = defaultLogPath();
    expect(p.endsWith(path.join('.c4', 'audit.jsonl'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) EVENT_TYPES includes the full canonical set', () => {
    expect(EVENT_TYPES).toContain('worker.created');
    expect(EVENT_TYPES).toContain('worker.closed');
    expect(EVENT_TYPES).toContain('task.sent');
    expect(EVENT_TYPES).toContain('task.completed');
    expect(EVENT_TYPES).toContain('approval.requested');
    expect(EVENT_TYPES).toContain('approval.granted');
    expect(EVENT_TYPES).toContain('approval.denied');
    expect(EVENT_TYPES).toContain('merge.performed');
    expect(EVENT_TYPES).toContain('config.reloaded');
    expect(EVENT_TYPES).toContain('auth.login');
    expect(EVENT_TYPES).toContain('auth.logout');
    expect(EVENT_TYPES).toContain('fleet.changed');
  });

  test('(c) canonicalize serializes keys in fixed order', () => {
    const ev = {
      details: { foo: 1 },
      target: 't',
      actor: 'a',
      type: 'worker.created',
      timestamp: '2026-04-17T00:00:00.000Z',
    };
    const s = canonicalize(ev);
    expect(s.indexOf('"timestamp"')).toBeLessThan(s.indexOf('"type"'));
    expect(s.indexOf('"type"')).toBeLessThan(s.indexOf('"actor"'));
    expect(s.indexOf('"actor"')).toBeLessThan(s.indexOf('"target"'));
    expect(s.indexOf('"target"')).toBeLessThan(s.indexOf('"details"'));
  });

  test('(d) hashEvent is deterministic for same inputs', () => {
    const ev = {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'worker.created',
      actor: 'system',
      target: 'w1',
      details: { pid: 123 },
    };
    const h1 = hashEvent(null, ev);
    const h2 = hashEvent(null, ev);
    expect(h1).toBe(h2);
    expect(typeof h1).toBe('string');
    expect(h1.length).toBe(64);
  });

  test('(e) hashEvent chain changes when prev changes', () => {
    const ev = {
      timestamp: '2026-04-17T00:00:00.000Z',
      type: 'task.sent',
      actor: 'alice',
      target: 'w1',
      details: {},
    };
    const h0 = hashEvent(null, ev);
    const h1 = hashEvent('abc', ev);
    const h2 = hashEvent('xyz', ev);
    expect(h0).not.toBe(h1);
    expect(h1).not.toBe(h2);
  });
});

describe('(10.2) record', () => {
  test('(f) record appends a single JSONL line', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const ev = logger.record('worker.created', { pid: 999 }, { target: 'w1' });
    const lines = readLines(p);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('worker.created');
    expect(parsed.target).toBe('w1');
    expect(parsed.details.pid).toBe(999);
    expect(parsed.hash).toBe(ev.hash);
  });

  test('(g) recorded event has ISO-8601 timestamp', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const ev = logger.record('task.sent', {}, { target: 'w1' });
    expect(typeof ev.timestamp).toBe('string');
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ev.timestamp)).toBe(true);
    // Date.parse should round-trip the ISO string
    expect(Number.isNaN(Date.parse(ev.timestamp))).toBe(false);
  });

  test('(h) recorded event has all core fields + hash', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p, actor: 'alice' });
    const ev = logger.record('approval.granted', { command: 'ls' }, { target: 'w2' });
    expect(ev.timestamp).toBeDefined();
    expect(ev.type).toBe('approval.granted');
    expect(ev.actor).toBe('alice');
    expect(ev.target).toBe('w2');
    expect(ev.details).toEqual({ command: 'ls' });
    expect(typeof ev.hash).toBe('string');
    expect(ev.hash.length).toBe(64);
  });

  test('(i) default actor is "system" when not configured', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const ev = logger.record('config.reloaded', {});
    expect(ev.actor).toBe(DEFAULT_ACTOR);
    expect(ev.actor).toBe('system');
  });

  test('(j) first event hash depends only on the event itself', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const fixed = '2026-04-17T12:00:00.000Z';
    const ev = logger.record('worker.created', { pid: 1 }, { target: 'w1', timestamp: fixed, actor: 'system' });
    const core = { timestamp: fixed, type: 'worker.created', actor: 'system', target: 'w1', details: { pid: 1 } };
    const expected = crypto.createHash('sha256').update(canonicalize(core)).digest('hex');
    expect(ev.hash).toBe(expected);
  });

  test('(k) subsequent event hash binds to previous hash', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const a = logger.record('worker.created', { pid: 1 }, { target: 'w1' });
    const b = logger.record('task.sent', { task: 'hi' }, { target: 'w1' });
    const core = { timestamp: b.timestamp, type: b.type, actor: b.actor, target: b.target, details: b.details };
    const expected = crypto.createHash('sha256').update(a.hash + canonicalize(core)).digest('hex');
    expect(b.hash).toBe(expected);
    expect(a.hash).not.toBe(b.hash);
  });

  test('(l) records persist across new logger instances (reads tail hash)', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const l1 = new AuditLogger({ logPath: p });
    const a = l1.record('worker.created', {}, { target: 'w1' });
    // New instance picks up where the first left off
    const l2 = new AuditLogger({ logPath: p });
    const b = l2.record('task.sent', {}, { target: 'w1' });
    const core = { timestamp: b.timestamp, type: b.type, actor: b.actor, target: b.target, details: b.details };
    const expected = crypto.createHash('sha256').update(a.hash + canonicalize(core)).digest('hex');
    expect(b.hash).toBe(expected);
  });
});

describe('(10.2) query', () => {
  test('(m) query on non-existent file returns []', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'does-not-exist.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const events = logger.query({});
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(0);
  });

  test('(n) query with no filter returns all events in order', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    logger.record('worker.closed', {}, { target: 'w1' });
    const events = logger.query({});
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('worker.created');
    expect(events[1].type).toBe('task.sent');
    expect(events[2].type).toBe('worker.closed');
  });

  test('(o) query filters by type', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w2' });
    const only = logger.query({ type: 'task.sent' });
    expect(only).toHaveLength(2);
    expect(only.every((e) => e.type === 'task.sent')).toBe(true);
  });

  test('(p) query filters by target', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('worker.created', {}, { target: 'w2' });
    logger.record('task.sent', {}, { target: 'w1' });
    const w1 = logger.query({ target: 'w1' });
    expect(w1).toHaveLength(2);
    expect(w1.every((e) => e.target === 'w1')).toBe(true);
  });

  test('(q) query filters by from/to time range', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1', timestamp: '2026-04-17T10:00:00.000Z' });
    logger.record('worker.created', {}, { target: 'w2', timestamp: '2026-04-17T11:00:00.000Z' });
    logger.record('worker.created', {}, { target: 'w3', timestamp: '2026-04-17T12:00:00.000Z' });

    const fromOnly = logger.query({ from: '2026-04-17T10:30:00.000Z' });
    expect(fromOnly).toHaveLength(2);
    expect(fromOnly[0].target).toBe('w2');

    const toOnly = logger.query({ to: '2026-04-17T11:30:00.000Z' });
    expect(toOnly).toHaveLength(2);
    expect(toOnly[1].target).toBe('w2');

    const range = logger.query({
      from: '2026-04-17T10:30:00.000Z',
      to: '2026-04-17T11:30:00.000Z',
    });
    expect(range).toHaveLength(1);
    expect(range[0].target).toBe('w2');
  });

  test('(r) query respects limit', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    for (let i = 0; i < 10; i++) {
      logger.record('task.sent', { i }, { target: 'w1' });
    }
    const limited = logger.query({ limit: 3 });
    expect(limited).toHaveLength(3);
    expect(limited[0].details.i).toBe(0);
    expect(limited[2].details.i).toBe(2);
  });

  test('(s) query combines multiple filters', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('task.sent', {}, { target: 'w1', timestamp: '2026-04-17T10:00:00.000Z' });
    logger.record('task.sent', {}, { target: 'w2', timestamp: '2026-04-17T11:00:00.000Z' });
    logger.record('worker.closed', {}, { target: 'w1', timestamp: '2026-04-17T12:00:00.000Z' });
    const combined = logger.query({ type: 'task.sent', target: 'w1' });
    expect(combined).toHaveLength(1);
    expect(combined[0].target).toBe('w1');
    expect(combined[0].type).toBe('task.sent');
  });
});

describe('(10.2) verify', () => {
  test('(t) verify on non-existent file returns valid', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'does-not-exist.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const r = logger.verify();
    expect(r.valid).toBe(true);
    expect(r.corruptedAt).toBeNull();
    expect(r.total).toBe(0);
  });

  test('(u) verify on fresh untampered log is valid', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    logger.record('worker.closed', {}, { target: 'w1' });
    const r = logger.verify();
    expect(r.valid).toBe(true);
    expect(r.corruptedAt).toBeNull();
    expect(r.total).toBe(3);
  });

  test('(v) verify detects tampered event (edited timestamp)', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    logger.record('worker.closed', {}, { target: 'w1' });
    // Tamper: rewrite line 1 (middle event) with edited timestamp, keep hash
    const lines = readLines(p);
    const parsed = JSON.parse(lines[1]);
    parsed.timestamp = '1999-01-01T00:00:00.000Z';
    lines[1] = JSON.stringify(parsed);
    fs.writeFileSync(p, lines.join('\n') + '\n');
    const r = logger.verify();
    expect(r.valid).toBe(false);
    expect(r.corruptedAt).toBe(1);
    expect(r.total).toBe(3);
  });

  test('(w) verify detects tampered event (edited details)', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('task.sent', { task: 'original' }, { target: 'w1' });
    logger.record('task.completed', {}, { target: 'w1' });
    const lines = readLines(p);
    const parsed = JSON.parse(lines[0]);
    parsed.details = { task: 'tampered' };
    lines[0] = JSON.stringify(parsed);
    fs.writeFileSync(p, lines.join('\n') + '\n');
    const r = logger.verify();
    expect(r.valid).toBe(false);
    expect(r.corruptedAt).toBe(0);
  });

  test('(x) verify detects corrupted JSON line', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    const lines = readLines(p);
    lines[1] = '{not valid json';
    fs.writeFileSync(p, lines.join('\n') + '\n');
    const r = logger.verify();
    expect(r.valid).toBe(false);
    expect(r.corruptedAt).toBe(1);
  });

  test('(y) verify detects deleted middle line (hash chain break)', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    logger.record('worker.created', {}, { target: 'w1' });
    logger.record('task.sent', {}, { target: 'w1' });
    logger.record('worker.closed', {}, { target: 'w1' });
    const lines = readLines(p);
    // Drop the middle line — line 2 should no longer chain from line 0.
    fs.writeFileSync(p, [lines[0], lines[2]].join('\n') + '\n');
    const r = logger.verify();
    expect(r.valid).toBe(false);
    expect(r.corruptedAt).toBe(1);
  });
});

describe('(10.2) concurrency', () => {
  test('(z) burst of record calls all persist in a valid chain', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    const N = 30;
    const events = [];
    // Synchronous record() is atomic within the JS event loop, so a
    // tight-loop burst is the correct stress surface — concurrency in
    // a single-threaded daemon comes from call sites interleaved by
    // event loop scheduling, not from OS thread parallelism.
    for (let i = 0; i < N; i++) {
      events.push(logger.record('task.sent', { i }, { target: 'w1' }));
    }
    expect(events).toHaveLength(N);
    const lines = readLines(p);
    expect(lines).toHaveLength(N);
    const r = logger.verify();
    expect(r.valid).toBe(true);
    expect(r.total).toBe(N);
  });

  test('(aa) burst of record calls preserves FIFO order', () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    for (let i = 0; i < 10; i++) {
      logger.record('task.sent', { i }, { target: 'w1' });
    }
    const events = logger.query({});
    expect(events).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(events[i].details.i).toBe(i);
    }
  });

  test('(dd) async Promise.all(record) still serializes atomically', async () => {
    const dir = mkTmpDir();
    const p = path.join(dir, 'audit.jsonl');
    const logger = new AuditLogger({ logPath: p });
    // Wrap sync record() in micro-delayed promises to simulate real
    // async call sites racing each other. appendFileSync inside record()
    // is atomic, so the final chain must still verify.
    const N = 20;
    const promises = [];
    for (let i = 0; i < N; i++) {
      promises.push(Promise.resolve().then(() => logger.record('task.sent', { i }, { target: 'w1' })));
    }
    const events = await Promise.all(promises);
    expect(events).toHaveLength(N);
    const r = logger.verify();
    expect(r.valid).toBe(true);
    expect(r.total).toBe(N);
  });
});

describe('(10.2) shared singleton', () => {
  test('(bb) getShared returns the same instance', () => {
    resetShared();
    const a = getShared();
    const b = getShared();
    expect(a).toBe(b);
    resetShared();
  });

  test('(cc) resetShared clears the cached instance', () => {
    resetShared();
    const a = getShared();
    resetShared();
    const b = getShared();
    expect(a).not.toBe(b);
    resetShared();
  });
});
