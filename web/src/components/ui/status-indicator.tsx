import { forwardRef } from 'react';
import type { ForwardedRef, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.432, TODO 11.414) StatusIndicator primitive.
//
// Coloured dot + optional label with pulse animation. Default
// `role="status"` + `aria-live="polite"` so screen readers
// announce updates as the kind changes (e.g., from "pending"
// to "success" without operator focus). Pulse is gated through
// `motion-safe:` so `prefers-reduced-motion: reduce` drops the
// ping without disabling the colour cue.
//
// Reference: /root/c4/arps-design-system-v1/.

export type StatusIndicatorKind =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'pending';

export type StatusIndicatorSize = 'sm' | 'md' | 'lg';

export type StatusIndicatorPulse = boolean | 'subtle';

export interface StatusIndicatorProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'role'> {
  kind?: StatusIndicatorKind;
  size?: StatusIndicatorSize;
  label?: ReactNode;
  pulse?: StatusIndicatorPulse;
  ariaLabel?: string;
  hideDot?: boolean;
  decorative?: boolean;
  className?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const STATUS_INDICATOR_KIND_CLASS: Record<
  StatusIndicatorKind,
  { dot: string; ping: string; text: string }
> = {
  success: {
    dot: 'bg-emerald-500',
    ping: 'bg-emerald-500',
    text: 'text-emerald-500',
  },
  warning: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-500',
    text: 'text-amber-500',
  },
  error: {
    dot: 'bg-rose-500',
    ping: 'bg-rose-500',
    text: 'text-rose-500',
  },
  info: {
    dot: 'bg-sky-500',
    ping: 'bg-sky-500',
    text: 'text-sky-500',
  },
  neutral: {
    dot: 'bg-zinc-500',
    ping: 'bg-zinc-500',
    text: 'text-muted-foreground',
  },
  pending: {
    dot: 'bg-violet-500',
    ping: 'bg-violet-500',
    text: 'text-violet-500',
  },
};

const SIZE_CLASS: Record<
  StatusIndicatorSize,
  { dot: string; text: string; gap: string }
> = {
  sm: { dot: 'h-1.5 w-1.5', text: 'text-[11px]', gap: 'gap-1' },
  md: { dot: 'h-2 w-2', text: 'text-xs', gap: 'gap-1.5' },
  lg: { dot: 'h-2.5 w-2.5', text: 'text-sm', gap: 'gap-2' },
};

export function getStatusIndicatorAriaLabel(
  ariaLabel: string | undefined,
  kind: StatusIndicatorKind,
  label: ReactNode,
): string | undefined {
  if (ariaLabel) return ariaLabel;
  if (typeof label === 'string' && label.trim() !== '') return label;
  // Fall back to the kind word so AT still has a meaningful label
  // when the indicator renders without a textual label slot.
  return `Status: ${kind}`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const StatusIndicator = forwardRef(function StatusIndicator(
  {
    kind = 'neutral',
    size = 'md',
    label,
    pulse = false,
    ariaLabel,
    hideDot = false,
    decorative = false,
    className,
    ...rest
  }: StatusIndicatorProps,
  ref: ForwardedRef<HTMLSpanElement>,
) {
  const tokens = STATUS_INDICATOR_KIND_CLASS[kind];
  const sizing = SIZE_CLASS[size];
  const resolvedAria = getStatusIndicatorAriaLabel(
    ariaLabel,
    kind,
    label,
  );
  const showPulse = pulse !== false;
  const isSubtle = pulse === 'subtle';
  const role = decorative ? undefined : 'status';
  const ariaLive = decorative ? undefined : 'polite';

  return (
    <span
      ref={ref}
      role={role}
      aria-live={ariaLive}
      aria-label={
        decorative ? undefined : resolvedAria
      }
      aria-atomic={decorative ? undefined : true}
      data-section="status-indicator"
      data-kind={kind}
      data-size={size}
      data-pulse={
        pulse === false ? 'false' : isSubtle ? 'subtle' : 'true'
      }
      data-decorative={decorative ? 'true' : 'false'}
      data-hide-dot={hideDot ? 'true' : 'false'}
      {...rest}
      className={cn(
        'inline-flex items-center align-middle',
        sizing.gap,
        className,
      )}
    >
      {hideDot ? null : (
        <span
          aria-hidden="true"
          data-section="status-indicator-dot-wrapper"
          className={cn(
            'relative inline-flex shrink-0',
            sizing.dot,
          )}
        >
          {showPulse ? (
            <span
              data-section="status-indicator-pulse"
              data-pulse-kind={kind}
              className={cn(
                'absolute inset-0 rounded-full',
                tokens.ping,
                isSubtle ? 'opacity-30' : 'opacity-60',
                'motion-safe:animate-ping',
              )}
            />
          ) : null}
          <span
            data-section="status-indicator-dot"
            data-dot-kind={kind}
            className={cn(
              'relative inline-block rounded-full',
              sizing.dot,
              tokens.dot,
            )}
          />
        </span>
      )}
      {label ? (
        <span
          data-section="status-indicator-label"
          className={cn(
            'tabular-nums leading-none',
            sizing.text,
            tokens.text,
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
});

StatusIndicator.displayName = 'StatusIndicator';
