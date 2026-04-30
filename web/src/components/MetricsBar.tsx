import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, Activity } from 'lucide-react';
import type { MetricsResponse } from '../types';

function fmtMb(kb: number | null | undefined): string {
  if (kb == null) return '—';
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return '—';
  return `${pct.toFixed(1)}%`;
}

export default function MetricsBar() {
  const [m, setM] = useState<MetricsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) return;
        const data = (await res.json()) as MetricsResponse;
        if (alive) setM(data);
      } catch {
        // network blip — keep last value
      }
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!m) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-muted bg-surface1 border-b border-border">
      <span className="flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5 text-success" />
        <span className="text-foreground font-medium">{m.totals.liveWorkers}</span>
        <span>live</span>
        <span className="text-muted/60">/ {m.totals.totalWorkers} total</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Cpu className="w-3.5 h-3.5 text-warning" />
        <span className="text-foreground font-medium">{fmtPct(m.totals.totalCpuPct)}</span>
        <span>workers · load {m.daemon.loadavg[0].toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <MemoryStick className="w-3.5 h-3.5 text-primary" />
        <span className="text-foreground font-medium">{fmtMb(m.totals.totalRssKb)}</span>
        <span>workers · daemon {fmtMb(m.daemon.rssKb)}</span>
      </span>
      <span className="ml-auto text-muted/60">
        {m.daemon.cpus}c · {m.daemon.platform} · pid {m.daemon.pid}
      </span>
    </div>
  );
}
