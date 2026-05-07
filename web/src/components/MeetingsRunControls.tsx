import { useCallback, useState } from 'react';
import { Play } from 'lucide-react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { t, useLocale } from '../lib/i18n';

// (v1.10.556) Extracted from MeetingsView. Run controls for a
// pending meeting — brain selector + Run button + error
// message. Owns its own busy / error / brain state and the
// /run POST. Relies on the parent's SSE detail subscription to
// reflect turn / advance / terminal events as the orchestrator
// drives the meeting.

interface Props {
  meetingId: string;
}

export default function MeetingsRunControls({ meetingId }: Props) {
  useLocale();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brain, setBrain] = useState<'mock' | 'claude'>('mock');

  const handleRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/run`, {
        brain,
        autoFinalize: true,
      });
      // The SSE detail subscription will pick up turn / advance /
      // terminal events as the orchestrator drives the meeting,
      // so we don't manually refetch here.
    } catch (e) {
      setError((e as Error).message || t('common.failedToStartMeeting'));
    } finally {
      setBusy(false);
    }
  }, [brain, meetingId]);

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
