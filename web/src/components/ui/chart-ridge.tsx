import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_RIDGE_WIDTH = 560;
export const DEFAULT_CHART_RIDGE_HEIGHT = 320;
export const DEFAULT_CHART_RIDGE_PADDING = 40;
export const DEFAULT_CHART_RIDGE_LABEL_WIDTH = 80;
export const DEFAULT_CHART_RIDGE_OVERLAP = 0.6;
export const DEFAULT_CHART_RIDGE_DENSITY_SAMPLES = 64;
export const DEFAULT_CHART_RIDGE_TICK_COUNT = 5;
export const DEFAULT_CHART_RIDGE_FILL_OPACITY = 0.45;
export const DEFAULT_CHART_RIDGE_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export interface ChartRidgeSeries {
  id: string;
  label: string;
  values: readonly number[];
  color?: string;
}

export interface ChartRidgeDensityPoint {
  x: number;
  density: number;
}

export interface ChartRidgeRowLayout {
  id: string;
  label: string;
  color: string;
  index: number;
  baselineY: number;
  topY: number;
  rowHeight: number;
  peakDensity: number;
  count: number;
  density: ChartRidgeDensityPoint[];
  fillPath: string;
  linePath: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getRidgeDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_RIDGE_PALETTE[0]!;
  }
  return DEFAULT_CHART_RIDGE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_RIDGE_PALETTE.length
  ]!;
}

export function getRidgeFiniteValues(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (isFiniteNumber(v)) out.push(v);
  }
  return out;
}

export function silvermanBandwidth(values: readonly number[]): number {
  const finite = getRidgeFiniteValues(values);
  if (finite.length < 2) return 1;
  let sum = 0;
  for (const v of finite) sum += v;
  const mean = sum / finite.length;
  let sqSum = 0;
  for (const v of finite) {
    const d = v - mean;
    sqSum += d * d;
  }
  const std = Math.sqrt(sqSum / (finite.length - 1));
  if (std <= 0) return 1;
  return 1.06 * std * Math.pow(finite.length, -0.2);
}

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

export interface ComputeRidgeDensityInput {
  values: readonly number[];
  xMin: number;
  xMax: number;
  samples?: number;
  bandwidth?: number;
}

export function computeRidgeDensity(
  input: ComputeRidgeDensityInput
): ChartRidgeDensityPoint[] {
  const finite = getRidgeFiniteValues(input.values);
  if (finite.length < 2) return [];
  const samples = Math.max(
    2,
    Math.floor(input.samples ?? DEFAULT_CHART_RIDGE_DENSITY_SAMPLES)
  );
  const xMin = Math.min(input.xMin, input.xMax);
  const xMax = Math.max(input.xMin, input.xMax);
  if (xMin === xMax) return [];
  const bw =
    isFiniteNumber(input.bandwidth) && input.bandwidth > 0
      ? input.bandwidth
      : silvermanBandwidth(finite);
  if (bw <= 0) return [];
  const step = (xMax - xMin) / (samples - 1);
  const out: ChartRidgeDensityPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const x = xMin + step * i;
    let sum = 0;
    for (const v of finite) {
      sum += gaussianKernel((x - v) / bw);
    }
    const density = sum / (finite.length * bw);
    out.push({ x, density });
  }
  return out;
}

export function getRidgeBounds(
  series: readonly ChartRidgeSeries[],
  padFactor: number = 0
): { xMin: number; xMax: number } {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const v of s.values) {
      if (!isFiniteNumber(v)) continue;
      if (v < xMin) xMin = v;
      if (v > xMax) xMax = v;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return { xMin: 0, xMax: 1 };
  }
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (padFactor > 0) {
    const range = xMax - xMin;
    xMin -= range * padFactor;
    xMax += range * padFactor;
  }
  return { xMin, xMax };
}

export function getRidgePeakDensity(
  density: readonly ChartRidgeDensityPoint[]
): number {
  let m = 0;
  for (const p of density) {
    if (p.density > m) m = p.density;
  }
  return m;
}

export interface ComputeRidgeLayoutInput {
  series: readonly ChartRidgeSeries[];
  xMin: number;
  xMax: number;
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  overlap: number;
  samples: number;
  bandwidth?: number;
  globalPeak?: boolean;
}

export function computeRidgeLayout(
  input: ComputeRidgeLayoutInput
): ChartRidgeRowLayout[] {
  const {
    series,
    xMin,
    xMax,
    innerW,
    innerH,
    padX,
    padY,
    overlap,
    samples,
    bandwidth,
    globalPeak = false,
  } = input;
  if (innerW <= 0 || innerH <= 0 || !series.length) return [];
  const xSpan = xMax - xMin;
  if (xSpan <= 0) return [];
  const n = series.length;
  const rawStride = innerH / n;
  const overlapRatio = Math.max(0, Math.min(0.95, overlap));
  const rowHeight = rawStride * (1 + overlapRatio);
  const stride = rawStride;

  const densities: ChartRidgeDensityPoint[][] = series.map((s) =>
    computeRidgeDensity({
      values: s.values,
      xMin,
      xMax,
      samples,
      ...(isFiniteNumber(bandwidth) ? { bandwidth } : {}),
    })
  );
  let normaliser: number[] = densities.map((d) => getRidgePeakDensity(d));
  if (globalPeak) {
    const max = normaliser.reduce((acc, p) => (p > acc ? p : acc), 0);
    normaliser = densities.map(() => max);
  }
  const out: ChartRidgeRowLayout[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i]!;
    const density = densities[i]!;
    const peak = normaliser[i] ?? 0;
    const baselineY = padY + stride * (i + 1);
    const topY = baselineY - rowHeight;
    const color = s.color ?? getRidgeDefaultColor(i);
    let linePath = '';
    let fillPath = '';
    if (density.length && peak > 0) {
      const lineParts: string[] = [];
      for (let j = 0; j < density.length; j++) {
        const p = density[j]!;
        const px = padX + ((p.x - xMin) / xSpan) * innerW;
        const ratio = p.density / peak;
        const py = baselineY - Math.max(0, Math.min(1, ratio)) * rowHeight;
        lineParts.push(`${j === 0 ? 'M' : 'L'} ${px} ${py}`);
      }
      linePath = lineParts.join(' ');
      const last = density[density.length - 1]!;
      const first = density[0]!;
      const lastX = padX + ((last.x - xMin) / xSpan) * innerW;
      const firstX = padX + ((first.x - xMin) / xSpan) * innerW;
      fillPath = `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
    }
    out.push({
      id: s.id,
      label: s.label,
      color,
      index: i,
      baselineY,
      topY,
      rowHeight,
      peakDensity: peak,
      count: getRidgeFiniteValues(s.values).length,
      density,
      fillPath,
      linePath,
    });
  }
  return out;
}

export function getRidgeTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_RIDGE_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const step = (max - min) / (c - 1);
  return Array.from({ length: c }, (_, i) => min + step * i);
}

export function describeRidgeChart(
  series: readonly ChartRidgeSeries[],
  formatValue?: (v: number) => string
): string {
  if (!series.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const bounds = getRidgeBounds(series);
  let totalCount = 0;
  for (const s of series) totalCount += getRidgeFiniteValues(s.values).length;
  if (totalCount === 0) return 'No data';
  return `Ridgeline chart with ${series.length} series, ${totalCount} values total. x range ${fmt(bounds.xMin)} to ${fmt(bounds.xMax)}.`;
}

export interface ChartRidgeProps {
  series: readonly ChartRidgeSeries[];
  width?: number;
  height?: number;
  padding?: number;
  labelWidth?: number;
  overlap?: number;
  samples?: number;
  bandwidth?: number;
  xMin?: number;
  xMax?: number;
  tickCount?: number;
  fillOpacity?: number;
  globalPeak?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onRowClick?: (args: {
    series: ChartRidgeSeries;
    layout: ChartRidgeRowLayout;
  }) => void;
  style?: CSSProperties;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

const ChartRidgeInner = (
  {
    series,
    width = DEFAULT_CHART_RIDGE_WIDTH,
    height = DEFAULT_CHART_RIDGE_HEIGHT,
    padding = DEFAULT_CHART_RIDGE_PADDING,
    labelWidth = DEFAULT_CHART_RIDGE_LABEL_WIDTH,
    overlap = DEFAULT_CHART_RIDGE_OVERLAP,
    samples = DEFAULT_CHART_RIDGE_DENSITY_SAMPLES,
    bandwidth,
    xMin,
    xMax,
    tickCount = DEFAULT_CHART_RIDGE_TICK_COUNT,
    fillOpacity = DEFAULT_CHART_RIDGE_FILL_OPACITY,
    globalPeak = false,
    showLabels = true,
    showTooltip = true,
    showAxisTicks = true,
    showGrid = true,
    animate = true,
    className,
    ariaLabel = 'Ridgeline chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    onRowClick,
    style,
  }: ChartRidgeProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-ridge-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding - labelWidth - padding);
  const innerH = Math.max(0, height - padding * 2);

  const autoBounds = useMemo(
    () => getRidgeBounds(series, 0.04),
    [series]
  );
  const resolvedXMin = isFiniteNumber(xMin) ? xMin : autoBounds.xMin;
  const resolvedXMax = isFiniteNumber(xMax) ? xMax : autoBounds.xMax;

  const layout = useMemo(
    () =>
      computeRidgeLayout({
        series,
        xMin: resolvedXMin,
        xMax: resolvedXMax,
        innerW,
        innerH,
        padX: padding + labelWidth,
        padY: padding,
        overlap,
        samples,
        ...(isFiniteNumber(bandwidth) ? { bandwidth } : {}),
        globalPeak,
      }),
    [
      series,
      resolvedXMin,
      resolvedXMax,
      innerW,
      innerH,
      padding,
      labelWidth,
      overlap,
      samples,
      bandwidth,
      globalPeak,
    ]
  );

  const xTicks = useMemo(
    () => getRidgeTicks(resolvedXMin, resolvedXMax, tickCount),
    [resolvedXMin, resolvedXMax, tickCount]
  );

  const xSpan = resolvedXMax - resolvedXMin;
  const xPos = (xv: number) =>
    xSpan > 0
      ? padding + labelWidth + ((xv - resolvedXMin) / xSpan) * innerW
      : padding + labelWidth + innerW / 2;

  const hovered = useMemo(
    () => layout.find((r) => r.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const autoDescription = useMemo(
    () => describeRidgeChart(series, formatValue),
    [series, formatValue]
  );

  return (
    <div
      ref={ref}
      data-section="chart-ridge"
      data-series-count={series.length}
      data-visible-count={layout.length}
      data-overlap={overlap}
      data-global-peak={globalPeak ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={['chart-ridge flex flex-col gap-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-ridge-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-ridge-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-ridge-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showGrid && (
            <g data-section="chart-ridge-grid" pointerEvents="none">
              {xTicks.map((t, i) => {
                const x = xPos(t);
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-ridge-grid-line"
                    x1={x}
                    x2={x}
                    y1={padding}
                    y2={padding + innerH}
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}
          <g data-section="chart-ridge-axes">
            <line
              data-section="chart-ridge-axis"
              data-axis="x"
              x1={padding + labelWidth}
              x2={padding + labelWidth + innerW}
              y1={padding + innerH}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
          </g>
          {showAxisTicks && (
            <g data-section="chart-ridge-ticks" pointerEvents="none">
              {xTicks.map((t, i) => {
                const x = xPos(t);
                return (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-ridge-tick"
                  >
                    <line
                      x1={x}
                      x2={x}
                      y1={padding + innerH}
                      y2={padding + innerH + 4}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-ridge-tick-label"
                      x={x}
                      y={padding + innerH + 16}
                      textAnchor="middle"
                      fontSize={10}
                      fill="rgb(100 116 139)"
                    >
                      {formatValue(t)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          <g data-section="chart-ridge-rows">
            {layout
              .slice()
              .reverse()
              .map((row) => {
                const isHovered = hoveredId === row.id;
                const dim = hoveredId != null && !isHovered ? 0.25 : 1;
                return (
                  <g
                    key={row.id}
                    data-section="chart-ridge-row"
                    data-series-id={row.id}
                    data-series-index={row.index}
                    data-series-color={row.color}
                    data-series-count={row.count}
                    data-hovered={isHovered ? 'true' : 'false'}
                    className={
                      animate ? 'motion-safe:animate-fade-in' : undefined
                    }
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() =>
                      setHoveredId((cur) => (cur === row.id ? null : cur))
                    }
                    onFocus={() => setHoveredId(row.id)}
                    onBlur={() =>
                      setHoveredId((cur) => (cur === row.id ? null : cur))
                    }
                    onClick={() => {
                      const s = series[row.index];
                      if (s) onRowClick?.({ series: s, layout: row });
                    }}
                    style={{ opacity: dim }}
                  >
                    {row.fillPath && (
                      <path
                        data-section="chart-ridge-fill"
                        d={row.fillPath}
                        fill={row.color}
                        fillOpacity={fillOpacity}
                        stroke="none"
                      />
                    )}
                    {row.linePath && (
                      <path
                        data-section="chart-ridge-line"
                        d={row.linePath}
                        fill="none"
                        stroke={row.color}
                        strokeWidth={1.4}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${row.label}: density curve over ${row.count} values`}
                      />
                    )}
                    <line
                      data-section="chart-ridge-baseline"
                      x1={padding + labelWidth}
                      x2={padding + labelWidth + innerW}
                      y1={row.baselineY}
                      y2={row.baselineY}
                      stroke={row.color}
                      strokeOpacity={0.45}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
          </g>
          {showLabels && (
            <g data-section="chart-ridge-labels" pointerEvents="none">
              {layout.map((row) => (
                <text
                  key={`lbl-${row.id}`}
                  data-section="chart-ridge-label"
                  data-series-id={row.id}
                  x={padding + labelWidth - 6}
                  y={row.baselineY - 3}
                  textAnchor="end"
                  fontSize={11}
                  fill="rgb(71 85 105)"
                >
                  {row.label}
                </text>
              ))}
            </g>
          )}
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-ridge-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-ridge-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-ridge-tooltip-count"
              className="font-mono text-slate-700"
            >
              count: {hovered.count}
            </div>
            <div
              data-section="chart-ridge-tooltip-peak"
              className="font-mono text-slate-500"
            >
              peak density: {formatValue(hovered.peakDensity)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartRidge = forwardRef<HTMLDivElement, ChartRidgeProps>(
  ChartRidgeInner
);
ChartRidge.displayName = 'ChartRidge';
