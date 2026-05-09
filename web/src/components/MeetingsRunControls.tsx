import { Play } from 'lucide-react';
import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';
import { useMeetingRun } from '../lib/use-meeting-run';

// (v1.10.556) Extracted from MeetingsView. Run controls for a
// pending meeting — brain selector + Run button + error
// message.
// (v1.10.716) busy / error / brain state + /run POST handler
// moved to lib/use-meeting-run.

interface Props {
  meetingId: string;
}

export default function MeetingsRunControls({ meetingId }: Props) {
  useLocale();

  const { busy, error, brain, setBrain, handleRun } = useMeetingRun({ meetingId });

  return (
    <>
      <label className="text-[11px] text-muted-foreground">
        {t('meetings.brain.label')}
        <select
          className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
          value={brain}
          onChange={(e) => setBrain(e.target.value as 'mock' | 'claude')}
          disabled={busy}
          aria-label={t('meetings.brain.aria')}
        >
          <option value="mock">{t('meetings.brain.mockOption')}</option>
          <option value="claude">{t('meetings.brain.claudeOption')}</option>
        </select>
      </label>
      <Button
        size="sm"
        onClick={handleRun}
        disabled={busy}
        aria-label={t('meetings.action.runMeeting')}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {t('meetings.run.button')}
      </Button>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </>
  );
}
