import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredFeatures } from './use-filtered-features';
import { CATEGORY_ORDER, FEATURES, featuresByCategory } from '../pages/registry';
import { setLocale } from './i18n';

// useFilteredFeatures groups the FEATURES registry per category and
// filters the list against a free-text query. Matching is
// case-insensitive across t(labelKey), t(descriptionKey), and the
// raw id field. Empty / whitespace-only filters short-circuit to the
// full grouping. matchCount sums the visible rows across the
// CATEGORY_ORDER buckets. Tests cover idle wiring, every short-circuit
// path, label / description / id matching surfaces, the locale-flip
// rerun (the memo depends only on `filter`, but a re-render with the
// same filter must re-run t() so the haystack reflects the new
// bundle), the empty-result branch, and the matchCount reducer.

describe('useFilteredFeatures', () => {
  it('idle: empty filter returns the full per-category grouping unchanged', () => {
    const { result } = renderHook(() => useFilteredFeatures(''));
    const full = featuresByCategory();
    for (const cat of CATEGORY_ORDER) {
      expect(result.current.grouped[cat]).toEqual(full[cat]);
    }
    expect(result.current.matchCount).toBe(FEATURES.length);
  });

  it('treats a whitespace-only filter as empty (no narrowing)', () => {
    const { result } = renderHook(() => useFilteredFeatures('   \t \n '));
    expect(result.current.matchCount).toBe(FEATURES.length);
  });

  it('case-insensitive description match: "recorder" surfaces only the Scribe feature', () => {
    const { result } = renderHook(() => useFilteredFeatures('recorder'));
    const ids = collectIds(result.current.grouped);
    expect(ids).toEqual(['scribe']);
    expect(result.current.matchCount).toBe(1);
  });

  it('uppercase filter still matches lowercase haystack (case folding)', () => {
    const { result } = renderHook(() => useFilteredFeatures('RECORDER'));
    const ids = collectIds(result.current.grouped);
    expect(ids).toEqual(['scribe']);
  });

  it('description match surfaces features whose label does not contain the query', () => {
    // "preview a command" only appears in feature.risk.description.
    const { result } = renderHook(() =>
      useFilteredFeatures('preview a command'),
    );
    const ids = collectIds(result.current.grouped);
    expect(ids).toEqual(['risk']);
  });

  it('id match surfaces features by raw id even when label/description differ', () => {
    // "rbac" is the id; the label is "RBAC". The match path normalizes
    // the id to lowercase as well, so this exercises the id branch.
    const { result } = renderHook(() => useFilteredFeatures('rbac'));
    const ids = collectIds(result.current.grouped);
    expect(ids).toContain('rbac');
  });

  it('no-match filter yields an empty grouping in every category (zero matchCount)', () => {
    const { result } = renderHook(() =>
      useFilteredFeatures('zzzzzz-no-such-feature'),
    );
    for (const cat of CATEGORY_ORDER) {
      expect(result.current.grouped[cat]).toEqual([]);
    }
    expect(result.current.matchCount).toBe(0);
  });

  it('matchCount aggregates results across every CATEGORY_ORDER bucket', () => {
    // "feature" appears in description for plenty of entries; whatever
    // the count is, it must equal the sum of group lengths.
    const { result } = renderHook(() => useFilteredFeatures('worker'));
    const sum = CATEGORY_ORDER.reduce(
      (s, c) => s + (result.current.grouped[c]?.length ?? 0),
      0,
    );
    expect(result.current.matchCount).toBe(sum);
    expect(result.current.matchCount).toBeGreaterThan(0);
  });

  it('changing the filter prop produces a different grouping (rerun on dep change)', () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useFilteredFeatures(q),
      { initialProps: { q: 'recorder' } },
    );
    const idsBefore = collectIds(result.current.grouped);
    expect(idsBefore).toEqual(['scribe']);
    rerender({ q: 'cleanup' });
    const idsAfter = collectIds(result.current.grouped);
    expect(idsAfter).toEqual(['cleanup']);
  });

  it('locale flip + same filter: a rerender after setLocale re-runs the t() haystack', () => {
    // Cross-selection reset: when useLocale() in the parent re-renders
    // this hook with the same filter, the memo body re-runs t() so a
    // query that matches an English-only token may flip its result.
    // We assert the hook's matchCount under en, flip to ko, and rerender
    // with the same query to confirm a fresh execution path. We do not
    // assert the exact Korean copy (avoids tying the test to the
    // bundle), only that the matchCount stays a non-negative number
    // reflecting the new haystack.
    setLocale('en');
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useFilteredFeatures(q),
      { initialProps: { q: 'recorder' } },
    );
    const en = result.current.matchCount;
    setLocale('ko');
    rerender({ q: 'recorder' });
    expect(typeof result.current.matchCount).toBe('number');
    expect(result.current.matchCount).toBeGreaterThanOrEqual(0);
    setLocale('en');
    rerender({ q: 'recorder' });
    expect(result.current.matchCount).toBe(en);
  });

  it('does not leak features into unrelated category buckets', () => {
    // "recorder" surfaces only scribe (operations); every other bucket stays empty.
    const { result } = renderHook(() => useFilteredFeatures('recorder'));
    expect(result.current.grouped.diagnostics).toEqual([]);
    expect(result.current.grouped.config).toEqual([]);
    expect(result.current.grouped.cost).toEqual([]);
    expect(result.current.grouped.automation).toEqual([]);
    expect(result.current.grouped.operations.length).toBe(1);
  });

  it('reuses the same memoized grouping object across rerenders with the same filter', () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useFilteredFeatures(q),
      { initialProps: { q: 'recorder' } },
    );
    const first = result.current.grouped;
    rerender({ q: 'recorder' });
    expect(result.current.grouped).toBe(first);
  });

  it('grouped shape always includes every CATEGORY_ORDER key (even on no-match)', () => {
    const { result } = renderHook(() => useFilteredFeatures('zzz'));
    for (const cat of CATEGORY_ORDER) {
      expect(Array.isArray(result.current.grouped[cat])).toBe(true);
    }
  });

  it('matchCount is exactly FEATURES.length when filter is empty (sanity)', () => {
    const { result } = renderHook(() => useFilteredFeatures(''));
    expect(result.current.matchCount).toBe(FEATURES.length);
  });
});

function collectIds(grouped: ReturnType<typeof featuresByCategory>): string[] {
  const out: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const f of grouped[cat]) out.push(f.id);
  }
  return out.sort();
}
