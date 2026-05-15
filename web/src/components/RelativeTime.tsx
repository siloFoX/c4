import { useEffect, useState } from 'react';

// (v1.11.228) Component-scope only: SSR-safe <time> wrapper that
// renders a self-refreshing relative timestamp ("3 minutes ago",
// "in 2 hours"). No external date libs - built-in Date math only.
// Refresh cadence is delta-driven: 1s under a minute, 1min under
// an hour, 1h under a day, 1d otherwise. The relative string is
// the visible label; the absolute locale string lives on the
// `title=` attribute (when absoluteOnHover) and the ISO string on
// `dateTime=`. See docs/patches/11.210-ui-relative-time.md.

export type RelativeTimeValue = Date | string | number;

export interface RelativeTimeProps {
  value: RelativeTimeValue;
  now?: Date;
  absoluteOnHover?: boolean;
  className?: string;
}

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const MS_MONTH = 30 * MS_DAY;
const MS_YEAR = 365 * MS_DAY;

function toDate(input: RelativeTimeValue): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

function plural(n: number, unit: string): string {
  return n === 1 ? `${n} ${unit}` : `${n} ${unit}s`;
}

function pastLabel(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'just now';
  if (absDelta < MS_MINUTE) return `${Math.floor(absDelta / MS_SECOND)} seconds ago`;
  if (absDelta < MS_HOUR) return `${plural(Math.floor(absDelta / MS_MINUTE), 'minute')} ago`;
  if (absDelta < MS_DAY) return `${plural(Math.floor(absDelta / MS_HOUR), 'hour')} ago`;
  if (absDelta < MS_MONTH) return `${plural(Math.floor(absDelta / MS_DAY), 'day')} ago`;
  if (absDelta < MS_YEAR) return `${plural(Math.floor(absDelta / MS_MONTH), 'month')} ago`;
  return `${plural(Math.floor(absDelta / MS_YEAR), 'year')} ago`;
}

function futureLabel(absDelta: number): string {
  if (absDelta < 30 * MS_SECOND) return 'just now';
  if (absDelta < MS_MINUTE) return `in ${Math.floor(absDelta / MS_SECOND)} seconds`;
  if (absDelta < MS_HOUR) return `in ${plural(Math.floor(absDelta / MS_MINUTE), 'minute')}`;
  if (absDelta < MS_DAY) return `in ${plural(Math.floor(absDelta / MS_HOUR), 'hour')}`;
  if (absDelta < MS_MONTH) return `in ${plural(Math.floor(absDelta / MS_DAY), 'day')}`;
  if (absDelta < MS_YEAR) return `in ${plural(Math.floor(absDelta / MS_MONTH), 'month')}`;
  return `in ${plural(Math.floor(absDelta / MS_YEAR), 'year')}`;
}

function formatRelative(target: Date, now: Date): string {
  const delta = now.getTime() - target.getTime();
  const abs = Math.abs(delta);
  return delta >= 0 ? pastLabel(abs) : futureLabel(abs);
}

function pickInterval(absDelta: number): number {
  if (absDelta < MS_MINUTE) return MS_SECOND;
  if (absDelta < MS_HOUR) return MS_MINUTE;
  if (absDelta < MS_DAY) return MS_HOUR;
  return MS_DAY;
}

export default function RelativeTime({
  value,
  now,
  absoluteOnHover = true,
  className,
}: RelativeTimeProps) {
  const target = toDate(value);
  const valid = !Number.isNaN(target.getTime());

  // (v1.11.228) Render the deterministic now-based label up-front so
  // SSR matches first client paint. The effect only ticks the clock
  // forward; it never seeds setInterval at module load.
  const initialNow = now ?? new Date();
  const [tickNow, setTickNow] = useState<Date>(initialNow);

  useEffect(() => {
    // When the caller supplies an explicit `now` (test fixtures,
    // freeze-frame stories), don't install a wall-clock timer -
    // we'd just drift away from the deterministic value.
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
      <time className={className} data-relative-time="invalid">
        {String(value)}
      </time>
    );
  }

  const label = formatRelative(target, tickNow);
  const iso = target.toISOString();
  const title = absoluteOnHover ? target.toLocaleString() : undefined;

  return (
    <time
      className={className}
      dateTime={iso}
      title={title}
      data-relative-time=""
    >
      {label}
    </time>
  );
}
