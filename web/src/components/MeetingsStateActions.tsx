import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useMeetingStateAction } from '../lib/use-meeting-state-action';

// (v1.10.555) Extracted from MeetingsView. State-machine
// controls that drive a meeting's lifecycle:
//
//   - mode='pending'      → just the "Start manual" button
//   - mode='in-progress'  → advance / next-round / escalate /
//                           abort buttons
//
// Each variant owns its own busy / error state. The handler
// POSTs to /api/meetings/:id/{action} and surfaces transient
// errors inline.

// (v1.10.704) Action union + state + fire dispatcher
// moved to lib/use-meeting-state-action.

interface Props {
  meetingId: string;
  mode: 'pending' | 'in-progress';
}

export default function MeetingsStateActions({ meetingId, mode }: Props) {
  useLocale();

  const { busy, error, fire } = useMeetingStateAction({ meetingId });

  if (mode === 'pending') {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fire('start')}
          disabled={busy !== null}
          aria-label={t('meetings.contribute.start.label')}
          title={t('meetings.tooltip.startManual')}
        >
          {busy === 'start' ? '…' : t('meetings.startManual')}
        </Button>
        {error ? (
          <span className="text-[11px] text-destructive">{error}</span>
        ) : null}
      </>
    );
  }

  // mode === 'in-progress'
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => fire('advance')}
        disabled={busy !== null}
        aria-label={t('meetings.contribute.advance.label')}
        title={t('meetings.tooltip.advance')}
      >
        {busy === 'advance' ? '…' : t('meetings.advance')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => fire('next-round')}
        disabled={busy !== null}
        aria-label={t('meetings.contribute.bumpRound.label')}
        title={t('meetings.tooltip.nextRound')}
      >
        {busy === 'next-round' ? '…' : t('meetings.nextRound')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => fire('escalate', t('meetings.escalateConfirm'))}
        disabled={busy !== null}
        aria-label={t('meetings.contribute.escalate.label')}
      >
        {busy === 'escalate' ? '…' : t('meetings.escalate')}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => fire('abort', t('meetings.abortConfirm'))}
        disabled={busy !== null}
        aria-label={t('meetings.contribute.abort.label')}
      >
        {busy === 'abort' ? '…' : t('meetings.abort')}
      </Button>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </>
  );
}
