'use strict';

// Tests for src/meeting-retro.js (multi-specialist phase 4.1).

const assert = require('assert');

const { planMeeting } = require('../src/meeting-plan');
const { MeetingSession } = require('../src/meeting-session');
const { MeetingOrchestrator } = require('../src/meeting-orchestrator');
const { MockBrainProvider } = require('../src/meeting-brain');
const { SpecialistRegistry } = require('../src/specialist-registry');
const {
  computeRetroDeltas,
  applyRetroDeltas,
  SIGNAL_BY_OUTCOME_AND_VOTE,
  DEFAULT_ALPHA,
} = require('../src/meeting-retro');

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

t('module exports surface', () => {
  assert.strictEqual(typeof computeRetroDeltas, 'function');
  assert.strictEqual(typeof applyRetroDeltas, 'function');
  assert.strictEqual(typeof DEFAULT_ALPHA, 'number');
  assert.strictEqual(SIGNAL_BY_OUTCOME_AND_VOTE.completed.accept, 1.0);
  assert.strictEqual(SIGNAL_BY_OUTCOME_AND_VOTE.escalated.object, 0.5);
});

t('computeRetroDeltas refuses non-terminal sessions', () => {
  const sess = new MeetingSession(planMeeting({ task: 'fix typo' }));
  assert.throws(() => computeRetroDeltas(sess), /must be terminal/);
});

t('completed lightweight meeting → +1 accept signal for each speaker', async () => {
  const reg = new SpecialistRegistry();
  const sess = new MeetingSession(planMeeting({ task: 'fix typo in handler', registry: reg }));
  const brain = new MockBrainProvider();
  const orch = new MeetingOrchestrator({ session: sess, brain });
  await orch.run();
  assert.strictEqual(sess.status, 'completed');

  const retro = computeRetroDeltas(sess, { registry: reg });
  assert.strictEqual(retro.outcome, 'completed');
  // backend-engineer is the DRI of both lightweight stages.
  assert.ok(retro.deltas['backend-engineer'], 'backend-engineer should have deltas');
  // accept on both stages → both byStage entries should be 1.0
  const dStage = retro.deltas['backend-engineer'].byStage;
  for (const v of Object.values(dStage)) {
    assert.strictEqual(v, 1.0, 'every stage signal should be the +1 accept value');
  }
});

t('escalated meeting → +0.5 for steadfast objector, -0.25 for accept rollovers', async () => {
  const reg = new SpecialistRegistry();
  const sess = new MeetingSession(planMeeting({ task: 'rotate auth secret in production', registry: reg }));
  // Force security-auditor to forever object so meeting escalates.
  const brain = new MockBrainProvider({
    script: {
      'security-auditor': async () => ({
        text: 'still concerned [VOTE: object — perpetual]',
        vote: 'object', reason: 'perpetual',
      }),
    },
  });
  const orch = new MeetingOrchestrator({ session: sess, brain, maxAsks: 500 });
  await orch.run();
  assert.strictEqual(sess.status, 'escalated');

  const retro = computeRetroDeltas(sess, { registry: reg });
  assert.strictEqual(retro.outcome, 'escalated');
  const audit = retro.deltas['security-auditor'];
  assert.ok(audit, 'security-auditor should have deltas');
  // It objected on every stage it spoke in; the average byStage signal
  // should be +0.5 (escalated + object).
  for (const v of Object.values(audit.byStage)) {
    assert.strictEqual(v, 0.5);
  }
  // Other speakers who voted accept on stages before escalation get -0.25.
  const others = Object.entries(retro.deltas).filter(([id]) => id !== 'security-auditor');
  let foundNegative = false;
  for (const [, d] of others) {
    for (const v of Object.values(d.byStage)) {
      if (v < 0) { foundNegative = true; break; }
    }
    if (foundNegative) break;
  }
  assert.ok(foundNegative, 'expected some accept-rollover specialists with negative byStage');
});

t('aborted meeting → all signals zero', () => {
  const sess = new MeetingSession(planMeeting({ task: 'test' }));
  sess.start();
  // Get to a recorded contribution then abort.
  const stage = sess.plan.stages[0];
  sess.contribute(stage.specialists[0].id, 'hi', { vote: 'accept' });
  sess.abort('test');
  const retro = computeRetroDeltas(sess);
  for (const d of Object.values(retro.deltas)) {
    for (const v of Object.values(d.byStage)) assert.strictEqual(v, 0);
  }
});

t('applyRetroDeltas blends new signal with prior via exponential smoothing', () => {
  const reg = new SpecialistRegistry();
  // Pre-seed the score for backend-engineer so blending is testable.
  reg._byId.get('backend-engineer').score = {
    byDomain: { backend: 0.5 },
    byStage: { implement: 0.5 },
    samples: {},
    lastUpdated: '2026-04-01T00:00:00.000Z',
  };
  const fakeRetro = {
    sessionId: 'm-test',
    outcome: 'completed',
    deltas: {
      'backend-engineer': {
        contribution: 1,
        stagesParticipated: ['implement'],
        byStage: { implement: 1.0 },
        byDomain: { backend: 1.0 },
        samples: { 'stage:implement': 1, 'domain:backend': 1 },
      },
    },
  };
  const applied = applyRetroDeltas(reg, fakeRetro, { alpha: 0.5 });
  // Blend: 0.5 * 0.5 + 1.0 * 0.5 = 0.75
  const after = applied['backend-engineer'].after;
  assert.strictEqual(after.byStage.implement, 0.75);
  assert.strictEqual(after.byDomain.backend, 0.75);
  // Sample counts incremented.
  assert.strictEqual(after.samples['stage:implement'], 1);
  // Persisted to registry.
  const fresh = reg.get('backend-engineer');
  assert.strictEqual(fresh.score.byStage.implement, 0.75);
});

t('applyRetroDeltas seeds score when no prior exists', () => {
  const reg = new SpecialistRegistry();
  // Default seed score is empty — first apply should land verbatim.
  const fakeRetro = {
    sessionId: 'm-test',
    outcome: 'completed',
    deltas: {
      pm: {
        contribution: 1,
        stagesParticipated: ['meeting'],
        byStage: { meeting: 1.0 },
        byDomain: { scope: 1.0 },
        samples: { 'stage:meeting': 1, 'domain:scope': 1 },
      },
    },
  };
  applyRetroDeltas(reg, fakeRetro);
  const fresh = reg.get('pm');
  assert.strictEqual(fresh.score.byStage.meeting, 1.0);
  assert.strictEqual(fresh.score.byDomain.scope, 1.0);
  assert.strictEqual(fresh.score.samples['stage:meeting'], 1);
});

t('applyRetroDeltas skips unknown specialists silently', () => {
  const reg = new SpecialistRegistry();
  const fakeRetro = {
    sessionId: 'm-test',
    outcome: 'completed',
    deltas: { 'ghost-engineer': { byStage: {}, byDomain: {}, samples: {} } },
  };
  // Should not throw.
  const applied = applyRetroDeltas(reg, fakeRetro);
  assert.strictEqual(Object.keys(applied).length, 0);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-retro)`);
  if (failed > 0) process.exit(1);
})();
