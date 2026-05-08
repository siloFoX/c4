import { useEffect, useState } from 'react';
import { apiGet, eventSourceUrl } from './api';
import { t } from './i18n';
import type { MeetingDetail, MeetingStatus } from '../components/MeetingsView';

// (v1.10.625) Extracted from MeetingsView. Phase 7.1 SSE detail
// stream — no initial REST fetch (the first `event: snapshot`
// already carries the full payload). Subsequent `state` events
// trigger a cheap GET to merge in any non-snapshotted data.
// `terminal` event triggers a final fetch. Returns detail +
// detailError + streaming. Caller can also push detail edits
// via the returned setDetail (e.g. immediate-state badge).

interface DetailStream {
  detail: MeetingDetail | null;
  detailError: string | null;
  streaming: boolean;
}

export function useMeetingDetailStream(selectedId: string | null): DetailStream {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setStreaming(false);
      return undefined;
    }
    setDetailError(null);
    setDetail(null);
    let es: EventSource | null = null;
    try {
      es = new EventSource(eventSourceUrl(`/api/meetings/${encodeURIComponent(selectedId)}/stream`));
    } catch (e) {
      setDetailError((e as Error).message || t('common.failedToOpenMeetingStream'));
      return undefined;
    }
    setStreaming(true);
    es.addEventListener('snapshot', (ev) => {
      try {
        const snap = JSON.parse((ev as MessageEvent).data) as MeetingDetail;
        setDetail(snap);
      } catch { /* ignore malformed frame */ }
    });
    es.addEventListener('state', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data) as {
          event: string;
          payload: Record<string, unknown>;
          status: MeetingStatus;
          ts: string;
        };
        // Re-fetch on every state change — payloads are too varied
        // (turn / vote / advance) to merge surgically here. The
        // /api/meetings/:id GET is cheap and the cadence is bounded
        // by actual state transitions, so this is fine.
        apiGet<MeetingDetail>(`/api/meetings/${encodeURIComponent(selectedId)}`)
          .then((d) => setDetail(d))
          .catch(() => { /* swallow — UI keeps last snapshot */ });
        // Update status quickly without waiting for the GET.
        setDetail((prev) => (prev ? { ...prev, status: frame.status } : prev));
      } catch { /* ignore */ }
    });
    es.addEventListener('terminal', () => {
      apiGet<MeetingDetail>(`/api/meetings/${encodeURIComponent(selectedId)}`)
        .then((d) => setDetail(d))
        .catch(() => { /* swallow */ });
    });
    es.onerror = () => { setStreaming(false); };
    es.onopen = () => setStreaming(true);
    return () => {
      try { es && es.close(); } catch { /* noop */ }
      setStreaming(false);
    };
  }, [selectedId]);

  return { detail, detailError, streaming };
}
