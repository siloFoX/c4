'use strict';

// (10.5) Cost report + billing.
//
// Pure, in-memory aggregator for token usage and USD cost across
// workers, projects, teams, machines, and users. The module does not
// reach into node-pty or the audit log directly; instead it accepts a
// flat array of usage records (see RECORD_SHAPE below) through the
// constructor or report() options. That keeps the unit tests fast and
// independent of any live daemon state, and lets the CLI/daemon layer
// choose where the records come from (history.jsonl enriched with
// per-session token counts, a dedicated cost-log.jsonl, or an audit
// event stream).
//
// RECORD_SHAPE = {
//   timestamp: ISO8601 string,
//   project:   string (required for groupBy='project'),
//   team:      string (required for groupBy='team'),
//   machine:   string (required for groupBy='machine'),
//   user:      string (required for groupBy='user'),
//   worker:    string (informational),
//   model:     string (key into cost table, e.g. 'claude-opus'),
//   inputTokens:  number,
//   outputTokens: number,
// }
//
// COST FORMULA
//   rate is USD per 1K tokens. cost = tokens / 1000 * rate. The total
//   for a record is inputTokens/1000 * input + outputTokens/1000 * output.
//   Unknown models fall back to config.costs.models.default (if set)
//   and otherwise to { input: 0, output: 0 } so reporting never throws
//   on a freshly rolled-out model name.

const fs = require('fs');
const path = require('path');

const DEFAULT_COSTS = Object.freeze({
  'claude-opus':   { input: 15,  output: 75 },
  'claude-sonnet': { input: 3,   output: 15 },
  'claude-haiku':  { input: 0.8, output: 4 },
  'local':         { input: 0,   output: 0 },
  'default':       { input: 3,   output: 15 },
});

const VALID_GROUP_BY = ['project', 'team', 'machine', 'user', 'worker'];
const VALID_PERIODS = ['day', 'week', 'month'];

function isRecord(r) {
  return r && typeof r === 'object' && typeof r.timestamp === 'string';
}

function withinRange(ts, from, to) {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  if (from) {
    const f = Date.parse(from);
    if (Number.isFinite(f) && t < f) return false;
  }
  if (to) {
    const u = Date.parse(to);
    if (Number.isFinite(u) && t > u) return false;
  }
  return true;
}

// Month bounds are computed in UTC so a caller passing (2026, 4) always
// gets April 1 00:00:00 .. April 30 23:59:59.999, regardless of the
// local timezone the daemon runs in.
function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('monthlyReport requires year and month (1-12)');
  }
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString();
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1).toISOString();
  return { from, to };
}

function periodRange(period, now) {
  const reference = now instanceof Date ? now : new Date();
  if (period === 'day') {
    const y = reference.getUTCFullYear();
    const m = reference.getUTCMonth();
    const d = reference.getUTCDate();
    const from = new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();
    const to = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0) - 1).toISOString();
    return { from, to };
  }
  if (period === 'week') {
    // Week starts Monday UTC so reporting lines up with the work week
    // rather than Sunday, which is the JS getUTCDay() default.
    const day = reference.getUTCDay(); // 0 Sun .. 6 Sat
    const offsetToMon = (day + 6) % 7;
    const y = reference.getUTCFullYear();
    const m = reference.getUTCMonth();
    const d = reference.getUTCDate() - offsetToMon;
    const from = new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();
    const to = new Date(Date.UTC(y, m, d + 7, 0, 0, 0, 0) - 1).toISOString();
    return { from, to };
  }
  if (period === 'month') {
    return monthRange(reference.getUTCFullYear(), reference.getUTCMonth() + 1);
  }
  throw new Error(`Unknown period: ${period}. Expected one of ${VALID_PERIODS.join(', ')}`);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

class CostReporter {
  constructor(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    this.costs = o.costs && typeof o.costs === 'object' ? { ...DEFAULT_COSTS, ...o.costs } : { ...DEFAULT_COSTS };
    this.records = Array.isArray(o.records) ? o.records.slice() : [];
    this.loadRecords = typeof o.loadRecords === 'function' ? o.loadRecords : null;
    this.warnAt = Number.isFinite(o.warnAt) ? o.warnAt : 0.8;
    this.defaultGroupBy = VALID_GROUP_BY.includes(o.defaultGroupBy) ? o.defaultGroupBy : 'project';
  }

  // Look up a model rate. Unknown models fall back to 'default' and
  // finally to the zero-cost entry. Returning an object (rather than
  // throwing) keeps reports resilient when new models show up mid-run.
  getRate(model) {
    const key = typeof model === 'string' && model.length > 0 ? model : 'default';
    return this.costs[key] || this.costs.default || { input: 0, output: 0 };
  }

  costForRecord(record) {
    if (!isRecord(record)) return 0;
    const rate = this.getRate(record.model);
    const inTok = Number(record.inputTokens) || 0;
    const outTok = Number(record.outputTokens) || 0;
    return (inTok / 1000) * (rate.input || 0) + (outTok / 1000) * (rate.output || 0);
  }

  _collect(from, to) {
    const staticRecs = this.records || [];
    const dynamic = this.loadRecords ? this.loadRecords({ from, to }) : [];
    const out = [];
    for (const r of staticRecs) {
      if (!isRecord(r)) continue;
      if (from || to) {
        if (!withinRange(r.timestamp, from, to)) continue;
      }
      out.push(r);
    }
    if (Array.isArray(dynamic)) {
      for (const r of dynamic) {
        if (!isRecord(r)) continue;
        if (from || to) {
          if (!withinRange(r.timestamp, from, to)) continue;
        }
        out.push(r);
      }
    }
    return out;
  }

  report(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const from = typeof opts.from === 'string' ? opts.from : null;
    const to = typeof opts.to === 'string' ? opts.to : null;
    const groupBy = VALID_GROUP_BY.includes(opts.groupBy) ? opts.groupBy : this.defaultGroupBy;
    const includeModels = opts.includeModels === true;
    const unknownLabel = typeof opts.unknownLabel === 'string' && opts.unknownLabel.length > 0
      ? opts.unknownLabel
      : 'unknown';

    const records = this._collect(from, to);

    const groups = new Map();
    let totalIn = 0;
    let totalOut = 0;
    let totalCost = 0;

    for (const r of records) {
      const inTok = Number(r.inputTokens) || 0;
      const outTok = Number(r.outputTokens) || 0;
      const tokens = inTok + outTok;
      const cost = this.costForRecord(r);
      totalIn += inTok;
      totalOut += outTok;
      totalCost += cost;

      const rawKey = r[groupBy];
      const key = typeof rawKey === 'string' && rawKey.length > 0 ? rawKey : unknownLabel;
      let slot = groups.get(key);
      if (!slot) {
        slot = { name: key, tokens: 0, inputTokens: 0, outputTokens: 0, costUSD: 0, records: 0 };
        if (includeModels) slot.perModel = {};
        groups.set(key, slot);
      }
      slot.tokens += tokens;
      slot.inputTokens += inTok;
      slot.outputTokens += outTok;
      slot.costUSD += cost;
      slot.records += 1;

      if (includeModels) {
        const model = typeof r.model === 'string' && r.model.length > 0 ? r.model : 'unknown';
        const modelSlot = slot.perModel[model] || { tokens: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
        modelSlot.tokens += tokens;
        modelSlot.inputTokens += inTok;
        modelSlot.outputTokens += outTok;
        modelSlot.costUSD += cost;
        slot.perModel[model] = modelSlot;
      }
    }

    const byGroup = Array.from(groups.values())
      .map((g) => {
        const rounded = {
          name: g.name,
          tokens: g.tokens,
          inputTokens: g.inputTokens,
          outputTokens: g.outputTokens,
          costUSD: round4(g.costUSD),
          records: g.records,
        };
        if (includeModels && g.perModel) {
          rounded.perModel = {};
          for (const [model, m] of Object.entries(g.perModel)) {
            rounded.perModel[model] = {
              tokens: m.tokens,
              inputTokens: m.inputTokens,
              outputTokens: m.outputTokens,
              costUSD: round4(m.costUSD),
            };
          }
        }
        return rounded;
      })
      .sort((a, b) => b.costUSD - a.costUSD || a.name.localeCompare(b.name));

    return {
      total: {
        tokens: totalIn + totalOut,
        inputTokens: totalIn,
        outputTokens: totalOut,
        costUSD: round4(totalCost),
        records: records.length,
      },
      byGroup,
      groupBy,
      period: { from, to },
    };
  }

  monthlyReport(year, month, options = {}) {
    const { from, to } = monthRange(year, month);
    const base = this.report({
      from,
      to,
      groupBy: options.groupBy || 'project',
      includeModels: options.includeModels !== false,
      unknownLabel: options.unknownLabel,
    });
    base.month = { year: Number(year), month: Number(month) };
    return base;
  }

  budgetCheck(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const limit = Number(opts.limit);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error('budgetCheck requires a positive limit');
    }
    let period = 'month';
    if (opts.period !== undefined && opts.period !== null) {
      if (!VALID_PERIODS.includes(opts.period)) {
        throw new Error(`Unknown period: ${opts.period}. Expected one of ${VALID_PERIODS.join(', ')}`);
      }
      period = opts.period;
    }
    const warnAt = Number.isFinite(opts.warnAt) ? opts.warnAt : this.warnAt;
    const group = typeof opts.group === 'string' && opts.group.length > 0 ? opts.group : null;
    const groupBy = VALID_GROUP_BY.includes(opts.groupBy) ? opts.groupBy : this.defaultGroupBy;

    const { from, to } = periodRange(period, opts.now);
    const report = this.report({ from, to, groupBy });
    let used = report.total.costUSD;
    if (group) {
      const g = report.byGroup.find((x) => x.name === group);
      used = g ? g.costUSD : 0;
    }
    const percent = limit > 0 ? used / limit : 0;
    return {
      used: round4(used),
      limit,
      percent: round4(percent),
      warnAt,
      warning: percent >= warnAt && percent < 1.0,
      exceeded: percent >= 1.0,
      period,
      from,
      to,
      group,
      groupBy,
    };
  }
}

// History loader: reads the daemon's history.jsonl and emits one cost
// record per row. Used by the CLI/daemon wiring so operators get a
// report over the same events they already see in `c4 history`.
// Returns an empty array if the file does not exist or is malformed —
// reporting must never crash because the file has not been created yet.
function loadHistoryRecords(historyPath) {
  if (!historyPath || !fs.existsSync(historyPath)) return [];
  let content;
  try { content = fs.readFileSync(historyPath, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row;
    try { row = JSON.parse(trimmed); } catch { continue; }
    if (!row || typeof row !== 'object') continue;
    out.push({
      timestamp: row.completedAt || row.startedAt || new Date().toISOString(),
      project: row.project || row.branch || 'main',
      team: row.team || 'default',
      machine: row.machine || row.target || 'local',
      user: row.user || row.actor || 'system',
      worker: row.name || null,
      model: row.model || 'default',
      inputTokens: Number(row.inputTokens || row.input) || 0,
      outputTokens: Number(row.outputTokens || row.output) || 0,
    });
  }
  return out;
}

function defaultHistoryPath() {
  return path.join(__dirname, '..', 'history.jsonl');
}

module.exports = {
  CostReporter,
  DEFAULT_COSTS,
  VALID_GROUP_BY,
  VALID_PERIODS,
  monthRange,
  periodRange,
  loadHistoryRecords,
  defaultHistoryPath,
};
