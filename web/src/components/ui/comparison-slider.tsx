import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.435, TODO 11.417) ComparisonSlider primitive.
//
// Before/after image slider. Two `<img>` layers (before on the
// left, after on the right) clipped through the handle position.
// Pointer drag + keyboard arrow navigation set the divider
// position 0..100. `role="slider"` + aria-valuemin / aria-valuemax
// / aria-valuenow on the handle so screen readers announce the
// reveal percentage. Optional percentage badge + before/after
// corner labels. Images carry `loading="lazy"` by default so
// off-screen sliders defer their network cost.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ComparisonSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  className?: string;
  ariaLabel?: string;
  beforeLabel?: ReactNode;
  afterLabel?: ReactNode;
  showPercentage?: boolean;
  lazy?: boolean;
  step?: number;
  aspectRatio?: string;
  // Optional custom number formatter for the percentage badge.
  formatValue?: (value: number) => ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_COMPARISON_VALUE = 50;
export const DEFAULT_COMPARISON_STEP = 5;
export const DEFAULT_COMPARISON_ASPECT_RATIO = '16 / 9';

export function clampComparisonValue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_COMPARISON_VALUE;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function getPercentFromX(
  clientX: number,
  rect: { left: number; width: number },
): number {
  if (rect.width <= 0) return 0;
  const x = clientX - rect.left;
  return clampComparisonValue((x / rect.width) * 100);
}

export function stepComparisonValue(
  current: number,
  delta: number,
): number {
  return clampComparisonValue(current + delta);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ComparisonSlider = forwardRef(function ComparisonSlider(
  {
    beforeSrc,
    afterSrc,
    beforeAlt = 'Before',
    afterAlt = 'After',
    value,
    defaultValue = DEFAULT_COMPARISON_VALUE,
    onChange,
    className,
    ariaLabel = 'Comparison slider',
    beforeLabel,
    afterLabel,
    showPercentage = true,
    lazy = true,
    step = DEFAULT_COMPARISON_STEP,
    aspectRatio = DEFAULT_COMPARISON_ASPECT_RATIO,
    formatValue,
  }: ComparisonSliderProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<number>(() =>
    clampComparisonValue(defaultValue),
  );
  const effective = clampComparisonValue(
    isControlled ? (value ?? 0) : internalValue,
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emit = useCallback(
    (next: number) => {
      const clamped = clampComparisonValue(next);
      if (!isControlled) setInternalValue(clamped);
      onChangeRef.current?.(clamped);
    },
    [isControlled],
  );

  // --- Pointer drag ------------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<boolean>(false);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const updateFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = getPercentFromX(event.clientX, rect);
      emit(pct);
    },
    [emit],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // jsdom safety
      }
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // jsdom safety
      }
    },
    [],
  );

  // --- Keyboard ---------------------------------------------
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          event.preventDefault();
          emit(stepComparisonValue(effective, step));
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          event.preventDefault();
          emit(stepComparisonValue(effective, -step));
          break;
        case 'PageUp':
          event.preventDefault();
          emit(stepComparisonValue(effective, step * 2));
          break;
        case 'PageDown':
          event.preventDefault();
          emit(stepComparisonValue(effective, -step * 2));
          break;
        case 'Home':
          event.preventDefault();
          emit(0);
          break;
        case 'End':
          event.preventDefault();
          emit(100);
          break;
        default:
          break;
      }
    },
    [emit, effective, step],
  );

  const formattedPercentage = formatValue
    ? formatValue(effective)
    : `${Math.round(effective)}%`;

  const loadingAttr: 'lazy' | 'eager' = lazy ? 'lazy' : 'eager';

  return (
    <div
      ref={setRefs}
      role="region"
      aria-label={ariaLabel}
      data-section="comparison-slider"
      data-value={Math.round(effective)}
      data-show-percentage={showPercentage ? 'true' : 'false'}
      data-lazy={lazy ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn(
        'relative w-full select-none overflow-hidden rounded-md',
        className,
      )}
      style={{ aspectRatio }}
    >
      <img
        src={beforeSrc}
        alt={beforeAlt}
        loading={loadingAttr}
        decoding="async"
        draggable={false}
        data-section="comparison-slider-before"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        data-section="comparison-slider-after-clip"
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${effective}%` }}
      >
        <img
          src={afterSrc}
          alt={afterAlt}
          loading={loadingAttr}
          decoding="async"
          draggable={false}
          data-section="comparison-slider-after"
          className="absolute inset-0 h-full object-cover"
          style={{
            // Compensate the parent clip so the after-image
            // stays full-width and only the visible band is
            // revealed.
            width: containerRef.current
              ? `${containerRef.current.getBoundingClientRect().width}px`
              : '100%',
          }}
        />
      </div>
      {beforeLabel !== undefined ? (
        <div
          data-section="comparison-slider-before-label"
          className="absolute bottom-2 left-2 rounded bg-background/70 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm"
        >
          {beforeLabel}
        </div>
      ) : null}
      {afterLabel !== undefined ? (
        <div
          data-section="comparison-slider-after-label"
          className="absolute bottom-2 right-2 rounded bg-background/70 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm"
        >
          {afterLabel}
        </div>
      ) : null}
      <div
        role="slider"
        aria-label={`${ariaLabel} handle`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(effective)}
        aria-valuetext={`${Math.round(effective)}%`}
        aria-orientation="horizontal"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-section="comparison-slider-handle"
        data-handle-position={Math.round(effective)}
        className="absolute inset-y-0 flex items-center justify-center"
        style={{
          left: `${effective}%`,
          width: '2px',
          background: 'rgba(255, 255, 255, 0.85)',
          transform: 'translateX(-50%)',
          boxShadow: '0 0 8px rgba(0, 0, 0, 0.35)',
        }}
      >
        <span
          aria-hidden="true"
          data-section="comparison-slider-handle-grip"
          className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-background text-foreground shadow"
        >
          <span data-section="comparison-slider-handle-arrow">
            {'<>'}
          </span>
        </span>
      </div>
      {showPercentage ? (
        <div
          aria-hidden="true"
          data-section="comparison-slider-percentage"
          data-percentage={Math.round(effective)}
          className="absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium text-foreground shadow"
        >
          {formattedPercentage}
        </div>
      ) : null}
    </div>
  );
});

ComparisonSlider.displayName = 'ComparisonSlider';
