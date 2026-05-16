import { useEffect, useRef, useState } from 'react';
import { Filter, GripVertical, HelpCircle, LayoutGrid, List, RefreshCw } from 'lucide-react';
import PageFrame, { ErrorPanel } from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import {
  AlertBanner,
  Badge,
  Button,
  Collapsible,
  DashboardGrid,
  DataList,
  DatePicker,
  Drawer,
  IconButton,
  NumberInput,
  PageHeader,
  Panel,
  Popover,
  Rating,
  SegmentedControl,
  StatusDot,
  Tooltip,
  VisuallyHidden,
  Widget,
} from '../components/ui';
import type { DataListItem } from '../components/ui';
import { StatCardShape, TableRowShape } from '../components/ui/skeleton';
import { StatCard } from '../components/ui/stat-card';
import { cn } from '../lib/cn';
import { formatDuration, formatNumber, formatRelativeTime } from '../lib/format';
import { t, tFormat, useLocale } from '../lib/i18n';
import { text } from '../lib/typography';
import { useHealth } from '../lib/use-health';
import { useABVariant } from '../lib/ab-variant';
import {
  useHealthLayout,
  type HealthLayoutKey,
} from '../lib/use-health-layout';

// 8.20B Health dashboard. Reads GET /api/health and renders the fields
// the daemon surfaces today (pid, uptime, worker counts). Fields the
// health endpoint does not yet expose (event loop lag, loaded modules,
// queue depth) render as `-` and leave a sub-TODO in docs.
// (v1.10.729) Fetch + 10s poll moved to lib/use-health.

type HealthViewMode = 'compact' | 'full';
const VIEW_MODE_KEY = 'c4:health-view-mode';

function readViewMode(): HealthViewMode {
  if (typeof window === 'undefined') return 'full';
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    return raw === 'compact' ? 'compact' : 'full';
  } catch {
    return 'full';
  }
}

export default function Health() {
  useLocale();
  const { data, loading, error, refresh } = useHealth();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // (v1.11.276, TODO 11.258) Health "view mode" toggle. Compact
  // keeps only the four operator-critical metrics (uptime, active
  // workers, queue depth, lost workers) in the hero DataList. Full
  // is the previous behaviour (all nine entries). Persisted to
  // localStorage so the operator's choice survives reload + tab
  // switch; cross-tab sync via the 'storage' event.
  const [viewMode, setViewMode] = useState<HealthViewMode>(() => readViewMode());
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key === VIEW_MODE_KEY) setViewMode(readViewMode());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  // (11.175) Placeholder health-poll timeout setting to demonstrate
  // NumberInput adoption. Local-only; not yet wired to the polling
  // hook - a follow-up will pass this into useHealth.
  const [pollTimeoutMs, setPollTimeoutMs] = useState<number | undefined>(10000);
  // (11.176) Placeholder since-filter date. Local-only until the
  // health filter Drawer is wired into the polling hook.
  const [sinceDate, setSinceDate] = useState<Date | null>(null);
  // (11.202) A/B variant harness hookup point. The hero KPI block below
  // carries `data-ab-variant` so a follow-up can branch on variant 'B'
  // for a condensed hero. Today both variants render the same UI; the
  // attribute is the contract that downstream styling / Playwright
  // selectors will pivot on. See web/src/lib/ab-variant.ts.
  const [heroVariant] = useABVariant('health-hero');
  // (11.204) Health hero card order is operator-reorderable via drag.
  // Persistence + cross-subtree sync lives in `lib/use-health-layout.ts`.
  const [heroLayout, setHeroLayout, resetHeroLayout] = useHealthLayout();
  const dragKey = useRef<HealthLayoutKey | null>(null);

  const ok = data?.ok !== false && !error;

  const heroCardRenderers: Record<HealthLayoutKey, () => JSX.Element> = {
    uptime: () => (
      <StatCard
        label="Uptime trend"
        value={formatDuration((data?.uptime ?? 0) * 1000)}
        tone="success"
        noAnimation
        trend={{ value: 4, label: 'vs last hour' }}
        sparkline={[12, 14, 13, 15, 16, 18, 19, 21]}
      />
    ),
    workers: () => (
      <StatCard
        label="Workers"
        value={formatNumber(data?.workers)}
        tone="primary"
        noAnimation
        trend={{ value: (data?.workers ?? 0) > 0 ? 2 : 0 }}
        sparkline={[2, 2, 3, 3, 4, 3, 4, data?.workers ?? 0]}
      />
    ),
    queue: () => (
      <StatCard
        label="Queue trend"
        value={formatNumber(data?.queueDepth)}
        tone={(data?.queueDepth ?? 0) > 0 ? 'warning' : 'default'}
        noAnimation
        trend={{ value: (data?.queueDepth ?? 0) > 0 ? -8 : 0, label: 'vs last hour' }}
        sparkline={[5, 4, 6, 3, 2, 1, 1, data?.queueDepth ?? 0]}
      />
    ),
  };

  const onCardDragStart =
    (key: HealthLayoutKey) => (e: React.DragEvent<HTMLDivElement>) => {
      dragKey.current = key;
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', key);
      } catch {
        /* ignore */
      }
    };
  const onCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
  };
  const onCardDrop =
    (target: HealthLayoutKey) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const src = dragKey.current;
      dragKey.current = null;
      if (!src || src === target) return;
      const order = [...heroLayout];
      const from = order.indexOf(src);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, src);
      setHeroLayout(order);
    };

  return (
    <PageFrame
      title={t('healthPage.title')}
      description={t('healthPage.description')}
      actions={
        <>
          <SegmentedControl<HealthViewMode>
            data-testid="health-view-mode"
            ariaLabel="Health view mode"
            size="sm"
            value={viewMode}
            onChange={setViewMode}
            options={[
              {
                value: 'compact',
                icon: <List className="h-3.5 w-3.5" />,
                ariaLabel: 'Compact view',
              },
              {
                value: 'full',
                icon: <LayoutGrid className="h-3.5 w-3.5" />,
                ariaLabel: 'Full view',
              },
            ]}
          />
          <Tooltip label="Filters">
            <IconButton
              icon={<Filter className="h-3.5 w-3.5" />}
              aria-label="Open filters"
              onClick={() => setFiltersOpen(true)}
            />
          </Tooltip>
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
              <VisuallyHidden>{t('common.srOnlyRefresh')}</VisuallyHidden>
            </Button>
          </Tooltip>
        </>
      }
    >
      <PageHeader
        breadcrumbs={[
          { id: 'home', label: 'Dashboard', href: '#feature=workers' },
        ]}
        backHref="#feature=workers"
        backLabel="Back to Workers"
        sticky={false}
        className="-mx-4 -mt-2 md:-mx-6 md:-mt-2"
        data-testid="health-page-header"
      />
      <Drawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        title="Filters"
        description="status, severity, since"
      >
        {/* (v1.11.275, TODO 11.257) AlertBanner replaces the
            inline Alert for the filter "coming soon" advisory.
            Persistent inline notice -- exactly the AlertBanner
            use case. */}
        <AlertBanner
          severity="info"
          title="Coming soon"
          data-testid="health-incident-strip"
        >
          Filter wiring lands in a follow-up. Drawer is integrated so the
          surface is ready.
        </AlertBanner>
        {/* (11.176) DatePicker primitive adoption - placeholder since
            filter; not yet threaded into useHealth. */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Since</span>
          <DatePicker
            value={sinceDate}
            onChange={setSinceDate}
            ariaLabel="Filter health events since"
          />
        </div>
      </Drawer>
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
            <StatusDot
              variant={ok ? 'online' : 'offline'}
              size="md"
              pulse={ok}
            />
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

          <DashboardGrid data-stat-card-trends gap="sm" data-ab-variant={heroVariant}>
            {heroLayout.map((key) => (
              <DashboardGrid.Item
                key={key}
                span="full"
                smSpan={6}
                lgSpan={4}
              >
                <div
                  draggable
                  data-card-key={key}
                  onDragStart={onCardDragStart(key)}
                  onDragOver={onCardDragOver}
                  onDrop={onCardDrop(key)}
                  className="relative"
                >
                  <button
                    type="button"
                    aria-label={`Drag ${key} card`}
                    data-testid={`health-hero-drag-${key}`}
                    className="absolute right-1 top-1 z-10 inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                    tabIndex={-1}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  {heroCardRenderers[key]()}
                </div>
              </DashboardGrid.Item>
            ))}
          </DashboardGrid>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetHeroLayout}
              data-testid="health-hero-reset-layout"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset layout
            </button>
          </div>

          {/* (v1.11.256, TODO 11.238) Hero metrics DataList wrapped
              in the Widget shell so the header stamp + refresh
              affordance reads consistently with the new Uptime +
              Auto dashboards. */}
          <Widget
            data-testid="health-hero-datalist"
            title="Hero metrics"
            updatedAt={data.startedAt ?? null}
            updatedLabel="snapshot from"
            onRefresh={() => {
              void refresh();
            }}
            loading={loading}
          >
            {/* (v1.11.277, TODO 11.259) Health hero metrics migrated
                from a flat `items` DataList to the grouped API so
                related rows (Process / Workers / Performance) live
                under sticky group headers + a hover scrubber for
                quick jumps. Compact viewMode collapses everything
                back to a single Workers-flavored set so the rhythm
                stays the same as v1.11.276. */}
            {viewMode === 'compact' ? (
              <DataList
                items={[
                  { id: 'uptime', label: t('healthPage.stat.uptime'), value: formatDuration((data.uptime ?? 0) * 1000) },
                  { id: 'active', label: t('healthPage.stat.active'), value: formatNumber(data.activeWorkers ?? data.busyWorkers) },
                  { id: 'queueDepth', label: t('healthPage.stat.queueDepth'), value: formatNumber(data.queueDepth) },
                  { id: 'lostWorkers', label: t('healthPage.stat.lostWorkers'), value: formatNumber(data.lostWorkers) },
                ] satisfies DataListItem[]}
              />
            ) : (
              <DataList
                groups={[
                  {
                    id: 'process',
                    title: 'Process',
                    items: [
                      { id: 'pid', label: t('healthPage.stat.pid'), value: data.pid != null ? String(data.pid) : '-' },
                      { id: 'uptime', label: t('healthPage.stat.uptime'), value: formatDuration((data.uptime ?? 0) * 1000) },
                      { id: 'started', label: t('healthPage.stat.started'), value: formatRelativeTime(data.startedAt) },
                    ],
                  },
                  {
                    id: 'workers',
                    title: 'Workers',
                    items: [
                      { id: 'workersTotal', label: t('healthPage.stat.workersTotal'), value: formatNumber(data.workers) },
                      { id: 'active', label: t('healthPage.stat.active'), value: formatNumber(data.activeWorkers ?? data.busyWorkers) },
                      { id: 'idle', label: t('healthPage.stat.idle'), value: formatNumber(data.idleWorkers) },
                      { id: 'queueDepth', label: t('healthPage.stat.queueDepth'), value: formatNumber(data.queueDepth) },
                      { id: 'lostWorkers', label: t('healthPage.stat.lostWorkers'), value: formatNumber(data.lostWorkers) },
                    ],
                  },
                  {
                    id: 'performance',
                    title: 'Performance',
                    items: [
                      { id: 'eventLoopLag', label: t('healthPage.stat.eventLoopLag'), value: data.eventLoopLagMs != null ? `${data.eventLoopLagMs} ms` : '-' },
                    ],
                  },
                ]}
              />
            )}
          </Widget>

          {/* (11.175) Settings panel - NumberInput primitive adoption. */}
          <Panel className="flex flex-wrap items-center gap-3 p-3 text-xs">
            <span className="font-medium text-foreground">Settings</span>
            <label className="flex items-center gap-2 text-muted-foreground">
              <span>Poll timeout</span>
              <NumberInput
                value={pollTimeoutMs}
                onChange={setPollTimeoutMs}
                min={500}
                max={60000}
                step={500}
                unit="ms"
                ariaLabel="Health poll timeout (ms)"
                size="sm"
                className="w-40"
              />
            </label>
          </Panel>

          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>Was this dashboard helpful?</span>
            <Rating
              value={0}
              max={5}
              onChange={(v) => console.log('[health.rating]', v)}
              size="sm"
              label="Was this dashboard helpful?"
            />
          </div>

          {Array.isArray(data.modules) && data.modules.length > 0 ? (
            <Collapsible
              title={tFormat('healthPage.modules.loaded', { n: String(data.modules.length) })}
              description="Modules currently registered in the daemon's runtime - sub-systems reporting health back to /api/health."
              className="text-xs"
            >
              <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                {data.modules.map((m) => (
                  <li key={m} className="truncate text-muted-foreground">{m}</li>
                ))}
              </ul>
            </Collapsible>
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

