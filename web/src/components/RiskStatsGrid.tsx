import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';
import { type StatsResponse } from '../pages/Risk';

// (v1.10.606) Extracted from pages/Risk. The recent-denials
// stats grid — total/enforced/dryRun/shadowExec tiles, by-level
// counts, top reasons + top workers, rule-set rotation banner.
// Pure display: takes the full stats response.
// (v1.11.144) Local text-color map for per-level stat numbers.
// Previously read the second token out of the now-removed
// LEVEL_TONE class string; the explicit map is clearer.

const LEVEL_TEXT: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  low: 'text-success',
  medium: 'text-warning',
  high: 'text-destructive',
  critical: 'text-destructive',
};

interface Props {
  stats: StatsResponse;
}

export default function RiskStatsGrid({ stats }: Props) {
  useLocale();
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.totalEvents')}</div>
        <div className="font-mono text-[14px]">{stats.total}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.enforced')}</div>
        <div className={cn('font-mono text-[14px]', stats.enforced > 0 && 'text-destructive')}>
          {stats.enforced}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.dryRun')}</div>
        <div className="font-mono text-[14px]">{stats.dryRun}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.shadowExec')}</div>
        <div className="font-mono text-[14px]">{stats.shadowExec}</div>
        {stats.shadowExecKilled > 0 || stats.shadowExecNonZero > 0 ? (
          <div className="text-[10px] text-warning">
            {stats.shadowExecKilled > 0 ? `${stats.shadowExecKilled} killed` : ''}
            {stats.shadowExecKilled > 0 && stats.shadowExecNonZero > 0 ? ' · ' : ''}
            {stats.shadowExecNonZero > 0 ? `${stats.shadowExecNonZero} non-zero` : ''}
          </div>
        ) : null}
      </div>
      {(['critical', 'high', 'medium', 'low'] as const).map((lv) => (
        <div key={lv}>
          <div className="text-[10px] uppercase text-muted-foreground">{lv}</div>
          <div className={cn('font-mono text-[14px]', LEVEL_TEXT[lv])}>
            {stats.byLevel[lv] || 0}
          </div>
        </div>
      ))}
      {stats.topReasons.length > 0 ? (
        <div className="col-span-2 md:col-span-4">
          <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.topReasons')}</div>
          <ul className="text-[11px]">
            {stats.topReasons.map((r) => (
              <li key={r.key}>
                <code className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                  {r.key}
                </code>
                <span className="ml-1 text-muted-foreground">× {r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {stats.topWorkers.length > 0 ? (
        <div className="col-span-2 md:col-span-4">
          <div className="text-[10px] uppercase text-muted-foreground">{t('risk.stats.topWorkers')}</div>
          <ul className="text-[11px]">
            {stats.topWorkers.map((w) => (
              <li key={w.key}>
                <code className="rounded border border-border bg-background px-1 font-mono text-[10px]">
                  {w.key}
                </code>
                <span className="ml-1 text-muted-foreground">× {w.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {stats.ruleSetRotations > 1 ? (
        <div className="col-span-2 md:col-span-4 rounded border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
          <span className="font-medium">{stats.ruleSetRotations} rule-set rotations</span>
          {' '}detected in this window — operator changed classifier config mid-window.
        </div>
      ) : null}
      <div className="col-span-2 md:col-span-4 text-[10px] text-muted-foreground">
        {stats.from} → {stats.to}
      </div>
    </div>
  );
}
