// Audit log view (10.2). /api/audit?worker=&action=&actor=&since=&until=

import { useCallback, useEffect, useState } from 'react';
import { Shield } from 'lucide-react';

interface AuditRecord {
  ts: string;
  actor?: string;
  action?: string;
  worker?: string | null;
  ok?: boolean;
  error?: string | null;
  bodyKeys?: string[];
  bodySummary?: { task?: string };
}

interface Resp { records?: AuditRecord[]; error?: string }

export default function AuditView() {
  const [items, setItems] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ worker: '', action: '', actor: '', since: '' });

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      params.set('limit', '300');
      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Resp;
      if (data.error) setError(data.error);
      else { setItems(data.records || []); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, [filters]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Shield size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Audit</h2>
        <span className="ml-auto text-[11px] text-muted">{items.length} record(s)</span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Filter label="actor"  value={filters.actor}  onChange={(v) => setFilters({ ...filters, actor: v })} />
        <Filter label="action" value={filters.action} onChange={(v) => setFilters({ ...filters, action: v })} />
        <Filter label="worker" value={filters.worker} onChange={(v) => setFilters({ ...filters, worker: v })} />
        <Filter label="since (ISO)" value={filters.since} onChange={(v) => setFilters({ ...filters, since: v })} />
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface-2">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 bg-surface-3 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Worker</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Body</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-center text-muted">No audit records yet.</td></tr>
            )}
            {items.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2 text-muted">{new Date(r.ts).toLocaleString()}</td>
                <td className="px-3 py-2 font-mono">{r.actor}</td>
                <td className="px-3 py-2 font-mono">{r.action}</td>
                <td className="px-3 py-2 font-mono">{r.worker || '—'}</td>
                <td className="px-3 py-2">
                  {r.error
                    ? <span className="text-danger">{r.error}</span>
                    : <span className="text-success">ok</span>}
                </td>
                <td className="px-3 py-2 text-muted">
                  {r.bodySummary?.task
                    ? <span className="line-clamp-2 max-w-xs italic">{r.bodySummary.task}</span>
                    : (r.bodyKeys || []).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Filter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      className="rounded border border-border bg-surface-2 px-2 py-1 text-xs"
    />
  );
}
