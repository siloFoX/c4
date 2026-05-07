import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.552) Extracted from MeetingsView. Phase-2.6 retro
// preview / finalize buttons that sit in the post-terminal
// action bar. Owns its own busy / result / error state + the
// POST handler. Renders nothing when there's no meetingId
// to act on (parent gates visibility on terminal status).

interface RetroResult {
  deltas?: Record<string, unknown>;
  applied?: boolean;
  skipped?: boolean;
  note?: string;
}

interface Props {
  meetingId: string;
}

export default function MeetingsRetroActions({ meetingId }: Props) {
  useLocale();

  const [busy, setBusy] = useState<'preview' | 'finalize' | null>(null);
  const [result, setResult] = useState<RetroResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on meeting change so a previous meeting's preview
  // doesn't bleed into the next one.
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

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleRetro(false)}
        disabled={busy !== null}
        aria-label={t('meetings.retroPreviewLabel')}
        title={t('meetings.tooltip.retroPreview')}
        className="h-6 px-2 text-[10px]"
      >
        {busy === 'preview' ? '…' : t('meetings.retroPreview')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleRetro(true)}
        disabled={busy !== null}
        aria-label={t('meetings.finalizeLabel')}
        title={t('meetings.tooltip.finalize')}
        className="h-6 px-2 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
      >
        {busy === 'finalize' ? '…' : t('meetings.finalize')}
      </Button>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
      {result ? (
        <span className="text-[11px] text-muted-foreground" title={JSON.stringify(result)}>
          retro: {result.applied
            ? 'applied'
            : result.skipped
            ? `skipped${result.note ? ` (${result.note})` : ''}`
            : result.deltas
            ? `${Object.keys(result.deltas).length} delta(s)`
            : 'ok'}
        </span>
      ) : null}
    </>
  );
}
