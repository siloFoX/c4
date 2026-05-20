import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_GATOR_WIDTH = 560;
export const DEFAULT_CHART_LINE_GATOR_HEIGHT = 360;
export const DEFAULT_CHART_LINE_GATOR_PADDING = 40;
export const DEFAULT_CHART_LINE_GATOR_GAP = 12;
export const DEFAULT_CHART_LINE_GATOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_GATOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_GATOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_GATOR_JAW_PERIOD = 13;
export const DEFAULT_CHART_LINE_GATOR_TEETH_PERIOD = 8;
export const DEFAULT_CHART_LINE_GATOR_LIPS_PERIOD = 5;
export const DEFAULT_CHART_LINE_GATOR_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_GATOR_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_GATOR_UPPER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_GATOR_LOWER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_GATOR_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_GATOR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_GATOR_AXIS_COLOR = '#cbd5e1';

export type ChartLineGatorPhase = 'feeding' | 'sleeping' | 'steady';

export interface ChartLineGatorPoint {
  x: number;
  value: number;
}

export interface ChartLineGatorSeries {
  jaw: (number | null)[];
  teeth: (number | null)[];
  lips: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export interface ChartLineGatorSample {
  index: number;
  x: number;
  value: number;
  upper: number | null;
  lower: number | null;
  phase: ChartLineGatorPhase;
}

export interface ChartLineGatorRun {
  series: ChartLineGatorPoint[];
  jawPeriod: number;
  teethPeriod: number;
  lipsPeriod: number;
  upper: (number | null)[];
  lower: (number | null)[];
  samples: ChartLineGatorSample[];
  upperFinal: number;
  lowerFinal: number;
  upperMax: number;
  lowerMin: number;
  feedingCount: number;
  sleepingCount: number;
  ok: boolean;
}

export interface ChartLineGatorPriceDot {
  index: number;
  x: number;
  value: number;
  upper: number | null;
  lower: number | null;
  phase: ChartLineGatorPhase;
  px: number;
  py: number;
}

export interface ChartLineGatorBar {
  index: number;
  x: number;
  upper: number;
  lower: number;
  phase: ChartLineGatorPhase;
  px: number;
  upperY: number;
  upperHeight: number;
  lowerY: number;
  lowerHeight: number;
}

export interface ChartLineGatorPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineGatorLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineGatorPanel;
  gatorPanel: ChartLineGatorPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  gatorYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  gatorYMin: number;
  gatorYMax: number;
  pricePath: string;
  priceDots: ChartLineGatorPriceDot[];
  gatorBars: ChartLineGatorBar[];
  barWidth: number;
  zeroY: number;
  jawPeriod: number;
  teethPeriod: number;
  lipsPeriod: number;
  upperFinal: number;
  lowerFinal: number;
  feedingCount: number;
  sleepingCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineGatorLayoutOptions {
  data: readonly ChartLineGatorPoint[];
  jawPeriod?: number;
  teethPeriod?: number;
  lipsPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineGatorProps {
  data: readonly ChartLineGatorPoint[];
  jawPeriod?: number;
  teethPeriod?: number;
  lipsPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upperColor?: string;
  lowerColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineGatorPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineGatorFinitePoints(
  points: readonly ChartLineGatorPoint[] | null | undefined,
): ChartLineGatorPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineGatorPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an Alligator jaw period to a positive integer. A
 * non-finite or sub-1 value falls back to `fallback`; a fractional
 * value floors.
 */
export function normalizeLineGatorPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The `period`-bar simple moving average of the series. Null
 * through the warm-up; defined from index `period - 1` onward.
 */
export function computeLineGatorSma(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineGatorPeriod(
    period,
    DEFAULT_CHART_LINE_GATOR_JAW_PERIOD,
  );
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p) return out;
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - k];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
    }
    out[i] = valid ? sum / p : null;
  }
  return out;
}

/**
 * The Gator Oscillator pipeline. Bill Williams' Alligator is three
 * moving averages -- a slow jaw, a medium teeth and a fast lips.
 * The Gator turns them into two histograms:
 *
 *   upper[i] = abs(jaw[i] - teeth[i])     (the jaw-teeth gap)
 *   lower[i] = -abs(teeth[i] - lips[i])   (the negated teeth-lips gap)
 *
 * The upper histogram is non-negative, the lower non-positive. When
 * the three averages converge (the Alligator "sleeps") the
 * histograms shrink toward zero; when they spread (it "feeds") the
 * histograms grow. Both histograms share the jaw warm-up, so they
 * are null until all three averages are defined.
 */
export function computeLineGator(
  values: readonly number[] | null | undefined,
  jawPeriod: number,
  teethPeriod: number,
  lipsPeriod: number,
): ChartLineGatorSeries {
  if (!Array.isArray(values)) {
    return { jaw: [], teeth: [], lips: [], upper: [], lower: [] };
  }
  const jp = normalizeLineGatorPeriod(
    jawPeriod,
    DEFAULT_CHART_LINE_GATOR_JAW_PERIOD,
  );
  const tp = normalizeLineGatorPeriod(
    teethPeriod,
    DEFAULT_CHART_LINE_GATOR_TEETH_PERIOD,
  );
  const lp = normalizeLineGatorPeriod(
    lipsPeriod,
    DEFAULT_CHART_LINE_GATOR_LIPS_PERIOD,
  );
  const jaw = computeLineGatorSma(values, jp);
  const teeth = computeLineGatorSma(values, tp);
  const lips = computeLineGatorSma(values, lp);
  const n = values.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const j = jaw[i];
    const t = teeth[i];
    const l = lips[i];
    if (isFiniteNumber(j) && isFiniteNumber(t) && isFiniteNumber(l)) {
      upper[i] = Math.abs(j - t);
      lower[i] = -Math.abs(t - l);
    }
  }
  return { jaw, teeth, lips, upper, lower };
}

export function runLineGator(
  points: readonly ChartLineGatorPoint[] | null | undefined,
  options?: {
    jawPeriod?: number;
    teethPeriod?: number;
    lipsPeriod?: number;
  },
): ChartLineGatorRun {
  const finite = getLineGatorFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const jawPeriod = normalizeLineGatorPeriod(
    options?.jawPeriod ?? DEFAULT_CHART_LINE_GATOR_JAW_PERIOD,
    DEFAULT_CHART_LINE_GATOR_JAW_PERIOD,
  );
  const teethPeriod = normalizeLineGatorPeriod(
    options?.teethPeriod ?? DEFAULT_CHART_LINE_GATOR_TEETH_PERIOD,
    DEFAULT_CHART_LINE_GATOR_TEETH_PERIOD,
  );
  const lipsPeriod = normalizeLineGatorPeriod(
    options?.lipsPeriod ?? DEFAULT_CHART_LINE_GATOR_LIPS_PERIOD,
    DEFAULT_CHART_LINE_GATOR_LIPS_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      jawPeriod,
      teethPeriod,
      lipsPeriod,
      upper: [],
      lower: [],
      samples: [],
      upperFinal: NaN,
      lowerFinal: NaN,
      upperMax: NaN,
      lowerMin: NaN,
      feedingCount: 0,
      sleepingCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { upper, lower } = computeLineGator(
    values,
    jawPeriod,
    teethPeriod,
    lipsPeriod,
  );

  let prevSpread: number | null = null;
  const samples: ChartLineGatorSample[] = series.map((p, i) => {
    const u = upper[i] ?? null;
    const l = lower[i] ?? null;
    let phase: ChartLineGatorPhase = 'steady';
    if (u !== null && l !== null) {
      const spread = u + Math.abs(l);
      if (prevSpread !== null) {
        phase =
          spread > prevSpread
            ? 'feeding'
            : spread < prevSpread
              ? 'sleeping'
              : 'steady';
      }
      prevSpread = spread;
    }
    return { index: i, x: p.x, value: p.value, upper: u, lower: l, phase };
  });

  let feedingCount = 0;
  let sleepingCount = 0;
  let uMax = Number.NEGATIVE_INFINITY;
  let lMin = Number.POSITIVE_INFINITY;
  let uFinal = NaN;
  let lFinal = NaN;
  for (const s of samples) {
    if (s.phase === 'feeding') feedingCount += 1;
    else if (s.phase === 'sleeping') sleepingCount += 1;
    if (s.upper !== null) {
      if (s.upper > uMax) uMax = s.upper;
      uFinal = s.upper;
    }
    if (s.lower !== null) {
      if (s.lower < lMin) lMin = s.lower;
      lFinal = s.lower;
    }
  }

  return {
    series,
    jawPeriod,
    teethPeriod,
    lipsPeriod,
    upper,
    lower,
    samples,
    upperFinal: uFinal,
    lowerFinal: lFinal,
    upperMax: isFiniteNumber(uMax) ? uMax : NaN,
    lowerMin: isFiniteNumber(lMin) ? lMin : NaN,
    feedingCount,
    sleepingCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
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

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function computeLineGatorLayout(
  options: ComputeLineGatorLayoutOptions,
): ChartLineGatorLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_GATOR_GAP,
    tickCount = DEFAULT_CHART_LINE_GATOR_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_GATOR_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineGator(data, {
    ...(isFiniteNumber(options.jawPeriod)
      ? { jawPeriod: options.jawPeriod }
      : {}),
    ...(isFiniteNumber(options.teethPeriod)
      ? { teethPeriod: options.teethPeriod }
      : {}),
    ...(isFiniteNumber(options.lipsPeriod)
      ? { lipsPeriod: options.lipsPeriod }
      : {}),
  });

  const emptyPanel: ChartLineGatorPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineGatorLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    gatorPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    gatorYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    gatorYMin: 0,
    gatorYMax: 0,
    pricePath: '',
    priceDots: [],
    gatorBars: [],
    barWidth: 0,
    zeroY: 0,
    jawPeriod: run.jawPeriod,
    teethPeriod: run.teethPeriod,
    lipsPeriod: run.lipsPeriod,
    upperFinal: NaN,
    lowerFinal: NaN,
    feedingCount: 0,
    sleepingCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const gatorHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineGatorPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const gatorPanel: ChartLineGatorPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: gatorHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }

  let bound = Math.max(Math.abs(run.upperMax), Math.abs(run.lowerMin));
  if (!isFiniteNumber(bound) || bound <= 0) bound = 1;
  const gatorLo = -bound;
  const gatorHi = bound;

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const gatorRange = gatorHi - gatorLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectGatorY = (v: number): number =>
    gatorPanel.y +
    gatorPanel.height -
    ((v - gatorLo) / gatorRange) * gatorPanel.height;

  const zeroY = projectGatorY(0);

  const priceDots: ChartLineGatorPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    upper: s.upper,
    lower: s.lower,
    phase: s.phase,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const barWidth = clamp(
    (innerWidth / Math.max(run.samples.length, 1)) * 0.6,
    1,
    20,
  );

  const gatorBars: ChartLineGatorBar[] = [];
  for (const s of run.samples) {
    if (s.upper === null || s.lower === null) continue;
    const px = projectX(s.x);
    const upY = projectGatorY(s.upper);
    const loY = projectGatorY(s.lower);
    gatorBars.push({
      index: s.index,
      x: s.x,
      upper: s.upper,
      lower: s.lower,
      phase: s.phase,
      px,
      upperY: upY,
      upperHeight: Math.max(0, zeroY - upY),
      lowerY: zeroY,
      lowerHeight: Math.max(0, loY - zeroY),
    });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    gatorPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    gatorYTicks: computeTicks(gatorLo, gatorHi, tickCount).map((v) => ({
      value: v,
      py: projectGatorY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    gatorYMin: gatorLo,
    gatorYMax: gatorHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    gatorBars,
    barWidth,
    zeroY,
    jawPeriod: run.jawPeriod,
    teethPeriod: run.teethPeriod,
    lipsPeriod: run.lipsPeriod,
    upperFinal: run.upperFinal,
    lowerFinal: run.lowerFinal,
    feedingCount: run.feedingCount,
    sleepingCount: run.sleepingCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineGatorChart(
  data: readonly ChartLineGatorPoint[] | null | undefined,
  options?: {
    jawPeriod?: number;
    teethPeriod?: number;
    lipsPeriod?: number;
  },
): string {
  const run = runLineGator(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with a Gator Oscillator (jaw ${run.jawPeriod}, teeth ${run.teethPeriod}, lips ${run.lipsPeriod}): the top panel plots the raw price; the bottom panel plots the Gator as two histograms. The Gator is built from Bill Williams' Alligator -- three moving averages, a slow jaw, a medium teeth and a fast lips. The upper histogram is the absolute gap between the jaw and the teeth; the lower histogram is the negated absolute gap between the teeth and the lips. When the Alligator sleeps the histograms shrink toward zero; when it feeds they expand. The Gator reads feeding on ${run.feedingCount} bars and sleeping on ${run.sleepingCount} across ${run.samples.length} bars.`;
}

const GATOR_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineGator = forwardRef<HTMLDivElement, ChartLineGatorProps>(
  function ChartLineGator(
    props: ChartLineGatorProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      jawPeriod,
      teethPeriod,
      lipsPeriod,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_GATOR_WIDTH,
      height = DEFAULT_CHART_LINE_GATOR_HEIGHT,
      padding = DEFAULT_CHART_LINE_GATOR_PADDING,
      gap = DEFAULT_CHART_LINE_GATOR_GAP,
      tickCount = DEFAULT_CHART_LINE_GATOR_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_GATOR_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_GATOR_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_GATOR_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_GATOR_PRICE_COLOR,
      upperColor = DEFAULT_CHART_LINE_GATOR_UPPER_COLOR,
      lowerColor = DEFAULT_CHART_LINE_GATOR_LOWER_COLOR,
      zeroColor = DEFAULT_CHART_LINE_GATOR_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_GATOR_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_GATOR_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showUpper = true,
      showLower = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with a Gator Oscillator',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
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
        computeLineGatorLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(jawPeriod) ? { jawPeriod } : {}),
          ...(isFiniteNumber(teethPeriod) ? { teethPeriod } : {}),
          ...(isFiniteNumber(lipsPeriod) ? { lipsPeriod } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        jawPeriod,
        teethPeriod,
        lipsPeriod,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineGatorChart(data, {
          ...(isFiniteNumber(jawPeriod) ? { jawPeriod } : {}),
          ...(isFiniteNumber(teethPeriod) ? { teethPeriod } : {}),
          ...(isFiniteNumber(lipsPeriod) ? { lipsPeriod } : {}),
        }),
      [ariaDescription, data, jawPeriod, teethPeriod, lipsPeriod],
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverIndex(null);
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
          data-section="chart-line-gator"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-gator-aria-desc"
            style={GATOR_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const gp = layout.gatorPanel;
    const priceVisible = !hiddenSet.has('price');
    const upperVisible = showUpper && !hiddenSet.has('upper');
    const lowerVisible = showLower && !hiddenSet.has('lower');
    const half = layout.barWidth / 2;

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'upper', label: 'Upper', color: upperColor },
      { id: 'lower', label: 'Lower', color: lowerColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-gator"
        data-empty="false"
        data-jaw-period={layout.jawPeriod}
        data-teeth-period={layout.teethPeriod}
        data-lips-period={layout.lipsPeriod}
        data-upper-final={layout.upperFinal}
        data-lower-final={layout.lowerFinal}
        data-feeding-count={layout.feedingCount}
        data-sleeping-count={layout.sleepingCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-gator-aria-desc"
          style={GATOR_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-gator-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-gator-badge"
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
              <span
                data-section="chart-line-gator-badge-icon"
                aria-hidden="true"
                style={{ color: upperColor }}
              >
                GATOR
              </span>
              <span data-section="chart-line-gator-badge-config">
                {layout.jawPeriod}/{layout.teethPeriod}/{layout.lipsPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-gator-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-gator-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-gator-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.gatorYTicks.map((t, i) => (
                  <line
                    key={`gg-${i}`}
                    data-section="chart-line-gator-grid-line"
                    data-panel="gator"
                    x1={gp.x}
                    x2={gp.x + gp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-gator-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-gator-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-gator-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-gator-axis"
                  data-panel="gator"
                  data-axis="y"
                  x1={gp.x}
                  y1={gp.y}
                  x2={gp.x}
                  y2={gp.y + gp.height}
                />
                <line
                  data-section="chart-line-gator-axis"
                  data-panel="gator"
                  data-axis="x"
                  x1={gp.x}
                  y1={gp.y + gp.height}
                  x2={gp.x + gp.width}
                  y2={gp.y + gp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-gator-tick-label"
                    data-panel="price"
                    data-axis="y"
                    x={pp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.gatorYTicks.map((t, i) => (
                  <text
                    key={`gyt-${i}`}
                    data-section="chart-line-gator-tick-label"
                    data-panel="gator"
                    data-axis="y"
                    x={gp.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                ))}
                {layout.xTicks.map((t, i) => (
                  <text
                    key={`xt-${i}`}
                    data-section="chart-line-gator-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={gp.y + gp.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                ))}
              </g>
            ) : null}

            <text
              data-section="chart-line-gator-panel-label"
              data-panel="price"
              x={pp.x + 2}
              y={pp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Price
            </text>
            <text
              data-section="chart-line-gator-panel-label"
              data-panel="gator"
              x={gp.x + 2}
              y={gp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Gator
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-gator-zero-line"
                x1={gp.x}
                x2={gp.x + gp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-gator-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-gator-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-gator-dot"
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
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: d })}
                    />
                  );
                })}
              </g>
            ) : null}

            {upperVisible ? (
              <g data-section="chart-line-gator-upper-histogram">
                {layout.gatorBars.map((b) => (
                  <rect
                    key={`u-${b.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Upper Gator at x ${formatX(b.x)}: ${formatValue(b.upper)}, ${b.phase}`}
                    data-section="chart-line-gator-upper-bar"
                    data-point-index={b.index}
                    data-upper={b.upper}
                    data-phase={b.phase}
                    x={b.px - half}
                    y={b.upperY}
                    width={layout.barWidth}
                    height={b.upperHeight}
                    fill={upperColor}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    onMouseEnter={() => {
                      setHoverIndex(b.index);
                      setTooltipPos({ px: b.px, py: b.upperY });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(b.index);
                      setTooltipPos({ px: b.px, py: b.upperY });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === b.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                ))}
              </g>
            ) : null}

            {lowerVisible ? (
              <g data-section="chart-line-gator-lower-histogram">
                {layout.gatorBars.map((b) => (
                  <rect
                    key={`l-${b.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Lower Gator at x ${formatX(b.x)}: ${formatValue(b.lower)}, ${b.phase}`}
                    data-section="chart-line-gator-lower-bar"
                    data-point-index={b.index}
                    data-lower={b.lower}
                    data-phase={b.phase}
                    x={b.px - half}
                    y={b.lowerY}
                    width={layout.barWidth}
                    height={b.lowerHeight}
                    fill={lowerColor}
                    stroke="#ffffff"
                    strokeWidth={0.5}
                    onMouseEnter={() => {
                      setHoverIndex(b.index);
                      setTooltipPos({ px: b.px, py: b.lowerY });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(b.index);
                      setTooltipPos({ px: b.px, py: b.lowerY });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === b.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                ))}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-gator-tooltip"
                    data-point-index={d.index}
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
                    <div data-section="chart-line-gator-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-gator-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-gator-tooltip-upper">
                      upper: {fmtNullable(d.upper)}
                    </div>
                    <div data-section="chart-line-gator-tooltip-lower">
                      lower: {fmtNullable(d.lower)}
                    </div>
                    <div data-section="chart-line-gator-tooltip-phase">
                      phase: {d.phase}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-gator-legend"
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
                  data-section="chart-line-gator-legend-item"
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
                    data-section="chart-line-gator-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-gator-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-gator-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.feedingCount} feeding, {layout.sleepingCount} sleeping
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineGator.displayName = 'ChartLineGator';
