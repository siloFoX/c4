// (10.7) Schedule / calendar management tests.
//
// Exercises src/schedule-mgmt.js against an isolated tmpdir so the
// suite never writes to the operator's real ~/.c4/schedules.json.
//
// Coverage targets:
//  - parseCron: every-minute, every-hour, specific time, day-of-week,
//    step values, ranges, comma-lists, invalid syntax rejected
//  - computeNextRun: known inputs -> known outputs at fixed now, UTC,
//    month boundary, leap Feb 29
//  - CRUD: create/list/update/delete + enable/disable
//  - enable/disable gates runDueSchedules
//  - storage roundtrip (reload, missing file, malformed JSON)
//  - forceRun bumps lastRun without advancing nextRun
//  - history retention keeps last HISTORY_LIMIT entries
//  - scheduleTick dispatcher callback invoked for due schedules
//  - Gantt text render shape + rowless edge case

'use strict';
require('./jest-shim');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ScheduleManager,
  FIELD_BOUNDS,
  DEFAULT_TIMEZONE,
  HISTORY_LIMIT,
  defaultSchedulesPath,
  parseCron,
  parseField,
  validateCron,
  computeNextRun,
  wallFields,
  cronMatches,
  normalizeSchedule,
  ensureShape,
  freshState,
  isId,
} = require('../src/schedule-mgmt');

function mkTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-schedule-test-'));
  return path.join(dir, 'schedules.json');
}

function newMgr() {
  return new ScheduleManager({ storePath: mkTmpStore() });
}

describe('(10.7) helpers', () => {
  test('(a) defaultSchedulesPath points at home/.c4/schedules.json', () => {
    const p = defaultSchedulesPath();
    expect(p.endsWith(path.join('.c4', 'schedules.json'))).toBe(true);
    expect(p.startsWith(os.homedir())).toBe(true);
  });

  test('(b) FIELD_BOUNDS covers all five fields', () => {
    expect(FIELD_BOUNDS.minute.max).toBe(59);
    expect(FIELD_BOUNDS.hour.max).toBe(23);
    expect(FIELD_BOUNDS.dom.max).toBe(31);
    expect(FIELD_BOUNDS.month.max).toBe(12);
    expect(FIELD_BOUNDS.dow.max).toBe(6);
  });

  test('(c) DEFAULT_TIMEZONE and HISTORY_LIMIT are exposed as constants', () => {
    expect(DEFAULT_TIMEZONE).toBe('UTC');
    expect(HISTORY_LIMIT).toBe(100);
  });

  test('(d) isId rejects bad ids', () => {
    expect(isId('daily-backup')).toBe(true);
    expect(isId('sch_1')).toBe(true);
    expect(isId('')).toBe(false);
    expect(isId('bad id')).toBe(false);
    expect(isId('bad/id')).toBe(false);
  });

  test('(e) normalizeSchedule fills missing fields and defaults tz to UTC', () => {
    const s = normalizeSchedule({ id: 's1', cronExpr: '* * * * *', taskTemplate: 't' });
    expect(s.name).toBe('s1');
    expect(s.enabled).toBe(true);
    expect(s.timezone).toBe('UTC');
    expect(s.history).toEqual([]);
    expect(s.projectId).toBe(null);
    expect(s.assignee).toBe(null);
  });

  test('(f) normalizeSchedule preserves enabled=false when explicit', () => {
    const s = normalizeSchedule({ id: 's', enabled: false });
    expect(s.enabled).toBe(false);
  });

  test('(g) freshState returns an empty schedules map', () => {
    expect(freshState()).toEqual({ schedules: {} });
  });

  test('(h) ensureShape drops entries with invalid cron or missing fields', () => {
    const shaped = ensureShape({
      schedules: {
        good: { id: 'good', cronExpr: '0 * * * *', taskTemplate: 't' },
        'bad id!': { id: 'bad id!', cronExpr: '0 * * * *', taskTemplate: 't' },
        bad_cron: { id: 'bad_cron', cronExpr: 'not-cron', taskTemplate: 't' },
        no_template: { id: 'no_template', cronExpr: '0 * * * *' },
      },
    });
    expect(shaped.schedules.good).toBeDefined();
    expect(shaped.schedules['bad id!']).toBeUndefined();
    expect(shaped.schedules.bad_cron).toBeUndefined();
    expect(shaped.schedules.no_template).toBeUndefined();
  });
});

describe('(10.7) parseField', () => {
  test('(a) literal value', () => {
    const s = parseField('7', 0, 59, 'minute');
    expect(s.has(7)).toBe(true);
    expect(s.size).toBe(1);
  });

  test('(b) wildcard expands to full range', () => {
    const s = parseField('*', 0, 5, 'test');
    expect(s.size).toBe(6);
    expect(s.has(0)).toBe(true);
    expect(s.has(5)).toBe(true);
  });

  test('(c) comma list', () => {
    const s = parseField('1,3,5', 0, 59, 'minute');
    expect(Array.from(s).sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  test('(d) range', () => {
    const s = parseField('1-5', 0, 59, 'minute');
    expect(Array.from(s).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test('(e) step over wildcard', () => {
    const s = parseField('*/15', 0, 59, 'minute');
    expect(Array.from(s).sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  test('(f) step over range', () => {
    const s = parseField('0-20/5', 0, 59, 'minute');
    expect(Array.from(s).sort((a, b) => a - b)).toEqual([0, 5, 10, 15, 20]);
  });

  test('(g) out-of-bounds rejected', () => {
    let threw = false;
    try { parseField('60', 0, 59, 'minute'); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(h) inverted range rejected', () => {
    let threw = false;
    try { parseField('5-3', 0, 59, 'minute'); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(i) non-numeric rejected', () => {
    let threw = false;
    try { parseField('MON', 0, 6, 'dow'); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(j) non-positive step rejected', () => {
    let threw = false;
    try { parseField('*/0', 0, 59, 'minute'); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('(10.7) parseCron / validateCron', () => {
  test('(a) every minute expression parses', () => {
    expect(validateCron('* * * * *')).toBe(true);
  });

  test('(b) every hour at :00', () => {
    const p = parseCron('0 * * * *');
    expect(p.minute.has(0)).toBe(true);
    expect(p.minute.size).toBe(1);
  });

  test('(c) specific time 2am daily', () => {
    const p = parseCron('0 2 * * *');
    expect(p.hour.has(2)).toBe(true);
    expect(p.hour.size).toBe(1);
    expect(p.dom.size).toBe(31);
  });

  test('(d) day-of-week Monday 9am', () => {
    const p = parseCron('0 9 * * 1');
    expect(p.dow.has(1)).toBe(true);
    expect(p.dowSpecified).toBe(true);
    expect(p.domSpecified).toBe(false);
  });

  test('(e) step + range combinations', () => {
    const p = parseCron('*/10 0-6 * * *');
    expect(p.minute.size).toBe(6);
    expect(p.hour.size).toBe(7);
  });

  test('(f) comma list', () => {
    const p = parseCron('0,15,30,45 * * * *');
    expect(Array.from(p.minute).sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
  });

  test('(g) field-count mismatch rejected', () => {
    let threw = false;
    try { parseCron('0 * * *'); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(h) non-string input rejected', () => {
    let threw = false;
    try { parseCron(null); } catch { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('(10.7) computeNextRun', () => {
  test('(a) every minute from fixed now returns the next whole minute', () => {
    const now = new Date('2026-04-18T10:15:30Z');
    const r = computeNextRun('* * * * *', 'UTC', now);
    expect(r.toISOString()).toBe('2026-04-18T10:16:00.000Z');
  });

  test('(b) 2am daily from 1am returns same-day 2am', () => {
    const r = computeNextRun('0 2 * * *', 'UTC', new Date('2026-04-18T01:00:00Z'));
    expect(r.toISOString()).toBe('2026-04-18T02:00:00.000Z');
  });

  test('(c) 2am daily from 3am returns next-day 2am', () => {
    const r = computeNextRun('0 2 * * *', 'UTC', new Date('2026-04-18T03:00:00Z'));
    expect(r.toISOString()).toBe('2026-04-19T02:00:00.000Z');
  });

  test('(d) every 15 minutes step', () => {
    const r = computeNextRun('*/15 * * * *', 'UTC', new Date('2026-04-18T10:07:00Z'));
    expect(r.toISOString()).toBe('2026-04-18T10:15:00.000Z');
  });

  test('(e) Monday 9am from Sunday advances to Monday', () => {
    // 2026-04-19 is a Sunday. Next Monday = 2026-04-20.
    const r = computeNextRun('0 9 * * 1', 'UTC', new Date('2026-04-19T12:00:00Z'));
    expect(r.toISOString()).toBe('2026-04-20T09:00:00.000Z');
  });

  test('(f) month boundary: 0 0 1 * * from mid-April returns May 1 00:00', () => {
    const r = computeNextRun('0 0 1 * *', 'UTC', new Date('2026-04-18T10:00:00Z'));
    expect(r.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  test('(g) leap year Feb 29: 0 0 29 2 * resolves to 2028-02-29', () => {
    // 2027 is not a leap year; next Feb 29 after 2026 is 2028.
    const r = computeNextRun('0 0 29 2 *', 'UTC', new Date('2026-03-01T00:00:00Z'));
    expect(r.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  test('(h) DOM/DOW OR semantics: 0 0 13 * 5 fires on either condition', () => {
    // From 2026-04-01 the next hit is Friday 2026-04-03 (first Friday
    // after start), not the 13th. DOW match is earlier.
    const r = computeNextRun('0 0 13 * 5', 'UTC', new Date('2026-04-01T00:01:00Z'));
    // Expect: next Friday or next 13th, whichever is first. 2026-04-03
    // is a Friday.
    expect(r.toISOString()).toBe('2026-04-03T00:00:00.000Z');
  });
});

describe('(10.7) wallFields + cronMatches', () => {
  test('(a) wallFields in UTC gives expected breakdown', () => {
    const f = wallFields(new Date('2026-04-18T10:15:00Z'), 'UTC');
    expect(f.minute).toBe(15);
    expect(f.hour).toBe(10);
    expect(f.dom).toBe(18);
    expect(f.month).toBe(4);
    // 2026-04-18 is a Saturday (dow 6)
    expect(f.dow).toBe(6);
  });

  test('(b) cronMatches true for matching wall fields', () => {
    const parsed = parseCron('15 10 18 4 *');
    const f = { minute: 15, hour: 10, dom: 18, month: 4, dow: 6 };
    expect(cronMatches(parsed, f)).toBe(true);
  });

  test('(c) cronMatches false when month differs', () => {
    const parsed = parseCron('15 10 18 4 *');
    const f = { minute: 15, hour: 10, dom: 18, month: 5, dow: 6 };
    expect(cronMatches(parsed, f)).toBe(false);
  });
});

describe('(10.7) CRUD', () => {
  test('(a) createSchedule stores a normalised schedule and computes nextRun', () => {
    const mgr = newMgr();
    const s = mgr.createSchedule({
      id: 'daily2am',
      name: 'daily backup',
      cronExpr: '0 2 * * *',
      taskTemplate: 'run backup',
    });
    expect(s.id).toBe('daily2am');
    expect(s.enabled).toBe(true);
    expect(s.nextRun).toBeDefined();
    expect(typeof s.nextRun).toBe('string');
  });

  test('(b) createSchedule rejects invalid cron before persisting', () => {
    const mgr = newMgr();
    let threw = false;
    try {
      mgr.createSchedule({ id: 'x', cronExpr: '60 * * * *', taskTemplate: 't' });
    } catch { threw = true; }
    expect(threw).toBe(true);
    expect(mgr.listSchedules()).toEqual([]);
  });

  test('(c) createSchedule rejects duplicate id', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'dup', cronExpr: '* * * * *', taskTemplate: 't' });
    let threw = false;
    try { mgr.createSchedule({ id: 'dup', cronExpr: '* * * * *', taskTemplate: 't' }); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(d) listSchedules filters by enabled flag', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'a', cronExpr: '* * * * *', taskTemplate: 't' });
    mgr.createSchedule({ id: 'b', cronExpr: '* * * * *', taskTemplate: 't' });
    mgr.disableSchedule('b');
    const enabled = mgr.listSchedules({ enabled: true });
    expect(enabled.length).toBe(1);
    expect(enabled[0].id).toBe('a');
    const disabled = mgr.listSchedules({ enabled: false });
    expect(disabled.length).toBe(1);
    expect(disabled[0].id).toBe('b');
  });

  test('(e) listSchedules filters by projectId', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'p1', cronExpr: '* * * * *', taskTemplate: 't', projectId: 'alpha' });
    mgr.createSchedule({ id: 'p2', cronExpr: '* * * * *', taskTemplate: 't', projectId: 'beta' });
    const r = mgr.listSchedules({ projectId: 'alpha' });
    expect(r.length).toBe(1);
    expect(r[0].id).toBe('p1');
  });

  test('(f) updateSchedule recomputes nextRun when cron changes', () => {
    const mgr = newMgr();
    const initial = mgr.createSchedule({ id: 'u', cronExpr: '0 2 * * *', taskTemplate: 't' });
    const firstNext = initial.nextRun;
    const patched = mgr.updateSchedule('u', { cronExpr: '0 14 * * *' });
    expect(patched.cronExpr).toBe('0 14 * * *');
    expect(patched.nextRun).not.toBe(firstNext);
  });

  test('(g) updateSchedule rejects bad cron patch', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'u', cronExpr: '0 2 * * *', taskTemplate: 't' });
    let threw = false;
    try { mgr.updateSchedule('u', { cronExpr: 'garbage' }); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('(h) deleteSchedule returns true/false', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'd', cronExpr: '* * * * *', taskTemplate: 't' });
    expect(mgr.deleteSchedule('d')).toBe(true);
    expect(mgr.deleteSchedule('d')).toBe(false);
    expect(mgr.getSchedule('d')).toBeNull();
  });

  test('(i) enable/disable toggles the enabled flag', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'e', cronExpr: '* * * * *', taskTemplate: 't' });
    expect(mgr.getSchedule('e').enabled).toBe(true);
    mgr.disableSchedule('e');
    expect(mgr.getSchedule('e').enabled).toBe(false);
    mgr.enableSchedule('e');
    expect(mgr.getSchedule('e').enabled).toBe(true);
  });
});

describe('(10.7) runDueSchedules gating', () => {
  test('(a) disabled schedules do not fire even when due', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 's', cronExpr: '* * * * *', taskTemplate: 't' });
    mgr.disableSchedule('s');
    // Force nextRun into the past to prove enable-gating.
    const state = mgr._load();
    state.schedules.s.nextRun = new Date('2020-01-01T00:00:00Z').toISOString();
    const due = mgr.runDueSchedules(new Date('2026-04-18T12:00:00Z'));
    expect(due).toEqual([]);
  });

  test('(b) enabled + past nextRun fires and advances', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'hourly', cronExpr: '0 * * * *', taskTemplate: 't' });
    const state = mgr._load();
    state.schedules.hourly.nextRun = new Date('2026-04-18T10:00:00Z').toISOString();
    const due = mgr.runDueSchedules(new Date('2026-04-18T10:05:00Z'));
    expect(due).toEqual(['hourly']);
    const after = mgr.getSchedule('hourly');
    expect(after.lastRun).toBeDefined();
    const nextMs = Date.parse(after.nextRun);
    expect(nextMs > Date.parse('2026-04-18T10:05:00Z')).toBe(true);
  });
});

describe('(10.7) forceRun + history retention', () => {
  test('(a) forceRun bumps lastRun without advancing nextRun', () => {
    const mgr = newMgr();
    const s = mgr.createSchedule({ id: 'f', cronExpr: '0 2 * * *', taskTemplate: 't' });
    const nextBefore = s.nextRun;
    const forced = mgr.forceRun('f');
    expect(forced.lastRun).toBeDefined();
    expect(forced.nextRun).toBe(nextBefore);
    expect(forced.history.length).toBe(1);
    expect(forced.history[0].status).toBe('forced');
  });

  test('(b) history is trimmed to HISTORY_LIMIT', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'h', cronExpr: '* * * * *', taskTemplate: 't' });
    const state = mgr._load();
    const entries = [];
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      entries.push({ time: new Date(Date.now() - i * 60000).toISOString(), status: 'tick' });
    }
    state.schedules.h.history = entries;
    mgr.forceRun('h');
    const after = mgr.getSchedule('h');
    expect(after.history.length).toBe(HISTORY_LIMIT);
  });
});

describe('(10.7) storage roundtrip', () => {
  test('(a) fresh ScheduleManager sees writes from the first', () => {
    const storePath = mkTmpStore();
    const a = new ScheduleManager({ storePath });
    a.createSchedule({ id: 'shared', cronExpr: '* * * * *', taskTemplate: 't' });
    const b = new ScheduleManager({ storePath });
    const got = b.getSchedule('shared');
    expect(got).toBeDefined();
    expect(got.cronExpr).toBe('* * * * *');
  });

  test('(b) missing store file returns an empty state without throwing', () => {
    const mgr = new ScheduleManager({ storePath: path.join(os.tmpdir(), 'c4-sched-nonexistent-' + Date.now() + '.json') });
    expect(mgr.listSchedules()).toEqual([]);
  });

  test('(c) malformed JSON falls back to fresh state', () => {
    const storePath = mkTmpStore();
    fs.writeFileSync(storePath, '{ not valid json');
    const mgr = new ScheduleManager({ storePath });
    expect(mgr.listSchedules()).toEqual([]);
  });
});

describe('(10.7) scheduleTick dispatcher', () => {
  test('(a) tick invokes dispatcher for each due schedule and returns summary', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 't1', cronExpr: '0 * * * *', taskTemplate: 'run' });
    mgr.createSchedule({ id: 't2', cronExpr: '0 * * * *', taskTemplate: 'run' });
    const state = mgr._load();
    const past = new Date('2026-04-18T09:55:00Z').toISOString();
    state.schedules.t1.nextRun = past;
    state.schedules.t2.nextRun = past;
    const seen = [];
    const summary = mgr.scheduleTick(new Date('2026-04-18T10:00:00Z'), (s) => seen.push(s.id));
    expect(summary.dueIds.length).toBe(2);
    expect(seen.sort()).toEqual(['t1', 't2']);
  });

  test('(b) tick with no dispatcher still advances nextRun for due schedules', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'n1', cronExpr: '0 * * * *', taskTemplate: 'r' });
    const state = mgr._load();
    state.schedules.n1.nextRun = new Date('2026-04-18T09:00:00Z').toISOString();
    const summary = mgr.scheduleTick(new Date('2026-04-18T10:05:00Z'));
    expect(summary.dueIds).toEqual(['n1']);
    const after = mgr.getSchedule('n1');
    expect(Date.parse(after.nextRun) > Date.parse('2026-04-18T10:05:00Z')).toBe(true);
  });

  test('(c) dispatcher exceptions do not abort the tick', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'boom', cronExpr: '0 * * * *', taskTemplate: 'r' });
    const state = mgr._load();
    state.schedules.boom.nextRun = new Date('2026-04-18T09:00:00Z').toISOString();
    let ran = false;
    mgr.scheduleTick(new Date('2026-04-18T10:00:00Z'), () => { ran = true; throw new Error('boom'); });
    expect(ran).toBe(true);
    // The due schedule still advanced so the next tick does not refire.
    const after = mgr.getSchedule('boom');
    expect(after.lastRun).toBeDefined();
  });
});

describe('(10.7) Gantt render', () => {
  test('(a) gantt returns rows per enabled schedule with run timestamps in window', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'daily', cronExpr: '0 2 * * *', taskTemplate: 'r' });
    mgr.createSchedule({ id: 'hourly', cronExpr: '0 * * * *', taskTemplate: 'r' });
    const snap = mgr.gantt(1, new Date('2026-04-18T00:00:00Z'));
    expect(snap.rows.length).toBe(2);
    const daily = snap.rows.find((r) => r.id === 'daily');
    const hourly = snap.rows.find((r) => r.id === 'hourly');
    // Daily should fire 7 times in a week, hourly 7*24 = 168.
    expect(daily.runs.length).toBe(7);
    expect(hourly.runs.length).toBe(168);
  });

  test('(b) disabled schedules are excluded from gantt', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'on', cronExpr: '0 * * * *', taskTemplate: 'r' });
    mgr.createSchedule({ id: 'off', cronExpr: '0 * * * *', taskTemplate: 'r' });
    mgr.disableSchedule('off');
    const snap = mgr.gantt(1, new Date('2026-04-18T00:00:00Z'));
    expect(snap.rows.length).toBe(1);
    expect(snap.rows[0].id).toBe('on');
  });

  test('(c) renderGanttText is ASCII and contains labels + window markers', () => {
    const mgr = newMgr();
    mgr.createSchedule({ id: 'daily-2am', name: 'Daily 2am', cronExpr: '0 2 * * *', taskTemplate: 'r' });
    const text = mgr.renderGanttText(2, new Date('2026-04-18T00:00:00Z'));
    // Must be ASCII-only.
    expect(/^[\x00-\x7F]*$/.test(text)).toBe(true);
    expect(text.indexOf('Daily 2am') >= 0).toBe(true);
    expect(text.indexOf('#') >= 0).toBe(true);
  });

  test('(d) renderGanttText with no enabled schedules still produces header', () => {
    const mgr = newMgr();
    const text = mgr.renderGanttText(1, new Date('2026-04-18T00:00:00Z'));
    expect(text.indexOf('(no enabled schedules)') >= 0).toBe(true);
  });
});
