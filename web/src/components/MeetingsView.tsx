import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Play, Plus, RefreshCw, Radio } from 'lucide-react';
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
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  currentStage: string | null;
  currentRound: number;
  stages: StageView[];
  transcripts: Turn[][];
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

  const handleCreate = useCallback(async () => {
    const task = newTask.trim();
    if (!task) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const body: { task: string; track?: string } = { task };
      if (newTrack !== 'auto') body.track = newTrack;
      const created = await apiPost<{ id: string }>('/api/meetings', body);
      setNewTask('');
      setCreating(false);
      await refresh();
      if (created && created.id) setSelectedId(created.id);
    } catch (e) {
      setCreateError((e as Error).message || 'Failed to create meeting');
    } finally {
      setCreateBusy(false);
    }
  }, [newTask, newTrack, refresh]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:p-6">
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
          {creating ? (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
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
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {error ? (
            <div className="p-4 text-sm text-destructive">{error}</div>
          ) : meetings.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              {loading ? 'Loading meetings...' : 'No meetings yet — `c4 meeting create "<task>"` to start one.'}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {meetings.map((m) => {
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
          )}
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
  );
}
