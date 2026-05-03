'use strict';

// Meeting fork (Phase 6.3 of multi-specialist system).
//
// Clone an existing MeetingSession (typically completed / escalated /
// aborted) into a brand-new pending plan. Two modes:
//
//   replan (default) — re-run the dispatcher with the source's
//     task/track (or callerOverride), getting fresh participant
//     selection that reflects current registry state (newly-added
//     specialists, updated scores). Good for retro/follow-up runs
//     where "do this again, but smarter" is the operator's intent.
//
//   reuse — deep-clone the source plan and just stamp a new
//     meetingId. Same roster, same deliverables. Good when the
//     point of the fork is "redo with the EXACT same setup but
//     with a different question/wording" (the dispatcher must not
//     get a chance to drop or substitute participants).
//
// In both modes the new plan carries `forkOf: <sourceId>` so audit
// and wiki tooling can reconstruct the lineage.

const { planMeeting, newMeetingId } = require('./meeting-plan');
const { MeetingSession, getShared: getMeetingStore } = require('./meeting-session');
const specialistRegistry = require('./specialist-registry');

const VALID_MODES = ['replan', 'reuse'];

function _deepClonePlan(plan) {
  // Plan is plain JSON-ish (no Date or function values), so
  // structuredClone-equivalent via parse/stringify is safe and
  // avoids node-version-gating on structuredClone.
  return JSON.parse(JSON.stringify(plan));
}

// Public entry point.
//
// opts:
//   sourceId  required — existing session id in the store
//   mode      'replan' (default) | 'reuse'
//   task      override task text (optional)
//   track     override track (optional, dispatcher honors only in
//             'replan' mode; ignored in 'reuse' since the plan was
//             already built for a specific track)
//   title     override title (optional)
//   registry  SpecialistRegistry override (tests)
//   store     MeetingStore override (tests)
//
// Returns the new session's toJSON snapshot.
function forkMeeting(sourceId, opts = {}) {
  if (!sourceId || typeof sourceId !== 'string') {
    throw new Error('forkMeeting: sourceId is required');
  }
  const mode = opts.mode || 'replan';
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`forkMeeting: mode must be one of ${VALID_MODES.join('|')}`);
  }
  const store = opts.store || getMeetingStore();
  const source = store.get(sourceId);
  if (!source) {
    throw new Error(`forkMeeting: source meeting "${sourceId}" not found`);
  }
  const sourcePlan = source.plan;

  let plan;
  if (mode === 'reuse') {
    // Same roster, fresh meeting id.
    plan = _deepClonePlan(sourcePlan);
    plan.meetingId = newMeetingId();
    plan.generatedAt = new Date().toISOString();
    if (typeof opts.task === 'string' && opts.task.trim()) plan.task = opts.task.trim();
    if (typeof opts.title === 'string' && opts.title.trim()) plan.title = opts.title.trim();
    // track override is intentionally ignored in 'reuse' mode — see
    // module docstring.
  } else {
    // 'replan' — call planMeeting() afresh.
    const reg = opts.registry || specialistRegistry.getShared();
    plan = planMeeting({
      task: typeof opts.task === 'string' && opts.task.trim()
        ? opts.task.trim()
        : sourcePlan.task,
      track: typeof opts.track === 'string' && opts.track.trim()
        ? opts.track.trim()
        : sourcePlan.track,
      title: typeof opts.title === 'string' && opts.title.trim()
        ? opts.title.trim()
        : sourcePlan.title,
      registry: reg,
    });
  }
  plan.forkOf = sourceId;

  const session = new MeetingSession(plan);
  store.put(session);
  return session.toJSON();
}

module.exports = {
  forkMeeting,
  VALID_MODES,
};
