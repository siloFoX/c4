import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, MessageCircle, Play, Plus, RefreshCw, Radio, Search, X } from 'lucide-react';
import { apiGet, apiPost, eventSourceUrl } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { renderSnippet } from '../lib/snippet';
import MeetingsMaintenancePanel from './MeetingsMaintenancePanel';
import MeetingsTemplateEditor from './MeetingsTemplateEditor';
import MeetingsRecapPanel, { type RecapResponse } from './MeetingsRecapPanel';
import MeetingsActionItemsPanel, { type ActionItemsResponse } from './MeetingsActionItemsPanel';
import MeetingsLineageStrip, { type LineageResponse } from './MeetingsLineageStrip';
import MeetingsStuckBanner, { type StuckResponse } from './MeetingsStuckBanner';
import MeetingsForkForm from './MeetingsForkForm';
import MeetingsStagesView, { type StageView } from './MeetingsStagesView';
import MeetingsDetailHeader from './MeetingsDetailHeader';
import MeetingsContributePanel from './MeetingsContributePanel';
import MeetingsRetroActions from './MeetingsRetroActions';
import MeetingsPublishControls from './MeetingsPublishControls';

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

interface MeetingSummary {
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

const STATUS_BADGE: Record<MeetingStatus, string> = {
  pending: 'border-border bg-muted/40 text-muted-foreground',
  'in-progress': 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  escalated: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  aborted: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function formatRelative(iso: string | null): string {
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

  // Create-meeting composer.
  const [creating, setCreating] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [newTrack, setNewTrack] = useState<'auto' | 'lightweight' | 'standard' | 'full'>('auto');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // (8.1) Saved templates: list at composer-open so the operator
  // can pick one without typing the full task.
  const [templates, setTemplates] = useState<Array<{
    name: string;
    task: string;
    track?: string | null;
    description?: string | null;
  }>>([]);
  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiGet<{ templates: typeof templates }>('/api/meetings/templates');
      setTemplates(res.templates || []);
    } catch { /* best-effort */ }
  }, []);
  useEffect(() => {
    if (!creating) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGet<{ templates: typeof templates }>('/api/meetings/templates');
        if (!cancelled) setTemplates(res.templates || []);
      } catch { /* best-effort */ }
    };
    load();
    return () => { cancelled = true; };
  }, [creating]);

  // (8.4) Template-with-vars flow — declared early so the
  // template CRUD block below can reference templateName.
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});

  // (v1.10.344) Template CRUD — operators create / update / delete
  // saved templates from the composer's templates row.
  //
  // (v1.10.538) Editor extracted to ./MeetingsTemplateEditor.tsx.
  // Parent owns just the open/target pair; the editor manages its
  // own form + busy + message state internally.
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [tplEditTarget, setTplEditTarget] = useState<{
    name: string;
    task: string;
    track?: string | null;
    description?: string | null;
  } | null>(null);
  const openTplEditor = useCallback((tpl?: { name: string; task: string; track?: string | null; description?: string | null }) => {
    setTplEditTarget(tpl || null);
    setTplEditorOpen(true);
  }, []);

  // (8.4) Template-with-vars flow: when the operator picks a
  // template chip whose body contains `{{var}}` placeholders, we
  // surface a small per-var input row so they can supply values
  // before submit. State declared above (template CRUD block
  // references templateName).
  const placeholderRe = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const placeholderNames = useMemo(() => {
    const out = new Set<string>();
    let m;
    placeholderRe.lastIndex = 0;
    while ((m = placeholderRe.exec(newTask)) !== null) {
      const captured = m[1];
      if (captured) out.add(captured);
    }
    return [...out];
  }, [newTask]);
  const [previewPlan, setPreviewPlan] = useState<{
    track: string;
    rosterSize: number;
    estimatedTokens: number;
    consensusPolicy: { mode: string; roundCap: number; allowVeto: boolean };
    stages: Array<{ stage: string; specialists: Array<{ id: string }> }>;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // (Phase 6.6) Track classifier preview — separate, lighter call
  // than /meetings/plan. Tells the operator which track auto-mode
  // would pick and which keywords matched. Shown inline next to
  // the track select even when track is set explicitly (so the
  // operator can sanity-check their override).
  const [classifyPreview, setClassifyPreview] = useState<
    | { track: 'lightweight' | 'standard' | 'full'; matched: Array<{ list: string; term: string }>; reason: string }
    | null
  >(null);
  useEffect(() => {
    if (!creating || !newTask.trim()) {
      setClassifyPreview(null);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ task: newTask.trim() });
        const res = await apiGet<typeof classifyPreview>(`/api/meetings/classify-track?${qs.toString()}`);
        setClassifyPreview(res);
      } catch {
        setClassifyPreview(null);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [creating, newTask]);

  // Debounced dispatcher preview — re-runs ~400ms after typing stops.
  useEffect(() => {
    if (!creating || !newTask.trim()) {
      setPreviewPlan(null);
      return undefined;
    }
    const handle = window.setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const body: { task: string; track?: string } = { task: newTask.trim() };
        if (newTrack !== 'auto') body.track = newTrack;
        const res = await apiPost<typeof previewPlan>('/api/meetings/plan', body);
        setPreviewPlan(res);
      } catch {
        setPreviewPlan(null);
      } finally {
        setPreviewBusy(false);
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [creating, newTask, newTrack]);

  // Run the selected meeting with the chosen brain.
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runBrain, setRunBrain] = useState<'mock' | 'claude'>('mock');

  const handleRun = useCallback(async (id: string) => {
    setRunBusy(true);
    setRunError(null);
    try {
      await apiPost(`/api/meetings/${encodeURIComponent(id)}/run`, {
        brain: runBrain,
        autoFinalize: true,
      });
      // The SSE detail subscription will pick up turn / advance /
      // terminal events as the orchestrator drives the meeting,
      // so we don't manually refetch here — the EventSource hook
      // does that via apiGet on each `state` frame.
    } catch (e) {
      setRunError((e as Error).message || t('common.failedToStartMeeting'));
    } finally {
      setRunBusy(false);
    }
  }, [runBrain]);

  // (v1.10.553) Publish controls extracted to
  // ./MeetingsPublishControls.tsx — owns its own busy / msg /
  // git-toggle state and the POST handler.

  // Peer-retro on terminal meetings (separate from outcome retro
  // — see meeting-peer-retro.js). Mock brain for instant
  // demo, claude for real ratings.
  const [peerRetroBusy, setPeerRetroBusy] = useState(false);
  const [peerRetroMsg, setPeerRetroMsg] = useState<string | null>(null);
  // (v1.10.485) Tone separated from message text.
  const [peerRetroFailed, setPeerRetroFailed] = useState(false);
  const [peerBrain, setPeerBrain] = useState<'mock' | 'claude'>('mock');

  const handlePeerRetro = useCallback(async (id: string) => {
    setPeerRetroBusy(true);
    setPeerRetroMsg(null);
    setPeerRetroFailed(false);
    try {
      const res = await apiPost<{
        peer: {
          raters: string[];
          ratees: string[];
          raw: Array<{ rater: string; ratee: string; rating: number }>;
        };
        applied: Record<string, unknown> | null;
      }>(`/api/meetings/${encodeURIComponent(id)}/peer-retro`, {
        brain: peerBrain,
        apply: true,
      });
      const ratings = (res && res.peer && res.peer.raw) ? res.peer.raw.length : 0;
      const raters = (res && res.peer && res.peer.raters) ? res.peer.raters.length : 0;
      const updated = res && res.applied ? Object.keys(res.applied).length : 0;
      setPeerRetroMsg(tFormat('meetings.peerRetro.success', { raters, ratings, updated }));
      window.setTimeout(() => setPeerRetroMsg(null), 6000);
    } catch (e) {
      setPeerRetroMsg(tFormat('meetings.peerRetro.failed', {
        error: (e as Error).message || t('common.unknown'),
      }));
      setPeerRetroFailed(true);
    } finally {
      setPeerRetroBusy(false);
    }
  }, [peerBrain]);

  // (v1.10.339) Manual state-machine controls for in-progress
  // meetings. Most operators use Run + auto-finalize, but for
  // long-running manual sessions (e.g., human-driven contributions
  // via CLI) the per-state buttons matter. All four actions
  // (start / advance / next-round / escalate / abort) hit the
  // existing endpoints and rely on the SSE stream to refresh the
  // detail panel — no manual refetch needed.
  const [stateBusy, setStateBusy] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);

  const handleStateAction = useCallback(
    async (
      id: string,
      action: 'start' | 'advance' | 'next-round' | 'escalate' | 'abort',
      confirm?: string,
    ) => {
      if (confirm && !window.confirm(confirm)) return;
      setStateBusy(action);
      setStateError(null);
      try {
        await apiPost(`/api/meetings/${encodeURIComponent(id)}/${action}`, {});
      } catch (e) {
        setStateError(tFormat('meetings.state.failed', {
          action,
          error: (e as Error).message || t('common.unknown'),
        }));
      } finally {
        setStateBusy(null);
      }
    },
    [],
  );

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

  const handleCreate = useCallback(async () => {
    const task = newTask.trim();
    if (!task && !templateName) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const body: {
        task?: string;
        track?: string;
        template?: string;
        vars?: Record<string, string>;
        requireAllVars?: boolean;
      } = {};
      if (templateName) {
        body.template = templateName;
        // When operator supplied any vars, send them — daemon
        // expands the placeholders. Otherwise let the placeholders
        // pass through (operator may want a partial expansion).
        const filled = Object.fromEntries(
          Object.entries(templateVars).filter(([, v]) => v && v.length > 0),
        );
        if (Object.keys(filled).length) body.vars = filled;
      } else {
        body.task = task;
      }
      if (newTrack !== 'auto') body.track = newTrack;
      const created = await apiPost<{ id: string }>('/api/meetings', body);
      setNewTask('');
      setTemplateName(null);
      setTemplateVars({});
      setCreating(false);
      await refresh();
      if (created && created.id) setSelectedId(created.id);
    } catch (e) {
      setCreateError((e as Error).message || t('common.failedToCreateMeeting'));
    } finally {
      setCreateBusy(false);
    }
  }, [newTask, newTrack, refresh, templateName, templateVars]);

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
                onClick={() => { setCreating((v) => !v); setCreateError(null); }}
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
          {/* (Phase 6.11) list-level status/track narrow. Empty
              search query → these dropdowns control the result set. */}
          {!searchQuery.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.status')}
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={listStatus}
                  onChange={(e) => setListStatus(e.target.value as typeof listStatus)}
                  aria-label={t('meetings.action.listFilterStatus')}
                >
                  <option value="">{t('meetings.option.any')}</option>
                  <option value="pending">{t('meetings.option.pending')}</option>
                  <option value="in-progress">{t('meetings.status.inProgress')}</option>
                  <option value="completed">{t('meetings.option.completed')}</option>
                  <option value="escalated">{t('meetings.option.escalated')}</option>
                  <option value="aborted">{t('meetings.option.aborted')}</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.track')}
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={listTrack}
                  onChange={(e) => setListTrack(e.target.value as typeof listTrack)}
                  aria-label={t('meetings.action.listFilterTrack')}
                >
                  <option value="">{t('meetings.option.any')}</option>
                  <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                  <option value="standard">{t('meetings.mode.standard')}</option>
                  <option value="full">{t('meetings.mode.full')}</option>
                </select>
              </label>
              {(listStatus || listTrack) ? (
                <button
                  type="button"
                  onClick={() => { setListStatus(''); setListTrack(''); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  clear
                </button>
              ) : null}
            </div>
          ) : null}
          {/* (Phase 8.1) Full-text search. Empty query → bare list.
              Non-empty → list shows matches with bm25 ranking. */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('meetings.search.placeholder')}
                aria-label={t('meetings.action.search')}
                className="h-8 pl-7 pr-7 text-[12px]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('meetings.action.clearSearch')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            {searching ? (
              <span className="text-[10px] text-muted-foreground">{t('meetings.searching')}</span>
            ) : null}
          </div>
          {/* (Phase 8.1.5) Filter chips — shown only while
              search is active. Empty value = no narrowing. */}
          {searchQuery.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.status')}
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={searchStatus}
                  onChange={(e) => setSearchStatus(e.target.value as typeof searchStatus)}
                  aria-label={t('meetings.action.filterStatus')}
                >
                  <option value="">{t('meetings.option.any')}</option>
                  <option value="pending">{t('meetings.option.pending')}</option>
                  <option value="in-progress">{t('meetings.status.inProgress')}</option>
                  <option value="completed">{t('meetings.option.completed')}</option>
                  <option value="escalated">{t('meetings.option.escalated')}</option>
                  <option value="aborted">{t('meetings.option.aborted')}</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.track')}
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={searchTrack}
                  onChange={(e) => setSearchTrack(e.target.value as typeof searchTrack)}
                  aria-label={t('meetings.action.filterTrack')}
                >
                  <option value="">{t('meetings.option.any')}</option>
                  <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                  <option value="standard">{t('meetings.mode.standard')}</option>
                  <option value="full">{t('meetings.mode.full')}</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.since')}
                <input
                  type="date"
                  value={searchSince}
                  onChange={(e) => setSearchSince(e.target.value)}
                  className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  aria-label={t('meetings.action.sinceDate')}
                />
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                {t('meetings.label.until')}
                <input
                  type="date"
                  value={searchUntil}
                  onChange={(e) => setSearchUntil(e.target.value)}
                  className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  aria-label={t('meetings.action.untilDate')}
                />
              </label>
              {(searchSince || searchUntil) ? (
                <button
                  type="button"
                  onClick={() => { setSearchSince(''); setSearchUntil(''); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t('meetings.action.clearDates')}
                </button>
              ) : null}
            </div>
          ) : null}
          {searchResults && searchFacets ? (
            <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
              <span className="mr-1">
                {typeof searchTotal === 'number' ? `${searchResults.length}/${searchTotal} matches` : `${searchResults.length} matches`}
              </span>
              {searchFacets.status && Object.keys(searchFacets.status).length > 0 ? (
                <>
                  <span>· status:</span>
                  {Object.entries(searchFacets.status).map(([k, n]) => (
                    <button
                      key={`s-${k}`}
                      type="button"
                      onClick={() => setSearchStatus(searchStatus === k ? '' : (k as MeetingStatus))}
                      className={cn(
                        'rounded border px-1 transition-colors',
                        searchStatus === k
                          ? 'border-primary bg-primary/30 text-foreground'
                          : 'border-border bg-background hover:bg-accent/40',
                      )}
                      title={tFormat('meetings.aria.filterStatus', { value: k })}
                    >
                      {k}={n}
                    </button>
                  ))}
                </>
              ) : null}
              {searchFacets.track && Object.keys(searchFacets.track).length > 0 ? (
                <>
                  <span>· track:</span>
                  {Object.entries(searchFacets.track).map(([k, n]) => (
                    <button
                      key={`t-${k}`}
                      type="button"
                      onClick={() => setSearchTrack(searchTrack === k ? '' : (k as 'lightweight' | 'standard' | 'full'))}
                      className={cn(
                        'rounded border px-1 transition-colors',
                        searchTrack === k
                          ? 'border-primary bg-primary/30 text-foreground'
                          : 'border-border bg-background hover:bg-accent/40',
                      )}
                      title={tFormat('meetings.aria.filterTrack', { value: k })}
                    >
                      {k}={n}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {searchError ? (
            <div className="text-[11px] text-destructive">{searchError}</div>
          ) : null}
          {creating ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                <span className="text-muted-foreground">{t('meetings.templates.label')}</span>
                {templates.map((tpl) => (
                  <span key={tpl.name} className="inline-flex items-center">
                    <Button
                      size="sm"
                      variant={templateName === tpl.name ? 'default' : 'outline'}
                      onClick={() => {
                        setNewTask(tpl.task);
                        if (tpl.track) {
                          setNewTrack(tpl.track as typeof newTrack);
                        }
                        setTemplateName(tpl.name);
                        setTemplateVars({});
                      }}
                      title={tpl.description || tpl.task}
                      aria-label={tFormat('meetings.aria.applyTemplate', { name: tpl.name })}
                      className="h-6 px-2 text-[11px] rounded-r-none"
                    >
                      {tpl.name}
                    </Button>
                    {/* (v1.10.344) Edit pencil — opens the inline
                        editor pre-filled. Right-click intercepted
                        for accessibility / mobile. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTplEditor(tpl);
                      }}
                      title={tFormat('meetings.aria.editTemplate', { name: tpl.name })}
                      aria-label={tFormat('meetings.aria.editTemplate', { name: tpl.name })}
                      className="rounded-r border border-l-0 border-border bg-background px-1 py-1 text-[10px] text-muted-foreground hover:bg-muted/30"
                    >
                      ✎
                    </button>
                  </span>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTplEditor()}
                  aria-label={t('meetings.action.newTemplate')}
                  title={t('meetings.tooltip.saveTemplate')}
                  className="h-6 px-2 text-[11px]"
                >
                  + New
                </Button>
                {templateName ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTemplateName(null);
                      setTemplateVars({});
                    }}
                    aria-label={t('meetings.action.clearTemplate')}
                    className="h-6 px-2 text-[11px] text-muted-foreground"
                  >
                    clear
                  </Button>
                ) : null}
              </div>
              {/* (v1.10.538) Template editor extracted to
                  ./MeetingsTemplateEditor.tsx. Parent owns just the
                  open/target pair; the editor handles the form state,
                  save/delete API calls, and bubbles up via callbacks. */}
              <MeetingsTemplateEditor
                open={tplEditorOpen}
                tpl={tplEditTarget}
                onClose={() => setTplEditorOpen(false)}
                onSaved={() => {
                  setTplEditorOpen(false);
                  void loadTemplates();
                }}
                onDeleted={(deletedName) => {
                  setTplEditorOpen(false);
                  // If the operator had this template selected for the
                  // new meeting, clear it so the composer doesn't try
                  // to use a deleted name.
                  if (templateName === deletedName) setTemplateName(null);
                  void loadTemplates();
                }}
              />
              {templateName && placeholderNames.length > 0 ? (
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border/40 bg-background/50 p-2 text-[11px]">
                  <span className="col-span-2 text-muted-foreground">
                    {t('meetings.template.needsValuesPrefix')}
                    <span className="font-mono">{templateName}</span>
                    {t('meetings.template.needsValuesSuffix')}
                  </span>
                  {placeholderNames.map((name) => (
                    <label key={name} className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{`{{${name}}}`}</span>
                      <Input
                        type="text"
                        value={templateVars[name] || ''}
                        onChange={(e) => setTemplateVars((v) => ({ ...v, [name]: e.target.value }))}
                        placeholder={name}
                        aria-label={tFormat('meetings.aria.valueFor', { name })}
                        className="h-7 text-[11px]"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
              <Input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreate();
                  } else if (e.key === 'Escape') {
                    setCreating(false);
                    setCreateError(null);
                  }
                }}
                placeholder={t('meetings.compose.task.placeholder')}
                disabled={createBusy}
                aria-label={t('meetings.compose.task')}
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-muted-foreground">
                  {t('meetings.label.track')}
                  <select
                    className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as typeof newTrack)}
                    disabled={createBusy}
                    aria-label={t('meetings.compose.track')}
                  >
                    <option value="auto">{t('meetings.mode.auto')}</option>
                    <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                    <option value="standard">{t('meetings.mode.standard')}</option>
                    <option value="full">{t('meetings.mode.full')}</option>
                  </select>
                </label>
                {/* (Phase 6.6) classifier hint — shown when there's
                    typed text. Highlights mismatch when operator
                    explicitly chose a different track. */}
                {classifyPreview ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px]',
                      newTrack !== 'auto' && newTrack !== classifyPreview.track
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'border-border bg-muted/30 text-muted-foreground',
                    )}
                    title={classifyPreview.reason}
                  >
                    auto would pick: <span className="font-medium">{classifyPreview.track}</span>
                    {classifyPreview.matched.length > 0 ? (
                      <span className="opacity-80">
                        ({classifyPreview.matched.map((m) => m.term).join(', ')})
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={createBusy || !newTask.trim()}
                  aria-label={t('meetings.compose.create')}
                >
                  {t('meetings.action.createLabel')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setCreating(false); setCreateError(null); }}
                  disabled={createBusy}
                >
                  {t('common.cancel')}
                </Button>
                {createError ? (
                  <span className="text-[11px] text-destructive">{createError}</span>
                ) : null}
              </div>
              {previewPlan ? (
                <div className="rounded-md border border-border/60 bg-background p-2 text-[11px]">
                  <div className="font-medium">
                    {tFormat('meetings.preview.summary', {
                      track: previewPlan.track,
                      size: previewPlan.rosterSize,
                      tokens: previewPlan.estimatedTokens.toLocaleString(),
                    })}
                  </div>
                  <div className="text-muted-foreground">
                    consensus={previewPlan.consensusPolicy.mode}
                    {' · '}roundCap={previewPlan.consensusPolicy.roundCap}
                    {previewPlan.consensusPolicy.allowVeto ? ' · veto' : ''}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {previewPlan.stages.map((s) => (
                      <li key={s.stage} className="flex flex-wrap gap-1">
                        <span className="font-medium">[{s.stage}]</span>
                        <span className="text-muted-foreground">{s.specialists.map((sp) => sp.id).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : previewBusy ? (
                <div className="text-[11px] text-muted-foreground">{t('meetings.previewingRoster')}</div>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {(() => {
            // When search is active, display search results instead
            // of the polled list. Empty array (no matches) is
            // distinct from `null` (no search active) so we can show
            // a tailored "no matches" message.
            const displayList = searchResults !== null ? searchResults : meetings;
            const isSearchMode = searchResults !== null;
            if (error && !isSearchMode) {
              return <div className="p-4 text-sm text-destructive">{error}</div>;
            }
            if (displayList.length === 0) {
              return (
                <div className="p-4 text-sm text-muted-foreground">
                  {isSearchMode
                    ? tFormat('meetings.empty.search', { query: searchQuery })
                    : (loading ? t('meetings.empty.loading') : t('meetings.empty.list'))}
                </div>
              );
            }
            return (
              <ul className="divide-y divide-border">
                {displayList.map((m) => {
                  const active = m.id === selectedId;
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        'flex cursor-pointer flex-col gap-1 px-4 py-3 transition-colors',
                        active ? 'bg-primary/30' : 'hover:bg-accent/40',
                      )}
                      onClick={() => setSelectedId(m.id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide', STATUS_BADGE[m.status])}>
                          {m.status}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {m.track}
                        </Badge>
                        {m.forkOf ? (
                          <span
                            className="inline-flex items-center rounded-full border border-purple-500/40 bg-purple-500/10 px-1.5 py-0 text-[10px] text-purple-700 dark:text-purple-400"
                            title={tFormat('meetings.tooltip.forkedFrom', { parent: m.forkOf })}
                          >
                            ← {m.forkOf.slice(0, 8)}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelative(m.startedAt || m.createdAt)}
                        </span>
                      </div>
                      <span className="truncate text-sm font-medium">{m.title}</span>
                      {m.snippet ? (
                        <span className="line-clamp-2 text-[11px] text-muted-foreground">
                          {renderSnippet(m.snippet)}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        stage: {m.currentStage || '-'} · round {m.currentRound || 0} · id {m.id}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );
          })()}
        </CardContent>
        {/* (v1.10.529) Maintenance — collapsible footer with the
            four ops endpoints. Extracted to
            ./MeetingsMaintenancePanel.tsx. */}
        <MeetingsMaintenancePanel onPruned={refresh} />
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {selectedSummary ? selectedSummary.title : t('meetings.title.select')}
            </CardTitle>
            {selectedId ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                  streaming
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                )}
                aria-live="polite"
                title={streaming ? t('meetings.stream.tooltipLive') : t('meetings.stream.tooltipOffline')}
              >
                <Radio className="h-3 w-3" aria-hidden />
                {streaming ? t('meetings.stream.live') : t('meetings.stream.offline')}
              </span>
            ) : null}
          </div>
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-muted-foreground">
                {t('meetings.brain.label')}
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={runBrain}
                  onChange={(e) => setRunBrain(e.target.value as 'mock' | 'claude')}
                  disabled={runBusy}
                  aria-label={t('meetings.brain.aria')}
                >
                  <option value="mock">{t('meetings.brain.mockOption')}</option>
                  <option value="claude">{t('meetings.brain.claudeOption')}</option>
                </select>
              </label>
              <Button
                size="sm"
                onClick={() => handleRun(selectedId)}
                disabled={runBusy}
                aria-label={t('meetings.action.runMeeting')}
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {t('meetings.run.button')}
              </Button>
              {runError ? (
                <span className="text-[11px] text-destructive">{runError}</span>
              ) : null}
            </div>
          ) : null}
          {/* (v1.10.339) Manual control row for in-progress meetings.
              The Run button auto-drives, but manual sessions need
              per-action buttons (e.g., human-contributed turns via
              CLI / terminal). */}
          {selectedId && detail && detail.status === 'in-progress' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t('meetings.manual.label')}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setContribOpen((v) => !v)}
                aria-label={t('meetings.contribute.toggle.label')}
                title={t('meetings.tooltip.contribute')}
                aria-expanded={contribOpen}
              >
                {contribOpen ? t('meetings.hideContribute') : t('meetings.contributeButton')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStateAction(selectedId, 'advance')}
                disabled={stateBusy !== null}
                aria-label={t('meetings.contribute.advance.label')}
                title={t('meetings.tooltip.advance')}
              >
                {stateBusy === 'advance' ? '…' : t('meetings.advance')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStateAction(selectedId, 'next-round')}
                disabled={stateBusy !== null}
                aria-label={t('meetings.contribute.bumpRound.label')}
                title={t('meetings.tooltip.nextRound')}
              >
                {stateBusy === 'next-round' ? '…' : t('meetings.nextRound')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStateAction(
                  selectedId,
                  'escalate',
                  t('meetings.escalateConfirm'),
                )}
                disabled={stateBusy !== null}
                aria-label={t('meetings.contribute.escalate.label')}
              >
                {stateBusy === 'escalate' ? '…' : t('meetings.escalate')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleStateAction(
                  selectedId,
                  'abort',
                  t('meetings.abortConfirm'),
                )}
                disabled={stateBusy !== null}
                aria-label={t('meetings.contribute.abort.label')}
              >
                {stateBusy === 'abort' ? '…' : t('meetings.abort')}
              </Button>
              {stateError ? (
                <span className="text-[11px] text-destructive">{stateError}</span>
              ) : null}
            </div>
          ) : null}
          {/* (v1.10.345) Contribute / vote form. Hidden until the
              operator clicks "Contribute…". Vote-only buttons hit
              /vote (no turn appended); contribute hits /contribute
              with optional vote piggybacked on the turn. */}
          {selectedId && detail && detail.status === 'in-progress' ? (
            <MeetingsContributePanel open={contribOpen} meetingId={selectedId} />
          ) : null}
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t('meetings.orManually.label')}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStateAction(selectedId, 'start')}
                disabled={stateBusy !== null}
                aria-label={t('meetings.contribute.start.label')}
                title={t('meetings.tooltip.startManual')}
              >
                {stateBusy === 'start' ? '…' : t('meetings.startManual')}
              </Button>
              {stateError ? (
                <span className="text-[11px] text-destructive">{stateError}</span>
              ) : null}
            </div>
          ) : null}
          {selectedId && detail && ['completed', 'escalated'].includes(detail.status) ? (
            <div className="flex flex-wrap items-center gap-2">
              {/* (v1.10.553) Publish button + git toggles + result
                  message extracted to ./MeetingsPublishControls.tsx. */}
              <MeetingsPublishControls meetingId={selectedId} />
              <span aria-hidden className="text-muted-foreground">·</span>
              <label className="text-[11px] text-muted-foreground">
                {t('meetings.peerBrain.label')}
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={peerBrain}
                  onChange={(e) => setPeerBrain(e.target.value as 'mock' | 'claude')}
                  disabled={peerRetroBusy}
                  aria-label={t('meetings.peerBrain.aria')}
                >
                  <option value="mock">{t('meetings.adapter.mock')}</option>
                  <option value="claude">{t('meetings.adapter.claude')}</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePeerRetro(selectedId)}
                disabled={peerRetroBusy}
                aria-label={t('meetings.peerRetro.label')}
                title={t('meetings.tooltip.peerRetro')}
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {t('meetings.peerRetro')}
              </Button>
              {peerRetroMsg ? (
                <span className={cn(
                  'text-[11px]',
                  peerRetroFailed
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>{peerRetroMsg}</span>
              ) : null}
              {/* (v1.10.552) Retro preview / finalize buttons + state
                  extracted to ./MeetingsRetroActions.tsx. */}
              <span aria-hidden className="text-muted-foreground">·</span>
              <MeetingsRetroActions meetingId={selectedId} />
              {/* (v1.10.544) Fork form extracted to
                  ./MeetingsForkForm.tsx — toggle button still
                  lives here. */}
              <span aria-hidden className="text-muted-foreground">·</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForkOpen((v) => !v)}
                aria-label={t('meetings.fork.button.label')}
                title={t('meetings.tooltip.fork')}
                className="h-6 px-2 text-[10px]"
                aria-expanded={forkOpen}
              >
                {forkOpen ? t('meetings.cancelFork') : t('meetings.fork.button')}
              </Button>
            </div>
          ) : null}
          {selectedId && detail && ['completed', 'escalated'].includes(detail.status) ? (
            <MeetingsForkForm
              open={forkOpen}
              meeting={{ id: detail.id, title: detail.title }}
              busy={false}
              onClose={() => setForkOpen(false)}
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
