import { useEffect, useState } from 'react';
import { apiPost } from './api';
import { t } from './i18n';
import type { ReadResponse } from '../components/WikiView';

// (v1.10.639) Extracted from WikiView. Per-selection
// /api/wiki/read fetch — runs whenever `selectedPath`
// changes, with a cancellation flag so a fast click-through
// doesn't race a stale read into the panel. Returns the
// page + setPage (parent calls setPage after a Reopen so
// the flipped frontmatter shows up immediately) + pageError.

interface WikiPage {
  page: ReadResponse | null;
  setPage: (next: ReadResponse | null) => void;
  pageError: string | null;
}

export function useWikiPage(selectedPath: string | null): WikiPage {
  const [page, setPage] = useState<ReadResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedPath) { setPage(null); return; }
    const fetchPage = async () => {
      setPageError(null);
      try {
        const res = await apiPost<ReadResponse>('/api/wiki/read', { path: selectedPath });
        if (!cancelled) setPage(res);
      } catch (e) {
        if (!cancelled) setPageError((e as Error).message || t('common.failedToLoadPage'));
      }
    };
    fetchPage();
    return () => { cancelled = true; };
  }, [selectedPath]);

  return { page, setPage, pageError };
}
