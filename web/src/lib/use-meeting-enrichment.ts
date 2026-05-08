import { useEffect, useMemo, useState } from 'react';
import { apiGet } from './api';
import type { MeetingDetail } from '../components/MeetingsView';
import type { LineageResponse } from '../components/MeetingsLineageStrip';
import type { ActionItemsResponse } from '../components/MeetingsActionItemsPanel';
import type { RecapResponse } from '../components/MeetingsRecapPanel';

// (v1.10.624) Extracted from MeetingsView. Phase 6.5/6.9/6.10
// detail enrichment fetches — lineage runs once per selection
// change, action-items + recap run on selection AND when the
// transcript changes (detail.transcripts length sum). All three
// silently null on failure — UI treats them as best-effort
// decoration.

interface Enrichment {
  lineage: LineageResponse | null;
  actions: ActionItemsResponse | null;
  recap: RecapResponse | null;
}

export function useMeetingEnrichment(args: {
  selectedId: string | null;
  detail: MeetingDetail | null;
}): Enrichment {
  const { selectedId, detail } = args;
  const [lineage, setLineage] = useState<LineageResponse | null>(null);
  const [actions, setActions] = useState<ActionItemsResponse | null>(null);
  const [recap, setRecap] = useState<RecapResponse | null>(null);

  // (Phase 6.9) Fetch lineage when selection changes. Cheap (1 row
  // for non-fork meetings, depth-many rows otherwise). Failures
  // silently set null — no need to surface as a hard error.
  useEffect(() => {
    if (!selectedId) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    apiGet<LineageResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/lineage`)
      .then((res) => { if (!cancelled) setLineage(res); })
      .catch(() => { if (!cancelled) setLineage(null); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // (Phase 6.5) Action-items re-run when transcript length changes.
  const turnsTotal = useMemo(() => {
    if (!detail) return 0;
    return (detail.transcripts || []).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
  }, [detail]);

  useEffect(() => {
    if (!selectedId) {
      setActions(null);
      return;
    }
    let cancelled = false;
    apiGet<ActionItemsResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/action-items`)
      .then((res) => { if (!cancelled) setActions(res); })
      .catch(() => { if (!cancelled) setActions(null); });
    return () => { cancelled = true; };
  }, [selectedId, turnsTotal]);

  // (Phase 6.10) Recap — same dep pattern as action-items.
  useEffect(() => {
    if (!selectedId) {
      setRecap(null);
      return;
    }
    let cancelled = false;
    apiGet<RecapResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/recap`)
      .then((res) => { if (!cancelled) setRecap(res); })
      .catch(() => { if (!cancelled) setRecap(null); });
    return () => { cancelled = true; };
  }, [selectedId, turnsTotal]);

  return { lineage, actions, recap };
}
