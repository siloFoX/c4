import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Eye, MessageCircle, Play, Plus, RefreshCw, Radio, Search, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, eventSourceUrl } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { renderSnippet } from '../lib/snippet';

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

// (Phase 6.10) Recap envelope — compact "first turn per stage" view.
interface RecapStage {
  stage: string;
  round: number;
  consensus: { reached: boolean; accepts: string[]; objects: Array<{ id: string; reason: string | null }>; missing: string[] } | null;
  turnCount: number;
  firstTurn: { specialistId: string | null; round: number; text: string; ts: string | null } | null;
}
interface RecapResponse {
  id: string;
  status: string;
  stages: RecapStage[];
  actions: { count: number; byType: Record<ActionItemType, number> };
  escalations: Array<{ ts: string; reason: string; terminal?: boolean }>;
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
  // Category filter for the action-items panel (client-side).
  // null = show all 4 categories. Otherwise just that one.
  const [actionsFilter, setActionsFilter] = useState<ActionItemType | null>(null);

  // (Phase 6.10) Recap envelope. Collapsed-by-default panel
  // showing first-turn per stage. Fetched on selection change AND
  // on transcript turn-count change so live SSE updates pick up
  // newly-first turns.
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);

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
      const params = new URLSearchParams();
      if (listStatus) params.set('status', listStatus);
      if (listTrack) params.set('track', listTrack);
      const url = params.toString() ? `/api/meetings?${params.toString()}` : '/api/meetings';
      const res = await apiGet<MeetingsListResponse>(url);
      setData(res);
    } catch (e) {
      setError((e as Error).message || 'Failed to load meetings');
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

  // (v1.10.344) Template CRUD — until now the UI only listed
  // saved templates. Operators wanting to create / update / delete
  // had to drop to the CLI (`c4 meeting template ...`). Adding
  // an inline editor on the composer's templates row.
  //
  // Editor opens on "+" / chip-edit. Save = POST upsert. Delete =
  // DELETE :name. Both refresh the list afterwards via
  // loadTemplates() — same call the composer-open effect uses.
  const [tplEditOpen, setTplEditOpen] = useState(false);
  const [tplEditMode, setTplEditMode] = useState<'create' | 'edit'>('create');
  const [tplOriginalName, setTplOriginalName] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplTask, setTplTask] = useState('');
  const [tplTrack, setTplTrack] = useState('');
  const [tplDescription, setTplDescription] = useState('');
  const [tplBusy, setTplBusy] = useState(false);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const openTplEditor = useCallback((tpl?: { name: string; task: string; track?: string | null; description?: string | null }) => {
    if (tpl) {
      setTplEditMode('edit');
      setTplOriginalName(tpl.name);
      setTplName(tpl.name);
      setTplTask(tpl.task);
      setTplTrack(tpl.track || '');
      setTplDescription(tpl.description || '');
    } else {
      setTplEditMode('create');
      setTplOriginalName('');
      setTplName('');
      setTplTask('');
      setTplTrack('');
      setTplDescription('');
    }
    setTplMsg(null);
    setTplEditOpen(true);
  }, []);
  const handleTplSave = useCallback(async () => {
    const name = tplName.trim();
    const task = tplTask.trim();
    if (!name || !task) {
      setTplMsg(t('meetings.template.nameTaskRequired'));
      return;
    }
    setTplBusy(true);
    setTplMsg(null);
    try {
      const body: {
        name: string;
        task: string;
        track?: string;
        description?: string;
      } = { name, task };
      if (tplTrack.trim()) body.track = tplTrack.trim();
      if (tplDescription.trim()) body.description = tplDescription.trim();
      await apiPost('/api/meetings/templates', body);
      // Editing under a different name is a rename — drop the
      // old record. The daemon doesn't have a rename op so we
      // upsert + delete-old.
      if (tplEditMode === 'edit' && tplOriginalName && tplOriginalName !== name) {
        await apiDelete(`/api/meetings/templates/${encodeURIComponent(tplOriginalName)}`);
      }
      setTplEditOpen(false);
      setTplMsg(null);
      void loadTemplates();
    } catch (e) {
      setTplMsg(`save failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setTplBusy(false);
    }
  }, [tplName, tplTask, tplTrack, tplDescription, tplEditMode, tplOriginalName, loadTemplates]);
  const handleTplDelete = useCallback(async () => {
    if (!tplOriginalName) return;
    if (!window.confirm(tFormat('meetings.confirmTplDelete', { name: tplOriginalName }))) return;
    setTplBusy(true);
    setTplMsg(null);
    try {
      await apiDelete(`/api/meetings/templates/${encodeURIComponent(tplOriginalName)}`);
      setTplEditOpen(false);
      // If the operator had this template selected for the new
      // meeting, clear it so the composer doesn't try to use a
      // deleted name.
      if (templateName === tplOriginalName) setTemplateName(null);
      void loadTemplates();
    } catch (e) {
      setTplMsg(`delete failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setTplBusy(false);
    }
  }, [tplOriginalName, templateName, loadTemplates]);

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
  const [contribOpen, setContribOpen] = useState(false);
  const [contribSpecialist, setContribSpecialist] = useState('');
  const [contribText, setContribText] = useState('');
  const [contribVote, setContribVote] = useState<'' | 'accept' | 'object'>('');
  const [contribReason, setContribReason] = useState('');
  const [contribBusy, setContribBusy] = useState(false);
  const [contribMsg, setContribMsg] = useState<string | null>(null);
  const handleContribute = useCallback(async (id: string) => {
    const sid = contribSpecialist.trim();
    const text = contribText.trim();
    if (!sid || !text) {
      setContribMsg(t('meetings.contribute.specialistTextRequired'));
      return;
    }
    setContribBusy(true);
    setContribMsg(null);
    try {
      const body: {
        specialistId: string;
        text: string;
        vote?: 'accept' | 'object' | null;
        reason?: string;
      } = { specialistId: sid, text };
      if (contribVote) body.vote = contribVote;
      if (contribReason.trim()) body.reason = contribReason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(id)}/contribute`, body);
      setContribText('');
      setContribReason('');
      setContribVote('');
      setContribMsg(t('meetings.contribute.recorded'));
      window.setTimeout(() => setContribMsg(null), 3000);
    } catch (e) {
      setContribMsg(`contribute failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setContribBusy(false);
    }
  }, [contribSpecialist, contribText, contribVote, contribReason]);
  const handleVoteOnly = useCallback(async (id: string, vote: 'accept' | 'object') => {
    const sid = contribSpecialist.trim();
    if (!sid) {
      setContribMsg(t('meetings.contribute.specialistRequired'));
      return;
    }
    setContribBusy(true);
    setContribMsg(null);
    try {
      const body: { specialistId: string; vote: 'accept' | 'object'; reason?: string } = { specialistId: sid, vote };
      if (contribReason.trim()) body.reason = contribReason.trim();
      await apiPost(`/api/meetings/${encodeURIComponent(id)}/vote`, body);
      setContribReason('');
      setContribMsg(`vote ${vote} recorded`);
      window.setTimeout(() => setContribMsg(null), 3000);
    } catch (e) {
      setContribMsg(`vote failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setContribBusy(false);
    }
  }, [contribSpecialist, contribReason]);
  // Reset on selection change
  useEffect(() => {
    setContribOpen(false);
    setContribSpecialist('');
    setContribText('');
    setContribVote('');
    setContribReason('');
    setContribMsg(null);
  }, [selectedId]);

  // (v1.10.345) Retro preview / finalize for terminal meetings.
  // Endpoints exist since phase 2.6; the web only had run with
  // autoFinalize. For meetings the operator wants to preview before
  // applying, surface explicit retro + finalize buttons next to
  // publish.
  const [retroBusy, setRetroBusy] = useState<'preview' | 'finalize' | null>(null);
  const [retroResult, setRetroResult] = useState<{
    deltas?: Record<string, unknown>;
    applied?: boolean;
    skipped?: boolean;
    note?: string;
  } | null>(null);
  const [retroError, setRetroError] = useState<string | null>(null);
  const handleRetro = useCallback(async (id: string, finalize: boolean) => {
    setRetroBusy(finalize ? 'finalize' : 'preview');
    setRetroError(null);
    setRetroResult(null);
    try {
      const path = finalize ? 'finalize' : 'retro';
      const res = await apiPost<typeof retroResult>(
        `/api/meetings/${encodeURIComponent(id)}/${path}`,
        {},
      );
      setRetroResult(res || { note: 'no payload' });
    } catch (e) {
      setRetroError(tFormat(
        finalize ? 'meetings.finalize.failed' : 'meetings.retro.failed',
        { error: (e as Error).message || t('common.unknown') },
      ));
    } finally {
      setRetroBusy(null);
    }
  }, []);
  useEffect(() => { setRetroResult(null); setRetroError(null); }, [selectedId]);

  // (v1.10.352) Fork meeting — POST /meetings/:id/fork. Used to
  // redo a meeting with a sharper question or scope. Two modes:
  //   - replan: re-runs dispatcher (rosters can change)
  //   - reuse:  deep-clones the source plan (same rosters)
  // Form shows up when the operator clicks "Fork…"; on submit
  // we navigate to the new meeting id so the operator immediately
  // lands on the freshly-spawned pending session.
  const [forkOpen, setForkOpen] = useState(false);
  const [forkMode, setForkMode] = useState<'replan' | 'reuse'>('replan');
  const [forkTask, setForkTask] = useState('');
  const [forkTitle, setForkTitle] = useState('');
  const [forkTrack, setForkTrack] = useState<'auto' | 'lightweight' | 'standard' | 'full'>('auto');
  const [forkBusy, setForkBusy] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);
  const handleFork = useCallback(async (id: string) => {
    setForkBusy(true);
    setForkError(null);
    try {
      const body: {
        mode: 'replan' | 'reuse';
        task?: string;
        title?: string;
        track?: 'lightweight' | 'standard' | 'full';
      } = { mode: forkMode };
      if (forkTask.trim()) body.task = forkTask.trim();
      if (forkTitle.trim()) body.title = forkTitle.trim();
      if (forkMode === 'replan' && forkTrack !== 'auto') body.track = forkTrack;
      const res = await apiPost<{
        id: string;
        status: string;
        track: string;
        title: string;
        task: string;
      }>(`/api/meetings/${encodeURIComponent(id)}/fork`, body);
      // Navigate operator to the new meeting; the SSE list stream
      // will surface the new row as it lands.
      setForkOpen(false);
      setForkTask('');
      setForkTitle('');
      await refresh();
      if (res && res.id) setSelectedId(res.id);
    } catch (e) {
      setForkError((e as Error).message || 'Fork failed');
    } finally {
      setForkBusy(false);
    }
  }, [forkMode, forkTask, forkTitle, forkTrack, refresh]);
  // Reset form on selection change
  useEffect(() => {
    setForkOpen(false);
    setForkTask('');
    setForkTitle('');
    setForkError(null);
  }, [selectedId]);

  // (v1.10.342) Maintenance — surfacing four ops endpoints from
  // an inline collapsible panel:
  //   GET  /meetings/persist-integrity (read-only health check)
  //   POST /meetings/persist-backup    (hot copy)
  //   POST /meetings/fts-rebuild       (force re-index)
  //   POST /meetings/prune-old         (delete with dry-run)
  // Each action keeps its own busy / message state so an operator
  // can run them independently. State is local — no global toast
  // pipeline yet.
  const [maintOpen, setMaintOpen] = useState(false);
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [integrityMsg, setIntegrityMsg] = useState<string | null>(null);
  const handleIntegrity = useCallback(async () => {
    setIntegrityBusy(true);
    setIntegrityMsg(null);
    try {
      const res = await apiGet<{ enabled: boolean; ok: boolean | null; errors: string[] }>(
        '/api/meetings/persist-integrity',
      );
      if (!res.enabled) {
        setIntegrityMsg(t('meetings.integrity.persistDisabled'));
      } else if (res.ok) {
        setIntegrityMsg(t('meetings.integrity.ok'));
      } else {
        setIntegrityMsg(`failed — ${res.errors.length} error(s): ${res.errors.slice(0, 3).join('; ')}`);
      }
    } catch (e) {
      setIntegrityMsg(`integrity failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setIntegrityBusy(false);
    }
  }, []);

  const [backupPath, setBackupPath] = useState('');
  const [backupForce, setBackupForce] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const handleBackup = useCallback(async () => {
    const path = backupPath.trim();
    if (!path) {
      setBackupMsg(t('meetings.backup.pathRequired'));
      return;
    }
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const res = await apiPost<{ ok: boolean; path: string; bytes: number | null }>(
        '/api/meetings/persist-backup',
        { path, force: backupForce },
      );
      setBackupMsg(`backup ok — ${res.path} (${res.bytes != null ? `${res.bytes} bytes` : 'size unknown'})`);
    } catch (e) {
      setBackupMsg(`backup failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setBackupBusy(false);
    }
  }, [backupPath, backupForce]);

  const [ftsBusy, setFtsBusy] = useState(false);
  const [ftsMsg, setFtsMsg] = useState<string | null>(null);
  const handleFtsRebuild = useCallback(async () => {
    setFtsBusy(true);
    setFtsMsg(null);
    try {
      const res = await apiPost<{ indexed: number; before: number; after: number }>(
        '/api/meetings/fts-rebuild',
        {},
      );
      setFtsMsg(`rebuilt — ${res.indexed} indexed (${res.before} → ${res.after})`);
    } catch (e) {
      setFtsMsg(`rebuild failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setFtsBusy(false);
    }
  }, []);

  const [pruneDays, setPruneDays] = useState('90');
  const [pruneTerminal, setPruneTerminal] = useState(true);
  const [pruneVacuum, setPruneVacuum] = useState(false);
  const [pruneBusy, setPruneBusy] = useState(false);
  const [pruneMsg, setPruneMsg] = useState<string | null>(null);
  const handlePrune = useCallback(async (dryRun: boolean) => {
    const daysNum = Number(pruneDays);
    if (!Number.isFinite(daysNum) || daysNum < 1) {
      setPruneMsg(t('meetings.prune.daysInvalid'));
      return;
    }
    if (!dryRun) {
      const scope = pruneTerminal
        ? t('meetings.prune.confirm.terminal')
        : t('meetings.prune.confirm.includes');
      const vacuumSuffix = pruneVacuum ? t('meetings.prune.confirm.vacuum') : '';
      if (!window.confirm(
        `${tFormat('meetings.prune.confirm.header', { days: daysNum })}\n` +
        `${scope}${vacuumSuffix}\n` +
        t('meetings.prune.confirm.footer'),
      )) return;
    }
    setPruneBusy(true);
    setPruneMsg(null);
    try {
      const res = await apiPost<{
        count: number;
        ids: string[];
        dryRun: boolean;
        cutoffISO: string;
      }>('/api/meetings/prune-old', {
        days: daysNum,
        terminalOnly: pruneTerminal,
        dryRun,
        vacuum: pruneVacuum,
      });
      const verb = res.dryRun ? 'would prune' : 'pruned';
      setPruneMsg(
        `${verb} ${res.count} meeting(s) older than ${res.cutoffISO}`,
      );
      if (!res.dryRun) refresh();
    } catch (e) {
      setPruneMsg(`prune failed: ${(e as Error).message || 'unknown'}`);
    } finally {
      setPruneBusy(false);
    }
  }, [pruneDays, pruneTerminal, pruneVacuum, refresh]);

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
                  <option value="in-progress">in-progress</option>
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
                  <option value="full">full</option>
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
              <span className="text-[10px] text-muted-foreground">searching…</span>
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
                  <option value="in-progress">in-progress</option>
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
                  <option value="full">full</option>
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
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-accent/40',
                      )}
                      title={`Filter by status=${k}`}
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
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-accent/40',
                      )}
                      title={`Filter by track=${k}`}
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
                <span className="text-muted-foreground">templates:</span>
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
                      aria-label={`Apply template ${tpl.name}`}
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
                      title={`Edit template ${tpl.name}`}
                      aria-label={`Edit template ${tpl.name}`}
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
              {/* (v1.10.344) Inline template editor. */}
              {tplEditOpen ? (
                <div className="flex flex-col gap-1 rounded-md border border-border bg-background/80 p-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {tplEditMode === 'edit'
                        ? tFormat('meetings.template.editorEdit', { name: tplOriginalName })
                        : t('meetings.template.editorNew')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTplEditOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={t('meetings.action.closeTemplateEditor')}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <Input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder={t('meetings.template.name.placeholder')}
                    aria-label={t('meetings.template.name.label')}
                    disabled={tplBusy}
                    className="h-7 text-[11px]"
                  />
                  <textarea
                    value={tplTask}
                    onChange={(e) => setTplTask(e.target.value)}
                    placeholder={t('meetings.template.task.placeholder')}
                    aria-label={t('meetings.template.task.label')}
                    disabled={tplBusy}
                    className="min-h-[80px] rounded border border-border bg-background p-2 text-[11px] font-mono"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-muted-foreground">
                      {t('meetings.label.track')}
                      <select
                        value={tplTrack}
                        onChange={(e) => setTplTrack(e.target.value)}
                        disabled={tplBusy}
                        aria-label={t('meetings.template.track.label')}
                        className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                      >
                        <option value="">auto</option>
                        <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                        <option value="standard">{t('meetings.mode.standard')}</option>
                        <option value="full">full</option>
                      </select>
                    </label>
                  </div>
                  <Input
                    type="text"
                    value={tplDescription}
                    onChange={(e) => setTplDescription(e.target.value)}
                    placeholder={t('meetings.template.description.placeholder')}
                    aria-label={t('meetings.template.description.label')}
                    disabled={tplBusy}
                    className="h-7 text-[11px]"
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleTplSave}
                      disabled={tplBusy || !tplName.trim() || !tplTask.trim()}
                      className="h-6 px-2 text-[10px]"
                    >
                      {tplBusy ? '…' : tplEditMode === 'edit' ? t('meetings.template.saveChanges') : t('meetings.template.create')}
                    </Button>
                    {tplEditMode === 'edit' ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleTplDelete}
                        disabled={tplBusy}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t('common.delete')}
                      </Button>
                    ) : null}
                    {tplMsg ? (
                      <span className={cn(
                        'truncate',
                        tplMsg.startsWith('save failed') || tplMsg.startsWith('delete failed') || tplMsg === 'name + task required'
                          ? 'text-destructive' : 'text-muted-foreground',
                      )}>
                        {tplMsg}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
                    <option value="auto">auto</option>
                    <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                    <option value="standard">{t('meetings.mode.standard')}</option>
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
        {/* (v1.10.342) Maintenance — collapsible footer with the
            four ops endpoints. Hidden by default so it doesn't
            distract from the normal flow. */}
        <div className="border-t border-border/60 bg-muted/10">
          <button
            type="button"
            onClick={() => setMaintOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
            aria-expanded={maintOpen}
          >
            <span className="font-medium">{t('meetings.maintenance.heading')}</span>
            <span className="font-mono text-[10px]">{maintOpen ? '▲' : '▼'}</span>
          </button>
          {maintOpen ? (
            <div className="flex flex-col gap-3 px-3 py-2 text-[11px]">
              {/* Integrity */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleIntegrity}
                    disabled={integrityBusy}
                    className="h-6 px-2 text-[10px]"
                    title={t('meetings.tooltip.integrity')}
                  >
                    {integrityBusy ? '…' : t('meetings.maintenance.integrity')}
                  </Button>
                  {integrityMsg ? (
                    <span className={cn(
                      'truncate',
                      integrityMsg.startsWith('failed') || integrityMsg.startsWith('integrity failed')
                        ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                      {integrityMsg}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* FTS rebuild */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFtsRebuild}
                  disabled={ftsBusy}
                  className="h-6 px-2 text-[10px]"
                  title={t('meetings.tooltip.fts')}
                >
                  {ftsBusy ? '…' : t('meetings.maintenance.fts')}
                </Button>
                {ftsMsg ? (
                  <span className={cn(
                    'truncate',
                    ftsMsg.startsWith('rebuild failed') ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {ftsMsg}
                  </span>
                ) : null}
              </div>
              {/* Backup */}
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="text"
                    value={backupPath}
                    onChange={(e) => setBackupPath(e.target.value)}
                    placeholder={t('meetings.maintenance.backupPath.placeholder')}
                    aria-label={t('meetings.maintenance.backupPath.label')}
                    className="h-6 max-w-xs px-2 text-[11px]"
                    disabled={backupBusy}
                  />
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={backupForce}
                      onChange={(e) => setBackupForce(e.target.checked)}
                      disabled={backupBusy}
                      className="h-3 w-3"
                    />
                    {t('meetings.label.forceOverwrite')}
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBackup}
                    disabled={backupBusy || !backupPath.trim()}
                    className="h-6 px-2 text-[10px]"
                    title={t('meetings.tooltip.backup')}
                  >
                    {backupBusy ? '…' : t('meetings.maintenance.backup')}
                  </Button>
                </div>
                {backupMsg ? (
                  <span className={cn(
                    'truncate',
                    backupMsg.startsWith('backup failed') || backupMsg === 'path required'
                      ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {backupMsg}
                  </span>
                ) : null}
              </div>
              {/* Prune */}
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-muted-foreground">
                    {t('meetings.label.days')}
                    <Input
                      type="number"
                      min={1}
                      value={pruneDays}
                      onChange={(e) => setPruneDays(e.target.value)}
                      className="h-6 w-16 px-2 text-[11px]"
                      disabled={pruneBusy}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={pruneTerminal}
                      onChange={(e) => setPruneTerminal(e.target.checked)}
                      disabled={pruneBusy}
                      className="h-3 w-3"
                    />
                    terminal-only
                  </label>
                  <label className="flex items-center gap-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={pruneVacuum}
                      onChange={(e) => setPruneVacuum(e.target.checked)}
                      disabled={pruneBusy}
                      className="h-3 w-3"
                    />
                    {t('meetings.label.vacuum')}
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePrune(true)}
                    disabled={pruneBusy}
                    className="h-6 px-2 text-[10px]"
                    title={t('meetings.tooltip.dryRun')}
                  >
                    {pruneBusy ? '…' : t('meetings.maintenance.dryRun')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handlePrune(false)}
                    disabled={pruneBusy}
                    className="h-6 px-2 text-[10px]"
                    title={t('meetings.tooltip.prune')}
                  >
                    {pruneBusy ? '…' : t('meetings.maintenance.prune')}
                  </Button>
                </div>
                {pruneMsg ? (
                  <span className={cn(
                    'truncate',
                    pruneMsg.startsWith('prune failed') || pruneMsg.startsWith('days must')
                      ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {pruneMsg}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
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
              <span className="text-[11px] text-muted-foreground">manual:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setContribOpen((v) => !v)}
                disabled={contribBusy}
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
                  'Mark this meeting as escalated? (round cap or veto deadlock)',
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
                  'Abort this meeting? Mutations refused after.',
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
          {selectedId && detail && detail.status === 'in-progress' && contribOpen ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/10 p-2 text-[11px]">
              <Input
                type="text"
                value={contribSpecialist}
                onChange={(e) => setContribSpecialist(e.target.value)}
                placeholder={t('meetings.contribute.specialistId.placeholder')}
                aria-label={t('meetings.contribute.specialistId.label')}
                disabled={contribBusy}
                className="h-7 text-[11px] font-mono"
              />
              <textarea
                value={contribText}
                onChange={(e) => setContribText(e.target.value)}
                placeholder={t('meetings.contribute.body.placeholder')}
                aria-label={t('meetings.contribute.body.label')}
                disabled={contribBusy}
                className="min-h-[64px] rounded border border-border bg-background p-2 text-[11px]"
              />
              <Input
                type="text"
                value={contribReason}
                onChange={(e) => setContribReason(e.target.value)}
                placeholder={t('meetings.contribute.reason.placeholder')}
                aria-label={t('meetings.contribute.reason.label')}
                disabled={contribBusy}
                className="h-7 text-[11px]"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="flex items-center gap-1 text-muted-foreground">
                  vote (with contrib):
                  <select
                    value={contribVote}
                    onChange={(e) => setContribVote(e.target.value as '' | 'accept' | 'object')}
                    disabled={contribBusy}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  >
                    <option value="">{t('meetings.option.none')}</option>
                    <option value="accept">{t('meetings.option.accept')}</option>
                    <option value="object">{t('meetings.option.object')}</option>
                  </select>
                </label>
                <Button
                  size="sm"
                  onClick={() => handleContribute(selectedId)}
                  disabled={contribBusy || !contribSpecialist.trim() || !contribText.trim()}
                  className="h-6 px-2 text-[10px]"
                  aria-label={t('meetings.contribute.post.label')}
                >
                  {contribBusy ? '…' : t('meetings.contribute.post')}
                </Button>
                <span className="text-border">|</span>
                <span className="text-muted-foreground">{t('meetings.contribute.voteOnly')}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleVoteOnly(selectedId, 'accept')}
                  disabled={contribBusy || !contribSpecialist.trim()}
                  className="h-6 px-2 text-[10px]"
                  aria-label={t('meetings.contribute.voteAccept.label')}
                >
                  {t('meetings.action.acceptLabel')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleVoteOnly(selectedId, 'object')}
                  disabled={contribBusy || !contribSpecialist.trim()}
                  className="h-6 px-2 text-[10px]"
                  aria-label={t('meetings.contribute.voteObject.label')}
                >
                  {t('meetings.action.objectLabel')}
                </Button>
                {contribMsg ? (
                  <span className={cn(
                    'truncate',
                    contribMsg.startsWith('contribute failed') ||
                    contribMsg.startsWith('vote failed') ||
                    contribMsg === 'specialistId + text required' ||
                    contribMsg === 'specialistId required for vote-only'
                      ? 'text-destructive' : 'text-muted-foreground',
                  )}>
                    {contribMsg}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedId && detail && detail.status === 'pending' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">or manually:</span>
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePublish(selectedId)}
                disabled={publishBusy}
                aria-label={t('meetings.publish.label')}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                {t('meetings.publish.button')}
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
                {t('meetings.gitCommit')}
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
                {t('meetings.gitPush')}
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
                {t('meetings.peerBrain.label')}
                <select
                  className="ml-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                  value={peerBrain}
                  onChange={(e) => setPeerBrain(e.target.value as 'mock' | 'claude')}
                  disabled={peerRetroBusy}
                  aria-label={t('meetings.peerBrain.aria')}
                >
                  <option value="mock">mock</option>
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
                  peerRetroMsg.startsWith('peer-retro failed')
                    ? 'text-destructive' : 'text-muted-foreground',
                )}>{peerRetroMsg}</span>
              ) : null}
              {/* (v1.10.345) Retro preview / finalize. */}
              <span aria-hidden className="text-muted-foreground">·</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRetro(selectedId, false)}
                disabled={retroBusy !== null}
                aria-label={t('meetings.retroPreviewLabel')}
                title={t('meetings.tooltip.retroPreview')}
                className="h-6 px-2 text-[10px]"
              >
                {retroBusy === 'preview' ? '…' : t('meetings.retroPreview')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRetro(selectedId, true)}
                disabled={retroBusy !== null}
                aria-label={t('meetings.finalizeLabel')}
                title={t('meetings.tooltip.finalize')}
                className="h-6 px-2 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300"
              >
                {retroBusy === 'finalize' ? '…' : t('meetings.finalize')}
              </Button>
              {retroError ? (
                <span className="text-[11px] text-destructive">{retroError}</span>
              ) : null}
              {retroResult ? (
                <span className="text-[11px] text-muted-foreground" title={JSON.stringify(retroResult)}>
                  retro: {retroResult.applied
                    ? 'applied'
                    : retroResult.skipped
                    ? `skipped${retroResult.note ? ` (${retroResult.note})` : ''}`
                    : retroResult.deltas
                    ? `${Object.keys(retroResult.deltas).length} delta(s)`
                    : 'ok'}
                </span>
              ) : null}
              {/* (v1.10.352) Fork button — opens an inline form. */}
              <span aria-hidden className="text-muted-foreground">·</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setForkOpen((v) => !v)}
                disabled={forkBusy}
                aria-label={t('meetings.fork.button.label')}
                title={t('meetings.tooltip.fork')}
                className="h-6 px-2 text-[10px]"
                aria-expanded={forkOpen}
              >
                {forkOpen ? t('meetings.cancelFork') : t('meetings.fork.button')}
              </Button>
            </div>
          ) : null}
          {/* Fork form — shown only when terminal + opened. */}
          {selectedId && detail && ['completed', 'escalated'].includes(detail.status) && forkOpen ? (
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/10 p-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-muted-foreground">
                  {t('meetings.label.mode')}
                  <select
                    value={forkMode}
                    onChange={(e) => setForkMode(e.target.value as 'replan' | 'reuse')}
                    disabled={forkBusy}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  >
                    <option value="replan">replan (re-run dispatcher)</option>
                    <option value="reuse">reuse (deep-clone plan)</option>
                  </select>
                </label>
                {forkMode === 'replan' ? (
                  <label className="flex items-center gap-1 text-muted-foreground">
                    {t('meetings.label.track')}
                    <select
                      value={forkTrack}
                      onChange={(e) => setForkTrack(e.target.value as typeof forkTrack)}
                      disabled={forkBusy}
                      className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                    >
                      <option value="auto">{t('meetings.option.sameAsSource')}</option>
                      <option value="lightweight">{t('meetings.mode.lightweight')}</option>
                      <option value="standard">{t('meetings.mode.standard')}</option>
                      <option value="full">full</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <Input
                type="text"
                value={forkTitle}
                onChange={(e) => setForkTitle(e.target.value)}
                placeholder={`title override (default: ${detail.title || 'same as source'})`}
                aria-label={t('meetings.fork.title.label')}
                disabled={forkBusy}
                className="h-7 text-[11px]"
              />
              <textarea
                value={forkTask}
                onChange={(e) => setForkTask(e.target.value)}
                placeholder={t('meetings.fork.task.placeholder')}
                aria-label={t('meetings.fork.task.label')}
                disabled={forkBusy}
                className="min-h-[64px] rounded border border-border bg-background p-2 text-[11px]"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleFork(selectedId)}
                  disabled={forkBusy}
                  className="h-6 px-2 text-[10px]"
                  aria-label={t('meetings.fork.submit.label')}
                >
                  {forkBusy ? '…' : `Fork (${forkMode})`}
                </Button>
                {forkError ? (
                  <span className="text-destructive">{forkError}</span>
                ) : null}
              </div>
            </div>
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
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">{t('meetings.field.status')}</div>
                  <div className="font-medium">{detail.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('meetings.field.track')}</div>
                  <div className="font-medium">{detail.track}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('meetings.field.stage')}</div>
                  <div className="font-medium">{detail.currentStage || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('meetings.field.round')}</div>
                  <div className="font-medium">{detail.currentRound}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{t('meetings.field.task')}</span> {detail.task}
              </div>
              {/* (Phase 6.9) Fork lineage. Show only when there's
                  more than the source meeting itself in the chain. */}
              {lineage && lineage.depth > 1 ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-2 text-[11px]">
                  <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{t('meetings.forkLineage')}</span>
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
              {/* (Phase 6.10) Recap quick-summary — collapsed by
                  default. First contribution per stage. */}
              {recap && recap.stages.some((s) => s.firstTurn) ? (
                <div className="rounded-md border border-border/60 bg-muted/10">
                  <button
                    type="button"
                    onClick={() => setRecapOpen((v) => !v)}
                    className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    aria-expanded={recapOpen}
                  >
                    <span>{recapOpen ? '▾' : '▸'}</span>
                    <span className="font-medium">{t('meetings.recap')}</span>
                    <span>· first turn per stage</span>
                  </button>
                  {recapOpen ? (
                    <div className="border-t border-border/40 p-3 text-[11px]">
                      <ul className="space-y-2">
                        {recap.stages.map((s, idx) => s.firstTurn ? (
                          <li key={`${s.stage}-${idx}`}>
                            <div className="font-mono text-muted-foreground">
                              [{s.stage}]{' '}
                              <span className="font-medium text-foreground">{s.firstTurn.specialistId || '?'}</span>
                              {' '}r{s.firstTurn.round} · {s.turnCount} turn{s.turnCount === 1 ? '' : 's'}
                            </div>
                            <div className="mt-0.5 line-clamp-3">{s.firstTurn.text}</div>
                          </li>
                        ) : null)}
                      </ul>
                      {recap.escalations.length > 0 ? (
                        <div className="mt-3">
                          <div className="font-medium text-amber-700 dark:text-amber-400">{tFormat('meetings.escalations.format', { n: String(recap.escalations.length) })}</div>
                          <ul className="mt-1 space-y-0.5">
                            {recap.escalations.map((e, i) => (
                              <li key={i} className="text-muted-foreground">
                                {e.ts ? <span className="font-mono">{new Date(e.ts).toLocaleString()}</span> : null}
                                {' '}— {e.reason}{e.terminal ? ' (terminal)' : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {/* (Phase 6.5) Action-items extracted from transcript
                  markers. Rendered as 4 grouped lists with count
                  badges. Empty groups are omitted. */}
              {actions && actions.count > 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-[12px]">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t('meetings.actionItems')}</span>
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
                    {/* (v1.10.351) Export buttons — operators hand
                        items off to a tracker. JSON for tools,
                        Markdown for chat / docs. ml-auto pushes them
                        to the right edge of the chip row. */}
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(actions, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `action-items-${selectedId}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
                      title={t('meetings.tooltip.downloadActions')}
                    >
                      ⬇ JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const lines: string[] = [];
                        (['decision', 'action', 'todo', 'blocker'] as ActionItemType[]).forEach((k) => {
                          const group = actions.items.filter((it) => it.type === k);
                          if (group.length === 0) return;
                          lines.push(`## ${k.toUpperCase()} (${group.length})`);
                          group.forEach((it) => {
                            lines.push(`- ${it.text}`);
                          });
                          lines.push('');
                        });
                        const md = lines.join('\n').trim();
                        navigator.clipboard.writeText(md).catch(() => { /* ignore */ });
                      }}
                      className="rounded border border-border bg-background px-1.5 py-0 text-[10px] text-muted-foreground hover:bg-accent/40"
                      title={t('meetings.tooltip.copyActionsMd')}
                    >
                      ⧉ MD
                    </button>
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
