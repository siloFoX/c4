import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';

// (v1.10.641) Extracted from WikiView. Bulk publish — POST
// /api/wiki/publish-all writes a wiki page for every terminal
// meeting that doesn't yet have one. Idempotent unless
// ?force=1 (not exposed in the UI). Surfaces counts in a 6s
// toast + re-runs search. Tone separated from message text so
// localized copy keeps the destructive style on failure.

interface WikiBulkPublish {
  bulkBusy: boolean;
  bulkMsg: string | null;
  bulkFailed: boolean;
  bulkGitCommit: boolean;
  bulkGitPush: boolean;
  toggleBulkGitCommit: (next: boolean) => void;
  toggleBulkGitPush: (next: boolean) => void;
  handleBulkPublish: () => Promise<void>;
}

export function useWikiBulkPublish(args: {
  runSearch: () => Promise<void>;
}): WikiBulkPublish {
  const { runSearch } = args;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [bulkFailed, setBulkFailed] = useState(false);
  const [bulkGitCommit, setBulkGitCommit] = useState(false);
  const [bulkGitPush, setBulkGitPush] = useState(false);

  const handleBulkPublish = useCallback(async () => {
    if (!window.confirm(t('wiki.bulkPublishConfirm'))) return;
    setBulkBusy(true);
    setBulkMsg(null);
    setBulkFailed(false);
    try {
      const res = await apiPost<{
        written: string[];
        skipped?: string[];
        wikiRoot?: string;
        git?: { committed: boolean; sha?: string; pushed?: boolean };
      }>('/api/wiki/publish-all', {
        gitCommit: bulkGitCommit,
        gitPush: bulkGitPush,
      });
      const w = (res.written || []).length;
      const s = (res.skipped || []).length;
      let msg = tFormat('wiki.bulkPublish.success', { written: w, skipped: s });
      if (res.git && res.git.committed) {
        const sha = res.git.sha ? res.git.sha.slice(0, 7) : t('wiki.bulkPublish.committedFallback');
        msg += tFormat('wiki.bulkPublish.gitCommitted', { sha });
        if (res.git.pushed) msg += t('wiki.bulkPublish.gitPushed');
      }
      setBulkMsg(msg);
      window.setTimeout(() => setBulkMsg(null), 6000);
      runSearch();
    } catch (e) {
      setBulkMsg(tFormat('wiki.bulkPublish.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setBulkFailed(true);
    } finally {
      setBulkBusy(false);
    }
  }, [bulkGitCommit, bulkGitPush, runSearch]);

  // (v1.10.763) Coupled-bool toggles — turning bulkGitCommit OFF
  // also disables bulkGitPush; turning bulkGitPush ON also enables
  // bulkGitCommit. The coupling used to live as inline JSX onChange
  // logic in WikiBulkPublishRow; the hook owns the invariants now.
  const toggleBulkGitCommit = useCallback((next: boolean) => {
    setBulkGitCommit(next);
    if (!next) setBulkGitPush(false);
  }, []);
  const toggleBulkGitPush = useCallback((next: boolean) => {
    setBulkGitPush(next);
    if (next) setBulkGitCommit(true);
  }, []);

  return {
    bulkBusy,
    bulkMsg,
    bulkFailed,
    bulkGitCommit,
    bulkGitPush,
    toggleBulkGitCommit,
    toggleBulkGitPush,
    handleBulkPublish,
  };
}
