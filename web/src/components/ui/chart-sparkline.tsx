import { forwardRef, useMemo } from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.461, TODO 11.443) ChartSparkline primitive.
//
// Minimal inline trend line for table cells / stat cards.
// Pure SVG, no axes, no tooltip layer. Optional area fill +
// last-point dot + high/low markers. The accessible name is
// configurable; the default is "Trend".
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartSparklineProps {
  data: readonly number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  fillOpacity?: number;
  strokeWidth?: number;
  showLastDot?: boolean;
  showHighLow?: boolean;
  smooth?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  baseline?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_SPARKLINE_WIDTH = 80;
export const DEFAULT_SPARKLINE_HEIGHT = 24;
export const DEFAULT_SPARKLINE_STROKE_WIDTH = 1.5;
export const DEFAULT_SPARKLINE_FILL_OPACITY = 0.2;
export const DEFAULT_SPARKLINE_COLOR = '#3b82f6';

export interface SparklineBounds {
  min: number;
  max: number;
}

export function getSparklineBounds(
  data: readonly number[],
): SparklineBounds {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of data) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    // Avoid divide-by-zero downstream + give the line a
    // visible centerline.
    return { min: min - 0.5, max: max + 0.5 };
  }
  return { min, max };
}

export interface SparklinePoint {
  x: number;
  y: number;
}

export function getSparklinePoints(
  data: readonly number[],
  width: number,
  height: number,
  bounds?: SparklineBounds,
): SparklinePoint[] {
  if (data.length === 0) return [];
  const { min, max } = bounds ?? getSparklineBounds(data);
  const range = max - min === 0 ? 1 : max - min;
  if (data.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }
  const step = width / (data.length - 1);
  return data.map((value, idx) => {
    const v = Number.isFinite(value) ? value : min;
    const y = height - ((v - min) / range) * height;
    return { x: step * idx, y };
  });
}

function straight(points: readonly SparklinePoint[]): string {
  if (points.length === 0) return '';
  const head = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  const tail = points
    .slice(1)
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  return tail ? `${head} ${tail}` : head;
}

function smoothPath(points: readonly SparklinePoint[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) return straight(points);
  const head = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  const segs: string[] = [head];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    segs.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }
  return segs.join(' ');
}

export function buildSparklinePath(
  points: readonly SparklinePoint[],
  smooth: boolean = false,
): string {
  return smooth ? smoothPath(points) : straight(points);
}

export function buildSparklineAreaPath(
  points: readonly SparklinePoint[],
  baselineY: number,
  smooth: boolean = false,
): string {
  if (points.length === 0) return '';
  const top = buildSparklinePath(points, smooth);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${top} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

export function findSparklineExtremes(
  data: readonly number[],
): { highIndex: number; lowIndex: number } {
  if (data.length === 0) return { highIndex: -1, lowIndex: -1 };
  let highIndex = -1;
  let lowIndex = -1;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i]!;
    if (!Number.isFinite(v)) continue;
    if (highIndex < 0 || v > high) {
      high = v;
      highIndex = i;
    }
    if (lowIndex < 0 || v < low) {
      low = v;
      lowIndex = i;
    }
  }
  return { highIndex, lowIndex };
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartSparkline = forwardRef(function ChartSparkline(
  {
    data,
    width = DEFAULT_SPARKLINE_WIDTH,
    height = DEFAULT_SPARKLINE_HEIGHT,
    color = DEFAULT_SPARKLINE_COLOR,
    fill = false,
    fillOpacity = DEFAULT_SPARKLINE_FILL_OPACITY,
    strokeWidth = DEFAULT_SPARKLINE_STROKE_WIDTH,
    showLastDot = false,
    showHighLow = false,
    smooth = false,
    className,
    ariaLabel = 'Trend',
    ariaDescription,
    formatValue,
    baseline,
  }: ChartSparklineProps,
  ref: ForwardedRef<HTMLSpanElement>,
) {
  const bounds = useMemo(
    () => getSparklineBounds(data),
    [data],
  );

  const points = useMemo(
    () => getSparklinePoints(data, width, height, bounds),
    [bounds, data, height, width],
  );

  const path = useMemo(
    () => buildSparklinePath(points, smooth),
    [points, smooth],
  );

  const baselineY = useMemo(() => {
    if (baseline === undefined) return height;
    const range = bounds.max - bounds.min === 0 ? 1 : bounds.max - bounds.min;
    return height - ((baseline - bounds.min) / range) * height;
  }, [baseline, bounds.max, bounds.min, height]);

  const areaPath = useMemo(
    () => (fill ? buildSparklineAreaPath(points, baselineY, smooth) : ''),
    [baselineY, fill, points, smooth],
  );

  const last = points[points.length - 1] ?? null;
  const { highIndex, lowIndex } = useMemo(
    () => findSparklineExtremes(data),
    [data],
  );
  const highPoint =
    highIndex >= 0 ? points[highIndex] ?? null : null;
  const lowPoint = lowIndex >= 0 ? points[lowIndex] ?? null : null;

  const description = useMemo(() => {
    if (ariaDescription !== undefined) return ariaDescription;
    if (data.length === 0) return 'No data';
    const fmt = (v: number) =>
      formatValue ? formatValue(v) : `${v}`;
    const first = data[0]!;
    const lastValue = data[data.length - 1]!;
    return `Trend from ${fmt(first)} to ${fmt(lastValue)}, min ${fmt(bounds.min)}, max ${fmt(bounds.max)}.`;
  }, [
    ariaDescription,
    bounds.max,
    bounds.min,
    data,
    formatValue,
  ]);

  return (
    <span
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      data-section="chart-sparkline"
      data-point-count={data.length}
      data-fill={fill ? 'true' : 'false'}
      data-smooth={smooth ? 'true' : 'false'}
      className={cn('inline-block align-middle', className)}
      style={{ width, height }}
    >
      <span
        data-section="chart-sparkline-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      {data.length === 0 ? (
        <svg
          data-section="chart-sparkline-svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          aria-hidden="true"
        />
      ) : (
        <svg
          data-section="chart-sparkline-svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          aria-hidden="true"
        >
          {fill && areaPath ? (
            <path
              data-section="chart-sparkline-area"
              d={areaPath}
              fill={color}
              fillOpacity={fillOpacity}
              stroke="none"
            />
          ) : null}
          {path ? (
            <path
              data-section="chart-sparkline-line"
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {showHighLow && highPoint ? (
            <circle
              data-section="chart-sparkline-high"
              data-index={highIndex}
              cx={highPoint.x}
              cy={highPoint.y}
              r={2}
              fill={color}
            />
          ) : null}
          {showHighLow && lowPoint && lowIndex !== highIndex ? (
            <circle
              data-section="chart-sparkline-low"
              data-index={lowIndex}
              cx={lowPoint.x}
              cy={lowPoint.y}
              r={2}
              fill={color}
              fillOpacity={0.7}
            />
          ) : null}
          {showLastDot && last ? (
            <circle
              data-section="chart-sparkline-last"
              data-index={data.length - 1}
              cx={last.x}
              cy={last.y}
              r={2.25}
              fill={color}
            />
          ) : null}
        </svg>
      )}
    </span>
  );
});

ChartSparkline.displayName = 'ChartSparkline';
