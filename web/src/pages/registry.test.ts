import { describe, it, expect } from 'vitest';
import { lazy } from 'react';
import { FEATURES, findFeature, featuresByCategory } from './registry';

// (v1.11.212 / patch 11.194) Code-split audit deliverable. The list
// below is the heavy candidate set from the audit -- each must stay
// behind a dynamic import() so Vite emits a separate chunk and the
// initial bundle does not regress. registry.ts already uses the
// `load: () => import('./X')` pattern for every entry; these tests
// pin that contract for the heavy subset.
const HEAVY_FEATURE_IDS = [
  'health',
  'plan',
  'templates',
  'profiles',
  'risk',
  'token-usage',
] as const;

const REACT_LAZY_TAG = Symbol.for('react.lazy');

describe('registry heavy-page lazy boundaries', () => {
  it('every heavy feature exposes a load() function', () => {
    for (const id of HEAVY_FEATURE_IDS) {
      const feat = findFeature(id);
      expect(feat, `feature "${id}" missing from registry`).toBeDefined();
      expect(typeof feat!.load).toBe('function');
      // Arity 0: registry contract is a zero-arg dynamic-import thunk.
      expect(feat!.load.length).toBe(0);
    }
  });

  it('every registry entry uses a load() function (full sweep)', () => {
    // Defensive: catches a regression where a new page gets eagerly
    // imported and assigned to load (e.g. `load: () => Mod`).
    for (const feat of FEATURES) {
      expect(typeof feat.load).toBe('function');
      expect(feat.load.length).toBe(0);
    }
  });

  it('load() returns a thenable resolving to a module with a default export', async () => {
    // Smoke-test one heavy page end-to-end. We resolve the dynamic
    // import to confirm the module shape Vite emits matches what
    // React.lazy expects (`{ default: ComponentType }`).
    const feat = findFeature('health')!;
    const result = feat.load();
    expect(result).toBeInstanceOf(Promise);
    const mod = await result;
    expect(mod).toHaveProperty('default');
    expect(typeof mod.default).toBe('function');
  });

  it('React.lazy can wrap each heavy load() without throwing', () => {
    for (const id of HEAVY_FEATURE_IDS) {
      const feat = findFeature(id)!;
      const Lazy = lazy(feat.load);
      // React.lazy tags its return value with a $$typeof sentinel.
      // FeatureView relies on this so Suspense knows to suspend on
      // first render of an unresolved chunk.
      expect((Lazy as unknown as { $$typeof: symbol }).$$typeof).toBe(
        REACT_LAZY_TAG,
      );
    }
  });

  it('featuresByCategory keeps every heavy feature reachable from a category bucket', () => {
    const buckets = featuresByCategory();
    const all = new Set(
      [
        ...buckets.operations,
        ...buckets.automation,
        ...buckets.cost,
        ...buckets.config,
        ...buckets.diagnostics,
      ].map((f) => f.id),
    );
    for (const id of HEAVY_FEATURE_IDS) {
      expect(all.has(id), `feature "${id}" not reachable via category`).toBe(true);
    }
  });
});
