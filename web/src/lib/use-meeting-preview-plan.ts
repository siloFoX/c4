import { useEffect, useState } from 'react';
import { apiPost } from './api';

// (v1.10.648) Extracted from MeetingsComposer. Debounced
// (400ms) POST /api/meetings/plan dispatcher preview that
// shows the roster-size / estimated-tokens / consensus
// policy in the composer drawer. Track is forwarded only
// when the user has explicitly picked one — `auto` keeps
// the planner free to choose.

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
  newTrack: 'auto' | 'lightweight' | 'standard' | 'full';
}): PreviewPlanState {
  const { open, newTask, newTrack } = args;
  const [previewPlan, setPreviewPlan] = useState<PreviewPlan | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  useEffect(() => {
    if (!open || !newTask.trim()) {
      setPreviewPlan(null);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const body: { task: string; track?: string } = { task: newTask.trim() };
        if (newTrack !== 'auto') body.track = newTrack;
        const res = await apiPost<PreviewPlan>('/api/meetings/plan', body);
        setPreviewPlan(res);
      } catch {
        setPreviewPlan(null);
      } finally {
        setPreviewBusy(false);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [open, newTask, newTrack]);
  return { previewPlan, previewBusy };
}
