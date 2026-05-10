import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import { useAutoClearMessage } from './use-auto-clear-message';
import type { DigestResponse } from '../components/AutonomousView';

// (v1.10.654) Extracted from AutonomousView. Pause/resume
// toggle for autonomous mode — drives a banner that
// auto-clears after 4s. The hook owns the busy + message
// + failed-tone slots; the parent passes the current
// digest (so the toggle direction is derived from
// `digest.paused`) and the refresh callback (so the next
// poll sees the new state immediately).
//
// (v1.10.769) Banner state moved to shared infra
// hook lib/use-auto-clear-message.

interface PauseToggleState {
  pauseBusy: boolean;
  pauseMsg: string | null;
  pauseFailed: boolean;
  handlePauseToggle: () => Promise<void>;
}

export function useAutonomousPauseToggle(args: {
  digest: DigestResponse | null;
  refresh: () => Promise<void>;
}): PauseToggleState {
  const { digest, refresh } = args;
  const [pauseBusy, setPauseBusy] = useState(false);
  const { msg: pauseMsg, failed: pauseFailed, setSuccess, setFailure, reset } =
    useAutoClearMessage();

  const handlePauseToggle = useCallback(async () => {
    if (!digest) return;
    const path = digest.paused ? 'resume' : 'pause';
    setPauseBusy(true);
    reset();
    try {
      await apiPost(`/api/autonomous/${path}`, {});
      setSuccess(t(path === 'resume' ? 'autonomous.pauseToggle.resumed' : 'autonomous.pauseToggle.paused'));
      void refresh();
    } catch (err) {
      setFailure(tFormat(
        path === 'resume' ? 'autonomous.pauseToggle.resumeFailed' : 'autonomous.pauseToggle.pauseFailed',
        { error: (err as Error).message || t('common.unknown') },
      ));
    } finally {
      setPauseBusy(false);
    }
  }, [digest, refresh, reset, setSuccess, setFailure]);

  return { pauseBusy, pauseMsg, pauseFailed, handlePauseToggle };
}
