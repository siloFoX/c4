import { useMemo, useState } from 'react';
import type { Specialist } from '../components/SpecialistsView';

// (v1.10.678) Extracted from SpecialistsView. Owns the
// three filter slots (text query / tier filter /
// veto-only toggle) and the memoized filter pipeline.
// (Phase 8.4) Whitespace-separated tokens AND-compose
// across id / displayName / domain / triggers.keywords
// AND the systemPrompt body — same axes as the
// backend's searchByText() but client-side because the
// registry is bounded.

interface SpecialistFilterState {
  filter: string;
  setFilter: (next: string) => void;
  tierFilter: string;
  setTierFilter: (next: string) => void;
  vetoOnly: boolean;
  setVetoOnly: (next: boolean) => void;
  filtered: Specialist[];
}

export function useSpecialistFilter(args: {
  specialists: Specialist[];
}): SpecialistFilterState {
  const { specialists } = args;
  const [filter, setFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('any');
  const [vetoOnly, setVetoOnly] = useState(false);

  const filtered = useMemo(() => {
    const tokens = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return specialists.filter((s) => {
      if (vetoOnly && !s.vetoPower) return false;
      if (tierFilter !== 'any' && s.tier !== tierFilter) return false;
      if (tokens.length === 0) return true;
      const haystack = [
        s.id,
        s.displayName,
        s.systemPrompt || '',
        ...(Array.isArray(s.domain) ? s.domain : []),
        ...(s.triggers && s.triggers.keywords ? s.triggers.keywords : []),
      ].join(' ').toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [specialists, filter, tierFilter, vetoOnly]);

  return {
    filter, setFilter,
    tierFilter, setTierFilter,
    vetoOnly, setVetoOnly,
    filtered,
  };
}
