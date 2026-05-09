import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.703) Extracted from MeetingsPublishControls.
// Wiki publish + optional git-commit/push for the
// meeting transcript. Banner reports `written.length`
// and the trimmed git SHA on success; auto-clears after
// 4s. The two opt-in toggles (gitCommit / gitPush) live
// here too so the panel JSX stays bound to a single
// state cluster.

interface PublishResponse {
  ok: boolean;
  written: string[];
  wikiRoot: string;
  git?: { committed: boolean; sha?: string; pushed?: boolean };
}

interface MeetingPublishState {
  busy: boolean;
  msg: string | null;
  failed: boolean;
  gitCommit: boolean;
  setGitCommit: (next: boolean) => void;
  gitPush: boolean;
  setGitPush: (next: boolean) => void;
  handlePublish: () => Promise<void>;
}

export function useMeetingPublish(args: {
  meetingId: string;
}): MeetingPublishState {
  const { meetingId } = args;
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

  return {
    busy, msg, failed,
    gitCommit, setGitCommit,
    gitPush, setGitPush,
    handlePublish,
  };
}
