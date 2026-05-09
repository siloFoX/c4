import { BookOpen } from 'lucide-react';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { useMeetingPublish } from '../lib/use-meeting-publish';

// (v1.10.553) Extracted from MeetingsView. Phase-3.4 publish
// controls — Publish button + git automation checkboxes
// (gitCommit / gitPush) + result message. Owns its own busy /
// msg / failed / git-toggle state.

// (v1.10.703) PublishResponse type + state + handler
// moved to lib/use-meeting-publish.

interface Props {
  meetingId: string;
}

export default function MeetingsPublishControls({ meetingId }: Props) {
  useLocale();

  const {
    busy, msg, failed,
    gitCommit, setGitCommit,
    gitPush, setGitPush,
    handlePublish,
  } = useMeetingPublish({ meetingId });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handlePublish}
        disabled={busy}
        aria-label={t('meetings.publish.label')}
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        {t('meetings.publish.button')}
      </Button>
      {/* (Phase 3.4) git automation toggles. */}
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={gitCommit}
          onChange={(e) => {
            setGitCommit(e.target.checked);
            if (!e.target.checked) setGitPush(false);
          }}
          disabled={busy}
          className="h-3 w-3"
        />
        {t('meetings.gitCommit')}
      </label>
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={gitPush}
          onChange={(e) => {
            setGitPush(e.target.checked);
            if (e.target.checked) setGitCommit(true);
          }}
          disabled={busy}
          className="h-3 w-3"
        />
        {t('meetings.gitPush')}
      </label>
      {msg ? (
        <span className={cn(
          'text-[11px]',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}>{msg}</span>
      ) : null}
    </>
  );
}
