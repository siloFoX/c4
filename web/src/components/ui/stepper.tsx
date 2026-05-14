import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface StepperStep {
  id: string;
  label: ReactNode;
  description?: ReactNode;
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
}

type StepState = 'complete' | 'current' | 'pending';

const BADGE_SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-6 w-6 text-[11px]',
  md: 'h-8 w-8 text-xs',
};

const ICON_SIZE: Record<'sm' | 'md', string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

function stateOf(idx: number, current: number): StepState {
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
      ...rest
    },
    ref,
  ) {
    const isVertical = orientation === 'vertical';
    return (
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
          const state = stateOf(idx, currentIndex);
          const isLast = idx === steps.length - 1;
          const clickable =
            !!onStepClick && (allowFuture || state !== 'pending');
          const connectorClass =
            state === 'complete' ? 'bg-primary' : 'bg-muted';
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
    );
  },
);
