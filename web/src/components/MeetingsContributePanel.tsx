import { Button, Input } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { useMeetingContribute } from '../lib/use-meeting-contribute';

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

  // (v1.10.701) Form state + reset + contribute/vote handlers
  // moved to lib/use-meeting-contribute.
  const {
    specialist, setSpecialist,
    text, setText,
    vote, setVote,
    reason, setReason,
    busy, msg, failed,
    handleContribute, handleVoteOnly,
  } = useMeetingContribute({ meetingId });

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
