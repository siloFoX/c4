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
const audit = require('./specialist-audit');

const VALID_TIERS = Object.freeze([
  'meeting', 'design', 'implement', 'review', 'audit', 'test', 'deploy', 'docs',
]);
const VALID_PROBATION_STATES = Object.freeze(['stable', 'probation']);

const SEED_PATH = path.join(__dirname, 'specialists.seed.json');
// Default persistence location — overlays the seed at construction
// time so retro score deltas survive daemon restart. Operators
// running on a different home dir or in tests can override per call.
const DEFAULT_PERSIST_PATH = path.join(process.env.HOME || '/tmp', '.c4', 'specialists.json');

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

// Load the persistence overlay (~/.c4/specialists.json by default).
// Returns null if the file is missing — that's the normal case on
// first boot, so callers should treat it as "no overlay".
function loadOverlay(persistPath) {
  if (!persistPath) return null;
  let raw;
  try { raw = fs.readFileSync(persistPath, 'utf8'); }
  catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  try { return JSON.parse(raw); }
  catch (err) {
    // Corrupt overlay should not nuke the daemon — fall back to seed
    // and surface the error via stderr for the operator to clean up.
    process.stderr.write(`[specialist-registry] overlay parse failed at ${persistPath}: ${err.message}\n`);
    return null;
  }
}

class SpecialistRegistry {
  constructor(opts = {}) {
    this._byId = new Map();
    this._version = 0;
    // Inline construction (opts.specialists provided) defaults to
    // NO persistence — tests should not write to disk by accident.
    // Seed-based construction defaults to ~/.c4/specialists.json
    // unless the caller passes persistPath: null explicitly.
    this._persistPath = opts.specialists
      ? (opts.persistPath || null)
      : (opts.persistPath === undefined ? DEFAULT_PERSIST_PATH : (opts.persistPath || null));
    this._autoSave = opts.autoSave !== false;
    // Phase 1.4 audit log. Default-derive from persistPath so:
    //   - Real daemon (persistPath = ~/.c4/specialists.json) →
    //     auditPath = ~/.c4/specialist-audit.jsonl (sibling file).
    //   - Tests passing custom persistPath like /tmp/.../specialists.json →
    //     auditPath = /tmp/.../specialist-audit.jsonl (still siblings,
    //     stays inside the test fixture dir, no real-log pollution).
    //   - Inline construction (specialists array) or persistPath: null →
    //     auditPath = null (audit disabled).
    // Operators who want a separate audit location pass auditPath
    // explicitly.
    if (opts.auditPath !== undefined) {
      this._auditPath = opts.auditPath || null;
    } else if (this._persistPath === DEFAULT_PERSIST_PATH) {
      this._auditPath = audit.DEFAULT_AUDIT_PATH;
    } else if (this._persistPath) {
      // Sibling-file convention: <dir>/specialist-audit.jsonl
      this._auditPath = path.join(path.dirname(this._persistPath), 'specialist-audit.jsonl');
    } else {
      this._auditPath = null;
    }
    this._auditLogEnabled = !!this._auditPath;

    if (opts.specialists) {
      // Tests + governance call sites can build an in-memory registry
      // without touching disk.
      this._version = opts.version || 0;
      for (const s of opts.specialists) {
        validateSpecialist(s, `inline[${s && s.id ? s.id : '?'}]`);
        this._byId.set(s.id, normalizeSpecialist(s));
      }
      // Inline construction skips disk overlay — tests can opt in
      // by passing persistPath explicitly.
      if (this._persistPath && opts.applyOverlayOnInline) {
        this._applyOverlay(loadOverlay(this._persistPath));
      }
      return;
    }

    const loaded = loadSeed(opts.seedPath || SEED_PATH);
    this._version = loaded.version;
    for (const s of loaded.specialists) this._byId.set(s.id, s);
    // Apply persisted overlay on top of the seed so retro deltas
    // (score updates, governance mutations) survive restart.
    this._applyOverlay(loadOverlay(this._persistPath));
  }

  _applyOverlay(overlay) {
    if (!overlay || typeof overlay !== 'object') return;
    if (Array.isArray(overlay.specialists)) {
      for (const ov of overlay.specialists) {
        if (!ov || !ov.id) continue;
        const seed = this._byId.get(ov.id);
        if (seed) {
          // Merge: overlay wins on score/probation/vetoPower; seed
          // keeps prompt/triggers/domain/brain unless overlay also
          // declares them (governance path). validateSpecialist on
          // the merged record so we don't deserialize garbage.
          const merged = { ...seed, ...ov };
          // Score is an object — overlay's score replaces seed's
          // empty default, but we make sure shape is intact.
          if (ov.score) merged.score = ov.score;
          try {
            validateSpecialist(merged, `overlay[${ov.id}]`);
            this._byId.set(ov.id, normalizeSpecialist(merged));
          } catch (err) {
            process.stderr.write(`[specialist-registry] overlay rejected for ${ov.id}: ${err.message}\n`);
          }
        } else if (ov.systemPrompt && ov.tier && ov.brain) {
          // Overlay introduces a new specialist (governance add).
          try {
            validateSpecialist(ov, `overlay-add[${ov.id}]`);
            this._byId.set(ov.id, normalizeSpecialist(ov));
          } catch (err) {
            process.stderr.write(`[specialist-registry] overlay add rejected for ${ov.id}: ${err.message}\n`);
          }
        }
      }
    }
  }

  // Save the current registry state to the persistence overlay. The
  // seed is the source of truth for the immutable fields (prompt,
  // brain, tier, domain, triggers); we only persist score +
  // probation + vetoPower + any overlay-introduced specialist.
  save() {
    if (!this._persistPath) return false;
    const seed = (() => {
      try { return loadSeed(SEED_PATH); }
      catch { return { specialists: [] }; }
    })();
    const seedById = new Map();
    for (const s of seed.specialists) seedById.set(s.id, s);

    const overlay = { version: 1, savedAt: new Date().toISOString(), specialists: [] };
    for (const spec of this._byId.values()) {
      const seedSpec = seedById.get(spec.id);
      if (seedSpec) {
        // Only persist if score was actually populated (any byDomain
        // / byStage / samples key) OR if probation / vetoPower
        // drifted from seed.
        const score = spec.score || {};
        const scorePopulated =
          (score.byDomain && Object.keys(score.byDomain).length > 0) ||
          (score.byStage  && Object.keys(score.byStage).length > 0) ||
          (score.samples  && Object.keys(score.samples).length > 0);
        const probationDrift = spec.probation && spec.probation !== 'stable';
        const vetoDrift = spec.vetoPower !== !!seedSpec.vetoPower;
        if (!scorePopulated && !probationDrift && !vetoDrift) continue;

        const entry = { id: spec.id };
        if (scorePopulated) entry.score = spec.score;
        if (probationDrift) entry.probation = spec.probation;
        if (vetoDrift) entry.vetoPower = spec.vetoPower;
        overlay.specialists.push(entry);
      } else {
        // Specialist not in seed = governance-added; persist verbatim.
        overlay.specialists.push(spec);
      }
    }

    fs.mkdirSync(path.dirname(this._persistPath), { recursive: true });
    fs.writeFileSync(this._persistPath, JSON.stringify(overlay, null, 2) + '\n');
    return true;
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

  // §3.3 governance — auto-saves when configured with a persistPath
  // and writes an audit entry per design doc §3.3.
  add(spec, opts = {}) {
    validateSpecialist(spec, `add[${spec && spec.id}]`);
    if (this._byId.has(spec.id)) {
      throw new Error(`specialist "${spec.id}" already exists`);
    }
    this._byId.set(spec.id, normalizeSpecialist(spec));
    this._maybeAutoSave();
    if (this._auditLogEnabled !== false) {
      audit.appendAuditEntry({
        action: audit.ACTIONS.ADD,
        id: spec.id,
        actor: opts.actor || null,
        meetingId: opts.meetingId || null,
        reason: opts.reason || null,
      }, { auditPath: this._auditPath });
    }
    return this.get(spec.id);
  }

  // Phase 5.2: governance-driven systemPrompt update.
  // Currently restricted to systemPrompt because that is the only
  // mutable field §5 (auto-iterate) calls for; widening this surface
  // requires fresh design (every other field affects dispatch /
  // routing / persistence semantics).
  // patch.systemPrompt: required, validated as non-empty string with
  // a `[Role:` prefix preserved (the meeting orchestrator greps for
  // it); throws on missing role tag so callers can never silently
  // strip it.
  updatePrompt(id, patch, opts = {}) {
    const spec = this._byId.get(id);
    if (!spec) throw new Error(`updatePrompt: specialist "${id}" not found`);
    if (!patch || typeof patch.systemPrompt !== 'string' || patch.systemPrompt.trim() === '') {
      throw new Error(`updatePrompt: patch.systemPrompt must be a non-empty string`);
    }
    const next = patch.systemPrompt.trim();
    if (!/\[Role:/.test(next)) {
      throw new Error(`updatePrompt: revised systemPrompt must keep the "[Role: ...]" prefix`);
    }
    if (next === spec.systemPrompt) {
      return { spec, changed: false };
    }
    const before = { systemPrompt: spec.systemPrompt };
    spec.systemPrompt = next;
    this._maybeAutoSave();
    if (this._auditLogEnabled !== false) {
      audit.appendAuditEntry({
        action: audit.ACTIONS.PROMPT_REVISED,
        id,
        actor: opts.actor || null,
        meetingId: opts.meetingId || null,
        reason: opts.reason || null,
        before,
      }, { auditPath: this._auditPath });
    }
    return { spec, changed: true };
  }

  remove(id, opts = {}) {
    const before = this._byId.get(id);
    const removed = this._byId.delete(id);
    if (removed) {
      this._maybeAutoSave();
      if (this._auditLogEnabled !== false) {
        audit.appendAuditEntry({
          action: audit.ACTIONS.REMOVE,
          id,
          actor: opts.actor || null,
          meetingId: opts.meetingId || null,
          reason: opts.reason || null,
          before: before ? {
            tier: before.tier,
            domain: before.domain,
            vetoPower: before.vetoPower,
            score: before.score,
          } : null,
        }, { auditPath: this._auditPath });
      }
    }
    return removed;
  }

  // (Phase 1.3) Bulk import. Two modes:
  //   - 'merge' (default): each entry in the bundle is added if
  //     missing, or its score replaces the existing record. The
  //     immutable fields (prompt / brain / tier / domain / triggers)
  //     of an existing seed-backed specialist are preserved unless
  //     the bundle entry overrides them explicitly.
  //   - 'replace': the registry is wiped of everything not in the
  //     bundle (governance-added entries dropped, seed entries
  //     kept). Then the bundle's scores / governance entries land
  //     on top.
  //
  // Returns { added, updated, removed, skipped, errors }.
  importBundle(bundle, opts = {}) {
    const mode = opts.mode === 'replace' ? 'replace' : 'merge';
    const dryRun = !!opts.dryRun;
    if (!bundle || !Array.isArray(bundle.specialists)) {
      throw new Error('importBundle: bundle.specialists array required');
    }

    const stats = { added: [], updated: [], removed: [], skipped: [], errors: [] };

    if (mode === 'replace') {
      // Drop every governance-added (non-seed) entry. We re-derive
      // the seed set from disk so we can tell which ids belong to
      // the seed.
      let seedIds;
      try {
        const loaded = loadSeed(SEED_PATH);
        seedIds = new Set(loaded.specialists.map((s) => s.id));
      } catch {
        seedIds = new Set();
      }
      for (const id of [...this._byId.keys()]) {
        if (!seedIds.has(id)) {
          if (!dryRun) this._byId.delete(id);
          stats.removed.push(id);
        }
      }
    }

    for (const entry of bundle.specialists) {
      if (!entry || typeof entry.id !== 'string') {
        stats.errors.push({ id: '?', reason: 'missing id' });
        continue;
      }
      const existing = this._byId.get(entry.id);
      if (existing) {
        // Score + probation + vetoPower override; immutable fields
        // come from the bundle ONLY if the bundle includes them.
        const merged = {
          ...existing,
          ...(entry.systemPrompt ? { systemPrompt: entry.systemPrompt } : {}),
          ...(entry.brain ? { brain: entry.brain } : {}),
          ...(entry.tier ? { tier: entry.tier } : {}),
          ...(entry.domain ? { domain: entry.domain } : {}),
          ...(entry.triggers ? { triggers: entry.triggers } : {}),
          ...(entry.deliverables ? { deliverables: entry.deliverables } : {}),
          ...(entry.score ? { score: entry.score } : {}),
          ...(entry.probation ? { probation: entry.probation } : {}),
          ...(typeof entry.vetoPower === 'boolean' ? { vetoPower: entry.vetoPower } : {}),
        };
        try {
          validateSpecialist(merged, `import[${entry.id}]`);
          if (!dryRun) this._byId.set(entry.id, normalizeSpecialist(merged));
          stats.updated.push(entry.id);
        } catch (err) {
          stats.errors.push({ id: entry.id, reason: err.message });
        }
      } else {
        try {
          validateSpecialist(entry, `import-add[${entry.id}]`);
          if (!dryRun) this._byId.set(entry.id, normalizeSpecialist(entry));
          stats.added.push(entry.id);
        } catch (err) {
          stats.errors.push({ id: entry.id, reason: err.message });
        }
      }
    }

    if (!dryRun) this._maybeAutoSave();
    if (!dryRun && this._auditLogEnabled !== false) {
      audit.appendAuditEntry({
        action: audit.ACTIONS.IMPORT,
        actor: opts.actor || null,
        meetingId: opts.meetingId || null,
        mode,
        added: stats.added,
        updated: stats.updated,
        removed: stats.removed,
        errorsCount: stats.errors.length,
      }, { auditPath: this._auditPath });
    }
    return {
      mode,
      dryRun,
      added: stats.added,
      updated: stats.updated,
      removed: stats.removed,
      skipped: stats.skipped,
      errors: stats.errors,
    };
  }

  // (Phase 1.3) Bulk export. Returns the full registry as a
  // bundle suitable for `importBundle`. Score / probation /
  // vetoPower drift from seed are preserved; the immutable
  // fields are included so the bundle is self-contained on a
  // host that may not have the same seed (e.g., copying a
  // tuned registry from prod to staging).
  exportBundle() {
    const specialists = [];
    for (const spec of this._byId.values()) {
      specialists.push({
        id: spec.id,
        displayName: spec.displayName,
        tier: spec.tier,
        domain: spec.domain.slice(),
        brain: { ...spec.brain },
        systemPrompt: spec.systemPrompt,
        triggers: {
          keywords: spec.triggers.keywords.slice(),
          stages: spec.triggers.stages.slice(),
        },
        deliverables: spec.deliverables.slice(),
        ...(spec.vetoPower ? { vetoPower: true } : {}),
        ...(spec.probation && spec.probation !== 'stable' ? { probation: spec.probation } : {}),
        ...(spec.score && (
          Object.keys(spec.score.byDomain || {}).length
          + Object.keys(spec.score.byStage || {}).length
          + Object.keys(spec.score.samples || {}).length
        ) > 0 ? { score: spec.score } : {}),
      });
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceVersion: this._version,
      specialists,
    };
  }

  // Called by retro applyRetroDeltas (which mutates spec.score
  // directly via the internal Map) so the registry state is flushed
  // after every score update without changing that contract.
  notifyMutated() {
    this._maybeAutoSave();
  }

  _maybeAutoSave() {
    if (!this._autoSave || !this._persistPath) return;
    try { this.save(); }
    catch (err) {
      process.stderr.write(`[specialist-registry] auto-save failed: ${err.message}\n`);
    }
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
  loadOverlay,
  validateSpecialist,
  normalizeSpecialist,
  getShared,
  resetShared,
  VALID_TIERS,
  VALID_PROBATION_STATES,
  SEED_PATH,
  DEFAULT_PERSIST_PATH,
};
