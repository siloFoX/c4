'use strict';

// MeetingOrchestrator (Phase 2.3 of multi-specialist system).
//
// Drives a MeetingSession from `pending` to terminal status by
// asking each specialist in turn (per-round) and recording their
// contributions into the session. The orchestrator is brain-agnostic
// — it talks to a BrainProvider abstraction (see meeting-brain.js).
// Phase 2.3 ships MockBrainProvider; phase 2.4 will add a real
// Claude-backed brain.
//
// Round flow:
//   for stage in plan.stages:
//     while not consensus and round ≤ roundCap:
//       for specialist in stage.specialists:
//         if specialist already voted accept this round: skip
//         ask brain → contribute(turn, vote, reason)
//       if consensus reached: advanceStage (or finish)
//       else: nextRound
//     if round cap exhausted without consensus: escalate
//
// The orchestrator never starts a meeting it didn't construct on
// its own — callers pass an *already-pending* MeetingSession; the
// orchestrator calls `start()` on it and then runs to completion.

const { MeetingSession } = require('./meeting-session');
const { BrainProvider, buildPrompt } = require('./meeting-brain');

class MeetingOrchestrator {
  constructor(opts = {}) {
    if (!opts.session || !(opts.session instanceof MeetingSession)) {
      throw new Error('MeetingOrchestrator: session is required');
    }
    if (!opts.brain || !(opts.brain instanceof BrainProvider)) {
      throw new Error('MeetingOrchestrator: brain (BrainProvider instance) is required');
    }
    this._session = opts.session;
    this._brain = opts.brain;
    this._maxStages = Number.isFinite(opts.maxStages) ? opts.maxStages : 32;
    this._maxAsks = Number.isFinite(opts.maxAsks) ? opts.maxAsks : 200;
    this._asks = 0;
    this._listeners = [];
  }

  get session() { return this._session; }
  get totalAsks() { return this._asks; }

  // Subscribe to per-event progress (for SSE / CLI tail later).
  // event ∈ {'turn'|'advance'|'escalate'|'complete'|'aborted'|'next-round'}
  on(event, fn) {
    this._listeners.push({ event, fn });
    return () => {
      this._listeners = this._listeners.filter((l) => l.fn !== fn);
    };
  }

  _emit(event, payload) {
    for (const l of this._listeners) {
      if (l.event === event) {
        try { l.fn(payload); } catch { /* swallow */ }
      }
    }
  }

  // Run the meeting to completion. Returns the final session JSON.
  async run() {
    const sess = this._session;
    if (sess.status === 'pending') sess.start();
    if (sess.status !== 'in-progress') {
      return sess.toJSON();
    }

    let stagesWalked = 0;
    while (sess.status === 'in-progress') {
      stagesWalked += 1;
      if (stagesWalked > this._maxStages) {
        sess.escalate('orchestrator: maxStages exceeded (loop guard)');
        this._emit('escalate', { reason: 'maxStages' });
        break;
      }

      // Run rounds until consensus or cap.
      let consensusReached = false;
      while (!consensusReached) {
        const stage = sess.plan.stages[sess._currentStageIndex];
        // Ask each specialist whose latest vote is missing or not accept.
        for (const specialist of stage.specialists) {
          if (this._asks >= this._maxAsks) {
            sess.escalate('orchestrator: maxAsks exceeded (loop guard)');
            this._emit('escalate', { reason: 'maxAsks' });
            return sess.toJSON();
          }
          const view = sess.consensusView();
          // Skip specialists who have already accepted this round.
          if (view.accepts.includes(specialist.id)) continue;
          // Skip vetoed branches early — round will end in object.
          const objectorReason = view.objects.find((o) => o.id === specialist.id);
          if (objectorReason) {
            // Re-ask anyway: the specialist might soften on a later round.
          }

          const fullSpec = sess.plan.stages[sess._currentStageIndex].specialists
            .find((s) => s.id === specialist.id);
          // Pull the full record from the registry-shaped specialist
          // entry stored on the plan (it carries id/displayName/brain
          // but the systemPrompt comes from the meeting-brain prompt
          // builder calling specialist.systemPrompt — so we need to
          // load the full record from the registry).
          const fullSystemPrompt = specialist.systemPrompt || _systemPromptFor(specialist, sess);
          const prompt = buildPrompt({ ...fullSpec, systemPrompt: fullSystemPrompt }, {
            plan: sess.plan,
            currentStage: sess.currentStage,
            currentRound: sess.currentRound,
            transcriptSoFar: sess.transcript(),
            lastView: view,
          });
          this._asks += 1;
          const reply = await this._brain.ask(
            { ...fullSpec, systemPrompt: fullSystemPrompt },
            prompt,
            {
              plan: sess.plan,
              currentStage: sess.currentStage,
              currentRound: sess.currentRound,
              transcriptSoFar: sess.transcript(),
              lastView: view,
            },
          );
          // Record contribution (with optional vote).
          const turn = sess.contribute(specialist.id, reply.text || '', {
            vote: reply.vote || null,
            reason: reply.reason || null,
          });
          this._emit('turn', { turn, specialistId: specialist.id });
        }

        // After every specialist has spoken (or refused), check consensus.
        const view = sess.consensusView();
        consensusReached = view.reached;
        if (consensusReached) break;

        // Try one more round if we have room.
        const bumped = sess.nextRound();
        if (!bumped.bumped) {
          sess.escalate(`round-cap reached on stage "${sess.currentStage}"`);
          this._emit('escalate', { stage: sess.currentStage, reason: 'round-cap' });
          return sess.toJSON();
        }
        this._emit('next-round', { stage: sess.currentStage, round: bumped.round });
      }

      // Consensus reached on this stage — advance.
      const adv = sess.advanceStage();
      this._emit('advance', adv);
      if (!adv.advanced) {
        // Should not happen: consensus loop above guards this. Defensive.
        sess.escalate(`unexpected advance refusal on "${sess.currentStage}"`);
        this._emit('escalate', { reason: 'unexpected-advance-refusal' });
        return sess.toJSON();
      }
      if (adv.status === 'completed') {
        this._emit('complete', { id: sess.id });
        break;
      }
    }
    return sess.toJSON();
  }
}

// Lookup helper — the plan's specialist entries omit systemPrompt to
// keep the plan small. When orchestrating we need it for the prompt
// builder. Falls back to a generic prompt if the registry lookup
// fails (which would only happen if the registry mutated mid-meeting).
function _systemPromptFor(specialistFromPlan, sess) {
  if (specialistFromPlan && typeof specialistFromPlan.systemPrompt === 'string') {
    return specialistFromPlan.systemPrompt;
  }
  // Lazy require to avoid circular module load at top of file.
  try {
    const reg = require('./specialist-registry').getShared();
    const full = reg.get(specialistFromPlan.id);
    if (full && full.systemPrompt) return full.systemPrompt;
  } catch { /* noop */ }
  return `[Role: ${specialistFromPlan.id}] Contribute to the ${sess.currentStage} stage.`;
}

module.exports = {
  MeetingOrchestrator,
};
