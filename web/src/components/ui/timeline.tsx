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

// (v1.11.395, TODO 11.377) Density variants. `default`
// matches the legacy 11.149 layout byte-for-byte
// (h-4 dot + pb-4 row + text-sm title). `compact` is
// tighter for sidebars / nested panels; `dense` collapses
// the row to a single text line (timestamp inline) for
// huge activity logs where every pixel counts.
export type TimelineVariant = 'default' | 'compact' | 'dense';

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
  // (v1.11.395, TODO 11.377) Density variant. Default
  // `default` keeps legacy byte-identical layout.
  variant?: TimelineVariant;
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
  variant: TimelineVariant;
}

// (v1.11.395, TODO 11.377) Per-variant class maps. Default
// stays byte-identical to the legacy 11.149 layout; compact
// halves the row padding + dot size; dense collapses the
// title row to a single line with timestamp inline.
interface VariantClasses {
  li: string;
  connectorLeft: string;
  connectorTop: string;
  dot: string;
  dotInner: string;
  bodyGap: string;
  titleText: string;
  timestampText: string;
  descriptionText: string;
  dotIconSize: string;
}

const VARIANT_CLASS: Record<TimelineVariant, VariantClasses> = {
  default: {
    li: 'relative flex gap-3 pl-6 pb-4 last:pb-0',
    connectorLeft: 'absolute left-[7px] top-3 bottom-0 w-px bg-border',
    connectorTop: '',
    dot: 'absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background',
    dotInner: 'flex h-3 w-3 items-center justify-center text-[10px] text-background',
    bodyGap: 'min-w-0 flex-1',
    titleText: 'text-sm font-medium text-foreground',
    timestampText: 'text-[11px] uppercase tracking-wide text-muted-foreground',
    descriptionText: 'mt-0.5 text-xs text-muted-foreground',
    dotIconSize: '',
  },
  compact: {
    li: 'relative flex gap-2 pl-5 pb-2 last:pb-0',
    connectorLeft: 'absolute left-[5px] top-2.5 bottom-0 w-px bg-border',
    connectorTop: '',
    dot: 'absolute left-0 top-1 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-background',
    dotInner: 'flex h-2 w-2 items-center justify-center text-[8px] text-background',
    bodyGap: 'min-w-0 flex-1',
    titleText: 'text-xs font-medium text-foreground',
    timestampText: 'text-[10px] uppercase tracking-wide text-muted-foreground',
    descriptionText: 'mt-0.5 text-[11px] text-muted-foreground',
    dotIconSize: '',
  },
  dense: {
    li: 'relative flex items-center gap-2 pl-4 pb-1 last:pb-0',
    connectorLeft: 'absolute left-[3px] top-2 bottom-0 w-px bg-border',
    connectorTop: '',
    dot: 'absolute left-0 top-1.5 flex h-2 w-2 items-center justify-center rounded-full ring-2 ring-background',
    dotInner: 'sr-only',
    bodyGap: 'min-w-0 flex-1 flex items-baseline gap-2',
    titleText: 'text-xs text-foreground truncate',
    timestampText: 'text-[10px] text-muted-foreground shrink-0',
    descriptionText: 'sr-only',
    dotIconSize: '',
  },
};

function TimelineRow({ item, showConnector, variant }: RowProps) {
  const tone: TimelineTone = item.tone ?? 'neutral';
  const v = VARIANT_CLASS[variant];
  const isDense = variant === 'dense';
  return (
    <li
      data-timeline-item
      data-tone={tone}
      data-variant={variant}
      className={v.li}
    >
      {showConnector ? (
        <span
          aria-hidden="true"
          data-timeline-connector
          className={v.connectorLeft}
        />
      ) : null}
      <span
        aria-hidden="true"
        data-timeline-dot
        className={cn(v.dot, TONE_DOT[tone])}
      >
        {item.icon && !isDense ? (
          <span className={v.dotInner}>{item.icon}</span>
        ) : null}
      </span>
      <div className={v.bodyGap}>
        {isDense ? (
          <>
            <span
              data-timeline-timestamp
              className={v.timestampText}
            >
              {formatTimestamp(item.timestamp)}
            </span>
            <span
              data-timeline-title
              className={v.titleText}
            >
              {item.title}
            </span>
          </>
        ) : (
          <>
            <div
              data-timeline-timestamp
              className={v.timestampText}
            >
              {formatTimestamp(item.timestamp)}
            </div>
            <div
              data-timeline-title
              className={v.titleText}
            >
              {item.title}
            </div>
            {item.description ? (
              <div
                data-timeline-description
                className={v.descriptionText}
              >
                {item.description}
              </div>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

export function Timeline({
  items,
  groupByDay = false,
  variant = 'default',
  className,
  ...rest
}: TimelineProps) {
  if (!groupByDay) {
    return (
      <ol
        data-timeline=""
        data-variant={variant}
        className={cn('relative flex flex-col', className)}
        {...rest}
      >
        {items.map((item, idx) => (
          <TimelineRow
            key={item.id}
            item={item}
            showConnector={idx < items.length - 1}
            variant={variant}
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
      data-variant={variant}
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
                  variant={variant}
                />
              ))}
            </ol>
          </Fragment>
        );
      })}
    </ol>
  );
}
