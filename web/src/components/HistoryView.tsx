import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

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
      <aside className="w-full shrink-0 overflow-y-auto border-b border-gray-800 bg-gray-900 p-4 md:w-80 md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">
            History
          </h2>
          <button
            type="button"
            onClick={openScribe}
            className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-600"
            title="Open scribe session-context.md"
          >
            Scribe
          </button>
        </div>
        <div className="mb-3 flex flex-col gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / task / branch"
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100 placeholder-gray-500"
            aria-label="Search history"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="closed">closed</option>
            <option value="exited">exited</option>
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={sinceDay}
              onChange={(e) => setSinceDay(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
              aria-label="Since date"
            />
            <input
              type="date"
              value={untilDay}
              onChange={(e) => setUntilDay(e.target.value)}
              className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-100"
              aria-label="Until date"
            />
          </div>
        </div>
        {error && (
          <div className="mb-2 rounded bg-red-900/40 p-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {summary.length === 0 && !error && (
          <div className="text-xs text-gray-500">No history yet.</div>
        )}
        <ul className="space-y-1">
          {summary.map((w) => (
            <li key={w.name}>
              <button
                type="button"
                onClick={() => setSelected(w.name)}
                className={`w-full rounded px-2 py-1 text-left text-sm transition ${
                  selected === w.name
                    ? 'bg-gray-700 ring-1 ring-blue-500'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-gray-100">{w.name}</span>
                  <span
                    className={`text-[10px] uppercase ${
                      w.alive ? 'text-green-400' : 'text-gray-500'
                    }`}
                  >
                    {w.alive ? w.liveStatus || 'live' : 'closed'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {w.taskCount} task{w.taskCount !== 1 ? 's' : ''}
                  {w.lastTaskAt ? ` · ${w.lastTaskAt.slice(0, 10)}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
        {showScribe ? (
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-200">
                Scribe session-context.md
              </h2>
              <button
                type="button"
                onClick={closeScribe}
                className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-600"
              >
                Close
              </button>
            </div>
            {loadingScribe ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : !scribe ? (
              <div className="text-sm text-gray-400">Open the viewer to load the scribe file.</div>
            ) : !scribe.exists ? (
              <div className="text-sm text-gray-400">
                No scribe context file at {scribe.path}.
              </div>
            ) : (
              <>
                <div className="mb-2 text-xs text-gray-500">
                  {scribe.path} · {scribe.size} bytes
                  {scribe.updatedAt ? ` · updated ${scribe.updatedAt}` : ''}
                  {scribe.truncated ? ' · (tail truncated)' : ''}
                </div>
                <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-3 text-xs text-gray-200">
                  {scribe.content}
                </pre>
              </>
            )}
          </div>
        ) : detail ? (
          <HistoryDetailPane detail={detail} />
        ) : (
          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-200">Worker history</h2>
            <p className="text-sm text-gray-400">
              Select a worker from the left to view its tasks and scrollback.
            </p>
          </div>
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
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-100">{detail.name}</h2>
        <div className="text-xs text-gray-500">
          {detail.alive
            ? `live${detail.status ? ` · ${detail.status}` : ''}`
            : 'closed / exited'}
          {detail.branch ? ` · ${detail.branch}` : ''}
          {detail.worktree ? ` · ${detail.worktree}` : ''}
        </div>
      </div>
      <section className="mb-4 flex-shrink-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Past tasks ({detail.records.length})
        </h3>
        {detail.records.length === 0 ? (
          <div className="text-sm text-gray-400">No recorded tasks.</div>
        ) : (
          <ul className="space-y-2">
            {detail.records.map((r, i) => (
              <li
                key={`${r.completedAt || i}-${i}`}
                className="rounded bg-gray-800 p-2 text-xs text-gray-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1 whitespace-pre-wrap break-words font-medium">
                    {r.task || '(no task text)'}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-gray-500">
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {r.branch ? `${r.branch} · ` : ''}
                  {formatDate(r.startedAt) || '?'}
                  {r.completedAt ? ` -> ${formatDate(r.completedAt)}` : ''}
                </div>
                {r.commits.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-gray-400">
                    {r.commits.map((c, j) => (
                      <li key={`${c.hash}-${j}`}>
                        <code className="mr-1 text-gray-300">{c.hash}</code>
                        {c.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Scrollback
        </h3>
        {detail.scrollback ? (
          <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded bg-gray-950 p-2 text-xs text-gray-200">
            {detail.scrollback.content}
          </pre>
        ) : (
          <div className="text-sm text-gray-400">
            No live scrollback (worker not running).
          </div>
        )}
      </section>
    </div>
  );
}
