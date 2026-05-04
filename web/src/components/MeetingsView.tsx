import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Eye, MessageCircle, Play, Plus, RefreshCw, Radio, Search, X } from 'lucide-react';
import { apiGet, apiPost, eventSourceUrl } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';

// (multi-specialist phase 6) Meetings tab — list view + drill-in
// detail. Reads /api/meetings and /api/meetings/:id; the SSE
// stream wiring lands in a follow-up. Kept intentionally small so
// the page is usable today and we can iterate on detail UI without
// blocking the basic operator workflow.

type MeetingStatus =
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

interface StageView {
  stage: string;
  round: number;
  specialists: Array<{ id: string; displayName: string; vetoPower?: boolean }>;
  consensus: {
    mode: string;
    accepts: string[];
    objects: Array<{ id: string; reason: string | null }>;
    missing: string[];
    reached: boolean;
    round: number;
  };
}

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

// (Phase 6.9) Lineage chain entry — same shape the
// /meetings/:id/lineage endpoint returns per-step.
interface LineageEntry {
  id: string;
  status: MeetingStatus;
  title: string;
  track: string;
  createdAt: string;
  completedAt: string | null;
  forkOf: string | null;
}

interface LineageResponse {
  rootId: string | null;
  depth: number;
  chainTruncated: boolean;
  chain: LineageEntry[];
}

// (Phase 6.5) Action-items extracted from transcript markers.
type ActionItemType = 'decision' | 'action' | 'todo' | 'blocker';
interface ActionItem {
  type: ActionItemType;
  text: string;
  owner: string | null;
  stage: string;
  round: number;
  specialistId: string | null;
  ts: string | null;
}
interface ActionItemsResponse {
  count: number;
  byType: Record<ActionItemType, number>;
  items: ActionItem[];
}

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
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return dt.toISOString().slice(0, 10);
}

export default function MeetingsView() {
  const [data, setData] = useState<MeetingsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
  // Category filter for the action-items panel (client-side).
  // null = show all 4 categories. Otherwise just that one.
  const [actionsFilter, setActionsFilter] = useState<ActionItemType | null>(null);

  // (Phase 6.15) Stuck meetings alert. Polled every 60s; only
  // visible when count > 0.
  interface StuckEntry {
    id: string;
    status: MeetingStatus;
    track: string;
    title: string;
    ageHours: number;
  }
  const [stuck, setStuck] = useState<{ count: number; stuck: StuckEntry[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchStuck = () => {
      apiGet<{ count: number; stuck: StuckEntry[] }>('/api/meetings/stuck?hours=1')
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
      const res = await apiGet<MeetingsListResponse>('/api/meetings');
      setData(res);
    } catch (e) {
      setError((e as Error).message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll every 8s — meetings change often during a run, but a
  // dedicated SSE consumer (per-meeting) is the next slice.
  useEffect(() => {
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
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
          if (fromList) return fromList;
          return {
            id: r.id,
            status: r.status,
            track: '?',
            title: r.snippet || r.id,
            currentStage: null,
            currentRound: 0,
            createdAt: r.createdAt,
            startedAt: null,
            completedAt: null,
          };
        });
        setSearchResults(merged);
        setSearchFacets(res.facets || null);
        setSearchTotal(typeof res.total === 'number' ? res.total : null);
      } catch (e) {
        if (cancelled) return;
        setSearchError((e as Error).message || 'Search failed');
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
      setDetailError((e as Error).message || 'Failed to open meeting stream');
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

  // (8.4) Template-with-vars flow: when the operator picks a
  // template chip whose body contains `{{var}}` placeholders, we
  // surface a small per-var input row so they can supply values
  // before submit. The chip click stamps `templateName` so the
  // create POST passes `template:` + `vars:` instead of a literal
  // `task:` (lets the daemon do the substitution server-side and
  // keeps the UI cheap).
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const placeholderRe = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const placeholderNames = useMemo(() => {
    const out = new Set<string>();
    let m;
    placeholderRe.lastIndex = 0;
    while ((m = placeholderRe.exec(newTask)) !== null) out.add(m[1]);
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
      setRunError((e as Error).message || 'Failed to start meeting');
    } finally {
      setRunBusy(false);
    }
  }, [runBrain]);

  // Publish a terminal meeting to the wiki on demand (separate
  // from auto-publish which only fires inside /run).
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  // (Phase 3.4) git automation toggles. publish writes md-in-git;
  // gitCommit auto-commits via the daemon, gitPush also pushes.
  const [publishGitCommit, setPublishGitCommit] = useState(false);
  const [publishGitPush, setPublishGitPush] = useState(false);

  const handlePublish = useCallback(async (id: string) => {
    setPublishBusy(true);
    setPublishMsg(null);
    try {
      const res = await apiPost<{
        ok: boolean;
        written: string[];
        wikiRoot: string;
        git?: { committed: boolean; sha?: string; pushed?: boolean };
      }>(
        `/api/meetings/${encodeURIComponent(id)}/publish`,
        {
          includeRetro: true,
          apply: true,
          gitCommit: publishGitCommit,
          gitPush: publishGitPush,
        },
      );
      const n = (res && Array.isArray(res.written)) ? res.written.length : 0;
      let msg = `published ${n} file(s) to ${res && res.wikiRoot}`;
      if (res && res.git && res.git.committed) {
        msg += ` · git ${res.git.sha ? res.git.sha.slice(0, 7) : 'committed'}${res.git.pushed ? ' + pushed' : ''}`;
      }
      setPublishMsg(msg);
      window.setTimeout(() => setPublishMsg(null), 4000);
    } catch (e) {
      setPublishMsg(`publish failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setPublishBusy(false);
    }
  }, [publishGitCommit, publishGitPush]);

  // Peer-retro on terminal meetings (separate from outcome retro
  // — see meeting-peer-retro.js). Mock brain for instant
  // demo, claude for real ratings.
  const [peerRetroBusy, setPeerRetroBusy] = useState(false);
  const [peerRetroMsg, setPeerRetroMsg] = useState<string | null>(null);
  const [peerBrain, setPeerBrain] = useState<'mock' | 'claude'>('mock');

  const handlePeerRetro = useCallback(async (id: string) => {
    setPeerRetroBusy(true);
    setPeerRetroMsg(null);
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
      setPeerRetroMsg(`peer-retro ok — ${raters} raters, ${ratings} ratings, ${updated} specialist(s) updated`);
      window.setTimeout(() => setPeerRetroMsg(null), 6000);
    } catch (e) {
      setPeerRetroMsg(`peer-retro failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setPeerRetroBusy(false);
    }
  }, [peerBrain]);

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
      setCreateError((e as Error).message || 'Failed to create meeting');
    } finally {
      setCreateBusy(false);
    }
  }, [newTask, newTrack, refresh, templateName, templateVars]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:p-6">
      {/* (Phase 6.15) Stuck meetings banner. Only shown when count > 0. */}
      {stuck && stuck.count > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span className="font-medium">{stuck.count} meeting(s) stuck &gt;1h:</span>
          {stuck.stuck.slice(0, 5).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className="rounded border border-amber-500/40 bg-background/40 px-1.5 py-0 font-mono text-[10px] hover:bg-amber-500/20"
              title={`${s.title} · ${s.status} · ${s.ageHours.toFixed(1)}h old`}
            >
              {s.id} ({s.ageHours.toFixed(1)}h)
            </button>
          ))}
          {stuck.count > 5 ? (
            <span className="text-[10px] opacity-70">… and {stuck.count - 5} more</span>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Meetings</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { setCreating((v) => !v); setCreateError(null); }}
                aria-label="New meeting"
                aria-expanded={creating}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refresh}
                disabled={loading}
                aria-label="Refresh meetings list"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
                Refresh
              </Button>
            </div>
          </div>
          {/* (Phase 8.1) Full-text search. Empty query → bare list.
              Non-empty → list shows matches with bm25 ranking. */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcripts… (FTS5: phrases in quotes, * for prefix)"
                aria-label="Search meetings"
                className="h-8 pl-7 pr-7 text-[12px]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            {searching ? (
              <span className="text-[10px] text-muted-foreground">searching…</span>
            ) : null}
          </div>
          {/* (Phase 8.1.5) Filter chips — shown only while
              search is active. Empty value = no narrowing. */}
          {searchQuery.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <label className="flex items-center gap-1 text-muted-foreground">
                status:
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={searchStatus}
                  onChange={(e) => setSearchStatus(e.target.value as typeof searchStatus)}
                  aria-label="Filter by status"
                >
                  <option value="">any</option>
                  <option value="pending">pending</option>
                  <option value="in-progress">in-progress</option>
                  <option value="completed">completed</option>
                  <option value="escalated">escalated</option>
                  <option value="aborted">aborted</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                track:
                <select
                  className="rounded border border-border bg-background px-1 py-0.5"
                  value={searchTrack}
                  onChange={(e) => setSearchTrack(e.target.value as typeof searchTrack)}
                  aria-label="Filter by track"
                >
                  <option value="">any</option>
                  <option value="lightweight">lightweight</option>
                  <option value="standard">standard</option>
                  <option value="full">full</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                since:
                <input
                  type="date"
                  value={searchSince}
                  onChange={(e) => setSearchSince(e.target.value)}
                  className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  aria-label="Search since date"
                />
              </label>
              <label className="flex items-center gap-1 text-muted-foreground">
                until:
                <input
                  type="date"
                  value={searchUntil}
                  onChange={(e) => setSearchUntil(e.target.value)}
                  className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  aria-label="Search until date"
                />
              </label>
              {(searchSince || searchUntil) ? (
                <button
                  type="button"
                  onClick={() => { setSearchSince(''); setSearchUntil(''); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  clear dates
                </button>
              ) : null}
            </div>
          ) : null}
          {searchResults && searchFacets ? (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              <span>
                {typeof searchTotal === 'number' ? `${searchResults.length}/${searchTotal} matches` : `${searchResults.length} matches`}
              </span>
              {searchFacets.status && Object.keys(searchFacets.status).length > 0 ? (
                <span>· status: {Object.entries(searchFacets.status).map(([k, n]) => `${k}=${n}`).join(', ')}</span>
              ) : null}
              {searchFacets.track && Object.keys(searchFacets.track).length > 0 ? (
                <span>· track: {Object.entries(searchFacets.track).map(([k, n]) => `${k}=${n}`).join(', ')}</span>
              ) : null}
            </div>
          ) : null}
          {searchError ? (
            <div className="text-[11px] text-destructive">{searchError}</div>
          ) : null}
          {creating ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
              {templates.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">templates:</span>
                  {templates.map((tpl) => (
                    <Button
                      key={tpl.name}
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
                      aria-label={`Apply template ${tpl.name}`}
                      className="h-6 px-2 text-[11px]"
                    >
                      {tpl.name}
                    </Button>
                  ))}
                  {templateName ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTemplateName(null);
                        setTemplateVars({});
                      }}
                      aria-label="Clear template selection"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                    >
                      clear
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {templateName && placeholderNames.length > 0 ? (
                <div className="grid grid-cols-2 gap-1 rounded-md border border-border/40 bg-background/50 p-2 text-[11px]">
                  <span className="col-span-2 text-muted-foreground">
                    Template <span className="font-mono">{templateName}</span> needs values for:
                  </span>
                  {placeholderNames.map((name) => (
                    <label key={name} className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">{`{{${name}}}`}</span>
                      <Input
                        type="text"
                        value={templateVars[name] || ''}
                        onChange={(e) => setTemplateVars((v) => ({ ...v, [name]: e.target.value }))}
                        placeholder={name}
                        aria-label={`Value for ${name}`}
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
                placeholder='Task description (e.g. "rotate auth secret in production")'
                disabled={createBusy}
                aria-label="Meeting task"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-muted-foreground">
                  track:
                  <select
                    className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as typeof newTrack)}
                    disabled={createBusy}
                    aria-label="Meeting track"
                  >
                    <option value="auto">auto</option>
                    <option value="lightweight">lightweight</option>
                    <option value="standard">standard</option>
                    <option value="full">full</option>
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
                  aria-label="Create meeting"
                >
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setCreating(false); setCreateError(null); }}
                  disabled={createBusy}
                >
                  Cancel
                </Button>
                {createError ? (
                  <span className="text-[11px] text-destructive">{createError}</span>
                ) : null}
              </div>
              {previewPlan ? (
                <div className="rounded-md border border-border/60 bg-background p-2 text-[11px]">
                  <div className="font-medium">
                    Preview · track={previewPlan.track} · {previewPlan.rosterSize} specialists · ~{previewPlan.estimatedTokens.toLocaleString()} tokens
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
                <div className="text-[11px] text-muted-foreground">previewing roster…</div>
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
                    ? `No meetings match "${searchQuery}".`
                    : (loading ? 'Loading meetings...' : 'No meetings yet — `c4 meeting create "<task>"` to start one.')}
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
                        active ? 'bg-primary/10' : 'hover:bg-accent/40',
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
                            title={`forked from ${m.forkOf}`}
                          >
                            ← {m.forkOf.slice(0, 8)}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelative(m.startedAt || m.createdAt)}
                        </span>
                      </div>
                      <span className="truncate text-sm font-medium">{m.title}</span>
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
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-col gap-2 border-b border-border p-4">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {selectedSummary ? selectedSummary.title : 'Select a meeting'}
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
                title={streaming ? 'Receiving live state updates' : 'Reconnecting to stream'}
              >
                <Radio className="h-3 w-3" aria-hidden />
                {streaming ? 'live' : 'offline'}
              </span>
            ) : null}
          </div>
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-muted-foreground">
                brain:
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={runBrain}
                  onChange={(e) => setRunBrain(e.target.value as 'mock' | 'claude')}
                  disabled={runBusy}
                  aria-label="Run brain"
                >
                  <option value="mock">mock (instant)</option>
                  <option value="claude">claude (slow, real)</option>
                </select>
              </label>
              <Button
                size="sm"
                onClick={() => handleRun(selectedId)}
                disabled={runBusy}
                aria-label="Run meeting"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                Run + auto-finalize
              </Button>
              {runError ? (
                <span className="text-[11px] text-destructive">{runError}</span>
              ) : null}
            </div>
          ) : null}
          {selectedId && detail && ['completed', 'escalated'].includes(detail.status) ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePublish(selectedId)}
                disabled={publishBusy}
                aria-label="Publish meeting to wiki"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Publish to wiki
              </Button>
              {/* (Phase 3.4) git automation toggles. */}
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={publishGitCommit}
                  onChange={(e) => {
                    setPublishGitCommit(e.target.checked);
                    if (!e.target.checked) setPublishGitPush(false);
                  }}
                  disabled={publishBusy}
                  className="h-3 w-3"
                />
                git commit
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={publishGitPush}
                  onChange={(e) => {
                    setPublishGitPush(e.target.checked);
                    if (e.target.checked) setPublishGitCommit(true);
                  }}
                  disabled={publishBusy}
                  className="h-3 w-3"
                />
                + push
              </label>
              {publishMsg ? (
                <span className={cn(
                  'text-[11px]',
                  publishMsg.startsWith('publish failed')
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>{publishMsg}</span>
              ) : null}
              <span aria-hidden className="text-muted-foreground">·</span>
              <label className="text-[11px] text-muted-foreground">
                peer brain:
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={peerBrain}
                  onChange={(e) => setPeerBrain(e.target.value as 'mock' | 'claude')}
                  disabled={peerRetroBusy}
                  aria-label="Peer-retro brain"
                >
                  <option value="mock">mock</option>
                  <option value="claude">claude</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePeerRetro(selectedId)}
                disabled={peerRetroBusy}
                aria-label="Run peer retro"
                title="Each speaker rates their peers; aggregate folds into the registry score"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                Peer retro
              </Button>
              {peerRetroMsg ? (
                <span className={cn(
                  'text-[11px]',
                  peerRetroMsg.startsWith('peer-retro failed')
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>{peerRetroMsg}</span>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Eye className="mr-2 h-3.5 w-3.5" aria-hidden />
              Pick a meeting from the list to see its transcript.
            </div>
          ) : detailError ? (
            <div className="text-sm text-destructive">{detailError}</div>
          ) : !detail ? (
            <div className="text-sm text-muted-foreground">Loading meeting...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="font-medium">{detail.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Track</div>
                  <div className="font-medium">{detail.track}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Stage</div>
                  <div className="font-medium">{detail.currentStage || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Round</div>
                  <div className="font-medium">{detail.currentRound}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Task:</span> {detail.task}
              </div>
              {/* (Phase 6.9) Fork lineage. Show only when there's
                  more than the source meeting itself in the chain. */}
              {lineage && lineage.depth > 1 ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-2 text-[11px]">
                  <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                    <span className="font-medium text-foreground">Fork lineage</span>
                    <span>· depth={lineage.depth}</span>
                    {lineage.chainTruncated ? <span className="text-amber-600 dark:text-amber-400">· chain truncated (older ancestor purged)</span> : null}
                  </div>
                  <ol className="flex flex-wrap items-center gap-1">
                    {lineage.chain.map((entry, idx) => (
                      <li key={entry.id} className="flex items-center gap-1">
                        {idx > 0 ? <span className="text-muted-foreground">←</span> : null}
                        <button
                          type="button"
                          onClick={() => setSelectedId(entry.id)}
                          className={cn(
                            'rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                            entry.id === detail.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background hover:bg-accent/40',
                          )}
                          title={`${entry.title} · ${entry.status}`}
                        >
                          {entry.id}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {/* (Phase 6.5) Action-items extracted from transcript
                  markers. Rendered as 4 grouped lists with count
                  badges. Empty groups are omitted. */}
              {actions && actions.count > 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-[12px]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">Action Items</span>
                    {/* Category filter chips — null = all */}
                    <button
                      type="button"
                      onClick={() => setActionsFilter(null)}
                      className={cn(
                        'rounded border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                        actionsFilter === null
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-accent/40',
                      )}
                    >
                      all · {actions.count}
                    </button>
                    {(['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).map((kind) => {
                      if ((actions.byType[kind] || 0) === 0) return null;
                      const tone: Record<ActionItemType, string> = {
                        decision: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
                        action: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                        todo: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                        blocker: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
                      };
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setActionsFilter(actionsFilter === kind ? null : kind)}
                          className={cn(
                            'rounded border px-1.5 py-0 text-[10px] uppercase tracking-wide',
                            actionsFilter === kind ? tone[kind] : 'border-border bg-background text-muted-foreground hover:bg-accent/40',
                          )}
                        >
                          {kind} · {actions.byType[kind] || 0}
                        </button>
                      );
                    })}
                  </div>
                  {(['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).filter((k) => actionsFilter === null || actionsFilter === k).map((kind) => {
                    const group = actions.items.filter((it) => it.type === kind);
                    if (group.length === 0) return null;
                    const tone: Record<ActionItemType, string> = {
                      decision: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
                      action: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                      todo: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                      blocker: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400',
                    };
                    return (
                      <div key={kind} className="mb-2 last:mb-0">
                        <div className={cn('mb-1 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-wide', tone[kind])}>
                          {kind} · {group.length}
                        </div>
                        <ul className="space-y-1 pl-3">
                          {group.map((it, i) => (
                            <li key={i} className="leading-snug">
                              <span>{it.text}</span>
                              {it.owner ? (
                                <span className="ml-2 inline-flex items-center rounded border border-border bg-background px-1 py-0 font-mono text-[10px] text-muted-foreground">
                                  @{it.owner}
                                </span>
                              ) : null}
                              <span className="ml-2 text-[10px] text-muted-foreground">
                                {it.stage}/r{it.round}/{it.specialistId || '?'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="space-y-3">
                {detail.stages.map((stage, idx) => {
                  const turns = detail.transcripts[idx] || [];
                  return (
                    <div key={`${stage.stage}-${idx}`} className="rounded-md border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-medium">[{stage.stage}]</span>
                        <span className="text-muted-foreground">
                          consensus={stage.consensus.mode} · {stage.consensus.reached ? 'reached' : 'pending'}
                        </span>
                        <span className="text-muted-foreground">
                          accepts={stage.consensus.accepts.length} / objects={stage.consensus.objects.length} / missing={stage.consensus.missing.length}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        roster: {stage.specialists.map((s) => s.id).join(', ')}
                      </div>
                      {turns.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {turns.map((t, i) => (
                            <li key={i} className="text-[12px]">
                              <span className="font-mono text-muted-foreground">[r{t.round}]</span>{' '}
                              <span className="font-medium">{t.specialistId}:</span>{' '}
                              <span>{t.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-2 text-[11px] text-muted-foreground">(no turns yet)</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
