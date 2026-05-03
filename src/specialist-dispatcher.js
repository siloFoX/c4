'use strict';

// Specialist Dispatcher (Phase 1 of multi-specialist system).
//
// Given a task description + current pipeline stage, select N
// relevant specialists from the registry. Phase 1 ships the
// rule-based pre-filter and exploration budget; the score-weighted
// ranking is stubbed (uniform priority) until phase 4 lands the
// retro/feedback loop.
//
// See docs/multi-specialist-system.md §5 for the full design.

const { SpecialistRegistry } = require('./specialist-registry');

const VALID_TRACKS = Object.freeze(['lightweight', 'standard', 'full']);

// Track caps from §6.2. Cap is enforced AFTER the rule + score
// filter so we never spawn more specialists than the track allows.
const TRACK_CAPS = Object.freeze({
  lightweight: 2,   // DRI + optional reviewer
  standard: 5,
  full: 8,
});

// Per-track, the stages that are walked. Used by orchestrators (§6.2)
// but also exposed here so callers reasoning about "what does a full
// track look like" don't have to re-derive it.
const TRACK_STAGES = Object.freeze({
  lightweight: ['implement', 'review'],
  standard:    ['design', 'implement', 'review', 'test', 'docs'],
  full:        ['meeting', 'design', 'implement', 'review', 'audit', 'test', 'deploy', 'docs'],
});

const DEFAULT_EXPLORATION_RATIO = 0.15; // 15% of slots reserved for low-rank specialists.

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Score a single specialist against a task. Phase 1 uses pure rule
// signals; phase 4 will multiply this by the per-domain score record.
function scoreSpecialist(spec, { taskTokens, stage }) {
  let score = 0;

  // Stage match — primary filter. If the specialist does not list the
  // current stage in its triggers, it scores 0 (caller filters out).
  if (stage && !spec.triggers.stages.includes(stage)) return 0;
  score += 1; // baseline for being eligible at this stage.

  // Keyword hits — each match adds 1.
  if (taskTokens && taskTokens.length > 0) {
    const kwSet = new Set(spec.triggers.keywords.map((k) => k.toLowerCase()));
    for (const t of taskTokens) {
      if (kwSet.has(t)) score += 1;
    }
    // Domain hits — each match adds 0.5 (looser signal than keywords).
    const domSet = new Set(spec.domain.map((d) => d.toLowerCase()));
    for (const t of taskTokens) {
      if (domSet.has(t)) score += 0.5;
    }
  }

  // Veto roles get a small priority bump on audit/deploy stages so
  // they don't get crowded out of full-track meetings.
  if (spec.vetoPower && (stage === 'audit' || stage === 'deploy')) {
    score += 0.5;
  }

  // Probation specialists ride at slightly lower priority but stay
  // eligible — the §8.3 exploration budget below will lift them
  // back up when the dispatcher reserves slots.
  if (spec.probation === 'probation') score *= 0.8;

  return score;
}

class SpecialistDispatcher {
  constructor(opts = {}) {
    if (opts.registry instanceof SpecialistRegistry) {
      this._registry = opts.registry;
    } else {
      this._registry = new SpecialistRegistry(opts);
    }
    this._explorationRatio = Number.isFinite(opts.explorationRatio)
      ? Math.max(0, Math.min(1, opts.explorationRatio))
      : DEFAULT_EXPLORATION_RATIO;
  }

  get registry() { return this._registry; }

  // Pick specialists for a task at a given stage + track. Returns
  // {selected, scored, track, stage, cap} so the caller can audit
  // why each specialist made the cut.
  pick({ task = '', stage = null, track = 'standard', overrideCap = null } = {}) {
    if (!VALID_TRACKS.includes(track)) {
      throw new Error(`unknown track "${track}", expected one of ${VALID_TRACKS.join('|')}`);
    }
    const cap = Number.isFinite(overrideCap) && overrideCap > 0
      ? Math.floor(overrideCap)
      : TRACK_CAPS[track];

    const taskTokens = tokenize(task);

    // 1. Score every eligible specialist.
    const scored = [];
    for (const spec of this._registry.list()) {
      const score = scoreSpecialist(spec, { taskTokens, stage });
      if (score > 0) scored.push({ spec, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.spec.id.localeCompare(b.spec.id);
    });

    // 2. Top-K main pick.
    const exploreSlots = Math.max(0, Math.round(cap * this._explorationRatio));
    const mainSlots = Math.max(1, cap - exploreSlots);
    const mainPicks = scored.slice(0, mainSlots);

    // 3. Exploration — reach into the lowest-scored eligible
    //    specialists not already in mainPicks. Reverse-iterate so we
    //    consistently pick the very tail; ties broken by id for
    //    determinism in tests.
    const taken = new Set(mainPicks.map((p) => p.spec.id));
    const exploration = [];
    for (let i = scored.length - 1; i >= mainSlots && exploration.length < exploreSlots; i -= 1) {
      const { spec } = scored[i];
      if (taken.has(spec.id)) continue;
      exploration.push(scored[i]);
      taken.add(spec.id);
    }

    const selected = [...mainPicks, ...exploration].slice(0, cap);
    return {
      selected: selected.map((s) => ({
        ...s.spec,
        _score: s.score,
        _picked: exploration.includes(s) ? 'exploration' : 'top',
      })),
      track,
      stage,
      cap,
      exploreSlots,
      candidates: scored.length,
    };
  }

  // Convenience helper: return the stage list a track walks. Used
  // by future orchestrators that need to step through the pipeline.
  stagesForTrack(track) {
    if (!VALID_TRACKS.includes(track)) {
      throw new Error(`unknown track "${track}"`);
    }
    return TRACK_STAGES[track].slice();
  }

  capForTrack(track) {
    if (!VALID_TRACKS.includes(track)) {
      throw new Error(`unknown track "${track}"`);
    }
    return TRACK_CAPS[track];
  }
}

// Lightweight track classifier — phase 1 ships the rule-only branch
// (§6.2 hybrid: rules first, LLM router fallback in phase 2). Returns
// 'lightweight' / 'standard' / 'full'.
//
// Heuristics, in order:
//   - keyword "rollback" / "fix" / "typo" / "one-line" → lightweight
//     unless it also touches auth/secret/migration → escalate to full.
//   - keyword "auth" / "secret" / "migration" / "schema" / "deploy" /
//     "prod" → full (irreversible / sensitive).
//   - everything else → standard.
function classifyTrack(task) {
  const tokens = tokenize(task);
  if (tokens.length === 0) return 'standard';
  const set = new Set(tokens);

  const fullSignals = ['auth', 'secret', 'credential', 'token', 'migration', 'schema', 'deploy', 'prod', 'production', 'rollback', 'rbac', 'permission'];
  const liteSignals = ['typo', 'one-line', 'oneline', 'rename', 'comment', 'docstring'];

  const hasFull = fullSignals.some((k) => set.has(k));
  if (hasFull) return 'full';

  const hasLite = liteSignals.some((k) => set.has(k));
  if (hasLite) return 'lightweight';

  return 'standard';
}

module.exports = {
  SpecialistDispatcher,
  classifyTrack,
  scoreSpecialist,
  tokenize,
  VALID_TRACKS,
  TRACK_CAPS,
  TRACK_STAGES,
  DEFAULT_EXPLORATION_RATIO,
};
