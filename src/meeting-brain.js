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

// ClaudeBrainProvider — spawn `claude -p --bare` per ask.
//
// Each call is a fresh, short-lived Claude Code process. Prompt
// goes via stdin so we don't hit argv length limits or shell
// quoting bugs. `--bare` skips hooks/LSP/plugins/auto-memory so
// the response is just the LLM's reply (no MCP tool noise).
//
// Cost / latency: 1 process per ask, ~10-30s each end-to-end. A
// full-track meeting (30 asks) takes 5-15 minutes. Phase 2.5 will
// pool long-lived sessions if this becomes a hot path.
//
// Configurable for testing — `command` and `args` can be overridden
// to point at a fixture script. A test in this repo uses a tiny
// node fixture that echoes a fixed reply to validate spawn IO
// without invoking real Claude (which would burn tokens + wall-time).

const { spawn } = require('child_process');

const DEFAULT_COMMAND = 'claude';
const DEFAULT_ARGS = Object.freeze(['-p', '--bare']);
const DEFAULT_TIMEOUT_MS = 120 * 1000;

class ClaudeBrainProvider extends BrainProvider {
  constructor(opts = {}) {
    super();
    this._command = opts.command || DEFAULT_COMMAND;
    this._extraArgs = Array.isArray(opts.args) ? opts.args.slice() : DEFAULT_ARGS.slice();
    this._timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    this._injectModel = opts.injectModel !== false; // pass --model from specialist.brain.model unless disabled
    this._effortFlag = opts.effortFlag !== false;   // pass --effort from specialist.brain.effort unless disabled
    this._env = opts.env || null;
  }

  async ask(specialist, prompt /*, context */) {
    const args = this._extraArgs.slice();
    const brain = (specialist && specialist.brain) || {};
    if (this._injectModel && typeof brain.model === 'string' && brain.model) {
      args.push('--model', brain.model);
    }
    if (this._effortFlag && typeof brain.effort === 'string' && brain.effort) {
      args.push('--effort', brain.effort);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(this._command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this._env || process.env,
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch { /* noop */ }
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* noop */ } }, 2000);
        reject(new Error(`ClaudeBrainProvider: timeout after ${this._timeoutMs}ms (specialist ${specialist && specialist.id})`));
      }, this._timeoutMs);
      child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`ClaudeBrainProvider: spawn error: ${err.message}`));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`ClaudeBrainProvider: exit ${code} (stderr: ${stderr.trim().slice(0, 400)})`));
          return;
        }
        const { vote, reason, cleaned } = parseVote(stdout);
        resolve({
          text: cleaned || stdout.trim(),
          vote,
          reason,
          rawStdout: stdout,
        });
      });
      try {
        child.stdin.write(prompt);
        child.stdin.end();
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`ClaudeBrainProvider: stdin write failed: ${err.message}`));
      }
    });
  }
}

module.exports = {
  BrainProvider,
  MockBrainProvider,
  ClaudeBrainProvider,
  buildPrompt,
  parseVote,
  VOTE_LINE,
  DEFAULT_COMMAND,
  DEFAULT_ARGS,
  DEFAULT_TIMEOUT_MS,
};
