import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, GripVertical, HelpCircle, LayoutGrid, List, RefreshCw } from 'lucide-react';
import PageFrame from './PageFrame';
import { PageDescriptionBanner } from '../components/PageDescriptionBanner';
import { openHelpDrawer } from '../components/HelpUIRoot';
import {
  Accordion,
  AlertBanner,
  Badge,
  BadgeCounter,
  Button,
  CopyButton,
  DashboardGrid,
  DataList,
  DatePicker,
  Drawer,
  ErrorState,
  IconButton,
  NumberInput,
  PageHeader,
  Panel,
  Popover,
  Rating,
  ScrollArea,
  SegmentedControl,
  Sparkline,
  StatusDot,
  TimeAgo,
  Tooltip,
  VisuallyHidden,
  Widget,
} from '../components/ui';
import type { AccordionItem, DataListItem } from '../components/ui';
import { StatCardShape, TableRowShape } from '../components/ui/skeleton';
import { StatCard } from '../components/ui/stat-card';
import { cn } from '../lib/cn';
import { formatDuration, formatNumber } from '../lib/format';
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

// (v1.11.340, TODO 11.322) Module categorisation for the
// diagnostics Accordion. The daemon returns a flat array of
// module identifiers; grouping them by the leading path
// segment (or by file extension when there is no path) lets
// the page render one Accordion item per category instead of
// a single 200+ entry blob. Modules that look like bare
// names without an extension fall back to the "other"
// bucket. The function is exported for tests + tooling so
// the rule stays unit-checked.
export function categorizeModule(name: string): string {
  const trimmed = name.replace(/^[\\/]+/, '');
  const segments = trimmed.split(/[\\/]/);
  if (segments.length > 1 && segments[0]) {
    return segments[0];
  }
  const dot = trimmed.lastIndexOf('.');
  if (dot > 0 && dot < trimmed.length - 1) {
    return trimmed.slice(dot);
  }
  return 'other';
}

// (v1.11.340, TODO 11.322) Length cap before the module
// list is wrapped in a ScrollArea. Below the cap the list
// renders inline (lighter DOM, fewer scroll wrappers); at
// or above the cap the ScrollArea kicks in so the
// accordion item stays one viewport tall.
const MODULES_SCROLL_THRESHOLD = 12;

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

  // (v1.11.340, TODO 11.322) Per-category module buckets.
  // Keeps insertion order so the Accordion items render in a
  // predictable order across renders. Bare module arrays (no
  // path, no extension) collapse into a single "other"
  // bucket so the prior visual rhythm survives.
  const moduleGroups = useMemo<Map<string, string[]>>(() => {
    const out = new Map<string, string[]>();
    const list = Array.isArray(data?.modules) ? data!.modules! : [];
    for (const m of list) {
      const cat = categorizeModule(m);
      const arr = out.get(cat) ?? [];
      arr.push(m);
      out.set(cat, arr);
    }
    return out;
  }, [data?.modules]);

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
      {error && (
        /* (v1.11.340, TODO 11.322) ErrorState replaces the
           plain ErrorPanel banner. It surfaces a Retry button
           wired to the same `refresh` callback the header
           refresh icon uses, so the operator can recover
           without flipping to the header. role="alert"
           contract from the underlying primitive is preserved
           so the prior `getByRole('alert')` assertion still
           holds. */
        <ErrorState
          title="Could not load /api/health"
          description="The daemon returned an error. Retry to re-fetch."
          error={error}
          onRetry={() => {
            void refresh();
          }}
          data-testid="health-error-state"
        />
      )}
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
              <>
                <span className={cn('truncate', text.caption, 'font-mono')}>
                  {String(data.configPath)}
                </span>
                {/* (v1.11.285, TODO 11.267) CopyButton beside the
                    config path so the operator can pop it into a
                    `c4 config validate <path>` invocation without
                    selecting and copying the truncated text. */}
                <CopyButton
                  value={String(data.configPath)}
                  label="config path"
                  size="sm"
                  data-testid="health-config-path-copy"
                />
              </>
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
              /* (v1.11.279, TODO 11.261) Sparkline trends inline
                 with the DataList rows. The hardcoded sample
                 arrays mirror those used by the StatCard hero
                 tiles above so the operator sees a consistent
                 history shape in both surfaces; a future patch
                 will wire these to a real /api/health/history
                 endpoint. The Sparkline sits as the value's
                 right-hand sibling so the absolute number stays
                 first-readable. */
              <DataList
                groups={[
                  {
                    id: 'process',
                    title: 'Process',
                    items: [
                      { id: 'pid', label: t('healthPage.stat.pid'), value: data.pid != null ? String(data.pid) : '-' },
                      {
                        id: 'uptime',
                        label: t('healthPage.stat.uptime'),
                        value: (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid="health-row-uptime-trend"
                          >
                            <span className="tabular-nums">
                              {formatDuration((data.uptime ?? 0) * 1000)}
                            </span>
                            <Sparkline
                              data={[12, 14, 13, 15, 16, 18, 19, 21]}
                              variant="success"
                              size="sm"
                              ariaLabel="Uptime trend"
                            />
                          </span>
                        ),
                      },
                      {
                        id: 'started',
                        label: t('healthPage.stat.started'),
                        /* (v1.11.289, TODO 11.271) Daemon start-time
                           cell uses the TimeAgo primitive so the
                           "updated-at" row stays live (re-renders
                           on a delta-driven tick) without depending
                           on the Widget's outer refresh callback. */
                        value: data.startedAt ? (
                          <TimeAgo
                            value={data.startedAt}
                            variant="short"
                            data-testid="health-started-time-ago"
                          />
                        ) : (
                          '-'
                        ),
                      },
                    ],
                  },
                  {
                    id: 'workers',
                    title: 'Workers',
                    items: [
                      {
                        id: 'workersTotal',
                        label: t('healthPage.stat.workersTotal'),
                        value: (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid="health-row-workers-trend"
                          >
                            <span className="tabular-nums">
                              {formatNumber(data.workers)}
                            </span>
                            <Sparkline
                              data={[2, 2, 3, 3, 4, 3, 4, data.workers ?? 0]}
                              variant="default"
                              size="sm"
                              ariaLabel="Worker count trend"
                            />
                          </span>
                        ),
                      },
                      { id: 'active', label: t('healthPage.stat.active'), value: formatNumber(data.activeWorkers ?? data.busyWorkers) },
                      { id: 'idle', label: t('healthPage.stat.idle'), value: formatNumber(data.idleWorkers) },
                      {
                        id: 'queueDepth',
                        label: t('healthPage.stat.queueDepth'),
                        value: (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid="health-row-queue-trend"
                          >
                            <span className="tabular-nums">
                              {formatNumber(data.queueDepth)}
                            </span>
                            <Sparkline
                              data={[5, 4, 6, 3, 2, 1, 1, data.queueDepth ?? 0]}
                              variant={
                                (data.queueDepth ?? 0) > 0
                                  ? 'warning'
                                  : 'muted'
                              }
                              size="sm"
                              ariaLabel="Queue depth trend"
                            />
                          </span>
                        ),
                      },
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
            /* (v1.11.290, TODO 11.272) Single Collapsible migrated
               to the Accordion primitive with a "Modules" item
               (default-open) plus a "Build" item that surfaces
               the daemon version + config path together. The
               accordion's keyboard contract (ArrowDown / Home /
               End + roving tabindex) replaces the bespoke
               Collapsible chevron toggle.

               (v1.11.340, TODO 11.322) Modules now split into
               one Accordion item per category (path segment or
               extension). Each title carries a BadgeCounter
               chip with the per-category count, and long
               lists wrap in ScrollArea so the accordion item
               stays one viewport tall. Single-category
               results collapse to a single "modules" item so
               the prior "Loaded modules (n)" title (and the
               tests that key off it) keep working. */
            <Accordion
              mode="multi"
              ariaLabel="Diagnostics details"
              defaultOpenIds={
                moduleGroups.size === 1
                  ? ['modules']
                  : Array.from(moduleGroups.keys()).map(
                      (k) => `modules-${k}`,
                    )
              }
              data-testid="health-detail-accordion"
              className="text-xs"
              items={[
                ...(moduleGroups.size <= 1
                  ? [
                      {
                        id: 'modules',
                        title: (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid="health-modules-title"
                          >
                            {tFormat('healthPage.modules.loaded', {
                              n: String(data.modules.length),
                            })}
                            <BadgeCounter
                              count={data.modules.length}
                              tone="neutral"
                              size="sm"
                              srLabel={`${data.modules.length} loaded modules`}
                              data-testid="health-modules-count-badge"
                            />
                          </span>
                        ),
                        description:
                          'Sub-systems reporting health back to /api/health.',
                        content: (
                          /* (v1.11.340, TODO 11.322) ScrollArea
                             caps the module-list height so a
                             daemon with hundreds of modules
                             still renders inside one
                             viewport. The threshold gates the
                             wrapper so short lists stay free
                             of an unnecessary scroll shell. */
                          data.modules!.length >= MODULES_SCROLL_THRESHOLD ? (
                            <ScrollArea
                              axis="y"
                              data-testid="health-modules-scrollarea"
                              className="max-h-64"
                            >
                              <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                                {data.modules!.map((m) => (
                                  <li
                                    key={m}
                                    className="truncate text-muted-foreground"
                                  >
                                    {m}
                                  </li>
                                ))}
                              </ul>
                            </ScrollArea>
                          ) : (
                            <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                              {data.modules!.map((m) => (
                                <li
                                  key={m}
                                  className="truncate text-muted-foreground"
                                >
                                  {m}
                                </li>
                              ))}
                            </ul>
                          )
                        ),
                      } satisfies AccordionItem,
                    ]
                  : Array.from(moduleGroups.entries()).map<AccordionItem>(
                      ([category, mods]) => ({
                        id: `modules-${category}`,
                        title: (
                          <span
                            className="inline-flex items-center gap-2"
                            data-testid={`health-modules-title-${category}`}
                          >
                            <span className="font-mono">{category}</span>
                            <BadgeCounter
                              count={mods.length}
                              tone="neutral"
                              size="sm"
                              srLabel={`${mods.length} ${category} modules`}
                              data-testid={`health-modules-count-badge-${category}`}
                            />
                          </span>
                        ),
                        description: `Modules grouped by "${category}".`,
                        content:
                          mods.length >= MODULES_SCROLL_THRESHOLD ? (
                            <ScrollArea
                              axis="y"
                              data-testid={`health-modules-scrollarea-${category}`}
                              className="max-h-64"
                            >
                              <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                                {mods.map((m) => (
                                  <li
                                    key={m}
                                    className="truncate text-muted-foreground"
                                  >
                                    {m}
                                  </li>
                                ))}
                              </ul>
                            </ScrollArea>
                          ) : (
                            <ul className="grid grid-cols-1 gap-0.5 font-mono sm:grid-cols-2 lg:grid-cols-3">
                              {mods.map((m) => (
                                <li
                                  key={m}
                                  className="truncate text-muted-foreground"
                                >
                                  {m}
                                </li>
                              ))}
                            </ul>
                          ),
                      }),
                    )),
                {
                  id: 'build',
                  title: 'Build',
                  description: 'Daemon version + config source.',
                  content: (
                    <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                      <li>
                        version:{' '}
                        <span className="text-foreground">
                          {data.version ? `v${String(data.version)}` : '-'}
                        </span>
                      </li>
                      <li>
                        config:{' '}
                        <span className="text-foreground">
                          {data.configPath
                            ? String(data.configPath)
                            : '-'}
                        </span>
                      </li>
                    </ul>
                  ),
                },
              ]}
            />
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

