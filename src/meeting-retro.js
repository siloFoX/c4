'use strict';

// Meeting Retro / Score updater (Phase 4.1 of multi-specialist system).
//
// Walks a *terminal* MeetingSession and produces per-specialist
// score adjustments that can be folded into the registry. The
// algorithm intentionally stays simple in 4.1 — it does not run a
// retro meeting yet (that lands in 4.2) and it does not consult
// outcome signals (test-pass rate, post-merge regressions etc.)
// since the meeting itself does not emit code at this layer.
//
// Signals (in §8.3 design doc):
//   1. participation: every stage a specialist contributed in adds a
//      sample for the stage + each of their domains.
//   2. outcome alignment: the specialist's last vote on each stage,
//      compared with whether the meeting reached terminal completion
//      vs escalation:
//        meeting completed + last vote accept → +1.0
//        meeting completed + last vote object → -0.5 (rebellious)
//        meeting escalated + last vote object → +0.5 (held the line)
//        meeting escalated + last vote accept → -0.25 (rolled over)
//   3. silence: missing vote → 0 contribution to the score, but
//      still counts as participation if the specialist contributed
//      at least one turn that stage.
//
// New score = existing score blended with stage signal via
// exponential smoothing (alpha=0.3 default — prefers recent trends
// without erasing the prior). Sample counts increment unconditionally.

const DEFAULT_ALPHA = 0.3;

const SIGNAL_BY_OUTCOME_AND_VOTE = {
  completed: { accept:  1.0, object: -0.5 },
  escalated: { accept: -0.25, object:  0.5 },
  aborted:   { accept:  0.0, object:   0.0 }, // user gave up — no signal
};

function _signalFor(outcome, vote) {
  const table = SIGNAL_BY_OUTCOME_AND_VOTE[outcome];
  if (!table) return 0;
  return table[vote] || 0;
}

// Given a terminal session, compute score deltas keyed by
// specialist id. Returns:
//   { sessionId, outcome, deltas: { id: { byDomain, byStage, samples, contribution } } }
//
// `contribution` = aggregate number of turns the specialist spoke.
// `samples`     = same as contribution per (stage, domain) bucket.
// `byDomain`    = signal averaged across stages the specialist participated in.
// `byStage`     = signal per stage.
function computeRetroDeltas(session, opts = {}) {
  const json = session.toJSON();
  const outcome = json.status;
  if (!['completed', 'escalated', 'aborted'].includes(outcome)) {
    throw new Error(`computeRetroDeltas: session must be terminal (got "${outcome}")`);
  }

  const deltas = new Map();
  for (let stageIdx = 0; stageIdx < json.stages.length; stageIdx += 1) {
    const stage = json.stages[stageIdx];
    const transcript = json.transcripts[stageIdx] || [];
    if (transcript.length === 0) continue;

    // Latest vote per specialist for this stage.
    const latestVote = new Map();
    for (const v of (json.votes[stageIdx] || [])) {
      latestVote.set(v.specialistId, v.vote);
    }

    // Specialists who participated this stage (had at least 1 turn).
    const speakers = new Set(transcript.map((t) => t.specialistId));

    for (const id of speakers) {
      const vote = latestVote.get(id) || 'silent';
      const sig = _signalFor(outcome, vote);
      let entry = deltas.get(id);
      if (!entry) {
        entry = {
          byDomain: {},
          byStage: {},
          samples: {},
          contribution: 0,
          stagesParticipated: [],
        };
        deltas.set(id, entry);
      }
      entry.contribution += transcript.filter((t) => t.specialistId === id).length;
      entry.stagesParticipated.push(stage.stage);
      entry.byStage[stage.stage] = (entry.byStage[stage.stage] || 0) + sig;
      entry.samples[`stage:${stage.stage}`] = (entry.samples[`stage:${stage.stage}`] || 0) + 1;
      // Roll up to domains: pull the specialist's domains from the
      // session's plan snapshot — we do not need a registry round-
      // trip because the plan already carried the brain + roster.
      const planSpec = stage.specialists.find((sp) => sp.id === id);
      const domains = (planSpec && planSpec.domain) || (planSpec && planSpec._domain) || [];
      // The plan's specialist objects only carry id/displayName/brain
      // here, so we look up domains from the registry on the side.
      // The orchestrator keeps a reference to the registry; tests
      // pass it explicitly via opts.registry.
      const reg = opts.registry || (() => { try { return require('./specialist-registry').getShared(); } catch { return null; } })();
      const fullSpec = reg && reg.get ? reg.get(id) : null;
      const domainList = (fullSpec && fullSpec.domain) || domains;
      for (const d of domainList) {
        entry.byDomain[d] = (entry.byDomain[d] || 0) + sig;
        entry.samples[`domain:${d}`] = (entry.samples[`domain:${d}`] || 0) + 1;
      }
    }
  }

  // Convert per-stage / per-domain sums to averages (mean signal
  // across the stages each specialist participated in for that bucket).
  const out = {};
  for (const [id, entry] of deltas) {
    const byDomain = {};
    const byStage = {};
    for (const [stage, sum] of Object.entries(entry.byStage)) {
      const samples = entry.samples[`stage:${stage}`] || 1;
      byStage[stage] = sum / samples;
    }
    for (const [domain, sum] of Object.entries(entry.byDomain)) {
      const samples = entry.samples[`domain:${domain}`] || 1;
      byDomain[domain] = sum / samples;
    }
    out[id] = {
      contribution: entry.contribution,
      stagesParticipated: entry.stagesParticipated,
      byStage,
      byDomain,
      samples: entry.samples,
    };
  }

  return {
    sessionId: json.id,
    outcome,
    deltas: out,
  };
}

// Apply deltas to a SpecialistRegistry, blending each new signal
// into the specialist's existing score with exponential smoothing.
// Mutates the registry in-place; returns the per-specialist
// before/after snapshot for inspection / audit logging.
function applyRetroDeltas(registry, retro, opts = {}) {
  if (!registry || typeof registry.get !== 'function') {
    throw new Error('applyRetroDeltas: registry is required');
  }
  const alpha = Number.isFinite(opts.alpha) ? opts.alpha : DEFAULT_ALPHA;
  const applied = {};

  for (const [id, delta] of Object.entries(retro.deltas)) {
    const spec = registry.get(id);
    if (!spec) continue;
    const before = JSON.parse(JSON.stringify(spec.score || { byDomain: {}, byStage: {}, samples: {} }));

    const newScore = {
      byDomain: { ...(spec.score.byDomain || {}) },
      byStage: { ...(spec.score.byStage || {}) },
      samples: { ...(spec.score.samples || {}) },
      lastUpdated: new Date().toISOString(),
    };
    // Blend each per-stage signal.
    for (const [stage, sig] of Object.entries(delta.byStage)) {
      const prior = newScore.byStage[stage];
      newScore.byStage[stage] = (typeof prior === 'number')
        ? (prior * (1 - alpha) + sig * alpha)
        : sig;
    }
    // Blend each per-domain signal.
    for (const [domain, sig] of Object.entries(delta.byDomain)) {
      const prior = newScore.byDomain[domain];
      newScore.byDomain[domain] = (typeof prior === 'number')
        ? (prior * (1 - alpha) + sig * alpha)
        : sig;
    }
    // Increment sample counts.
    for (const [key, n] of Object.entries(delta.samples)) {
      newScore.samples[key] = (newScore.samples[key] || 0) + n;
    }
    spec.score = newScore;
    // Mutate in-place by re-adding via the (private) Map. Phase 1
    // shipped no public update helper; we reach into the internal
    // Map intentionally so this is the documented seam for
    // governance updates from §3.3.
    if (registry._byId && registry._byId.set) {
      registry._byId.set(id, spec);
    }

    applied[id] = { before, after: newScore };
  }
  // Persist the updated score record (no-op if registry was
  // constructed without a persistPath).
  if (Object.keys(applied).length > 0 && typeof registry.notifyMutated === 'function') {
    registry.notifyMutated();
  }
  // (Phase 8.7) Trace the score deltas so a future
  // `c4 specialist score-history <id>` can answer "did the
  // prompt revision actually move the needle?". Best-effort —
  // a missing audit module simply skips logging.
  try {
    const audit = require('./specialist-audit');
    const auditPath = registry && registry._auditPath;
    if (auditPath && audit && typeof audit.appendAuditEntry === 'function') {
      for (const [id, snap] of Object.entries(applied)) {
        // Compact deltas: just the changed buckets, not the whole
        // score record — the audit log gets noisy fast otherwise.
        const beforeDom = (snap.before && snap.before.byDomain) || {};
        const afterDom = (snap.after && snap.after.byDomain) || {};
        const beforeStg = (snap.before && snap.before.byStage) || {};
        const afterStg = (snap.after && snap.after.byStage) || {};
        const domainDeltas = {};
        const stageDeltas = {};
        for (const k of Object.keys(afterDom)) {
          if ((beforeDom[k] || 0) !== afterDom[k]) {
            domainDeltas[k] = { before: beforeDom[k] || null, after: afterDom[k] };
          }
        }
        for (const k of Object.keys(afterStg)) {
          if ((beforeStg[k] || 0) !== afterStg[k]) {
            stageDeltas[k] = { before: beforeStg[k] || null, after: afterStg[k] };
          }
        }
        if (Object.keys(domainDeltas).length === 0
          && Object.keys(stageDeltas).length === 0) continue;
        audit.appendAuditEntry({
          action: audit.ACTIONS.SCORE_APPLIED,
          id,
          domainDeltas,
          stageDeltas,
        }, { auditPath });
      }
    }
  } catch { /* skip if audit unavailable */ }
  return applied;
}

module.exports = {
  computeRetroDeltas,
  applyRetroDeltas,
  SIGNAL_BY_OUTCOME_AND_VOTE,
  DEFAULT_ALPHA,
};
