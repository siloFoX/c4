import { useCallback, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { apiPost } from '../lib/api';
import { Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.553) Extracted from MeetingsView. Phase-3.4 publish
// controls — Publish button + git automation checkboxes
// (gitCommit / gitPush) + result message. Owns its own busy /
// msg / failed / git-toggle state.

interface PublishResponse {
  ok: boolean;
  written: string[];
  wikiRoot: string;
  git?: { committed: boolean; sha?: string; pushed?: boolean };
}

interface Props {
  meetingId: string;
}

export default function MeetingsPublishControls({ meetingId }: Props) {
  useLocale();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gitCommit, setGitCommit] = useState(false);
  const [gitPush, setGitPush] = useState(false);

  const handlePublish = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    setFailed(false);
    try {
      const res = await apiPost<PublishResponse>(
        `/api/meetings/${encodeURIComponent(meetingId)}/publish`,
        {
          includeRetro: true,
          apply: true,
          gitCommit,
          gitPush,
        },
      );
      const n = (res && Array.isArray(res.written)) ? res.written.length : 0;
      let m = tFormat('meetings.publish.success', { count: n, root: res && res.wikiRoot });
      if (res && res.git && res.git.committed) {
        const sha = res.git.sha ? res.git.sha.slice(0, 7) : t('meetings.publish.committedFallback');
        m += tFormat('meetings.publish.gitCommitted', { sha });
        if (res.git.pushed) m += t('meetings.publish.gitPushed');
      }
      setMsg(m);
      window.setTimeout(() => setMsg(null), 4000);
    } catch (e) {
      setMsg(tFormat('meetings.publish.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [gitCommit, gitPush, meetingId]);

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
