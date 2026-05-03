'use strict';

// BrainProvider abstraction for the meeting orchestrator
// (Phase 2.3 of multi-specialist system).
//
// A BrainProvider takes a (specialist, prompt) pair and returns a
// structured contribution `{ text, vote?, reason? }`. The orchestrator
// is brain-agnostic; phase 2.3 ships MockBrainProvider for tests and
// canned demos. Phase 2.4 will add ClaudeBrainProvider on top of the
// existing src/agents/ adapter framework.
//
// Vote parsing convention: brains are asked to end their reply with
//     [VOTE: accept]
//   or
//     [VOTE: object — short reason]
// The parser is lenient — accepts colon or em-dash separators, "no"
// is treated as object — and falls back to no-vote when the marker
// is missing. This keeps real-Brain integration robust against minor
// formatting drift.

const VOTE_LINE = /\[\s*VOTE\s*:\s*(accept|object|approve|reject|no)\s*(?:[—:\-]\s*(.*?))?\s*\]/i;

function parseVote(text) {
  if (!text || typeof text !== 'string') return { vote: null, reason: null, cleaned: text || '' };
  const m = text.match(VOTE_LINE);
  if (!m) return { vote: null, reason: null, cleaned: text };
  const raw = m[1].toLowerCase();
  const vote = (raw === 'accept' || raw === 'approve') ? 'accept' : 'object';
  const reason = m[2] ? m[2].trim() : null;
  // Strip the marker from the cleaned text so the transcript shows
  // the prose without the trailing tag.
  const cleaned = text.replace(VOTE_LINE, '').trim();
  return { vote, reason, cleaned };
}

// Build the prompt fed to a specialist for one round.
//
//   context = { plan, currentStage, currentRound, transcriptSoFar, lastView }
function buildPrompt(specialist, context) {
  const lines = [];
  lines.push(specialist.systemPrompt);
  lines.push('');
  lines.push(`# Meeting`);
  lines.push(`Task: ${context.plan.task}`);
  lines.push(`Track: ${context.plan.track}`);
  lines.push(`Current stage: ${context.currentStage} (round ${context.currentRound})`);
  lines.push('');
  if (context.transcriptSoFar && context.transcriptSoFar.length > 0) {
    lines.push('# Conversation so far');
    for (const turn of context.transcriptSoFar) {
      lines.push(`[${turn.stage} r${turn.round}] ${turn.specialistId}: ${turn.text}`);
    }
    lines.push('');
  }
  if (context.lastView && context.lastView.objects.length > 0) {
    lines.push('# Outstanding objections');
    for (const o of context.lastView.objects) {
      lines.push(`- ${o.id}: ${o.reason || '(no reason)'}`);
    }
    lines.push('');
  }
  lines.push('# Your turn');
  lines.push(`You are speaking as **${specialist.id}** at the ${context.currentStage} stage.`);
  lines.push('Contribute one paragraph (your reasoning + any concrete deliverable).');
  lines.push('End your reply with one of:');
  lines.push('  [VOTE: accept]');
  lines.push('  [VOTE: object — <short reason>]');
  return lines.join('\n');
}

// Base class — concrete providers extend this with `ask()`.
class BrainProvider {
  // eslint-disable-next-line no-unused-vars
  async ask(specialist, prompt, context) {
    throw new Error('BrainProvider.ask must be implemented by subclass');
  }
}

// MockBrainProvider — scripted or rule-based responses.
//
// Modes:
//   1. `script` — fixed map<specialistId, async fn(specialist, prompt, ctx) → {...}>
//      caller provides per-specialist behavior for tests.
//   2. `default` — a heuristic that produces deterministic accept-most-of-the-time
//      contributions so the orchestrator can drive a meeting in a demo
//      without any setup. Veto-power specialists object on the first
//      round of audit / deploy stages to exercise the consensus path.
class MockBrainProvider extends BrainProvider {
  constructor(opts = {}) {
    super();
    this._script = opts.script || {};
    this._defaultBehavior = opts.defaultBehavior || 'accept-most';
    this._auditObjectionRounds = Number.isFinite(opts.auditObjectionRounds)
      ? opts.auditObjectionRounds
      : 1;
  }

  async ask(specialist, prompt, context) {
    const scripted = this._script[specialist.id];
    if (scripted) return scripted(specialist, prompt, context);

    // Default heuristic.
    const stage = context.currentStage;
    const round = context.currentRound;
    if (specialist.vetoPower
      && (stage === 'audit' || stage === 'deploy')
      && round <= this._auditObjectionRounds) {
      return {
        text: `As ${specialist.id}, on round ${round} I want to flag concerns before signing off on ${stage}. [VOTE: object — needs more detail]`,
        vote: 'object',
        reason: 'needs more detail',
      };
    }
    return {
      text: `As ${specialist.id}, my contribution at ${stage}/r${round}: looks reasonable. [VOTE: accept]`,
      vote: 'accept',
      reason: null,
    };
  }
}

module.exports = {
  BrainProvider,
  MockBrainProvider,
  buildPrompt,
  parseVote,
  VOTE_LINE,
};
