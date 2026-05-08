import { useEffect, useState } from 'react';
import { apiGet } from './api';
import type { AuditEntry, MeetingMeta } from '../components/SpecialistsView';

// (v1.10.634) Extracted from SpecialistsView. Phase 6.8 detail
// enrichment — fetch /api/specialists/:id?include=audit,meetings
// when the selected id changes. Cheap, silent on failure.
// Returns the response object (or null when no selection /
// in flight / failed).

interface Enrichment {
  recentAudit?: AuditEntry[];
  recentMeetings?: MeetingMeta[];
}

export function useSpecialistEnrichment(
  selectedId: string | null,
): Enrichment | null {
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  useEffect(() => {
    if (!selectedId) {
      setEnrichment(null);
      return;
    }
    let cancelled = false;
    apiGet<Enrichment>(
      `/api/specialists/${encodeURIComponent(selectedId)}?include=audit,meetings`,
    )
      .then((res) => {
        if (cancelled) return;
        const next: Enrichment = {};
        if (res.recentAudit !== undefined) next.recentAudit = res.recentAudit;
        if (res.recentMeetings !== undefined) next.recentMeetings = res.recentMeetings;
        setEnrichment(next);
      })
      .catch(() => { if (!cancelled) setEnrichment(null); });
    return () => { cancelled = true; };
  }, [selectedId]);
  return enrichment;
}
