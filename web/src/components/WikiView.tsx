import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import WikiSearchResults from './WikiSearchResults';
import WikiPageDetail from './WikiPageDetail';
import WikiBulkPublishRow from './WikiBulkPublishRow';
import WikiSearchControls from './WikiSearchControls';
import WikiPageDetailHeader from './WikiPageDetailHeader';

// (multi-specialist phase 7.4) Wiki tab — split-pane like
// MeetingsView. Left: query input + results list. Right: full page
// body (frontmatter + raw markdown). Mirrors `c4 wiki search` /
// `c4 wiki read` exactly so operators have parity between CLI and UI.

export interface SearchHit {
  path: string;
  title: string;
  type: string;
  status: string | null;
  meetingId: string | null;
  adr: number | null;
  lastReviewed: string | null;
  related: string[];
  score: number;
  snippet: string;
}

export interface SearchResponse {
  wikiRoot: string;
  query: string;
  type: string;
  total: number;
  hits: SearchHit[];
}

// (v1.10.600) ReadResponse promoted to export so the
// WikiPageDetail sibling can type its `page` prop.
export interface ReadResponse {
  path: string;
  absolutePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

// (v1.10.486) Migrated to labelKey pattern resolved through t() at
// render time, like other constant catalogues.
// (v1.10.609) Promoted to export so the WikiSearchControls
// sibling can reuse the same options list.
export const TYPE_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'any', labelKey: 'wiki.type.any' },
  { value: 'meeting', labelKey: 'wiki.type.meeting' },
  { value: 'adr', labelKey: 'wiki.type.adr' },
  { value: 'retro', labelKey: 'wiki.type.retro' },
  { value: 'specialist', labelKey: 'wiki.type.specialist' },
  { value: 'docs', labelKey: 'wiki.type.docs' },
];

export default function WikiView() {
  useLocale();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('any');
  const [includeStale, setIncludeStale] = useState(false);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [page, setPage] = useState<ReadResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

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

  // Run an initial empty-query search on mount so the operator sees
  // every available page right away (the daemon's reader scores
  // empty queries with score=1 for each hit, sorted by path).
  useEffect(() => { runSearch(); }, [runSearch]);

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

  // Reopen action — POST /api/wiki/reopen flips the page status to
  // 'reopened' and spawns a new MeetingSession seeded with the page
  // + related neighbours. We surface a success toast pointing at
  // the new meeting id, then re-run the search so the flipped
  // status badge shows up in the list.
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenMsg, setReopenMsg] = useState<string | null>(null);
  // (v1.10.478) Tone separated from message text so localized
  // copy doesn't drop the destructive style when the prefix
  // shifts (e.g. Korean '재오픈 실패').
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
      // Pull the page again so the operator sees the flipped
      // `status: reopened` frontmatter, then refresh the search
      // results so the list pane stays in sync.
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
  }, [runSearch]);

  // (v1.10.341) Bulk publish — POST /api/wiki/publish-all writes
  // a wiki page for every terminal meeting that doesn't yet have
  // one. Idempotent unless ?force=1 (we don't expose force in the
  // UI; if an operator wants to overwrite they can fall back to
  // the CLI). Result envelope is `{written, skipped, ...}`; we
  // surface the counts in a transient toast and re-run the search
  // so the new pages show up.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  // (v1.10.485) Tone separated from message text — see prior tone refactors.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <CardTitle className="text-base">{t('wiki.title')}</CardTitle>
          <div className="flex flex-col gap-2">
            {/* (v1.10.609) Search controls extracted to
                ./WikiSearchControls.tsx. */}
            <WikiSearchControls
              query={query}
              onQuery={setQuery}
              type={type}
              onType={setType}
              includeStale={includeStale}
              onIncludeStale={setIncludeStale}
              searching={searching}
              onSearch={runSearch}
            />
            {/* (v1.10.608) Bulk publish row extracted to
                ./WikiBulkPublishRow.tsx. */}
            <WikiBulkPublishRow
              busy={bulkBusy}
              gitCommit={bulkGitCommit}
              gitPush={bulkGitPush}
              msg={bulkMsg}
              failed={bulkFailed}
              onGitCommit={setBulkGitCommit}
              onGitPush={setBulkGitPush}
              onPublish={handleBulkPublish}
            />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          <WikiSearchResults
            search={search}
            searchError={searchError}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        {/* (v1.10.619) Detail card header (title + reopen) extracted
            to ./WikiPageDetailHeader.tsx. */}
        <WikiPageDetailHeader
          page={page}
          selectedPath={selectedPath}
          reopenBusy={reopenBusy}
          reopenMsg={reopenMsg}
          reopenFailed={reopenFailed}
          onReopen={handleReopen}
        />
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {/* (v1.10.600) Page detail body extracted to ./WikiPageDetail.tsx. */}
          <WikiPageDetail
            selectedPath={selectedPath}
            page={page}
            pageError={pageError}
            onSelectPath={setSelectedPath}
          />
        </CardContent>
      </Card>
    </div>
  );
}
