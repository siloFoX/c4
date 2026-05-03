'use strict';

// Auto-apply prompt revision after meeting consensus (Phase 5.2).
//
// `specialist-prompt-iterate.js` produces a *suggested* revision; this
// module gates that suggestion behind a meta-meeting and, on consensus
// without objections, calls `registry.updatePrompt()` to mutate the
// systemPrompt in place. Audit log records the meta-meeting id and
// `reason: revision consensus`.
//
// Per design doc §10 #3 ("미팅 합의로 추가 가능") the same governance
// path that approves new specialists also applies prompt rewrites.
// veto-holders (security-auditor + sre, §10 #5) participate in the
// meta-meeting via the standard track-driven dispatcher selection so
// their objection alone blocks the apply.

const { planMeeting } = require('./meeting-plan');
const { MeetingSession, getShared: getMeetingStore } = require('./meeting-session');
const { MeetingOrchestrator } = require('./meeting-orchestrator');
const { MockBrainProvider, ClaudeBrainProvider } = require('./meeting-brain');
const specialistRegistry = require('./specialist-registry');
const promptIterate = require('./specialist-prompt-iterate');
const audit = require('./specialist-audit');
const { _decideFromMeeting } = require('./specialist-proposal');

const DEFAULT_TRACK = 'lightweight';

// Build the meta-meeting prompt. The brain has already produced a
// candidate revision; the meeting's job is to compare against the
// current prompt and vote.
function _buildRevisionTask(spec, suggestion) {
  const lines = [];
  lines.push(`Apply revised systemPrompt to specialist "${spec.id}".`);
  lines.push('');
  lines.push(`Display name: ${spec.displayName}`);
  lines.push(`Tier: ${spec.tier}`);
  lines.push('');
  lines.push('## Current systemPrompt');
  lines.push('');
  lines.push(spec.systemPrompt);
  lines.push('');
  lines.push('## Proposed revision');
  lines.push('');
  lines.push(suggestion.revision);
  if (suggestion.rationale) {
    lines.push('');
    lines.push('## Rationale (from drafting brain)');
    lines.push('');
    lines.push(suggestion.rationale);
  }
  if (suggestion.analysis && suggestion.analysis.deepestBucket) {
    const b = suggestion.analysis.deepestBucket;
    lines.push('');
    lines.push(`## Why this revision was triggered`);
    lines.push('');
    lines.push(`Weak bucket: ${b.kind}:${b.name} score=${b.score.toFixed(2)} samples=${b.samples}`);
  }
  lines.push('');
  lines.push('Vote accept if the revision is concrete, preserves the role identity, and is likely to fix the weak buckets.');
  lines.push('Vote object if the revision drifts from the role, removes essential behaviors, or risks regression in healthy buckets.');
  return lines.join('\n');
}

// Public entry point.
//
// opts:
//   specialistId    required, must already exist in registry
//   brain           'mock' | 'claude' (default 'mock')
//   track           default 'lightweight'
//   actor           audit-log actor (default 'prompt-apply')
//   registry        SpecialistRegistry override (tests)
//   autoApply       default true — false stops after the meeting
//                   without mutating the registry
//   negativeThreshold / minSamples — analyzer thresholds
//   askTimeoutMs    forwarded to ClaudeBrainProvider
async function applyPromptRevision(specialistId, opts = {}) {
  if (!specialistId || typeof specialistId !== 'string') {
    throw new Error('applyPromptRevision: specialistId is required');
  }
  const reg = opts.registry || specialistRegistry.getShared();
  const spec = reg.get(specialistId);
  if (!spec) throw new Error(`applyPromptRevision: specialist "${specialistId}" not found`);

  const brainKind = opts.brain || 'mock';
  let brain;
  if (brainKind === 'mock') brain = new MockBrainProvider();
  else if (brainKind === 'claude') brain = new ClaudeBrainProvider({
    timeoutMs: Number.isFinite(opts.askTimeoutMs) ? opts.askTimeoutMs : undefined,
  });
  else throw new Error(`unsupported brain "${brainKind}"`);

  // Step 1 — drafting. The same brain that arbitrates the meeting
  // produces the candidate revision. We let suggestPromptRevision
  // throw if the analyzer finds nothing to revise — there is no
  // point spinning a meta-meeting on an empty proposal.
  const suggestion = await promptIterate.suggestPromptRevision(specialistId, {
    brain,
    registry: reg,
    negativeThreshold: opts.negativeThreshold,
    minSamples: opts.minSamples,
  });

  if (!suggestion.revision || suggestion.revision.trim() === '') {
    return {
      specialistId,
      meetingId: null,
      decision: { accepted: false, accepts: [], objects: [], missing: [], reason: 'brain produced no parseable revision' },
      applied: false,
      suggestion,
      sessionStatus: null,
    };
  }

  // Step 2 — meta-meeting on the revision.
  const plan = planMeeting({
    task: _buildRevisionTask(spec, suggestion),
    track: opts.track || DEFAULT_TRACK,
    title: `Revision: ${specialistId}`,
    registry: reg,
  });
  plan.revisionTargetId = specialistId;

  const session = new MeetingSession(plan);
  try { getMeetingStore().put(session); }
  catch { /* test harness may not have shared store */ }

  const orch = new MeetingOrchestrator({
    session,
    brain,
    maxAsks: Number.isFinite(opts.maxAsks) ? opts.maxAsks : 100,
    maxStages: Number.isFinite(opts.maxStages) ? opts.maxStages : 8,
  });
  await orch.run();

  const decision = _decideFromMeeting(session);

  // Step 3 — apply (or audit the rejection).
  let applied = false;
  if (decision.accepted && opts.autoApply !== false) {
    const result = reg.updatePrompt(specialistId, { systemPrompt: suggestion.revision }, {
      actor: opts.actor || 'prompt-apply',
      meetingId: session.id,
      reason: 'revision consensus',
    });
    applied = !!(result && result.changed);
  } else if (!decision.accepted) {
    if (reg && reg._auditPath) {
      try {
        audit.appendAuditEntry({
          action: 'prompt-revised-rejected',
          id: specialistId,
          actor: opts.actor || 'prompt-apply',
          meetingId: session.id,
          reason: decision.reason,
          objects: decision.objects,
        }, { auditPath: reg._auditPath });
      } catch { /* best-effort */ }
    }
  }

  return {
    specialistId,
    meetingId: session.id,
    decision,
    applied,
    suggestion: {
      revision: suggestion.revision,
      rationale: suggestion.rationale,
      analysis: suggestion.analysis,
    },
    sessionStatus: session.status,
  };
}

module.exports = {
  applyPromptRevision,
  _buildRevisionTask,
};
