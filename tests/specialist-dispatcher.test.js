'use strict';

// Tests for src/specialist-dispatcher.js (multi-specialist phase 1).

const assert = require('assert');

const dispatcherMod = require('../src/specialist-dispatcher');
const {
  SpecialistDispatcher,
  classifyTrack,
  scoreSpecialist,
  tokenize,
  TRACK_CAPS,
  TRACK_STAGES,
  VALID_TRACKS,
} = dispatcherMod;
const { SpecialistRegistry } = require('../src/specialist-registry');

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
  assert.strictEqual(typeof SpecialistDispatcher, 'function');
  assert.strictEqual(typeof classifyTrack, 'function');
  assert.strictEqual(typeof scoreSpecialist, 'function');
  assert.strictEqual(typeof tokenize, 'function');
  assert.deepStrictEqual([...VALID_TRACKS], ['lightweight', 'standard', 'full']);
  assert.strictEqual(TRACK_CAPS.lightweight, 2);
  assert.strictEqual(TRACK_CAPS.standard, 5);
  assert.strictEqual(TRACK_CAPS.full, 8);
  assert.deepStrictEqual(TRACK_STAGES.full, [
    'meeting', 'design', 'implement', 'review', 'audit', 'test', 'deploy', 'docs',
  ]);
});

t('tokenize lowercases + drops punctuation', () => {
  assert.deepStrictEqual(tokenize('Add API endpoint, with auth!'),
    ['add', 'api', 'endpoint', 'with', 'auth']);
  assert.deepStrictEqual(tokenize(''), []);
  assert.deepStrictEqual(tokenize(null), []);
});

t('classifyTrack: typo / one-line → lightweight', () => {
  assert.strictEqual(classifyTrack('fix typo in README'), 'lightweight');
  assert.strictEqual(classifyTrack('one-line rename of variable'), 'lightweight');
});

t('classifyTrack: auth / migration / deploy → full', () => {
  assert.strictEqual(classifyTrack('rotate auth secret'), 'full');
  assert.strictEqual(classifyTrack('add migration for users table'), 'full');
  assert.strictEqual(classifyTrack('deploy v2 to prod'), 'full');
});

t('classifyTrack: full signals beat lite signals', () => {
  // Even though "rename" is in the lite list, "auth" forces full.
  assert.strictEqual(classifyTrack('rename auth helper'), 'full');
});

t('classifyTrack: regular feature → standard', () => {
  assert.strictEqual(classifyTrack('add a new dashboard widget'), 'standard');
  assert.strictEqual(classifyTrack(''), 'standard');
});

t('explainTrack returns matched terms + reason for full track', () => {
  const { explainTrack } = require('../src/specialist-dispatcher');
  const r = explainTrack('add migration for users schema');
  assert.strictEqual(r.track, 'full');
  assert.ok(r.matched.length >= 1);
  assert.ok(r.matched.every((m) => m.list === 'full'));
  assert.ok(r.matched.some((m) => m.term === 'migration'));
  assert.match(r.reason, /irreversible\/sensitive/);
});

t('explainTrack lightweight signal beats default standard', () => {
  const { explainTrack } = require('../src/specialist-dispatcher');
  const r = explainTrack('one-line typo fix in README');
  assert.strictEqual(r.track, 'lightweight');
  assert.ok(r.matched.some((m) => m.list === 'lightweight'));
  assert.match(r.reason, /narrow-scope/);
});

t('explainTrack default standard with empty matched list when no signals', () => {
  const { explainTrack } = require('../src/specialist-dispatcher');
  const r = explainTrack('add a new dashboard widget for analytics');
  assert.strictEqual(r.track, 'standard');
  assert.deepStrictEqual(r.matched, []);
  assert.match(r.reason, /no signal keywords/);
});

t('explainTrack on empty input returns standard with empty-task reason', () => {
  const { explainTrack } = require('../src/specialist-dispatcher');
  const r = explainTrack('');
  assert.strictEqual(r.track, 'standard');
  assert.strictEqual(r.tokenCount, 0);
  assert.match(r.reason, /empty/);
});

t('SpecialistDispatcher rejects unknown track', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  assert.throws(() => d.pick({ track: 'wat' }), /unknown track/);
});

t('SpecialistDispatcher.pick on full track + design stage includes architect, dba, ux', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  const r = d.pick({
    task: 'design new schema for users table with new ui',
    stage: 'design',
    track: 'full',
  });
  const ids = r.selected.map((s) => s.id);
  assert.ok(ids.includes('architect'), `architect missing from ${ids.join(',')}`);
  assert.ok(ids.includes('dba'), `dba missing from ${ids.join(',')}`);
  assert.ok(ids.includes('ux-designer'), `ux-designer missing from ${ids.join(',')}`);
  assert.ok(r.selected.length <= TRACK_CAPS.full);
});

t('SpecialistDispatcher.pick lightweight track caps to 2', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  const r = d.pick({ task: 'fix typo in handler', stage: 'implement', track: 'lightweight' });
  assert.ok(r.selected.length <= 2, `expected ≤2, got ${r.selected.length}`);
});

t('SpecialistDispatcher.pick excludes specialists that do not list current stage', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  const r = d.pick({ task: 'discuss roadmap', stage: 'meeting', track: 'full' });
  // pm.triggers.stages includes 'meeting' so should be present.
  // backend-engineer.triggers.stages does NOT include 'meeting' so should be absent.
  const ids = r.selected.map((s) => s.id);
  assert.ok(ids.includes('pm'));
  assert.ok(!ids.includes('backend-engineer'));
});

t('SpecialistDispatcher.pick keyword bumps move strong matches to top', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  const r = d.pick({
    task: 'audit auth secret token rotation pipeline',
    stage: 'audit',
    track: 'full',
  });
  const top = r.selected[0];
  assert.strictEqual(top.id, 'security-auditor', `expected security-auditor first, got ${top.id}`);
});

t('SpecialistDispatcher.pick reserves exploration slots when more candidates than cap', () => {
  // Build a registry with 6 implement-stage specialists so a track
  // with cap=4 has surplus candidates to draw exploration from.
  const specs = [];
  for (let i = 1; i <= 6; i += 1) {
    specs.push({
      id: `spec-${i}`,
      displayName: `Spec ${i}`,
      tier: 'implement',
      domain: ['fixture'],
      brain: { adapter: 'mock' },
      systemPrompt: '[Role: Fixture] s',
      triggers: { keywords: [`kw${i}`], stages: ['implement'] },
    });
  }
  const reg = new (require('../src/specialist-registry').SpecialistRegistry)({ specialists: specs });
  const d = new SpecialistDispatcher({ registry: reg, explorationRatio: 0.5 });
  // standard track cap = 5, exploreSlots = round(5*0.5) = 3, mainSlots = 2.
  // Task hits kw1 only so spec-1 dominates; remaining 5 tie at baseline 1.
  const r = d.pick({ task: 'do kw1 thing', stage: 'implement', track: 'standard' });
  assert.ok(r.exploreSlots >= 1, `expected ≥1 explore slots, got ${r.exploreSlots}`);
  const explored = r.selected.filter((s) => s._picked === 'exploration');
  assert.ok(explored.length >= 1, `expected ≥1 exploration pick, got ${explored.length}`);
});

t('SpecialistDispatcher.pick exploration is a no-op when candidates ≤ cap', () => {
  // At 'design' stage in the seed, only architect/ux-designer/dba/
  // network-engineer (4) are eligible — fewer than the full cap 8 so
  // exploration has nothing to lift; the picker should just return
  // every candidate in score order with _picked='top'.
  const d = new SpecialistDispatcher({ explorationRatio: 0.3 });
  const r = d.pick({ task: 'design schema', stage: 'design', track: 'full' });
  assert.strictEqual(r.candidates, 4);
  assert.strictEqual(r.selected.length, 4);
  for (const s of r.selected) {
    assert.strictEqual(s._picked, 'top', `${s.id} should be 'top' when no surplus to explore`);
  }
});

t('SpecialistDispatcher.pick deterministic on tied scores (sorted by id)', () => {
  // persistPath:null bypasses the daemon's persisted overlay so
  // accumulated retro deltas from prior runs don't perturb the
  // tie-break expectation.
  const reg = new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null });
  const d = new SpecialistDispatcher({ registry: reg });
  // With no keywords, every eligible specialist scores 1 (baseline only).
  // Tie-break is by id ascending.
  const r = d.pick({ task: '', stage: 'implement', track: 'full' });
  // The first slot should be the alphabetically-earliest implement-stage specialist.
  // implement-stage specialists from the seed: backend, frontend, dba, network,
  // low-level — among those, "backend-engineer" is alphabetically first.
  const top = r.selected[0];
  assert.strictEqual(top.id, 'backend-engineer');
});

t('scoreSpecialist returns 0 when stage filter excludes', () => {
  const r = new SpecialistRegistry({ persistPath: null });
  const pm = r.get('pm');
  const score = scoreSpecialist(pm, { taskTokens: ['users'], stage: 'implement' });
  assert.strictEqual(score, 0);
});

t('scoreSpecialist gives veto roles a bump on audit/deploy stages', () => {
  const r = new SpecialistRegistry({ persistPath: null });
  const sec = r.get('security-auditor');
  const auditScore = scoreSpecialist(sec, { taskTokens: [], stage: 'audit' });
  const reviewScore = scoreSpecialist(sec, { taskTokens: [], stage: 'review' });
  // baseline 1 + veto bump 0.5 = 1.5 on audit; baseline 1 on review.
  assert.strictEqual(auditScore, 1.5);
  assert.strictEqual(reviewScore, 1);
});

t('SpecialistDispatcher.stagesForTrack + capForTrack exposed', () => {
  const d = new SpecialistDispatcher({ registry: new (require('../src/specialist-registry').SpecialistRegistry)({ persistPath: null }) });
  assert.deepStrictEqual(d.stagesForTrack('lightweight'), ['implement', 'review']);
  assert.strictEqual(d.capForTrack('full'), 8);
  assert.throws(() => d.stagesForTrack('unknown'), /unknown track/);
});

t('scoreSpecialist multiplies by persisted score signal once trusted', () => {
  // Specialist with strong positive history on its domain should
  // outrank an equivalent fresh specialist on a task that hits that
  // domain, even when the rule-side score ties.
  const reg = new (require('../src/specialist-registry').SpecialistRegistry)({
    persistPath: null,
    specialists: [
      {
        id: 'veteran',
        displayName: 'Veteran',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Veteran] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
        score: {
          byDomain: { backend: 0.9 },
          byStage: { implement: 0.9 },
          // Above SCORE_TRUST_THRESHOLD = 3
          samples: { 'domain:backend': 5, 'stage:implement': 5 },
          lastUpdated: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        id: 'rookie',
        displayName: 'Rookie',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Rookie] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
      },
    ],
  });
  const d = new SpecialistDispatcher({ registry: reg });
  const r = d.pick({ task: 'add backend api', stage: 'implement', track: 'standard' });
  // Veteran should land first thanks to the +0.9 signal multiplier.
  assert.strictEqual(r.selected[0].id, 'veteran',
    `expected veteran first, got ${r.selected.map((s) => s.id).join(',')}`);
});

t('scoreSpecialist ignores score below sample-count threshold', () => {
  // A specialist with one stellar retro shouldn't immediately
  // dominate — wait until SCORE_TRUST_THRESHOLD (3) samples.
  const reg = new (require('../src/specialist-registry').SpecialistRegistry)({
    persistPath: null,
    specialists: [
      {
        id: 'flash',
        displayName: 'Flash',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Flash] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
        score: {
          byDomain: { backend: 1.0 },
          byStage: { implement: 1.0 },
          samples: { 'domain:backend': 1, 'stage:implement': 1 }, // < threshold
          lastUpdated: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        id: 'baseline',
        displayName: 'Baseline',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Baseline] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
      },
    ],
  });
  const d = new SpecialistDispatcher({ registry: reg });
  const r = d.pick({ task: 'add backend api', stage: 'implement', track: 'standard' });
  // Tied baseline — id-sorted ascending → baseline first.
  assert.strictEqual(r.selected[0].id, 'baseline');
});

t('scoreSpecialist negative history pushes a specialist behind a rookie', () => {
  const reg = new (require('../src/specialist-registry').SpecialistRegistry)({
    persistPath: null,
    specialists: [
      {
        id: 'underperformer',
        displayName: 'Underperformer',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Underperformer] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
        score: {
          byDomain: { backend: -0.8 },
          byStage: { implement: -0.8 },
          samples: { 'domain:backend': 6, 'stage:implement': 6 },
          lastUpdated: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        id: 'rookie',
        displayName: 'Rookie',
        tier: 'implement',
        domain: ['backend'],
        brain: { adapter: 'mock' },
        systemPrompt: '[Role: Rookie] sp',
        triggers: { keywords: ['api'], stages: ['implement'] },
      },
    ],
  });
  const d = new SpecialistDispatcher({ registry: reg });
  const r = d.pick({ task: 'add backend api', stage: 'implement', track: 'standard' });
  // Rookie should beat underperformer because -0.8 → 0.6 multiplier
  // pushes a base-2 score (1+1 keyword) down to 1.2, lower than
  // rookie's straight 2.0.
  assert.strictEqual(r.selected[0].id, 'rookie');
});

t('SpecialistDispatcher accepts a custom registry', () => {
  const reg = new SpecialistRegistry({ specialists: [{
    id: 'fixture',
    displayName: 'Fixture',
    tier: 'implement',
    domain: ['anything'],
    brain: { adapter: 'mock' },
    systemPrompt: '[Role: Fixture] short',
    triggers: { keywords: ['anything'], stages: ['implement'] },
  }] });
  const d = new SpecialistDispatcher({ registry: reg });
  const r = d.pick({ task: 'anything goes', stage: 'implement', track: 'standard' });
  assert.strictEqual(r.selected.length, 1);
  assert.strictEqual(r.selected[0].id, 'fixture');
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (specialist-dispatcher)`);
  if (failed > 0) process.exit(1);
})();
