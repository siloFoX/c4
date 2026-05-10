import { useCallback, useEffect, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import { useAutoClearMessage } from './use-auto-clear-message';

// (v1.10.701) Extracted from MeetingsContributePanel.
// Two related flows that share form state:
// handleContribute POSTs /api/meetings/:id/contribute
// (the operator's manual transcript turn from a given
// specialist, with optional vote+reason); handleVoteOnly
// POSTs /api/meetings/:id/vote (vote without a turn).
// Form auto-resets on meetingId change so a half-typed
// contribution from meeting A doesn't leak into B.
//
// (v1.10.765) Banner state moved to shared infra
// hook lib/use-auto-clear-message; both handlers
// share one message slot with a 3s success duration.
//
// (v1.10.772) MeetingVote type alias canonical here;
// the literal `'accept' | 'object'` was duplicated
// across 7 sites — the alias drops 4 of them and
// reads more declaratively at the call sites.

export type MeetingVote = 'accept' | 'object';

interface MeetingContributeState {
  specialist: string;
  setSpecialist: (next: string) => void;
  text: string;
  setText: (next: string) => void;
  vote: '' | MeetingVote;
  setVote: (next: '' | MeetingVote) => void;
  reason: string;
  setReason: (next: string) => void;
  busy: boolean;
  msg: string | null;
  failed: boolean;
  handleContribute: () => Promise<void>;
  handleVoteOnly: (kind: MeetingVote) => Promise<void>;
}

export function useMeetingContribute(args: {
  meetingId: string;
}): MeetingContributeState {
  const { meetingId } = args;
  const [specialist, setSpecialist] = useState('');
  const [text, setText] = useState('');
  const [vote, setVote] = useState<'' | MeetingVote>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { msg, failed, setSuccess, setFailure, reset } = useAutoClearMessage();

  // Reset on selection change so a half-typed contribution from
  // meeting A doesn't leak into meeting B.
  useEffect(() => {
    setSpecialist('');
    setText('');
    setVote('');
    setReason('');
    reset();
  }, [meetingId, reset]);

  const handleContribute = useCallback(async () => {
    const sid = specialist.trim();
    const body = text.trim();
    if (!sid || !body) {
      setFailure(t('meetings.contribute.specialistTextRequired'));
      return;
    }
    setBusy(true);
    reset();
    try {
      const payload: {
        specialistId: string;
        text: string;
        vote?: MeetingVote | null;
        reason?: string;
      } = { specialistId: sid, text: body };
      if (vote) payload.vote = vote;
      if (reason.trim()) payload.reason = reason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/contribute`, payload);
      setText('');
      setReason('');
      setVote('');
      setSuccess(t('meetings.contribute.recorded'), 3000);
    } catch (e) {
      setFailure(tFormat('meetings.contribute.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
    } finally {
      setBusy(false);
    }
  }, [specialist, text, vote, reason, meetingId, reset, setSuccess, setFailure]);

  const handleVoteOnly = useCallback(async (kind: MeetingVote) => {
    const sid = specialist.trim();
    if (!sid) {
      setFailure(t('meetings.contribute.specialistRequired'));
      return;
    }
    setBusy(true);
    reset();
    try {
      const body: { specialistId: string; vote: MeetingVote; reason?: string } = {
        specialistId: sid,
        vote: kind,
      };
      if (reason.trim()) body.reason = reason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(meetingId)}/vote`, body);
      setReason('');
      setSuccess(tFormat('meetings.contribute.voteRecorded', { vote: kind }), 3000);
    } catch (e) {
      setFailure(tFormat('meetings.contribute.voteFailed', {
        error: (e as Error).message || t('common.unknown'),
      }));
    } finally {
      setBusy(false);
    }
  }, [specialist, reason, meetingId, reset, setSuccess, setFailure]);

  return {
    specialist, setSpecialist,
    text, setText,
    vote, setVote,
    reason, setReason,
    busy, msg, failed,
    handleContribute, handleVoteOnly,
  };
}
