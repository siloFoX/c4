import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import {
  AlertTriangle,
  CircleDot,
  Loader2,
  Moon,
  Pause,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.278, TODO 11.260) StatusPill -- small rounded pill that
// communicates an entity's lifecycle status (worker / session /
// service) with an icon + label combination. Built for the
// "status column" / "header chip" use cases where StatusDot
// alone is too quiet (operators want to scan a column and see
// "busy" instead of "amber").
//
// Status semantics:
//   - online:  alive + ready (worker idle accepting tasks)
//   - busy:    alive + currently processing (worker running a task)
//   - idle:    alive but no task in progress (a softer "online")
//   - offline: not alive (closed worker, disconnected session)
//   - error:   alive but in a bad state (crash loop, lost worker)
//
// Differences from <Badge>:
//   - Pinned status palette (5 keys, no free variant)
//   - Always carries an icon glyph -- the operator can identify
//     status from the glyph alone without reading text (helpful
//     in colour-blind workflows where the hue alone is ambiguous)
//   - Optional pulse animation for "active" states (online /
//     busy), gated on useReducedMotion() so operators with
//     prefers-reduced-motion never see the ping.

export type StatusPillStatus =
  | 'online'
  | 'busy'
  | 'idle'
  | 'offline'
  | 'error';

export type StatusPillSize = 'sm' | 'md';

export interface StatusPillProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: StatusPillStatus;
  // Optional label override; defaults to the capitalised status
  // key ("Online" / "Busy" / "Idle" / "Offline" / "Error").
  label?: ReactNode;
  // Optional icon override; defaults to the per-status glyph
  // table below. Pass `null` to render the pill with no glyph.
  icon?: ReactNode | null;
  // Pulse animation. Only takes effect for "active" states
  // (online / busy) and is suppressed when the operator has
  // requested reduced motion.
  pulse?: boolean;
  size?: StatusPillSize;
  className?: string;
}

// Default labels. Callers can override via the `label` prop.
const DEFAULT_LABELS: Record<StatusPillStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  offline: 'Offline',
  error: 'Error',
};

// Color tokens. Background is a 10% tint of the status hue so
// the pill reads as soft signal rather than alert. Text + border
// pick up the same hue so the trio reads as a unit.
const COLOR_BY_STATUS: Record<StatusPillStatus, string> = {
  online:
    'border-success/40 bg-success/10 text-success',
  busy:
    'border-warning/40 bg-warning/10 text-warning',
  idle:
    'border-border bg-muted text-muted-foreground',
  offline:
    'border-border bg-card text-muted-foreground',
  error:
    'border-destructive/40 bg-destructive/10 text-destructive',
};

const SIZE_CLASSES: Record<StatusPillSize, {
  pill: string;
  icon: string;
}> = {
  sm: {
    pill: 'h-5 gap-1 px-1.5 text-[10px]',
    icon: 'h-3 w-3',
  },
  md: {
    pill: 'h-6 gap-1.5 px-2 text-xs',
    icon: 'h-3.5 w-3.5',
  },
};

// Per-status default glyph. CircleDot reads as the most neutral
// "presence" glyph; the others pick the closest semantic match.
function defaultIcon(
  status: StatusPillStatus,
  iconCls: string,
  spinning: boolean,
): ReactNode {
  const common = { 'aria-hidden': true, className: iconCls } as const;
  switch (status) {
    case 'online':
      return <CircleDot {...common} />;
    case 'busy':
      return (
        <Loader2
          {...common}
          className={cn(iconCls, spinning && 'animate-spin')}
        />
      );
    case 'idle':
      return <Pause {...common} />;
    case 'offline':
      return <Moon {...common} />;
    case 'error':
      return <AlertTriangle {...common} />;
    default:
      return <CircleDot {...common} />;
  }
}

// Only "active" states get the pulse affordance. Idle / offline
// pulsing would be misleading -- the entity is, by definition,
// not doing anything.
const ACTIVE_STATES: ReadonlySet<StatusPillStatus> = new Set<StatusPillStatus>([
  'online',
  'busy',
]);

export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(
  (
    {
      status,
      label,
      icon,
      pulse = false,
      size = 'md',
      className,
      ...rest
    },
    ref,
  ) => {
    const reducedMotion = useReducedMotion();
    const isActive = ACTIVE_STATES.has(status);
    const showPulse = pulse && isActive && !reducedMotion;
    // For the busy status the icon itself is a spinner -- spin it
    // when pulse is requested + reduced-motion is off. (The pulse
    // halo is a separate visual; both honour the reduced-motion
    // contract independently.)
    const spinBusy = status === 'busy' && pulse && !reducedMotion;
    const sizing = SIZE_CLASSES[size];
    // `label === null` explicitly suppresses the label (icon-only
    // pill, useful in tight trailing slots). `label === undefined`
    // falls back to the default label.
    const resolvedLabel =
      label === undefined ? DEFAULT_LABELS[status] : label;
    const colorCls = COLOR_BY_STATUS[status];

    const resolvedIcon =
      icon === null
        ? null
        : icon !== undefined
          ? icon
          : defaultIcon(status, sizing.icon, spinBusy);

    // The aria-label folds the label into a "Status: <label>"
    // string so screen readers don't need to guess context from
    // the pill's surroundings. Callers can override via the
    // aria-label prop forwarded through `rest`. When the label is
    // explicitly suppressed (label === null), fall back to the
    // capitalised default so the pill still has an accessible
    // name.
    const ariaLabel =
      rest['aria-label'] ??
      (typeof resolvedLabel === 'string'
        ? `Status: ${resolvedLabel}`
        : `Status: ${DEFAULT_LABELS[status]}`);

    return (
      <span
        ref={ref}
        role="status"
        aria-label={ariaLabel}
        data-section="status-pill"
        data-status={status}
        data-size={size}
        data-pulse={showPulse ? 'true' : 'false'}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border font-medium uppercase tracking-wide',
          sizing.pill,
          colorCls,
          className,
        )}
        {...rest}
      >
        {resolvedIcon ? (
          <span className="relative inline-flex shrink-0 items-center justify-center">
            {showPulse ? (
              <span
                aria-hidden="true"
                data-status-pill-pulse="true"
                className={cn(
                  'absolute inline-flex animate-ping rounded-full opacity-60',
                  sizing.icon,
                  // Pulse halo uses the same hue but full opacity
                  // background so the ring is visible against the
                  // 10%-tint pill body.
                  status === 'online' && 'bg-success',
                  status === 'busy' && 'bg-warning',
                )}
              />
            ) : null}
            <span className="relative inline-flex">{resolvedIcon}</span>
          </span>
        ) : null}
        {resolvedLabel != null ? <span>{resolvedLabel}</span> : null}
      </span>
    );
  },
);
StatusPill.displayName = 'StatusPill';
