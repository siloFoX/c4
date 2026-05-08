import { useCallback, useState } from 'react';
import { apiPost } from './api';
import { t, tFormat } from './i18n';
import type { ReadResponse } from '../components/WikiView';

// (v1.10.640) Extracted from WikiView. The Reopen action —
// POST /api/wiki/reopen flips the page status and spawns a
// new meeting; on success we surface a 6-second success toast
// + refetch the page so the flipped frontmatter shows up,
// then re-run the search so the list pane status badge stays
// in sync. Tone separated from message text so localized
// copy keeps the destructive style.

interface WikiReopen {
  reopenBusy: boolean;
  reopenMsg: string | null;
  reopenFailed: boolean;
  handleReopen: (relPath: string) => Promise<void>;
}

export function useWikiReopen(args: {
  setPage: (next: ReadResponse | null) => void;
  runSearch: () => Promise<void>;
}): WikiReopen {
  const { setPage, runSearch } = args;
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenMsg, setReopenMsg] = useState<string | null>(null);
  const [reopenFailed, setReopenFailed] = useState(false);

  const handleReopen = useCallback(async (relPath: string) => {
    if (!relPath) return;
    setReopenBusy(true);
    setReopenMsg(null);
    setReopenFailed(false);
    try {
      const res = await apiPost<{
        meeting: { id: string; status: string };
        contextSeeds: Array<{ path: string }>;
        originalUpdated: boolean;
      }>('/api/wiki/reopen', { path: relPath });
      const m = res.meeting;
      const seeds = (res.contextSeeds || []).length;
      setReopenMsg(tFormat('wiki.reopen.success', { id: m.id, seeds }));
      window.setTimeout(() => setReopenMsg(null), 6000);
      const fresh = await apiPost<ReadResponse>('/api/wiki/read', { path: relPath });
      setPage(fresh);
      runSearch();
    } catch (e) {
      setReopenMsg(tFormat('wiki.reopen.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setReopenFailed(true);
    } finally {
      setReopenBusy(false);
    }
  }, [setPage, runSearch]);

  return { reopenBusy, reopenMsg, reopenFailed, handleReopen };
}
