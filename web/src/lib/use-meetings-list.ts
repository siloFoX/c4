import { useCallback, useEffect, useState } from 'react';
import { apiGet, eventSourceUrl } from './api';
import { t } from './i18n';
import type { MeetingStatus, MeetingsListResponse } from '../components/MeetingsView';
import type { Track } from '../components/MeetingsSearchFacets';

// (v1.10.626) Extracted from MeetingsView. Owns the
// /api/meetings list — initial load, listStatus/listTrack
// filter composition, the global SSE list stream
// (/api/meetings/stream) that triggers a refetch on every
// state-transition / add / remove event, plus a 90s fallback
// poll for the case where SSE is blocked by a proxy.

interface MeetingsList {
  data: MeetingsListResponse | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useMeetingsList(args: {
  listStatus: MeetingStatus | '';
  listTrack: Track | '';
}): MeetingsList {
  const { listStatus, listTrack } = args;
  const [data, setData] = useState<MeetingsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (listStatus) params.set('status', listStatus);
      if (listTrack) params.set('track', listTrack);
      const url = params.toString() ? `/api/meetings?${params.toString()}` : '/api/meetings';
      const res = await apiGet<MeetingsListResponse>(url);
      setData(res);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadMeetings'));
    } finally {
      setLoading(false);
    }
  }, [listStatus, listTrack]);

  useEffect(() => { refresh(); }, [refresh]);

  // (v1.10.353) Global SSE list stream — every meeting state
  // transition + meeting-added / meeting-removed events. Drops
  // the periodic refresh poll to a fallback (90s) since the
  // stream covers the live case. Falls back gracefully when the
  // daemon doesn't expose the stream (older versions): the stream
  // never opens and the poll keeps running.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(eventSourceUrl('/api/meetings/stream'));
      es.onmessage = () => refresh();
      es.onerror = () => { /* SSE auto-reconnects */ };
    } catch {
      /* ignore — EventSource may be blocked in some browsers */
    }
    const id = window.setInterval(refresh, 90_000);
    return () => {
      if (es) es.close();
      window.clearInterval(id);
    };
  }, [refresh]);

  return { data, error, loading, refresh };
}
