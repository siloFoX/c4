'use strict';

// (10.9) Scribe v2 tests.
//
// Exercises src/scribe-v2.js directly: record() JSONL shape + filename,
// query() filters (time / type / worker / limit), contextAround() window,
// findById(), listDays(), helper functions, and the shared instance.
//
// Every test writes to a tmpdir path so we never touch the operator's
// real ~/.c4/events-*.jsonl.

require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const scribeV2 = require('../src/scribe-v2');
const {
  ScribeV2,
  EVENT_TYPES,
  FILE_PREFIX,
  FILE_SUFFIX,
  FILE_PATTERN,
  defaultLogDir,
  isValidEventType,
  formatYMD,
  parseYMD,
  nextId,
  normalizePayload,
  getShared,
  resetShared,
} = scribeV2;

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'c4-scribe-v2-'));
}

function readLines(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
}

describe('(10.9) scribe-v2 helpers', () => {
  test('(a) EVENT_TYPES includes the full canonical set', () => {
    const expected = [
      'task_start', 'task_complete', 'worker_spawn', 'worker_close',
      'tool_call', 'approval_request', 'approval_grant',
      'merge_attempt', 'merge_success', 'halt', 'error',
    ];
    for (const t of expected) expect(EVENT_TYPES).toContain(t);
    expect(EVENT_TYPES.length).toBe(expected.length);
  });

  test('(b) defaultLogDir points under home/.c4', () => {
    const p = defaultLogDir();
    expect(p.startsWith(os.homedir())).toBe(true);
    expect(p.endsWith(path.join('.c4'))).toBe(true);
  });

  test('(c) isValidEventType rejects unknown types + non-strings', () => {
    expect(isValidEventType('task_start')).toBe(true);
    expect(isValidEventType('error')).toBe(true);
    expect(isValidEventType('bogus')).toBe(false);
    expect(isValidEventType('')).toBe(false);
    expect(isValidEventType(null)).toBe(false);
    expect(isValidEventType(123)).toBe(false);
  });

  test('(d) formatYMD uses UTC so timezone does not split days', () => {
    const d = new Date('2026-04-18T23:59:59.999Z');
    expect(formatYMD(d)).toBe('2026-04-18');
    const d2 = new Date('2026-01-01T00:00:00.000Z');
    expect(formatYMD(d2)).toBe('2026-01-01');
    expect(formatYMD('2026-04-18T12:00:00Z')).toBe('2026-04-18');
    expect(formatYMD(new Date('not-a-date'))).toBe(null);
  });

  test('(e) parseYMD turns YYYY-MM-DD back into UTC midnight ms', () => {
    const ms = parseYMD('2026-04-18');
    expect(Number.isFinite(ms)).toBe(true);
    expect(new Date(ms).toISOString()).toBe('2026-04-18T00:00:00.000Z');
    expect(Number.isNaN(parseYMD('04-18-2026'))).toBe(true);
    expect(Number.isNaN(parseYMD('bogus'))).toBe(true);
    expect(Number.isNaN(parseYMD(''))).toBe(true);
  });

  test('(f) FILE_PATTERN matches the naming convention', () => {
    expect(FILE_PATTERN.test('events-2026-04-18.jsonl')).toBe(true);
    expect(FILE_PATTERN.test('events-2026-4-8.jsonl')).toBe(false);
    expect(FILE_PATTERN.test('events.jsonl')).toBe(false);
    expect(FILE_PREFIX + '2026-04-18' + FILE_SUFFIX).toBe('events-2026-04-18.jsonl');
  });

  test('(g) nextId returns unique ids', () => {
    const a = nextId();
    const b = nextId();
    expect(typeof a).toBe('string');
    expect(a.length > 5).toBe(true);
    expect(a === b).toBe(false);
  });

  test('(h) normalizePayload coerces null/array/primitive into {}', () => {
    expect(normalizePayload(null)).toEqual({});
    expect(normalizePayload(undefined)).toEqual({});
    expect(normalizePayload([1, 2])).toEqual({});
    expect(normalizePayload('string')).toEqual({});
    expect(normalizePayload({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('(10.9) ScribeV2.record()', () => {
  test('(a) writes one JSONL line with canonical shape', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    const ev = s.record({ type: 'task_start', worker: 'w1', payload: { branch: 'c4/foo' } });

    expect(ev).not.toBe(null);
    expect(ev.type).toBe('task_start');
    expect(ev.worker).toBe('w1');
    expect(typeof ev.id).toBe('string');
    expect(typeof ev.ts).toBe('string');
    expect(ev.payload.branch).toBe('c4/foo');

    const today = formatYMD(new Date());
    const file = path.join(dir, 'events-' + today + '.jsonl');
    const lines = readLines(file);
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toEqual(ev);
  });

  test('(b) rejects unknown event types without writing', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    const out = s.record({ type: 'not_a_real_type', worker: 'w1' });
    expect(out).toBe(null);
    const today = formatYMD(new Date());
    const file = path.join(dir, 'events-' + today + '.jsonl');
    expect(fs.existsSync(file)).toBe(false);
  });

  test('(c) rejects missing/null event object', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    expect(s.record(null)).toBe(null);
    expect(s.record(undefined)).toBe(null);
    expect(s.record('string')).toBe(null);
    expect(s.record({})).toBe(null);
  });

  test('(d) worker/task_id default to null when not supplied', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    const ev = s.record({ type: 'error', payload: { message: 'boom' } });
    expect(ev.worker).toBe(null);
    expect(ev.task_id).toBe(null);
    expect(ev.payload.message).toBe('boom');
  });

  test('(e) respects caller-supplied ts so clock drift is controllable', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    const ts = '2026-04-18T12:00:00.000Z';
    const ev = s.record({ type: 'merge_attempt', ts, worker: 'w1' });
    expect(ev.ts).toBe(ts);
    const file = path.join(dir, 'events-2026-04-18.jsonl');
    expect(fs.existsSync(file)).toBe(true);
  });

  test('(f) creates the log dir on first write', () => {
    const parent = mkTmpDir();
    const dir = path.join(parent, 'nested', 'c4');
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'worker_spawn', worker: 'w1', ts: '2026-04-18T10:00:00Z' });
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(path.join(dir, 'events-2026-04-18.jsonl'))).toBe(true);
  });

  test('(g) multiple writes append in order within the same file', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'task_start', worker: 'a', ts: '2026-04-18T10:00:00Z' });
    s.record({ type: 'tool_call', worker: 'a', ts: '2026-04-18T10:00:01Z' });
    s.record({ type: 'task_complete', worker: 'a', ts: '2026-04-18T10:00:02Z' });
    const lines = readLines(path.join(dir, 'events-2026-04-18.jsonl'));
    expect(lines.length).toBe(3);
    const types = lines.map((l) => JSON.parse(l).type);
    expect(types).toEqual(['task_start', 'tool_call', 'task_complete']);
  });

  test('(h) events with different ts dates land in different files', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'task_start', worker: 'a', ts: '2026-04-17T23:30:00Z' });
    s.record({ type: 'task_start', worker: 'a', ts: '2026-04-18T00:30:00Z' });
    expect(fs.existsSync(path.join(dir, 'events-2026-04-17.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'events-2026-04-18.jsonl'))).toBe(true);
  });
});

describe('(10.9) ScribeV2.query()', () => {
  function mkDb() {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'worker_spawn', worker: 'a', ts: '2026-04-17T10:00:00Z' });
    s.record({ type: 'task_start',   worker: 'a', ts: '2026-04-17T10:05:00Z' });
    s.record({ type: 'tool_call',    worker: 'a', ts: '2026-04-17T10:05:30Z', payload: { tool: 'Edit' } });
    s.record({ type: 'error',        worker: 'a', ts: '2026-04-17T10:06:00Z', payload: { message: 'boom' } });
    s.record({ type: 'task_complete', worker: 'a', ts: '2026-04-17T10:07:00Z' });
    s.record({ type: 'worker_spawn', worker: 'b', ts: '2026-04-18T09:00:00Z' });
    s.record({ type: 'task_start',   worker: 'b', ts: '2026-04-18T09:05:00Z' });
    s.record({ type: 'halt',         worker: 'b', ts: '2026-04-18T09:10:00Z' });
    return { dir, s };
  }

  test('(a) no filter returns every event chronologically', () => {
    const { s } = mkDb();
    const out = s.query();
    expect(out.length).toBe(8);
    expect(out[0].worker).toBe('a');
    expect(out[out.length - 1].worker).toBe('b');
  });

  test('(b) time range filters across multiple day files', () => {
    const { s } = mkDb();
    const out = s.query({
      from: '2026-04-17T10:05:00Z',
      to:   '2026-04-18T09:05:00Z',
    });
    // 10:05 through 09:05 inclusive -> task_start(a) through task_start(b) = 6 events
    expect(out.length).toBe(6);
    expect(out[0].type).toBe('task_start');
    expect(out[out.length - 1].type).toBe('task_start');
    expect(out[out.length - 1].worker).toBe('b');
  });

  test('(c) types filter narrows to a single type', () => {
    const { s } = mkDb();
    const out = s.query({ types: ['task_start'] });
    expect(out.length).toBe(2);
    for (const ev of out) expect(ev.type).toBe('task_start');
  });

  test('(d) types accepts a string too', () => {
    const { s } = mkDb();
    const out = s.query({ types: 'error' });
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('error');
  });

  test('(e) workers filter excludes the other worker', () => {
    const { s } = mkDb();
    const out = s.query({ workers: ['b'] });
    expect(out.length).toBe(3);
    for (const ev of out) expect(ev.worker).toBe('b');
  });

  test('(f) limit caps the returned count', () => {
    const { s } = mkDb();
    const out = s.query({ limit: 3 });
    expect(out.length).toBe(3);
  });

  test('(g) reverse + limit returns newest-first head', () => {
    const { s } = mkDb();
    const out = s.query({ reverse: true, limit: 2 });
    expect(out.length).toBe(2);
    // 8 events sorted chronologically -> reversed -> newest first
    expect(out[0].type).toBe('halt');
    expect(out[1].type).toBe('task_start');
    expect(out[1].worker).toBe('b');
  });

  test('(h) empty types array behaves as no filter', () => {
    const { s } = mkDb();
    const out = s.query({ types: [] });
    expect(out.length).toBe(8);
  });

  test('(i) unknown types array yields zero results', () => {
    const { s } = mkDb();
    const out = s.query({ types: ['never_emitted_type'] });
    expect(out.length).toBe(0);
  });

  test('(j) query survives a corrupt JSONL line', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'task_start', worker: 'a', ts: '2026-04-18T10:00:00Z' });
    // Inject a garbage line directly into the file; query should skip it.
    fs.appendFileSync(path.join(dir, 'events-2026-04-18.jsonl'), '{not-json\n');
    s.record({ type: 'task_complete', worker: 'a', ts: '2026-04-18T10:01:00Z' });
    const out = s.query();
    expect(out.length).toBe(2);
  });

  test('(k) query on an empty log dir returns []', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    expect(s.query()).toEqual([]);
  });

  test('(l) from/to prunes non-overlapping day files without reading them', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'task_start', ts: '2026-04-15T00:00:00Z', worker: 'a' });
    s.record({ type: 'task_start', ts: '2026-04-18T10:00:00Z', worker: 'a' });
    s.record({ type: 'task_start', ts: '2026-04-20T00:00:00Z', worker: 'a' });
    // Only the 2026-04-18 day file overlaps this window.
    const out = s.query({ from: '2026-04-18T00:00:00Z', to: '2026-04-18T23:59:59Z' });
    expect(out.length).toBe(1);
    expect(out[0].ts).toBe('2026-04-18T10:00:00Z');
  });
});

describe('(10.9) ScribeV2.contextAround()', () => {
  function mkDb() {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'worker_spawn', worker: 'a', ts: '2026-04-18T10:00:00Z' });
    s.record({ type: 'task_start',   worker: 'a', ts: '2026-04-18T10:02:00Z' });
    const errEv = s.record({ type: 'error', worker: 'a', ts: '2026-04-18T10:05:00Z', payload: { message: 'boom' } });
    s.record({ type: 'task_complete', worker: 'a', ts: '2026-04-18T10:07:00Z' });
    s.record({ type: 'worker_close', worker: 'a', ts: '2026-04-18T10:20:00Z' });
    return { dir, s, errEv };
  }

  test('(a) returns events in the [t-before, t+after] window around an ISO timestamp', () => {
    const { s } = mkDb();
    const out = s.contextAround('2026-04-18T10:05:00Z', 5, 5);
    // 10:00 through 10:10 inclusive: worker_spawn, task_start, error, task_complete (4 events).
    expect(out.length).toBe(4);
    const types = out.map((ev) => ev.type);
    expect(types).toContain('worker_spawn');
    expect(types).toContain('error');
    expect(types).not.toContain('worker_close');
  });

  test('(b) resolves a target expressed as an event id', () => {
    const { s, errEv } = mkDb();
    const out = s.contextAround(errEv.id, 3, 3);
    // 10:02 through 10:08: task_start, error, task_complete (3 events).
    expect(out.length).toBe(3);
    const types = out.map((ev) => ev.type);
    expect(types).toEqual(['task_start', 'error', 'task_complete']);
  });

  test('(c) default window is +/- 5 minutes', () => {
    const { s } = mkDb();
    const out = s.contextAround('2026-04-18T10:05:00Z');
    expect(out.length).toBe(4);
  });

  test('(d) target in the distant past returns empty window', () => {
    const { s } = mkDb();
    const out = s.contextAround('2020-01-01T00:00:00Z', 5, 5);
    expect(out).toEqual([]);
  });

  test('(e) unresolvable target returns []', () => {
    const { s } = mkDb();
    expect(s.contextAround('not-a-real-id-or-date', 5, 5)).toEqual([]);
    expect(s.contextAround(null, 5, 5)).toEqual([]);
    expect(s.contextAround(undefined, 5, 5)).toEqual([]);
  });

  test('(f) target as Date object works too', () => {
    const { s } = mkDb();
    const out = s.contextAround(new Date('2026-04-18T10:05:00Z'), 5, 5);
    expect(out.length).toBe(4);
  });
});

describe('(10.9) ScribeV2.findById() + listDays()', () => {
  test('(a) findById locates a recorded event', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    const a = s.record({ type: 'task_start', worker: 'a', ts: '2026-04-18T10:00:00Z' });
    const b = s.record({ type: 'error', worker: 'a', ts: '2026-04-18T10:05:00Z' });
    expect(s.findById(a.id)).toEqual(a);
    expect(s.findById(b.id)).toEqual(b);
    expect(s.findById('missing')).toBe(null);
    expect(s.findById('')).toBe(null);
    expect(s.findById(null)).toBe(null);
  });

  test('(b) listDays returns every day file newest-first', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    s.record({ type: 'task_start', ts: '2026-04-15T00:00:00Z', worker: 'a' });
    s.record({ type: 'task_start', ts: '2026-04-18T00:00:00Z', worker: 'a' });
    s.record({ type: 'task_start', ts: '2026-04-17T00:00:00Z', worker: 'a' });
    const days = s.listDays();
    expect(days).toEqual(['2026-04-18', '2026-04-17', '2026-04-15']);
  });

  test('(c) listDays ignores unrelated files in the log dir', () => {
    const dir = mkTmpDir();
    const s = new ScribeV2({ logDir: dir });
    fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'noise');
    fs.writeFileSync(path.join(dir, 'events-bogus.jsonl'), 'noise');
    s.record({ type: 'task_start', ts: '2026-04-18T00:00:00Z', worker: 'a' });
    expect(s.listDays()).toEqual(['2026-04-18']);
  });
});

describe('(10.9) shared instance', () => {
  test('(a) getShared returns the same singleton until resetShared', () => {
    const dir = mkTmpDir();
    resetShared();
    const a = getShared({ logDir: dir });
    const b = getShared({ logDir: dir });
    expect(a).toBe(b);
    resetShared();
    const c = getShared({ logDir: dir });
    expect(c).not.toBe(a);
  });
});
