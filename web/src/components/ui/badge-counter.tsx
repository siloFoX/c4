import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.296, TODO 11.278) BadgeCounter -- tiny numeric / dot
// badge for nav-item counts. Sister primitive to <Badge>:
//   - <Badge> is a label-style chip with text content
//     ("running", "stuck", "v1.11.296") and signal icons.
//   - <BadgeCounter> is a count/dot indicator that sits on top
//     of a parent surface (nav icon, tab label, sidebar row).
//
// Visual sizes:
//   - sm: numeric pill ~16px tall, dot ~6px.
//   - md: numeric pill ~18px tall (default), dot ~8px.
//   - lg: numeric pill ~22px tall, dot ~10px.
// All three are touch-friendly on mobile via min-w/h tuning.
//
// Color tones map to the canonical signal palette:
//   - neutral: muted border + muted bg + muted-foreground text.
//   - accent: amber/warning palette (urgent but not blocking).
//   - danger: destructive palette (escalations, errors).
//   - success: emerald palette (positive counts, e.g.
//     "12 connected").
// Tone defaults to "neutral" so an accidental adoption never
// fires a colour signal.
//
// Behaviours:
//   - When `count` is a number, the rendered text is `count`
//     unless `count > max` (default 99) in which case it
//     reads `<max>+`. `count === 0` renders null UNLESS
//     `showZero` is true.
//   - When `variant="dot"`, no number is rendered -- the
//     dot itself carries the signal. `count` is still used
//     to drive the `aria-label`.
//   - `pulse` opts into a soft motion-safe pulse animation
//     for "new arrivals". Auto-disabled when the operator
//     has prefers-reduced-motion: reduce set.
//
// Accessibility:
//   - When `srLabel` is supplied, the badge announces the
//     full sentence ("3 unread notifications") via aria-label.
//   - When `srLabel` is omitted but `count` is a number, the
//     fallback label is just the count.
//   - `role="status"` so the screen reader announces changes
//     without needing aria-live wrapping by the caller.

export type BadgeCounterTone =
  | 'neutral'
  | 'accent'
  | 'danger'
  | 'success'
  | 'primary';
export type BadgeCounterSize = 'sm' | 'md' | 'lg';
export type BadgeCounterVariant = 'numeric' | 'dot';

export interface BadgeCounterProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  // Counter value. Required for numeric variant; used to
  // drive aria-label for the dot variant.
  count?: number;
  // Overflow ceiling. When `count > max`, the text reads
  // `<max>+`. Default 99 (so "100" -> "99+").
  max?: number;
  // Force-render even when count === 0. Useful for the
  // "0 errors" steady-state badge where the surface should
  // still appear.
  showZero?: boolean;
  tone?: BadgeCounterTone;
  size?: BadgeCounterSize;
  variant?: BadgeCounterVariant;
  // Soft pulse animation for new arrivals. Gated by
  // useReducedMotion -- callers can opt in unconditionally
  // and trust the primitive to mute it.
  pulse?: boolean;
  // Optional screen-reader sentence. When set, replaces the
  // default count-only aria-label.
  srLabel?: string;
  className?: string;
}

const TONE_CLASS: Record<BadgeCounterTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  accent: 'border-warning/40 bg-warning/15 text-warning',
  danger: 'border-destructive/40 bg-destructive/15 text-destructive',
  success: 'border-success/40 bg-success/15 text-success',
  primary: 'border-primary/30 bg-primary/30 text-foreground',
};

// Solid fill for the dot variant (no text inside, so a
// translucent /15 fill would be invisible).
const TONE_DOT_CLASS: Record<BadgeCounterTone, string> = {
  neutral: 'bg-muted-foreground',
  accent: 'bg-warning',
  danger: 'bg-destructive',
  success: 'bg-success',
  primary: 'bg-primary',
};

const SIZE_NUMERIC_CLASS: Record<BadgeCounterSize, string> = {
  sm: 'min-w-[14px] h-[14px] px-[3px] text-[9px] leading-none',
  md: 'min-w-[16px] h-[16px] px-[4px] text-[10px] leading-none',
  lg: 'min-w-[20px] h-[20px] px-[5px] text-[11px] leading-none',
};

const SIZE_DOT_CLASS: Record<BadgeCounterSize, string> = {
  sm: 'h-[6px] w-[6px]',
  md: 'h-[8px] w-[8px]',
  lg: 'h-[10px] w-[10px]',
};

export function BadgeCounter({
  count,
  max = 99,
  showZero = false,
  tone = 'neutral',
  size = 'md',
  variant = 'numeric',
  pulse = false,
  srLabel,
  className,
  ...rest
}: BadgeCounterProps) {
  const reducedMotion = useReducedMotion();
  const effectivePulse = pulse && !reducedMotion;

  // Numeric variant + 0 + no showZero -> render nothing so the
  // parent surface (nav row, tab label) stays clean. Dot
  // variant always renders -- callers are expected to gate the
  // mount themselves if they don't want it shown.
  if (variant === 'numeric' && (count === undefined || count === 0) && !showZero) {
    return null;
  }

  const displayCount =
    count === undefined
      ? null
      : count > max
        ? `${max}+`
        : String(count);

  const ariaLabel =
    srLabel ??
    (count === undefined ? undefined : `${displayCount}`);

  if (variant === 'dot') {
    return (
      <span
        role="status"
        aria-label={ariaLabel}
        data-section="badge-counter"
        data-variant="dot"
        data-tone={tone}
        data-pulse={effectivePulse ? 'true' : 'false'}
        className={cn(
          'inline-block rounded-full',
          SIZE_DOT_CLASS[size],
          TONE_DOT_CLASS[tone],
          effectivePulse && 'animate-pulse',
          className,
        )}
        {...rest}
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      data-section="badge-counter"
      data-variant="numeric"
      data-tone={tone}
      data-pulse={effectivePulse ? 'true' : 'false'}
      data-count={count}
      data-overflow={
        count !== undefined && count > max ? 'true' : 'false'
      }
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-semibold tabular-nums',
        SIZE_NUMERIC_CLASS[size],
        TONE_CLASS[tone],
        effectivePulse && 'animate-pulse',
        className,
      )}
      {...rest}
    >
      {displayCount}
    </span>
  );
}

BadgeCounter.displayName = 'BadgeCounter';
