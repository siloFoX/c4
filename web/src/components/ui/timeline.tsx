import { Fragment } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.167) Vertical event-list primitive (patch 11.149). Renders a
// connector line down the left rule with a tone-coloured dot per item;
// optional groupByDay collapses ISO yyyy-mm-dd headers around the set,
// with each group sorted ascending by timestamp. The connector is
// drawn on every <li> except the last one in its visible group, so
// adjacent groups never bleed a stray rule into the day header below.

export type TimelineTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger';

export interface TimelineItem {
  id: string;
  timestamp: string | Date;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: TimelineTone;
}

export interface TimelineProps
  extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  items: TimelineItem[];
  groupByDay?: boolean;
  className?: string;
}

const TONE_DOT: Record<TimelineTone, string> = {
  neutral: 'bg-muted',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

function toDate(input: string | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

function isoDayKey(input: string | Date): string {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return 'invalid-date';
  return d.toISOString().slice(0, 10);
}

function formatTimestamp(input: string | Date): string {
  const d = toDate(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString();
}

function formatDayLabel(key: string): string {
  if (key === 'invalid-date') return key;
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString();
}

interface RowProps {
  item: TimelineItem;
  showConnector: boolean;
}

function TimelineRow({ item, showConnector }: RowProps) {
  const tone: TimelineTone = item.tone ?? 'neutral';
  return (
    <li
      data-timeline-item
      data-tone={tone}
      className="relative flex gap-3 pl-6 pb-4 last:pb-0"
    >
      {showConnector ? (
        <span
          aria-hidden="true"
          data-timeline-connector
          className="absolute left-[7px] top-3 bottom-0 w-px bg-border"
        />
      ) : null}
      <span
        aria-hidden="true"
        data-timeline-dot
        className={cn(
          'absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background',
          TONE_DOT[tone],
        )}
      >
        {item.icon ? (
          <span className="flex h-3 w-3 items-center justify-center text-[10px] text-background">
            {item.icon}
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {formatTimestamp(item.timestamp)}
        </div>
        <div className="text-sm font-medium text-foreground">{item.title}</div>
        {item.description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.description}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function Timeline({
  items,
  groupByDay = false,
  className,
  ...rest
}: TimelineProps) {
  if (!groupByDay) {
    return (
      <ol
        data-timeline=""
        className={cn('relative flex flex-col', className)}
        {...rest}
      >
        {items.map((item, idx) => (
          <TimelineRow
            key={item.id}
            item={item}
            showConnector={idx < items.length - 1}
          />
        ))}
      </ol>
    );
  }

  const byDay = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const key = isoDayKey(item.timestamp);
    const bucket = byDay.get(key) ?? [];
    bucket.push(item);
    byDay.set(key, bucket);
  }
  const dayKeys = Array.from(byDay.keys()).sort();
  for (const key of dayKeys) {
    byDay.get(key)!.sort((a, b) => {
      return toDate(a.timestamp).getTime() - toDate(b.timestamp).getTime();
    });
  }

  return (
    <ol
      data-timeline=""
      data-grouped="day"
      className={cn('relative flex flex-col gap-3', className)}
      {...rest}
    >
      {dayKeys.map((key) => {
        const bucket = byDay.get(key)!;
        return (
          <Fragment key={key}>
            <h3
              data-timeline-day-header={key}
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {formatDayLabel(key)}
            </h3>
            <ol className="relative flex flex-col">
              {bucket.map((item, idx) => (
                <TimelineRow
                  key={item.id}
                  item={item}
                  showConnector={idx < bucket.length - 1}
                />
              ))}
            </ol>
          </Fragment>
        );
      })}
    </ol>
  );
}
