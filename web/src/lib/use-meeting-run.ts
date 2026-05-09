import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';

// (v1.10.716) Extracted from MeetingsRunControls. The
// `/run` POST + busy / error / brain state slots that
// drive a pending meeting's start. The SSE detail
// subscription owned by MeetingsView picks up
// turn / advance / terminal events as the orchestrator
// drives the meeting, so this hook does not refetch.

export interface MeetingRunState {
  busy: boolean;
  error: string | null;
  brain: 'mock' | 'claude';
  setBrain: (next: 'mock' | 'claude') => void;
  handleRun: () => Promise<void>;
}

export function useMeetingRun(args: { meetingId: string }): MeetingRunState {
  const { meetingId } = args;
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
    } catch (e) {
      setError((e as Error).message || t('common.failedToStartMeeting'));
    } finally {
      setBusy(false);
    }
  }, [brain, meetingId]);

  return { busy, error, brain, setBrain, handleRun };
}
