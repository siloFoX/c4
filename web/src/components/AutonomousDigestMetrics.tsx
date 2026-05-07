import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import type { DigestResponse } from './AutonomousView';

// (v1.10.570) Extracted from AutonomousView. The 9-cell digest
// metrics grid (window, dispatched, succeeded, halted, errors,
// success-rate, pending/resolved escalations, window-range).
// Pure display.

function fmtDuration(ms: number): string {
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(0)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

interface Props {
  digest: DigestResponse;
}

export default function AutonomousDigestMetrics({ digest }: Props) {
  useLocale();
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.window')}</div>
        <div className="font-mono">{fmtDuration(digest.windowMs)}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.dispatched')}</div>
        <div className="font-mono">{digest.dispatched}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.succeeded')}</div>
        <div className="font-mono text-emerald-700 dark:text-emerald-400">
          {digest.succeeded}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.halted')}</div>
        <div className={cn(
          'font-mono',
          digest.halted > 0 ? 'text-amber-700 dark:text-amber-400' : '',
        )}>
          {digest.halted}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.dispatchErrors')}</div>
        <div className={cn(
          'font-mono',
          digest.dispatchErrors > 0 ? 'text-destructive' : '',
        )}>
          {digest.dispatchErrors}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.successRate')}</div>
        <div className="font-mono">
          {digest.successRate != null
            ? `${(digest.successRate * 100).toFixed(1)}%`
            : '—'}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.pendingEscalations')}</div>
        <div className={cn(
          'font-mono',
          digest.pendingEscalations > 0 ? 'text-amber-700 dark:text-amber-400' : '',
        )}>
          {digest.pendingEscalations}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.resolvedEscalations')}</div>
        <div className="font-mono text-muted-foreground">
          {digest.resolvedEscalations}
        </div>
      </div>
      <div className="col-span-2 md:col-span-4">
        <div className="text-[10px] uppercase text-muted-foreground">{t('autonomous.metric.windowRange')}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {digest.from} → {digest.to}
        </div>
      </div>
    </div>
  );
}
