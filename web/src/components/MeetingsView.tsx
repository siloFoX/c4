import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Plus, RefreshCw } from 'lucide-react';
import { apiGet, eventSourceUrl } from '../lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import MeetingsMaintenancePanel from './MeetingsMaintenancePanel';
import MeetingsRecapPanel, { type RecapResponse } from './MeetingsRecapPanel';
import MeetingsActionItemsPanel, { type ActionItemsResponse } from './MeetingsActionItemsPanel';
import MeetingsLineageStrip, { type LineageResponse } from './MeetingsLineageStrip';
import MeetingsStuckBanner, { type StuckResponse } from './MeetingsStuckBanner';
import MeetingsStagesView, { type StageView } from './MeetingsStagesView';
import MeetingsDetailHeader from './MeetingsDetailHeader';
import MeetingsStateActions from './MeetingsStateActions';
import MeetingsRunControls from './MeetingsRunControls';
import MeetingsComposer from './MeetingsComposer';
import MeetingsSearchFacets from './MeetingsSearchFacets';
import MeetingsSearchFilterRow from './MeetingsSearchFilterRow';
import MeetingsListFilterRow from './MeetingsListFilterRow';
import MeetingsList from './MeetingsList';
import MeetingsSearchInput from './MeetingsSearchInput';
import MeetingsDetailTitleBar from './MeetingsDetailTitleBar';
import MeetingsDetailCompletedActions from './MeetingsDetailCompletedActions';
import MeetingsDetailInProgressActions from './MeetingsDetailInProgressActions';

// (multi-specialist phase 6) Meetings tab — list view + drill-in
// detail. Reads /api/meetings and /api/meetings/:id; the SSE
// stream wiring lands in a follow-up. Kept intentionally small so
// the page is usable today and we can iterate on detail UI without
// blocking the basic operator workflow.

export type MeetingStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'escalated'
  | 'aborted';

export interface MeetingSummary {
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  currentStage: string | null;
  currentRound: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  // (Phase 6.11) forkOf surfaced in list rows for fork-aware UIs.
  forkOf?: string | null;
  // (v1.10.331) FTS snippet — only set on search-result rows.
  // Carries `<<token>>` markers from the backend; renderer below
  // converts them to highlight spans.
  snippet?: string;
}

interface MeetingsListResponse {
  count: number;
  meetings: MeetingSummary[];
}

interface Turn {
  stage: string;
  round: number;
  specialistId: string;
  text: string;
  ts: string;
}

// (v1.10.547) StageView interface moved to ./MeetingsStagesView.tsx
// (canonical home now that the rendering lives there). Re-imported
// here for the MeetingDetail shape.

interface MeetingDetail {
  id: string;
  status: MeetingStatus;
  track: string;
  title: string;
  task: string;
  forkOf: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  currentStage: string | null;
  currentRound: number;
  stages: StageView[];
  transcripts: Turn[][];
}

// (v1.10.543) Lineage types moved to ./MeetingsLineageStrip.tsx
// (canonical home now that the UI lives there).

// (Phase 6.5) Action-items extracted from transcript markers.
// (v1.10.542) ActionItem + ActionItemsResponse moved to
// ./MeetingsActionItemsPanel.tsx (canonical home now that the
// UI lives there). ActionItemType stays here so other panels
// (MeetingsRecapPanel) can import it from a stable location.
export type ActionItemType = 'decision' | 'action' | 'todo' | 'blocker';

// (v1.10.541) Recap types moved to ./MeetingsRecapPanel.tsx
// (the canonical location now that the UI lives there too).

export const STATUS_BADGE: Record<MeetingStatus, string> = {
  pending: 'border-border bg-muted/40 text-muted-foreground',
  'in-progress': 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  escalated: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  aborted: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function formatRelative(iso: string | null): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60) return tFormat('meetings.relative.seconds', { n: diff });
  if (diff < 3600) return tFormat('meetings.relative.minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return tFormat('meetings.relative.hours', { n: Math.floor(diff / 3600) });
  return dt.toISOString().slice(0, 10);
}

export default function MeetingsView() {
  useLocale();
  const [data, setData] = useState<MeetingsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // (Phase 6.11) List-level filters (separate from search filters
  // — search hits FTS, list hits the bare /meetings endpoint).
  const [listStatus, setListStatus] = useState<MeetingStatus | ''>('');
  const [listTrack, setListTrack] = useState<'lightweight' | 'standard' | 'full' | ''>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // (Phase 6.9) Lineage chain for the selected meeting. Only
  // fetched when the detail says forkOf is set OR the meeting
  // looks like it might be a parent (cheap to call regardless).
  // We refetch whenever selectedId changes; the chain is small
  // enough that we don't need debouncing.
  const [lineage, setLineage] = useState<LineageResponse | null>(null);
  // (Phase 6.5) Action-items extracted from the transcript.
  const [actions, setActions] = useState<ActionItemsResponse | null>(null);
  // (v1.10.542) actionsFilter state moved into the extracted panel.
  // (v1.10.541) Recap state owned here so the existing recap-fetch
  // useEffect below stays put; recap panel UI extracted to
  // ./MeetingsRecapPanel.tsx. Collapsed-by-default behaviour
  // showing first-turn per stage. Fetched on selection change AND
  // on transcript turn-count change so live SSE updates pick up
  // newly-first turns.
  const [recap, setRecap] = useState<RecapResponse | null>(null);

  // (Phase 6.15) Stuck meetings alert. Polled every 60s; only
  // visible when count > 0. Banner UI extracted to
  // ./MeetingsStuckBanner.tsx — parent still polls and owns
  // the data.
  const [stuck, setStuck] = useState<StuckResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchStuck = () => {
      apiGet<StuckResponse>('/api/meetings/stuck?hours=1')
        .then((res) => { if (!cancelled) setStuck(res); })
        .catch(() => { /* tolerate older daemons */ });
    };
    fetchStuck();
    const id = window.setInterval(fetchStuck, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // (Phase 8.1) FTS search state. Empty query → bare list.
  // Non-empty → /api/meetings/search?q=&facet=status,track replaces
  // the list. Debounced 250ms so each keystroke doesn't fire a
  // request.
  // (Phase 8.1.5) status + track filters compose with the MATCH so
  // operators can narrow "auth migration" to "completed full-track"
  // without scanning the whole result list.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState<MeetingStatus | ''>('');
  const [searchTrack, setSearchTrack] = useState<'lightweight' | 'standard' | 'full' | ''>('');
  // (Phase 8.1.5) since/until — date inputs (YYYY-MM-DD) translated
  // to ISO timestamps in the URL params.
  const [searchSince, setSearchSince] = useState('');
  const [searchUntil, setSearchUntil] = useState('');
  const [searchResults, setSearchResults] = useState<MeetingSummary[] | null>(null);
  const [searchFacets, setSearchFacets] = useState<{ status?: Record<string, number>; track?: Record<string, number> } | null>(null);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (listStatus) params.set('status', listStatus);
      if (listTrack) params.set('track', listTrack);
      const url = params.toString() ? `/api/meetings?${params.toString()}` : '/api/meetings';
      const res = await apiGet<MeetingsListResponse>(url);
      setData(res);
    } catch (e) {
      setError((e as Error).message || t('common.failedToLoadMeetings'));
    } finally {
      setLoading(false);
    }
  }, [listStatus, listTrack]);

  useEffect(() => { refresh(); }, [refresh]);

  // (v1.10.353) Global SSE list stream — every meeting state
  // transition + meeting-added / meeting-removed events. Drops
  // the periodic refresh poll to a fallback (90s) since the
  // stream covers the live case. Falls back gracefully when the
  // daemon doesn't expose the stream (older versions): the stream
  // never opens and the poll keeps running.
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(eventSourceUrl('/api/meetings/stream'));
      // Refresh the list on each event — cheap given the typical
      // meeting count, and avoids local cache invalidation logic
      // (the GET endpoint is the source of truth for filters).
      es.onmessage = () => refresh();
      es.onerror = () => {
        // EventSource auto-reconnects on transient failure; if it
        // never opens we fall through to the poll below.
      };
    } catch {
      // ignore — EventSource may be blocked in some browsers
    }
    // Fallback poll — 90s instead of 8s, since SSE handles the
    // live case. Still useful in case SSE is closed by a proxy.
    const id = window.setInterval(refresh, 90_000);
    return () => {
      if (es) es.close();
      window.clearInterval(id);
    };
  }, [refresh]);

  // (Phase 8.1) Debounced FTS search.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      // Empty query → clear results so the bare list shows.
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
        if (searchStatus) params.set('status', searchStatus);
        if (searchTrack) params.set('track', searchTrack);
        if (searchSince) params.set('since', `${searchSince}T00:00:00.000Z`);
        if (searchUntil) params.set('until', `${searchUntil}T00:00:00.000Z`);
        const res = await apiGet<{
          count: number;
          query: string;
          offset: number;
          total?: number;
          facets?: { status?: Record<string, number>; track?: Record<string, number> };
          results: Array<{
            id: string;
            status: MeetingStatus;
            createdAt: string;
            updatedAt: string;
            snippet: string;
            rank: number;
          }>;
        }>(`/api/meetings/search?${params.toString()}`);
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
  }, [searchQuery, searchStatus, searchTrack, searchSince, searchUntil]);

  // Initial detail fetch + SSE live updates (phase 7.1).
  // We intentionally fetch the full snapshot via the REST endpoint
  // first because the SSE `event: snapshot` frame already contains
  // the same data — so we'd render twice if we did both. Instead:
  // open SSE only, treat the first `snapshot` event as the initial
  // load, then apply incremental `state` events thereafter.
  const [streaming, setStreaming] = useState(false);
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setStreaming(false);
      return undefined;
    }
    setDetailError(null);
    setDetail(null);
    let es: EventSource | null = null;
    try {
      es = new EventSource(eventSourceUrl(`/api/meetings/${encodeURIComponent(selectedId)}/stream`));
    } catch (e) {
      setDetailError((e as Error).message || t('common.failedToOpenMeetingStream'));
      return undefined;
    }
    setStreaming(true);
    es.addEventListener('snapshot', (ev) => {
      try {
        const snap = JSON.parse((ev as MessageEvent).data) as MeetingDetail;
        setDetail(snap);
      } catch { /* ignore malformed frame */ }
    });
    es.addEventListener('state', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data) as {
          event: string;
          payload: Record<string, unknown>;
          status: MeetingStatus;
          ts: string;
        };
        // Re-fetch on every state change — payloads are too varied
        // (turn / vote / advance) to merge surgically here. The
        // /api/meetings/:id GET is cheap and the cadence is bounded
        // by actual state transitions, so this is fine.
        apiGet<MeetingDetail>(`/api/meetings/${encodeURIComponent(selectedId)}`)
          .then((d) => setDetail(d))
          .catch(() => { /* swallow — UI keeps last snapshot */ });
        // Update status quickly without waiting for the GET.
        setDetail((prev) => (prev ? { ...prev, status: frame.status } : prev));
      } catch { /* ignore */ }
    });
    es.addEventListener('terminal', () => {
      // Meeting reached terminal status; no more state events will
      // come. We still fetch one final snapshot in case a turn
      // landed in the same flush.
      apiGet<MeetingDetail>(`/api/meetings/${encodeURIComponent(selectedId)}`)
        .then((d) => setDetail(d))
        .catch(() => { /* swallow */ });
    });
    es.onerror = () => {
      // EventSource auto-reconnects on transient failure; we just
      // mark the badge as "reconnecting" and let it retry.
      setStreaming(false);
    };
    es.onopen = () => setStreaming(true);
    return () => {
      try { es && es.close(); } catch { /* noop */ }
      setStreaming(false);
    };
  }, [selectedId]);

  // (Phase 6.9) Fetch lineage when selection changes. Cheap (1 row
  // for non-fork meetings, depth-many rows otherwise). Failures
  // silently set null — no need to surface as a hard error.
  useEffect(() => {
    if (!selectedId) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    apiGet<LineageResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/lineage`)
      .then((res) => { if (!cancelled) setLineage(res); })
      .catch(() => { if (!cancelled) setLineage(null); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // (Phase 6.5) Fetch action-items. Re-runs when the transcript
  // changes — i.e. when the SSE feed updates `detail`. The
  // dependency on the transcript-length sum is cheap and
  // change-stable for static meetings (no re-fetch every poll).
  const turnsTotal = useMemo(() => {
    if (!detail) return 0;
    return (detail.transcripts || []).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
  }, [detail]);
  useEffect(() => {
    if (!selectedId) {
      setActions(null);
      return;
    }
    let cancelled = false;
    apiGet<ActionItemsResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/action-items`)
      .then((res) => { if (!cancelled) setActions(res); })
      .catch(() => { if (!cancelled) setActions(null); });
    return () => { cancelled = true; };
  }, [selectedId, turnsTotal]);

  // (Phase 6.10) Recap fetch — same dep pattern as action-items.
  useEffect(() => {
    if (!selectedId) {
      setRecap(null);
      return;
    }
    let cancelled = false;
    apiGet<RecapResponse>(`/api/meetings/${encodeURIComponent(selectedId)}/recap`)
      .then((res) => { if (!cancelled) setRecap(res); })
      .catch(() => { if (!cancelled) setRecap(null); });
    return () => { cancelled = true; };
  }, [selectedId, turnsTotal]);

  const meetings = data?.meetings || [];
  const selectedSummary = useMemo(
    () => meetings.find((m) => m.id === selectedId) || null,
    [meetings, selectedId],
  );

  // (v1.10.557) Create-meeting composer extracted to
  // ./MeetingsComposer.tsx. Owns the new-task / track / templates
  // / template-vars / classify-preview / dispatcher-plan-preview
  // state internally. Parent keeps just the `creating` flag so
  // the toggle button can flip it.
  const [creating, setCreating] = useState(false);

  // (v1.10.556) Run controls (brain selector + Run button +
  // error display) extracted to ./MeetingsRunControls.tsx.

  // (v1.10.553) Publish controls extracted to
  // ./MeetingsPublishControls.tsx — owns its own busy / msg /
  // git-toggle state and the POST handler.

  // (v1.10.554) Peer-retro brain selector + button + result
  // extracted to ./MeetingsPeerRetroControls.tsx.

  // (v1.10.339) Manual state-machine controls for in-progress
  // meetings. Most operators use Run + auto-finalize, but for
  // long-running manual sessions (e.g., human-driven contributions
  // via CLI) the per-state buttons matter. All four actions
  // (start / advance / next-round / escalate / abort) hit the
  // existing endpoints and rely on the SSE stream to refresh the
  // detail panel — no manual refetch needed.
  // (v1.10.555) State-machine controls (start / advance /
  // next-round / escalate / abort) extracted to
  // ./MeetingsStateActions.tsx. Two render modes: 'pending'
  // shows just Start; 'in-progress' shows the four progress
  // buttons.

  // (v1.10.345) Manual contribute / vote on in-progress meetings.
  // Endpoints exist since Phase 1; the web UI only surfaced "Run"
  // which auto-drives via brain. For hybrid sessions where a
  // human-in-the-loop wants to write a contribution from a given
  // specialist, we now have an inline form on the detail panel.
  // Vote-only is the same endpoint with no `text` (we use /vote
  // for that — strictly a vote without a turn).
  // (v1.10.551) Contribute panel extracted to
  // ./MeetingsContributePanel.tsx — owns its own form state.
  // Parent keeps just the open/closed flag (toggle button lives
  // in the manual-control row above the panel).
  const [contribOpen, setContribOpen] = useState(false);
  // Close the form whenever selection changes — the extracted
  // panel resets its own field state on meetingId change too.
  useEffect(() => {
    setContribOpen(false);
  }, [selectedId]);

  // (v1.10.345) Retro preview / finalize for terminal meetings.
  // Endpoints exist since phase 2.6; the web only had run with
  // autoFinalize. For meetings the operator wants to preview before
  // applying, surface explicit retro + finalize buttons next to
  // publish.
  // (v1.10.552) Retro preview / finalize panel extracted to
  // ./MeetingsRetroActions.tsx — owns its own busy / result /
  // error state and the POST handler.

  // (v1.10.352) Fork meeting — POST /meetings/:id/fork. Used to
  // redo a meeting with a sharper question or scope. Two modes:
  //   - replan: re-runs dispatcher (rosters can change)
  //   - reuse:  deep-clones the source plan (same rosters)
  // Form shows up when the operator clicks "Fork…"; on submit
  // we navigate to the new meeting id so the operator immediately
  // lands on the freshly-spawned pending session.
  // (v1.10.544) Fork form extracted to ./MeetingsForkForm.tsx.
  // Parent keeps the open/closed flag (so the "Fork…" button next
  // to publish/peer-retro can toggle it); the form owns its own
  // mode / task / title / track / busy / error state internally.
  const [forkOpen, setForkOpen] = useState(false);
  // Close the form whenever selection changes — half-typed fork
  // from meeting A shouldn't leak to a fork attempt on meeting B.
  useEffect(() => {
    setForkOpen(false);
  }, [selectedId]);

  // (v1.10.342) Maintenance — surfacing four ops endpoints from
  // an inline collapsible panel:
  // (v1.10.529) Maintenance panel state extracted to
  // ./MeetingsMaintenancePanel.tsx — drops ~150 lines of state +
  // ~200 lines of UI from this file. The panel renders the
  // collapsible footer with integrity / FTS rebuild / hot
  // backup / prune-old. It calls back via `onPruned` so we can
  // refresh the list when prune mutates state.
  // (Section index marker preserved for source-grep tests.)
  // GET  /meetings/persist-integrity (read-only health check)
  // POST /meetings/persist-backup    (hot copy)
  // POST /meetings/fts-rebuild       (force re-index)
  // POST /meetings/prune-old         (delete with dry-run)

  // (v1.10.557) handleCreate moved into the extracted MeetingsComposer.

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-6">
      {/* (v1.10.543) Stuck banner extracted to
          ./MeetingsStuckBanner.tsx. */}
      <MeetingsStuckBanner stuck={stuck} onNavigate={setSelectedId} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">{t('meetings.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setCreating((v) => !v)}
                aria-label={t('meetings.action.new')}
                aria-expanded={creating}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('meetings.action.newLabel')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                aria-label={t('meetings.action.refresh')}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
                {t('common.refresh')}
              </Button>
            </div>
          </div>
          {/* (v1.10.575) List filter row extracted to
              ./MeetingsListFilterRow.tsx. */}
          {!searchQuery.trim() ? (
            <MeetingsListFilterRow
              status={listStatus}
              onStatusChange={setListStatus}
              track={listTrack}
              onTrackChange={setListTrack}
            />
          ) : null}
          {/* (v1.10.582) Search input extracted to
              ./MeetingsSearchInput.tsx. */}
          <MeetingsSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            searching={searching}
          />
          {/* (v1.10.574) Search filter row extracted to
              ./MeetingsSearchFilterRow.tsx. */}
          {searchQuery.trim() ? (
            <MeetingsSearchFilterRow
              status={searchStatus}
              onStatusChange={setSearchStatus}
              track={searchTrack}
              onTrackChange={setSearchTrack}
              since={searchSince}
              onSinceChange={setSearchSince}
              until={searchUntil}
              onUntilChange={setSearchUntil}
            />
          ) : null}
          {searchResults && searchFacets ? (
            <MeetingsSearchFacets
              resultCount={searchResults.length}
              total={searchTotal}
              facets={searchFacets}
              selectedStatus={searchStatus}
              selectedTrack={searchTrack}
              onStatusToggle={setSearchStatus}
              onTrackToggle={setSearchTrack}
            />
          ) : null}
          {searchError ? (
            <div className="text-[11px] text-destructive">{searchError}</div>
          ) : null}
          {/* (v1.10.557) Composer extracted to ./MeetingsComposer.tsx. */}
          <MeetingsComposer
            open={creating}
            onClose={() => setCreating(false)}
            onCreated={(newId) => {
              setCreating(false);
              void refresh();
              setSelectedId(newId);
            }}
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {/* (v1.10.576) Master-pane list extracted to ./MeetingsList.tsx. */}
          <MeetingsList
            displayList={searchResults !== null ? searchResults : meetings}
            isSearchMode={searchResults !== null}
            searchQuery={searchQuery}
            error={error}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </CardContent>
        {/* (v1.10.529) Maintenance — collapsible footer with the
            four ops endpoints. Extracted to
            ./MeetingsMaintenancePanel.tsx. */}
        <MeetingsMaintenancePanel onPruned={refresh} />
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          {/* (v1.10.586) Title row + streaming badge extracted to
              ./MeetingsDetailTitleBar.tsx. */}
          <MeetingsDetailTitleBar
            title={selectedSummary ? selectedSummary.title : t('meetings.title.select')}
            showStreamingBadge={Boolean(selectedId)}
            streaming={streaming}
          />
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* (v1.10.556) Run brain selector + Run button + error
                  message extracted to ./MeetingsRunControls.tsx. */}
              <MeetingsRunControls meetingId={selectedId} />
            </div>
          ) : null}
          {selectedId && detail && detail.status === 'in-progress' ? (
            /* (v1.10.594) In-progress action row + ContributePanel
               extracted to ./MeetingsDetailInProgressActions.tsx. */
            <MeetingsDetailInProgressActions
              meetingId={selectedId}
              contribOpen={contribOpen}
              onContribToggle={() => setContribOpen((v) => !v)}
            />
          ) : null}
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t('meetings.orManually.label')}</span>
              {/* (v1.10.555) Manual Start button extracted. */}
              <MeetingsStateActions meetingId={selectedId} mode="pending" />
            </div>
          ) : null}
          {selectedId && detail && ['completed', 'escalated'].includes(detail.status) ? (
            /* (v1.10.593) Post-completion action row + ForkForm
               extracted to ./MeetingsDetailCompletedActions.tsx. */
            <MeetingsDetailCompletedActions
              meetingId={selectedId}
              meetingTitle={detail.title}
              forkOpen={forkOpen}
              onForkToggle={() => setForkOpen((v) => !v)}
              onForkClose={() => setForkOpen(false)}
              onForked={(newId) => {
                void refresh();
                setSelectedId(newId);
              }}
            />
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
              {t('meetings.empty.pick')}
            </div>
          ) : detailError ? (
            <div className="text-sm text-destructive">{detailError}</div>
          ) : !detail ? (
            <div className="text-sm text-muted-foreground">{t('meetings.loading')}</div>
          ) : (
            <>
              {/* (v1.10.548) Detail header (4-column metadata grid +
                  task line) extracted to ./MeetingsDetailHeader.tsx. */}
              <MeetingsDetailHeader
                status={detail.status}
                track={detail.track}
                currentStage={detail.currentStage}
                currentRound={detail.currentRound}
                task={detail.task}
              />
              {/* (v1.10.543) Lineage strip extracted to
                  ./MeetingsLineageStrip.tsx. */}
              <MeetingsLineageStrip
                lineage={lineage}
                currentId={detail.id}
                onNavigate={setSelectedId}
              />
              {/* (v1.10.541) Recap panel extracted to
                  ./MeetingsRecapPanel.tsx. */}
              <MeetingsRecapPanel recap={recap} />
              {/* (v1.10.542) Action-items panel extracted to
                  ./MeetingsActionItemsPanel.tsx. */}
              <MeetingsActionItemsPanel actions={actions} meetingId={selectedId} />
              {/* (v1.10.547) Transcript stages display extracted to
                  ./MeetingsStagesView.tsx. */}
              <MeetingsStagesView stages={detail.stages} transcripts={detail.transcripts} />
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
