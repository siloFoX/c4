'use strict';

// Tests for src/meeting-plan.js (multi-specialist phase 2.1).

const assert = require('assert');

const mod = require('../src/meeting-plan');
const {
  planMeeting,
  estimateTokens,
  defaultMeetingTitle,
  newMeetingId,
  CONSENSUS_POLICY,
} = mod;

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
  assert.strictEqual(typeof planMeeting, 'function');
  assert.strictEqual(typeof estimateTokens, 'function');
  assert.strictEqual(typeof defaultMeetingTitle, 'function');
  assert.strictEqual(typeof newMeetingId, 'function');
  assert.strictEqual(typeof CONSENSUS_POLICY, 'object');
  assert.strictEqual(CONSENSUS_POLICY.lightweight.mode, 'dri');
  assert.strictEqual(CONSENSUS_POLICY.standard.mode, 'quorum');
  assert.strictEqual(CONSENSUS_POLICY.full.mode, 'consensus');
  assert.strictEqual(CONSENSUS_POLICY.full.allowVeto, true);
});

t('newMeetingId returns m-<hex> shape', () => {
  const id = newMeetingId();
  assert.match(id, /^m-[0-9a-f]{12}$/);
  // Two consecutive ids should differ — randomness sanity check.
  assert.notStrictEqual(id, newMeetingId());
});

t('defaultMeetingTitle truncates long task strings', () => {
  assert.strictEqual(defaultMeetingTitle(''), 'untitled meeting');
  assert.strictEqual(defaultMeetingTitle('short task'), 'short task');
  const longTask = 'a'.repeat(200);
  const title = defaultMeetingTitle(longTask);
  assert.ok(title.length <= 60, `expected ≤60 chars, got ${title.length}`);
  assert.ok(title.endsWith('…'));
});

t('planMeeting requires a non-empty task', () => {
  assert.throws(() => planMeeting({}), /task is required/);
  assert.throws(() => planMeeting({ task: '   ' }), /task is required/);
});

t('planMeeting rejects unknown track', () => {
  assert.throws(() => planMeeting({ task: 'do work', track: 'magic' }), /unknown track/);
});

t('planMeeting on a generic task → standard track, 5 stages', () => {
  const plan = planMeeting({ task: 'add a new dashboard widget' });
  assert.strictEqual(plan.track, 'standard');
  assert.strictEqual(plan.inferredTrack, true);
  assert.strictEqual(plan.stages.length, 5);
  const stages = plan.stages.map((s) => s.stage);
  assert.deepStrictEqual(stages, ['design', 'implement', 'review', 'test', 'docs']);
});

t('planMeeting on auth+secret task → full track, 8 stages, includes audit', () => {
  const plan = planMeeting({ task: 'rotate auth secret in production' });
  assert.strictEqual(plan.track, 'full');
  assert.strictEqual(plan.stages.length, 8);
  const auditStage = plan.stages.find((s) => s.stage === 'audit');
  assert.ok(auditStage, 'audit stage missing');
  const auditIds = auditStage.specialists.map((sp) => sp.id);
  assert.ok(auditIds.includes('security-auditor'),
    `expected security-auditor in audit stage, got ${auditIds.join(',')}`);
});

t('planMeeting on typo task → lightweight track, 2 stages', () => {
  const plan = planMeeting({ task: 'fix typo in handler' });
  assert.strictEqual(plan.track, 'lightweight');
  assert.deepStrictEqual(plan.stages.map((s) => s.stage), ['implement', 'review']);
});

t('planMeeting respects explicit track override', () => {
  const plan = planMeeting({ task: 'fix typo', track: 'full' });
  assert.strictEqual(plan.track, 'full');
  assert.strictEqual(plan.inferredTrack, false);
  assert.strictEqual(plan.stages.length, 8);
});

t('planMeeting consensusPolicy matches the chosen track', () => {
  const lite = planMeeting({ task: 'fix typo' });
  assert.strictEqual(lite.consensusPolicy.mode, 'dri');
  assert.strictEqual(lite.consensusPolicy.allowVeto, false);

  const full = planMeeting({ task: 'rotate auth' });
  assert.strictEqual(full.consensusPolicy.mode, 'consensus');
  assert.strictEqual(full.consensusPolicy.allowVeto, true);
});

t('planMeeting deliverables aggregated per stage from selected specialists', () => {
  const plan = planMeeting({ task: 'add a new dashboard widget' });
  const designStage = plan.stages.find((s) => s.stage === 'design');
  // architect always lands at design stage; its deliverables include adr/<n>-<slug>.md
  assert.ok(designStage.deliverables.length > 0, 'design stage missing deliverables');
  assert.ok(designStage.deliverables.some((d) => d.startsWith('adr/')),
    `expected ADR deliverable, got ${designStage.deliverables.join(',')}`);
});

t('planMeeting rosterSize counts unique specialists across all stages', () => {
  const plan = planMeeting({ task: 'redesign auth flow' });
  // Most-frequent picks repeat across stages; rosterSize should be smaller
  // than the sum of per-stage counts.
  const totalPerStage = plan.stages.reduce((acc, s) => acc + s.specialists.length, 0);
  assert.ok(plan.rosterSize <= totalPerStage,
    `rosterSize ${plan.rosterSize} should ≤ sum-per-stage ${totalPerStage}`);
  assert.ok(plan.rosterSize >= 1);
});

t('estimateTokens returns positive integer scaling with roster + rounds', () => {
  const stagesA = [{ specialists: [{ id: 'a' }] }];
  const stagesB = [{ specialists: [{ id: 'a' }, { id: 'b' }] }];
  const a = estimateTokens(stagesA, 3);
  const b = estimateTokens(stagesB, 3);
  assert.ok(b > a, 'more specialists should cost more tokens');
  const c = estimateTokens(stagesA, 5);
  assert.ok(c > a, 'more rounds should cost more tokens');
  assert.ok(Number.isFinite(a) && a > 0);
});

t('planMeeting overrideCap clamps every stage', () => {
  const plan = planMeeting({ task: 'rotate auth secret', overrideCap: 2 });
  for (const s of plan.stages) {
    assert.ok(s.specialists.length <= 2, `${s.stage} has ${s.specialists.length} > cap 2`);
  }
});

t('planMeeting accepts custom title + meetingId', () => {
  const plan = planMeeting({ task: 'do thing', title: 'Custom Title', meetingId: 'm-aaaaaaaaaaaa' });
  assert.strictEqual(plan.title, 'Custom Title');
  assert.strictEqual(plan.meetingId, 'm-aaaaaaaaaaaa');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (meeting-plan)`);
  if (failed > 0) process.exit(1);
})();
