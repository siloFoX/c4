'use strict';

// Tests for src/specialist-proposal.js (multi-specialist phase 1.5).

const assert = require('assert');

const { SpecialistRegistry, resetShared } = require('../src/specialist-registry');
const { resetShared: resetMeetingStore } = require('../src/meeting-session');
const { proposeSpecialist, _buildProposalTask, _decideFromMeeting } = require('../src/specialist-proposal');

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

function fixtureCandidate(overrides = {}) {
  return {
    id: 'data-engineer',
    displayName: 'Data Engineer',
    tier: 'implement',
    domain: ['data', 'pipeline'],
    brain: { adapter: 'mock' },
    systemPrompt: '[Role: Data Engineer] You build pipelines.',
    triggers: { keywords: ['etl', 'pipeline'], stages: ['design', 'implement'] },
    ...overrides,
  };
}

t('module exports surface', () => {
  assert.strictEqual(typeof proposeSpecialist, 'function');
  assert.strictEqual(typeof _buildProposalTask, 'function');
  assert.strictEqual(typeof _decideFromMeeting, 'function');
});

t('_buildProposalTask embeds candidate id + role + prompt + voting hints', () => {
  const c = fixtureCandidate();
  const task = _buildProposalTask(c);
  assert.match(task, /data-engineer/);
  assert.match(task, /Data Engineer/);
  assert.match(task, /\[Role: Data Engineer\]/);
  assert.match(task, /Vote accept/);
  assert.match(task, /Vote object/);
  assert.match(task, /implement/);
});

t('proposeSpecialist rejects null candidate', async () => {
  resetMeetingStore();
  await assert.rejects(proposeSpecialist(null), /candidate required/);
});

t('proposeSpecialist rejects when candidate id already exists', async () => {
  resetMeetingStore();
  const reg = new SpecialistRegistry({ persistPath: null });
  // 'pm' is in the seed.
  await assert.rejects(
    proposeSpecialist({ ...fixtureCandidate(), id: 'pm' }, { registry: reg }),
    /already exists/);
});

t('proposeSpecialist with mock brain accepts via consensus + adds to registry', async () => {
  resetMeetingStore();
  const reg = new SpecialistRegistry({ persistPath: null });
  const before = reg.size;
  const r = await proposeSpecialist(fixtureCandidate(), {
    registry: reg,
    brain: 'mock',
  });
  assert.strictEqual(r.candidateId, 'data-engineer');
  assert.strictEqual(r.added, true, 'mock brain accepts → registry adds');
  assert.strictEqual(reg.size, before + 1);
  assert.ok(reg.has('data-engineer'));
});

t('proposeSpecialist autoApply:false leaves registry untouched', async () => {
  resetMeetingStore();
  const reg = new SpecialistRegistry({ persistPath: null });
  const before = reg.size;
  const r = await proposeSpecialist(fixtureCandidate(), {
    registry: reg,
    brain: 'mock',
    autoApply: false,
  });
  assert.strictEqual(r.added, false);
  assert.strictEqual(reg.size, before, 'autoApply:false → no mutation');
  assert.ok(!reg.has('data-engineer'));
});

t('_decideFromMeeting recognizes objections as rejection', () => {
  // Synthesize a session JSON with objections to exercise the
  // decider without spinning a full orchestrator.
  const fakeSession = {
    toJSON() {
      return {
        id: 'm-fake',
        status: 'escalated',
        stages: [{
          stage: 'implement',
          consensus: {
            accepts: ['a'],
            objects: [{ id: 'b', reason: 'duplicate' }],
            missing: [],
            reached: false,
          },
        }],
      };
    },
  };
  const d = _decideFromMeeting(fakeSession);
  assert.strictEqual(d.accepted, false);
  assert.deepStrictEqual(d.accepts, ['a']);
  assert.match(d.reason, /escalated|objections/);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (specialist-proposal)`);
  if (failed > 0) process.exit(1);
})();
