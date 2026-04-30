// Worker timeline (1.6.16 follow-up). Reads /api/hook-events?name=<name>
// and merges with /api/scrollback (annotated [C4 ...] snapshots) to render a
// chronological feed of intervention / hook / system events for one worker.

import { useCallback, useEffect, useState } from 'react';
import {
  Clock, Wrench, Zap, MessageSquare, CircleDot,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useSSE } from '../lib/useSSE';

interface HookEvent {
  hook_type?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string; file_path?: string; description?: string };
  receivedAt: number;
}

interface HookEventsResp {
  events?: HookEvent[];
  error?: string;
}

interface TimelineRow {
  ts: number;
  kind: 'pre' | 'post' | 'system';
  label: string;
  detail?: string;
}

function classify(ev: HookEvent): TimelineRow | null {
  const ts = ev.receivedAt || Date.now();
  const kind = (ev.hook_type || ev.hook_event_name || '') === 'PreToolUse' ? 'pre' :
               (ev.hook_type || ev.hook_event_name || '') === 'PostToolUse' ? 'post' :
               'system';
  const tool = ev.tool_name || '?';
  const input = ev.tool_input || {};
  const detail = input.command || input.file_path || input.description || '';
  return { ts, kind, label: tool, detail };
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function ToolIcon({ name, kind }: { name: string; kind: TimelineRow['kind'] }) {
  if (kind === 'system') return <CircleDot size={11} className="text-muted" />;
  if (name === 'Bash')                 return <Zap size={11} className="text-warning" />;
  if (name === 'Edit' || name === 'Write') return <Wrench size={11} className="text-primary" />;
  if (name === 'Read')                 return <MessageSquare size={11} className="text-muted" />;
  return kind === 'pre'
    ? <CircleDot size={11} className="text-primary" />
    : <CircleDot size={11} className="text-success" />;
}

export default function WorkerTimeline({ workerName }: { workerName: string }) {
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/hook-events?name=${encodeURIComponent(workerName)}&limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as HookEventsResp;
      if (data.error) { setError(data.error); return; }
      const out: TimelineRow[] = [];
      for (const ev of data.events || []) {
        const r = classify(ev);
        if (r) out.push(r);
      }
      out.sort((a, b) => a.ts - b.ts);
      setRows(out);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [workerName]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Live: hook event arrived → refetch immediately for this worker.
  useSSE(['hook'], (ev) => {
    if ((ev as { worker?: string }).worker === workerName) fetchData();
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
        <Clock size={12} />
        <span>{rows.length} event(s) · live</span>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs">
        {rows.length === 0 && (
          <div className="text-muted">No hook events recorded yet.</div>
        )}
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-20 shrink-0 text-[10px] text-muted">{fmtTime(r.ts)}</span>
              <span className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                r.kind === 'pre'  ? 'border-primary/60 bg-primary/10' :
                r.kind === 'post' ? 'border-success/60 bg-success/10' :
                                    'border-border bg-surface',
              )}>
                <ToolIcon name={r.label} kind={r.kind} />
              </span>
              <span className="w-16 shrink-0 text-foreground/80">
                {r.kind === 'pre' ? '→' : r.kind === 'post' ? '✓' : '•'} {r.label}
              </span>
              <span className="flex-1 truncate text-muted">
                {r.detail || (r.kind === 'system' ? '(system)' : '')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

