import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, Activity } from 'lucide-react';
import { t, tFormat, useLocale } from '../lib/i18n';

// Inline-typed response so MetricsBar drops in without touching the
// shared types.ts (which is on a different design-system axis upstream).
interface MetricsResponse {
  daemon: {
    platform: string;
    pid: number;
    uptimeSec: number;
    rssKb: number;
    heapUsedKb: number;
    heapTotalKb: number;
    cpus: number;
    loadavg: number[];
  };
  workers: Array<{
    name: string;
    pid: number | null;
    status: string;
    cpuPct: number | null;
    rssKb: number | null;
    threads: number | null;
  }>;
  totals: {
    liveWorkers: number;
    totalWorkers: number;
    totalRssKb: number;
    totalCpuPct: number;
  };
}

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
  useLocale();
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

  // (v1.10.364) Color classes were referencing non-existent
  // tokens: text-muted / bg-surface1 / text-success / text-warning
  // none of which exist in the Tailwind config (only text-muted-
  // foreground / bg-muted / etc. do). The bar still rendered but
  // with default browser colors. Switching to the proper tokens.
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium text-foreground">{m.totals.liveWorkers}</span>
        <span>{t('metrics.live')}</span>
        <span className="text-muted-foreground">/ {m.totals.totalWorkers} {t('metrics.total')}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-foreground">{fmtPct(m.totals.totalCpuPct)}</span>
        <span>{t('metrics.workers')} · {t('metrics.load')} {(m.daemon.loadavg[0] ?? 0).toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <MemoryStick className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{fmtMb(m.totals.totalRssKb)}</span>
        <span>{t('metrics.workers')} · {t('metrics.daemon')} {fmtMb(m.daemon.rssKb)}</span>
      </span>
      <span className="ml-auto text-muted-foreground">
        {m.daemon.cpus}c · {m.daemon.platform} · {tFormat('metrics.host.pid', { pid: m.daemon.pid })}
      </span>
    </div>
  );
}
