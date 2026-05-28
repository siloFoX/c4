import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ICHIMOKU_WIDTH = 620;
export const DEFAULT_CHART_LINE_ICHIMOKU_HEIGHT = 340;
export const DEFAULT_CHART_LINE_ICHIMOKU_PADDING = 40;
export const DEFAULT_CHART_LINE_ICHIMOKU_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ICHIMOKU_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ICHIMOKU_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_CONVERSION_PERIOD = 9;
export const DEFAULT_CHART_LINE_ICHIMOKU_BASE_PERIOD = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_LEADING_PERIOD = 52;
export const DEFAULT_CHART_LINE_ICHIMOKU_DISPLACEMENT = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_CHIKOU_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ICHIMOKU_SPAN_A_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_SPAN_B_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_ICHIMOKU_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ICHIMOKU_AXIS_COLOR = '#cbd5e1';

export interface ChartLineIchimokuPoint {
  x: number;
  value: number;
}

export interface ChartLineIchimokuShifted {
  index: number;
  x: number;
  value: number;
}

export interface ChartLineIchimokuCloudSample {
  index: number;
  x: number;
  spanA: number;
  spanB: number;
  bullish: boolean;
}

export interface ChartLineIchimokuRun {
  series: ChartLineIchimokuPoint[];
  conversionPeriod: number;
  basePeriod: number;
  leadingPeriod: number;
  displacement: number;
  tenkan: (number | null)[];
  kijun: (number | null)[];
  spanA: ChartLineIchimokuShifted[];
  spanB: ChartLineIchimokuShifted[];
  chikou: ChartLineIchimokuShifted[];
  cloud: ChartLineIchimokuCloudSample[];
  bullishCount: number;
  bearishCount: number;
  ok: boolean;
}

export interface ChartLineIchimokuPriceDot {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
  tenkan: number | null;
  kijun: number | null;
}

export interface ChartLineIchimokuCloudSegment {
  index: number;
  bullish: boolean;
  polygon: string;
}

export interface ChartLineIchimokuLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  pricePath: string;
  priceDots: ChartLineIchimokuPriceDot[];
  tenkanPath: string;
  kijunPath: string;
  chikouPath: string;
  spanAPath: string;
  spanBPath: string;
  cloudSegments: ChartLineIchimokuCloudSegment[];
  conversionPeriod: number;
  basePeriod: number;
  leadingPeriod: number;
  displacement: number;
  bullishCount: number;
  bearishCount: number;
  totalPoints: number;
}

export interface ComputeLineIchimokuLayoutOptions {
  data: readonly ChartLineIchimokuPoint[];
  conversionPeriod?: number;
  basePeriod?: number;
  leadingPeriod?: number;
  displacement?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
}

export interface ChartLineIchimokuProps {
  data: readonly ChartLineIchimokuPoint[];
  conversionPeriod?: number;
  basePeriod?: number;
  leadingPeriod?: number;
  displacement?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  tenkanColor?: string;
  kijunColor?: string;
  chikouColor?: string;
  spanAColor?: string;
  spanBColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCloud?: boolean;
  showTenkan?: boolean;
  showKijun?: boolean;
  showChikou?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: { point: ChartLineIchimokuPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineIchimokuFinitePoints(
  points: readonly ChartLineIchimokuPoint[] | null | undefined,
): ChartLineIchimokuPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineIchimokuPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineIchimokuPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The Ichimoku midline: `(highest + lowest) / 2` over a trailing
 * window of `period` values. Entries before the window is full are
 * `null`. This is the donchian-midpoint formula behind every
 * Ichimoku line.
 */
export function computeLineIchimokuMidline(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const k = period < 1 ? 1 : Math.floor(period);
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < k - 1) {
      result.push(null);
      continue;
    }
    let mx = Number.NEGATIVE_INFINITY;
    let mn = Number.POSITIVE_INFINITY;
    for (let j = i - k + 1; j <= i; j += 1) {
      const v = values[j]!;
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    result.push((mx + mn) / 2);
  }
  return result;
}

export function runLineIchimoku(
  points: readonly ChartLineIchimokuPoint[] | null | undefined,
  options?: {
    conversionPeriod?: number;
    basePeriod?: number;
    leadingPeriod?: number;
    displacement?: number;
  },
): ChartLineIchimokuRun {
  const finite = getLineIchimokuFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const conversionPeriod = normalizeLineIchimokuPeriod(
    options?.conversionPeriod ?? DEFAULT_CHART_LINE_ICHIMOKU_CONVERSION_PERIOD,
    DEFAULT_CHART_LINE_ICHIMOKU_CONVERSION_PERIOD,
  );
  const basePeriod = normalizeLineIchimokuPeriod(
    options?.basePeriod ?? DEFAULT_CHART_LINE_ICHIMOKU_BASE_PERIOD,
    DEFAULT_CHART_LINE_ICHIMOKU_BASE_PERIOD,
  );
  const leadingPeriod = normalizeLineIchimokuPeriod(
    options?.leadingPeriod ?? DEFAULT_CHART_LINE_ICHIMOKU_LEADING_PERIOD,
    DEFAULT_CHART_LINE_ICHIMOKU_LEADING_PERIOD,
  );
  const displacement = normalizeLineIchimokuPeriod(
    options?.displacement ?? DEFAULT_CHART_LINE_ICHIMOKU_DISPLACEMENT,
    DEFAULT_CHART_LINE_ICHIMOKU_DISPLACEMENT,
  );
  const n = series.length;

  const baseRun: ChartLineIchimokuRun = {
    series = [],
    conversionPeriod,
    basePeriod,
    leadingPeriod,
    displacement,
    tenkan: [],
    kijun: [],
    spanA: [],
    spanB: [],
    chikou: [],
    cloud: [],
    bullishCount: 0,
    bearishCount: 0,
    ok: false,
  };
  if (n < 2) return baseRun;

  const values = series.map((p) => p.value);
  const avgStep = (series[n - 1]!.x - series[0]!.x) / (n - 1);
  const displacedX = (j: number): number => {
    if (j >= 0 && j <= n - 1) return series[j]!.x;
    if (j < 0) return series[0]!.x + j * avgStep;
    return series[n - 1]!.x + (j - (n - 1)) * avgStep;
  };

  const tenkan = computeLineIchimokuMidline(values, conversionPeriod);
  const kijun = computeLineIchimokuMidline(values, basePeriod);
  const spanBRaw = computeLineIchimokuMidline(values, leadingPeriod);
  const spanARaw: (number | null)[] = tenkan.map((t, i) =>
    t !== null && kijun[i] !== null ? (t + kijun[i]!) / 2 : null,
  );

  const spanA: ChartLineIchimokuShifted[] = [];
  const spanB: ChartLineIchimokuShifted[] = [];
  for (let i = 0; i < n; i += 1) {
    if (spanARaw[i] !== null) {
      spanA.push({ index: i, x: displacedX(i + displacement), value: spanARaw[i]! });
    }
    if (spanBRaw[i] !== null) {
      spanB.push({ index: i, x: displacedX(i + displacement), value: spanBRaw[i]! });
    }
  }
  const chikou: ChartLineIchimokuShifted[] = series.map((p, i) => ({
    index: i,
    x: displacedX(i - displacement),
    value: p.value,
  }));

  const cloud: ChartLineIchimokuCloudSample[] = [];
  let bullishCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (spanARaw[i] !== null && spanBRaw[i] !== null) {
      const a = spanARaw[i]!;
      const b = spanBRaw[i]!;
      const bullish = a >= b;
      if (bullish) bullishCount += 1;
      cloud.push({
        index: i,
        x: displacedX(i + displacement),
        spanA: a,
        spanB: b,
        bullish,
      });
    }
  }

  return {
    ...baseRun,
    tenkan,
    kijun,
    spanA,
    spanB,
    chikou,
    cloud,
    bullishCount,
    bearishCount: cloud.length - bullishCount,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineIchimokuLayout(
  options: ComputeLineIchimokuLayoutOptions,
): ChartLineIchimokuLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_TICK_COUNT,
    hiddenSeries,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const run = runLineIchimoku(data, {
    ...(isFiniteNumber(options.conversionPeriod)
      ? { conversionPeriod: options.conversionPeriod }
      : {}),
    ...(isFiniteNumber(options.basePeriod)
      ? { basePeriod: options.basePeriod }
      : {}),
    ...(isFiniteNumber(options.leadingPeriod)
      ? { leadingPeriod: options.leadingPeriod }
      : {}),
    ...(isFiniteNumber(options.displacement)
      ? { displacement: options.displacement }
      : {}),
  });
  const empty: ChartLineIchimokuLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    pricePath: '',
    priceDots: [],
    tenkanPath: '',
    kijunPath: '',
    chikouPath: '',
    spanAPath: '',
    spanBPath: '',
    cloudSegments: [],
    conversionPeriod: run.conversionPeriod,
    basePeriod: run.basePeriod,
    leadingPeriod: run.leadingPeriod,
    displacement: run.displacement,
    bullishCount: 0,
    bearishCount: 0,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const cloudHidden = hidden.has('cloud');
  const chikouHidden = hidden.has('chikou');

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  const considerX = (x: number): void => {
    if (x < xLo) xLo = x;
    if (x > xHi) xHi = x;
  };
  const considerY = (v: number): void => {
    if (v < yLo) yLo = v;
    if (v > yHi) yHi = v;
  };
  for (const p of run.series) {
    considerX(p.x);
    considerY(p.value);
  }
  for (const t of run.tenkan) if (t !== null) considerY(t);
  for (const k of run.kijun) if (k !== null) considerY(k);
  if (!cloudHidden) {
    for (const s of run.spanA) {
      considerX(s.x);
      considerY(s.value);
    }
    for (const s of run.spanB) {
      considerX(s.x);
      considerY(s.value);
    }
  }
  if (!chikouHidden) {
    for (const c of run.chikou) {
      considerX(c.x);
      considerY(c.value);
    }
  }

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineIchimokuPriceDot[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: projectX(p.x),
    py: projectY(p.value),
    tenkan: run.tenkan[i] ?? null,
    kijun: run.kijun[i] ?? null,
  }));

  const tenkanPts: { px: number; py: number }[] = [];
  const kijunPts: { px: number; py: number }[] = [];
  run.series.forEach((p, i) => {
    if (run.tenkan[i] !== null) {
      tenkanPts.push({ px: projectX(p.x), py: projectY(run.tenkan[i]!) });
    }
    if (run.kijun[i] !== null) {
      kijunPts.push({ px: projectX(p.x), py: projectY(run.kijun[i]!) });
    }
  });

  const cloudSegments: ChartLineIchimokuCloudSegment[] = [];
  for (let k = 0; k < run.cloud.length - 1; k += 1) {
    const a = run.cloud[k]!;
    const b = run.cloud[k + 1]!;
    const ax = projectX(a.x);
    const bx = projectX(b.x);
    const polygon = `${ax.toFixed(3)},${projectY(a.spanA).toFixed(3)} ${bx.toFixed(3)},${projectY(b.spanA).toFixed(3)} ${bx.toFixed(3)},${projectY(b.spanB).toFixed(3)} ${ax.toFixed(3)},${projectY(a.spanB).toFixed(3)}`;
    cloudSegments.push({ index: a.index, bullish: a.bullish, polygon });
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    tenkanPath: buildPath(tenkanPts),
    kijunPath: buildPath(kijunPts),
    chikouPath: buildPath(
      run.chikou.map((c) => ({ px: projectX(c.x), py: projectY(c.value) })),
    ),
    spanAPath: buildPath(
      run.spanA.map((s) => ({ px: projectX(s.x), py: projectY(s.value) })),
    ),
    spanBPath: buildPath(
      run.spanB.map((s) => ({ px: projectX(s.x), py: projectY(s.value) })),
    ),
    cloudSegments,
    conversionPeriod: run.conversionPeriod,
    basePeriod: run.basePeriod,
    leadingPeriod: run.leadingPeriod,
    displacement: run.displacement,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
    totalPoints: run.series.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineIchimokuChart(
  data: readonly ChartLineIchimokuPoint[] | null | undefined,
  options?: {
    conversionPeriod?: number;
    basePeriod?: number;
    leadingPeriod?: number;
    displacement?: number;
  },
): string {
  const run = runLineIchimoku(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ichimoku Kinko Hyo overlay -- conversion, base and leading-span cloud (kumo) at periods ${run.conversionPeriod}/${run.basePeriod}/${run.leadingPeriod}, displacement ${run.displacement}: ${run.bullishCount} bullish vs ${run.bearishCount} bearish cloud samples.`;
}

const ICHIMOKU_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineIchimoku = forwardRef<
  HTMLDivElement,
  ChartLineIchimokuProps
>(function ChartLineIchimoku(
  props: ChartLineIchimokuProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    conversionPeriod,
    basePeriod,
    leadingPeriod,
    displacement,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ICHIMOKU_WIDTH,
    height = DEFAULT_CHART_LINE_ICHIMOKU_HEIGHT,
    padding = DEFAULT_CHART_LINE_ICHIMOKU_PADDING,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ICHIMOKU_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ICHIMOKU_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ICHIMOKU_PRICE_COLOR,
    tenkanColor = DEFAULT_CHART_LINE_ICHIMOKU_TENKAN_COLOR,
    kijunColor = DEFAULT_CHART_LINE_ICHIMOKU_KIJUN_COLOR,
    chikouColor = DEFAULT_CHART_LINE_ICHIMOKU_CHIKOU_COLOR,
    spanAColor = DEFAULT_CHART_LINE_ICHIMOKU_SPAN_A_COLOR,
    spanBColor = DEFAULT_CHART_LINE_ICHIMOKU_SPAN_B_COLOR,
    gridColor = DEFAULT_CHART_LINE_ICHIMOKU_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ICHIMOKU_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCloud = true,
    showTenkan = true,
    showKijun = true,
    showChikou = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with an Ichimoku cloud overlay',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineIchimokuLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        hiddenSeries: hiddenSet,
        ...(isFiniteNumber(conversionPeriod) ? { conversionPeriod } : {}),
        ...(isFiniteNumber(basePeriod) ? { basePeriod } : {}),
        ...(isFiniteNumber(leadingPeriod) ? { leadingPeriod } : {}),
        ...(isFiniteNumber(displacement) ? { displacement } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      tickCount,
      hiddenSet,
      conversionPeriod,
      basePeriod,
      leadingPeriod,
      displacement,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineIchimokuChart(data, {
        ...(isFiniteNumber(conversionPeriod) ? { conversionPeriod } : {}),
        ...(isFiniteNumber(basePeriod) ? { basePeriod } : {}),
        ...(isFiniteNumber(leadingPeriod) ? { leadingPeriod } : {}),
        ...(isFiniteNumber(displacement) ? { displacement } : {}),
      }),
    [ariaDescription, data, conversionPeriod, basePeriod, leadingPeriod, displacement],
  );

  const [hover, setHover] = useState<
    | { kind: 'price'; index: number }
    | { kind: 'cloud'; index: number }
    | null
  >(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHover(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

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
        data-section="chart-line-ichimoku"
        data-empty="true"
        data-bullish-count={0}
        data-bearish-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-ichimoku-aria-desc" style={ICHIMOKU_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const cloudVisible = showCloud && !hiddenSet.has('cloud');
  const tenkanVisible = showTenkan && !hiddenSet.has('tenkan');
  const kijunVisible = showKijun && !hiddenSet.has('kijun');
  const chikouVisible = showChikou && !hiddenSet.has('chikou');
  const priceVisible = !hiddenSet.has('price');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'tenkan', label: 'Tenkan', color: tenkanColor },
    { id: 'kijun', label: 'Kijun', color: kijunColor },
    { id: 'chikou', label: 'Chikou', color: chikouColor },
    { id: 'cloud', label: 'Kumo', color: spanAColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-ichimoku"
      data-empty="false"
      data-bullish-count={layout.bullishCount}
      data-bearish-count={layout.bearishCount}
      data-conversion-period={layout.conversionPeriod}
      data-base-period={layout.basePeriod}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-ichimoku-aria-desc" style={ICHIMOKU_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-ichimoku-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-ichimoku-badge"
            data-conversion-period={layout.conversionPeriod}
            data-bullish-count={layout.bullishCount}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span data-section="chart-line-ichimoku-badge-icon" aria-hidden="true">
              ICHI
            </span>
            <span data-section="chart-line-ichimoku-badge-periods">
              {layout.conversionPeriod}-{layout.basePeriod}-
              {layout.leadingPeriod}
            </span>
            <span data-section="chart-line-ichimoku-badge-cloud">
              cloud=
              {layout.bullishCount > layout.bearishCount
                ? 'bull'
                : layout.bearishCount > layout.bullishCount
                  ? 'bear'
                  : 'flat'}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-ichimoku-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-ichimoku-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.panel.y +
                  layout.panel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.panel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-ichimoku-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.panel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.panel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-ichimoku-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-ichimoku-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-ichimoku-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-ichimoku-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-ichimoku-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-ichimoku-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-ichimoku-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.panel.y + layout.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g data-section="chart-line-ichimoku-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-ichimoku-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-ichimoku-tick-label"
                        data-axis="y"
                        x={layout.panel.x - 6}
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
              {xLabel ? (
                <text
                  data-section="chart-line-ichimoku-x-label"
                  x={layout.panel.x + layout.panel.width / 2}
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
                  data-section="chart-line-ichimoku-y-label"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {cloudVisible ? (
            <g data-section="chart-line-ichimoku-cloud">
              {layout.cloudSegments.map((seg, i) => (
                <polygon
                  key={`cs-${i}`}
                  data-section="chart-line-ichimoku-cloud-segment"
                  data-segment-index={seg.index}
                  data-bullish={seg.bullish ? 'true' : 'false'}
                  points={seg.polygon}
                  fill={seg.bullish ? spanAColor : spanBColor}
                  fillOpacity={0.18}
                  stroke="none"
                  onMouseEnter={() => {
                    setHover({ kind: 'cloud', index: i });
                  }}
                  onMouseLeave={clearHover}
                />
              ))}
              {layout.spanAPath ? (
                <path
                  data-section="chart-line-ichimoku-span-a"
                  d={layout.spanAPath}
                  fill="none"
                  stroke={spanAColor}
                  strokeWidth={1.25}
                />
              ) : null}
              {layout.spanBPath ? (
                <path
                  data-section="chart-line-ichimoku-span-b"
                  d={layout.spanBPath}
                  fill="none"
                  stroke={spanBColor}
                  strokeWidth={1.25}
                />
              ) : null}
            </g>
          ) : null}

          {chikouVisible && layout.chikouPath ? (
            <path
              data-section="chart-line-ichimoku-chikou"
              d={layout.chikouPath}
              fill="none"
              stroke={chikouColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          ) : null}

          {tenkanVisible && layout.tenkanPath ? (
            <path
              data-section="chart-line-ichimoku-tenkan"
              d={layout.tenkanPath}
              fill="none"
              stroke={tenkanColor}
              strokeWidth={1.5}
            />
          ) : null}

          {kijunVisible && layout.kijunPath ? (
            <path
              data-section="chart-line-ichimoku-kijun"
              d={layout.kijunPath}
              fill="none"
              stroke={kijunColor}
              strokeWidth={1.5}
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-ichimoku-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-ichimoku-dots">
              {layout.priceDots.map((d) => {
                const isHover =
                  hover?.kind === 'price' && hover.index === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Price ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-ichimoku-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHover({ kind: 'price', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHover({ kind: 'price', index: d.index });
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hover && tooltipPos && hover.kind === 'price'
          ? (() => {
              const d = layout.priceDots.find(
                (x) => x.index === hover.index,
              );
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-ichimoku-tooltip"
                  data-tooltip-kind="price"
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-ichimoku-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-ichimoku-tooltip-price"
                    style={{ fontWeight: 600 }}
                  >
                    price: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-ichimoku-tooltip-tenkan">
                    tenkan: {d.tenkan === null ? 'n/a' : formatValue(d.tenkan)}
                  </div>
                  <div data-section="chart-line-ichimoku-tooltip-kijun">
                    kijun: {d.kijun === null ? 'n/a' : formatValue(d.kijun)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-ichimoku-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-ichimoku-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-ichimoku-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-ichimoku-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ichimoku-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullishCount} bullish / {layout.bearishCount} bearish
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineIchimoku.displayName = 'ChartLineIchimoku';
