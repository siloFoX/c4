import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.718) Extracted from MeetingsPeerRetroControls.
// The peer-rating POST + busy / msg / failed / brain
// state slots that drive a terminal meeting's
// peer-retro pass. Auto-clears the success toast
// after 6 seconds; failure persists until the next
// run.

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
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [brain, setBrain] = useState<'mock' | 'claude'>('mock');

  const handlePeerRetro = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const res = await apiPost<PeerRetroResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/peer-retro`,
        { brain, apply: true },
      );
      const ratings = (res && res.peer && res.peer.raw) ? res.peer.raw.length : 0;
      const raters = (res && res.peer && res.peer.raters) ? res.peer.raters.length : 0;
      const updated = res && res.applied ? Object.keys(res.applied).length : 0;
      setMsg(tFormat('meetings.peerRetro.success', { raters, ratings, updated }));
      window.setTimeout(() => setMsg(null), 6000);
    } catch (e) {
      setMsg(tFormat('meetings.peerRetro.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [brain, meetingId]);

  return { busy, msg, failed, brain, setBrain, handlePeerRetro };
}
