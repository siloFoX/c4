import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';
import type { MeetingTrackOrAuto } from '../components/MeetingsSearchFacets';

// (v1.10.702) Extracted from MeetingsForkForm. Owns the
// four form fields (mode / task / title / track), busy
// + error state, the meeting-id-change reset effect,
// and the POST /api/meetings/:id/fork handler. The
// `mode` toggle gates whether `track` is forwarded —
// `replan` re-runs the dispatcher (rosters can change);
// `reuse` deep-clones the source plan.
//
// (v1.10.773) MeetingForkMode type alias canonical
// here — drops 4 inline `'replan' | 'reuse'` repeats
// (state slot, setter signature, payload typedef,
// JSX cast in MeetingsForkForm).

export type MeetingForkMode = 'replan' | 'reuse';

interface ForkResponse {
  id: string;
  status: string;
  track: string;
  title: string;
  task: string;
}

interface MeetingForkState {
  mode: MeetingForkMode;
  setMode: (next: MeetingForkMode) => void;
  task: string;
  setTask: (next: string) => void;
  title: string;
  setTitle: (next: string) => void;
  track: MeetingTrackOrAuto;
  setTrack: (next: MeetingTrackOrAuto) => void;
  busy: boolean;
  error: string | null;
  handleSubmit: () => Promise<void>;
}

export function useMeetingFork(args: {
  meetingId: string;
  onForked: (newId: string) => void;
  onClose: () => void;
}): MeetingForkState {
  const { meetingId, onForked, onClose } = args;
  const [mode, setMode] = useState<MeetingForkMode>('replan');
  const [task, setTask] = useState('');
  const [title, setTitle] = useState('');
  const [track, setTrack] = useState<MeetingTrackOrAuto>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form on selection change so a half-typed fork from
  // meeting A doesn't leak into a fork attempt on meeting B.
  useEffect(() => {
    setMode('replan');
    setTask('');
    setTitle('');
    setTrack('auto');
    setError(null);
  }, [meetingId]);

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const body: {
        mode: MeetingForkMode;
        task?: string;
        title?: string;
        track?: 'lightweight' | 'standard' | 'full';
      } = { mode };
      if (task.trim()) body.task = task.trim();
      if (title.trim()) body.title = title.trim();
      if (mode === 'replan' && track !== 'auto') body.track = track;
      const res = await apiPost<ForkResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/fork`,
        body,
      );
      // Navigate operator to the new meeting — the SSE list stream
      // will surface the new row as it lands.
      setTask('');
      setTitle('');
      onForked(res.id);
      onClose();
    } catch (e) {
      setError((e as Error).message || t('common.forkFailed'));
    } finally {
      setBusy(false);
    }
  }, [mode, task, title, track, meetingId, onForked, onClose]);

  return {
    mode, setMode,
    task, setTask,
    title, setTitle,
    track, setTrack,
    busy, error,
    handleSubmit,
  };
}
