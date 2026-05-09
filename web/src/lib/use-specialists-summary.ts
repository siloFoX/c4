import { useSilentPoll } from './use-silent-poll';

// (v1.10.725) Extracted from SpecialistsSummaryBar.
// Phase-6.14 organism summary fetch — self-polls
// every 30s, silently swallows errors so a degraded
// daemon (older build, network blip) just hides the
// bar instead of surfacing a noisy error.
// (v1.10.743) Polling shape lifted to lib/use-silent-poll.

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
  return useSilentPoll<OrganismSummary>('/api/specialists/summary', POLL_INTERVAL_MS);
}
