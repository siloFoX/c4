import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useSpecialistsSummary } from '../lib/use-specialists-summary';

// (v1.10.545) Extracted from SpecialistsView. Phase-6.14
// organism summary — compact info bar above the two-column
// layout. Self-polling on a 30s timer; renders nothing when the
// endpoint is unreachable (older daemons / network blips). The
// view itself doesn't need this data, so the panel owns the
// fetch internally.
// (v1.10.725) Polling fetch + state moved to lib/use-specialists-summary.

export default function SpecialistsSummaryBar() {
  useLocale();
  const summary = useSpecialistsSummary();

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
          <span className="text-warning">
            {tFormat('specialists.summary.underperformers', { count: summary.scores.underperformerCount })}
          </span>
        </>
      ) : null}
      {summary.persist && summary.persist.enabled ? (
        <>
          <span>·</span>
          <span className={cn(
            typeof summary.persist.dbSizeBytes === 'number' && summary.persist.dbSizeBytes > 100 * 1024 * 1024
              ? 'text-warning'
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
                ? 'text-warning'
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
              summary.persist.lastKnownGood.ageDays > 7 ? 'text-warning' : '',
            )}>
              {summary.persist.lastKnownGood.ageDays < 1
                ? tFormat('specialists.summary.backupAgeHours', { hours: (summary.persist.lastKnownGood.ageDays * 24).toFixed(1) })
                : tFormat('specialists.summary.backupAgeDays', { days: summary.persist.lastKnownGood.ageDays.toFixed(1) })}
            </span>
          ) : null}
        </>
      ) : summary.persist ? (
        <span className="text-warning">{t('specialists.summary.persistDisabled')}</span>
      ) : null}
    </div>
  );
}
