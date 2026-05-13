import { RefreshCw } from 'lucide-react';
import PageFrame, { ErrorPanel, LoadingSkeleton } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, Panel, Tooltip } from '../components/ui';
import { cn } from '../lib/cn';
import { formatDuration, formatNumber, formatRelativeTime } from '../lib/format';
import { t, tFormat, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useHealth } from '../lib/use-health';

// 8.20B Health dashboard. Reads GET /api/health and renders the fields
// the daemon surfaces today (pid, uptime, worker counts). Fields the
// health endpoint does not yet expose (event loop lag, loaded modules,
// queue depth) render as `-` and leave a sub-TODO in docs.
// (v1.10.729) Fetch + 10s poll moved to lib/use-health.

export default function Health() {
  useLocale();
  const { data, loading, error, refresh } = useHealth();

  const ok = data?.ok !== false && !error;

  return (
    <PageFrame
      title={t('healthPage.title')}
      description={t('healthPage.description')}
      actions={
        <Tooltip label={t('health.tooltip.refresh')}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label={t('healthPage.refresh.label')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">{t('common.srOnlyRefresh')}</span>
          </Button>
        </Tooltip>
      }
    >
      <PageDescriptionBanner
        summaryKey="health.summary"
        cliKey="health.cli"
        exampleKey="health.example"
        useCasesKey="health.useCases"
        onOpenHelp={openHelpDrawer}
      />
      {loading && !data ? <LoadingSkeleton rows={3} /> : null}
      {error && <ErrorPanel message={error} />}
      {data && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={ok ? 'default' : 'outline'} className="uppercase">
              {ok ? t('healthPage.status.healthy') : t('healthPage.status.degraded')}
            </Badge>
            {data.version && (
              <span className={text.caption}>v{String(data.version)}</span>
            )}
            {data.configPath && (
              <span className={cn('truncate', text.caption, 'font-mono')}>
                {String(data.configPath)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label={t('healthPage.stat.pid')} value={data.pid != null ? String(data.pid) : '-'} />
            <Stat label={t('healthPage.stat.uptime')} value={formatDuration((data.uptime ?? 0) * 1000)} />
            <Stat label={t('healthPage.stat.started')} value={formatRelativeTime(data.startedAt)} />
            <Stat label={t('healthPage.stat.workersTotal')} value={formatNumber(data.workers)} />
            <Stat label={t('healthPage.stat.active')} value={formatNumber(data.activeWorkers ?? data.busyWorkers)} />
            <Stat label={t('healthPage.stat.idle')} value={formatNumber(data.idleWorkers)} />
            <Stat label={t('healthPage.stat.queueDepth')} value={formatNumber(data.queueDepth)} />
            <Stat label={t('healthPage.stat.lostWorkers')} value={formatNumber(data.lostWorkers)} />
            <Stat label={t('healthPage.stat.eventLoopLag')} value={data.eventLoopLagMs != null ? `${data.eventLoopLagMs} ms` : '-'} />
          </div>

          {Array.isArray(data.modules) && data.modules.length > 0 ? (
            <Panel title={tFormat('healthPage.modules.loaded', { n: String(data.modules.length) })} className="p-3 text-xs">
              <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                {data.modules.map((m) => (
                  <li key={m} className="truncate text-muted-foreground">{m}</li>
                ))}
              </ul>
            </Panel>
          ) : (
            <div className={text.caption}>
              {t('healthPage.modules.empty')}
            </div>
          )}
        </div>
      )}
    </PageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel className="flex flex-col gap-1 p-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg text-foreground">{value}</span>
    </Panel>
  );
}
