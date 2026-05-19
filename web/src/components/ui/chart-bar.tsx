import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.456, TODO 11.438) ChartBar primitive.
//
// Pure-SVG bar chart with horizontal + vertical orientations,
// per-bar color slot, axis labels, an opt-in hover tooltip,
// and a CSS-driven mount animation. Hosts pass an ordered
// `data` array; the primitive owns the SVG geometry +
// accessibility + interaction wiring.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartBarOrientation = 'horizontal' | 'vertical';

export interface ChartBarSeries {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartBarProps {
  data: readonly ChartBarSeries[];
  orientation?: ChartBarOrientation;
  width?: number;
  height?: number;
  padding?: number;
  axisLabel?: { x?: string; y?: string };
  formatValue?: (n: number) => string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  onBarClick?: (series: ChartBarSeries) => void;
  tickCount?: number;
  maxOverride?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_BAR_WIDTH = 480;
export const DEFAULT_CHART_BAR_HEIGHT = 280;
export const DEFAULT_CHART_BAR_PADDING = 32;
export const DEFAULT_CHART_BAR_TICK_COUNT = 4;

export const DEFAULT_CHART_BAR_PALETTE: readonly string[] = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#14b8a6', // teal
];

export function getDefaultBarColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_BAR_PALETTE[0]!;
  }
  return DEFAULT_CHART_BAR_PALETTE[
    index % DEFAULT_CHART_BAR_PALETTE.length
  ]!;
}

export function getChartBarMax(
  data: readonly ChartBarSeries[],
  override?: number,
): number {
  if (
    override !== undefined &&
    Number.isFinite(override) &&
    override > 0
  ) {
    return override;
  }
  let max = 0;
  for (const d of data) {
    if (Number.isFinite(d.value) && d.value > max) max = d.value;
  }
  if (max <= 0) return 1;
  return max;
}

export function getChartBarScale(
  max: number,
  length: number,
): (value: number) => number {
  const safeMax = max > 0 ? max : 1;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 1;
  return (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return (value / safeMax) * safeLength;
  };
}

export function formatChartBarTick(
  value: number,
  formatter?: (n: number) => string,
): string {
  if (formatter) return formatter(value);
  if (!Number.isFinite(value)) return '0';
  // Pretty-print integers; trim trailing zeros for floats.
  if (Number.isInteger(value)) return value.toString();
  return Number.parseFloat(value.toFixed(2)).toString();
}

export function getChartBarTicks(
  max: number,
  count: number = DEFAULT_CHART_BAR_TICK_COUNT,
): number[] {
  const safeCount =
    Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const safeMax = max > 0 ? max : 1;
  const ticks: number[] = [];
  for (let i = 0; i <= safeCount; i += 1) {
    ticks.push((safeMax / safeCount) * i);
  }
  return ticks;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartBar = forwardRef(function ChartBar(
  {
    data,
    orientation = 'vertical',
    width = DEFAULT_CHART_BAR_WIDTH,
    height = DEFAULT_CHART_BAR_HEIGHT,
    padding = DEFAULT_CHART_BAR_PADDING,
    axisLabel,
    formatValue,
    showGrid = true,
    showTooltip = true,
    showAxisTicks = true,
    animate = true,
    className,
    ariaLabel = 'Bar chart',
    onBarClick,
    tickCount = DEFAULT_CHART_BAR_TICK_COUNT,
    maxOverride,
  }: ChartBarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isVertical = orientation === 'vertical';

  const max = useMemo(
    () => getChartBarMax(data, maxOverride),
    [data, maxOverride],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const trackLength = isVertical ? innerHeight : innerWidth;
  const valueScale = useMemo(
    () => getChartBarScale(max, trackLength),
    [max, trackLength],
  );

  const ticks = useMemo(
    () => getChartBarTicks(max, tickCount),
    [max, tickCount],
  );

  const slotLength = data.length > 0 ? (isVertical ? innerWidth : innerHeight) / data.length : 0;
  const barThickness = slotLength * 0.6;
  const barGap = (slotLength - barThickness) / 2;

  const [hoverId, setHoverId] = useState<string | null>(null);
  const handleEnter = useCallback((id: string) => {
    setHoverId(id);
  }, []);
  const handleLeave = useCallback(() => {
    setHoverId(null);
  }, []);

  const hovered = useMemo(
    () => (hoverId ? data.find((d) => d.id === hoverId) : null),
    [data, hoverId],
  );

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-bar"
      data-orientation={orientation}
      data-bar-count={data.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn('relative w-full', className)}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-bar-svg"
        className="h-auto w-full"
      >
        {/* Axis lines */}
        <line
          aria-hidden="true"
          data-section="chart-bar-axis-x"
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          aria-hidden="true"
          data-section="chart-bar-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {/* Grid + tick labels */}
        {showGrid
          ? ticks.map((tick, idx) => {
              const px = valueScale(tick);
              const tickKey = `tick-${idx}`;
              if (isVertical) {
                const y = height - padding - px;
                return (
                  <g
                    key={tickKey}
                    data-section="chart-bar-grid"
                    data-tick-value={tick}
                  >
                    <line
                      aria-hidden="true"
                      x1={padding}
                      y1={y}
                      x2={width - padding}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={0.07}
                      strokeDasharray="2 4"
                    />
                    {showAxisTicks ? (
                      <text
                        aria-hidden="true"
                        data-section="chart-bar-tick-label"
                        x={padding - 6}
                        y={y}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        fontSize={10}
                        fill="currentColor"
                        fillOpacity={0.6}
                      >
                        {formatChartBarTick(tick, formatValue)}
                      </text>
                    ) : null}
                  </g>
                );
              }
              const x = padding + px;
              return (
                <g
                  key={tickKey}
                  data-section="chart-bar-grid"
                  data-tick-value={tick}
                >
                  <line
                    aria-hidden="true"
                    x1={x}
                    y1={padding}
                    x2={x}
                    y2={height - padding}
                    stroke="currentColor"
                    strokeOpacity={0.07}
                    strokeDasharray="2 4"
                  />
                  {showAxisTicks ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-bar-tick-label"
                      x={x}
                      y={height - padding + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.6}
                    >
                      {formatChartBarTick(tick, formatValue)}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}
        {/* Bars */}
        {data.map((d, idx) => {
          const px = valueScale(d.value);
          const color = d.color ?? getDefaultBarColor(idx);
          const isHovered = hoverId === d.id;
          const ariaLabelBar = `${d.label}: ${formatChartBarTick(d.value, formatValue)}`;
          if (isVertical) {
            const x =
              padding + slotLength * idx + barGap;
            const y = height - padding - px;
            return (
              <g
                key={d.id}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={ariaLabelBar}
                data-section="chart-bar-bar"
                data-bar-id={d.id}
                data-hovered={isHovered ? 'true' : 'false'}
                onMouseEnter={() => handleEnter(d.id)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(d.id)}
                onBlur={handleLeave}
                onClick={
                  onBarClick ? () => onBarClick(d) : undefined
                }
                className={cn(
                  'cursor-pointer transition-opacity',
                  isHovered ? 'opacity-90' : 'opacity-100',
                  animate && 'motion-safe:animate-fade-in',
                  onBarClick && 'focus:outline-none focus-visible:outline-2 focus-visible:outline-primary',
                )}
              >
                <rect
                  data-section="chart-bar-rect"
                  x={x}
                  y={y}
                  width={barThickness}
                  height={px}
                  fill={color}
                  rx={2}
                />
                <text
                  aria-hidden="true"
                  data-section="chart-bar-label"
                  x={x + barThickness / 2}
                  y={height - padding + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  {d.label}
                </text>
              </g>
            );
          }
          const y =
            padding + slotLength * idx + barGap;
          const x = padding;
          return (
            <g
              key={d.id}
              role="graphics-symbol"
              tabIndex={0}
              aria-label={ariaLabelBar}
              data-section="chart-bar-bar"
              data-bar-id={d.id}
              data-hovered={isHovered ? 'true' : 'false'}
              onMouseEnter={() => handleEnter(d.id)}
              onMouseLeave={handleLeave}
              onFocus={() => handleEnter(d.id)}
              onBlur={handleLeave}
              onClick={onBarClick ? () => onBarClick(d) : undefined}
              className={cn(
                'cursor-pointer transition-opacity',
                isHovered ? 'opacity-90' : 'opacity-100',
                animate && 'motion-safe:animate-fade-in',
                onBarClick &&
                  'focus:outline-none focus-visible:outline-2 focus-visible:outline-primary',
              )}
            >
              <rect
                data-section="chart-bar-rect"
                x={x}
                y={y}
                width={px}
                height={barThickness}
                fill={color}
                rx={2}
              />
              <text
                aria-hidden="true"
                data-section="chart-bar-label"
                x={padding - 6}
                y={y + barThickness / 2}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.7}
              >
                {d.label}
              </text>
            </g>
          );
        })}
        {/* Axis title labels */}
        {axisLabel?.x ? (
          <text
            aria-hidden="true"
            data-section="chart-bar-axis-x-label"
            x={width / 2}
            y={height - 4}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.7}
          >
            {axisLabel.x}
          </text>
        ) : null}
        {axisLabel?.y ? (
          <text
            aria-hidden="true"
            data-section="chart-bar-axis-y-label"
            x={12}
            y={height / 2}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.7}
            transform={`rotate(-90 12 ${height / 2})`}
          >
            {axisLabel.y}
          </text>
        ) : null}
      </svg>
      {showTooltip && hovered ? (
        <div
          role="tooltip"
          data-section="chart-bar-tooltip"
          className="pointer-events-none absolute left-2 top-2 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-bar-tooltip-label"
            className="font-medium"
          >
            {hovered.label}
          </div>
          <div
            data-section="chart-bar-tooltip-value"
            className="font-mono text-muted-foreground"
          >
            {formatChartBarTick(hovered.value, formatValue)}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartBar.displayName = 'ChartBar';
