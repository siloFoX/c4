import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.465, TODO 11.447) ChartFunnel primitive.
//
// Pure-SVG conversion funnel. Each stage paints as a
// trapezoid whose width is proportional to its value.
// Successive stages narrow toward the bottom, producing the
// classic funnel silhouette. Drop-off labels between
// consecutive stages quantify how many users were lost;
// hover opens a detail tooltip with the absolute value plus
// % of top + % conversion from previous. Default colour
// gradient goes from a light tint at the top to a darker
// brand colour at the bottom.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartFunnelStage {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartFunnelProps {
  stages: readonly ChartFunnelStage[];
  width?: number;
  height?: number;
  stageGap?: number;
  showDropoff?: boolean;
  showValues?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  onStageClick?: (args: {
    stage: ChartFunnelStage;
    index: number;
    dropoff: number;
    conversion: number;
    ofTop: number;
  }) => void;
  gradient?: { from?: string; to?: string };
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_FUNNEL_WIDTH = 360;
export const DEFAULT_CHART_FUNNEL_HEIGHT = 320;
export const DEFAULT_CHART_FUNNEL_STAGE_GAP = 4;
export const DEFAULT_CHART_FUNNEL_GRADIENT_FROM = '#bfdbfe';
export const DEFAULT_CHART_FUNNEL_GRADIENT_TO = '#1d4ed8';

// Return the largest stage value. Funnels typically start at
// their widest and narrow downward, but we still take a max
// so a malformed dataset with a smaller-first stage still
// renders proportionally.
export function getFunnelMax(
  stages: readonly ChartFunnelStage[],
): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const s of stages) {
    if (Number.isFinite(s.value) && s.value > max) max = s.value;
  }
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
}

// Clamp ratio of value / max into [0, 1]. Non-finite,
// negative, or zero-max inputs all collapse to 0.
export function getFunnelRatio(
  value: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

// Compute the absolute drop-off between two stages. Returns
// 0 when either is missing or non-finite or when the
// previous stage's value is <= 0.
export function getStageDropoff(
  prevValue: number | undefined,
  currValue: number,
): number {
  if (prevValue === undefined) return 0;
  if (!Number.isFinite(prevValue) || prevValue <= 0) return 0;
  if (!Number.isFinite(currValue)) return 0;
  const d = prevValue - currValue;
  return d > 0 ? d : 0;
}

// Compute the fraction of users that converted from the
// previous stage to the current one (0..1). Returns 1 when
// previous is undefined (i.e., this is the first stage).
export function getStageConversion(
  prevValue: number | undefined,
  currValue: number,
): number {
  if (prevValue === undefined) return 1;
  if (!Number.isFinite(prevValue) || prevValue <= 0) return 0;
  if (!Number.isFinite(currValue) || currValue <= 0) return 0;
  const r = currValue / prevValue;
  if (r >= 1) return 1;
  return r;
}

// Compute the fraction of the top stage that this stage
// represents (0..1). Returns 0 when top is non-positive.
export function getStageOfTop(
  topValue: number,
  value: number,
): number {
  if (!Number.isFinite(topValue) || topValue <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= topValue) return 1;
  return value / topValue;
}

// Linear-interpolate two #rgb / #rrggbb colours into a new
// hex string at fraction t in [0, 1]. Inputs that fail to
// parse fall back to the `from` colour so the gradient is
// always defined.
export function interpolateColor(
  from: string,
  to: string,
  t: number,
): string {
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  if (!fromRgb || !toRgb) return from;
  const clamped = Math.max(0, Math.min(1, t));
  const mix = (a: number, b: number) =>
    Math.round(a + (b - a) * clamped);
  const r = mix(fromRgb.r, toRgb.r);
  const g = mix(fromRgb.g, toRgb.g);
  const b = mix(fromRgb.b, toRgb.b);
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim();
  if (!h.startsWith('#')) return null;
  h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (
    Number.isNaN(r) ||
    Number.isNaN(g) ||
    Number.isNaN(b)
  )
    return null;
  return { r, g, b };
}

// Build the SVG path for one trapezoidal funnel slice.
// `topWidth` and `bottomWidth` are the top + bottom widths
// of the slice; `top` is the slice's top y-coordinate;
// `height` is the slice height; `cx` is the horizontal
// centre of the funnel.
export function buildFunnelPath(
  topWidth: number,
  bottomWidth: number,
  top: number,
  height: number,
  cx: number,
): string {
  const tw = Math.max(0, topWidth);
  const bw = Math.max(0, bottomWidth);
  const x1 = cx - tw / 2;
  const x2 = cx + tw / 2;
  const x3 = cx + bw / 2;
  const x4 = cx - bw / 2;
  const y1 = top;
  const y2 = top + height;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y1.toFixed(2)} L ${x3.toFixed(2)} ${y2.toFixed(2)} L ${x4.toFixed(2)} ${y2.toFixed(2)} Z`;
}

// Build a one-line auto ARIA description summarising every
// stage so screen readers can describe the funnel.
export function describeFunnelChart(
  stages: readonly ChartFunnelStage[],
  formatValue?: (v: number) => string,
  formatPercent?: (v: number) => string,
): string {
  if (stages.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent ? formatPercent(v) : `${(v * 100).toFixed(1)}%`;
  const top = stages[0]!.value;
  const parts = stages.map((s, i) => {
    const ofTop = getStageOfTop(top, s.value);
    return `${s.label} ${fv(s.value)} (${fp(ofTop)} of top)`;
  });
  return `Funnel with ${stages.length} stages. ${parts.join('. ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartFunnel = forwardRef(function ChartFunnel(
  {
    stages,
    width = DEFAULT_CHART_FUNNEL_WIDTH,
    height = DEFAULT_CHART_FUNNEL_HEIGHT,
    stageGap = DEFAULT_CHART_FUNNEL_STAGE_GAP,
    showDropoff = true,
    showValues = true,
    showLabels = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Funnel chart',
    ariaDescription,
    formatValue,
    formatPercent,
    onStageClick,
    gradient,
  }: ChartFunnelProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const max = useMemo(() => getFunnelMax(stages), [stages]);
  const top = stages[0]?.value ?? 0;
  const cx = width / 2;
  const padX = 8;
  const stageCount = stages.length;
  const availableHeight = Math.max(0, height - padX * 2);
  const sliceHeight =
    stageCount > 0
      ? Math.max(
          0,
          availableHeight / stageCount - stageGap,
        )
      : 0;

  const fromColor =
    gradient?.from ?? DEFAULT_CHART_FUNNEL_GRADIENT_FROM;
  const toColor =
    gradient?.to ?? DEFAULT_CHART_FUNNEL_GRADIENT_TO;

  // Pre-compute geometry + colour for each slice.
  const slices = useMemo(() => {
    return stages.map((s, i) => {
      const widthRatioTop = getFunnelRatio(s.value, max);
      const next = stages[i + 1];
      const widthRatioBottom =
        next !== undefined
          ? getFunnelRatio(next.value, max)
          : widthRatioTop * 0.5;
      const topW = (width - padX * 2) * widthRatioTop;
      const bottomW = (width - padX * 2) * widthRatioBottom;
      const topY = padX + i * (sliceHeight + stageGap);
      const t =
        stageCount > 1 ? i / (stageCount - 1) : 0;
      const color =
        s.color ?? interpolateColor(fromColor, toColor, t);
      const prevValue = i > 0 ? stages[i - 1]?.value : undefined;
      const dropoff = getStageDropoff(prevValue, s.value);
      const conversion = getStageConversion(prevValue, s.value);
      const ofTop = getStageOfTop(top, s.value);
      return {
        stage: s,
        index: i,
        topW,
        bottomW,
        topY,
        color,
        dropoff,
        conversion,
        ofTop,
        prevValue,
      };
    });
  }, [
    fromColor,
    max,
    sliceHeight,
    stageCount,
    stageGap,
    stages,
    toColor,
    top,
    width,
  ]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeFunnelChart(stages, formatValue, formatPercent),
    [
      ariaDescription,
      formatPercent,
      formatValue,
      stages,
    ],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent ? formatPercent(v) : `${(v * 100).toFixed(1)}%`;

  const hoveredSlice =
    hovered !== null ? slices[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-funnel"
      data-stage-count={stageCount}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-flex w-full max-w-full flex-col',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-funnel-aria-desc"
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
        data-section="chart-funnel-svg"
        className="h-auto w-full"
      >
        {slices.map((slice) => {
          const path = buildFunnelPath(
            slice.topW,
            slice.bottomW,
            slice.topY,
            sliceHeight,
            cx,
          );
          const isHovered = hovered === slice.index;
          return (
            <g
              key={slice.stage.id}
              data-section="chart-funnel-stage"
              data-stage-id={slice.stage.id}
              data-stage-index={slice.index}
              data-stage-color={slice.color}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${slice.stage.label}: ${fv(slice.stage.value)} (${fp(slice.ofTop)} of top)`}
                data-section="chart-funnel-slice"
                data-stage-id={slice.stage.id}
                d={path}
                fill={slice.color}
                fillOpacity={isHovered ? 1 : 0.92}
                stroke={isHovered ? slice.color : 'none'}
                strokeWidth={isHovered ? 1.5 : 0}
                onMouseEnter={() => handleEnter(slice.index)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(slice.index)}
                onBlur={handleLeave}
                onClick={
                  onStageClick
                    ? () =>
                        onStageClick({
                          stage: slice.stage,
                          index: slice.index,
                          dropoff: slice.dropoff,
                          conversion: slice.conversion,
                          ofTop: slice.ofTop,
                        })
                    : undefined
                }
                style={{
                  cursor: onStageClick
                    ? 'pointer'
                    : 'default',
                }}
              />
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-funnel-label"
                  data-stage-id={slice.stage.id}
                  x={cx}
                  y={slice.topY + sliceHeight / 2 - 5}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="#ffffff"
                >
                  {slice.stage.label}
                </text>
              ) : null}
              {showValues ? (
                <text
                  aria-hidden="true"
                  data-section="chart-funnel-value"
                  data-stage-id={slice.stage.id}
                  x={cx}
                  y={slice.topY + sliceHeight / 2 + 10}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#ffffff"
                  fillOpacity={0.85}
                >
                  {fv(slice.stage.value)}
                </text>
              ) : null}
              {showDropoff &&
              slice.index > 0 &&
              slice.dropoff > 0 ? (
                <text
                  aria-hidden="true"
                  data-section="chart-funnel-dropoff"
                  data-stage-id={slice.stage.id}
                  data-dropoff={slice.dropoff}
                  data-conversion={slice.conversion.toFixed(
                    4,
                  )}
                  x={cx}
                  y={slice.topY - 2}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  -{fv(slice.dropoff)} ({fp(1 - slice.conversion)} drop)
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredSlice ? (
        <div
          role="tooltip"
          data-section="chart-funnel-tooltip"
          data-stage-id={hoveredSlice.stage.id}
          style={{
            left: cx + hoveredSlice.topW / 2 + 12,
            top: hoveredSlice.topY,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-funnel-tooltip-label"
            className="font-medium"
          >
            {hoveredSlice.stage.label}
          </div>
          <div
            data-section="chart-funnel-tooltip-value"
            className="font-mono"
          >
            {fv(hoveredSlice.stage.value)}
          </div>
          <div
            data-section="chart-funnel-tooltip-of-top"
            className="text-muted-foreground"
          >
            {fp(hoveredSlice.ofTop)} of top
          </div>
          {hoveredSlice.index > 0 ? (
            <div
              data-section="chart-funnel-tooltip-conversion"
              className="text-muted-foreground"
            >
              {fp(hoveredSlice.conversion)} from previous
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartFunnel.displayName = 'ChartFunnel';
