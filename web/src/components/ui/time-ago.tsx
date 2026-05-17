import { forwardRef, useEffect, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.289, TODO 11.271) TimeAgo -- canonical relative
// timestamp primitive. Re-renders on a delta-driven tick so a
// row that says "2m ago" updates to "3m ago" without a parent
// re-render. SSR-safe: the initial render uses a deterministic
// `now` (the prop value, or `new Date()` at mount). The effect
// installs the wall-clock tick once the component is in the
// browser.
//
// Differences from `components/RelativeTime.tsx` (kept for
// back-compat; new call sites should use this primitive):
//   - Lives in `components/ui/` (canonical UI primitive home).
//   - Adds a `variant` prop with two scales:
//       'long'  -- "2 minutes ago" / "in 3 hours" (RelativeTime
//                  behaviour; default for callers who omit the
//                  prop).
//       'short' -- "2m ago" / "in 3h" (compact, for table row
//                  cells where width matters).
//   - Exports the pure `formatTimeAgo(target, now, variant?)`
//     helper so call sites can format without rendering (e.g.
//     CSV exports, copy-to-clipboard strings).
//
// Reference: /root/c4/arps-design-system-v1/

export type TimeAgoValue = Date | string | number;
export type TimeAgoVariant = 'long' | 'short';

export interface TimeAgoProps
  extends Omit<HTMLAttributes<HTMLTimeElement>, 'children' | 'dateTime'> {
  value: TimeAgoValue;
  // Pin the "now" reference -- when set, the component does
  // NOT install a wall-clock tick (deterministic mode for
  // stories / test fixtures).
  now?: Date;
  variant?: TimeAgoVariant;
  // When true (default), the absolute locale string lands on
  // the `title=` attribute so hovering surfaces the exact
  // timestamp. Pass `false` to suppress (e.g. when the row
  // already shows the absolute time elsewhere).
  absoluteOnHover?: boolean;
  className?: string;
}

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const MS_MONTH = 30 * MS_DAY;
const MS_YEAR = 365 * MS_DAY;

function toDate(input: TimeAgoValue): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

function plural(n: number, unit: string): string {
  return n === 1 ? `${n} ${unit}` : `${n} ${unit}s`;
}

function longPast(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'just now';
  if (absDelta < MS_MINUTE) return `${Math.floor(absDelta / MS_SECOND)} seconds ago`;
  if (absDelta < MS_HOUR) return `${plural(Math.floor(absDelta / MS_MINUTE), 'minute')} ago`;
  if (absDelta < MS_DAY) return `${plural(Math.floor(absDelta / MS_HOUR), 'hour')} ago`;
  if (absDelta < MS_MONTH) return `${plural(Math.floor(absDelta / MS_DAY), 'day')} ago`;
  if (absDelta < MS_YEAR) return `${plural(Math.floor(absDelta / MS_MONTH), 'month')} ago`;
  return `${plural(Math.floor(absDelta / MS_YEAR), 'year')} ago`;
}

function longFuture(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'just now';
  if (absDelta < MS_MINUTE) return `in ${Math.floor(absDelta / MS_SECOND)} seconds`;
  if (absDelta < MS_HOUR) return `in ${plural(Math.floor(absDelta / MS_MINUTE), 'minute')}`;
  if (absDelta < MS_DAY) return `in ${plural(Math.floor(absDelta / MS_HOUR), 'hour')}`;
  if (absDelta < MS_MONTH) return `in ${plural(Math.floor(absDelta / MS_DAY), 'day')}`;
  if (absDelta < MS_YEAR) return `in ${plural(Math.floor(absDelta / MS_MONTH), 'month')}`;
  return `in ${plural(Math.floor(absDelta / MS_YEAR), 'year')}`;
}

function shortPast(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'now';
  if (absDelta < MS_MINUTE) return `${Math.floor(absDelta / MS_SECOND)}s ago`;
  if (absDelta < MS_HOUR) return `${Math.floor(absDelta / MS_MINUTE)}m ago`;
  if (absDelta < MS_DAY) return `${Math.floor(absDelta / MS_HOUR)}h ago`;
  if (absDelta < MS_MONTH) return `${Math.floor(absDelta / MS_DAY)}d ago`;
  if (absDelta < MS_YEAR) return `${Math.floor(absDelta / MS_MONTH)}mo ago`;
  return `${Math.floor(absDelta / MS_YEAR)}y ago`;
}

function shortFuture(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'now';
  if (absDelta < MS_MINUTE) return `in ${Math.floor(absDelta / MS_SECOND)}s`;
  if (absDelta < MS_HOUR) return `in ${Math.floor(absDelta / MS_MINUTE)}m`;
  if (absDelta < MS_DAY) return `in ${Math.floor(absDelta / MS_HOUR)}h`;
  if (absDelta < MS_MONTH) return `in ${Math.floor(absDelta / MS_DAY)}d`;
  if (absDelta < MS_YEAR) return `in ${Math.floor(absDelta / MS_MONTH)}mo`;
  return `in ${Math.floor(absDelta / MS_YEAR)}y`;
}

export function formatTimeAgo(
  target: Date,
  now: Date,
  variant: TimeAgoVariant = 'long',
): string {
  const delta = now.getTime() - target.getTime();
  const abs = Math.abs(delta);
  if (variant === 'short') {
    return delta >= 0 ? shortPast(abs) : shortFuture(abs);
  }
  return delta >= 0 ? longPast(abs) : longFuture(abs);
}

function pickInterval(absDelta: number): number {
  if (absDelta < MS_MINUTE) return MS_SECOND;
  if (absDelta < MS_HOUR) return MS_MINUTE;
  if (absDelta < MS_DAY) return MS_HOUR;
  return MS_DAY;
}

export const TimeAgo = forwardRef<HTMLTimeElement, TimeAgoProps>(
  (
    {
      value,
      now,
      variant = 'long',
      absoluteOnHover = true,
      className,
      ...rest
    },
    ref,
  ) => {
    const target = toDate(value);
    const valid = !Number.isNaN(target.getTime());

    const initialNow = now ?? new Date();
    const [tickNow, setTickNow] = useState<Date>(initialNow);

    useEffect(() => {
      if (now) {
        setTickNow(now);
        return;
      }
      if (!valid) return;
      let cancelled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        const current = new Date();
        const absDelta = Math.abs(current.getTime() - target.getTime());
        const interval = pickInterval(absDelta);
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setTickNow(new Date());
          schedule();
        }, interval);
      };
      setTickNow(new Date());
      schedule();
      return () => {
        cancelled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
      };
    }, [now, target.getTime(), valid]);

    if (!valid) {
      return (
        <time
          ref={ref}
          className={cn(className)}
          data-section="time-ago"
          data-time-ago="invalid"
          {...rest}
        >
          {String(value)}
        </time>
      );
    }

    const label = formatTimeAgo(target, tickNow, variant);
    const iso = target.toISOString();
    const titleAttr = absoluteOnHover ? target.toLocaleString() : undefined;

    return (
      <time
        ref={ref}
        className={cn(className)}
        dateTime={iso}
        title={titleAttr}
        data-section="time-ago"
        data-time-ago=""
        data-time-ago-variant={variant}
        {...rest}
      >
        {label}
      </time>
    );
  },
);
TimeAgo.displayName = 'TimeAgo';
