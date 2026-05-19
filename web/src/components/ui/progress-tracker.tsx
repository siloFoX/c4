import { forwardRef } from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.439, TODO 11.421) ProgressTracker primitive.
//
// Multi-step progress tracker with named milestones, supports
// horizontal + vertical orientation, completed/active/pending/
// error per-step states, and an ARIA `role="progressbar"` on
// the root with `aria-valuemin / aria-valuemax / aria-valuenow`
// derived from the active-step index. Steps render as a
// nested list so adopters can also walk individual milestones
// via `[data-section="progress-tracker-step"]`.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ProgressTrackerStepState =
  | 'completed'
  | 'active'
  | 'pending'
  | 'error';

export type ProgressTrackerOrientation = 'horizontal' | 'vertical';
export type ProgressTrackerSize = 'sm' | 'md' | 'lg';

export interface ProgressTrackerStep {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  state?: ProgressTrackerStepState;
}

export interface ProgressTrackerProps {
  steps: ProgressTrackerStep[];
  activeIndex: number;
  orientation?: ProgressTrackerOrientation;
  showLabels?: boolean;
  showDescriptions?: boolean;
  size?: ProgressTrackerSize;
  className?: string;
  ariaLabel?: string;
  onStepClick?: (index: number) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_PROGRESS_TRACKER_ORIENTATION:
  ProgressTrackerOrientation = 'horizontal';
export const DEFAULT_PROGRESS_TRACKER_SIZE: ProgressTrackerSize = 'md';

export function clampProgressActiveIndex(
  index: number,
  total: number,
): number {
  if (total <= 0) return -1;
  if (!Number.isFinite(index)) return -1;
  if (index < -1) return -1;
  if (index > total - 1) return total - 1;
  return Math.floor(index);
}

export function getProgressTrackerStepState(
  index: number,
  activeIndex: number,
  override?: ProgressTrackerStepState,
): ProgressTrackerStepState {
  if (override) return override;
  if (index < activeIndex) return 'completed';
  if (index === activeIndex) return 'active';
  return 'pending';
}

// Percentage based on the active index. Active step is counted
// as half-complete -- this maps cleanly to a single progressbar
// readout that matches user intuition about "we are partway
// through step X".
export function getProgressTrackerPercent(
  activeIndex: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (activeIndex < 0) return 0;
  if (activeIndex >= total) return 100;
  const completed = Math.min(activeIndex, total - 1);
  const inProgress = 0.5;
  const value = ((completed + inProgress) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const SIZE_INDICATOR_PX: Record<ProgressTrackerSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
};

const SIZE_TEXT_CLASS: Record<ProgressTrackerSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const STATE_INDICATOR_CLASS: Record<ProgressTrackerStepState, string> =
  {
    completed: 'bg-primary text-primary-foreground border-primary',
    active:
      'bg-background text-primary border-primary ring-2 ring-primary/30',
    pending: 'bg-background text-muted-foreground border-border',
    error:
      'bg-destructive text-destructive-foreground border-destructive',
  };

const STATE_LABEL_CLASS: Record<ProgressTrackerStepState, string> = {
  completed: 'text-foreground',
  active: 'text-primary font-medium',
  pending: 'text-muted-foreground',
  error: 'text-destructive font-medium',
};

const STATE_CONNECTOR_CLASS: Record<ProgressTrackerStepState, string> = {
  completed: 'bg-primary',
  active: 'bg-primary/60',
  pending: 'bg-border',
  error: 'bg-destructive/60',
};

export const ProgressTracker = forwardRef(function ProgressTracker(
  {
    steps,
    activeIndex,
    orientation = DEFAULT_PROGRESS_TRACKER_ORIENTATION,
    showLabels = true,
    showDescriptions = true,
    size = DEFAULT_PROGRESS_TRACKER_SIZE,
    className,
    ariaLabel = 'Progress tracker',
    onStepClick,
  }: ProgressTrackerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const total = steps.length;
  const clampedActive = clampProgressActiveIndex(activeIndex, total);
  const percent = getProgressTrackerPercent(clampedActive, total);
  const indicatorPx = SIZE_INDICATOR_PX[size];
  const isVertical = orientation === 'vertical';
  const interactive = typeof onStepClick === 'function';

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.max(total, 1)}
      aria-valuenow={Math.max(0, clampedActive + 1)}
      aria-valuetext={`Step ${Math.max(0, clampedActive + 1)} of ${total}`}
      data-section="progress-tracker"
      data-orientation={orientation}
      data-size={size}
      data-active-index={clampedActive}
      data-total={total}
      data-percent={percent}
      className={cn(
        'w-full',
        isVertical
          ? 'flex flex-col gap-2'
          : 'flex flex-row items-start gap-2',
        className,
      )}
    >
      <ol
        data-section="progress-tracker-steps"
        className={cn(
          'flex w-full',
          isVertical
            ? 'flex-col gap-3'
            : 'flex-row items-start gap-0',
        )}
      >
        {steps.map((step, index) => {
          const state = getProgressTrackerStepState(
            index,
            clampedActive,
            step.state,
          );
          const isLast = index === total - 1;
          return (
            <li
              key={step.id}
              data-section="progress-tracker-step"
              data-step-id={step.id}
              data-step-index={index}
              data-state={state}
              className={cn(
                'relative flex',
                isVertical
                  ? 'flex-row items-start gap-3'
                  : 'flex-1 flex-col items-center gap-1',
              )}
            >
              <div
                className={cn(
                  'flex shrink-0',
                  isVertical
                    ? 'flex-col items-center gap-1'
                    : 'w-full flex-row items-center',
                )}
              >
                {/* indicator + (optional) leading connector */}
                {!isVertical && index > 0 ? (
                  <span
                    aria-hidden="true"
                    data-section="progress-tracker-connector"
                    data-state={
                      getProgressTrackerStepState(
                        index - 1,
                        clampedActive,
                        steps[index - 1]?.state,
                      )
                    }
                    className={cn(
                      'h-0.5 flex-1',
                      STATE_CONNECTOR_CLASS[
                        getProgressTrackerStepState(
                          index - 1,
                          clampedActive,
                          steps[index - 1]?.state,
                        )
                      ],
                    )}
                  />
                ) : null}
                {interactive ? (
                  <button
                    type="button"
                    data-section="progress-tracker-indicator"
                    aria-current={
                      state === 'active' ? 'step' : undefined
                    }
                    aria-label={
                      typeof step.label === 'string'
                        ? `${step.label} (${state})`
                        : `Step ${index + 1} (${state})`
                    }
                    onClick={() => onStepClick?.(index)}
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      STATE_INDICATOR_CLASS[state],
                    )}
                    style={{
                      width: indicatorPx,
                      height: indicatorPx,
                      fontSize: indicatorPx * 0.45,
                    }}
                  >
                    {state === 'completed' ? (
                      <Check aria-hidden="true" className="h-3 w-3" />
                    ) : state === 'error' ? (
                      <X aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      index + 1
                    )}
                  </button>
                ) : (
                  <span
                    data-section="progress-tracker-indicator"
                    aria-current={
                      state === 'active' ? 'step' : undefined
                    }
                    className={cn(
                      'inline-flex shrink-0 items-center justify-center rounded-full border font-medium',
                      STATE_INDICATOR_CLASS[state],
                    )}
                    style={{
                      width: indicatorPx,
                      height: indicatorPx,
                      fontSize: indicatorPx * 0.45,
                    }}
                  >
                    {state === 'completed' ? (
                      <Check aria-hidden="true" className="h-3 w-3" />
                    ) : state === 'error' ? (
                      <X aria-hidden="true" className="h-3 w-3" />
                    ) : (
                      index + 1
                    )}
                  </span>
                )}
                {/* trailing connector (horizontal) -- between this indicator and next step */}
                {!isVertical && !isLast ? (
                  <span
                    aria-hidden="true"
                    data-section="progress-tracker-connector"
                    data-state={state}
                    className={cn(
                      'h-0.5 flex-1',
                      STATE_CONNECTOR_CLASS[state],
                    )}
                  />
                ) : null}
                {/* vertical connector (between indicators) */}
                {isVertical && !isLast ? (
                  <span
                    aria-hidden="true"
                    data-section="progress-tracker-connector"
                    data-state={state}
                    className={cn(
                      'w-0.5 flex-1 self-center',
                      STATE_CONNECTOR_CLASS[state],
                    )}
                    style={{ minHeight: 24 }}
                  />
                ) : null}
              </div>
              {(showLabels || showDescriptions) && (
                <div
                  data-section="progress-tracker-content"
                  className={cn(
                    isVertical
                      ? 'flex flex-1 flex-col gap-0.5'
                      : 'flex flex-col items-center gap-0.5 text-center',
                  )}
                >
                  {showLabels ? (
                    <span
                      data-section="progress-tracker-label"
                      className={cn(
                        STATE_LABEL_CLASS[state],
                        SIZE_TEXT_CLASS[size],
                      )}
                    >
                      {step.label}
                    </span>
                  ) : null}
                  {showDescriptions && step.description !== undefined ? (
                    <span
                      data-section="progress-tracker-description"
                      className={cn(
                        'text-muted-foreground',
                        size === 'lg' ? 'text-sm' : 'text-xs',
                      )}
                    >
                      {step.description}
                    </span>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
});

ProgressTracker.displayName = 'ProgressTracker';
