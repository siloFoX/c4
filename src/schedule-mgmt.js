'use strict';

// (10.7) Schedule / calendar management.
//
// Cron-driven scheduled tasks that feed the worker creation pipeline.
// Builds on project-mgmt (10.8) - a schedule can pin itself to a project
// so dispatched workers inherit the right branch prefix - and on
// org-mgmt (10.6) via the `assignee` field that resolves to a dept
// member. Google Calendar / MCP sync is deferred to a future iteration;
// this patch owns the cron engine, the schedule store, and the CLI
// surface.
//
// Design notes
// ------------
// 1. The cron parser is minimal on purpose: standard five-field
//    expressions (min hour dom month dow) with `*`, numeric literals,
//    comma-lists, ranges `a-b`, and step `*/N` or `a-b/N`. We do not
//    support `L`, `W`, `#`, names (`MON`, `JAN`), or seconds because
//    those add surface area with no operational payoff at the batch-job
//    granularity c4 cares about. Unknown syntax throws early with a
//    descriptive message so the CLI can surface it before writing to
//    the store.
// 2. `computeNextRun(expr, tz, now)` walks forward minute by minute so
//    complex interactions (DOM/DOW OR semantics, month end, leap day)
//    are handled without a separate closed-form solver. The walk caps
//    at one year; never-matching expressions (e.g. `0 0 31 2 *` -> Feb
//    31) throw instead of looping forever.
// 3. The module is a pure storage + decision layer. `scheduleTick(now,
//    dispatch?)` returns the due schedule ids and, when a dispatcher is
//    provided, invokes it per due schedule. We never shell out from
//    here; the daemon's existing healthCheck loop calls `scheduleTick`
//    once per minute and owns the actual worker create path.
// 4. History retention is bounded - we keep the last 100 runs per
//    schedule so an always-on daily job does not grow the JSON file
//    without bound across months.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const FIELD_BOUNDS = Object.freeze({
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 6 },
});

const FIELD_ORDER = Object.freeze(['minute', 'hour', 'dom', 'month', 'dow']);

const DEFAULT_TIMEZONE = 'UTC';
const HISTORY_LIMIT = 100;
// Cap the walk at 5 years of minutes. This covers leap-year corner
// cases like `0 0 29 2 *` (next Feb 29 can be up to 4 years out) while
// still terminating fast enough on genuinely-unreachable expressions
// that a misconfigured schedule surfaces as an error instead of
// spinning forever.
const WALK_CAP_MINUTES = 5 * 366 * 24 * 60;
const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function defaultSchedulesPath() {
  return path.join(os.homedir(), '.c4', 'schedules.json');
}

function isId(v) {
  return typeof v === 'string' && v.length > 0 && ID_PATTERN.test(v);
}

function genId() {
  return 'sch_' + crypto.randomBytes(5).toString('hex');
}

// Parse one cron field (e.g. `*/5`, `1-10`, `0,30`, `*`) into a Set of
// allowed integers within [min, max]. Throws on malformed input so the
// caller can surface the failure at createSchedule time instead of on
// the first tick.
function parseField(raw, min, max, fieldName) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('Invalid cron field ' + fieldName + ': empty');
  }
  const allowed = new Set();
  const parts = raw.split(',');
  for (const part of parts) {
    if (part.length === 0) {
      throw new Error('Invalid cron field ' + fieldName + ': empty segment');
    }
    let body = part;
    let step = 1;
    const slashIdx = part.indexOf('/');
    if (slashIdx !== -1) {
      body = part.slice(0, slashIdx);
      const stepStr = part.slice(slashIdx + 1);
      if (stepStr.length === 0 || !/^\d+$/.test(stepStr)) {
        throw new Error('Invalid cron field ' + fieldName + ': bad step "' + part + '"');
      }
      step = parseInt(stepStr, 10);
      if (step <= 0) {
        throw new Error('Invalid cron field ' + fieldName + ': non-positive step');
      }
    }
    let rangeStart;
    let rangeEnd;
    if (body === '*') {
      rangeStart = min;
      rangeEnd = max;
    } else if (body.indexOf('-') !== -1) {
      const segs = body.split('-');
      if (segs.length !== 2 || segs[0].length === 0 || segs[1].length === 0) {
        throw new Error('Invalid cron field ' + fieldName + ': bad range "' + body + '"');
      }
      if (!/^\d+$/.test(segs[0]) || !/^\d+$/.test(segs[1])) {
        throw new Error('Invalid cron field ' + fieldName + ': non-numeric range');
      }
      rangeStart = parseInt(segs[0], 10);
      rangeEnd = parseInt(segs[1], 10);
      if (rangeStart > rangeEnd) {
        throw new Error('Invalid cron field ' + fieldName + ': inverted range');
      }
    } else {
      if (!/^\d+$/.test(body)) {
        throw new Error('Invalid cron field ' + fieldName + ': non-numeric value "' + body + '"');
      }
      rangeStart = parseInt(body, 10);
      rangeEnd = rangeStart;
    }
    if (rangeStart < min || rangeEnd > max) {
      throw new Error('Invalid cron field ' + fieldName + ': out of bounds ' + rangeStart + '-' + rangeEnd);
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) {
      allowed.add(v);
    }
  }
  if (allowed.size === 0) {
    throw new Error('Invalid cron field ' + fieldName + ': no matches');
  }
  return allowed;
}

function parseCron(expr) {
  if (typeof expr !== 'string') {
    throw new Error('cronExpr must be a string');
  }
  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    throw new Error('cronExpr is empty');
  }
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('cronExpr must have 5 space-separated fields, got ' + fields.length);
  }
  return {
    minute: parseField(fields[0], FIELD_BOUNDS.minute.min, FIELD_BOUNDS.minute.max, 'minute'),
    hour: parseField(fields[1], FIELD_BOUNDS.hour.min, FIELD_BOUNDS.hour.max, 'hour'),
    dom: parseField(fields[2], FIELD_BOUNDS.dom.min, FIELD_BOUNDS.dom.max, 'dom'),
    month: parseField(fields[3], FIELD_BOUNDS.month.min, FIELD_BOUNDS.month.max, 'month'),
    dow: parseField(fields[4], FIELD_BOUNDS.dow.min, FIELD_BOUNDS.dow.max, 'dow'),
    raw: trimmed,
    domSpecified: fields[2] !== '*',
    dowSpecified: fields[4] !== '*',
  };
}

function validateCron(expr) {
  parseCron(expr);
  return true;
}

// Extract minute/hour/dom/month/dow in the requested timezone. Uses
// Intl.DateTimeFormat so non-UTC zones (DST included) resolve via the
// runtime's tz database. For 'UTC' we short-circuit through the UTC
// getters so the hot path is a handful of integer reads.
function wallFields(date, timezone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('wallFields: invalid Date');
  }
  const tz = typeof timezone === 'string' && timezone.length > 0 ? timezone : DEFAULT_TIMEZONE;
  if (tz === 'UTC') {
    const dow = date.getUTCDay();
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      dom: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      dow,
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const pick = (t) => {
    const p = parts.find((x) => x.type === t);
    return p ? p.value : '';
  };
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: parseInt(pick('minute'), 10) || 0,
    hour: parseInt(pick('hour'), 10) || 0,
    dom: parseInt(pick('day'), 10) || 1,
    month: parseInt(pick('month'), 10) || 1,
    dow: weekdayMap[pick('weekday')] !== undefined ? weekdayMap[pick('weekday')] : 0,
  };
}

function cronMatches(parsed, fields) {
  if (!parsed.minute.has(fields.minute)) return false;
  if (!parsed.hour.has(fields.hour)) return false;
  if (!parsed.month.has(fields.month)) return false;
  // Standard cron OR semantics: when both dom and dow are restricted
  // (neither is `*`), a match on either one is enough. When exactly one
  // is `*`, only the other field constrains. When both are `*`, the
  // per-field match (both Sets already contain every value) is trivially
  // true.
  const domHit = parsed.dom.has(fields.dom);
  const dowHit = parsed.dow.has(fields.dow);
  if (parsed.domSpecified && parsed.dowSpecified) {
    if (!domHit && !dowHit) return false;
  } else {
    if (!domHit) return false;
    if (!dowHit) return false;
  }
  return true;
}

function computeNextRun(cronExpr, timezone, now) {
  const parsed = parseCron(cronExpr);
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  // Walk minute by minute. Start at the first full minute strictly after
  // `now` so a schedule matching the current minute fires on the next
  // cycle, not again immediately.
  let cursor = new Date(Math.floor(base.getTime() / 60000) * 60000 + 60000);
  for (let i = 0; i < WALK_CAP_MINUTES; i += 1) {
    const fields = wallFields(cursor, timezone);
    if (cronMatches(parsed, fields)) {
      return new Date(cursor.getTime());
    }
    cursor = new Date(cursor.getTime() + 60000);
  }
  throw new Error('computeNextRun: no match within one year for expr "' + cronExpr + '"');
}

function normalizeSchedule(s) {
  const src = s && typeof s === 'object' ? s : {};
  const tz = typeof src.timezone === 'string' && src.timezone.length > 0 ? src.timezone : DEFAULT_TIMEZONE;
  return {
    id: typeof src.id === 'string' ? src.id : '',
    name: typeof src.name === 'string' && src.name.length > 0 ? src.name : (typeof src.id === 'string' ? src.id : ''),
    cronExpr: typeof src.cronExpr === 'string' ? src.cronExpr : '',
    taskTemplate: typeof src.taskTemplate === 'string' ? src.taskTemplate : '',
    projectId: typeof src.projectId === 'string' && src.projectId.length > 0 ? src.projectId : null,
    assignee: typeof src.assignee === 'string' && src.assignee.length > 0 ? src.assignee : null,
    enabled: src.enabled === false ? false : true,
    timezone: tz,
    nextRun: typeof src.nextRun === 'string' && src.nextRun.length > 0 ? src.nextRun : null,
    lastRun: typeof src.lastRun === 'string' && src.lastRun.length > 0 ? src.lastRun : null,
    createdAt: typeof src.createdAt === 'string' && src.createdAt.length > 0 ? src.createdAt : null,
    updatedAt: typeof src.updatedAt === 'string' && src.updatedAt.length > 0 ? src.updatedAt : null,
    history: Array.isArray(src.history) ? src.history.slice(-HISTORY_LIMIT) : [],
  };
}

function freshState() {
  return { schedules: {} };
}

function ensureShape(state) {
  const s = state && typeof state === 'object' ? state : {};
  const out = freshState();
  if (s.schedules && typeof s.schedules === 'object') {
    for (const [id, raw] of Object.entries(s.schedules)) {
      if (!isId(id)) continue;
      const norm = normalizeSchedule(Object.assign({}, raw, { id }));
      if (!norm.cronExpr || !norm.taskTemplate) continue;
      try {
        parseCron(norm.cronExpr);
      } catch {
        continue;
      }
      out.schedules[id] = norm;
    }
  }
  return out;
}

class ScheduleManager {
  constructor(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.storePath = typeof o.storePath === 'string' && o.storePath.length > 0
      ? o.storePath
      : defaultSchedulesPath();
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    if (!fs.existsSync(this.storePath)) {
      this._state = freshState();
      return this._state;
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = raw && raw.length > 0 ? JSON.parse(raw) : {};
      this._state = ensureShape(parsed);
    } catch {
      this._state = freshState();
    }
    return this._state;
  }

  _persist() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this._state, null, 2) + '\n');
  }

  reload() {
    this._state = null;
    return this._load();
  }

  // ---- CRUD ----------------------------------------------------------

  createSchedule(input) {
    const o = input && typeof input === 'object' ? input : {};
    const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : genId();
    if (!isId(id)) throw new Error('Schedule id must match ' + ID_PATTERN);
    const state = this._load();
    if (state.schedules[id]) throw new Error('Schedule already exists: ' + id);
    const cronExpr = typeof o.cronExpr === 'string' ? o.cronExpr : '';
    if (cronExpr.length === 0) throw new Error('cronExpr is required');
    validateCron(cronExpr);
    const taskTemplate = typeof o.taskTemplate === 'string' ? o.taskTemplate : '';
    if (taskTemplate.length === 0) throw new Error('taskTemplate is required');
    const tz = typeof o.timezone === 'string' && o.timezone.length > 0 ? o.timezone : DEFAULT_TIMEZONE;
    // Validate the timezone against the runtime. UTC short-circuits so
    // only non-UTC zones pay the Intl lookup.
    if (tz !== DEFAULT_TIMEZONE) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
      } catch (e) {
        throw new Error('Invalid timezone: ' + tz);
      }
    }
    const now = new Date();
    const nowIso = now.toISOString();
    let nextRun;
    try {
      nextRun = computeNextRun(cronExpr, tz, now).toISOString();
    } catch (e) {
      throw new Error('cronExpr has no next run within a year: ' + cronExpr);
    }
    const schedule = normalizeSchedule({
      id,
      name: o.name,
      cronExpr,
      taskTemplate,
      projectId: o.projectId,
      assignee: o.assignee,
      timezone: tz,
      enabled: o.enabled !== false,
      nextRun,
      lastRun: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      history: [],
    });
    state.schedules[id] = schedule;
    this._persist();
    return schedule;
  }

  getSchedule(id) {
    const state = this._load();
    return state.schedules[id] || null;
  }

  listSchedules(filter) {
    const state = this._load();
    const f = filter && typeof filter === 'object' ? filter : {};
    let out = Object.values(state.schedules).slice();
    if (typeof f.enabled === 'boolean') {
      out = out.filter((s) => s.enabled === f.enabled);
    }
    if (typeof f.projectId === 'string' && f.projectId.length > 0) {
      out = out.filter((s) => s.projectId === f.projectId);
    }
    if (typeof f.assignee === 'string' && f.assignee.length > 0) {
      out = out.filter((s) => s.assignee === f.assignee);
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  updateSchedule(id, patch) {
    const state = this._load();
    const cur = state.schedules[id];
    if (!cur) throw new Error('Schedule not found: ' + id);
    const p = patch && typeof patch === 'object' ? patch : {};
    const next = Object.assign({}, cur);
    if (Object.prototype.hasOwnProperty.call(p, 'name') && typeof p.name === 'string' && p.name.length > 0) {
      next.name = p.name;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'cronExpr')) {
      if (typeof p.cronExpr !== 'string' || p.cronExpr.length === 0) {
        throw new Error('cronExpr patch must be a non-empty string');
      }
      validateCron(p.cronExpr);
      next.cronExpr = p.cronExpr;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'taskTemplate')) {
      if (typeof p.taskTemplate !== 'string' || p.taskTemplate.length === 0) {
        throw new Error('taskTemplate patch must be a non-empty string');
      }
      next.taskTemplate = p.taskTemplate;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'projectId')) {
      next.projectId = typeof p.projectId === 'string' && p.projectId.length > 0 ? p.projectId : null;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'assignee')) {
      next.assignee = typeof p.assignee === 'string' && p.assignee.length > 0 ? p.assignee : null;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'timezone') && typeof p.timezone === 'string' && p.timezone.length > 0) {
      if (p.timezone !== DEFAULT_TIMEZONE) {
        try { new Intl.DateTimeFormat('en-US', { timeZone: p.timezone }); }
        catch (e) { throw new Error('Invalid timezone: ' + p.timezone); }
      }
      next.timezone = p.timezone;
    }
    if (Object.prototype.hasOwnProperty.call(p, 'enabled')) {
      next.enabled = Boolean(p.enabled);
    }
    // Recompute nextRun whenever cronExpr or timezone changed so the
    // persisted schedule stays consistent with the expression after a
    // patch.
    if (p.cronExpr || p.timezone) {
      const computed = computeNextRun(next.cronExpr, next.timezone, new Date());
      next.nextRun = computed.toISOString();
    }
    next.updatedAt = new Date().toISOString();
    state.schedules[id] = normalizeSchedule(next);
    this._persist();
    return state.schedules[id];
  }

  deleteSchedule(id) {
    const state = this._load();
    if (!state.schedules[id]) return false;
    delete state.schedules[id];
    this._persist();
    return true;
  }

  enableSchedule(id) {
    return this.updateSchedule(id, { enabled: true });
  }

  disableSchedule(id) {
    return this.updateSchedule(id, { enabled: false });
  }

  // ---- Tick runner ---------------------------------------------------

  // runDueSchedules(now?) returns the ids of enabled schedules whose
  // nextRun has arrived. Each due schedule is marked as having run: we
  // bump lastRun, append to history (trimmed to HISTORY_LIMIT), and
  // recompute nextRun so the next tick does not refire the same slot.
  // Disabled schedules are skipped unconditionally - enable/disable is
  // the operator's pause switch.
  runDueSchedules(now) {
    const state = this._load();
    const when = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const dueIds = [];
    for (const [id, schedule] of Object.entries(state.schedules)) {
      if (!schedule.enabled) continue;
      if (!schedule.nextRun) continue;
      const nextRunMs = Date.parse(schedule.nextRun);
      if (Number.isNaN(nextRunMs)) continue;
      if (nextRunMs > when.getTime()) continue;
      dueIds.push(id);
      this._markRun(schedule, when, 'tick');
    }
    if (dueIds.length > 0) this._persist();
    return dueIds;
  }

  // forceRun(id) is the manual override used by `POST /schedules/:id/run`
  // and `c4 schedule run`. Bumps lastRun, appends a 'forced' history
  // entry, but deliberately does NOT reschedule nextRun so the regular
  // schedule still fires at its original cadence.
  forceRun(id) {
    const state = this._load();
    const schedule = state.schedules[id];
    if (!schedule) throw new Error('Schedule not found: ' + id);
    const now = new Date();
    schedule.lastRun = now.toISOString();
    schedule.history = Array.isArray(schedule.history) ? schedule.history : [];
    schedule.history.push({ time: schedule.lastRun, status: 'forced' });
    if (schedule.history.length > HISTORY_LIMIT) {
      schedule.history = schedule.history.slice(-HISTORY_LIMIT);
    }
    schedule.updatedAt = schedule.lastRun;
    this._persist();
    return schedule;
  }

  // scheduleTick(now, dispatch?) is the hook the daemon's healthCheck
  // loop calls once per minute. Returns the array of due schedule
  // objects (not just ids) so the caller can pass the full payload
  // through to dispatch without a second load. The dispatch callback
  // receives `(schedule, {tickAt})`; exceptions from dispatch are
  // trapped so a bad handler never blocks the tick.
  scheduleTick(now, dispatch) {
    const when = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const state = this._load();
    const dueIds = this.runDueSchedules(when);
    const fresh = this._load();
    const due = dueIds
      .map((id) => fresh.schedules[id])
      .filter((s) => s && typeof s === 'object');
    if (typeof dispatch === 'function') {
      for (const schedule of due) {
        try {
          dispatch(schedule, { tickAt: when });
        } catch (e) {
          // Swallow to keep the tick moving. The history entry below
          // already records the scheduler's intent; operator can check
          // daemon logs for the dispatch failure.
        }
      }
    }
    return { tickAt: when.toISOString(), dueIds, schedules: due };
  }

  history(id) {
    const schedule = this.getSchedule(id);
    if (!schedule) throw new Error('Schedule not found: ' + id);
    return Array.isArray(schedule.history) ? schedule.history.slice() : [];
  }

  // ---- Gantt timeline ------------------------------------------------

  // gantt(weeks, startFrom?) -> { start, end, rows: [{schedule, runs:[ISO...]}] }
  // Walks each enabled schedule forward weeks*7*24*60 minutes and
  // records every matching minute. Because computeNextRun stops at the
  // first hit, we repeat it from `lastHit + 1m` so the timeline
  // enumerates every fire within the window.
  gantt(weeks, startFrom) {
    const w = Number.isFinite(weeks) && weeks > 0 ? Math.floor(weeks) : 4;
    const start = startFrom instanceof Date && !Number.isNaN(startFrom.getTime())
      ? startFrom
      : new Date();
    const endMs = start.getTime() + w * 7 * 24 * 60 * 60 * 1000;
    const state = this._load();
    const rows = [];
    for (const schedule of Object.values(state.schedules)) {
      if (!schedule.enabled) continue;
      const runs = [];
      let cursor = new Date(start.getTime() - 60000);
      while (runs.length < 1000) {
        let next;
        try {
          next = computeNextRun(schedule.cronExpr, schedule.timezone, cursor);
        } catch {
          break;
        }
        if (next.getTime() >= endMs) break;
        runs.push(next.toISOString());
        cursor = new Date(next.getTime());
      }
      rows.push({
        id: schedule.id,
        name: schedule.name,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        projectId: schedule.projectId,
        runs,
      });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    return {
      start: start.toISOString(),
      end: new Date(endMs).toISOString(),
      weeks: w,
      rows,
    };
  }

  // renderGanttText(weeks) -> ASCII timeline, one row per schedule.
  // Each column represents one day; `#` means at least one run lands on
  // that day, `.` means empty. Project id (when present) is shown in
  // brackets so grouping by project is obvious at a glance.
  renderGanttText(weeks, startFrom) {
    const snap = this.gantt(weeks, startFrom);
    const days = (snap.weeks) * 7;
    const startMs = Date.parse(snap.start);
    const header = [];
    header.push('Gantt (next ' + snap.weeks + ' weeks, ' + snap.rows.length + ' schedules)');
    header.push('Window: ' + snap.start + ' -> ' + snap.end);
    if (snap.rows.length === 0) {
      header.push('(no enabled schedules)');
      return header.join('\n') + '\n';
    }
    const labelWidth = Math.max(
      12,
      ...snap.rows.map((r) => (r.name || r.id || '').length),
    );
    const out = header.slice();
    // Column ruler - each column = one day, '|' every 7 columns.
    let ruler = ''.padEnd(labelWidth + 2, ' ');
    for (let d = 0; d < days; d += 1) {
      ruler += (d % 7 === 0) ? '|' : ' ';
    }
    out.push(ruler);
    for (const row of snap.rows) {
      const bucket = new Array(days).fill('.');
      for (const iso of row.runs) {
        const runMs = Date.parse(iso);
        if (Number.isNaN(runMs)) continue;
        const dayIdx = Math.floor((runMs - startMs) / 86400000);
        if (dayIdx >= 0 && dayIdx < days) bucket[dayIdx] = '#';
      }
      const label = (row.name || row.id || '').padEnd(labelWidth, ' ');
      const projectHint = row.projectId ? ' [' + row.projectId + ']' : '';
      out.push(label + ' ' + bucket.join('') + projectHint);
    }
    return out.join('\n') + '\n';
  }

  // ---- Internals -----------------------------------------------------

  _markRun(schedule, when, status) {
    schedule.lastRun = when.toISOString();
    schedule.history = Array.isArray(schedule.history) ? schedule.history : [];
    schedule.history.push({ time: schedule.lastRun, status: status || 'tick' });
    if (schedule.history.length > HISTORY_LIMIT) {
      schedule.history = schedule.history.slice(-HISTORY_LIMIT);
    }
    try {
      schedule.nextRun = computeNextRun(schedule.cronExpr, schedule.timezone, when).toISOString();
    } catch {
      schedule.nextRun = null;
    }
    schedule.updatedAt = schedule.lastRun;
  }
}

// Daemon-wide shared instance so `c4 schedule ...` mutations are
// visible on the next request without a restart. Tests construct their
// own ScheduleManager with a tmpdir path and never touch the shared one.
let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new ScheduleManager(opts);
  return _shared;
}
function resetShared() {
  _shared = null;
}

module.exports = {
  ScheduleManager,
  FIELD_BOUNDS,
  FIELD_ORDER,
  DEFAULT_TIMEZONE,
  HISTORY_LIMIT,
  ID_PATTERN,
  defaultSchedulesPath,
  isId,
  parseCron,
  parseField,
  validateCron,
  computeNextRun,
  wallFields,
  cronMatches,
  normalizeSchedule,
  freshState,
  ensureShape,
  getShared,
  resetShared,
};
