import { useState } from 'react';
import { Clock, GitBranch, Hash } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataList,
  HScroll,
  Pagination,
  Panel,
  type BadgeVariant,
  type DataListItem,
} from './ui';
import { t, tFormat, useLocale } from '../lib/i18n';
import type { HistoryWorkerDetail } from './HistoryView';

// (v1.10.564) Extracted from HistoryView. The right-pane detail
// for a selected history worker — header (status / branch /
// worktree), past-tasks list with commit hashes, and the raw
// scrollback. Pure display.
//
// (v1.10.779) BadgeVariant alias hoisted to ui/badge.

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(0, 19);
}

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

export default function HistoryDetailPane({ detail }: Props) {
  useLocale();
  const [recordsPage, setRecordsPage] = useState(1);
  const recordsTotal = detail.records.length;
  const recordsTotalPages = Math.max(1, Math.ceil(recordsTotal / RECORDS_PAGE_SIZE));
  const safeRecordsPage = Math.min(Math.max(1, recordsPage), recordsTotalPages);
  const visibleRecords = detail.records.slice(
    (safeRecordsPage - 1) * RECORDS_PAGE_SIZE,
    safeRecordsPage * RECORDS_PAGE_SIZE,
  );
  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col">
      <CardHeader className="p-4 md:p-5">
        <CardTitle>{detail.name}</CardTitle>
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

      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 pt-0 md:p-5 md:pt-0">
        <section>
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
                    <span data-h-scroll-item className="font-mono">{formatDate(r.startedAt) || '?'}</span>
                    {r.completedAt && (
                      <span data-h-scroll-item className="font-mono">-&gt; {formatDate(r.completedAt)}</span>
                    )}
                  </HScroll>
                  {r.commits.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {r.commits.map((c, j) => (
                        <li key={`${c.hash}-${j}`} className="flex items-start gap-1">
                          <Hash aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                          <code className="mr-1 text-foreground">{c.hash}</code>
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

        <section className="flex min-h-0 flex-1 flex-col">
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
      </CardContent>
    </Card>
  );
}
