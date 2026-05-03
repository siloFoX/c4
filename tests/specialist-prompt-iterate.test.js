'use strict';

// Tests for src/specialist-prompt-iterate.js (multi-specialist phase 5.1).

const assert = require('assert');

const { SpecialistRegistry } = require('../src/specialist-registry');
const {
  analyzeSpecialist,
  detectUnderperformers,
  DEFAULT_NEGATIVE_THRESHOLD,
  DEFAULT_MIN_SAMPLES,
} = require('../src/specialist-prompt-iterate');

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
    id: 'fixture',
    displayName: 'Fixture',
    tier: 'implement',
    domain: ['fixture'],
    brain: { adapter: 'mock' },
    systemPrompt: '[Role: Fixture] sp',
    triggers: { keywords: ['fixture'], stages: ['implement'] },
    score: { byDomain: {}, byStage: {}, samples: {}, lastUpdated: null },
    ...overrides,
  };
}

t('module exports surface', () => {
  assert.strictEqual(typeof analyzeSpecialist, 'function');
  assert.strictEqual(typeof detectUnderperformers, 'function');
  assert.strictEqual(DEFAULT_NEGATIVE_THRESHOLD, -0.3);
  assert.strictEqual(DEFAULT_MIN_SAMPLES, 5);
});

t('analyzeSpecialist returns null when no buckets cross threshold', () => {
  const spec = fixtureSpec({
    score: {
      byDomain: { fixture: 0.5 },
      byStage: { implement: 0.2 },
      samples: { 'domain:fixture': 10, 'stage:implement': 10 },
      lastUpdated: '2026-05-03T00:00:00.000Z',
    },
  });
  assert.strictEqual(analyzeSpecialist(spec), null);
});

t('analyzeSpecialist returns null when sample count below threshold', () => {
  // Even with a very negative score, < 5 samples should NOT flag.
  const spec = fixtureSpec({
    score: {
      byDomain: { fixture: -1.0 },
      byStage: { implement: -1.0 },
      samples: { 'domain:fixture': 2, 'stage:implement': 2 },
      lastUpdated: '2026-05-03T00:00:00.000Z',
    },
  });
  assert.strictEqual(analyzeSpecialist(spec), null);
});

t('analyzeSpecialist flags both domain + stage when both cross threshold', () => {
  const spec = fixtureSpec({
    score: {
      byDomain: { fixture: -0.6 },
      byStage: { implement: -0.4 },
      samples: { 'domain:fixture': 8, 'stage:implement': 8 },
      lastUpdated: '2026-05-03T00:00:00.000Z',
    },
  });
  const r = analyzeSpecialist(spec);
  assert.ok(r);
  assert.strictEqual(r.flaggedDomains.length, 1);
  assert.strictEqual(r.flaggedStages.length, 1);
  assert.strictEqual(r.deepestBucket.kind, 'domain');
  assert.strictEqual(r.deepestBucket.score, -0.6);
  assert.ok(r.recommendation.includes('fixture'));
});

t('analyzeSpecialist deepestBucket is the most-negative score', () => {
  const spec = fixtureSpec({
    score: {
      byDomain: { a: -0.4, b: -0.9 },
      byStage: { implement: -0.5 },
      samples: { 'domain:a': 6, 'domain:b': 6, 'stage:implement': 6 },
      lastUpdated: '2026-05-03T00:00:00.000Z',
    },
  });
  const r = analyzeSpecialist(spec);
  assert.strictEqual(r.deepestBucket.name, 'b');
  assert.strictEqual(r.deepestBucket.score, -0.9);
});

t('analyzeSpecialist respects custom thresholds', () => {
  const spec = fixtureSpec({
    score: {
      byDomain: { fixture: -0.1 },
      byStage: {},
      samples: { 'domain:fixture': 10 },
      lastUpdated: '2026-05-03T00:00:00.000Z',
    },
  });
  // Default threshold -0.3 → not flagged.
  assert.strictEqual(analyzeSpecialist(spec), null);
  // Stricter threshold 0 → flagged.
  const r = analyzeSpecialist(spec, { negativeThreshold: 0 });
  assert.ok(r);
  assert.strictEqual(r.flaggedDomains.length, 1);
});

t('detectUnderperformers requires a registry', () => {
  assert.throws(() => detectUnderperformers(null), /registry is required/);
  assert.throws(() => detectUnderperformers({}), /registry is required/);
});

t('detectUnderperformers returns empty items list on a fresh seed', () => {
  // persistPath:null prevents loading the dev daemon's accumulated
  // overlay (which may have negative entries already).
  const reg = new SpecialistRegistry({ persistPath: null });
  const r = detectUnderperformers(reg);
  assert.strictEqual(r.total, 13);
  assert.strictEqual(r.flagged, 0);
  assert.deepStrictEqual(r.items, []);
});

t('detectUnderperformers sorts items by deepest score ascending', () => {
  const reg = new SpecialistRegistry({
    persistPath: null,
    specialists: [
      {
        id: 'mild', displayName: 'Mild', tier: 'implement', domain: ['x'],
        brain: { adapter: 'mock' }, systemPrompt: '[Role: Mild] sp',
        triggers: { keywords: ['x'], stages: ['implement'] },
        score: { byDomain: { x: -0.4 }, byStage: {}, samples: { 'domain:x': 10 }, lastUpdated: null },
      },
      {
        id: 'severe', displayName: 'Severe', tier: 'implement', domain: ['x'],
        brain: { adapter: 'mock' }, systemPrompt: '[Role: Severe] sp',
        triggers: { keywords: ['x'], stages: ['implement'] },
        score: { byDomain: { x: -0.9 }, byStage: {}, samples: { 'domain:x': 10 }, lastUpdated: null },
      },
      {
        id: 'mid', displayName: 'Mid', tier: 'implement', domain: ['x'],
        brain: { adapter: 'mock' }, systemPrompt: '[Role: Mid] sp',
        triggers: { keywords: ['x'], stages: ['implement'] },
        score: { byDomain: { x: -0.6 }, byStage: {}, samples: { 'domain:x': 10 }, lastUpdated: null },
      },
    ],
  });
  const r = detectUnderperformers(reg);
  assert.strictEqual(r.flagged, 3);
  assert.deepStrictEqual(r.items.map((i) => i.id), ['severe', 'mid', 'mild']);
});

(async () => {
  for (const fn of pending) await fn();
  console.log(`\n  ${passed} passed, ${failed} failed (specialist-prompt-iterate)`);
  if (failed > 0) process.exit(1);
})();
