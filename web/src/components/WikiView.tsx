import { useCallback, useEffect, useState } from 'react';
import { BookOpen, RotateCcw, Search } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (multi-specialist phase 7.4) Wiki tab — split-pane like
// MeetingsView. Left: query input + results list. Right: full page
// body (frontmatter + raw markdown). Mirrors `c4 wiki search` /
// `c4 wiki read` exactly so operators have parity between CLI and UI.

interface SearchHit {
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

interface SearchResponse {
  wikiRoot: string;
  query: string;
  type: string;
  total: number;
  hits: SearchHit[];
}

interface ReadResponse {
  path: string;
  absolutePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'adr', label: 'ADRs' },
  { value: 'retro', label: 'Retros' },
  { value: 'specialist', label: 'Specialists' },
  { value: 'docs', label: 'Docs' },
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
      setSearchError((e as Error).message || 'Wiki search failed');
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
        if (!cancelled) setPageError((e as Error).message || 'Failed to load page');
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

  const handleReopen = useCallback(async (relPath: string) => {
    if (!relPath) return;
    setReopenBusy(true);
    setReopenMsg(null);
    try {
      const res = await apiPost<{
        meeting: { id: string; status: string };
        contextSeeds: Array<{ path: string }>;
        originalUpdated: boolean;
      }>('/api/wiki/reopen', { path: relPath });
      const m = res.meeting;
      const seeds = (res.contextSeeds || []).length;
      setReopenMsg(`reopened — meeting ${m.id} (${seeds} context seed(s))`);
      window.setTimeout(() => setReopenMsg(null), 6000);
      // Pull the page again so the operator sees the flipped
      // `status: reopened` frontmatter, then refresh the search
      // results so the list pane stays in sync.
      const fresh = await apiPost<ReadResponse>('/api/wiki/read', { path: relPath });
      setPage(fresh);
      runSearch();
    } catch (e) {
      setReopenMsg(`reopen failed: ${(e as Error).message || 'unknown'}`);
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
  const [bulkGitCommit, setBulkGitCommit] = useState(false);
  const [bulkGitPush, setBulkGitPush] = useState(false);
  const handleBulkPublish = useCallback(async () => {
    if (!window.confirm(
      'Publish a wiki page for every terminal meeting without one?\n' +
      'Idempotent (existing pages are skipped). Use the CLI for force-overwrite.',
    )) return;
    setBulkBusy(true);
    setBulkMsg(null);
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
      let msg = `published ${w} new page(s) · skipped ${s}`;
      if (res.git && res.git.committed) {
        msg += ` · git ${res.git.sha ? res.git.sha.slice(0, 7) : 'committed'}${res.git.pushed ? ' + pushed' : ''}`;
      }
      setBulkMsg(msg);
      window.setTimeout(() => setBulkMsg(null), 6000);
      runSearch();
    } catch (e) {
      setBulkMsg(`publish-all failed: ${(e as Error).message || 'unknown'}`);
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
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder={t('wiki.search.placeholder')}
              aria-label={t('wiki.search.label')}
              disabled={searching}
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <label className="text-muted-foreground">
                {t('wiki.type.prefix')}
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={searching}
                  aria-label={t('wiki.type.label')}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={includeStale}
                  onChange={(e) => setIncludeStale(e.target.checked)}
                  disabled={searching}
                  aria-label={t('wiki.includeStale.label')}
                />
                <span>{t('wiki.includeStale')}</span>
              </label>
              <Button
                size="sm"
                onClick={runSearch}
                disabled={searching}
                aria-label={t('wiki.search.run')}
              >
                <Search className={cn('h-3.5 w-3.5', searching && 'animate-spin')} aria-hidden />
                {t('wiki.search.button')}
              </Button>
            </div>
            {/* (v1.10.341) Bulk publish row — sits below the
                search controls, separated visually. Idempotent so
                operators can click without worrying about
                clobbering existing pages. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 text-[11px]">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkPublish}
                disabled={bulkBusy}
                aria-label={t('wiki.publishAll.label')}
                title={t('wiki.publishAll.title')}
              >
                {bulkBusy ? t('wiki.publishAll.publishing') : t('wiki.publishAll')}
              </Button>
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bulkGitCommit}
                  onChange={(e) => {
                    setBulkGitCommit(e.target.checked);
                    if (!e.target.checked) setBulkGitPush(false);
                  }}
                  disabled={bulkBusy}
                  className="h-3 w-3"
                />
                {t('wiki.gitCommit')}
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bulkGitPush}
                  onChange={(e) => {
                    setBulkGitPush(e.target.checked);
                    if (e.target.checked) setBulkGitCommit(true);
                  }}
                  disabled={bulkBusy}
                  className="h-3 w-3"
                />
                {t('wiki.gitPush')}
              </label>
              {bulkMsg ? (
                <span className={cn(
                  'text-[11px]',
                  bulkMsg.startsWith('publish-all failed')
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>{bulkMsg}</span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {searchError ? (
            <div className="p-4 text-sm text-destructive">{searchError}</div>
          ) : !search ? (
            <div className="p-4 text-sm text-muted-foreground">{t('wiki.loading')}</div>
          ) : search.hits.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {tFormat('wiki.empty.format', { root: search.wikiRoot })}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {search.hits.map((h) => {
                const active = h.path === selectedPath;
                return (
                  <li
                    key={h.path}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors',
                      active ? 'bg-primary/10' : 'hover:bg-accent/40',
                    )}
                    onClick={() => setSelectedPath(h.path)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">{h.type}</Badge>
                      {h.status ? (
                        <span className="text-[10px] text-muted-foreground">[{h.status}]</span>
                      ) : null}
                      <span className="text-[10px] text-muted-foreground">score {h.score}</span>
                    </div>
                    <span className="truncate text-sm font-medium">{h.title}</span>
                    {h.snippet ? (
                      <span className="line-clamp-2 text-[11px] text-muted-foreground">{h.snippet}</span>
                    ) : null}
                    <span className="truncate text-[10px] text-muted-foreground">{h.path}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {page ? (page.frontmatter.title as string) || page.path : t('wiki.title.select')}
            </CardTitle>
            {page && selectedPath && page.frontmatter.status !== 'reopened' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReopen(selectedPath)}
                disabled={reopenBusy}
                aria-label={t('wiki.reopen.label')}
                title={t('wiki.tooltip.reopen')}
              >
                <RotateCcw className={cn('h-3.5 w-3.5', reopenBusy && 'animate-spin')} aria-hidden />
                {t('wiki.reopen')}
              </Button>
            ) : null}
          </div>
          {reopenMsg ? (
            <span className={cn(
              'text-[11px]',
              reopenMsg.startsWith('reopen failed') ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
            )}>
              {reopenMsg}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {!selectedPath ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <BookOpen className="mr-2 h-3.5 w-3.5" aria-hidden />
              {t('wiki.empty.pickPage')}
            </div>
          ) : pageError ? (
            <div className="text-sm text-destructive">{pageError}</div>
          ) : !page ? (
            <div className="text-sm text-muted-foreground">{t('wiki.loadingPage')}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">{t('wiki.field.type')}</div>
                  <div className="font-medium">{(page.frontmatter.type as string) || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('wiki.field.status')}</div>
                  <div className="font-medium">{(page.frontmatter.status as string) || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('wiki.field.lastReviewed')}</div>
                  <div className="font-medium">{(page.frontmatter.last_reviewed as string) || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('wiki.field.path')}</div>
                  <div className="truncate font-medium">{page.path}</div>
                </div>
              </div>
              {/* (Phase 6.12) Related pages — auto-derived from
                  transcript markers + meeting/ADR refs. Render as
                  clickable chips when there's any. */}
              {Array.isArray(page.frontmatter.related) && (page.frontmatter.related as unknown[]).length > 0 ? (
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground">related ({(page.frontmatter.related as unknown[]).length})</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(page.frontmatter.related as unknown[]).map((r, i) => {
                      const ref = String(r);
                      const isWikiPath = /\.md$/.test(ref);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => isWikiPath ? setSelectedPath(ref) : null}
                          className={cn(
                            'rounded border border-border bg-background px-1.5 py-0 font-mono text-[10px]',
                            isWikiPath ? 'hover:bg-accent/40' : 'cursor-default opacity-70',
                          )}
                          title={isWikiPath ? `Open ${ref}` : ref}
                          disabled={!isWikiPath}
                        >
                          {ref}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-[12px] font-mono">
                {page.body}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
