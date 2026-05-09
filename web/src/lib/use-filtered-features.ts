import { useMemo } from 'react';
import { CATEGORY_ORDER, featuresByCategory, type FeatureDef } from '../pages/registry';
import { t } from './i18n';

// (v1.10.735) Extracted from FeatureSidebar. The
// per-category grouping memo + the matched-count
// reducer used by the sidebar's empty-state copy.
// Keeping `t()` calls inside the memo means a locale
// flip causes the haystack to be re-translated and
// the filter re-applied automatically — useLocale()
// in the parent triggers the re-render that runs
// this hook.

type FeaturesByCategory = ReturnType<typeof featuresByCategory>;

export interface UseFilteredFeaturesState {
  grouped: FeaturesByCategory;
  matchCount: number;
}

export function useFilteredFeatures(filter: string): UseFilteredFeaturesState {
  const grouped = useMemo<FeaturesByCategory>(() => {
    const all = featuresByCategory();
    if (!filter.trim()) return all;
    const q = filter.toLowerCase();
    const out: FeaturesByCategory = {
      operations: [], automation: [], cost: [], config: [], diagnostics: [],
    };
    for (const cat of CATEGORY_ORDER) {
      out[cat] = all[cat].filter((f: FeatureDef) =>
        t(f.labelKey).toLowerCase().includes(q) ||
        t(f.descriptionKey).toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q),
      );
    }
    return out;
  }, [filter]);

  const matchCount = CATEGORY_ORDER.reduce((s, c) => s + (grouped[c]?.length || 0), 0);

  return { grouped, matchCount };
}
