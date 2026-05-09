import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.704) Extracted from MeetingsStateActions. The
// state-machine action dispatcher — POSTs
// /api/meetings/:id/<action> for the five lifecycle
// transitions (start / advance / next-round /
// escalate / abort). Optional confirm prompt fires a
// `window.confirm` gate; busy slot tracks which action
// is currently in flight so the parent can disable the
// row while one is running.

export type MeetingAction =
  | 'start'
  | 'advance'
  | 'next-round'
  | 'escalate'
  | 'abort';

interface MeetingStateActionState {
  busy: MeetingAction | null;
  error: string | null;
  fire: (action: MeetingAction, confirm?: string) => Promise<void>;
}

export function useMeetingStateAction(args: {
  meetingId: string;
}): MeetingStateActionState {
  const { meetingId } = args;
  const [busy, setBusy] = useState<MeetingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fire = useCallback(async (action: MeetingAction, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(action);
    setError(null);
    try {
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/${action}`, {});
    } catch (e) {
      setError(tFormat('meetings.state.failed', {
        action,
        error: (e as Error).message || t('common.unknown'),
      }));
    } finally {
      setBusy(null);
    }
  }, [meetingId]);

  return { busy, error, fire };
}
