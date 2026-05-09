import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useMeetingRetro } from '../lib/use-meeting-retro';

// (v1.10.552) Extracted from MeetingsView. Phase-2.6 retro
// preview / finalize buttons that sit in the post-terminal
// action bar. Renders nothing when there's no meetingId to
// act on (parent gates visibility on terminal status).
// (v1.10.717) busy / result / error state + POST handler
// moved to lib/use-meeting-retro.

interface Props {
  meetingId: string;
}

export default function MeetingsRetroActions({ meetingId }: Props) {
  useLocale();

  const { busy, result, error, handleRetro } = useMeetingRetro({ meetingId });

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
