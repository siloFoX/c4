import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_STARC_WIDTH = 560;
export const DEFAULT_CHART_LINE_STARC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_STARC_PADDING = 40;
export const DEFAULT_CHART_LINE_STARC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STARC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STARC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STARC_MA_PERIOD = 6;
export const DEFAULT_CHART_LINE_STARC_ATR_PERIOD = 15;
export const DEFAULT_CHART_LINE_STARC_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_STARC_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_STARC_BAND_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_STARC_MIDDLE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_STARC_FILL_COLOR = 'rgba(8,145,178,0.10)';
export const DEFAULT_CHART_LINE_STARC_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STARC_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STARC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STARC_AXIS_COLOR = '#cbd5e1';

export type ChartLineStarcZone = 'above' | 'below' | 'inside' | 'none';

export interface ChartLineStarcPoint {
  x: number;
  value: number;
}

export interface ChartLineStarcBands {
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
}

export interface ChartLineStarcSample {
  index: number;
  x: number;
  value: number;
  middle: number | null;
  upper: number | null;
  lower: number | null;
  zone: ChartLineStarcZone;
}

export interface ChartLineStarcRun {
  series: ChartLineStarcPoint[];
  maPeriod: number;
  atrPeriod: number;
  multiplier: number;
  middle: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  samples: ChartLineStarcSample[];
  middleFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  ok: boolean;
}

export interface ChartLineStarcPriceDot {
  index: number;
  x: number;
  value: number;
  middle: number | null;
  upper: number | null;
  lower: number | null;
  zone: ChartLineStarcZone;
  px: number;
  py: number;
}

export interface ChartLineStarcMarker {
  index: number;
  x: number;
  value: number;
  zone: ChartLineStarcZone;
  px: number;
  py: number;
}

export interface ChartLineStarcPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineStarcLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineStarcPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineStarcPriceDot[];
  upperPath: string;
  lowerPath: string;
  middlePath: string;
  channelArea: string;
  markers: ChartLineStarcMarker[];
  maPeriod: number;
  atrPeriod: number;
  multiplier: number;
  middleFinal: number;
  upperFinal: number;
  lowerFinal: number;
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineStarcLayoutOptions {
  data: readonly ChartLineStarcPoint[];
  maPeriod?: number;
  atrPeriod?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineStarcProps {
  data: readonly ChartLineStarcPoint[];
  maPeriod?: number;
  atrPeriod?: number;
  multiplier?: number;
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
  bandColor?: string;
  middleColor?: string;
  fillColor?: string;
  aboveColor?: string;
  belowColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBands?: boolean;
  showMiddle?: boolean;
  showChannelFill?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineStarcPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineStarcFinitePoints(
  points: readonly ChartLineStarcPoint[] | null | undefined,
): ChartLineStarcPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineStarcPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a STARC moving-average or ATR length to an integer of at
 * least 2. A non-finite or sub-2 value falls back to `fallback`;
 * a fractional value floors.
 */
export function normalizeLineStarcPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * Coerce a STARC band multiplier to a positive finite number. A
 * non-finite or non-positive value falls back to `fallback`.
 */
export function normalizeLineStarcMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (!isFiniteNumber(multiplier) || multiplier <= 0) return fallback;
  return multiplier;
}

/**
 * The simple moving average of the close over `period` bars --
 * the STARC middle band. Bars before the window is full are null.
 */
export function computeLineStarcSma(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineStarcPeriod(period, DEFAULT_CHART_LINE_STARC_MA_PERIOD);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const c = closes[k];
      if (!isFiniteNumber(c)) {
        valid = false;
        break;
      }
      sum += c;
    }
    if (valid) out[i] = sum / p;
  }
  return out;
}

/**
 * Welles Wilder's Average True Range over the close-to-close true
 * range. The first ATR (at index `period`) is the simple mean of
 * the first `period` true ranges; later values use Wilder
 * smoothing `(prev * (period - 1) + tr) / period`.
 */
export function computeLineStarcAtr(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineStarcPeriod(
    period,
    DEFAULT_CHART_LINE_STARC_ATR_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  let sum = 0;
  for (let i = 1; i <= p; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out;
    sum += Math.abs(cur - prev);
  }
  let atr = sum / p;
  out[p] = atr;
  for (let i = p + 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out;
    atr = (atr * (p - 1) + Math.abs(cur - prev)) / p;
    out[i] = atr;
  }
  return out;
}

/**
 * The STARC Bands. The middle band is a short moving average of
 * the close; the upper and lower bands sit `multiplier` average
 * true ranges above and below it. Upper and lower are null until
 * both the moving average and the ATR are defined.
 */
export function computeLineStarc(
  closes: readonly number[] | null | undefined,
  maPeriod: number,
  atrPeriod: number,
  multiplier: number,
): ChartLineStarcBands {
  if (!Array.isArray(closes)) return { middle: [], upper: [], lower: [] };
  const middle = computeLineStarcSma(closes, maPeriod);
  const atr = computeLineStarcAtr(closes, atrPeriod);
  const m = normalizeLineStarcMultiplier(
    multiplier,
    DEFAULT_CHART_LINE_STARC_MULTIPLIER,
  );
  const n = closes.length;
  const upper: (number | null)[] = new Array(n).fill(null);
  const lower: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const s = middle[i];
    const a = atr[i];
    if (!isFiniteNumber(s) || !isFiniteNumber(a)) continue;
    upper[i] = s + m * a;
    lower[i] = s - m * a;
  }
  return { middle, upper, lower };
}

function classifyZone(
  value: number,
  upper: number | null,
  lower: number | null,
): ChartLineStarcZone {
  if (upper === null || lower === null) return 'none';
  if (value > upper) return 'above';
  if (value < lower) return 'below';
  return 'inside';
}

export function runLineStarc(
  points: readonly ChartLineStarcPoint[] | null | undefined,
  options?: { maPeriod?: number; atrPeriod?: number; multiplier?: number },
): ChartLineStarcRun {
  const finite = getLineStarcFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const maPeriod = normalizeLineStarcPeriod(
    options?.maPeriod ?? DEFAULT_CHART_LINE_STARC_MA_PERIOD,
    DEFAULT_CHART_LINE_STARC_MA_PERIOD,
  );
  const atrPeriod = normalizeLineStarcPeriod(
    options?.atrPeriod ?? DEFAULT_CHART_LINE_STARC_ATR_PERIOD,
    DEFAULT_CHART_LINE_STARC_ATR_PERIOD,
  );
  const multiplier = normalizeLineStarcMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_STARC_MULTIPLIER,
    DEFAULT_CHART_LINE_STARC_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      maPeriod,
      atrPeriod,
      multiplier,
      middle: [],
      upper: [],
      lower: [],
      samples: [],
      middleFinal: NaN,
      upperFinal: NaN,
      lowerFinal: NaN,
      aboveCount: 0,
      belowCount: 0,
      insideCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const { middle, upper, lower } = computeLineStarc(
    closes,
    maPeriod,
    atrPeriod,
    multiplier,
  );

  const samples: ChartLineStarcSample[] = series.map((p, i) => {
    const u = upper[i] ?? null;
    const l = lower[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      middle: middle[i] ?? null,
      upper: u,
      lower: l,
      zone: classifyZone(p.value, u, l),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  let middleFinal = NaN;
  let upperFinal = NaN;
  let lowerFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'above') aboveCount += 1;
    else if (s.zone === 'below') belowCount += 1;
    else if (s.zone === 'inside') insideCount += 1;
    if (s.middle !== null) middleFinal = s.middle;
    if (s.upper !== null) upperFinal = s.upper;
    if (s.lower !== null) lowerFinal = s.lower;
  }

  return {
    series = [],
    maPeriod,
    atrPeriod,
    multiplier,
    middle,
    upper,
    lower,
    samples,
    middleFinal,
    upperFinal,
    lowerFinal,
    aboveCount,
    belowCount,
    insideCount,
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

export function computeLineStarcLayout(
  options: ComputeLineStarcLayoutOptions,
): ChartLineStarcLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_STARC_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineStarc(data, {
    ...(isFiniteNumber(options.maPeriod) ? { maPeriod: options.maPeriod } : {}),
    ...(isFiniteNumber(options.atrPeriod)
      ? { atrPeriod: options.atrPeriod }
      : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });

  const emptyPanel: ChartLineStarcPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineStarcLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    upperPath: '',
    lowerPath: '',
    middlePath: '',
    channelArea: '',
    markers: [],
    maPeriod: run.maPeriod,
    atrPeriod: run.atrPeriod,
    multiplier: run.multiplier,
    middleFinal: NaN,
    upperFinal: NaN,
    lowerFinal: NaN,
    aboveCount: 0,
    belowCount: 0,
    insideCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineStarcPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.upper !== null) {
      if (s.upper < yLo) yLo = s.upper;
      if (s.upper > yHi) yHi = s.upper;
    }
    if (s.lower !== null) {
      if (s.lower < yLo) yLo = s.lower;
      if (s.lower > yHi) yHi = s.lower;
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

  const priceDots: ChartLineStarcPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    middle: s.middle,
    upper: s.upper,
    lower: s.lower,
    zone: s.zone,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const upperPts: { px: number; py: number }[] = [];
  const lowerPts: { px: number; py: number }[] = [];
  const middlePts: { px: number; py: number }[] = [];
  const markers: ChartLineStarcMarker[] = [];
  for (const s of run.samples) {
    if (s.upper !== null) {
      upperPts.push({ px: projectX(s.x), py: projectY(s.upper) });
    }
    if (s.lower !== null) {
      lowerPts.push({ px: projectX(s.x), py: projectY(s.lower) });
    }
    if (s.middle !== null) {
      middlePts.push({ px: projectX(s.x), py: projectY(s.middle) });
    }
    if (s.zone !== 'none') {
      markers.push({
        index: s.index,
        x: s.x,
        value: s.value,
        zone: s.zone,
        px: projectX(s.x),
        py: projectY(s.value),
      });
    }
  }

  let channelArea = '';
  if (upperPts.length > 0 && lowerPts.length === upperPts.length) {
    const parts: string[] = [];
    for (let i = 0; i < upperPts.length; i += 1) {
      const p = upperPts[i]!;
      parts.push(
        `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`,
      );
    }
    for (let i = lowerPts.length - 1; i >= 0; i -= 1) {
      const p = lowerPts[i]!;
      parts.push(`L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
    }
    parts.push('Z');
    channelArea = parts.join(' ');
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    upperPath: buildPath(upperPts),
    lowerPath: buildPath(lowerPts),
    middlePath: buildPath(middlePts),
    channelArea,
    markers,
    maPeriod: run.maPeriod,
    atrPeriod: run.atrPeriod,
    multiplier: run.multiplier,
    middleFinal: run.middleFinal,
    upperFinal: run.upperFinal,
    lowerFinal: run.lowerFinal,
    aboveCount: run.aboveCount,
    belowCount: run.belowCount,
    insideCount: run.insideCount,
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

export function describeLineStarcChart(
  data: readonly ChartLineStarcPoint[] | null | undefined,
  options?: { maPeriod?: number; atrPeriod?: number; multiplier?: number },
): string {
  const run = runLineStarc(data, options);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with STARC Bands (MA ${run.maPeriod}, ATR ${run.atrPeriod}): the price line is overlaid with the STARC channel. The middle band is a short ${run.maPeriod}-bar simple moving average of the close; the upper and lower bands sit ${run.multiplier} average true ranges above and below that moving average. The bands widen as volatility rises and narrow as it falls. The close pierces above the upper band on ${run.aboveCount} bars, below the lower on ${run.belowCount} and stays inside on ${run.insideCount} across ${run.samples.length} bars.`;
}

const STARC_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineStarc = forwardRef<HTMLDivElement, ChartLineStarcProps>(
  function ChartLineStarc(
    props: ChartLineStarcProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      maPeriod,
      atrPeriod,
      multiplier,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_STARC_WIDTH,
      height = DEFAULT_CHART_LINE_STARC_HEIGHT,
      padding = DEFAULT_CHART_LINE_STARC_PADDING,
      tickCount = DEFAULT_CHART_LINE_STARC_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_STARC_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_STARC_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_STARC_PRICE_COLOR,
      bandColor = DEFAULT_CHART_LINE_STARC_BAND_COLOR,
      middleColor = DEFAULT_CHART_LINE_STARC_MIDDLE_COLOR,
      fillColor = DEFAULT_CHART_LINE_STARC_FILL_COLOR,
      aboveColor = DEFAULT_CHART_LINE_STARC_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_STARC_BELOW_COLOR,
      gridColor = DEFAULT_CHART_LINE_STARC_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_STARC_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showBands = true,
      showMiddle = true,
      showChannelFill = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a STARC Bands overlay',
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
        computeLineStarcLayout({
          data,
          width,
          height,
          padding,
          tickCount,
          ...(isFiniteNumber(maPeriod) ? { maPeriod } : {}),
          ...(isFiniteNumber(atrPeriod) ? { atrPeriod } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [data, width, height, padding, tickCount, maPeriod, atrPeriod, multiplier],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineStarcChart(data, {
          ...(isFiniteNumber(maPeriod) ? { maPeriod } : {}),
          ...(isFiniteNumber(atrPeriod) ? { atrPeriod } : {}),
          ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        }),
      [ariaDescription, data, maPeriod, atrPeriod, multiplier],
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
          data-section="chart-line-starc"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-starc-aria-desc"
            style={STARC_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const panel = layout.panel;
    const priceVisible = !hiddenSet.has('price');
    const bandsVisible = showBands && !hiddenSet.has('bands');
    const middleVisible = showMiddle && !hiddenSet.has('middle');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineStarcZone): string => {
      if (zone === 'above') return aboveColor;
      if (zone === 'below') return belowColor;
      return bandColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'bands', label: 'Bands', color: bandColor },
      { id: 'middle', label: 'Middle', color: middleColor },
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
        data-section="chart-line-starc"
        data-empty="false"
        data-ma-period={layout.maPeriod}
        data-atr-period={layout.atrPeriod}
        data-multiplier={layout.multiplier}
        data-middle-final={layout.middleFinal}
        data-upper-final={layout.upperFinal}
        data-lower-final={layout.lowerFinal}
        data-above-count={layout.aboveCount}
        data-below-count={layout.belowCount}
        data-inside-count={layout.insideCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-starc-aria-desc"
          style={STARC_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-starc-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-starc-badge"
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
                data-section="chart-line-starc-badge-icon"
                aria-hidden="true"
                style={{ color: bandColor }}
              >
                STARC
              </span>
              <span data-section="chart-line-starc-badge-config">
                {layout.maPeriod}/{layout.atrPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-starc-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-starc-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-starc-grid-line"
                    x1={panel.x}
                    x2={panel.x + panel.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-starc-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-starc-axis"
                  data-axis="y"
                  x1={panel.x}
                  y1={panel.y}
                  x2={panel.x}
                  y2={panel.y + panel.height}
                />
                <line
                  data-section="chart-line-starc-axis"
                  data-axis="x"
                  x1={panel.x}
                  y1={panel.y + panel.height}
                  x2={panel.x + panel.width}
                  y2={panel.y + panel.height}
                />
                {layout.yTicks.map((t, i) => (
                  <text
                    key={`yt-${i}`}
                    data-section="chart-line-starc-tick-label"
                    data-axis="y"
                    x={panel.x - 6}
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
                    data-section="chart-line-starc-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={panel.y + panel.height + 14}
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

            {bandsVisible && showChannelFill && layout.channelArea ? (
              <path
                data-section="chart-line-starc-channel-area"
                d={layout.channelArea}
                fill={fillColor}
                stroke="none"
              />
            ) : null}

            {bandsVisible && layout.upperPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="STARC upper band"
                data-section="chart-line-starc-upper-path"
                d={layout.upperPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {bandsVisible && layout.lowerPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="STARC lower band"
                data-section="chart-line-starc-lower-path"
                d={layout.lowerPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {middleVisible && layout.middlePath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="STARC middle band"
                data-section="chart-line-starc-middle-path"
                d={layout.middlePath}
                fill="none"
                stroke={middleColor}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-starc-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-starc-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-starc-dot"
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

            {priceVisible && showMarkers ? (
              <g data-section="chart-line-starc-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: value ${formatValue(m.value)}, ${m.zone} the channel`}
                      data-section="chart-line-starc-marker"
                      data-point-index={m.index}
                      data-zone={m.zone}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={zoneColor(m.zone)}
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
                    data-section="chart-line-starc-tooltip"
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
                    <div data-section="chart-line-starc-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-starc-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-starc-tooltip-upper">
                      upper: {fmtNullable(d.upper)}
                    </div>
                    <div data-section="chart-line-starc-tooltip-middle">
                      middle: {fmtNullable(d.middle)}
                    </div>
                    <div data-section="chart-line-starc-tooltip-lower">
                      lower: {fmtNullable(d.lower)}
                    </div>
                    <div data-section="chart-line-starc-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-starc-legend"
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
                  data-section="chart-line-starc-legend-item"
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
                    data-section="chart-line-starc-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-starc-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-starc-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.aboveCount} above, {layout.belowCount} below,{' '}
              {layout.insideCount} inside
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineStarc.displayName = 'ChartLineStarc';
