import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.701) Extracted from MeetingsContributePanel.
// Two related flows that share form state:
// handleContribute POSTs /api/meetings/:id/contribute
// (the operator's manual transcript turn from a given
// specialist, with optional vote+reason); handleVoteOnly
// POSTs /api/meetings/:id/vote (vote without a turn).
// Form auto-resets on meetingId change so a half-typed
// contribution from meeting A doesn't leak into B.

interface MeetingContributeState {
  specialist: string;
  setSpecialist: (next: string) => void;
  text: string;
  setText: (next: string) => void;
  vote: '' | 'accept' | 'object';
  setVote: (next: '' | 'accept' | 'object') => void;
  reason: string;
  setReason: (next: string) => void;
  busy: boolean;
  msg: string | null;
  failed: boolean;
  handleContribute: () => Promise<void>;
  handleVoteOnly: (kind: 'accept' | 'object') => Promise<void>;
}

export function useMeetingContribute(args: {
  meetingId: string;
}): MeetingContributeState {
  const { meetingId } = args;
  const [specialist, setSpecialist] = useState('');
  const [text, setText] = useState('');
  const [vote, setVote] = useState<'' | 'accept' | 'object'>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Reset on selection change so a half-typed contribution from
  // meeting A doesn't leak into meeting B.
  useEffect(() => {
    setSpecialist('');
    setText('');
    setVote('');
    setReason('');
    setMsg(null);
    setFailed(false);
  }, [meetingId]);

  const handleContribute = useCallback(async () => {
    const sid = specialist.trim();
    const body = text.trim();
    if (!sid || !body) {
      setMsg(t('meetings.contribute.specialistTextRequired'));
      setFailed(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const payload: {
        specialistId: string;
        text: string;
        vote?: 'accept' | 'object' | null;
        reason?: string;
      } = { specialistId: sid, text: body };
      if (vote) payload.vote = vote;
      if (reason.trim()) payload.reason = reason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/contribute`, payload);
      setText('');
      setReason('');
      setVote('');
      setMsg(t('meetings.contribute.recorded'));
      window.setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg(tFormat('meetings.contribute.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [specialist, text, vote, reason, meetingId]);

  const handleVoteOnly = useCallback(async (kind: 'accept' | 'object') => {
    const sid = specialist.trim();
    if (!sid) {
      setMsg(t('meetings.contribute.specialistRequired'));
      setFailed(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const body: { specialistId: string; vote: 'accept' | 'object'; reason?: string } = {
        specialistId: sid,
        vote: kind,
      };
      if (reason.trim()) body.reason = reason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/vote`, body);
      setReason('');
      setMsg(tFormat('meetings.contribute.voteRecorded', { vote: kind }));
      window.setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg(tFormat('meetings.contribute.voteFailed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [specialist, reason, meetingId]);

  return {
    specialist, setSpecialist,
    text, setText,
    vote, setVote,
    reason, setReason,
    busy, msg, failed,
    handleContribute, handleVoteOnly,
  };
}
