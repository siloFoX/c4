// 8.7: task history viewer.
// Pulls /api/history (history.jsonl), supports filter by worker name, status,
// and free-text search. Each row expands to show start/end time, branch,
// commits, and the full task text.

import { useEffect, useMemo, useState } from 'react';

interface HistoryRecord {
  name: string;
  task: string | null;
  branch: string | null;
  startedAt: string | null;
  completedAt: string | null;
  commits: string[];
  status?: string;
}

interface HistoryResponse {
  records?: HistoryRecord[];
  error?: string;
}

interface WorkerHistoryProps {
  workerFilter?: string;
}

function fmtTime(ts: string | null): string {
  if (!ts) return '-';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function durationMs(rec: HistoryRecord): number | null {
  if (!rec.startedAt || !rec.completedAt) return null;
  const a = Date.parse(rec.startedAt);
  const b = Date.parse(rec.completedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export default function WorkerHistory({ workerFilter }: WorkerHistoryProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        const params = new URLSearchParams();
        if (workerFilter) params.set('worker', workerFilter);
        params.set('limit', '500');
        const res = await fetch(`/api/history?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setRecords([]);
        } else {
          setRecords((data.records || []).slice().reverse()); // most recent first
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [workerFilter]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const r of records) if (r.status) s.add(r.status);
    return Array.from(s).sort();
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [r.name, r.task || '', r.branch || '', ...(r.commits || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [records, search, statusFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search task / branch / commit..."
          className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted/70 focus:border-blue-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex-1 overflow-auto rounded border border-border bg-background">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted/80">No history records.</div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="sticky top-0 bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Worker</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Branch</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Task</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const dur = durationMs(r);
                const isOpen = expanded === i;
                return (
                  <ExpandableRow
                    key={`${r.name}-${r.completedAt || r.startedAt || i}`}
                    rec={r}
                    duration={fmtDuration(dur)}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : i)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-2 text-right text-[11px] text-muted/80">
        {filtered.length} / {records.length} record{records.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}

interface ExpandableRowProps {
  rec: HistoryRecord;
  duration: string;
  isOpen: boolean;
  onToggle: () => void;
}

function statusClasses(status: string | undefined): string {
  switch (status) {
    case 'closed':
      return 'text-foreground/80';
    case 'merged':
      return 'text-emerald-300';
    case 'lost':
      return 'text-amber-300';
    case 'exited':
      return 'text-red-300';
    default:
      return 'text-muted';
  }
}

function ExpandableRow({ rec, duration, isOpen, onToggle }: ExpandableRowProps) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-border hover:bg-surface-2/60"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-mono text-foreground">{rec.name}</td>
        <td className={`px-3 py-2 font-medium ${statusClasses(rec.status)}`}>{rec.status || '-'}</td>
        <td className="px-3 py-2 font-mono text-muted">{rec.branch || '-'}</td>
        <td className="px-3 py-2 text-muted">{fmtTime(rec.startedAt)}</td>
        <td className="px-3 py-2 text-muted">{duration}</td>
        <td className="px-3 py-2 text-foreground/80">
          <div className="max-w-md truncate">{rec.task || <span className="text-muted/60">(no task)</span>}</div>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-border bg-surface-2/40">
          <td colSpan={6} className="px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Started">{fmtTime(rec.startedAt)}</Field>
              <Field label="Completed">{fmtTime(rec.completedAt)}</Field>
              <Field label="Branch">{rec.branch || '-'}</Field>
              <Field label="Status">{rec.status || '-'}</Field>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wide text-muted/80">Task</div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-3 font-mono text-[11px] text-foreground">
                {rec.task || '(no task)'}
              </pre>
            </div>
            {rec.commits && rec.commits.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted/80">
                  Commits ({rec.commits.length})
                </div>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-foreground/80">
                  {rec.commits.map((c, idx) => (
                    <li key={idx} className="truncate">{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted/80">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-foreground">{children}</div>
    </div>
  );
}
