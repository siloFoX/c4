import { forwardRef, useMemo } from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { clampGaugeValue, valueToFraction } from './gauge';

// (v1.11.430, TODO 11.412) Meter primitive.
//
// Linear bar with multi-segment colour stops. The track paints
// each segment in its declared colour so operators see the
// healthy / warning / danger bands at a glance. An indicator
// fills the bar up to the current value; an optional caret
// renders at the value position. `role="progressbar"` +
// aria-valuemin / aria-valuenow / aria-valuemax /
// aria-valuetext.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface MeterSegment {
  from: number;
  to: number;
  color?: string;
  label?: string;
}

export type MeterSize = 'sm' | 'md' | 'lg';
export type MeterOrientation = 'horizontal' | 'vertical';

export interface MeterProps {
  value: number;
  min?: number;
  max?: number;
  segments?: MeterSegment[];
  size?: MeterSize;
  orientation?: MeterOrientation;
  showValue?: boolean;
  formatValue?: (value: number) => ReactNode;
  ariaLabel?: string;
  className?: string;
  trackColor?: string;
  fillColor?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function findMeterSegment(
  value: number,
  segments: MeterSegment[] | undefined,
): MeterSegment | null {
  if (!segments || segments.length === 0) return null;
  for (const s of segments) {
    if (value >= s.from && value <= s.to) return s;
  }
  return null;
}

export function buildMeterStops(
  segments: MeterSegment[] | undefined,
  min: number,
  max: number,
  fallback: string,
): string {
  // Returns a CSS linear-gradient stops list (without the
  // `linear-gradient(...)` wrapper) so callers can compose into
  // any direction.
  if (!segments || segments.length === 0) return fallback;
  if (max <= min) return fallback;
  const stops: string[] = [];
  for (const s of segments) {
    const startPct = (valueToFraction(s.from, min, max) * 100).toFixed(2);
    const endPct = (valueToFraction(s.to, min, max) * 100).toFixed(2);
    const color = s.color ?? fallback;
    stops.push(`${color} ${startPct}%`);
    stops.push(`${color} ${endPct}%`);
  }
  return stops.join(', ');
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const SIZE_HEIGHT: Record<MeterSize, string> = {
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

const SIZE_HEIGHT_VERTICAL: Record<MeterSize, string> = {
  sm: 'w-1.5',
  md: 'w-2',
  lg: 'w-3',
};

export const Meter = forwardRef(function Meter(
  {
    value,
    min = 0,
    max = 100,
    segments,
    size = 'md',
    orientation = 'horizontal',
    showValue = false,
    formatValue,
    ariaLabel = 'Meter',
    className,
    trackColor = 'rgba(127, 127, 127, 0.2)',
    fillColor,
  }: MeterProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
  const clampedValue = clampGaugeValue(value, safeMin, safeMax);
  const fraction = valueToFraction(clampedValue, safeMin, safeMax);

  const activeSegment = findMeterSegment(clampedValue, segments);
  const resolvedFillColor =
    activeSegment?.color ??
    fillColor ??
    'hsl(var(--primary, 217 91% 60%))';

  // Background uses a linear-gradient striped by segment when
  // segments are supplied; otherwise a flat track colour.
  const stopList = useMemo(
    () => buildMeterStops(segments, safeMin, safeMax, trackColor),
    [segments, safeMin, safeMax, trackColor],
  );

  const gradientDir =
    orientation === 'vertical' ? 'to top' : 'to right';
  const trackBackground = segments
    ? `linear-gradient(${gradientDir}, ${stopList})`
    : trackColor;

  const indicatorStyle =
    orientation === 'vertical'
      ? {
          width: '100%',
          height: `${fraction * 100}%`,
          background: resolvedFillColor,
          position: 'absolute' as const,
          bottom: 0,
          left: 0,
          opacity: 0.85,
        }
      : {
          height: '100%',
          width: `${fraction * 100}%`,
          background: resolvedFillColor,
          position: 'absolute' as const,
          top: 0,
          left: 0,
          opacity: 0.85,
        };

  const displayValue = formatValue
    ? formatValue(clampedValue)
    : String(Math.round(clampedValue));

  const trackSizeClass =
    orientation === 'vertical'
      ? `${SIZE_HEIGHT_VERTICAL[size]} h-full`
      : `${SIZE_HEIGHT[size]} w-full`;

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
      aria-orientation={orientation}
      data-section="meter"
      data-orientation={orientation}
      data-size={size}
      data-value={Math.round(clampedValue)}
      data-fraction={Number(fraction.toFixed(3))}
      data-segment={activeSegment?.label ?? activeSegment?.color ?? ''}
      className={cn(
        'inline-flex items-center gap-2',
        orientation === 'vertical' ? 'h-24 flex-col' : '',
        className,
      )}
    >
      <div
        data-section="meter-track"
        className={cn(
          'relative overflow-hidden rounded',
          trackSizeClass,
        )}
        style={{ background: trackBackground }}
      >
        <div
          data-section="meter-indicator"
          data-fill-color={resolvedFillColor}
          style={indicatorStyle}
        />
      </div>
      {showValue ? (
        <span
          aria-hidden="true"
          data-section="meter-value"
          className="shrink-0 text-xs tabular-nums text-foreground"
        >
          {displayValue}
        </span>
      ) : null}
    </div>
  );
});

Meter.displayName = 'Meter';
