'use strict';

// Tests for src/specialist-registry.js (multi-specialist phase 1).

const assert = require('assert');
const path = require('path');

const mod = require('../src/specialist-registry');
const {
  SpecialistRegistry,
  loadSeed,
  validateSpecialist,
  normalizeSpecialist,
  VALID_TIERS,
  VALID_PROBATION_STATES,
  SEED_PATH,
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

function fixtureSpec(overrides = {}) {
  return {
    id: 'fixture-engineer',
    displayName: 'Fixture Engineer',
    tier: 'implement',
    domain: ['fixture'],
    brain: { adapter: 'mock', model: 'sonnet', effort: 'high' },
    systemPrompt: '[Role: Fixture] just fixture',
    triggers: { keywords: ['fixture'], stages: ['implement'] },
    deliverables: ['fixture.diff'],
    ...overrides,
  };
}

t('module exports surface', () => {
  assert.strictEqual(typeof SpecialistRegistry, 'function');
  assert.strictEqual(typeof loadSeed, 'function');
  assert.strictEqual(typeof validateSpecialist, 'function');
  assert.strictEqual(typeof normalizeSpecialist, 'function');
  assert.ok(Array.isArray(VALID_TIERS));
  assert.ok(VALID_TIERS.includes('meeting'));
  assert.ok(VALID_TIERS.includes('docs'));
  assert.ok(Array.isArray(VALID_PROBATION_STATES));
  assert.strictEqual(typeof SEED_PATH, 'string');
  assert.ok(path.isAbsolute(SEED_PATH));
});

t('seed loads cleanly and contains the 13 starter specialists', () => {
  const loaded = loadSeed();
  assert.strictEqual(loaded.specialists.length, 13);
  const ids = loaded.specialists.map((s) => s.id).sort();
  // Spot-check the expected set instead of demanding exact order.
  for (const expected of [
    'pm', 'architect', 'ux-designer',
    'backend-engineer', 'frontend-engineer', 'dba', 'devops-sre',
    'code-reviewer', 'security-auditor', 'qa-engineer', 'tech-writer',
    'network-engineer', 'low-level-engineer',
  ]) {
    assert.ok(ids.includes(expected), `seed missing ${expected}`);
  }
});

t('every seed specialist passes validation + has a non-empty system prompt', () => {
  const loaded = loadSeed();
  for (const s of loaded.specialists) {
    assert.doesNotThrow(() => validateSpecialist(s, s.id));
    assert.ok(s.systemPrompt.startsWith('[Role:'), `${s.id} systemPrompt should start with [Role:`);
    assert.ok(s.systemPrompt.length > 30, `${s.id} systemPrompt too short`);
  }
});

t('veto roles match §10 decision (security-auditor + devops-sre)', () => {
  const loaded = loadSeed();
  const veto = loaded.specialists.filter((s) => s.vetoPower).map((s) => s.id).sort();
  assert.deepStrictEqual(veto, ['devops-sre', 'security-auditor']);
});

t('validateSpecialist rejects bad ids', () => {
  assert.throws(() => validateSpecialist(fixtureSpec({ id: 'BadID' })), /lowercase-kebab/);
  assert.throws(() => validateSpecialist(fixtureSpec({ id: '1bad' })), /lowercase-kebab/);
  assert.throws(() => validateSpecialist(fixtureSpec({ id: '' })), /non-empty/);
});

t('validateSpecialist rejects unknown tier and unknown trigger stage', () => {
  assert.throws(() => validateSpecialist(fixtureSpec({ tier: 'magic' })), /tier/);
  assert.throws(() => validateSpecialist(fixtureSpec({
    triggers: { keywords: ['x'], stages: ['ritual'] },
  })), /invalid stage/);
});

t('validateSpecialist rejects empty domain + missing brain.adapter', () => {
  assert.throws(() => validateSpecialist(fixtureSpec({ domain: [] })), /domain/);
  assert.throws(() => validateSpecialist(fixtureSpec({
    brain: { model: 'sonnet' },
  })), /brain.adapter/);
});

t('validateSpecialist rejects non-string deliverables when present', () => {
  assert.throws(() => validateSpecialist(fixtureSpec({ deliverables: [42] })), /deliverables/);
});

t('SpecialistRegistry constructor loads seed by default', () => {
  const r = new SpecialistRegistry();
  assert.strictEqual(r.size, 13);
  assert.ok(r.has('pm'));
  assert.ok(!r.has('does-not-exist'));
  const pm = r.get('pm');
  assert.strictEqual(pm.tier, 'meeting');
  assert.ok(pm.domain.includes('scope'));
});

t('SpecialistRegistry list() returns defensive copies', () => {
  const r = new SpecialistRegistry();
  const list = r.list();
  list[0].displayName = 'tampered';
  const fresh = r.list();
  assert.notStrictEqual(fresh[0].displayName, 'tampered');
});

t('SpecialistRegistry filter by tier / domain / stage / vetoOnly', () => {
  const r = new SpecialistRegistry();
  const designStage = r.filter({ stage: 'design' }).map((s) => s.id);
  assert.ok(designStage.includes('architect'));
  assert.ok(designStage.includes('ux-designer'));
  // pm.triggers.stages = ['meeting'] only — should not show in design stage.
  assert.ok(!designStage.includes('pm'));

  const auditTier = r.filter({ tier: 'audit' }).map((s) => s.id);
  assert.deepStrictEqual(auditTier, ['security-auditor']);

  const vetoOnly = r.filter({ vetoOnly: true }).map((s) => s.id).sort();
  assert.deepStrictEqual(vetoOnly, ['devops-sre', 'security-auditor']);

  const dataDomain = r.filter({ domain: 'data' }).map((s) => s.id);
  assert.ok(dataDomain.includes('dba'));
});

t('SpecialistRegistry add/remove (in-memory governance)', () => {
  const r = new SpecialistRegistry({ specialists: [fixtureSpec()] });
  assert.strictEqual(r.size, 1);
  const added = r.add(fixtureSpec({ id: 'second', displayName: 'Second' }));
  assert.strictEqual(added.id, 'second');
  assert.strictEqual(r.size, 2);
  // Duplicate id should throw.
  assert.throws(() => r.add(fixtureSpec()), /already exists/);
  assert.strictEqual(r.remove('fixture-engineer'), true);
  assert.strictEqual(r.remove('fixture-engineer'), false);
  assert.strictEqual(r.size, 1);
});

t('SpecialistRegistry constructor accepts inline specialists', () => {
  const r = new SpecialistRegistry({ specialists: [fixtureSpec(), fixtureSpec({ id: 'pair' })] });
  assert.strictEqual(r.size, 2);
  assert.ok(r.has('pair'));
});

t('normalizeSpecialist initializes empty score record + defaults', () => {
  const norm = normalizeSpecialist(fixtureSpec());
  assert.deepStrictEqual(norm.score, { byDomain: {}, byStage: {}, samples: {}, lastUpdated: null });
  assert.strictEqual(norm.probation, 'stable');
  assert.strictEqual(norm.vetoPower, false);
  assert.deepStrictEqual(norm.deliverables, ['fixture.diff']);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (specialist-registry)`);
  if (failed > 0) process.exit(1);
})();
