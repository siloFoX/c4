import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_HISTOGRAM_WIDTH = 560;
export const DEFAULT_CHART_HISTOGRAM_HEIGHT = 320;
export const DEFAULT_CHART_HISTOGRAM_PADDING = 40;
export const DEFAULT_CHART_HISTOGRAM_TICK_COUNT = 5;
export const DEFAULT_CHART_HISTOGRAM_BIN_GAP = 1;
export const DEFAULT_CHART_HISTOGRAM_DENSITY_SAMPLES = 64;
export const DEFAULT_CHART_HISTOGRAM_BAR_COLOR = '#2563eb';
export const DEFAULT_CHART_HISTOGRAM_DENSITY_COLOR = '#dc2626';

export type ChartHistogramYMode = 'count' | 'density';

export interface ChartHistogramBin {
  index: number;
  start: number;
  end: number;
  count: number;
  density: number;
}

export interface ChartHistogramLayoutBar {
  index: number;
  start: number;
  end: number;
  count: number;
  density: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  midValue: number;
}

export interface ChartHistogramBounds {
  xMin: number;
  xMax: number;
  yMax: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getHistogramFiniteValues(
  values: readonly number[]
): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (isFiniteNumber(v)) out.push(v);
  }
  return out;
}

export function getHistogramSturgesBinCount(n: number): number {
  if (!isFiniteNumber(n) || n <= 0) return 1;
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

export function getHistogramBounds(
  values: readonly number[]
): ChartHistogramBounds {
  const finite = getHistogramFiniteValues(values);
  if (!finite.length) return { xMin: 0, xMax: 1, yMax: 1 };
  let xMin = finite[0]!;
  let xMax = finite[0]!;
  for (let i = 1; i < finite.length; i++) {
    const v = finite[i]!;
    if (v < xMin) xMin = v;
    if (v > xMax) xMax = v;
  }
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  return { xMin, xMax, yMax: 1 };
}

export interface ComputeHistogramBinsInput {
  values: readonly number[];
  binCount?: number;
  xMin?: number;
  xMax?: number;
}

export function computeHistogramBins(
  input: ComputeHistogramBinsInput
): ChartHistogramBin[] {
  const finite = getHistogramFiniteValues(input.values);
  if (!finite.length) return [];
  const xMinHint = isFiniteNumber(input.xMin) ? input.xMin : Math.min(...finite);
  const xMaxHint = isFiniteNumber(input.xMax) ? input.xMax : Math.max(...finite);
  let xMin = Math.min(xMinHint, xMaxHint);
  let xMax = Math.max(xMinHint, xMaxHint);
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  const requested =
    isFiniteNumber(input.binCount) && input.binCount > 0
      ? Math.floor(input.binCount)
      : getHistogramSturgesBinCount(finite.length);
  const binCount = Math.max(1, requested);
  const step = (xMax - xMin) / binCount;
  const bins: ChartHistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const start = xMin + step * i;
    const end = i === binCount - 1 ? xMax : xMin + step * (i + 1);
    bins.push({ index: i, start, end, count: 0, density: 0 });
  }
  for (const v of finite) {
    if (v < xMin || v > xMax) continue;
    let idx = Math.floor((v - xMin) / step);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]!.count += 1;
  }
  const total = finite.length;
  for (const b of bins) {
    b.density = total > 0 && step > 0 ? b.count / (total * step) : 0;
  }
  return bins;
}

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

function computeStd(values: readonly number[], mean: number): number {
  if (values.length <= 1) return 0;
  let sum = 0;
  for (const v of values) {
    const d = v - mean;
    sum += d * d;
  }
  return Math.sqrt(sum / (values.length - 1));
}

export function silvermanBandwidth(values: readonly number[]): number {
  const finite = getHistogramFiniteValues(values);
  if (finite.length < 2) return 1;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const std = computeStd(finite, mean);
  if (std <= 0) return 1;
  return 1.06 * std * Math.pow(finite.length, -0.2);
}

export interface ComputeKernelDensityInput {
  values: readonly number[];
  xMin: number;
  xMax: number;
  samples?: number;
  bandwidth?: number;
}

export interface KernelDensityPoint {
  x: number;
  density: number;
}

export function computeKernelDensity(
  input: ComputeKernelDensityInput
): KernelDensityPoint[] {
  const finite = getHistogramFiniteValues(input.values);
  if (finite.length < 2) return [];
  const samples = Math.max(
    2,
    Math.floor(input.samples ?? DEFAULT_CHART_HISTOGRAM_DENSITY_SAMPLES)
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
  const out: KernelDensityPoint[] = [];
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

export function getHistogramTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_HISTOGRAM_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const step = (max - min) / (c - 1);
  return Array.from({ length: c }, (_, i) => min + step * i);
}

export interface ComputeHistogramLayoutInput {
  bins: readonly ChartHistogramBin[];
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  xMin: number;
  xMax: number;
  yMax: number;
  binGap: number;
  yMode: ChartHistogramYMode;
}

export function computeHistogramLayout(
  input: ComputeHistogramLayoutInput
): ChartHistogramLayoutBar[] {
  const {
    bins,
    innerW,
    innerH,
    padX,
    padY,
    xMin,
    xMax,
    yMax,
    binGap,
    yMode,
  } = input;
  if (innerW <= 0 || innerH <= 0 || !bins.length) return [];
  const xSpan = xMax - xMin;
  const out: ChartHistogramLayoutBar[] = [];
  for (const b of bins) {
    const xLeft =
      xSpan > 0 ? padX + ((b.start - xMin) / xSpan) * innerW : padX;
    const xRight =
      xSpan > 0 ? padX + ((b.end - xMin) / xSpan) * innerW : padX + innerW;
    const rawW = Math.max(0, xRight - xLeft);
    const gap = Math.min(binGap, rawW / 2);
    const width = Math.max(0, rawW - gap);
    const yValue = yMode === 'density' ? b.density : b.count;
    const ratio = yMax > 0 ? Math.max(0, yValue) / yMax : 0;
    const height = ratio * innerH;
    const y = padY + innerH - height;
    out.push({
      index: b.index,
      start: b.start,
      end: b.end,
      count: b.count,
      density: b.density,
      x: xLeft + gap / 2,
      y,
      width,
      height,
      centerX: (xLeft + xRight) / 2,
      midValue: (b.start + b.end) / 2,
    });
  }
  return out;
}

export function describeHistogram(
  values: readonly number[],
  bins: readonly ChartHistogramBin[],
  formatValue?: (v: number) => string
): string {
  const finite = getHistogramFiniteValues(values);
  if (!finite.length || !bins.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const min = bins[0]!.start;
  const max = bins[bins.length - 1]!.end;
  let peakIdx = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i]!.count > bins[peakIdx]!.count) peakIdx = i;
  }
  const peak = bins[peakIdx]!;
  return `Histogram of ${finite.length} values across ${bins.length} bins, range ${fmt(min)} to ${fmt(max)}. Peak bin ${fmt(peak.start)} to ${fmt(peak.end)} with ${peak.count} values.`;
}

export interface ChartHistogramProps {
  values: readonly number[];
  binCount?: number;
  xMin?: number;
  xMax?: number;
  yMode?: ChartHistogramYMode;
  width?: number;
  height?: number;
  padding?: number;
  binGap?: number;
  tickCount?: number;
  showDensityCurve?: boolean;
  densitySamples?: number;
  bandwidth?: number;
  barColor?: string;
  densityColor?: string;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showXLabel?: boolean;
  showYLabel?: boolean;
  xLabel?: string;
  yLabel?: string;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatRange?: (start: number, end: number) => string;
  onBinClick?: (args: {
    bin: ChartHistogramBin;
    layout: ChartHistogramLayoutBar;
  }) => void;
  style?: CSSProperties;
}

function defaultFormatValue(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.01)) {
    return n.toPrecision(3);
  }
  return String(Math.round(n * 100) / 100);
}

function defaultFormatRange(
  start: number,
  end: number,
  fmt: (v: number) => string
): string {
  return `[${fmt(start)}, ${fmt(end)}]`;
}

const ChartHistogramInner = (
  {
    values,
    binCount,
    xMin,
    xMax,
    yMode = 'count',
    width = DEFAULT_CHART_HISTOGRAM_WIDTH,
    height = DEFAULT_CHART_HISTOGRAM_HEIGHT,
    padding = DEFAULT_CHART_HISTOGRAM_PADDING,
    binGap = DEFAULT_CHART_HISTOGRAM_BIN_GAP,
    tickCount = DEFAULT_CHART_HISTOGRAM_TICK_COUNT,
    showDensityCurve = false,
    densitySamples = DEFAULT_CHART_HISTOGRAM_DENSITY_SAMPLES,
    bandwidth,
    barColor = DEFAULT_CHART_HISTOGRAM_BAR_COLOR,
    densityColor = DEFAULT_CHART_HISTOGRAM_DENSITY_COLOR,
    showTooltip = true,
    showAxisTicks = true,
    showGrid = true,
    showXLabel = true,
    showYLabel = true,
    xLabel,
    yLabel,
    animate = true,
    className,
    ariaLabel = 'Histogram',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatRange,
    onBinClick,
    style,
  }: ChartHistogramProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-histogram-desc-${reactId}`;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const autoBounds = useMemo(() => getHistogramBounds(values), [values]);
  const resolvedXMin = isFiniteNumber(xMin) ? xMin : autoBounds.xMin;
  const resolvedXMax = isFiniteNumber(xMax) ? xMax : autoBounds.xMax;

  const bins = useMemo(
    () =>
      computeHistogramBins({
        values,
        ...(isFiniteNumber(binCount) ? { binCount } : {}),
        xMin: resolvedXMin,
        xMax: resolvedXMax,
      }),
    [values, binCount, resolvedXMin, resolvedXMax]
  );

  const yMax = useMemo(() => {
    if (!bins.length) return 1;
    let m = 0;
    for (const b of bins) {
      const v = yMode === 'density' ? b.density : b.count;
      if (v > m) m = v;
    }
    return m > 0 ? m : 1;
  }, [bins, yMode]);

  const layout = useMemo(
    () =>
      computeHistogramLayout({
        bins,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
        xMin: resolvedXMin,
        xMax: resolvedXMax,
        yMax,
        binGap,
        yMode,
      }),
    [bins, innerW, innerH, padding, resolvedXMin, resolvedXMax, yMax, binGap, yMode]
  );

  const density = useMemo(() => {
    if (!showDensityCurve) return [];
    return computeKernelDensity({
      values,
      xMin: resolvedXMin,
      xMax: resolvedXMax,
      samples: densitySamples,
      ...(isFiniteNumber(bandwidth) ? { bandwidth } : {}),
    });
  }, [showDensityCurve, values, resolvedXMin, resolvedXMax, densitySamples, bandwidth]);

  const densityPath = useMemo(() => {
    if (!density.length) return '';
    const xSpan = resolvedXMax - resolvedXMin;
    const peakDensity = density.reduce(
      (acc, p) => (p.density > acc ? p.density : acc),
      0
    );
    let densityMax = peakDensity;
    if (yMode === 'count') {
      const binWidth =
        bins.length > 0 && bins[0]
          ? bins[0].end - bins[0].start
          : (resolvedXMax - resolvedXMin) / Math.max(1, bins.length);
      const total = getHistogramFiniteValues(values).length;
      densityMax = peakDensity * total * binWidth;
    }
    if (densityMax <= 0) return '';
    const points: string[] = [];
    for (let i = 0; i < density.length; i++) {
      const p = density[i]!;
      const px =
        xSpan > 0
          ? padding + ((p.x - resolvedXMin) / xSpan) * innerW
          : padding + innerW / 2;
      let normalised: number;
      if (yMode === 'density') {
        normalised = p.density / yMax;
      } else {
        const binWidth =
          bins.length > 0 && bins[0]
            ? bins[0].end - bins[0].start
            : (resolvedXMax - resolvedXMin) / Math.max(1, bins.length);
        const total = getHistogramFiniteValues(values).length;
        const expectedCount = p.density * total * binWidth;
        normalised = expectedCount / yMax;
      }
      const py =
        padding + innerH - Math.max(0, Math.min(1, normalised)) * innerH;
      points.push(`${i === 0 ? 'M' : 'L'} ${px} ${py}`);
    }
    return points.join(' ');
  }, [density, resolvedXMin, resolvedXMax, padding, innerW, innerH, yMax, yMode, bins, values]);

  const yTicks = useMemo(
    () => getHistogramTicks(0, yMax, tickCount),
    [yMax, tickCount]
  );
  const xTicks = useMemo(
    () => getHistogramTicks(resolvedXMin, resolvedXMax, tickCount),
    [resolvedXMin, resolvedXMax, tickCount]
  );

  const ySpan = yMax;
  const yPos = (yv: number) =>
    ySpan > 0
      ? padding + innerH - (yv / ySpan) * innerH
      : padding + innerH;
  const xSpan = resolvedXMax - resolvedXMin;
  const xPos = (xv: number) =>
    xSpan > 0
      ? padding + ((xv - resolvedXMin) / xSpan) * innerW
      : padding + innerW / 2;

  const hovered = useMemo(
    () => layout.find((b) => b.index === hoveredIndex) ?? null,
    [layout, hoveredIndex]
  );

  const autoDescription = useMemo(
    () => describeHistogram(values, bins, formatValue),
    [values, bins, formatValue]
  );

  const totalCount = useMemo(
    () => getHistogramFiniteValues(values).length,
    [values]
  );

  const fmtRange = (s: number, e: number) =>
    formatRange ? formatRange(s, e) : defaultFormatRange(s, e, formatValue);

  return (
    <div
      ref={ref}
      data-section="chart-histogram"
      data-value-count={totalCount}
      data-bin-count={bins.length}
      data-y-mode={yMode}
      data-density-overlay={showDensityCurve ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={['chart-histogram flex flex-col gap-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-histogram-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-histogram-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-histogram-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showGrid && (
            <g data-section="chart-histogram-grid" pointerEvents="none">
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-histogram-grid-line"
                    data-axis="y"
                    x1={padding}
                    x2={padding + innerW}
                    y1={y}
                    y2={y}
                    stroke="rgb(226 232 240)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}
          <g data-section="chart-histogram-axes">
            <line
              data-section="chart-histogram-axis"
              data-axis="x"
              x1={padding}
              x2={padding + innerW}
              y1={padding + innerH}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
            <line
              data-section="chart-histogram-axis"
              data-axis="y"
              x1={padding}
              x2={padding}
              y1={padding}
              y2={padding + innerH}
              stroke="rgb(148 163 184)"
              strokeWidth={1}
            />
          </g>
          {showAxisTicks && (
            <g data-section="chart-histogram-ticks" pointerEvents="none">
              {xTicks.map((t, i) => {
                const x = xPos(t);
                return (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-histogram-tick"
                    data-axis="x"
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
                      data-section="chart-histogram-tick-label"
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
              {yTicks.map((t, i) => {
                const y = yPos(t);
                return (
                  <g
                    key={`ty-${i}`}
                    data-section="chart-histogram-tick"
                    data-axis="y"
                  >
                    <line
                      x1={padding - 4}
                      x2={padding}
                      y1={y}
                      y2={y}
                      stroke="rgb(148 163 184)"
                      strokeWidth={1}
                    />
                    <text
                      data-section="chart-histogram-tick-label"
                      x={padding - 8}
                      y={y + 4}
                      textAnchor="end"
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
          {showXLabel && xLabel && (
            <text
              data-section="chart-histogram-x-label"
              x={padding + innerW / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="rgb(71 85 105)"
            >
              {xLabel}
            </text>
          )}
          {showYLabel && yLabel && (
            <text
              data-section="chart-histogram-y-label"
              x={12}
              y={padding + innerH / 2}
              textAnchor="middle"
              fontSize={11}
              fill="rgb(71 85 105)"
              transform={`rotate(-90 12 ${padding + innerH / 2})`}
            >
              {yLabel}
            </text>
          )}
          <g data-section="chart-histogram-bars">
            {layout.map((bar) => {
              const isHovered = hoveredIndex === bar.index;
              return (
                <g
                  key={bar.index}
                  data-section="chart-histogram-bar"
                  data-bin-index={bar.index}
                  data-bin-start={bar.start}
                  data-bin-end={bar.end}
                  data-bin-count={bar.count}
                  data-bin-density={bar.density}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredIndex(bar.index)}
                  onMouseLeave={() =>
                    setHoveredIndex((cur) => (cur === bar.index ? null : cur))
                  }
                  onFocus={() => setHoveredIndex(bar.index)}
                  onBlur={() =>
                    setHoveredIndex((cur) => (cur === bar.index ? null : cur))
                  }
                  onClick={() => {
                    const bin = bins[bar.index];
                    if (bin) onBinClick?.({ bin, layout: bar });
                  }}
                >
                  <rect
                    data-section="chart-histogram-rect"
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    fill={barColor}
                    fillOpacity={0.85}
                    stroke={barColor}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bin ${fmtRange(bar.start, bar.end)}: ${
                      yMode === 'density'
                        ? `density ${formatValue(bar.density)}`
                        : `${bar.count} values`
                    }`}
                  />
                </g>
              );
            })}
          </g>
          {showDensityCurve && densityPath && (
            <path
              data-section="chart-histogram-density"
              d={densityPath}
              fill="none"
              stroke={densityColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-histogram-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-histogram-tooltip-range"
              className="font-semibold"
            >
              {fmtRange(hovered.start, hovered.end)}
            </div>
            <div
              data-section="chart-histogram-tooltip-count"
              className="font-mono text-slate-700"
            >
              count: {hovered.count}
            </div>
            <div
              data-section="chart-histogram-tooltip-density"
              className="font-mono text-slate-500"
            >
              density: {formatValue(hovered.density)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartHistogram = forwardRef<HTMLDivElement, ChartHistogramProps>(
  ChartHistogramInner
);
ChartHistogram.displayName = 'ChartHistogram';
