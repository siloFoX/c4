'use strict';

// Tests for src/meeting-orchestrator.js + src/meeting-brain.js
// (multi-specialist phase 2.3).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { MeetingOrchestrator } = require('../src/meeting-orchestrator');
const {
  BrainProvider,
  MockBrainProvider,
  buildPrompt,
  parseVote,
} = require('../src/meeting-brain');

let passed = 0;
let failed = 0;
const pending = [];
function t(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS  ${label}`);
    } catch (err) {
      failed += 1;
      console.log(`  FAIL  ${label}\n        ${err.message}`);
      if (err.stack) console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  });
}

t('module surface', () => {
  assert.strictEqual(typeof MeetingOrchestrator, 'function');
  assert.strictEqual(typeof BrainProvider, 'function');
  assert.strictEqual(typeof MockBrainProvider, 'function');
  assert.strictEqual(typeof buildPrompt, 'function');
  assert.strictEqual(typeof parseVote, 'function');
});

t('parseVote handles accept / object / no-vote / aliases', () => {
  assert.deepStrictEqual(parseVote('looks good [VOTE: accept]'),
    { vote: 'accept', reason: null, cleaned: 'looks good' });
  assert.deepStrictEqual(parseVote('hold on [VOTE: object — kms missing]'),
    { vote: 'object', reason: 'kms missing', cleaned: 'hold on' });
  // Alias
  assert.deepStrictEqual(parseVote('approved [VOTE: approve]').vote, 'accept');
  assert.deepStrictEqual(parseVote('no good [VOTE: reject]').vote, 'object');
  assert.deepStrictEqual(parseVote('plain text no marker'),
    { vote: null, reason: null, cleaned: 'plain text no marker' });
  assert.deepStrictEqual(parseVote(null),
    { vote: null, reason: null, cleaned: '' });
});

t('buildPrompt includes system prompt + task + stage marker', () => {
  const specialist = {
    id: 'tester',
    systemPrompt: '[Role: Tester] write tests',
  };
  const ctx = {
    plan: { task: 'add login', track: 'standard' },
    currentStage: 'design',
    currentRound: 2,
    transcriptSoFar: [],
    lastView: { objects: [] },
  };
  const prompt = buildPrompt(specialist, ctx);
  assert.ok(prompt.includes('[Role: Tester]'));
  assert.ok(prompt.includes('add login'));
  assert.ok(prompt.includes('design'));
  assert.ok(prompt.includes('round 2'));
  assert.ok(prompt.includes('[VOTE: accept]'));
});

t('buildPrompt surfaces outstanding objections', () => {
  const specialist = { id: 'a', systemPrompt: 'sp' };
  const ctx = {
    plan: { task: 't', track: 'full' },
    currentStage: 'audit',
    currentRound: 2,
    transcriptSoFar: [{ stage: 'audit', round: 1, specialistId: 'b', text: 'hmm' }],
    lastView: { objects: [{ id: 'b', reason: 'missing kms' }] },
  };
  const prompt = buildPrompt(specialist, ctx);
  assert.ok(prompt.includes('Outstanding objections'));
  assert.ok(prompt.includes('missing kms'));
});

t('MockBrainProvider default behavior accepts most stages', async () => {
  const brain = new MockBrainProvider();
  const reply = await brain.ask(
    { id: 'backend-engineer', systemPrompt: 'sp', vetoPower: false },
    'prompt',
    { currentStage: 'implement', currentRound: 1 },
  );
  assert.strictEqual(reply.vote, 'accept');
  assert.ok(/VOTE: accept/.test(reply.text));
});

t('MockBrainProvider veto roles object on round 1 of audit/deploy', async () => {
  const brain = new MockBrainProvider();
  const r = await brain.ask(
    { id: 'security-auditor', vetoPower: true, systemPrompt: 'sp' },
    'p',
    { currentStage: 'audit', currentRound: 1 },
  );
  assert.strictEqual(r.vote, 'object');
});

t('MockBrainProvider scripted responses override defaults', async () => {
  const brain = new MockBrainProvider({
    script: {
      'pm': async () => ({ text: 'scripted reply', vote: 'accept', reason: null }),
    },
  });
  const reply = await brain.ask(
    { id: 'pm', systemPrompt: 'sp' },
    'p',
    { currentStage: 'meeting', currentRound: 1 },
  );
  assert.strictEqual(reply.text, 'scripted reply');
});

t('MeetingOrchestrator constructor validates inputs', () => {
  assert.throws(() => new MeetingOrchestrator({}), /session is required/);
  const sess = new MeetingSession(planMeeting({ task: 'x' }));
  assert.throws(() => new MeetingOrchestrator({ session: sess }), /brain/);
  assert.throws(() => new MeetingOrchestrator({ session: sess, brain: {} }), /brain/);
});

t('MeetingOrchestrator runs lightweight track to completion', async () => {
  const plan = planMeeting({ task: 'fix typo in handler' });
  const sess = new MeetingSession(plan);
  const brain = new MockBrainProvider();
  const orch = new MeetingOrchestrator({ session: sess, brain });
  const final = await orch.run();
  assert.strictEqual(final.status, 'completed');
  assert.ok(orch.totalAsks >= 2, `expected ≥2 asks, got ${orch.totalAsks}`);
});

t('MeetingOrchestrator: full-track auth task escalates on round cap when veto persists', async () => {
  const plan = planMeeting({ task: 'rotate auth secret in production' });
  const sess = new MeetingSession(plan);
  // Force security-auditor to keep objecting forever.
  const brain = new MockBrainProvider({
    script: {
      'security-auditor': async () => ({
        text: 'still concerned [VOTE: object — perpetual]',
        vote: 'object',
        reason: 'perpetual',
      }),
    },
  });
  const orch = new MeetingOrchestrator({ session: sess, brain, maxAsks: 500 });
  const final = await orch.run();
  // Either escalates on this stage or somewhere down the line — we
  // do not advance through audit without security-auditor accept.
  assert.ok(['escalated', 'completed'].includes(final.status), `got ${final.status}`);
  if (final.status === 'completed') {
    // Sanity: if it somehow completed, the security auditor's last
    // vote on its eligible stages must have flipped to accept (which
    // can't happen with our perpetual mock). So failure path expected.
    throw new Error('expected escalation when security-auditor objects forever');
  }
  assert.strictEqual(final.status, 'escalated');
});

t('MeetingOrchestrator emits turn / advance / complete events', async () => {
  const plan = planMeeting({ task: 'fix typo in handler' });
  const sess = new MeetingSession(plan);
  const brain = new MockBrainProvider();
  const orch = new MeetingOrchestrator({ session: sess, brain });
  const events = [];
  orch.on('turn', (p) => events.push({ event: 'turn', specialist: p.specialistId }));
  orch.on('advance', (p) => events.push({ event: 'advance', adv: p.advanced }));
  orch.on('complete', () => events.push({ event: 'complete' }));
  await orch.run();
  assert.ok(events.some((e) => e.event === 'turn'), 'expected turn events');
  assert.ok(events.some((e) => e.event === 'advance'), 'expected advance events');
  assert.ok(events.some((e) => e.event === 'complete'), 'expected complete event');
});

t('MeetingOrchestrator respects maxAsks loop guard', async () => {
  const plan = planMeeting({ task: 'rotate auth secret in production' });
  const sess = new MeetingSession(plan);
  // Always object — meeting can never complete naturally.
  const brain = new MockBrainProvider({
    script: Object.fromEntries(
      ['pm', 'architect', 'tech-writer', 'security-auditor', 'devops-sre',
       'backend-engineer', 'frontend-engineer', 'dba', 'network-engineer',
       'low-level-engineer', 'code-reviewer', 'qa-engineer', 'ux-designer'
      ].map((id) => [id, async () => ({
        text: `${id} objects [VOTE: object — perpetual]`,
        vote: 'object',
        reason: 'perpetual',
      })]),
    ),
  });
  const orch = new MeetingOrchestrator({ session: sess, brain, maxAsks: 5 });
  const final = await orch.run();
  assert.strictEqual(final.status, 'escalated');
  assert.ok(orch.totalAsks <= 5, `expected ≤5 asks, got ${orch.totalAsks}`);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-orchestrator)`);
  if (failed > 0) process.exit(1);
})();
