import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { apiGet } from '../lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from './ui';
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

  useEffect(() => {
    let cancelled = false;
    if (!selectedId) { setDetail(null); return; }
    const fetchDetail = async () => {
      setDetailError(null);
      try {
        const res = await apiGet<MeetingDetail>(`/api/meetings/${encodeURIComponent(selectedId)}`);
        if (!cancelled) setDetail(res);
      } catch (e) {
        if (!cancelled) setDetailError((e as Error).message || 'Failed to load meeting');
      }
    };
    fetchDetail();
    const id = window.setInterval(fetchDetail, 4000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [selectedId]);

  const meetings = data?.meetings || [];
  const selectedSummary = useMemo(
    () => meetings.find((m) => m.id === selectedId) || null,
    [meetings, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:p-6">
      <Card className="flex min-h-0 flex-1 flex-col md:max-w-md">
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border p-4">
          <CardTitle className="text-base">Meetings</CardTitle>
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
        <CardHeader className="border-b border-border p-4">
          <CardTitle className="text-base">
            {selectedSummary ? selectedSummary.title : 'Select a meeting'}
          </CardTitle>
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
