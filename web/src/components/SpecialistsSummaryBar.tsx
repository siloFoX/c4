import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';

// (v1.10.545) Extracted from SpecialistsView. Phase-6.14
// organism summary — compact info bar above the two-column
// layout. Self-polling on a 30s timer; renders nothing when the
// endpoint is unreachable (older daemons / network blips). The
// view itself doesn't need this data, so the panel owns the
// fetch internally.

interface OrganismSummary {
  registry: { count: number; vetoCount: number };
  meetings: { total: number; recent24h: number };
  scores: { specialistsWithSamples: number; underperformerCount: number };
  persist?: {
    enabled: boolean;
    dbSizeBytes?: number | null;
    rowCount?: number | null;
    auditLog?: { bytes?: number | null; entries?: number | null };
    lastKnownGood?: { exists: boolean; ageDays?: number | null };
  };
}

export default function SpecialistsSummaryBar() {
  useLocale();
  const [summary, setSummary] = useState<OrganismSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchSummary = () => {
      apiGet<OrganismSummary>('/api/specialists/summary')
        .then((res) => { if (!cancelled) setSummary(res); })
        .catch(() => { /* silently degrade — info bar just hides */ });
    };
    fetchSummary();
    const id = window.setInterval(fetchSummary, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  if (!summary) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/40 bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">{summary.registry.count}</span> {t('specialists.summary.specialistsLabel')}
        {summary.registry.vetoCount > 0 ? (
          <span className="ml-1">{tFormat('specialists.summary.vetoCount', { count: summary.registry.vetoCount })}</span>
        ) : null}
      </span>
      <span>·</span>
      <span>
        <span className="font-medium text-foreground">{summary.meetings.total}</span> {t('specialists.summary.meetingsLabel')}
        {summary.meetings.recent24h > 0 ? (
          <span className="ml-1">{tFormat('specialists.summary.recent24h', { count: summary.meetings.recent24h })}</span>
        ) : null}
      </span>
      {summary.scores.underperformerCount > 0 ? (
        <>
          <span>·</span>
          <span className="text-amber-700 dark:text-amber-400">
            {tFormat('specialists.summary.underperformers', { count: summary.scores.underperformerCount })}
          </span>
        </>
      ) : null}
      {summary.persist && summary.persist.enabled ? (
        <>
          <span>·</span>
          <span className={cn(
            typeof summary.persist.dbSizeBytes === 'number' && summary.persist.dbSizeBytes > 100 * 1024 * 1024
              ? 'text-amber-700 dark:text-amber-400'
              : '',
          )}>
            {summary.persist.rowCount != null
              ? tFormat('specialists.summary.persistRows', { rows: summary.persist.rowCount })
              : t('specialists.summary.persistRowsUnknown')}
            {typeof summary.persist.dbSizeBytes === 'number'
              ? summary.persist.dbSizeBytes > 1024 * 1024
                ? tFormat('specialists.summary.dbSizeMb', { size: (summary.persist.dbSizeBytes / (1024 * 1024)).toFixed(1) })
                : tFormat('specialists.summary.dbSizeKb', { size: (summary.persist.dbSizeBytes / 1024).toFixed(1) })
              : ''}
          </span>
          {summary.persist.auditLog && typeof summary.persist.auditLog.entries === 'number' ? (
            <span className={cn(
              typeof summary.persist.auditLog.bytes === 'number' && summary.persist.auditLog.bytes > 1024 * 1024
                ? 'text-amber-700 dark:text-amber-400'
                : '',
            )}>
              {tFormat('specialists.summary.auditEntries', { entries: summary.persist.auditLog.entries })}
              {typeof summary.persist.auditLog.bytes === 'number' && summary.persist.auditLog.bytes > 1024 * 1024
                ? tFormat('specialists.summary.auditBytesMb', { size: (summary.persist.auditLog.bytes / (1024 * 1024)).toFixed(1) })
                : ''}
            </span>
          ) : null}
          {summary.persist.lastKnownGood && summary.persist.lastKnownGood.exists && typeof summary.persist.lastKnownGood.ageDays === 'number' ? (
            <span className={cn(
              summary.persist.lastKnownGood.ageDays > 7 ? 'text-amber-700 dark:text-amber-400' : '',
            )}>
              {summary.persist.lastKnownGood.ageDays < 1
                ? tFormat('specialists.summary.backupAgeHours', { hours: (summary.persist.lastKnownGood.ageDays * 24).toFixed(1) })
                : tFormat('specialists.summary.backupAgeDays', { days: summary.persist.lastKnownGood.ageDays.toFixed(1) })}
            </span>
          ) : null}
        </>
      ) : summary.persist ? (
        <span className="text-amber-700 dark:text-amber-400">{t('specialists.summary.persistDisabled')}</span>
      ) : null}
    </div>
  );
}
