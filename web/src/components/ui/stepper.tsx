import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface StepperStep {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  // (v1.11.270, TODO 11.252) Per-step error flag. When true the
  // step renders with destructive tone (red bubble + X glyph)
  // regardless of its position relative to currentIndex. An error
  // on the current step is the common case (dispatch / validate
  // failed); errors on earlier steps are also supported so a
  // wizard can flag a retroactive failure ("step 2 was invalid,
  // user fixed it on step 3, then it failed again").
  error?: boolean;
}

export interface StepperProps
  extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  steps: StepperStep[];
  currentIndex: number;
  orientation?: 'horizontal' | 'vertical';
  onStepClick?: (index: number) => void;
  allowFuture?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  // (v1.11.394, TODO 11.376) Override the visually-hidden
  // aria-valuetext / aria-label string surfaced on the
  // companion role="progressbar" element. Defaults to
  // "Step <current+1> of <total>", or "Wizard complete"
  // when currentIndex >= steps.length. Pass `null` to
  // explicitly suppress the visually-hidden progressbar
  // (very rare -- assistive tech still needs SOME progress
  // hook).
  progressLabel?: string | null;
  // (v1.11.394, TODO 11.376) When true, render a VISIBLE
  // "Step X of N" caption above the list in addition to
  // the visually-hidden progressbar element. Default
  // false keeps the legacy markup byte-identical.
  showVisibleProgress?: boolean;
}

// (v1.11.270, TODO 11.252) 'error' joins the canonical state set.
// The terminology aligns with the dispatch's "complete / current /
// upcoming / error" surface; `pending` is the internal name for
// the upcoming state (the JS rename would ripple to consumers and
// break the existing data-state attribute contract).
type StepState = 'complete' | 'current' | 'pending' | 'error';

const BADGE_SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-8 w-8 text-xs',
};

const ICON_SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

function stateOf(idx: number, current: number, hasError: boolean): StepState {
  // `error` wins regardless of position so a current-step error
  // and a retroactive earlier-step error both surface in red.
  if (hasError) return 'error';
  if (idx < current) return 'complete';
  if (idx === current) return 'current';
  return 'pending';
}

export const Stepper = forwardRef<HTMLOListElement, StepperProps>(
  function Stepper(
    {
      steps,
      currentIndex,
      orientation = 'horizontal',
      onStepClick,
      allowFuture = false,
      size = 'md',
      className,
      progressLabel,
      showVisibleProgress = false,
      ...rest
    },
    ref,
  ) {
    const isVertical = orientation === 'vertical';

    // (v1.11.394, TODO 11.376) Companion progressbar.
    // `aria-valuenow` counts the rows already complete
    // PLUS the in-flight current step proportionally
    // (current step is treated as 0% complete -- when it
    // flips to complete via currentIndex++, the count
    // advances by 1). The aria-valuetext caption is the
    // dispatch-aligned "Step <current+1> of <total>"
    // string, or "Wizard complete" once the operator
    // moves past the last step (currentIndex >=
    // steps.length).
    const total = steps.length;
    const completed = steps.filter((step, idx) => {
      const s = stateOf(idx, currentIndex, !!step.error);
      return s === 'complete';
    }).length;
    const isComplete = total > 0 && currentIndex >= total;
    const defaultProgressText = isComplete
      ? 'Wizard complete'
      : total > 0
        ? `Step ${Math.min(currentIndex + 1, total)} of ${total}`
        : '';
    const resolvedProgressLabel =
      progressLabel === undefined ? defaultProgressText : progressLabel;
    const ariaValueNow = isComplete ? total : completed;

    return (
      <div
        data-section="stepper-root"
        data-orientation={orientation}
      >
        {showVisibleProgress && total > 0 ? (
          <p
            data-section="stepper-visible-progress"
            className="mb-2 text-xs text-muted-foreground"
          >
            {resolvedProgressLabel}
          </p>
        ) : null}
        {resolvedProgressLabel !== null && total > 0 ? (
          <span
            role="progressbar"
            data-section="stepper-progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={ariaValueNow}
            aria-valuetext={resolvedProgressLabel}
            aria-label={resolvedProgressLabel}
            className="sr-only"
          />
        ) : null}
      <ol
        ref={ref}
        role="list"
        data-stepper=""
        data-orientation={orientation}
        className={cn(
          'flex',
          isVertical ? 'flex-col gap-3' : 'flex-row items-start gap-2',
          className,
        )}
        {...rest}
      >
        {steps.map((step, idx) => {
          const state = stateOf(idx, currentIndex, !!step.error);
          const isLast = idx === steps.length - 1;
          const clickable =
            !!onStepClick && (allowFuture || state !== 'pending');
          const connectorClass =
            state === 'complete'
              ? 'bg-primary'
              : state === 'error'
                ? 'bg-destructive'
                : 'bg-muted';
          return (
            <li
              key={step.id}
              role="listitem"
              data-stepper-item=""
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'flex min-w-0',
                isVertical ? 'flex-row gap-3' : 'flex-1 flex-row items-center gap-2',
              )}
            >
              <div
                className={cn(
                  'flex shrink-0',
                  isVertical ? 'flex-col items-center' : 'flex-row items-center',
                )}
              >
                <button
                  type="button"
                  data-stepper-badge=""
                  disabled={!clickable}
                  onClick={clickable ? () => onStepClick!(idx) : undefined}
                  aria-label={
                    typeof step.label === 'string'
                      ? `Step ${idx + 1}: ${step.label}`
                      : `Step ${idx + 1}`
                  }
                  className={cn(
                    'flex items-center justify-center rounded-full font-medium transition-colors',
                    BADGE_SIZE[size],
                    state === 'complete' &&
                      'bg-primary text-primary-foreground',
                    state === 'current' &&
                      'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background',
                    state === 'pending' && 'bg-muted text-muted-foreground',
                    state === 'error' &&
                      'bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2 ring-offset-background',
                    clickable
                      ? 'cursor-pointer hover:opacity-90'
                      : 'cursor-default',
                    !clickable && 'disabled:opacity-100',
                  )}
                >
                  {state === 'complete' ? (
                    <Check
                      data-testid={`stepper-check-${step.id}`}
                      className={ICON_SIZE[size]}
                      aria-hidden="true"
                    />
                  ) : state === 'error' ? (
                    <X
                      data-testid={`stepper-error-${step.id}`}
                      className={ICON_SIZE[size]}
                      aria-hidden="true"
                    />
                  ) : (
                    <span aria-hidden="true">{idx + 1}</span>
                  )}
                </button>
                {!isLast && isVertical ? (
                  <span
                    aria-hidden="true"
                    data-stepper-connector=""
                    data-complete={state === 'complete' ? 'true' : 'false'}
                    className={cn('mt-1 w-px flex-1 min-h-4', connectorClass)}
                  />
                ) : null}
              </div>
              <div className={cn('min-w-0', isVertical ? 'flex-1 pb-3' : '')}>
                <div
                  data-stepper-label=""
                  className={cn(
                    size === 'sm' ? 'text-xs' : 'text-sm',
                    state === 'current' && 'font-semibold text-foreground',
                    state === 'complete' && 'text-foreground',
                    state === 'pending' && 'text-muted-foreground',
                    state === 'error' && 'font-semibold text-destructive',
                  )}
                >
                  {step.label}
                </div>
                {isVertical && step.description ? (
                  <div
                    data-stepper-description=""
                    className="mt-0.5 text-xs text-muted-foreground"
                  >
                    {step.description}
                  </div>
                ) : null}
              </div>
              {!isLast && !isVertical ? (
                <span
                  aria-hidden="true"
                  data-stepper-connector=""
                  data-complete={state === 'complete' ? 'true' : 'false'}
                  className={cn('h-px flex-1 min-w-4', connectorClass)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      </div>
    );
  },
);
