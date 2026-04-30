// 8.8: batch controls — apply one action across multiple selected workers.
// Lives in the Workers sidebar header. Talks to POST /batch-action.

import { useState } from 'react';
import { Pause, Play, Power, RefreshCw, Undo2, Ban } from 'lucide-react';
import { cn } from '../lib/cn';

type BatchAction = 'close' | 'suspend' | 'resume' | 'rollback' | 'cancel' | 'restart';

interface BatchControlsProps {
  selected: string[];
  onClearSelection: () => void;
  onCompleted: () => void;
}

const ACTIONS: { kind: BatchAction; label: string; Icon: typeof Pause; tone: 'neutral' | 'warning' | 'danger'; confirm: (n: number) => string }[] = [
  { kind: 'cancel',   label: 'Cancel',   Icon: Ban,       tone: 'warning', confirm: (n) => `Cancel running task on ${n} worker(s)?` },
  { kind: 'suspend',  label: 'Suspend',  Icon: Pause,     tone: 'neutral', confirm: (n) => `Suspend ${n} worker(s)?` },
  { kind: 'resume',   label: 'Resume',   Icon: Play,      tone: 'neutral', confirm: (n) => `Resume ${n} worker(s)?` },
  { kind: 'restart',  label: 'Restart',  Icon: RefreshCw, tone: 'warning', confirm: (n) => `Restart ${n} worker(s)?` },
  { kind: 'rollback', label: 'Rollback', Icon: Undo2,     tone: 'warning', confirm: (n) => `Rollback ${n} worker branch(es) to pre-task?` },
  { kind: 'close',    label: 'Close',    Icon: Power,     tone: 'danger',  confirm: (n) => `Close ${n} worker(s)? Sessions terminate.` },
];

const TONE: Record<'neutral' | 'warning' | 'danger', string> = {
  neutral: 'border-border bg-surface-2 text-foreground hover:bg-surface-3',
  warning: 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15',
  danger:  'border-danger/60 bg-danger/15 text-danger hover:bg-danger/20',
};

export default function BatchControls({ selected, onClearSelection, onCompleted }: BatchControlsProps) {
  const [busy, setBusy] = useState<BatchAction | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (selected.length === 0) return null;

  const run = async (action: typeof ACTIONS[number]) => {
    if (!window.confirm(action.confirm(selected.length))) return;
    setBusy(action.kind);
    setMsg(null);
    try {
      const res = await fetch('/api/batch-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: selected, action: action.kind }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.error) {
        setMsg(`${action.label} failed: ${payload.error || `HTTP ${res.status}`}`);
        return;
      }
      const results = payload.results || {};
      const failures = Object.entries(results)
        .filter(([, r]) => (r as { error?: string }).error)
        .map(([n]) => n);
      setMsg(
        failures.length === 0
          ? `${action.label}: ${selected.length} ok`
          : `${action.label}: ${selected.length - failures.length}/${selected.length} ok (failed: ${failures.join(', ')})`
      );
      onCompleted();
    } catch (e) {
      setMsg(`${action.label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-primary">{selected.length} selected</span>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-muted hover:text-foreground"
        >
          clear
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {ACTIONS.map((a) => {
          const Icon = a.Icon;
          return (
            <button
              key={a.kind}
              type="button"
              onClick={() => run(a)}
              disabled={busy !== null}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
                TONE[a.tone],
              )}
            >
              <Icon size={12} />
              {busy === a.kind ? '...' : a.label}
            </button>
          );
        })}
      </div>
      {msg && <div className="mt-2 text-[11px] text-muted">{msg}</div>}
    </div>
  );
}
