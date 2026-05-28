import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_COPPOCK_WIDTH = 560;
export const DEFAULT_CHART_LINE_COPPOCK_HEIGHT = 360;
export const DEFAULT_CHART_LINE_COPPOCK_PADDING = 40;
export const DEFAULT_CHART_LINE_COPPOCK_GAP = 26;
export const DEFAULT_CHART_LINE_COPPOCK_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_COPPOCK_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COPPOCK_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_COPPOCK_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COPPOCK_ROC1_PERIOD = 14;
export const DEFAULT_CHART_LINE_COPPOCK_ROC2_PERIOD = 11;
export const DEFAULT_CHART_LINE_COPPOCK_WMA_PERIOD = 10;
export const DEFAULT_CHART_LINE_COPPOCK_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_COPPOCK_COPPOCK_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_COPPOCK_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_COPPOCK_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_COPPOCK_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_COPPOCK_AXIS_COLOR = '#cbd5e1';

export type ChartLineCoppockSign = 'positive' | 'negative' | 'zero';

export interface ChartLineCoppockPoint {
  x: number;
  value: number;
}

export interface ChartLineCoppockSample {
  index: number;
  x: number;
  value: number;
  coppock: number | null;
  sign: ChartLineCoppockSign;
}

export interface ChartLineCoppockRun {
  series: ChartLineCoppockPoint[];
  roc1Period: number;
  roc2Period: number;
  wmaPeriod: number;
  coppock: (number | null)[];
  samples: ChartLineCoppockSample[];
  coppockFinal: number;
  coppockMin: number;
  coppockMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineCoppockPriceDot {
  index: number;
  x: number;
  value: number;
  coppock: number | null;
  sign: ChartLineCoppockSign;
  px: number;
  py: number;
}

export interface ChartLineCoppockMarker {
  index: number;
  x: number;
  coppock: number;
  sign: ChartLineCoppockSign;
  px: number;
  py: number;
}

export interface ChartLineCoppockPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCoppockLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineCoppockPanel;
  coppockPanel: ChartLineCoppockPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  coppockYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  coppockYBound: number;
  pricePath: string;
  priceDots: ChartLineCoppockPriceDot[];
  coppockPath: string;
  markers: ChartLineCoppockMarker[];
  zeroY: number;
  roc1Period: number;
  roc2Period: number;
  wmaPeriod: number;
  coppockFinal: number;
  coppockMin: number;
  coppockMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCoppockLayoutOptions {
  data: readonly ChartLineCoppockPoint[];
  roc1Period?: number;
  roc2Period?: number;
  wmaPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineCoppockProps {
  data: readonly ChartLineCoppockPoint[];
  roc1Period?: number;
  roc2Period?: number;
  wmaPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  valueColor?: string;
  coppockColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCoppock?: boolean;
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
  onPointClick?: (payload: { point: ChartLineCoppockPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCoppockFinitePoints(
  points: readonly ChartLineCoppockPoint[] | null | undefined,
): ChartLineCoppockPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCoppockPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineCoppockPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The percentage rate of change over `period` bars:
 * `ROC[i] = 100 * (value[i] - value[i-period]) / value[i-period]`.
 * Indices before the lookback fills read null; a zero base reads 0.
 */
export function computeLineCoppockRoc(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p; i < n; i += 1) {
    const base = values[i - p]!;
    const raw = base === 0 ? 0 : (100 * (values[i]! - base)) / base;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

/**
 * A linearly weighted moving average over `period` values: the most
 * recent value carries weight `period`, the next `period - 1`, down
 * to weight 1 for the oldest, divided by the weight sum. Indices
 * whose window is not fully defined read null.
 */
export function computeLineCoppockWma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const weightSum = (p * (p + 1)) / 2;
  for (let i = p - 1; i < n; i += 1) {
    let weighted = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - p + 1 + k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      weighted += (k + 1) * v;
    }
    if (valid) out[i] = weighted / weightSum;
  }
  return out;
}

/**
 * Edwin Coppock's Curve: a long-term momentum oscillator. Two
 * rate-of-change series of different lookbacks are summed, and the
 * total is smoothed by a linearly weighted moving average. The curve
 * oscillates around zero; a cross up through zero is the classic
 * long-term momentum turn.
 */
export function computeLineCoppock(
  values: readonly number[] | null | undefined,
  roc1Period: number,
  roc2Period: number,
  wmaPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const roc1 = computeLineCoppockRoc(values, roc1Period);
  const roc2 = computeLineCoppockRoc(values, roc2Period);
  const rocSum: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (roc1[i] !== null && roc2[i] !== null) {
      rocSum[i] = (roc1[i] as number) + (roc2[i] as number);
    }
  }
  return computeLineCoppockWma(rocSum, wmaPeriod);
}

function classifySign(coppock: number | null): ChartLineCoppockSign {
  if (coppock === null) return 'zero';
  if (coppock > 0) return 'positive';
  if (coppock < 0) return 'negative';
  return 'zero';
}

export function runLineCoppock(
  points: readonly ChartLineCoppockPoint[] | null | undefined,
  options?: {
    roc1Period?: number;
    roc2Period?: number;
    wmaPeriod?: number;
  },
): ChartLineCoppockRun {
  const finite = getLineCoppockFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const roc1Period = normalizeLineCoppockPeriod(
    options?.roc1Period ?? DEFAULT_CHART_LINE_COPPOCK_ROC1_PERIOD,
    DEFAULT_CHART_LINE_COPPOCK_ROC1_PERIOD,
  );
  const roc2Period = normalizeLineCoppockPeriod(
    options?.roc2Period ?? DEFAULT_CHART_LINE_COPPOCK_ROC2_PERIOD,
    DEFAULT_CHART_LINE_COPPOCK_ROC2_PERIOD,
  );
  const wmaPeriod = normalizeLineCoppockPeriod(
    options?.wmaPeriod ?? DEFAULT_CHART_LINE_COPPOCK_WMA_PERIOD,
    DEFAULT_CHART_LINE_COPPOCK_WMA_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      roc1Period,
      roc2Period,
      wmaPeriod,
      coppock: [],
      samples: [],
      coppockFinal: NaN,
      coppockMin: NaN,
      coppockMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const coppock = computeLineCoppock(values, roc1Period, roc2Period, wmaPeriod);
  const samples: ChartLineCoppockSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    coppock: coppock[i] ?? null,
    sign: classifySign(coppock[i] ?? null),
  }));

  let coppockFinal = NaN;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (coppock[i] !== null) {
      coppockFinal = coppock[i] as number;
      break;
    }
  }
  let coppockMin = NaN;
  let coppockMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.coppock !== null) {
      if (Number.isNaN(coppockMin) || s.coppock < coppockMin) {
        coppockMin = s.coppock;
      }
      if (Number.isNaN(coppockMax) || s.coppock > coppockMax) {
        coppockMax = s.coppock;
      }
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    roc1Period,
    roc2Period,
    wmaPeriod,
    coppock,
    samples,
    coppockFinal,
    coppockMin,
    coppockMax,
    positiveCount,
    negativeCount,
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

export function computeLineCoppockLayout(
  options: ComputeLineCoppockLayoutOptions,
): ChartLineCoppockLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_COPPOCK_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_COPPOCK_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_COPPOCK_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineCoppockPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineCoppock(data, {
    ...(isFiniteNumber(options.roc1Period)
      ? { roc1Period: options.roc1Period }
      : {}),
    ...(isFiniteNumber(options.roc2Period)
      ? { roc2Period: options.roc2Period }
      : {}),
    ...(isFiniteNumber(options.wmaPeriod)
      ? { wmaPeriod: options.wmaPeriod }
      : {}),
  });
  const empty: ChartLineCoppockLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    coppockPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    coppockYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    coppockYBound: 0,
    pricePath: '',
    priceDots: [],
    coppockPath: '',
    markers: [],
    zeroY: 0,
    roc1Period: run.roc1Period,
    roc2Period: run.roc2Period,
    wmaPeriod: run.wmaPeriod,
    coppockFinal: NaN,
    coppockMin: NaN,
    coppockMax: NaN,
    positiveCount: 0,
    negativeCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const coppockH = usableHeight - priceH;
  if (priceH <= 0 || coppockH <= 0) return empty;

  const pricePanel: ChartLineCoppockPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const coppockPanel: ChartLineCoppockPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: coppockH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
    if (s.coppock !== null && Math.abs(s.coppock) > bound) {
      bound = Math.abs(s.coppock);
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }
  if (bound <= 0) bound = 1;

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectCoppockY = (v: number): number =>
    coppockPanel.y +
    coppockPanel.height -
    ((v + bound) / (2 * bound)) * coppockPanel.height;

  const priceDots: ChartLineCoppockPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    coppock: s.coppock,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineCoppockMarker[] = [];
  const coppockPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    if (s.coppock !== null) {
      const px = projectX(s.x);
      const py = projectCoppockY(s.coppock);
      coppockPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        coppock: s.coppock,
        sign: s.sign,
        px,
        py,
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    coppockPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    coppockYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectCoppockY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    coppockYBound: bound,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    coppockPath: buildPath(coppockPts),
    markers,
    zeroY: projectCoppockY(0),
    roc1Period: run.roc1Period,
    roc2Period: run.roc2Period,
    wmaPeriod: run.wmaPeriod,
    coppockFinal: run.coppockFinal,
    coppockMin: run.coppockMin,
    coppockMax: run.coppockMax,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
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

export function describeLineCoppockChart(
  data: readonly ChartLineCoppockPoint[] | null | undefined,
  options?: {
    roc1Period?: number;
    roc2Period?: number;
    wmaPeriod?: number;
  },
): string {
  const run = runLineCoppock(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Coppock Curve long-term momentum panel (ROC ${run.roc1Period}/${run.roc2Period}, WMA ${run.wmaPeriod}): the Coppock Curve sums two rate-of-change readings and smooths the total with a weighted moving average, oscillating around zero; a cross up through zero marks a long-term momentum turn. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const COPPOCK_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCoppock = forwardRef<
  HTMLDivElement,
  ChartLineCoppockProps
>(function ChartLineCoppock(
  props: ChartLineCoppockProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    roc1Period,
    roc2Period,
    wmaPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_COPPOCK_WIDTH,
    height = DEFAULT_CHART_LINE_COPPOCK_HEIGHT,
    padding = DEFAULT_CHART_LINE_COPPOCK_PADDING,
    gap = DEFAULT_CHART_LINE_COPPOCK_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_COPPOCK_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_COPPOCK_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_COPPOCK_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_COPPOCK_DOT_RADIUS,
    valueColor = DEFAULT_CHART_LINE_COPPOCK_VALUE_COLOR,
    coppockColor = DEFAULT_CHART_LINE_COPPOCK_COPPOCK_COLOR,
    positiveColor = DEFAULT_CHART_LINE_COPPOCK_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_COPPOCK_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_COPPOCK_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_COPPOCK_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCoppock = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Coppock Curve momentum panel',
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
      computeLineCoppockLayout({
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        ...(isFiniteNumber(roc1Period) ? { roc1Period } : {}),
        ...(isFiniteNumber(roc2Period) ? { roc2Period } : {}),
        ...(isFiniteNumber(wmaPeriod) ? { wmaPeriod } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
      tickCount,
      roc1Period,
      roc2Period,
      wmaPeriod,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineCoppockChart(data, {
        ...(isFiniteNumber(roc1Period) ? { roc1Period } : {}),
        ...(isFiniteNumber(roc2Period) ? { roc2Period } : {}),
        ...(isFiniteNumber(wmaPeriod) ? { wmaPeriod } : {}),
      }),
    [ariaDescription, data, roc1Period, roc2Period, wmaPeriod],
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

  const signColor = useCallback(
    (s: ChartLineCoppockSign): string =>
      s === 'positive'
        ? positiveColor
        : s === 'negative'
          ? negativeColor
          : coppockColor,
    [positiveColor, negativeColor, coppockColor],
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
        data-section="chart-line-coppock"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-coppock-aria-desc" style={COPPOCK_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const cp = layout.coppockPanel;
  const valueVisible = !hiddenSet.has('value');
  const coppockVisible = showCoppock && !hiddenSet.has('coppock');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'value', label: 'Value', color: valueColor },
    { id: 'coppock', label: 'Coppock', color: coppockColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-coppock"
      data-empty="false"
      data-roc1-period={layout.roc1Period}
      data-roc2-period={layout.roc2Period}
      data-wma-period={layout.wmaPeriod}
      data-coppock-final={layout.coppockFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-coppock-aria-desc" style={COPPOCK_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-coppock-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-coppock-badge"
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
              data-section="chart-line-coppock-badge-icon"
              aria-hidden="true"
              style={{ color: coppockColor }}
            >
              COPPOCK
            </span>
            <span data-section="chart-line-coppock-badge-roc">
              r={layout.roc1Period}/{layout.roc2Period}
            </span>
            <span data-section="chart-line-coppock-badge-wma">
              w={layout.wmaPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-coppock-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-coppock-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`pgy-${i}`}
                  data-section="chart-line-coppock-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.coppockYTicks.map((t, i) => (
                <line
                  key={`cgy-${i}`}
                  data-section="chart-line-coppock-grid-line"
                  data-panel="coppock"
                  x1={cp.x}
                  x2={cp.x + cp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-coppock-zero-line"
              x1={cp.x}
              x2={cp.x + cp.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-coppock-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              {[
                { panel: pp, name: 'price', yt: layout.priceYTicks },
                { panel: cp, name: 'coppock', yt: layout.coppockYTicks },
              ].map((cfg) => (
                <g
                  key={`axis-${cfg.name}`}
                  data-section="chart-line-coppock-axis-group"
                  data-panel={cfg.name}
                >
                  <line
                    data-section="chart-line-coppock-axis"
                    data-panel={cfg.name}
                    data-axis="x"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y + cfg.panel.height}
                    x2={cfg.panel.x + cfg.panel.width}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  <line
                    data-section="chart-line-coppock-axis"
                    data-panel={cfg.name}
                    data-axis="y"
                    x1={cfg.panel.x}
                    y1={cfg.panel.y}
                    x2={cfg.panel.x}
                    y2={cfg.panel.y + cfg.panel.height}
                  />
                  {cfg.yt.map((t, i) => (
                    <g
                      key={`yt-${cfg.name}-${i}`}
                      data-section="chart-line-coppock-tick"
                      data-panel={cfg.name}
                      data-axis="y"
                    >
                      <line
                        x1={cfg.panel.x - 4}
                        x2={cfg.panel.x}
                        y1={t.py}
                        y2={t.py}
                      />
                      <text
                        data-section="chart-line-coppock-tick-label"
                        data-panel={cfg.name}
                        data-axis="y"
                        x={cfg.panel.x - 6}
                        y={t.py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              <g data-section="chart-line-coppock-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => (
                  <g
                    key={`tx-${i}`}
                    data-section="chart-line-coppock-tick"
                    data-axis="x"
                  >
                    <line
                      x1={t.px}
                      x2={t.px}
                      y1={cp.y + cp.height}
                      y2={cp.y + cp.height + 4}
                    />
                    <text
                      data-section="chart-line-coppock-tick-label"
                      data-axis="x"
                      x={t.px}
                      y={cp.y + cp.height + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill={axisColor}
                      stroke="none"
                    >
                      {formatX(t.value)}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          ) : null}

          <g data-section="chart-line-coppock-panel-labels">
            <text
              data-section="chart-line-coppock-panel-label"
              data-panel="price"
              x={pp.x + pp.width / 2}
              y={pp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Value
            </text>
            <text
              data-section="chart-line-coppock-panel-label"
              data-panel="coppock"
              x={cp.x + cp.width / 2}
              y={cp.y - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              Coppock
            </text>
          </g>

          {valueVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Value line"
              data-section="chart-line-coppock-value-path"
              d={layout.pricePath}
              fill="none"
              stroke={valueColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {valueVisible && showDots ? (
            <g data-section="chart-line-coppock-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-coppock-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={valueColor}
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

          {coppockVisible && layout.coppockPath ? (
            <path
              data-section="chart-line-coppock-coppock-line"
              d={layout.coppockPath}
              fill="none"
              stroke={coppockColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {coppockVisible ? (
            <g data-section="chart-line-coppock-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Coppock at x ${formatX(m.x)}: ${formatValue(m.coppock)} (${m.sign})`}
                    data-section="chart-line-coppock-marker"
                    data-point-index={m.index}
                    data-coppock={m.coppock}
                    data-sign={m.sign}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={signColor(m.sign)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-coppock-tooltip"
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
                  <div data-section="chart-line-coppock-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-coppock-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-coppock-tooltip-coppock">
                    coppock:{' '}
                    {d.coppock === null ? 'n/a' : formatValue(d.coppock)}
                  </div>
                  <div data-section="chart-line-coppock-tooltip-sign">
                    sign: {d.sign}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-coppock-legend"
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
                data-section="chart-line-coppock-legend-item"
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
                  data-section="chart-line-coppock-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-coppock-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-coppock-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} above, {layout.negativeCount} below
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCoppock.displayName = 'ChartLineCoppock';
