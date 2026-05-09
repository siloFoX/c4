import { useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.725) Extracted from SpecialistsSummaryBar.
// Phase-6.14 organism summary fetch — self-polls
// every 30s, silently swallows errors so a degraded
// daemon (older build, network blip) just hides the
// bar instead of surfacing a noisy error. Returns
// `null` until the first successful poll.

export interface OrganismSummary {
  registry: { count: number; vetoCount: number };
  meetings: { total: number; recent24h: number };
  scores: { specialistsWithSamples: number; underperformerCount: number };
  persist?: {
    enabled: boolean;
    dbSizeBytes?: number | null;
    rowCount?: number | null;
    auditLog?: { bytes?: number | null; entries?: number | null };
    lastKnownGood?: { exists: boolean; ageDays?: number | null };
  };
}

const POLL_INTERVAL_MS = 30000;

export function useSpecialistsSummary(): OrganismSummary | null {
  const [summary, setSummary] = useState<OrganismSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = () => {
      apiGet<OrganismSummary>('/api/specialists/summary')
        .then((res) => { if (!cancelled) setSummary(res); })
        .catch(() => { /* silently degrade — info bar just hides */ });
    };
    fetchSummary();
    const id = window.setInterval(fetchSummary, POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return summary;
}
