import { forwardRef, useMemo } from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.430, TODO 11.412) Gauge primitive.
//
// Radial gauge -- SVG-based progress arc with min/max range and
// optional threshold zones (each [from, to] segment paints a
// coloured arc band so operators see at a glance whether the
// current value sits in a healthy / warning / danger band).
// `role="progressbar"` + aria-valuemin / aria-valuenow /
// aria-valuemax / aria-valuetext.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface GaugeThreshold {
  from: number;
  to: number;
  color?: string;
  label?: string;
}

export interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  thresholds?: GaugeThreshold[];
  size?: number;
  thickness?: number;
  showValue?: boolean;
  formatValue?: (value: number) => ReactNode;
  ariaLabel?: string;
  className?: string;
  trackColor?: string;
  progressColor?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function clampGaugeValue(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return min;
  if (Number.isNaN(value)) return min;
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function valueToFraction(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return 0;
  const v = clampGaugeValue(value, min, max);
  return (v - min) / (max - min);
}

export function findThresholdColor(
  value: number,
  thresholds: GaugeThreshold[] | undefined,
  fallback?: string,
): string | undefined {
  if (!thresholds || thresholds.length === 0) return fallback;
  for (const t of thresholds) {
    if (value >= t.from && value <= t.to) {
      return t.color ?? fallback;
    }
  }
  return fallback;
}

// Build the SVG arc path. Gauge sweep is 270 degrees (start at
// 7 o'clock, end at 5 o'clock) so the needle has a recognizable
// "U" shape with a 90-degree gap at the bottom. Math uses degrees
// converted to radians; centre is (size/2, size/2); radius =
// (size - thickness) / 2.
export const GAUGE_START_ANGLE_DEG = 135; // top-left
export const GAUGE_END_ANGLE_DEG = 405; // top-right (= 45 + 360)
export const GAUGE_SWEEP_DEG =
  GAUGE_END_ANGLE_DEG - GAUGE_START_ANGLE_DEG;

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  if (endAngleDeg <= startAngleDeg) return '';
  const start = polarToCartesian(cx, cy, r, startAngleDeg);
  const end = polarToCartesian(cx, cy, r, endAngleDeg);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return [
    'M',
    start.x.toFixed(3),
    start.y.toFixed(3),
    'A',
    r.toFixed(3),
    r.toFixed(3),
    0,
    largeArc,
    1,
    end.x.toFixed(3),
    end.y.toFixed(3),
  ].join(' ');
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const DEFAULT_SIZE = 120;
const DEFAULT_THICKNESS = 10;

export const Gauge = forwardRef(function Gauge(
  {
    value,
    min = 0,
    max = 100,
    thresholds,
    size = DEFAULT_SIZE,
    thickness = DEFAULT_THICKNESS,
    showValue = true,
    formatValue,
    ariaLabel = 'Gauge',
    className,
    trackColor = 'rgba(127, 127, 127, 0.2)',
    progressColor,
  }: GaugeProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
  const clampedValue = clampGaugeValue(value, safeMin, safeMax);
  const fraction = valueToFraction(clampedValue, safeMin, safeMax);
  const angle =
    GAUGE_START_ANGLE_DEG + fraction * GAUGE_SWEEP_DEG;

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - thickness) / 2;

  const trackPath = useMemo(
    () =>
      describeArc(
        cx,
        cy,
        radius,
        GAUGE_START_ANGLE_DEG,
        GAUGE_END_ANGLE_DEG,
      ),
    [cx, cy, radius],
  );

  const progressPath = useMemo(
    () => describeArc(cx, cy, radius, GAUGE_START_ANGLE_DEG, angle),
    [cx, cy, radius, angle],
  );

  const thresholdPaths = useMemo(() => {
    if (!thresholds) return [];
    return thresholds.map((t) => {
      const startFrac = valueToFraction(t.from, safeMin, safeMax);
      const endFrac = valueToFraction(t.to, safeMin, safeMax);
      const startAngle =
        GAUGE_START_ANGLE_DEG + startFrac * GAUGE_SWEEP_DEG;
      const endAngle =
        GAUGE_START_ANGLE_DEG + endFrac * GAUGE_SWEEP_DEG;
      const path = describeArc(cx, cy, radius, startAngle, endAngle);
      return { ...t, path };
    });
  }, [thresholds, cx, cy, radius, safeMin, safeMax]);

  const matchedColor = findThresholdColor(
    clampedValue,
    thresholds,
    progressColor,
  );
  const resolvedProgressColor =
    matchedColor ?? progressColor ?? 'hsl(var(--primary, 217 91% 60%))';

  const displayValue = formatValue
    ? formatValue(clampedValue)
    : String(Math.round(clampedValue));

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={safeMin}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(clampedValue)}
      aria-valuetext={
        typeof displayValue === 'string'
          ? displayValue
          : String(Math.round(clampedValue))
      }
      data-section="gauge"
      data-value={Math.round(clampedValue)}
      data-fraction={Number(fraction.toFixed(3))}
      className={cn(
        'relative inline-flex items-center justify-center',
        className,
      )}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
        data-section="gauge-svg"
      >
        <path
          d={trackPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          data-section="gauge-track"
        />
        {thresholdPaths.map((t, idx) => (
          <path
            key={`th-${idx}`}
            d={t.path}
            fill="none"
            stroke={t.color ?? 'currentColor'}
            strokeOpacity={0.35}
            strokeWidth={thickness}
            data-section="gauge-threshold"
            data-threshold-from={t.from}
            data-threshold-to={t.to}
          />
        ))}
        <path
          d={progressPath}
          fill="none"
          stroke={resolvedProgressColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          data-section="gauge-progress"
          data-progress-color={resolvedProgressColor}
        />
      </svg>
      {showValue ? (
        <span
          aria-hidden="true"
          data-section="gauge-value"
          className="absolute text-lg font-semibold tabular-nums text-foreground"
        >
          {displayValue}
        </span>
      ) : null}
    </div>
  );
});

Gauge.displayName = 'Gauge';
