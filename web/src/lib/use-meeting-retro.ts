import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.717) Extracted from MeetingsRetroActions. The
// Phase-2.6 retro / finalize state machine — busy
// (preview | finalize | null) + result + error +
// handleRetro(finalize) + a meeting-change reset
// effect so a previous meeting's preview doesn't
// bleed into the next selection.

export interface RetroResult {
  deltas?: Record<string, unknown>;
  applied?: boolean;
  skipped?: boolean;
  note?: string;
}

export interface MeetingRetroState {
  busy: 'preview' | 'finalize' | null;
  result: RetroResult | null;
  error: string | null;
  handleRetro: (finalize: boolean) => Promise<void>;
}

export function useMeetingRetro(args: { meetingId: string }): MeetingRetroState {
  const { meetingId } = args;
  const [busy, setBusy] = useState<'preview' | 'finalize' | null>(null);
  const [result, setResult] = useState<RetroResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [meetingId]);

  const handleRetro = useCallback(async (finalize: boolean) => {
    setBusy(finalize ? 'finalize' : 'preview');
    setError(null);
    setResult(null);
    try {
      const path = finalize ? 'finalize' : 'retro';
      const res = await apiPost<RetroResult>(
        `/api/meetings/${encodeURIComponent(meetingId)}/${path}`,
        {},
      );
      setResult(res || { note: 'no payload' });
    } catch (e) {
      setError(tFormat(
        finalize ? 'meetings.finalize.failed' : 'meetings.retro.failed',
        { error: (e as Error).message || t('common.unknown') },
      ));
    } finally {
      setBusy(null);
    }
  }, [meetingId]);

  return { busy, result, error, handleRetro };
}
