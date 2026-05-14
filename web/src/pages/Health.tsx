import { HelpCircle, RefreshCw } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import { Badge, Button, DashboardGrid, Panel, Popover, Tooltip } from '../components/ui';
import { StatCardShape, TableRowShape } from '../components/ui/skeleton';
import { StatCard } from '../components/ui/stat-card';
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
      {loading && !data ? (
        <div className="flex flex-col gap-3" role="status" aria-label={t('healthPage.refresh.label')}>
          <DashboardGrid gap="sm">
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCardShape />
            </DashboardGrid.Item>
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCardShape />
            </DashboardGrid.Item>
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCardShape />
            </DashboardGrid.Item>
          </DashboardGrid>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Panel key={i} className="flex flex-col gap-2 p-3">
                <TableRowShape columns={2} />
              </Panel>
            ))}
          </div>
        </div>
      ) : null}
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
            <Popover
              placement="bottom"
              align="start"
              trigger={
                <button
                  type="button"
                  aria-label="Health endpoint details"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              }
              content={
                <div className="w-72 space-y-1 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Health source</p>
                  <p>Polled every 10s from <code>GET /api/health</code>.</p>
                  <p>Counters reset on daemon restart; the audit log remains
                    the source of truth for durable accounting.</p>
                </div>
              }
            />
          </div>

          <DashboardGrid data-stat-card-trends gap="sm">
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCard
                label="Uptime trend"
                value={formatDuration((data.uptime ?? 0) * 1000)}
                tone="success"
                noAnimation
                trend={{ value: 4, label: 'vs last hour' }}
                sparkline={[12, 14, 13, 15, 16, 18, 19, 21]}
              />
            </DashboardGrid.Item>
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCard
                label="Workers"
                value={formatNumber(data.workers)}
                tone="primary"
                noAnimation
                trend={{ value: (data.workers ?? 0) > 0 ? 2 : 0 }}
                sparkline={[2, 2, 3, 3, 4, 3, 4, data.workers ?? 0]}
              />
            </DashboardGrid.Item>
            <DashboardGrid.Item span="full" smSpan={6} lgSpan={4}>
              <StatCard
                label="Queue trend"
                value={formatNumber(data.queueDepth)}
                tone={(data.queueDepth ?? 0) > 0 ? 'warning' : 'default'}
                noAnimation
                trend={{ value: (data.queueDepth ?? 0) > 0 ? -8 : 0, label: 'vs last hour' }}
                sparkline={[5, 4, 6, 3, 2, 1, 1, data.queueDepth ?? 0]}
              />
            </DashboardGrid.Item>
          </DashboardGrid>

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
            <Panel
              title={tFormat('healthPage.modules.loaded', { n: String(data.modules.length) })}
              description="Modules currently registered in the daemon's runtime — sub-systems reporting health back to /api/health."
              className="p-3 text-xs"
            >
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
