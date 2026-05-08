import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type { SearchResponse } from '../components/WikiView';

// (v1.10.642) Extracted from WikiView. The /api/wiki/search
// query — composes q/type/includeStale/limit URL params, runs
// an initial empty-query search on mount so the operator sees
// every available page (the daemon's reader scores empty
// queries with score=1 for each hit, sorted by path), and
// re-runs whenever any input changes. Returns the response +
// busy/error state + a manual `runSearch` re-entry.

interface WikiSearch {
  query: string;
  setQuery: (next: string) => void;
  type: string;
  setType: (next: string) => void;
  includeStale: boolean;
  setIncludeStale: (next: boolean) => void;
  search: SearchResponse | null;
  searchError: string | null;
  searching: boolean;
  runSearch: () => Promise<void>;
}

export function useWikiSearch(): WikiSearch {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('any');
  const [includeStale, setIncludeStale] = useState(false);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('q', query);
      if (type) qs.set('type', type);
      if (includeStale) qs.set('includeStale', '1');
      qs.set('limit', '25');
      const res = await apiGet<SearchResponse>(`/api/wiki/search?${qs.toString()}`);
      setSearch(res);
    } catch (e) {
      setSearchError((e as Error).message || t('common.wikiSearchFailed'));
    } finally {
      setSearching(false);
    }
  }, [query, type, includeStale]);

  useEffect(() => { runSearch(); }, [runSearch]);

  return {
    query,
    setQuery,
    type,
    setType,
    includeStale,
    setIncludeStale,
    search,
    searchError,
    searching,
    runSearch,
  };
}
