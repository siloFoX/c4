'use strict';

// Meeting Plan (Phase 2.1 of multi-specialist system).
//
// Walks a task through every stage of its track and returns the full
// roster a meeting would assemble, plus per-stage deliverables. This
// is a *preview* — no specialists are actually invoked. Phase 2.2
// adds MeetingSession on top to persist state + drive real agents.
//
// See docs/multi-specialist-system.md §6 (stages / tracks) and §7
// (meeting mechanics) for the full design.

const crypto = require('crypto');
const {
  SpecialistDispatcher,
  classifyTrack,
  TRACK_STAGES,
  VALID_TRACKS,
} = require('./specialist-dispatcher');
const { SpecialistRegistry } = require('./specialist-registry');

// Per-track consensus policy (§7.1). The orchestrator (phase 2.2)
// will read this to decide when to terminate a meeting.
const CONSENSUS_POLICY = Object.freeze({
  lightweight: { mode: 'dri',       roundCap: 1, allowVeto: false },
  standard:    { mode: 'quorum',    roundCap: 3, allowVeto: false },
  full:        { mode: 'consensus', roundCap: 5, allowVeto: true  },
});

function newMeetingId() {
  // 12 hex chars is enough for a few thousand meetings without
  // collision; if c4 grows fleet-wide unique ids the daemon can
  // prepend the host short-name later.
  return `m-${crypto.randomBytes(6).toString('hex')}`;
}

function defaultMeetingTitle(task) {
  const trimmed = (task || '').trim();
  if (!trimmed) return 'untitled meeting';
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

// Estimate token cost for a meeting plan. Crude heuristic — each
// specialist contributes ~roundCap rounds × 800 tokens of output +
// ingest of layer-A context. The orchestrator (phase 2.2) will
// replace this with actual telemetry once meetings run.
function estimateTokens(stages, roundCap) {
  let total = 0;
  for (const s of stages) {
    total += s.specialists.length * roundCap * 800;
  }
  // Layer-A overhead grows with stage count.
  total += stages.length * 400;
  return total;
}

// Plan a meeting end-to-end.
//
// Options:
//   task              required, free-text task description
//   track             optional, one of lightweight|standard|full;
//                     when omitted the rule classifier picks one
//   registry          optional SpecialistRegistry override (tests)
//   dispatcher        optional SpecialistDispatcher override (tests)
//   overrideCap       optional integer to clamp every stage's pick
//   explorationRatio  passed to dispatcher
//
// Returns:
//   { meetingId, title, task, track, inferredTrack,
//     consensusPolicy, stages: [
//       { stage, specialists: [...], deliverables: [...],
//         exploreSlots, candidates, cap }
//     ],
//     estimatedTokens, generatedAt }
function planMeeting(opts = {}) {
  const task = typeof opts.task === 'string' ? opts.task : '';
  if (!task.trim()) {
    throw new Error('planMeeting: task is required');
  }
  const explicitTrack = typeof opts.track === 'string' ? opts.track : null;
  if (explicitTrack && !VALID_TRACKS.includes(explicitTrack)) {
    throw new Error(`planMeeting: unknown track "${explicitTrack}"`);
  }
  const track = explicitTrack || classifyTrack(task);
  const inferredTrack = !explicitTrack;

  const registry = opts.registry instanceof SpecialistRegistry
    ? opts.registry
    : new SpecialistRegistry();
  const dispatcher = opts.dispatcher instanceof SpecialistDispatcher
    ? opts.dispatcher
    : new SpecialistDispatcher({
        registry,
        explorationRatio: opts.explorationRatio,
      });

  const stageList = TRACK_STAGES[track];
  const stages = [];
  // Track which specialists already appeared so the deliverable
  // list is per-stage but the roster summary at the bottom can
  // dedupe — operators want to see the unique set of agents.
  const rosterSet = new Set();
  for (const stage of stageList) {
    const picked = dispatcher.pick({
      task,
      stage,
      track,
      overrideCap: Number.isFinite(opts.overrideCap) ? opts.overrideCap : null,
    });
    const specialists = picked.selected.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      tier: s.tier,
      brain: s.brain,
      vetoPower: s.vetoPower,
      pickReason: s._picked,
      score: s._score,
    }));
    for (const s of specialists) rosterSet.add(s.id);
    // Aggregate deliverables defined by selected specialists for
    // this stage so the operator can see what artifacts to expect.
    const deliverables = [];
    for (const sid of specialists.map((s) => s.id)) {
      const full = registry.get(sid);
      if (!full || !Array.isArray(full.deliverables)) continue;
      for (const d of full.deliverables) {
        if (!deliverables.includes(d)) deliverables.push(d);
      }
    }
    stages.push({
      stage,
      specialists,
      deliverables,
      candidates: picked.candidates,
      exploreSlots: picked.exploreSlots,
      cap: picked.cap,
    });
  }

  const policy = CONSENSUS_POLICY[track];
  const estimatedTokens = estimateTokens(stages, policy.roundCap);

  return {
    meetingId: opts.meetingId || newMeetingId(),
    title: opts.title || defaultMeetingTitle(task),
    task,
    track,
    inferredTrack,
    consensusPolicy: { ...policy },
    stages,
    rosterSize: rosterSet.size,
    estimatedTokens,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  planMeeting,
  estimateTokens,
  defaultMeetingTitle,
  newMeetingId,
  CONSENSUS_POLICY,
};
