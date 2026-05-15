import { useEffect, useState } from 'react';
import { apiPost } from './api';
import { useDebounce } from '../hooks/use-debounce';
import type { MeetingTrackOrAuto } from '../components/MeetingsSearchFacets';

// (v1.10.648) Extracted from MeetingsComposer. Debounced
// (400ms) POST /api/meetings/plan dispatcher preview that
// shows the roster-size / estimated-tokens / consensus
// policy in the composer drawer. Track is forwarded only
// when the user has explicitly picked one — `auto` keeps
// the planner free to choose.
//
// (v1.10.778) `newTrack` shape adopts MeetingTrackOrAuto
// from MeetingsSearchFacets — was a 4-literal duplicate.

export interface PreviewPlan {
  track: string;
  rosterSize: number;
  estimatedTokens: number;
  consensusPolicy: { mode: string; roundCap: number; allowVeto: boolean };
  stages: Array<{ stage: string; specialists: Array<{ id: string }> }>;
}

interface PreviewPlanState {
  previewPlan: PreviewPlan | null;
  previewBusy: boolean;
}

export function useMeetingPreviewPlan(args: {
  open: boolean;
  newTask: string;
  newTrack: MeetingTrackOrAuto;
}): PreviewPlanState {
  const { open, newTask, newTrack } = args;
  const [previewPlan, setPreviewPlan] = useState<PreviewPlan | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // (v1.11.230) Inline setTimeout replaced by useDebounce.
  // 400ms trailing-edge semantics preserved.
  const debouncedTask = useDebounce(newTask, 400);
  const debouncedTrack = useDebounce(newTrack, 400);
  useEffect(() => {
    const trimmed = debouncedTask.trim();
    if (!open || !trimmed) {
      setPreviewPlan(null);
      return;
    }
    setPreviewBusy(true);
    (async () => {
      try {
        const body: { task: string; track?: string } = { task: trimmed };
        if (debouncedTrack !== 'auto') body.track = debouncedTrack;
        const res = await apiPost<PreviewPlan>('/api/meetings/plan', body);
        setPreviewPlan(res);
      } catch {
        setPreviewPlan(null);
      } finally {
        setPreviewBusy(false);
      }
    })();
  }, [open, debouncedTask, debouncedTrack]);
  return { previewPlan, previewBusy };
}
