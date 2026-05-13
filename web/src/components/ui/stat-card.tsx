import { forwardRef, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Polished KPI card used by pages/Auto.tsx's hero stats row. The
// value count-up is intentionally implemented with rAF (not CSS
// transitions on a CSS counter) so non-integer fixed strings like
// "5m ago" still render correctly when the parent passes a string
// in place of a number. The numeric path also exposes the resolved
// final value via data-stat-final so tests can read the target
// without racing the animation.

export type StatCardTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'info';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode | undefined;
  label: string;
  value: number | string;
  hint?: ReactNode | undefined;
  loading?: boolean | undefined;
  tone?: StatCardTone | undefined;
  // Skip the count-up animation on number values. Used by tests so
  // assertions are deterministic without waitFor on every render.
  noAnimation?: boolean | undefined;
}

function useCountUp(target: number, enabled: boolean, durationMs = 700): number {
  const [value, setValue] = useState<number>(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    if (typeof requestAnimationFrame === 'undefined') {
      setValue(target);
      return;
    }
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return value;
}

function useChangePulse(value: number | string): boolean {
  const [pulse, setPulse] = useState(false);
  const prev = useRef<number | string>(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 600);
    return () => window.clearTimeout(id);
  }, [value]);
  return pulse;
}

const TONE_GRADIENT: Record<StatCardTone, string> = {
  default: 'from-muted/40 via-muted/10 to-transparent',
  primary: 'from-primary/20 via-primary/5 to-transparent',
  success: 'from-success/20 via-success/5 to-transparent',
  warning: 'from-warning/20 via-warning/5 to-transparent',
  info: 'from-info/20 via-info/5 to-transparent',
};

const TONE_ICON_RING: Record<StatCardTone, string> = {
  default: 'text-muted-foreground ring-border',
  primary: 'text-primary ring-primary/30',
  success: 'text-success ring-success/30',
  warning: 'text-warning ring-warning/30',
  info: 'text-info ring-info/30',
};

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      className,
      icon,
      label,
      value,
      hint,
      loading = false,
      tone = 'default',
      noAnimation = false,
      ...props
    },
    ref,
  ) => {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    const animated = useCountUp(isNumber ? value : 0, isNumber && !noAnimation);
    const pulse = useChangePulse(value);
    const display = isNumber ? animated : value;
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      setMounted(true);
    }, []);

    return (
      <div
        ref={ref}
        data-stat-card
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br',
            TONE_GRADIENT[tone],
          )}
        />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            {loading ? (
              <span
                role="status"
                aria-label={`${label} loading`}
                className="mt-2 inline-block h-8 w-20 animate-pulse rounded-md bg-muted/70"
              />
            ) : (
              <p
                data-stat-value
                data-stat-final={String(value)}
                className={cn(
                  'mt-2 text-3xl font-semibold leading-tight tabular-nums text-foreground',
                  pulse && 'animate-pulse',
                )}
              >
                {display}
              </p>
            )}
            {hint ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {icon ? (
            <span
              aria-hidden="true"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70 ring-1 backdrop-blur-sm',
                TONE_ICON_RING[tone],
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
      </div>
    );
  },
);
StatCard.displayName = 'StatCard';
