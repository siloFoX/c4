import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TSI_WIDTH = 560;
export const DEFAULT_CHART_LINE_TSI_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TSI_PADDING = 40;
export const DEFAULT_CHART_LINE_TSI_GAP = 26;
export const DEFAULT_CHART_LINE_TSI_PRICE_PANEL_RATIO = 0.56;
export const DEFAULT_CHART_LINE_TSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSI_LONG_PERIOD = 25;
export const DEFAULT_CHART_LINE_TSI_SHORT_PERIOD = 13;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_PERIOD = 13;
export const DEFAULT_CHART_LINE_TSI_OVERBOUGHT = 25;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD = -25;
export const DEFAULT_CHART_LINE_TSI_VALUE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TSI_TSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TSI_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TSI_LEVEL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSI_AXIS_COLOR = '#cbd5e1';

export interface ChartLineTsiPoint {
  x: number;
  value: number;
}

export interface ChartLineTsiMomentum {
  momentum: (number | null)[];
  absMomentum: (number | null)[];
}

export interface ChartLineTsiSample {
  index: number;
  x: number;
  value: number;
  tsi: number | null;
  signal: number | null;
}

export interface ChartLineTsiRun {
  series: ChartLineTsiPoint[];
  longPeriod: number;
  shortPeriod: number;
  signalPeriod: number;
  tsi: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineTsiSample[];
  tsiFinal: number;
  signalFinal: number;
  tsiMin: number;
  tsiMax: number;
  ok: boolean;
}

export interface ChartLineTsiPriceDot {
  index: number;
  x: number;
  value: number;
  tsi: number | null;
  signal: number | null;
  px: number;
  py: number;
}

export interface ChartLineTsiMarker {
  index: number;
  x: number;
  tsi: number;
  px: number;
  py: number;
}

export interface ChartLineTsiPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTsiLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTsiPanel;
  tsiPanel: ChartLineTsiPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  tsiYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineTsiPriceDot[];
  tsiPath: string;
  signalPath: string;
  markers: ChartLineTsiMarker[];
  zeroY: number;
  overbought: number;
  oversold: number;
  overboughtY: number;
  oversoldY: number;
  longPeriod: number;
  shortPeriod: number;
  signalPeriod: number;
  tsiFinal: number;
  signalFinal: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTsiLayoutOptions {
  data: readonly ChartLineTsiPoint[];
  longPeriod?: number;
  shortPeriod?: number;
  signalPeriod?: number;
  overbought?: number;
  oversold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineTsiProps {
  data: readonly ChartLineTsiPoint[];
  longPeriod?: number;
  shortPeriod?: number;
  signalPeriod?: number;
  overbought?: number;
  oversold?: number;
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
  tsiColor?: string;
  signalColor?: string;
  zeroColor?: string;
  levelColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTsi?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showLevels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTsiPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTsiFinitePoints(
  points: readonly ChartLineTsiPoint[] | null | undefined,
): ChartLineTsiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTsiPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineTsiPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * The per-period price momentum and its absolute value. Index 0 has
 * no prior value and reads null for both.
 */
export function computeLineTsiMomentum(
  values: readonly number[] | null | undefined,
): ChartLineTsiMomentum {
  if (!Array.isArray(values)) return { momentum: [], absMomentum: [] };
  const n = values.length;
  const momentum: (number | null)[] = new Array(n).fill(null);
  const absMomentum: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const m = values[i]! - values[i - 1]!;
    momentum[i] = m;
    absMomentum[i] = Math.abs(m);
  }
  return { momentum, absMomentum };
}

/**
 * An exponential moving average that tolerates leading nulls: it
 * seeds at the first defined value and rolls forward with the
 * smoothing factor `k = 2/(period+1)`. Leading nulls stay null.
 */
export function computeLineTsiEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const k = 2 / (p + 1);
  const out: (number | null)[] = new Array(n).fill(null);
  let firstIdx = -1;
  for (let i = 0; i < n; i += 1) {
    if (src[i] !== null && src[i] !== undefined) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx === -1) return out;
  let ema = src[firstIdx] as number;
  out[firstIdx] = ema;
  for (let i = firstIdx + 1; i < n; i += 1) {
    if (src[i] === null || src[i] === undefined) continue;
    ema = (src[i] as number) * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/**
 * William Blau's True Strength Index. The price momentum is
 * double-smoothed (an EMA of `longPeriod` then an EMA of
 * `shortPeriod`); the absolute momentum is double-smoothed the same
 * way. TSI = 100 * doubleSmoothedMomentum / doubleSmoothedAbsMomentum.
 * Because |momentum| dominates momentum the ratio is bounded, so TSI
 * stays within -100 to +100. A flat series reads 0.
 */
export function computeLineTsi(
  values: readonly number[] | null | undefined,
  longPeriod: number,
  shortPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const { momentum, absMomentum } = computeLineTsiMomentum(values);
  const ema2 = computeLineTsiEma(
    computeLineTsiEma(momentum, longPeriod),
    shortPeriod,
  );
  const ema2abs = computeLineTsiEma(
    computeLineTsiEma(absMomentum, longPeriod),
    shortPeriod,
  );
  const tsi: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const num = ema2[i];
    const den = ema2abs[i];
    if (num === null || num === undefined || den === null || den === undefined) {
      continue;
    }
    const raw = den === 0 ? 0 : (100 * num) / den;
    tsi[i] = raw === 0 ? 0 : raw;
  }
  return tsi;
}

export function runLineTsi(
  points: readonly ChartLineTsiPoint[] | null | undefined,
  options?: {
    longPeriod?: number;
    shortPeriod?: number;
    signalPeriod?: number;
  },
): ChartLineTsiRun {
  const finite = getLineTsiFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const longPeriod = normalizeLineTsiPeriod(
    options?.longPeriod ?? DEFAULT_CHART_LINE_TSI_LONG_PERIOD,
    DEFAULT_CHART_LINE_TSI_LONG_PERIOD,
  );
  const shortPeriod = normalizeLineTsiPeriod(
    options?.shortPeriod ?? DEFAULT_CHART_LINE_TSI_SHORT_PERIOD,
    DEFAULT_CHART_LINE_TSI_SHORT_PERIOD,
  );
  const signalPeriod = normalizeLineTsiPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_TSI_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_TSI_SIGNAL_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      longPeriod,
      shortPeriod,
      signalPeriod,
      tsi: [],
      signal: [],
      samples: [],
      tsiFinal: NaN,
      signalFinal: NaN,
      tsiMin: NaN,
      tsiMax: NaN,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const tsi = computeLineTsi(values, longPeriod, shortPeriod);
  const signal = computeLineTsiEma(tsi, signalPeriod);
  const samples: ChartLineTsiSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    tsi: tsi[i] ?? null,
    signal: signal[i] ?? null,
  }));

  const lastDefined = (arr: readonly (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null) return arr[i] as number;
    }
    return NaN;
  };
  let tsiMin = NaN;
  let tsiMax = NaN;
  for (const v of tsi) {
    if (v === null) continue;
    if (Number.isNaN(tsiMin) || v < tsiMin) tsiMin = v;
    if (Number.isNaN(tsiMax) || v > tsiMax) tsiMax = v;
  }

  return {
    series,
    longPeriod,
    shortPeriod,
    signalPeriod,
    tsi,
    signal,
    samples,
    tsiFinal: lastDefined(tsi),
    signalFinal: lastDefined(signal),
    tsiMin,
    tsiMax,
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

export function computeLineTsiLayout(
  options: ComputeLineTsiLayoutOptions,
): ChartLineTsiLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TSI_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_TSI_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_TSI_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));
  const overbought = isFiniteNumber(options.overbought)
    ? options.overbought
    : DEFAULT_CHART_LINE_TSI_OVERBOUGHT;
  const oversold = isFiniteNumber(options.oversold)
    ? options.oversold
    : DEFAULT_CHART_LINE_TSI_OVERSOLD;

  const emptyPanel: ChartLineTsiPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineTsi(data, {
    ...(isFiniteNumber(options.longPeriod)
      ? { longPeriod: options.longPeriod }
      : {}),
    ...(isFiniteNumber(options.shortPeriod)
      ? { shortPeriod: options.shortPeriod }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });
  const empty: ChartLineTsiLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    tsiPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    tsiYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    tsiPath: '',
    signalPath: '',
    markers: [],
    zeroY: 0,
    overbought,
    oversold,
    overboughtY: 0,
    oversoldY: 0,
    longPeriod: run.longPeriod,
    shortPeriod: run.shortPeriod,
    signalPeriod: run.signalPeriod,
    tsiFinal: NaN,
    signalFinal: NaN,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const tsiH = usableHeight - priceH;
  if (priceH <= 0 || tsiH <= 0) return empty;

  const pricePanel: ChartLineTsiPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const tsiPanel: ChartLineTsiPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: tsiH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  // TSI is bounded to -100..+100.
  const projectTsiY = (v: number): number =>
    tsiPanel.y + tsiPanel.height - ((v + 100) / 200) * tsiPanel.height;

  const priceDots: ChartLineTsiPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    tsi: s.tsi,
    signal: s.signal,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const markers: ChartLineTsiMarker[] = [];
  const tsiPts: { px: number; py: number }[] = [];
  const signalPts: { px: number; py: number }[] = [];
  for (const s of run.samples) {
    const px = projectX(s.x);
    if (s.tsi !== null) {
      const py = projectTsiY(s.tsi);
      tsiPts.push({ px, py });
      markers.push({ index: s.index, x: s.x, tsi: s.tsi, px, py });
    }
    if (s.signal !== null) {
      signalPts.push({ px, py: projectTsiY(s.signal) });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    tsiPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    tsiYTicks: computeTicks(-100, 100, tickCount).map((v) => ({
      value: v,
      py: projectTsiY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    tsiPath: buildPath(tsiPts),
    signalPath: buildPath(signalPts),
    markers,
    zeroY: projectTsiY(0),
    overbought,
    oversold,
    overboughtY: projectTsiY(overbought),
    oversoldY: projectTsiY(oversold),
    longPeriod: run.longPeriod,
    shortPeriod: run.shortPeriod,
    signalPeriod: run.signalPeriod,
    tsiFinal: run.tsiFinal,
    signalFinal: run.signalFinal,
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

export function describeLineTsiChart(
  data: readonly ChartLineTsiPoint[] | null | undefined,
  options?: { longPeriod?: number; shortPeriod?: number; signalPeriod?: number },
): string {
  const run = runLineTsi(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a True Strength Index double-smoothed momentum oscillator panel (long ${run.longPeriod}, short ${run.shortPeriod}): TSI double-smooths price momentum and normalizes it by the double-smoothed absolute momentum, a bounded -100 to +100 reading that crosses zero as momentum turns. Across ${run.samples.length} periods.`;
}

const TSI_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTsi = forwardRef<HTMLDivElement, ChartLineTsiProps>(
  function ChartLineTsi(
    props: ChartLineTsiProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      longPeriod,
      shortPeriod,
      signalPeriod,
      overbought,
      oversold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TSI_WIDTH,
      height = DEFAULT_CHART_LINE_TSI_HEIGHT,
      padding = DEFAULT_CHART_LINE_TSI_PADDING,
      gap = DEFAULT_CHART_LINE_TSI_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_TSI_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_TSI_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TSI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TSI_DOT_RADIUS,
      valueColor = DEFAULT_CHART_LINE_TSI_VALUE_COLOR,
      tsiColor = DEFAULT_CHART_LINE_TSI_TSI_COLOR,
      signalColor = DEFAULT_CHART_LINE_TSI_SIGNAL_COLOR,
      zeroColor = DEFAULT_CHART_LINE_TSI_ZERO_COLOR,
      levelColor = DEFAULT_CHART_LINE_TSI_LEVEL_COLOR,
      gridColor = DEFAULT_CHART_LINE_TSI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TSI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTsi = true,
      showSignal = true,
      showZeroLine = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a True Strength Index oscillator panel',
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
        computeLineTsiLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(longPeriod) ? { longPeriod } : {}),
          ...(isFiniteNumber(shortPeriod) ? { shortPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
          ...(isFiniteNumber(overbought) ? { overbought } : {}),
          ...(isFiniteNumber(oversold) ? { oversold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        longPeriod,
        shortPeriod,
        signalPeriod,
        overbought,
        oversold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineTsiChart(data, {
          ...(isFiniteNumber(longPeriod) ? { longPeriod } : {}),
          ...(isFiniteNumber(shortPeriod) ? { shortPeriod } : {}),
          ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
        }),
      [ariaDescription, data, longPeriod, shortPeriod, signalPeriod],
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
          data-section="chart-line-tsi"
          data-empty="true"
          data-long-period={layout.longPeriod}
          data-animate={animate ? 'true' : 'false'}
        >
          <span id={descId} data-section="chart-line-tsi-aria-desc" style={TSI_SR_STYLE}>
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const tp = layout.tsiPanel;
    const valueVisible = !hiddenSet.has('value');
    const tsiVisible = showTsi && !hiddenSet.has('tsi');
    const signalVisible = showSignal && !hiddenSet.has('signal');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'value', label: 'Value', color: valueColor },
      { id: 'tsi', label: 'TSI', color: tsiColor },
      { id: 'signal', label: 'Signal', color: signalColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-tsi"
        data-empty="false"
        data-long-period={layout.longPeriod}
        data-short-period={layout.shortPeriod}
        data-signal-period={layout.signalPeriod}
        data-tsi-final={layout.tsiFinal}
        data-signal-final={layout.signalFinal}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-tsi-aria-desc" style={TSI_SR_STYLE}>
          {summary}
        </span>

        <div
          data-section="chart-line-tsi-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-tsi-badge"
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
                data-section="chart-line-tsi-badge-icon"
                aria-hidden="true"
                style={{ color: tsiColor }}
              >
                TSI
              </span>
              <span data-section="chart-line-tsi-badge-long">
                L={layout.longPeriod}
              </span>
              <span data-section="chart-line-tsi-badge-short">
                S={layout.shortPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-tsi-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-tsi-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-tsi-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.tsiYTicks.map((t, i) => (
                  <line
                    key={`tgy-${i}`}
                    data-section="chart-line-tsi-grid-line"
                    data-panel="tsi"
                    x1={tp.x}
                    x2={tp.x + tp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showLevels ? (
              <g data-section="chart-line-tsi-levels">
                {[
                  { name: 'overbought', y: layout.overboughtY, level: layout.overbought },
                  { name: 'oversold', y: layout.oversoldY, level: layout.oversold },
                ].map((lv) => (
                  <g
                    key={`lv-${lv.name}`}
                    data-section="chart-line-tsi-level"
                    data-level={lv.name}
                  >
                    <line
                      data-section="chart-line-tsi-level-line"
                      data-level={lv.name}
                      x1={tp.x}
                      x2={tp.x + tp.width}
                      y1={lv.y}
                      y2={lv.y}
                      stroke={levelColor}
                      strokeWidth={1}
                      strokeDasharray="4 3"
                    />
                    <text
                      data-section="chart-line-tsi-level-label"
                      data-level={lv.name}
                      x={tp.x + tp.width - 2}
                      y={lv.y - 3}
                      textAnchor="end"
                      fontSize={9}
                      fill={levelColor}
                      stroke="none"
                    >
                      {formatValue(lv.level)}
                    </text>
                  </g>
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-tsi-zero-line"
                x1={tp.x}
                x2={tp.x + tp.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-tsi-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: tp, name: 'tsi', yt: layout.tsiYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-tsi-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-tsi-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-tsi-axis"
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
                        data-section="chart-line-tsi-tick"
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
                          data-section="chart-line-tsi-tick-label"
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
                <g data-section="chart-line-tsi-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-tsi-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={tp.y + tp.height}
                        y2={tp.y + tp.height + 4}
                      />
                      <text
                        data-section="chart-line-tsi-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={tp.y + tp.height + 14}
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

            <g data-section="chart-line-tsi-panel-labels">
              <text
                data-section="chart-line-tsi-panel-label"
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
                data-section="chart-line-tsi-panel-label"
                data-panel="tsi"
                x={tp.x + tp.width / 2}
                y={tp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                TSI
              </text>
            </g>

            {valueVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Value line"
                data-section="chart-line-tsi-value-path"
                d={layout.pricePath}
                fill="none"
                stroke={valueColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {valueVisible && showDots ? (
              <g data-section="chart-line-tsi-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-tsi-dot"
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

            {signalVisible && layout.signalPath ? (
              <path
                data-section="chart-line-tsi-signal-line"
                d={layout.signalPath}
                fill="none"
                stroke={signalColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            ) : null}

            {tsiVisible && layout.tsiPath ? (
              <path
                data-section="chart-line-tsi-tsi-line"
                d={layout.tsiPath}
                fill="none"
                stroke={tsiColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {tsiVisible ? (
              <g data-section="chart-line-tsi-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TSI at x ${formatX(m.x)}: ${formatValue(m.tsi)}`}
                      data-section="chart-line-tsi-marker"
                      data-point-index={m.index}
                      data-tsi={m.tsi}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={tsiColor}
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
                const d = layout.priceDots.find(
                  (x) => x.index === hoverIndex,
                );
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-tsi-tooltip"
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
                    <div data-section="chart-line-tsi-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-tsi-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-tsi-tooltip-tsi">
                      tsi: {d.tsi === null ? 'n/a' : formatValue(d.tsi)}
                    </div>
                    <div data-section="chart-line-tsi-tooltip-signal">
                      signal:{' '}
                      {d.signal === null ? 'n/a' : formatValue(d.signal)}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-tsi-legend"
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
                  data-section="chart-line-tsi-legend-item"
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
                    data-section="chart-line-tsi-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-tsi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-tsi-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              final TSI {formatValue(layout.tsiFinal)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTsi.displayName = 'ChartLineTsi';
