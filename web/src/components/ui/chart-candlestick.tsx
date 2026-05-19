import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.469, TODO 11.451) ChartCandlestick primitive.
//
// Pure-SVG OHLC candlestick chart. Each candle paints a
// solid body from open->close and a thin wick from low to
// high. Bullish candles (close > open) take the up colour,
// bearish candles (close < open) take the down colour,
// dojis (close == open) collapse to a hairline at the same
// y. Hovering a candle opens a tooltip with all four OHLC
// values + the formatted date. Per-candle click handler.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartCandlestickDirection = 'up' | 'down' | 'doji';

export interface ChartCandlestickPoint {
  date: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartCandlestickProps {
  data: readonly ChartCandlestickPoint[];
  width?: number;
  height?: number;
  padding?: number;
  upColor?: string;
  downColor?: string;
  dojiColor?: string;
  wickColor?: string;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatDate?: (d: string | number) => string;
  tickCount?: number;
  candleWidth?: number;
  candleGap?: number;
  onCandleClick?: (args: {
    point: ChartCandlestickPoint;
    index: number;
    direction: ChartCandlestickDirection;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_CANDLESTICK_WIDTH = 640;
export const DEFAULT_CHART_CANDLESTICK_HEIGHT = 320;
export const DEFAULT_CHART_CANDLESTICK_PADDING = 36;
export const DEFAULT_CHART_CANDLESTICK_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_CANDLESTICK_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_CANDLESTICK_DOJI_COLOR = '#475569';
export const DEFAULT_CHART_CANDLESTICK_TICK_COUNT = 5;
export const DEFAULT_CHART_CANDLESTICK_CANDLE_GAP = 2;
export const DEFAULT_CHART_CANDLESTICK_MIN_BODY_HEIGHT = 1;

// Compute the chart vertical bounds across every candle's
// low + high. Falls back to (0, 1) when no finite candle
// is present so the chart still renders.
export function getCandlestickBounds(
  data: readonly ChartCandlestickPoint[],
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of data) {
    if (Number.isFinite(p.low) && p.low < min) min = p.low;
    if (Number.isFinite(p.high) && p.high > max) max = p.high;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) return { min: min - 0.5, max: max + 0.5 };
  return { min, max };
}

// Decide the direction of a candle: 'up' for close > open,
// 'down' for close < open, 'doji' for close == open or
// non-finite inputs.
export function getCandlestickDirection(
  open: number,
  close: number,
): ChartCandlestickDirection {
  if (!Number.isFinite(open) || !Number.isFinite(close)) return 'doji';
  if (close > open) return 'up';
  if (close < open) return 'down';
  return 'doji';
}

// Decide a candle's fill / stroke colour.
export function getCandleColor(
  direction: ChartCandlestickDirection,
  upColor: string,
  downColor: string,
  dojiColor: string,
): string {
  if (direction === 'up') return upColor;
  if (direction === 'down') return downColor;
  return dojiColor;
}

// Evenly-spaced numeric ticks across [min, max].
export function getCandlestickTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_CANDLESTICK_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const step = (max - min) / (safeCount - 1);
  const ticks: number[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    ticks.push(min + i * step);
  }
  return ticks;
}

// Apply a date formatter to a candle's date field. Handles
// both ISO strings and epoch numbers. Falls back to the
// raw value when no formatter is supplied.
export function formatCandleDate(
  date: string | number,
  formatter?: (d: string | number) => string,
): string {
  if (formatter) return formatter(date);
  if (typeof date === 'number') {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return String(date);
    return d.toISOString().slice(0, 10);
  }
  return String(date);
}

// One-line ARIA summary of the OHLC series.
export function describeCandlestickChart(
  data: readonly ChartCandlestickPoint[],
  formatValue?: (v: number) => string,
  formatDate?: (d: string | number) => string,
): string {
  if (data.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const totalDays = data.length;
  const bullCount = data.filter(
    (p) => getCandlestickDirection(p.open, p.close) === 'up',
  ).length;
  return `Candlestick chart, ${totalDays} sessions, ${bullCount} bullish. ${formatCandleDate(first.date, formatDate)} open ${fv(first.open)} -> ${formatCandleDate(last.date, formatDate)} close ${fv(last.close)}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartCandlestick = forwardRef(function ChartCandlestick(
  {
    data,
    width = DEFAULT_CHART_CANDLESTICK_WIDTH,
    height = DEFAULT_CHART_CANDLESTICK_HEIGHT,
    padding = DEFAULT_CHART_CANDLESTICK_PADDING,
    upColor = DEFAULT_CHART_CANDLESTICK_UP_COLOR,
    downColor = DEFAULT_CHART_CANDLESTICK_DOWN_COLOR,
    dojiColor = DEFAULT_CHART_CANDLESTICK_DOJI_COLOR,
    wickColor,
    showTooltip = true,
    showAxisTicks = true,
    showGrid = true,
    animate = true,
    className,
    ariaLabel = 'Candlestick chart',
    ariaDescription,
    formatValue,
    formatDate,
    tickCount = DEFAULT_CHART_CANDLESTICK_TICK_COUNT,
    candleWidth,
    candleGap = DEFAULT_CHART_CANDLESTICK_CANDLE_GAP,
    onCandleClick,
  }: ChartCandlestickProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getCandlestickBounds(data),
    [data],
  );
  const ticks = useMemo(
    () => getCandlestickTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showAxisTicks ? 16 : 0) - 4,
  );

  const computedCandleWidth = useMemo(() => {
    if (data.length === 0) return 0;
    if (
      candleWidth !== undefined &&
      Number.isFinite(candleWidth) &&
      candleWidth > 0
    ) {
      return candleWidth;
    }
    const available =
      innerWidth - candleGap * Math.max(0, data.length - 1);
    return Math.max(1, available / data.length);
  }, [candleGap, candleWidth, data.length, innerWidth]);

  const span = bounds.max - bounds.min;
  const yFor = useCallback(
    (value: number) => {
      if (span <= 0) return padding + innerHeight;
      const ratio = (value - bounds.min) / span;
      return padding + innerHeight - innerHeight * ratio;
    },
    [bounds.min, innerHeight, padding, span],
  );

  const description = useMemo(
    () =>
      ariaDescription ??
      describeCandlestickChart(data, formatValue, formatDate),
    [ariaDescription, data, formatDate, formatValue],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredPoint = hovered !== null ? data[hovered] : null;
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fd = (d: string | number) =>
    formatCandleDate(d, formatDate);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-candlestick"
      data-candle-count={data.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-candlestick-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-candlestick-svg"
        className="h-auto w-full"
      >
        {/* Y axis */}
        <line
          aria-hidden="true"
          data-section="chart-candlestick-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={padding + innerHeight}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {/* Grid + tick labels */}
        {showGrid || showAxisTicks
          ? ticks.map((t, idx) => {
              const y = yFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-candlestick-tick"
                  data-tick-value={t}
                >
                  {showGrid ? (
                    <line
                      aria-hidden="true"
                      x1={padding}
                      y1={y}
                      x2={width - padding / 2}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={0.06}
                      strokeDasharray="2 4"
                    />
                  ) : null}
                  {showAxisTicks ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-candlestick-tick-label"
                      x={padding - 4}
                      y={y}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.65}
                    >
                      {fv(t)}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}
        {/* Candles */}
        {data.map((p, i) => {
          const x =
            padding + i * (computedCandleWidth + candleGap);
          const direction = getCandlestickDirection(
            p.open,
            p.close,
          );
          const color = getCandleColor(
            direction,
            upColor,
            downColor,
            dojiColor,
          );
          const yHigh = yFor(p.high);
          const yLow = yFor(p.low);
          const yOpen = yFor(p.open);
          const yClose = yFor(p.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(
            DEFAULT_CHART_CANDLESTICK_MIN_BODY_HEIGHT,
            Math.abs(yClose - yOpen),
          );
          const midX = x + computedCandleWidth / 2;
          const isHovered = hovered === i;
          return (
            <g
              key={`${p.date}-${i}`}
              data-section="chart-candlestick-candle"
              data-candle-index={i}
              data-candle-date={String(p.date)}
              data-candle-direction={direction}
              data-candle-color={color}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              {/* Wick */}
              <line
                aria-hidden="true"
                data-section="chart-candlestick-wick"
                data-candle-index={i}
                x1={midX}
                y1={yHigh}
                x2={midX}
                y2={yLow}
                stroke={wickColor ?? color}
                strokeWidth={1}
                strokeOpacity={isHovered ? 1 : 0.85}
              />
              {/* Body */}
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${fd(p.date)} OHLC: open ${fv(p.open)}, high ${fv(p.high)}, low ${fv(p.low)}, close ${fv(p.close)}`}
                data-section="chart-candlestick-body"
                data-candle-index={i}
                data-candle-direction={direction}
                x={x}
                y={bodyTop}
                width={computedCandleWidth}
                height={bodyHeight}
                fill={color}
                fillOpacity={isHovered ? 1 : 0.92}
                stroke={isHovered ? color : 'none'}
                strokeWidth={isHovered ? 1.5 : 0}
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(i)}
                onBlur={handleLeave}
                onClick={
                  onCandleClick
                    ? () =>
                        onCandleClick({
                          point: p,
                          index: i,
                          direction,
                        })
                    : undefined
                }
                style={{
                  cursor: onCandleClick ? 'pointer' : 'default',
                }}
              />
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredPoint && hovered !== null ? (
        <div
          role="tooltip"
          data-section="chart-candlestick-tooltip"
          data-candle-index={hovered}
          style={{
            left:
              padding +
              hovered * (computedCandleWidth + candleGap) +
              computedCandleWidth +
              8,
            top: yFor(hoveredPoint.high),
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-candlestick-tooltip-date"
            className="font-medium"
          >
            {fd(hoveredPoint.date)}
          </div>
          <div
            data-section="chart-candlestick-tooltip-open"
            className="font-mono text-muted-foreground"
          >
            O: {fv(hoveredPoint.open)}
          </div>
          <div
            data-section="chart-candlestick-tooltip-high"
            className="font-mono text-muted-foreground"
          >
            H: {fv(hoveredPoint.high)}
          </div>
          <div
            data-section="chart-candlestick-tooltip-low"
            className="font-mono text-muted-foreground"
          >
            L: {fv(hoveredPoint.low)}
          </div>
          <div
            data-section="chart-candlestick-tooltip-close"
            className="font-mono"
          >
            C: {fv(hoveredPoint.close)}
          </div>
          {hoveredPoint.volume !== undefined ? (
            <div
              data-section="chart-candlestick-tooltip-volume"
              className="font-mono text-muted-foreground"
            >
              V: {fv(hoveredPoint.volume)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartCandlestick.displayName = 'ChartCandlestick';
