import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  GitBranch,
  Hash,
  History as HistoryIcon,
  NotebookText,
  Search,
  X,
} from 'lucide-react';
import { apiGet } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Panel,
  type BadgeProps,
} from './ui';
import { cn } from '../lib/cn';

export interface HistoryCommit {
  hash: string;
  message: string;
}

export interface HistoryRecord {
  name: string | null;
  task: string | null;
  branch: string | null;
  startedAt: string | null;
  completedAt: string | null;
  commits: HistoryCommit[];
  status: string | null;
}

export interface HistoryWorkerSummary {
  name: string;
  taskCount: number;
  firstTaskAt: string | null;
  lastTaskAt: string | null;
  lastTask: string | null;
  lastStatus: string | null;
  branches: string[];
  alive: boolean;
  liveStatus: string | null;
}

export interface HistoryListResponse {
  records: HistoryRecord[];
  workers: HistoryWorkerSummary[];
  total: number;
}

export interface HistoryScrollback {
  content: string;
  lines: number;
  totalScrollback: number;
}

export interface HistoryWorkerDetail {
  name: string;
  records: HistoryRecord[];
  alive: boolean;
  status: string | null;
  branch: string | null;
  worktree: string | null;
  scrollback: HistoryScrollback | null;
}

export interface ScribeContextResponse {
  exists: boolean;
  path: string;
  size: number;
  updatedAt: string | null;
  truncated?: boolean;
  content: string;
  error?: string;
}

type BadgeVariant = NonNullable<BadgeProps['variant']>;

function toIsoDayStart(dayStr: string): string {
  if (!dayStr) return '';
  return `${dayStr}T00:00:00.000Z`;
}

function toIsoDayEnd(dayStr: string): string {
  if (!dayStr) return '';
  return `${dayStr}T23:59:59.999Z`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 19);
}

function recordStatusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'secondary';
  const s = status.toLowerCase();
  if (s.includes('error') || s.includes('fail')) return 'destructive';
  if (s.includes('ok') || s.includes('complete') || s.includes('merged')) return 'success';
  if (s.includes('pending') || s.includes('busy')) return 'warning';
  return 'outline';
}

export default function HistoryView() {
  const [summary, setSummary] = useState<HistoryWorkerSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryWorkerDetail | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sinceDay, setSinceDay] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [showScribe, setShowScribe] = useState(false);
  const [scribe, setScribe] = useState<ScribeContextResponse | null>(null);
  const [loadingScribe, setLoadingScribe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (statusFilter) params.set('status', statusFilter);
      if (sinceDay) params.set('since', toIsoDayStart(sinceDay));
      if (untilDay) params.set('until', toIsoDayEnd(untilDay));
      const qs = params.toString();
      const url = qs ? `/api/history?${qs}` : '/api/history';
      const data = await apiGet<HistoryListResponse>(url);
      setSummary(Array.isArray(data.workers) ? data.workers : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query, statusFilter, sinceDay, untilDay]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const fetchDetail = useCallback(async (name: string) => {
    try {
      const data = await apiGet<HistoryWorkerDetail>(
        `/api/history/${encodeURIComponent(name)}`,
      );
      setDetail(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    fetchDetail(selected);
  }, [selected, fetchDetail]);

  const openScribe = useCallback(async () => {
    setShowScribe(true);
    setLoadingScribe(true);
    try {
      const data = await apiGet<ScribeContextResponse>('/api/scribe-context');
      setScribe(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingScribe(false);
    }
  }, []);

  const closeScribe = () => setShowScribe(false);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <aside className="w-full shrink-0 overflow-y-auto border-b border-border bg-card p-4 md:w-80 md:border-b-0 md:border-r">
        <Card className="border-none bg-transparent shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-2 p-0">
            <div className="flex items-center gap-2">
              <HistoryIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                History
              </CardTitle>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={openScribe}>
              <NotebookText className="h-3.5 w-3.5" />
              <span>
                Scribe
              </span>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-0 pt-3">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name / task / branch"
                className="h-9 pl-8 text-sm"
                aria-label="Search history"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn(
                'h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
              )}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="closed">closed</option>
              <option value="exited">exited</option>
            </select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={sinceDay}
                onChange={(e) => setSinceDay(e.target.value)}
                className="h-9 flex-1 text-xs"
                aria-label="Since date"
              />
              <Input
                type="date"
                value={untilDay}
                onChange={(e) => setUntilDay(e.target.value)}
                className="h-9 flex-1 text-xs"
                aria-label="Until date"
              />
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
              >
                {error}
              </div>
            )}
            {summary.length === 0 && !error && (
              <div className="text-xs text-muted-foreground">No history yet.</div>
            )}
            <ul className="space-y-1">
              {(query
                ? summary.filter((w) => {
                    const needle = query.toLowerCase();
                    if (w.name.toLowerCase().includes(needle)) return true;
                    if (w.lastTask && w.lastTask.toLowerCase().includes(needle)) return true;
                    if (w.branches.some((b) => b.toLowerCase().includes(needle))) return true;
                    return false;
                  })
                : summary
              ).map((w) => {
                const isSelected = selected === w.name;
                return (
                  <li key={w.name}>
                    <button
                      type="button"
                      onClick={() => setSelected(w.name)}
                      className={cn(
                        'w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground ring-1 ring-ring'
                          : 'bg-muted/30 text-foreground hover:bg-muted'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{w.name}</span>
                        <Badge
                          variant={w.alive ? 'success' : 'secondary'}
                          className="shrink-0 text-[10px] uppercase"
                        >
                          {w.alive ? w.liveStatus || 'live' : 'closed'}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {w.taskCount} task{w.taskCount !== 1 ? 's' : ''}
                        {w.lastTaskAt ? ` - ${w.lastTaskAt.slice(0, 10)}` : ''}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
        {showScribe ? (
          <Card className="flex h-full min-h-0 min-w-0 flex-col">
            <CardHeader className="flex-row items-center justify-between gap-2 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <NotebookText aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Scribe session-context.md</CardTitle>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={closeScribe}>
                <X className="h-3.5 w-3.5" />
                <span>Close</span>
              </Button>
            </CardHeader>
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4 pt-0 md:p-5 md:pt-0">
              {loadingScribe ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : !scribe ? (
                <div className="text-sm text-muted-foreground">
                  Open the viewer to load the scribe file.
                </div>
              ) : !scribe.exists ? (
                <div className="text-sm text-muted-foreground">
                  No scribe context file at {scribe.path}.
                </div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    {scribe.path} - {scribe.size} bytes
                    {scribe.updatedAt ? ` - updated ${scribe.updatedAt}` : ''}
                    {scribe.truncated ? ' - (tail truncated)' : ''}
                  </div>
                  <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs text-foreground">
                    {scribe.content}
                  </pre>
                </>
              )}
            </CardContent>
          </Card>
        ) : detail ? (
          <HistoryDetailPane detail={detail} />
        ) : (
          <Card>
            <CardHeader className="p-4 md:p-5">
              <CardTitle>Worker history</CardTitle>
              <CardDescription>
                Select a worker from the left to view its tasks and scrollback.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  );
}

interface HistoryDetailPaneProps {
  detail: HistoryWorkerDetail;
}

function HistoryDetailPane({ detail }: HistoryDetailPaneProps) {
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="p-4 md:p-5">
        <CardTitle>{detail.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.alive ? 'success' : 'secondary'} className="uppercase">
            {detail.alive ? detail.status || 'live' : 'closed / exited'}
          </Badge>
          {detail.branch && (
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
              {detail.branch}
            </span>
          )}
          {detail.worktree && (
            <span className="truncate font-mono text-xs">{detail.worktree}</span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 pt-0 md:p-5 md:pt-0">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            Past tasks ({detail.records.length})
          </h3>
          {detail.records.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recorded tasks.</div>
          ) : (
            <ul className="space-y-2">
              {detail.records.map((r, i) => (
                <Panel
                  key={`${r.completedAt || i}-${i}`}
                  className="text-xs text-foreground"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex-1 whitespace-pre-wrap break-words font-medium">
                      {r.task || '(no task text)'}
                    </span>
                    <Badge variant={recordStatusVariant(r.status)} className="shrink-0 uppercase">
                      {r.status || 'unknown'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {r.branch && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <GitBranch aria-hidden="true" className="h-3 w-3" />
                        {r.branch}
                      </span>
                    )}
                    <span className="font-mono">{formatDate(r.startedAt) || '?'}</span>
                    {r.completedAt && (
                      <span className="font-mono">-&gt; {formatDate(r.completedAt)}</span>
                    )}
                  </div>
                  {r.commits.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {r.commits.map((c, j) => (
                        <li key={`${c.hash}-${j}`} className="flex items-start gap-1">
                          <Hash aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                          <code className="mr-1 text-foreground">{c.hash}</code>
                          <span className="min-w-0 break-words">{c.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-h-0 flex-1 flex-col">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scrollback
          </h3>
          {detail.scrollback ? (
            <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-xs text-foreground">
              {detail.scrollback.content}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">
              No live scrollback (worker not running).
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
