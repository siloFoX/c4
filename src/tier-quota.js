'use strict';

// (8.3) Tier-based daily token quotas + complexity-based model selection.
// Three tiers (manager / mid / worker) each declare a daily token budget
// and an allow-list of Claude models. selectModel() picks a model based
// on a small keyword + length heuristic, then constrains the choice to
// the tier's allow-list. State persists to ~/.c4/tier-quota-YYYY-MM-DD.json
// so daily roll-over is automatic and survives daemon restarts.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_TIERS = {
  manager: { dailyTokens: 500000, models: ['opus'] },
  mid:     { dailyTokens: 200000, models: ['opus', 'sonnet'] },
  worker:  { dailyTokens: 100000, models: ['sonnet', 'haiku'] },
};

const VALID_TIERS = ['manager', 'mid', 'worker'];
const MODEL_PRIORITY = ['opus', 'sonnet', 'haiku'];

const KEYWORDS_OPUS = [
  'design', 'plan', 'architect', 'architecture', 'refactor',
  'investigate', 'analyze', 'audit', 'spec', 'rfc'
];
const KEYWORDS_SONNET = [
  'implement', 'fix', 'add', 'update', 'write', 'create',
  'build', 'wire', 'integrate', 'patch'
];
const KEYWORDS_HAIKU = [
  'typo', 'rename', 'format', 'lint', 'comment', 'docstring',
  'whitespace', 'simple edit', 'spelling'
];

function todayUtc(nowMs) {
  const d = nowMs ? new Date(nowMs) : new Date();
  return d.toISOString().slice(0, 10);
}

function quotaFilePath(baseDir, date) {
  return path.join(baseDir, `tier-quota-${date}.json`);
}

function _ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

function _readState(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && typeof data === 'object') return data;
  } catch {}
  return {};
}

function _writeState(file, state) {
  _ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function mergeTiers(override) {
  const base = JSON.parse(JSON.stringify(DEFAULT_TIERS));
  if (!override || typeof override !== 'object') return base;
  for (const key of Object.keys(override)) {
    const v = override[key];
    if (!v || typeof v !== 'object') continue;
    const prev = base[key] || { dailyTokens: 0, models: [] };
    base[key] = {
      dailyTokens: Number.isFinite(v.dailyTokens) && v.dailyTokens >= 0
        ? v.dailyTokens
        : prev.dailyTokens,
      models: Array.isArray(v.models) && v.models.length > 0
        ? v.models.slice()
        : prev.models.slice(),
    };
  }
  return base;
}

function _scoreText(text) {
  const raw = String(text == null ? '' : text);
  const t = raw.toLowerCase();
  if (KEYWORDS_OPUS.some(k => t.includes(k))) return 'opus';
  if (KEYWORDS_HAIKU.some(k => t.includes(k))) return 'haiku';
  if (KEYWORDS_SONNET.some(k => t.includes(k))) return 'sonnet';
  const len = raw.length;
  if (len > 500) return 'opus';
  if (len > 0 && len < 80) return 'haiku';
  return 'sonnet';
}

function selectModel(taskDescription, tier, opts) {
  const tiers = (opts && opts.tiers) || DEFAULT_TIERS;
  const def = tiers[tier];
  if (!def || !Array.isArray(def.models) || def.models.length === 0) return null;
  const allowed = def.models;
  const wanted = _scoreText(taskDescription);
  if (allowed.includes(wanted)) return wanted;
  if (wanted === 'opus') {
    for (const m of MODEL_PRIORITY) if (allowed.includes(m)) return m;
  }
  if (wanted === 'haiku') {
    for (const m of MODEL_PRIORITY.slice().reverse()) if (allowed.includes(m)) return m;
  }
  return allowed[0];
}

class TierQuota {
  constructor(opts = {}) {
    this.baseDir = opts.baseDir || path.join(os.homedir(), '.c4');
    this.tiers = mergeTiers(opts.tiers);
    this.now = typeof opts.now === 'function' ? opts.now : (() => Date.now());
    this._date = null;
    this._state = null;
    this._load();
  }

  _today() { return todayUtc(this.now()); }

  _load() {
    const date = this._today();
    this._date = date;
    const raw = _readState(quotaFilePath(this.baseDir, date));
    this._state = {
      date,
      tiers: (raw.tiers && typeof raw.tiers === 'object') ? { ...raw.tiers } : {},
    };
  }

  _save() {
    _writeState(quotaFilePath(this.baseDir, this._date), this._state);
  }

  _rolloverIfNeeded() {
    if (this._today() !== this._date) this._load();
  }

  setTiers(override) {
    this.tiers = mergeTiers(override);
  }

  knownTier(tier) {
    return Object.prototype.hasOwnProperty.call(this.tiers, tier);
  }

  chargeTier(tier, tokens) {
    if (!this.knownTier(tier)) throw new Error(`Unknown tier: ${tier}`);
    const n = Number(tokens);
    if (!Number.isFinite(n) || n < 0) throw new Error('tokens must be a non-negative number');
    this._rolloverIfNeeded();
    const used = this._state.tiers[tier] || 0;
    const limit = this.tiers[tier].dailyTokens;
    if (limit > 0 && used + n > limit) {
      const err = new Error(`Quota exceeded for tier '${tier}': ${used + n} > ${limit}`);
      err.code = 'QUOTA_EXCEEDED';
      err.tier = tier;
      err.used = used;
      err.requested = n;
      err.limit = limit;
      throw err;
    }
    this._state.tiers[tier] = used + n;
    this._save();
    return this._state.tiers[tier];
  }

  getUsage(tier) {
    if (!this.knownTier(tier)) throw new Error(`Unknown tier: ${tier}`);
    this._rolloverIfNeeded();
    return this._state.tiers[tier] || 0;
  }

  getRemaining(tier) {
    if (!this.knownTier(tier)) throw new Error(`Unknown tier: ${tier}`);
    this._rolloverIfNeeded();
    const used = this._state.tiers[tier] || 0;
    const limit = this.tiers[tier].dailyTokens;
    if (limit <= 0) return Infinity;
    return Math.max(0, limit - used);
  }

  resetDaily(tier) {
    this._rolloverIfNeeded();
    if (tier) {
      if (!this.knownTier(tier)) throw new Error(`Unknown tier: ${tier}`);
      this._state.tiers[tier] = 0;
    } else {
      this._state.tiers = {};
    }
    this._save();
  }

  snapshot() {
    this._rolloverIfNeeded();
    const out = { date: this._date, tiers: {} };
    for (const t of Object.keys(this.tiers)) {
      const limit = this.tiers[t].dailyTokens;
      const used = this._state.tiers[t] || 0;
      out.tiers[t] = {
        dailyTokens: limit,
        models: this.tiers[t].models.slice(),
        used,
        remaining: limit > 0 ? Math.max(0, limit - used) : -1,
      };
    }
    return out;
  }

  selectModel(taskDescription, tier) {
    if (!this.knownTier(tier)) throw new Error(`Unknown tier: ${tier}`);
    return selectModel(taskDescription, tier, { tiers: this.tiers });
  }
}

let _shared = null;
function getShared(opts) {
  if (!_shared || (opts && opts.force)) {
    _shared = new TierQuota(opts || {});
  } else if (opts && opts.tiers) {
    _shared.setTiers(opts.tiers);
  }
  return _shared;
}
function resetShared() { _shared = null; }

module.exports = {
  DEFAULT_TIERS,
  VALID_TIERS,
  MODEL_PRIORITY,
  TierQuota,
  selectModel,
  mergeTiers,
  quotaFilePath,
  todayUtc,
  getShared,
  resetShared,
};
