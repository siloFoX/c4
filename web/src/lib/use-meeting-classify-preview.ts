import { useEffect, useState } from 'react';
import { apiGet } from './api';
import type { Track } from '../components/MeetingsSearchFacets';

// (v1.10.647) Extracted from MeetingsComposer. Debounced
// (250ms) GET /api/meetings/classify-track preview for the
// track radio. Auto-clears when the composer closes or the
// task input goes empty so the next open starts clean.
//
// (v1.10.778) ClassifyPreview.track adopts the strict Track
// alias (the daemon classifies into one of the three real
// tracks; 'auto' is a UI-only request marker).

export interface ClassifyPreview {
  track: Track;
  matched: Array<{ list: string; term: string }>;
  reason: string;
}

export function useMeetingClassifyPreview(args: {
  open: boolean;
  newTask: string;
}): ClassifyPreview | null {
  const { open, newTask } = args;
  const [classifyPreview, setClassifyPreview] = useState<ClassifyPreview | null>(null);
  useEffect(() => {
    if (!open || !newTask.trim()) {
      setClassifyPreview(null);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ task: newTask.trim() });
        const res = await apiGet<ClassifyPreview>(`/api/meetings/classify-track?${qs.toString()}`);
        setClassifyPreview(res);
      } catch {
        setClassifyPreview(null);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, newTask]);
  return classifyPreview;
}
