import { forwardRef } from 'react';
import type { ForwardedRef, HTMLAttributes, ReactNode } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.433, TODO 11.415) TimelineStep primitive.
//
// Single vertical step indicator that composes into a larger
// wizard / progress timeline. Each instance owns the circle
// + connector lines + an optional content slot to the right
// of the circle. The host arranges the steps in a flex column
// and supplies `showConnectorBefore` / `showConnectorAfter`
// flags so the first / last step does not paint orphan
// connectors.
//
// Distinct from `<Stepper>` (11.252 / 11.376) -- Stepper is the
// full multi-step composer that walks a `StepperStep[]` array.
// TimelineStep is the building block, exposed for hosts that
// want to assemble custom timeline layouts (audit log entries,
// release-cut milestones, etc.).
//
// Reference: /root/c4/arps-design-system-v1/.

export type TimelineStepState =
  | 'completed'
  | 'current'
  | 'pending'
  | 'error';

export type TimelineStepSize = 'sm' | 'md' | 'lg';

export type TimelineStepConnectorState = 'completed' | 'pending';

export interface TimelineStepProps
  extends Omit<HTMLAttributes<HTMLLIElement>, 'children'> {
  state?: TimelineStepState;
  icon?: ReactNode;
  label?: ReactNode;
  description?: ReactNode;
  showConnectorBefore?: boolean;
  showConnectorAfter?: boolean;
  connectorState?: TimelineStepConnectorState;
  size?: TimelineStepSize;
  ariaLabel?: string;
  className?: string;
  // Optional right-rail child slot (e.g., timestamp).
  meta?: ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const TIMELINE_STEP_STATE_CLASS: Record<
  TimelineStepState,
  {
    circle: string;
    icon: string;
    label: string;
    description: string;
  }
> = {
  completed: {
    circle: 'bg-emerald-500 border-emerald-500 text-white',
    icon: 'text-white',
    label: 'text-foreground',
    description: 'text-muted-foreground',
  },
  current: {
    circle:
      'bg-primary border-primary text-primary-foreground ring-2 ring-primary/30',
    icon: 'text-primary-foreground',
    label: 'text-foreground font-semibold',
    description: 'text-muted-foreground',
  },
  pending: {
    circle:
      'bg-background border-border text-muted-foreground',
    icon: 'text-muted-foreground',
    label: 'text-muted-foreground',
    description: 'text-muted-foreground/70',
  },
  error: {
    circle: 'bg-rose-500 border-rose-500 text-white',
    icon: 'text-white',
    label: 'text-rose-500',
    description: 'text-muted-foreground',
  },
};

const SIZE_CLASS: Record<
  TimelineStepSize,
  { circle: string; icon: string; label: string; description: string; gap: string; connector: string }
> = {
  sm: {
    circle: 'h-5 w-5',
    icon: 'h-2.5 w-2.5',
    label: 'text-xs',
    description: 'text-[11px]',
    gap: 'gap-2',
    connector: 'w-px',
  },
  md: {
    circle: 'h-6 w-6',
    icon: 'h-3 w-3',
    label: 'text-sm',
    description: 'text-xs',
    gap: 'gap-3',
    connector: 'w-px',
  },
  lg: {
    circle: 'h-8 w-8',
    icon: 'h-4 w-4',
    label: 'text-base',
    description: 'text-sm',
    gap: 'gap-4',
    connector: 'w-0.5',
  },
};

const CONNECTOR_STATE_CLASS: Record<
  TimelineStepConnectorState,
  string
> = {
  completed: 'bg-emerald-500',
  pending: 'bg-border',
};

export function isTimelineStepReachable(
  state: TimelineStepState,
): boolean {
  return state === 'completed' || state === 'current';
}

export function getTimelineStepDefaultIcon(
  state: TimelineStepState,
): ReactNode {
  if (state === 'completed') return <Check aria-hidden="true" />;
  if (state === 'error') return <AlertCircle aria-hidden="true" />;
  return null;
}

export function getTimelineStepAriaCurrent(
  state: TimelineStepState,
): 'step' | undefined {
  return state === 'current' ? 'step' : undefined;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const TimelineStep = forwardRef(function TimelineStep(
  {
    state = 'pending',
    icon,
    label,
    description,
    showConnectorBefore = false,
    showConnectorAfter = false,
    connectorState,
    size = 'md',
    ariaLabel,
    className,
    meta,
    ...rest
  }: TimelineStepProps,
  ref: ForwardedRef<HTMLLIElement>,
) {
  const stateTokens = TIMELINE_STEP_STATE_CLASS[state];
  const sizing = SIZE_CLASS[size];

  // Connector state defaults: completed step -> emerald above &
  // below (a completed step "passes through"). pending /
  // current / error -> connectors above remain completed only
  // when state is current/error; below remain pending.
  const beforeState: TimelineStepConnectorState =
    connectorState ??
    (state === 'completed' ||
    state === 'current' ||
    state === 'error'
      ? 'completed'
      : 'pending');
  const afterState: TimelineStepConnectorState =
    connectorState ??
    (state === 'completed' ? 'completed' : 'pending');

  const resolvedIcon =
    icon !== undefined ? icon : getTimelineStepDefaultIcon(state);

  const ariaCurrent = getTimelineStepAriaCurrent(state);

  return (
    <li
      ref={ref}
      role="listitem"
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
      data-section="timeline-step"
      data-state={state}
      data-size={size}
      data-show-connector-before={showConnectorBefore ? 'true' : 'false'}
      data-show-connector-after={showConnectorAfter ? 'true' : 'false'}
      data-reachable={isTimelineStepReachable(state) ? 'true' : 'false'}
      {...rest}
      className={cn(
        'flex items-start',
        sizing.gap,
        className,
      )}
    >
      <div
        aria-hidden="true"
        data-section="timeline-step-rail"
        className="relative flex shrink-0 flex-col items-center self-stretch"
      >
        {showConnectorBefore ? (
          <span
            data-section="timeline-step-connector-before"
            data-connector-state={beforeState}
            className={cn(
              'min-h-3 flex-1',
              sizing.connector,
              CONNECTOR_STATE_CLASS[beforeState],
            )}
          />
        ) : (
          <span
            data-section="timeline-step-rail-spacer"
            aria-hidden="true"
            className="min-h-3 flex-1"
          />
        )}
        <span
          data-section="timeline-step-circle"
          data-state={state}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full border-2',
            sizing.circle,
            stateTokens.circle,
          )}
        >
          {resolvedIcon ? (
            <span
              data-section="timeline-step-icon"
              data-icon-kind={
                icon !== undefined ? 'custom' : `default-${state}`
              }
              className={cn(
                'inline-flex items-center justify-center',
                sizing.icon,
                stateTokens.icon,
              )}
            >
              {resolvedIcon}
            </span>
          ) : null}
        </span>
        {showConnectorAfter ? (
          <span
            data-section="timeline-step-connector-after"
            data-connector-state={afterState}
            className={cn(
              'min-h-3 flex-1',
              sizing.connector,
              CONNECTOR_STATE_CLASS[afterState],
            )}
          />
        ) : (
          <span
            data-section="timeline-step-rail-spacer"
            aria-hidden="true"
            className="min-h-3 flex-1"
          />
        )}
      </div>
      {label !== undefined ||
      description !== undefined ||
      meta !== undefined ? (
        <div
          data-section="timeline-step-content"
          className="flex min-w-0 flex-1 flex-col py-1"
        >
          {label !== undefined ? (
            <span
              data-section="timeline-step-label"
              className={cn(
                'leading-tight',
                sizing.label,
                stateTokens.label,
              )}
            >
              {label}
            </span>
          ) : null}
          {description !== undefined ? (
            <span
              data-section="timeline-step-description"
              className={cn(
                'mt-0.5 leading-snug',
                sizing.description,
                stateTokens.description,
              )}
            >
              {description}
            </span>
          ) : null}
          {meta !== undefined ? (
            <span
              data-section="timeline-step-meta"
              className={cn(
                'mt-0.5 leading-snug',
                sizing.description,
                'text-muted-foreground',
              )}
            >
              {meta}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
});

TimelineStep.displayName = 'TimelineStep';
