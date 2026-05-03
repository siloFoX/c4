'use strict';

// Specialist proposal via meeting consensus (Phase 1.5).
//
// Per design doc §10 resolved decision "스페셜리스트는 미팅 합의로
// 추가 가능". The unilateral `c4 specialist add` path bypasses the
// safety check that the new specialist actually fits the team.
// `proposeSpecialist()` wraps the addition in a meta-meeting:
//
//   1. Validate the candidate spec.
//   2. Plan a lightweight (default) meeting whose task is
//      "Propose adding <id>: <role-intro>".
//   3. Run the orchestrator with the supplied brain so each
//      participating specialist contributes a turn + vote.
//   4. Examine the final consensus view. Accept = registry.add()
//      with audit entry referencing the meeting id. Object/escalated
//      = nothing applied; the operator can re-propose with
//      revisions.
//
// The meta-meeting is itself recorded in the standard MeetingStore
// + audit log so a later operator can see how the registry got its
// shape.
//
// Out of scope: parameterized "promote from probation → stable"
// voting. The probation-graduate flow may share infra later.

const { planMeeting } = require('./meeting-plan');
const { MeetingSession, getShared: getMeetingStore } = require('./meeting-session');
const { MeetingOrchestrator } = require('./meeting-orchestrator');
const { MockBrainProvider, ClaudeBrainProvider } = require('./meeting-brain');
const specialistRegistry = require('./specialist-registry');
const audit = require('./specialist-audit');
const { validateSpecialist } = specialistRegistry;

const DEFAULT_TRACK = 'lightweight';

// Build the prompt for the meta-meeting. We override the standard
// task with a structured proposal block so the brain has the
// candidate's full shape without us shipping a separate prompt
// pipeline. The orchestrator's per-specialist system prompt then
// kicks in normally — each evaluator decides through their own role
// lens (architect cares about boundaries, security-auditor about
// secret/auth surface, etc.).
function _buildProposalTask(candidate) {
  const lines = [];
  lines.push(`Propose adding new specialist "${candidate.id}" to the registry.`);
  lines.push('');
  lines.push(`Display name: ${candidate.displayName}`);
  lines.push(`Tier: ${candidate.tier}`);
  lines.push(`Domains: ${(candidate.domain || []).join(', ')}`);
  lines.push(`Brain: ${candidate.brain && candidate.brain.adapter}/${candidate.brain && (candidate.brain.model || '-')}`);
  lines.push('');
  lines.push('Proposed system prompt:');
  lines.push('');
  lines.push(candidate.systemPrompt);
  lines.push('');
  lines.push('Vote accept if this specialist fills a real gap and the prompt is well-scoped.');
  lines.push('Vote object if it duplicates an existing role, the prompt is too vague, or the brain choice is unsuitable.');
  return lines.join('\n');
}

// Inspect the terminal MeetingSession and decide if the candidate
// should be added. Returns { accepted, accepts, objects, missing,
// reason }. Accepts when the meeting reached `completed` AND there
// are no objections in the final consensus view of any stage.
function _decideFromMeeting(session) {
  const json = session.toJSON();
  const accepts = new Set();
  const objects = [];
  const missing = new Set();
  for (const stage of json.stages || []) {
    const c = stage.consensus;
    if (!c) continue;
    for (const a of c.accepts || []) accepts.add(a);
    for (const o of c.objects || []) objects.push(o);
    for (const m of c.missing || []) missing.add(m);
  }
  if (json.status === 'completed' && objects.length === 0) {
    return {
      accepted: true,
      accepts: [...accepts],
      objects: [],
      missing: [...missing],
      reason: null,
    };
  }
  return {
    accepted: false,
    accepts: [...accepts],
    objects,
    missing: [...missing],
    reason: json.status === 'escalated'
      ? 'meeting escalated without resolution'
      : objects.length > 0
        ? `objections from: ${objects.map((o) => o.id).join(', ')}`
        : `meeting ended with status "${json.status}"`,
  };
}

// Public entry point.
//
// opts:
//   candidate        required, the specialist record to propose
//   brain            'mock' | 'claude' (default 'mock')
//   track            'lightweight' | 'standard' | 'full'
//                    (default 'lightweight')
//   actor            audit-log actor (default 'proposal')
//   registry         optional SpecialistRegistry override (tests)
//   autoApply        default true — when accepted, immediately
//                    `registry.add()`. False returns the decision
//                    without mutating.
async function proposeSpecialist(candidate, opts = {}) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('proposeSpecialist: candidate required');
  }
  validateSpecialist(candidate, `proposal[${candidate.id}]`);
  const reg = opts.registry || specialistRegistry.getShared();
  if (reg.has(candidate.id)) {
    throw new Error(`proposeSpecialist: "${candidate.id}" already exists`);
  }
  const track = opts.track || DEFAULT_TRACK;
  const brainKind = opts.brain || 'mock';

  const plan = planMeeting({
    task: _buildProposalTask(candidate),
    track,
    title: `Proposal: add ${candidate.id}`,
    registry: reg,
  });
  // Stamp proposal metadata so wiki publish + audit trail can
  // reference the candidate even if the meeting was never finalized.
  plan.proposalCandidateId = candidate.id;

  const session = new MeetingSession(plan);
  try { getMeetingStore().put(session); }
  catch { /* test harness may not have shared store */ }

  let brain;
  if (brainKind === 'mock') brain = new MockBrainProvider();
  else if (brainKind === 'claude') brain = new ClaudeBrainProvider({
    timeoutMs: Number.isFinite(opts.askTimeoutMs) ? opts.askTimeoutMs : undefined,
  });
  else throw new Error(`unsupported brain "${brainKind}"`);

  const orch = new MeetingOrchestrator({
    session,
    brain,
    maxAsks: Number.isFinite(opts.maxAsks) ? opts.maxAsks : 100,
    maxStages: Number.isFinite(opts.maxStages) ? opts.maxStages : 8,
  });
  await orch.run();

  const decision = _decideFromMeeting(session);
  let added = false;
  if (decision.accepted && opts.autoApply !== false) {
    reg.add(candidate, {
      actor: opts.actor || 'proposal',
      meetingId: session.id,
      reason: 'meeting consensus',
    });
    added = true;
  } else if (!decision.accepted) {
    // Always audit the rejected proposal so operators can see
    // the negative cases too.
    if (reg && reg._auditPath) {
      try {
        audit.appendAuditEntry({
          action: 'propose-rejected',
          id: candidate.id,
          actor: opts.actor || 'proposal',
          meetingId: session.id,
          reason: decision.reason,
          objects: decision.objects,
        }, { auditPath: reg._auditPath });
      } catch { /* best-effort */ }
    }
  }

  return {
    candidateId: candidate.id,
    meetingId: session.id,
    decision,
    added,
    sessionStatus: session.status,
  };
}

module.exports = {
  proposeSpecialist,
  _buildProposalTask,
  _decideFromMeeting,
};
