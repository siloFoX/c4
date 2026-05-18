import { useMemo, useState } from 'react';
import { Activity, Clock, FileText, GitBranch, Terminal } from 'lucide-react';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  DataList,
  HScroll,
  Pagination,
  Panel,
  Tabs,
  TabsPanel,
  TimeAgo,
  type BadgeVariant,
  type DataListItem,
  type TabsItem,
} from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import { useHashRoute, makeBreadcrumbNavigator } from '../lib/use-hash-route';
import type { HistoryWorkerDetail } from './HistoryView';

// (v1.10.564) Extracted from HistoryView. The right-pane detail
// for a selected history worker — header (status / branch /
// worktree), past-tasks list with commit hashes, and the raw
// scrollback. Pure display.
//
// (v1.10.779) BadgeVariant alias hoisted to ui/badge.
//
// (v1.11.333, TODO 11.315) Detail polish: Tabs split the body
// into Task / Output / Metrics so the operator can pivot
// between recent dispatches, raw scrollback, and a summary
// breakdown. Timestamps render via TimeAgo (short variant)
// with the absolute time on hover. Commit hashes render via
// the CopyButton primitive so a click copies the full SHA
// while the visible label shows the short hash.

function recordStatusVariant(status: string | null | undefined): BadgeVariant {
  if (!status) return 'secondary';
  const s = status.toLowerCase();
  if (s.includes('error') || s.includes('fail')) return 'destructive';
  if (s.includes('ok') || s.includes('complete') || s.includes('merged')) return 'success';
  if (s.includes('pending') || s.includes('busy')) return 'warning';
  return 'outline';
}

interface Props {
  detail: HistoryWorkerDetail;
}

// (v1.11.282, TODO 11.264) Past-tasks pagination state. 5 rows
// per page keeps the detail pane scrollable but bounded; the
// raw scrollback section above the records expands to fill the
// rest of the vertical space.
const RECORDS_PAGE_SIZE = 5;

// (v1.11.333, TODO 11.315) Detail-pane Tabs.
type DetailTabKey = 'task' | 'output' | 'metrics';

interface MetricsBreakdown {
  total: number;
  ok: number;
  error: number;
  pending: number;
  other: number;
  commits: number;
}

function deriveMetrics(detail: HistoryWorkerDetail): MetricsBreakdown {
  let ok = 0;
  let err = 0;
  let pending = 0;
  let other = 0;
  let commits = 0;
  for (const r of detail.records) {
    commits += r.commits.length;
    const s = (r.status ?? '').toLowerCase();
    if (s.includes('error') || s.includes('fail')) err += 1;
    else if (s.includes('ok') || s.includes('complete') || s.includes('merged')) ok += 1;
    else if (s.includes('pending') || s.includes('busy')) pending += 1;
    else other += 1;
  }
  return {
    total: detail.records.length,
    ok,
    error: err,
    pending,
    other,
    commits,
  };
}

export default function HistoryDetailPane({ detail }: Props) {
  useLocale();
  // (v1.11.377, TODO 11.359) Hash-routed
  // breadcrumb adapter. The History root crumb
  // is now clickable; selecting it navigates
  // back to the History route via hash without a
  // full page reload.
  const { navigate } = useHashRoute();
  const breadcrumbNav = makeBreadcrumbNavigator(navigate);
  const [recordsPage, setRecordsPage] = useState(1);
  const [activeTab, setActiveTab] = useState<DetailTabKey>('task');
  const recordsTotal = detail.records.length;
  const recordsTotalPages = Math.max(1, Math.ceil(recordsTotal / RECORDS_PAGE_SIZE));
  const safeRecordsPage = Math.min(Math.max(1, recordsPage), recordsTotalPages);
  const visibleRecords = detail.records.slice(
    (safeRecordsPage - 1) * RECORDS_PAGE_SIZE,
    safeRecordsPage * RECORDS_PAGE_SIZE,
  );
  const metrics = useMemo(() => deriveMetrics(detail), [detail]);

  const tabItems: TabsItem[] = [
    { value: 'task', label: 'Task', icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'output', label: 'Output', icon: <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'metrics', label: 'Metrics', icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];
  return (
    <Card
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-print-section="history-detail"
    >
      <CardHeader className="p-4 md:p-5">
        {/* (v1.11.301, TODO 11.283) Breadcrumb context row.
            Renders "History / <worker-name>" so the operator
            can see the page hierarchy without leaving the
            detail pane. Long worker names truncate-middle at
            24 chars so the navbar does not push the
            CardTitle off the right edge. */}
        <Breadcrumbs
          className="mb-2"
          maxLabelLength={24}
          items={[
            {
              id: 'history',
              label: t('history.sidebar.title'),
              href: '#feature=history',
              onClick: breadcrumbNav('#feature=history'),
            },
            { id: 'worker', label: detail.name },
          ]}
        />
        {/* (v1.11.300, TODO 11.282) Worker identity header now
            leads with the Avatar tile + status overlay. Alive
            workers wear an `online` dot; closed/exited workers
            wear `offline`. The CardTitle stays alongside so SR
            users still hear the worker name as the primary
            label. */}
        <div className="flex items-center gap-2">
          <Avatar
            name={detail.name}
            size="md"
            status={detail.alive ? 'online' : 'offline'}
          />
          <CardTitle className="flex-1 min-w-0 truncate">
            {detail.name}
          </CardTitle>
        </div>
        <CardDescription>
          <DataList
            className="mt-1"
            items={[
              {
                id: 'status',
                label: t('history.detail.label.status'),
                value: (
                  <Badge variant={detail.alive ? 'success' : 'secondary'} className="uppercase">
                    {detail.alive ? detail.status || t('history.status.live') : t('history.status.closed')}
                  </Badge>
                ),
              },
              ...(detail.branch
                ? [
                    {
                      id: 'branch',
                      label: t('history.detail.label.branch'),
                      value: (
                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                          <GitBranch aria-hidden="true" className="h-3.5 w-3.5" />
                          {detail.branch}
                        </span>
                      ),
                      copyValue: detail.branch,
                    } as DataListItem,
                  ]
                : []),
              ...(detail.worktree
                ? [
                    {
                      id: 'worktree',
                      label: t('history.detail.label.worktree'),
                      value: <span className="font-mono text-xs">{detail.worktree}</span>,
                      copyValue: detail.worktree,
                      truncate: true,
                    } as DataListItem,
                  ]
                : []),
            ]}
          />
        </CardDescription>
      </CardHeader>

      <CardContent
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 pt-0 md:p-5 md:pt-0"
        data-section="history-detail-body"
      >
        {/* (v1.11.333, TODO 11.315) Detail body now splits into
            three Tabs: Task (past tasks list), Output (raw
            scrollback), Metrics (record breakdown). The Task
            tab is the default landing surface so the operator's
            first glance still lands on the same content as
            before. */}
        <Tabs
          value={activeTab}
          onChange={(v) => setActiveTab(v as DetailTabKey)}
          items={tabItems}
          ariaLabel="History detail sections"
          data-testid="history-detail-tabs"
        >
          <TabsPanel value="task" className="mt-3">
            <section data-section="history-detail-task">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                {tFormat('history.section.pastTasks', { count: detail.records.length })}
              </h3>
              {detail.records.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('history.empty.tasks')}</div>
              ) : (
                <ul className="space-y-2">
                  {visibleRecords.map((r, i) => (
                    <Panel
                      key={`${r.completedAt || i}-${i}`}
                      className="text-xs text-foreground"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex-1 whitespace-pre-wrap break-words font-medium">
                          {r.task || t('history.record.noTaskText')}
                        </span>
                        <Badge variant={recordStatusVariant(r.status)} className="shrink-0 uppercase">
                          {r.status || t('history.record.unknownStatus')}
                        </Badge>
                      </div>
                      <HScroll gap="sm" snap={false} className="mt-1 text-[11px] text-muted-foreground">
                        {r.branch && (
                          <span data-h-scroll-item className="inline-flex items-center gap-1 font-mono">
                            <GitBranch aria-hidden="true" className="h-3 w-3" />
                            {r.branch}
                          </span>
                        )}
                        {/* (v1.11.333, TODO 11.315) Timestamps
                            now render via the TimeAgo primitive so
                            the operator sees a human "5 min ago"
                            string with the absolute timestamp on
                            hover. Falls back to '?' when the
                            timestamp is missing. */}
                        {r.startedAt ? (
                          <span data-h-scroll-item data-section="history-record-started">
                            <TimeAgo value={r.startedAt} variant="short" />
                          </span>
                        ) : (
                          <span data-h-scroll-item className="font-mono">?</span>
                        )}
                        {r.completedAt && (
                          <span
                            data-h-scroll-item
                            data-section="history-record-completed"
                            className="inline-flex items-center gap-1"
                          >
                            <span aria-hidden="true">-&gt;</span>
                            <TimeAgo value={r.completedAt} variant="short" />
                          </span>
                        )}
                      </HScroll>
                      {r.commits.length > 0 && (
                        <ul
                          className="mt-2 space-y-1 text-[11px] text-muted-foreground"
                          data-section="history-record-commits"
                        >
                          {r.commits.map((c, j) => (
                            <li
                              key={`${c.hash}-${j}`}
                              className="flex items-start gap-1.5"
                            >
                              {/* (v1.11.333, TODO 11.315) Commit
                                  hash is now a CopyButton (which
                                  wraps a Tooltip) so the operator
                                  can copy the full SHA with one
                                  click. The label shows the
                                  short SHA; the clipboard receives
                                  the full hash. */}
                              <CopyButton
                                value={c.hash}
                                label={`commit ${c.hash}`}
                                variant="icon+label"
                                size="sm"
                                data-testid={`history-record-commit-${c.hash.slice(0, 7)}`}
                              >
                                <code className="font-mono text-foreground">
                                  {c.hash.slice(0, 7)}
                                </code>
                              </CopyButton>
                              <span className="min-w-0 break-words">{c.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Panel>
                  ))}
                </ul>
              )}
              {/* (v1.11.282, TODO 11.264) Past-tasks pagination. Only
                  renders when the record count exceeds the page size
                  so short histories stay clean. Uses showFirstLast +
                  showJumpToPage for long-running workers (hundreds of
                  recorded tasks). */}
              {detail.records.length > RECORDS_PAGE_SIZE ? (
                <div
                  className="mt-3 flex justify-center"
                  data-testid="history-records-pagination"
                >
                  <Pagination
                    page={safeRecordsPage}
                    totalPages={recordsTotalPages}
                    onPageChange={setRecordsPage}
                    ariaLabel="Past tasks pagination"
                    showFirstLast
                    showJumpToPage
                  />
                </div>
              ) : null}
            </section>
          </TabsPanel>

          <TabsPanel value="output" className="mt-3 flex min-h-0 flex-1 flex-col">
            <section
              className="flex min-h-0 flex-1 flex-col"
              data-section="history-detail-output"
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('history.section.scrollback')}
              </h3>
              {detail.scrollback ? (
                <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-2 text-xs text-foreground">
                  {detail.scrollback.content}
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('history.empty.scrollback')}
                </div>
              )}
            </section>
          </TabsPanel>

          <TabsPanel value="metrics" className="mt-3">
            <section data-section="history-detail-metrics">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Record breakdown
              </h3>
              <DataList
                items={[
                  {
                    id: 'metrics-total',
                    label: 'Total records',
                    value: <span className="font-mono">{metrics.total}</span>,
                  },
                  {
                    id: 'metrics-ok',
                    label: 'Completed / merged',
                    value: <span className="font-mono">{metrics.ok}</span>,
                  },
                  {
                    id: 'metrics-error',
                    label: 'Errors / failures',
                    value: <span className="font-mono">{metrics.error}</span>,
                  },
                  {
                    id: 'metrics-pending',
                    label: 'Pending / busy',
                    value: <span className="font-mono">{metrics.pending}</span>,
                  },
                  {
                    id: 'metrics-other',
                    label: 'Other / unknown',
                    value: <span className="font-mono">{metrics.other}</span>,
                  },
                  {
                    id: 'metrics-commits',
                    label: 'Commits recorded',
                    value: <span className="font-mono">{metrics.commits}</span>,
                  },
                ]}
              />
            </section>
          </TabsPanel>
        </Tabs>
      </CardContent>
    </Card>
  );
}
