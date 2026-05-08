import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

// (v1.10.649) Extracted from MeetingsComposer. Loads the
// saved-template list when the composer opens and exposes
// a manual `refresh()` for the template editor's
// on-saved/on-deleted callbacks. The on-open fetch carries
// a `cancelled` race guard so a fast close→open→close
// sequence cannot stamp a stale list back onto state.

export interface MeetingTemplate {
  name: string;
  task: string;
  track?: string | null;
  description?: string | null;
}

interface MeetingTemplatesState {
  templates: MeetingTemplate[];
  refresh: () => Promise<void>;
}

export function useMeetingTemplates(args: {
  open: boolean;
}): MeetingTemplatesState {
  const { open } = args;
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ templates: MeetingTemplate[] }>('/api/meetings/templates');
      setTemplates(res.templates || []);
    } catch { /* best-effort */ }
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    apiGet<{ templates: MeetingTemplate[] }>('/api/meetings/templates')
      .then((res) => { if (!cancelled) setTemplates(res.templates || []); })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [open]);
  return { templates, refresh };
}
