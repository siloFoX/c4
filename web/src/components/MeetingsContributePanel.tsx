import { useCallback, useEffect, useState } from 'react';
import { apiPost } from '../lib/api';
import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.551) Extracted from MeetingsView. The Phase-1 manual
// contribute panel — operator picks a specialist id, writes a
// turn body, optionally adds a vote/reason, and POSTs to either
// /contribute (with body) or /vote (vote-only). Owns its full
// form state internally; parent provides the meeting id and
// the open flag (the toggle button lives in the manual control
// row above).

interface Props {
  open: boolean;
  meetingId: string;
}

export default function MeetingsContributePanel({ open, meetingId }: Props) {
  useLocale();

  const [specialist, setSpecialist] = useState('');
  const [text, setText] = useState('');
  const [vote, setVote] = useState<'' | 'accept' | 'object'>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // (v1.10.483) Tone separated from message text — see prior tone refactors.
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

  if (!open) return null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/10 p-2 text-[11px]">
      <Input
        type="text"
        value={specialist}
        onChange={(e) => setSpecialist(e.target.value)}
        placeholder={t('meetings.contribute.specialistId.placeholder')}
        aria-label={t('meetings.contribute.specialistId.label')}
        disabled={busy}
        className="h-7 text-[11px] font-mono"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('meetings.contribute.body.placeholder')}
        aria-label={t('meetings.contribute.body.label')}
        disabled={busy}
        className="min-h-[64px] rounded border border-border bg-background p-2 text-[11px]"
      />
      <Input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('meetings.contribute.reason.placeholder')}
        aria-label={t('meetings.contribute.reason.label')}
        disabled={busy}
        className="h-7 text-[11px]"
      />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <label className="flex items-center gap-1 text-muted-foreground">
          vote (with contrib):
          <select
            value={vote}
            onChange={(e) => setVote(e.target.value as '' | 'accept' | 'object')}
            disabled={busy}
            className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
          >
            <option value="">{t('meetings.option.none')}</option>
            <option value="accept">{t('meetings.option.accept')}</option>
            <option value="object">{t('meetings.option.object')}</option>
          </select>
        </label>
        <Button
          size="sm"
          onClick={handleContribute}
          disabled={busy || !specialist.trim() || !text.trim()}
          className="h-6 px-2 text-[10px]"
          aria-label={t('meetings.contribute.post.label')}
        >
          {busy ? '…' : t('meetings.contribute.post')}
        </Button>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">{t('meetings.contribute.voteOnly')}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVoteOnly('accept')}
          disabled={busy || !specialist.trim()}
          className="h-6 px-2 text-[10px]"
          aria-label={t('meetings.contribute.voteAccept.label')}
        >
          {t('meetings.action.acceptLabel')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVoteOnly('object')}
          disabled={busy || !specialist.trim()}
          className="h-6 px-2 text-[10px]"
          aria-label={t('meetings.contribute.voteObject.label')}
        >
          {t('meetings.action.objectLabel')}
        </Button>
        {msg ? (
          <span className={cn(
            'truncate',
            failed ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
