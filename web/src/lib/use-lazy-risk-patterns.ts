import { useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.727) Extracted from RiskRuleCatalogPanel.
// The risk-pattern catalog is sizeable — operators
// who never expand the panel should not pay for the
// fetch. The hook owns the cached `patterns` state
// and the lazy-load effect that fires the first
// time `open` flips true. Subsequent opens are no-op
// (cache survives until unmount). Errors are
// silently swallowed; the panel just stays empty.

interface PatternEntry {
  code: string;
  label: string;
}

export interface PatternsResponse {
  builtin: {
    critical: PatternEntry[];
    high: PatternEntry[];
    medium: PatternEntry[];
  };
  custom: {
    critical: unknown[];
    high: unknown[];
    medium: unknown[];
  };
  counts: {
    builtin: { critical: number; high: number; medium: number; total: number };
    custom: { critical: number; high: number; medium: number; total: number };
  };
  allowList: number;
  denyList: number;
}

export function useLazyRiskPatterns(args: { open: boolean }): PatternsResponse | null {
  const { open } = args;
  const [patterns, setPatterns] = useState<PatternsResponse | null>(null);

  useEffect(() => {
    if (!open || patterns) return;
    apiGet<PatternsResponse>('/api/risk/patterns')
      .then((res) => setPatterns(res))
      .catch(() => { /* silent — panel just stays empty */ });
  }, [open, patterns]);

  return patterns;
}
