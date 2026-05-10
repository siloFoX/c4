import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import { useAutoClearMessage } from './use-auto-clear-message';

// (v1.10.718) Extracted from MeetingsPeerRetroControls.
// The peer-rating POST + busy / msg / failed / brain
// state slots that drive a terminal meeting's
// peer-retro pass. Auto-clears the success toast
// after 6 seconds; failure persists until the next
// run.
//
// (v1.10.765) Banner state moved to shared infra
// hook lib/use-auto-clear-message; 6s duration
// passed per-call.

interface PeerRetroResponse {
  peer: {
    raters: string[];
    ratees: string[];
    raw: Array<{ rater: string; ratee: string; rating: number }>;
  };
  applied: Record<string, unknown> | null;
}

export interface MeetingPeerRetroState {
  busy: boolean;
  msg: string | null;
  failed: boolean;
  brain: 'mock' | 'claude';
  setBrain: (next: 'mock' | 'claude') => void;
  handlePeerRetro: () => Promise<void>;
}

export function useMeetingPeerRetro(args: { meetingId: string }): MeetingPeerRetroState {
  const { meetingId } = args;
  const [busy, setBusy] = useState(false);
  const { msg, failed, setSuccess, setFailure, reset } = useAutoClearMessage();
  const [brain, setBrain] = useState<'mock' | 'claude'>('mock');

  const handlePeerRetro = useCallback(async () => {
    setBusy(true);
    reset();
    try {
      const res = await apiPost<PeerRetroResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/peer-retro`,
        { brain, apply: true },
      );
      const ratings = (res && res.peer && res.peer.raw) ? res.peer.raw.length : 0;
      const raters = (res && res.peer && res.peer.raters) ? res.peer.raters.length : 0;
      const updated = res && res.applied ? Object.keys(res.applied).length : 0;
      setSuccess(tFormat('meetings.peerRetro.success', { raters, ratings, updated }), 6000);
    } catch (e) {
      setFailure(tFormat('meetings.peerRetro.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
    } finally {
      setBusy(false);
    }
  }, [brain, meetingId, reset, setSuccess, setFailure]);

  return { busy, msg, failed, brain, setBrain, handlePeerRetro };
}
