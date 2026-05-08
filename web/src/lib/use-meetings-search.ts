import { useEffect, useState } from 'react';
import { apiGet } from './api';
import { t } from './i18n';
import type { MeetingStatus, MeetingSummary } from '../components/MeetingsView';
import type { SearchFacets, Track } from '../components/MeetingsSearchFacets';

// (v1.10.623) Extracted from MeetingsView. The /api/meetings/search
// query effect with 250ms debounce + status/track/since/until
// filter composition + facet/total parsing + summary-list
// decoration. Returns the result block as a flat object so the
// parent can pass it straight into MeetingsSearchSection.

interface SearchResult {
  searchResults: MeetingSummary[] | null;
  searchFacets: SearchFacets | null;
  searchTotal: number | null;
  searchError: string | null;
  searching: boolean;
}

interface RawSearchResponse {
  count: number;
  query: string;
  offset: number;
  total?: number;
  facets?: SearchFacets;
  results: Array<{
    id: string;
    status: MeetingStatus;
    createdAt: string;
    updatedAt: string;
    snippet: string;
    rank: number;
  }>;
}

export function useMeetingsSearch(args: {
  query: string;
  status: MeetingStatus | '';
  track: Track | '';
  since: string;
  until: string;
  meetings: MeetingSummary[];
}): SearchResult {
  const { query, status, track, since, until, meetings } = args;
  const [searchResults, setSearchResults] = useState<MeetingSummary[] | null>(null);
  const [searchFacets, setSearchFacets] = useState<SearchFacets | null>(null);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearchFacets(null);
      setSearchTotal(null);
      setSearchError(null);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          q,
          limit: '50',
          facet: 'status,track',
          total: '1',
        });
        if (status) params.set('status', status);
        if (track) params.set('track', track);
        if (since) params.set('since', `${since}T00:00:00.000Z`);
        if (until) params.set('until', `${until}T00:00:00.000Z`);
        const res = await apiGet<RawSearchResponse>(`/api/meetings/search?${params.toString()}`);
        if (cancelled) return;
        // Merge each result with the matching summary from the
        // current list so the row renders track / title properly
        // (the search response doesn't include those fields). For
        // results not in the current page of the list we fall back
        // to the limited fields the search returns.
        const summaryById = new Map<string, MeetingSummary>();
        for (const m of meetings) summaryById.set(m.id, m);
        const merged: MeetingSummary[] = res.results.map((r) => {
          const fromList = summaryById.get(r.id);
          if (fromList) return { ...fromList, snippet: r.snippet };
          return {
            id: r.id,
            status: r.status,
            track: '?',
            title: r.id,
            currentStage: null,
            currentRound: 0,
            createdAt: r.createdAt,
            startedAt: null,
            completedAt: null,
            snippet: r.snippet,
          };
        });
        setSearchResults(merged);
        setSearchFacets(res.facets || null);
        setSearchTotal(typeof res.total === 'number' ? res.total : null);
      } catch (e) {
        if (cancelled) return;
        setSearchError((e as Error).message || t('common.searchFailed'));
        setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // We intentionally omit `meetings` from deps — re-running the
    // search every time the list polls is wasteful; the merge with
    // summaryById is best-effort decoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, track, since, until]);

  return { searchResults, searchFacets, searchTotal, searchError, searching };
}
