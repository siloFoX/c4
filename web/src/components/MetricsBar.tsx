import { Cpu, MemoryStick, Activity } from 'lucide-react';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useMetrics } from '../lib/use-metrics';

// (v1.10.726) MetricsResponse type + 5s self-poll fetch
// moved to lib/use-metrics.

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
  const m = useMetrics();

  if (!m) return null;

  // (v1.10.364) Color classes were referencing non-existent
  // tokens: text-muted / bg-surface1 / text-success / text-warning
  // none of which exist in the Tailwind config (only text-muted-
  // foreground / bg-muted / etc. do). The bar still rendered but
  // with default browser colors. Switching to the proper tokens.
  // (v1.11.77) Now uses --success / --warning palette tokens added
  // to the theme, so light/dark modes share the same call sites.
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Activity className="h-3.5 w-3.5 text-success" />
        <span className="font-medium text-foreground">{m.totals.liveWorkers}</span>
        <span>{t('metrics.live')}</span>
        <span className="text-muted-foreground">/ {m.totals.totalWorkers} {t('metrics.total')}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 text-warning" />
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
