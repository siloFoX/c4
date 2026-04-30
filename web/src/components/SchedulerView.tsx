// Scheduler view (10.7). /api/schedules → list + add/remove/enable/run.

import { useCallback, useEffect, useState } from 'react';
import { Clock, Plus, Play, Power, Trash2, Pause } from 'lucide-react';
import { cn } from '../lib/cn';
import { useSSE } from '../lib/useSSE';

interface Schedule {
  id: string;
  cron: string;
  task: string;
  target?: string;
  tags?: string[];
  workerName?: string;
  enabled: boolean;
  fromConfig?: boolean;
  lastRunAt?: string | null;
  lastResult?: unknown;
  nextRunAt?: string | null;
}

interface Resp { schedules?: Schedule[]; error?: string }

export default function SchedulerView() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean | null>(null);
  const [form, setForm] = useState({ id: '', cron: '0 * * * *', task: '' });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Resp;
      if (data.error) setError(data.error);
      else { setItems(data.schedules || []); setError(null); }
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 10000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Live refresh on schedule fires.
  useSSE(['schedule_fire'], () => fetchData());

  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok ? res.json() : { error: `HTTP ${res.status}` };
  };

  const toggleRunning = async () => {
    const r = await post(running ? '/api/scheduler/stop' : '/api/scheduler/start', {});
    setRunning(typeof r.running === 'boolean' ? r.running : !running);
    fetchData();
  };

  const add = async () => {
    if (!form.id || !form.cron || !form.task) return;
    await post('/api/schedule', form);
    setForm({ id: '', cron: '0 * * * *', task: '' });
    fetchData();
  };

  const remove = async (id: string) => {
    if (!window.confirm(`Remove schedule '${id}'?`)) return;
    await post('/api/schedule/remove', { id });
    fetchData();
  };

  const toggleEnable = async (id: string, enabled: boolean) => {
    await post('/api/schedule/enable', { id, enabled: !enabled });
    fetchData();
  };

  const runNow = async (id: string) => {
    await post('/api/schedule/run', { id });
    fetchData();
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <Clock size={16} className="text-primary" />
        <h2 className="text-base font-semibold sm:text-lg">Scheduler</h2>
        <button
          type="button"
          onClick={toggleRunning}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs',
            running ? 'border-success/50 bg-success/10 text-success' : 'border-border bg-surface-2 text-foreground hover:bg-surface-3',
          )}
        >
          {running ? <><Pause size={12} /> Stop</> : <><Power size={12} /> Start</>}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">Add schedule</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1.5fr,2fr,auto]">
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="id" className="rounded border border-border bg-surface px-2 py-1 text-xs" />
          <input value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} placeholder="cron (m h dom mon dow)" className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs" />
          <input value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} placeholder="task" className="rounded border border-border bg-surface px-2 py-1 text-xs" />
          <button
            type="button"
            onClick={add}
            disabled={!form.id || !form.cron || !form.task}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-surface-2">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="sticky top-0 bg-surface-3 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Cron</th>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Last run</th>
              <th className="px-3 py-2 font-medium">Next run</th>
              <th className="px-3 py-2 font-medium">Enabled</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-3 text-center text-muted">No schedules.</td></tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{s.id}{s.fromConfig && <span className="ml-1 text-[10px] text-muted">(config)</span>}</td>
                <td className="px-3 py-2 font-mono">{s.cron}</td>
                <td className="px-3 py-2"><div className="line-clamp-2 max-w-md">{s.task}</div></td>
                <td className="px-3 py-2 text-muted">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-2 text-muted">{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleEnable(s.id, s.enabled)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] uppercase',
                      s.enabled ? 'border-success/50 bg-success/10 text-success' : 'border-border bg-surface text-muted',
                    )}
                  >
                    {s.enabled ? 'on' : 'off'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => runNow(s.id)} className="rounded border border-border bg-surface px-2 py-0.5 text-[10px] hover:bg-surface-3" title="Run now"><Play size={10} /></button>
                    {!s.fromConfig && (
                      <button onClick={() => remove(s.id)} className="rounded border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] text-danger hover:bg-danger/20" title="Remove"><Trash2 size={10} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
