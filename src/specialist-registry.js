'use strict';

// Specialist Registry (Phase 1 of multi-specialist system).
//
// A read-mostly catalog of available specialists. Each specialist has
// a tier (pipeline stage), domain tags, a brain (adapter + model
// hint), a system prompt, dispatcher triggers, and a score record
// that retros update over time. See docs/multi-specialist-system.md
// for the full design — this module implements §3 (Registry).
//
// Phase 1 scope:
//   - Load seed JSON (src/specialists.seed.json) merged with optional
//     user overrides at config.specialists.path.
//   - Validate every record against a minimal schema so a malformed
//     entry fails on construction, not mid-meeting.
//   - Expose list / get / filter helpers for the dispatcher and the
//     HTTP / CLI surfaces.
//
// Phase 4 will extend this module with score updates and probation
// tracking (governance §3.3). The shape here keeps room for both
// without pre-baking either.

const fs = require('fs');
const path = require('path');

const VALID_TIERS = Object.freeze([
  'meeting', 'design', 'implement', 'review', 'audit', 'test', 'deploy', 'docs',
]);
const VALID_PROBATION_STATES = Object.freeze(['stable', 'probation']);

const SEED_PATH = path.join(__dirname, 'specialists.seed.json');

function isString(v) { return typeof v === 'string' && v.length > 0; }
function isStringArray(v) { return Array.isArray(v) && v.every((s) => isString(s)); }

function validateSpecialist(spec, ctx = '<unknown>') {
  if (!spec || typeof spec !== 'object') {
    throw new Error(`${ctx}: specialist must be an object`);
  }
  if (!isString(spec.id)) {
    throw new Error(`${ctx}: specialist.id must be a non-empty string`);
  }
  if (!/^[a-z][a-z0-9-]*$/.test(spec.id)) {
    throw new Error(`${ctx}: specialist.id "${spec.id}" must be lowercase-kebab`);
  }
  if (!isString(spec.displayName)) {
    throw new Error(`${spec.id}: displayName must be a non-empty string`);
  }
  if (!VALID_TIERS.includes(spec.tier)) {
    throw new Error(`${spec.id}: tier "${spec.tier}" not in ${VALID_TIERS.join('|')}`);
  }
  if (!isStringArray(spec.domain) || spec.domain.length === 0) {
    throw new Error(`${spec.id}: domain must be a non-empty string array`);
  }
  if (!spec.brain || !isString(spec.brain.adapter)) {
    throw new Error(`${spec.id}: brain.adapter is required`);
  }
  if (!isString(spec.systemPrompt)) {
    throw new Error(`${spec.id}: systemPrompt must be a non-empty string`);
  }
  if (!spec.triggers || typeof spec.triggers !== 'object') {
    throw new Error(`${spec.id}: triggers must be an object`);
  }
  if (!isStringArray(spec.triggers.keywords)) {
    throw new Error(`${spec.id}: triggers.keywords must be a string array`);
  }
  if (!isStringArray(spec.triggers.stages)) {
    throw new Error(`${spec.id}: triggers.stages must be a string array`);
  }
  for (const stage of spec.triggers.stages) {
    if (!VALID_TIERS.includes(stage)) {
      throw new Error(`${spec.id}: triggers.stages contains invalid stage "${stage}"`);
    }
  }
  if (spec.deliverables !== undefined && !isStringArray(spec.deliverables)) {
    throw new Error(`${spec.id}: deliverables must be a string array when set`);
  }
  if (spec.vetoPower !== undefined && typeof spec.vetoPower !== 'boolean') {
    throw new Error(`${spec.id}: vetoPower must be boolean when set`);
  }
  if (spec.probation !== undefined && !VALID_PROBATION_STATES.includes(spec.probation)) {
    throw new Error(`${spec.id}: probation must be one of ${VALID_PROBATION_STATES.join('|')}`);
  }
}

function normalizeSpecialist(raw) {
  // Defensive copy + default values. Score is initialized to an empty
  // record so phase 4 can write into it without a null check.
  return {
    id: raw.id,
    displayName: raw.displayName,
    tier: raw.tier,
    domain: raw.domain.slice(),
    brain: {
      adapter: raw.brain.adapter,
      model: raw.brain.model || null,
      effort: raw.brain.effort || null,
    },
    systemPrompt: raw.systemPrompt,
    triggers: {
      keywords: raw.triggers.keywords.slice(),
      stages: raw.triggers.stages.slice(),
    },
    deliverables: Array.isArray(raw.deliverables) ? raw.deliverables.slice() : [],
    vetoPower: !!raw.vetoPower,
    probation: raw.probation || 'stable',
    score: raw.score || { byDomain: {}, byStage: {}, samples: {}, lastUpdated: null },
  };
}

function loadSeed(seedPath = SEED_PATH) {
  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.specialists)) {
    throw new Error(`seed at ${seedPath} missing specialists array`);
  }
  const out = [];
  for (const entry of parsed.specialists) {
    validateSpecialist(entry, `seed[${entry && entry.id ? entry.id : '?'}]`);
    out.push(normalizeSpecialist(entry));
  }
  return { version: parsed.version || 0, specialists: out };
}

class SpecialistRegistry {
  constructor(opts = {}) {
    this._byId = new Map();
    this._version = 0;
    if (opts.specialists) {
      // Tests + governance call sites can build an in-memory registry
      // without touching disk.
      this._version = opts.version || 0;
      for (const s of opts.specialists) {
        validateSpecialist(s, `inline[${s && s.id ? s.id : '?'}]`);
        this._byId.set(s.id, normalizeSpecialist(s));
      }
    } else {
      const loaded = loadSeed(opts.seedPath || SEED_PATH);
      this._version = loaded.version;
      for (const s of loaded.specialists) this._byId.set(s.id, s);
    }
  }

  get version() { return this._version; }
  get size() { return this._byId.size; }

  list() {
    return Array.from(this._byId.values()).map((s) => ({ ...s }));
  }

  get(id) {
    const s = this._byId.get(id);
    return s ? { ...s } : null;
  }

  has(id) { return this._byId.has(id); }

  filter({ tier, domain, stage, vetoOnly } = {}) {
    const out = [];
    for (const s of this._byId.values()) {
      if (tier && s.tier !== tier) continue;
      if (domain && !s.domain.includes(domain)) continue;
      if (stage && !s.triggers.stages.includes(stage)) continue;
      if (vetoOnly && !s.vetoPower) continue;
      out.push({ ...s });
    }
    return out;
  }

  // §3.3 governance — phase 1 only allows in-memory mutation, the
  // disk-write path lands in phase 4 with the audit log. Tests use
  // this; runtime governance triggers will call through it later.
  add(spec) {
    validateSpecialist(spec, `add[${spec && spec.id}]`);
    if (this._byId.has(spec.id)) {
      throw new Error(`specialist "${spec.id}" already exists`);
    }
    this._byId.set(spec.id, normalizeSpecialist(spec));
    return this.get(spec.id);
  }

  remove(id) {
    return this._byId.delete(id);
  }
}

let _shared = null;
function getShared(opts) {
  if (!_shared) _shared = new SpecialistRegistry(opts);
  return _shared;
}
function resetShared() { _shared = null; }

module.exports = {
  SpecialistRegistry,
  loadSeed,
  validateSpecialist,
  normalizeSpecialist,
  getShared,
  resetShared,
  VALID_TIERS,
  VALID_PROBATION_STATES,
  SEED_PATH,
};
