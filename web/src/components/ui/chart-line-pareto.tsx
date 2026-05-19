import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PARETO_WIDTH = 560;
export const DEFAULT_CHART_LINE_PARETO_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PARETO_PADDING = 48;
export const DEFAULT_CHART_LINE_PARETO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PARETO_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_PARETO_CUMULATIVE_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_PARETO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PARETO_THRESHOLD = 80;
export const DEFAULT_CHART_LINE_PARETO_THRESHOLD_DASH = '6 4';
export const DEFAULT_CHART_LINE_PARETO_CROSSOVER_DASH = '4 3';
export const DEFAULT_CHART_LINE_PARETO_FILL_OPACITY = 0.12;
export const DEFAULT_CHART_LINE_PARETO_VALUE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PARETO_CUMULATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PARETO_THRESHOLD_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_PARETO_VITAL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_PARETO_TRIVIAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PARETO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PARETO_AXIS_COLOR = '#cbd5e1';

export type ChartLineParetoStratum = 'vital' | 'trivial';

export interface ChartLineParetoItem {
  category: string;
  value: number;
}

export interface ChartLineParetoRankedItem {
  category: string;
  value: number;
  originalIndex: number;
  rank: number;
  cumulativeValue: number;
  cumulativePercent: number;
  share: number;
  stratum: ChartLineParetoStratum;
}

export interface ChartLineParetoLayoutPoint {
  rank: number;
  category: string;
  value: number;
  px: number;
  valuePy: number;
  cumulativePy: number;
  cumulativeValue: number;
  cumulativePercent: number;
  share: number;
  stratum: ChartLineParetoStratum;
  originalIndex: number;
}

export interface ChartLineParetoLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerWidth: number;
  innerHeight: number;
  rankMin: number;
  rankMax: number;
  valueMin: number;
  valueMax: number;
  rankTicks: number[];
  valueTicks: number[];
  percentTicks: number[];
  ranked: ChartLineParetoLayoutPoint[];
  valuePath: string;
  cumulativePath: string;
  vitalFillPath: string;
  thresholdPy: number;
  crossoverRank: number;
  crossoverPx: number;
  vitalFewCount: number;
  trivialManyCount: number;
  finiteCount: number;
  totalCount: number;
  totalValue: number;
  threshold: number;
}

export interface ComputeLineParetoLayoutOptions {
  data: readonly ChartLineParetoItem[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  threshold?: number;
  valueMin?: number;
  valueMax?: number;
}

export interface ChartLineParetoProps {
  data: readonly ChartLineParetoItem[];
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  cumulativeStrokeWidth?: number;
  dotRadius?: number;
  thresholdDashArray?: string;
  crossoverDashArray?: string;
  fillOpacity?: number;
  valueColor?: string;
  cumulativeColor?: string;
  thresholdColor?: string;
  vitalColor?: string;
  trivialColor?: string;
  gridColor?: string;
  axisColor?: string;
  valueMin?: number;
  valueMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showVitalFewBadge?: boolean;
  showVitalFewFill?: boolean;
  showCrossover?: boolean;
  showThresholdLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatPercent?: (n: number) => string;
  formatCategory?: (s: string, rank: number) => string;
  xLabel?: string;
  yLabel?: string;
  percentLabel?: string;
  valueLabel?: string;
  cumulativeLabel?: string;
  onPointClick?: (payload: {
    point: ChartLineParetoLayoutPoint;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineParetoFiniteItems(
  items: readonly ChartLineParetoItem[] | null | undefined,
): ChartLineParetoItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it): it is ChartLineParetoItem =>
      !!it &&
      typeof it.category === 'string' &&
      isFiniteNumber(it.value) &&
      it.value >= 0,
  );
}

export function normaliseLineParetoThreshold(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_PARETO_THRESHOLD;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return value;
}

export function rankLineParetoItems(
  items: readonly ChartLineParetoItem[] | null | undefined,
  threshold = DEFAULT_CHART_LINE_PARETO_THRESHOLD,
): ChartLineParetoRankedItem[] {
  const finite = getLineParetoFiniteItems(items);
  if (finite.length === 0) return [];
  const t = normaliseLineParetoThreshold(threshold);
  const withIdx = finite.map((it, originalIndex) => ({ ...it, originalIndex }));
  const sorted = [...withIdx].sort((a, b) => b.value - a.value);
  let total = 0;
  for (const it of sorted) total += it.value;

  const out: ChartLineParetoRankedItem[] = [];
  let running = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const it = sorted[i]!;
    running += it.value;
    const cumulativePercent = total > 0 ? (running / total) * 100 : 0;
    const share = total > 0 ? (it.value / total) * 100 : 0;
    // Vital-few = items whose cumulative percent (inclusive) is <= threshold,
    // PLUS the first item that crosses the threshold (the boundary item itself
    // is part of the vital few because removing it puts cumulative below
    // threshold). For threshold=0 -> no vital few.
    let stratum: ChartLineParetoStratum;
    if (t <= 0) stratum = 'trivial';
    else if (cumulativePercent <= t) stratum = 'vital';
    else {
      const prev = out[out.length - 1];
      if (!prev || prev.cumulativePercent < t) stratum = 'vital';
      else stratum = 'trivial';
    }
    out.push({
      category: it.category,
      value: it.value,
      originalIndex: it.originalIndex,
      rank: i,
      cumulativeValue: running,
      cumulativePercent,
      share,
      stratum,
    });
  }
  return out;
}

export function findLineParetoCrossover(
  ranked: readonly ChartLineParetoRankedItem[] | null | undefined,
  threshold = DEFAULT_CHART_LINE_PARETO_THRESHOLD,
): { rank: number; cumulativePercent: number } {
  if (!Array.isArray(ranked) || ranked.length === 0) {
    return { rank: -1, cumulativePercent: 0 };
  }
  const t = normaliseLineParetoThreshold(threshold);
  if (t <= 0) {
    return { rank: 0, cumulativePercent: ranked[0]!.cumulativePercent };
  }
  for (const r of ranked) {
    if (r.cumulativePercent >= t) {
      return { rank: r.rank, cumulativePercent: r.cumulativePercent };
    }
  }
  const last = ranked[ranked.length - 1]!;
  return { rank: last.rank, cumulativePercent: last.cumulativePercent };
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

function emptyLayout(
  width: number,
  height: number,
  padding: number,
  threshold: number,
): ChartLineParetoLayout {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    ok: false,
    width,
    height,
    padding,
    innerWidth,
    innerHeight,
    rankMin: 0,
    rankMax: 0,
    valueMin: 0,
    valueMax: 0,
    rankTicks: [],
    valueTicks: [],
    percentTicks: [],
    ranked: [],
    valuePath: '',
    cumulativePath: '',
    vitalFillPath: '',
    thresholdPy: padding,
    crossoverRank: -1,
    crossoverPx: padding,
    vitalFewCount: 0,
    trivialManyCount: 0,
    finiteCount: 0,
    totalCount: 0,
    totalValue: 0,
    threshold,
  };
}

export function computeLineParetoLayout(
  options: ComputeLineParetoLayoutOptions,
): ChartLineParetoLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_PARETO_TICK_COUNT,
    threshold: thresholdOpt,
    valueMin: valueMinOverride,
    valueMax: valueMaxOverride,
  } = options;

  const threshold = normaliseLineParetoThreshold(thresholdOpt);
  const empty = emptyLayout(width, height, padding, threshold);
  if (empty.innerWidth <= 0 || empty.innerHeight <= 0) return empty;

  const ranked = rankLineParetoItems(data, threshold);
  const totalCount = Array.isArray(data) ? data.length : 0;
  if (ranked.length === 0) return empty;

  let totalValue = 0;
  for (const r of ranked) totalValue += r.value;

  let vLo = 0;
  let vHi = ranked[0]!.value;
  for (const r of ranked) {
    if (r.value > vHi) vHi = r.value;
  }
  if (isFiniteNumber(valueMinOverride)) vLo = valueMinOverride;
  if (isFiniteNumber(valueMaxOverride)) vHi = valueMaxOverride;
  if (vLo === vHi) {
    vLo -= 0.5;
    vHi += 0.5;
  }

  const rankMin = 0;
  const rankMax = Math.max(0, ranked.length - 1);
  const rankRange = rankMax - rankMin === 0 ? 1 : rankMax - rankMin;
  const valueRange = vHi - vLo;
  const innerWidth = empty.innerWidth;
  const innerHeight = empty.innerHeight;

  const projectX = (rank: number): number =>
    padding + ((rank - rankMin) / rankRange) * innerWidth;
  const projectValue = (v: number): number =>
    padding + innerHeight - ((v - vLo) / valueRange) * innerHeight;
  const projectPercent = (p: number): number =>
    padding + innerHeight - (p / 100) * innerHeight;

  let vitalFewCount = 0;
  let trivialManyCount = 0;
  const layoutPoints: ChartLineParetoLayoutPoint[] = ranked.map((r) => {
    if (r.stratum === 'vital') vitalFewCount += 1;
    else trivialManyCount += 1;
    return {
      rank: r.rank,
      category: r.category,
      value: r.value,
      px: projectX(r.rank),
      valuePy: projectValue(r.value),
      cumulativePy: projectPercent(r.cumulativePercent),
      cumulativeValue: r.cumulativeValue,
      cumulativePercent: r.cumulativePercent,
      share: r.share,
      stratum: r.stratum,
      originalIndex: r.originalIndex,
    };
  });

  const buildPath = (
    pts: readonly { px: number; py: number }[],
  ): string => {
    if (pts.length === 0) return '';
    const parts: string[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]!;
      const cmd = i === 0 ? 'M' : 'L';
      parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
    }
    return parts.join(' ');
  };

  const valuePath = buildPath(
    layoutPoints.map((p) => ({ px: p.px, py: p.valuePy })),
  );
  const cumulativePath = buildPath(
    layoutPoints.map((p) => ({ px: p.px, py: p.cumulativePy })),
  );

  const crossover = findLineParetoCrossover(ranked, threshold);
  const crossoverPx =
    crossover.rank >= 0 ? projectX(crossover.rank) : padding;

  const thresholdPy = projectPercent(threshold);

  // vital-few fill: rectangle from x=padding to x=crossoverPx, full height of
  // the value panel. Empty when no vital-few items.
  let vitalFillPath = '';
  if (vitalFewCount > 0) {
    const x0 = padding;
    const x1 = crossoverPx;
    const y0 = padding;
    const y1 = padding + innerHeight;
    vitalFillPath = `M ${x0.toFixed(3)} ${y0.toFixed(3)} L ${x1.toFixed(3)} ${y0.toFixed(3)} L ${x1.toFixed(3)} ${y1.toFixed(3)} L ${x0.toFixed(3)} ${y1.toFixed(3)} Z`;
  }

  return {
    ok: true,
    width,
    height,
    padding,
    innerWidth,
    innerHeight,
    rankMin,
    rankMax,
    valueMin: vLo,
    valueMax: vHi,
    rankTicks: computeTicks(rankMin, rankMax, Math.min(tickCount, ranked.length)),
    valueTicks: computeTicks(vLo, vHi, tickCount),
    percentTicks: computeTicks(0, 100, 5),
    ranked: layoutPoints,
    valuePath,
    cumulativePath,
    vitalFillPath,
    thresholdPy,
    crossoverRank: crossover.rank,
    crossoverPx,
    vitalFewCount,
    trivialManyCount,
    finiteCount: ranked.length,
    totalCount,
    totalValue,
    threshold,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatPercent(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return `${n.toFixed(1)}%`;
}

function defaultFormatCategory(s: string): string {
  return s;
}

export function describeLineParetoChart(
  data: readonly ChartLineParetoItem[] | null | undefined,
  options?: {
    threshold?: number;
    formatValue?: (n: number) => string;
    formatPercent?: (n: number) => string;
  },
): string {
  const fmt = options?.formatValue ?? defaultFormatValue;
  const pct = options?.formatPercent ?? defaultFormatPercent;
  const ranked = rankLineParetoItems(data, options?.threshold);
  if (ranked.length === 0) return 'No data';
  const t = normaliseLineParetoThreshold(options?.threshold);
  const crossover = findLineParetoCrossover(ranked, t);
  const vitalCount = ranked.filter((r) => r.stratum === 'vital').length;
  let total = 0;
  for (const r of ranked) total += r.value;
  return `Pareto chart of ${ranked.length} items totalling ${fmt(total)}. ${vitalCount} vital few drive ${pct(crossover.cumulativePercent)} (threshold ${pct(t)}).`;
}

export const ChartLinePareto = forwardRef<
  HTMLDivElement,
  ChartLineParetoProps
>(function ChartLinePareto(
  props: ChartLineParetoProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    threshold = DEFAULT_CHART_LINE_PARETO_THRESHOLD,
    width = DEFAULT_CHART_LINE_PARETO_WIDTH,
    height = DEFAULT_CHART_LINE_PARETO_HEIGHT,
    padding = DEFAULT_CHART_LINE_PARETO_PADDING,
    tickCount = DEFAULT_CHART_LINE_PARETO_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PARETO_STROKE_WIDTH,
    cumulativeStrokeWidth = DEFAULT_CHART_LINE_PARETO_CUMULATIVE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PARETO_DOT_RADIUS,
    thresholdDashArray = DEFAULT_CHART_LINE_PARETO_THRESHOLD_DASH,
    crossoverDashArray = DEFAULT_CHART_LINE_PARETO_CROSSOVER_DASH,
    fillOpacity = DEFAULT_CHART_LINE_PARETO_FILL_OPACITY,
    valueColor = DEFAULT_CHART_LINE_PARETO_VALUE_COLOR,
    cumulativeColor = DEFAULT_CHART_LINE_PARETO_CUMULATIVE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_PARETO_THRESHOLD_COLOR,
    vitalColor = DEFAULT_CHART_LINE_PARETO_VITAL_COLOR,
    trivialColor = DEFAULT_CHART_LINE_PARETO_TRIVIAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_PARETO_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PARETO_AXIS_COLOR,
    valueMin,
    valueMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showVitalFewBadge = true,
    showVitalFewFill = true,
    showCrossover = true,
    showThresholdLine = true,
    animate = true,
    className,
    ariaLabel = 'Pareto chart with cumulative percentage overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    formatCategory = defaultFormatCategory,
    xLabel,
    yLabel,
    percentLabel = 'Cumulative %',
    valueLabel = 'Value',
    cumulativeLabel = 'Cumulative',
    onPointClick,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const layout = useMemo(
    () =>
      computeLineParetoLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        threshold,
        ...(isFiniteNumber(valueMin) ? { valueMin } : {}),
        ...(isFiniteNumber(valueMax) ? { valueMax } : {}),
      }),
    [data, width, height, padding, tickCount, threshold, valueMin, valueMax],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineParetoChart(data, {
        threshold,
        formatValue,
        formatPercent,
      }),
    [ariaDescription, data, threshold, formatValue, formatPercent],
  );

  const [hoverRank, setHoverRank] = useState<number | null>(null);
  const clearHover = useCallback(() => setHoverRank(null), []);

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-pareto"
        data-empty="true"
        data-total-points={0}
        data-vital-few-count={0}
        data-threshold={normaliseLineParetoThreshold(threshold)}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-pareto-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const subBottom = padding + layout.innerHeight;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-pareto"
      data-empty="false"
      data-total-points={layout.finiteCount}
      data-vital-few-count={layout.vitalFewCount}
      data-trivial-many-count={layout.trivialManyCount}
      data-crossover-rank={layout.crossoverRank}
      data-threshold={layout.threshold}
      data-total-value={layout.totalValue}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-pareto-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-pareto-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showVitalFewBadge && layout.vitalFewCount > 0 ? (
          <div
            data-section="chart-line-pareto-badge"
            data-vital-few-count={layout.vitalFewCount}
            data-crossover-rank={layout.crossoverRank}
            data-threshold={layout.threshold}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: vitalColor,
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-pareto-badge-icon"
              aria-hidden="true"
            >
              ★
            </span>
            <span data-section="chart-line-pareto-badge-count">
              {layout.vitalFewCount}
            </span>
            <span data-section="chart-line-pareto-badge-label">
              vital few drive {formatPercent(layout.threshold)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-pareto-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-pareto-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.valueTicks.map((t, i) => {
                const py =
                  padding +
                  layout.innerHeight -
                  ((t - layout.valueMin) /
                    (layout.valueMax - layout.valueMin)) *
                    layout.innerHeight;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-pareto-grid-line"
                    data-axis="y"
                    x1={padding}
                    x2={padding + layout.innerWidth}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.rankTicks.map((t, i) => {
                const px =
                  padding +
                  ((t - layout.rankMin) /
                    Math.max(1, layout.rankMax - layout.rankMin)) *
                    layout.innerWidth;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-pareto-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={padding}
                    y2={padding + layout.innerHeight}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-pareto-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-pareto-axis"
                data-axis="x"
                x1={padding}
                y1={subBottom}
                x2={padding + layout.innerWidth}
                y2={subBottom}
              />
              <line
                data-section="chart-line-pareto-axis"
                data-axis="y"
                data-side="left"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={subBottom}
              />
              <line
                data-section="chart-line-pareto-axis"
                data-axis="y"
                data-side="right"
                x1={padding + layout.innerWidth}
                y1={padding}
                x2={padding + layout.innerWidth}
                y2={subBottom}
              />
              <g data-section="chart-line-pareto-ticks" data-axis="x">
                {layout.ranked.map((p) => (
                  <g
                    key={`tx-${p.rank}`}
                    data-section="chart-line-pareto-tick"
                    data-axis="x"
                    data-rank={p.rank}
                  >
                    <line
                      x1={p.px}
                      x2={p.px}
                      y1={subBottom}
                      y2={subBottom + 4}
                    />
                    <text
                      data-section="chart-line-pareto-tick-label"
                      data-axis="x"
                      data-rank={p.rank}
                      x={p.px}
                      y={subBottom + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatCategory(p.category, p.rank)}
                    </text>
                  </g>
                ))}
              </g>
              <g
                data-section="chart-line-pareto-ticks"
                data-axis="y"
                data-side="left"
              >
                {layout.valueTicks.map((t, i) => {
                  const py =
                    padding +
                    layout.innerHeight -
                    ((t - layout.valueMin) /
                      (layout.valueMax - layout.valueMin)) *
                      layout.innerHeight;
                  return (
                    <g
                      key={`tyl-${i}`}
                      data-section="chart-line-pareto-tick"
                      data-axis="y"
                      data-side="left"
                    >
                      <line x1={padding - 4} x2={padding} y1={py} y2={py} />
                      <text
                        data-section="chart-line-pareto-tick-label"
                        data-axis="y"
                        data-side="left"
                        x={padding - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g
                data-section="chart-line-pareto-ticks"
                data-axis="y"
                data-side="right"
              >
                {layout.percentTicks.map((t, i) => {
                  const py = padding + layout.innerHeight - (t / 100) * layout.innerHeight;
                  return (
                    <g
                      key={`tyr-${i}`}
                      data-section="chart-line-pareto-tick"
                      data-axis="y"
                      data-side="right"
                    >
                      <line
                        x1={padding + layout.innerWidth}
                        x2={padding + layout.innerWidth + 4}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-pareto-tick-label"
                        data-axis="y"
                        data-side="right"
                        x={padding + layout.innerWidth + 6}
                        y={py + 3}
                        textAnchor="start"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatPercent(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-pareto-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-pareto-y-label"
                  data-side="left"
                  transform={`rotate(-90 12 ${padding + layout.innerHeight / 2})`}
                  x={12}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
              <text
                data-section="chart-line-pareto-percent-label"
                data-side="right"
                transform={`rotate(90 ${width - 12} ${padding + layout.innerHeight / 2})`}
                x={width - 12}
                y={padding + layout.innerHeight / 2}
                textAnchor="middle"
                fontSize={11}
                fill={axisColor}
                stroke="none"
              >
                {percentLabel}
              </text>
            </g>
          ) : null}

          {showVitalFewFill && layout.vitalFillPath ? (
            <path
              data-section="chart-line-pareto-vital-fill"
              data-vital-few-count={layout.vitalFewCount}
              d={layout.vitalFillPath}
              fill={vitalColor}
              fillOpacity={fillOpacity}
              stroke="none"
              pointerEvents="none"
            />
          ) : null}

          {showThresholdLine ? (
            <line
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Pareto threshold reference at ${formatPercent(layout.threshold)} cumulative`}
              data-section="chart-line-pareto-threshold"
              data-value={layout.threshold}
              x1={padding}
              x2={padding + layout.innerWidth}
              y1={layout.thresholdPy}
              y2={layout.thresholdPy}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray={thresholdDashArray}
            />
          ) : null}

          {showCrossover && layout.crossoverRank >= 0 ? (
            <line
              role="graphics-symbol"
              aria-label={`Pareto vital-few crossover at rank ${layout.crossoverRank + 1}`}
              data-section="chart-line-pareto-crossover"
              data-rank={layout.crossoverRank}
              x1={layout.crossoverPx}
              x2={layout.crossoverPx}
              y1={padding}
              y2={subBottom}
              stroke={vitalColor}
              strokeWidth={1}
              strokeDasharray={crossoverDashArray}
            />
          ) : null}

          {layout.valuePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`${valueLabel} ranked descending`}
              data-section="chart-line-pareto-value-path"
              data-kind="value"
              d={layout.valuePath}
              fill="none"
              stroke={valueColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {layout.cumulativePath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`${cumulativeLabel} percentage overlay`}
              data-section="chart-line-pareto-cumulative-path"
              data-kind="cumulative"
              d={layout.cumulativePath}
              fill="none"
              stroke={cumulativeColor}
              strokeWidth={cumulativeStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {showDots
            ? layout.ranked.map((p) => {
                const isHover = hoverRank === p.rank;
                const dotColor = p.stratum === 'vital' ? vitalColor : trivialColor;
                return (
                  <g
                    key={`g-${p.rank}`}
                    data-section="chart-line-pareto-point-group"
                    data-rank={p.rank}
                    data-stratum={p.stratum}
                  >
                    <circle
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${formatCategory(p.category, p.rank)} rank ${p.rank + 1} value ${formatValue(p.value)} cumulative ${formatPercent(p.cumulativePercent)} ${p.stratum}`}
                      data-section="chart-line-pareto-dot"
                      data-kind="value"
                      data-rank={p.rank}
                      data-category={p.category}
                      data-value={p.value}
                      data-cumulative-percent={p.cumulativePercent}
                      data-share={p.share}
                      data-stratum={p.stratum}
                      data-hovered={isHover ? 'true' : 'false'}
                      cx={p.px}
                      cy={p.valuePy}
                      r={isHover ? dotRadius + 1 : dotRadius}
                      fill={dotColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => setHoverRank(p.rank)}
                      onMouseLeave={clearHover}
                      onFocus={() => setHoverRank(p.rank)}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: p })}
                    />
                    <circle
                      role="graphics-symbol"
                      aria-hidden="true"
                      data-section="chart-line-pareto-dot"
                      data-kind="cumulative"
                      data-rank={p.rank}
                      data-cumulative-percent={p.cumulativePercent}
                      data-stratum={p.stratum}
                      cx={p.px}
                      cy={p.cumulativePy}
                      r={dotRadius - 0.5}
                      fill={cumulativeColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                  </g>
                );
              })
            : null}
        </svg>

        {showTooltip && hoverRank !== null && layout.ranked[hoverRank]
          ? (() => {
              const p = layout.ranked[hoverRank]!;
              const tipColor = p.stratum === 'vital' ? vitalColor : trivialColor;
              return (
                <div
                  data-section="chart-line-pareto-tooltip"
                  data-rank={p.rank}
                  data-stratum={p.stratum}
                  style={{
                    position: 'absolute',
                    left: p.px + 8,
                    top: p.valuePy + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 160,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-pareto-tooltip-label"
                    style={{ color: valueColor, fontWeight: 600 }}
                  >
                    {formatCategory(p.category, p.rank)}
                  </div>
                  <div data-section="chart-line-pareto-tooltip-rank">
                    rank: {p.rank + 1}
                  </div>
                  <div
                    data-section="chart-line-pareto-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(p.value)} ({formatPercent(p.share)})
                  </div>
                  <div data-section="chart-line-pareto-tooltip-cumulative">
                    cumulative: {formatPercent(p.cumulativePercent)}
                  </div>
                  <div
                    data-section="chart-line-pareto-tooltip-stratum"
                    style={{ color: tipColor }}
                  >
                    {p.stratum === 'vital' ? 'vital few' : 'trivial many'}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-pareto-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
            fontSize: 11,
          }}
        >
          <span
            data-section="chart-line-pareto-legend-item"
            data-kind="value"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              data-section="chart-line-pareto-legend-swatch"
              data-kind="value"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: valueColor,
              }}
            />
            <span data-section="chart-line-pareto-legend-label">
              {valueLabel}
            </span>
          </span>
          <span
            data-section="chart-line-pareto-legend-item"
            data-kind="cumulative"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              data-section="chart-line-pareto-legend-swatch"
              data-kind="cumulative"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: cumulativeColor,
              }}
            />
            <span data-section="chart-line-pareto-legend-label">
              {cumulativeLabel}
            </span>
          </span>
          <span
            data-section="chart-line-pareto-legend-item"
            data-kind="vital"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span
              data-section="chart-line-pareto-legend-swatch"
              data-kind="vital"
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                background: vitalColor,
              }}
            />
            <span data-section="chart-line-pareto-legend-label">
              Vital few ({layout.vitalFewCount})
            </span>
          </span>
          <span
            data-section="chart-line-pareto-legend-total"
            style={{ color: '#64748b' }}
          >
            {layout.finiteCount} items; total {formatValue(layout.totalValue)}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLinePareto.displayName = 'ChartLinePareto';
