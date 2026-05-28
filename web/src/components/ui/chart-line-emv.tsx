import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_EMV_WIDTH = 560;
export const DEFAULT_CHART_LINE_EMV_HEIGHT = 360;
export const DEFAULT_CHART_LINE_EMV_PADDING = 40;
export const DEFAULT_CHART_LINE_EMV_GAP = 26;
export const DEFAULT_CHART_LINE_EMV_PRICE_PANEL_RATIO = 0.52;
export const DEFAULT_CHART_LINE_EMV_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EMV_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EMV_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EMV_SMA_PERIOD = 14;
export const DEFAULT_CHART_LINE_EMV_VOLUME_DIVISOR = 1;
export const DEFAULT_CHART_LINE_EMV_MIDPOINT_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_EMV_BAND_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EMV_EMV_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EMV_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EMV_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EMV_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_EMV_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EMV_AXIS_COLOR = '#cbd5e1';

export type ChartLineEmvSign = 'positive' | 'negative' | 'zero';

export interface ChartLineEmvPoint {
  x: number;
  high: number;
  low: number;
  volume: number;
}

export interface ChartLineEmvSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  volume: number;
  emv1: number | null;
  emv: number | null;
  sign: ChartLineEmvSign;
}

export interface ChartLineEmvRun {
  series: ChartLineEmvPoint[];
  smaPeriod: number;
  volumeDivisor: number;
  midpoint: number[];
  range: number[];
  emv1: (number | null)[];
  emv: (number | null)[];
  samples: ChartLineEmvSample[];
  emvFinal: number;
  emvMin: number;
  emvMax: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineEmvPriceDot {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  volume: number;
  emv1: number | null;
  emv: number | null;
  sign: ChartLineEmvSign;
  px: number;
  py: number;
  highY: number;
  lowY: number;
}

export interface ChartLineEmvMarker {
  index: number;
  x: number;
  emv: number;
  sign: ChartLineEmvSign;
  px: number;
  py: number;
}

export interface ChartLineEmvPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineEmvLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineEmvPanel;
  emvPanel: ChartLineEmvPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  emvYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  emvYBound: number;
  midpointPath: string;
  bandPath: string;
  priceDots: ChartLineEmvPriceDot[];
  emvPath: string;
  markers: ChartLineEmvMarker[];
  zeroY: number;
  smaPeriod: number;
  volumeDivisor: number;
  emvFinal: number;
  emvMin: number;
  emvMax: number;
  positiveCount: number;
  negativeCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineEmvLayoutOptions {
  data: readonly ChartLineEmvPoint[];
  smaPeriod?: number;
  volumeDivisor?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineEmvProps {
  data: readonly ChartLineEmvPoint[];
  smaPeriod?: number;
  volumeDivisor?: number;
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
  midpointColor?: string;
  bandColor?: string;
  emvColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBand?: boolean;
  showEmv?: boolean;
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
  onPointClick?: (payload: { point: ChartLineEmvPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineEmvFinitePoints(
  points: readonly ChartLineEmvPoint[] | null | undefined,
): ChartLineEmvPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineEmvPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.volume),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineEmvPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

function resolveDivisor(divisor: number | undefined): number {
  return isFiniteNumber(divisor) && divisor > 0
    ? divisor
    : DEFAULT_CHART_LINE_EMV_VOLUME_DIVISOR;
}

/**
 * A simple moving average over `period` values, tolerating the
 * leading `null` of the raw EMV series. Each index whose window of
 * `period` values is fully defined reads their mean; the rest read
 * null.
 */
export function computeLineEmvSma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) {
      const mean = sum / p;
      out[i] = mean === 0 ? 0 : mean;
    }
  }
  return out;
}

/**
 * Richard Arms' raw (one-period) Ease of Movement. Each bar's
 * midpoint move is divided by its box ratio -- volume (scaled by the
 * divisor) over the high-low range -- which works out to
 * `distanceMoved * range * divisor / volume`. Index 0 has no prior
 * midpoint so it reads null; a zero volume reads zero.
 */
export function computeLineEmvRaw(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  volumeDivisor: number,
): (number | null)[] {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(volumes)
  ) {
    return [];
  }
  const n = Math.min(highs.length, lows.length, volumes.length);
  const div = resolveDivisor(volumeDivisor);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const mid = (highs[i]! + lows[i]!) / 2;
    const prevMid = (highs[i - 1]! + lows[i - 1]!) / 2;
    const distanceMoved = mid - prevMid;
    const range = highs[i]! - lows[i]!;
    const v = volumes[i]!;
    const raw = v === 0 ? 0 : (distanceMoved * range * div) / v;
    out[i] = raw === 0 ? 0 : raw;
  }
  return out;
}

/**
 * The Ease of Movement: the raw one-period EMV smoothed by a simple
 * moving average. It rises when price advances on light volume and
 * falls when price drops on light volume, swinging around zero.
 */
export function computeLineEmv(
  highs: readonly number[] | null | undefined,
  lows: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  smaPeriod: number,
  volumeDivisor: number,
): {
  midpoint: number[];
  range: number[];
  emv1: (number | null)[];
  emv: (number | null)[];
} {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(volumes)
  ) {
    return { midpoint: [], range: [], emv1: [], emv: [] };
  }
  const n = Math.min(highs.length, lows.length, volumes.length);
  const midpoint: number[] = new Array(n);
  const range: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    midpoint[i] = (highs[i]! + lows[i]!) / 2;
    range[i] = highs[i]! - lows[i]!;
  }
  const emv1 = computeLineEmvRaw(highs, lows, volumes, volumeDivisor);
  const emv = computeLineEmvSma(emv1, smaPeriod);
  return { midpoint, range, emv1, emv };
}

function classifySign(v: number | null): ChartLineEmvSign {
  if (v === null) return 'zero';
  if (v > 0) return 'positive';
  if (v < 0) return 'negative';
  return 'zero';
}

export function runLineEmv(
  points: readonly ChartLineEmvPoint[] | null | undefined,
  options?: { smaPeriod?: number; volumeDivisor?: number },
): ChartLineEmvRun {
  const finite = getLineEmvFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const smaPeriod = normalizeLineEmvPeriod(
    options?.smaPeriod ?? DEFAULT_CHART_LINE_EMV_SMA_PERIOD,
    DEFAULT_CHART_LINE_EMV_SMA_PERIOD,
  );
  const volumeDivisor = resolveDivisor(options?.volumeDivisor);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      smaPeriod,
      volumeDivisor,
      midpoint: [],
      range: [],
      emv1: [],
      emv: [],
      samples: [],
      emvFinal: NaN,
      emvMin: NaN,
      emvMax: NaN,
      positiveCount: 0,
      negativeCount: 0,
      ok: false,
    };
  }

  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const volumes = series.map((p) => p.volume);
  const { midpoint, range, emv1, emv } = computeLineEmv(
    highs,
    lows,
    volumes,
    smaPeriod,
    volumeDivisor,
  );

  const samples: ChartLineEmvSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    high: p.high,
    low: p.low,
    midpoint: midpoint[i]!,
    volume: p.volume,
    emv1: emv1[i] ?? null,
    emv: emv[i] ?? null,
    sign: classifySign(emv[i] ?? null),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i] as number;
    }
    return NaN;
  };

  let emvMin = NaN;
  let emvMax = NaN;
  let positiveCount = 0;
  let negativeCount = 0;
  for (const s of samples) {
    if (s.emv !== null) {
      if (Number.isNaN(emvMin) || s.emv < emvMin) emvMin = s.emv;
      if (Number.isNaN(emvMax) || s.emv > emvMax) emvMax = s.emv;
    }
    if (s.sign === 'positive') positiveCount += 1;
    if (s.sign === 'negative') negativeCount += 1;
  }

  return {
    series = [],
    smaPeriod,
    volumeDivisor,
    midpoint,
    range,
    emv1,
    emv,
    samples,
    emvFinal: lastDefined(emv),
    emvMin,
    emvMax,
    positiveCount,
    negativeCount,
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

function buildBandPath(
  highPts: readonly { px: number; py: number }[],
  lowPts: readonly { px: number; py: number }[],
): string {
  if (highPts.length === 0 || lowPts.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < highPts.length; i += 1) {
    const p = highPts[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  for (let i = lowPts.length - 1; i >= 0; i -= 1) {
    const p = lowPts[i]!;
    parts.push(`L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  parts.push('Z');
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

export function computeLineEmvLayout(
  options: ComputeLineEmvLayoutOptions,
): ChartLineEmvLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_EMV_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_EMV_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_EMV_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineEmvPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const run = runLineEmv(data, {
    ...(isFiniteNumber(options.smaPeriod)
      ? { smaPeriod: options.smaPeriod }
      : {}),
    ...(isFiniteNumber(options.volumeDivisor)
      ? { volumeDivisor: options.volumeDivisor }
      : {}),
  });
  const empty: ChartLineEmvLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    emvPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    emvYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    emvYBound: 0,
    midpointPath: '',
    bandPath: '',
    priceDots: [],
    emvPath: '',
    markers: [],
    zeroY: 0,
    smaPeriod: run.smaPeriod,
    volumeDivisor: run.volumeDivisor,
    emvFinal: NaN,
    emvMin: NaN,
    emvMax: NaN,
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
  const emvH = usableHeight - priceH;
  if (priceH <= 0 || emvH <= 0) return empty;

  const pricePanel: ChartLineEmvPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const emvPanel: ChartLineEmvPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: emvH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  let bound = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.low < pyLo) pyLo = s.low;
    if (s.high > pyHi) pyHi = s.high;
    if (s.emv !== null && Math.abs(s.emv) > bound) bound = Math.abs(s.emv);
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
  const projectEmvY = (v: number): number =>
    emvPanel.y +
    emvPanel.height -
    ((v + bound) / (2 * bound)) * emvPanel.height;

  const priceDots: ChartLineEmvPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    high: s.high,
    low: s.low,
    midpoint: s.midpoint,
    volume: s.volume,
    emv1: s.emv1,
    emv: s.emv,
    sign: s.sign,
    px: projectX(s.x),
    py: projectPriceY(s.midpoint),
    highY: projectPriceY(s.high),
    lowY: projectPriceY(s.low),
  }));

  const highPts = priceDots.map((d) => ({ px: d.px, py: d.highY }));
  const lowPts = priceDots.map((d) => ({ px: d.px, py: d.lowY }));

  const emvPts: { px: number; py: number }[] = [];
  const markers: ChartLineEmvMarker[] = [];
  for (const s of run.samples) {
    if (s.emv !== null) {
      const px = projectX(s.x);
      const py = projectEmvY(s.emv);
      emvPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        emv: s.emv,
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
    emvPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    emvYTicks: computeTicks(-bound, bound, tickCount).map((v) => ({
      value: v,
      py: projectEmvY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    emvYBound: bound,
    midpointPath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    bandPath: buildBandPath(highPts, lowPts),
    priceDots,
    emvPath: buildPath(emvPts),
    markers,
    zeroY: projectEmvY(0),
    smaPeriod: run.smaPeriod,
    volumeDivisor: run.volumeDivisor,
    emvFinal: run.emvFinal,
    emvMin: run.emvMin,
    emvMax: run.emvMax,
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

export function describeLineEmvChart(
  data: readonly ChartLineEmvPoint[] | null | undefined,
  options?: { smaPeriod?: number; volumeDivisor?: number },
): string {
  const run = runLineEmv(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with an Ease of Movement (EMV) panel (SMA ${run.smaPeriod}): the Ease of Movement relates each bar's midpoint price change to its volume and range, then smooths the result with a simple moving average; it rises when price advances on light volume and falls when price drops on light volume, swinging around zero. ${run.positiveCount} readings above and ${run.negativeCount} below the zero line across ${run.samples.length} periods.`;
}

const EMV_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineEmv = forwardRef<HTMLDivElement, ChartLineEmvProps>(
  function ChartLineEmv(
    props: ChartLineEmvProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      smaPeriod,
      volumeDivisor,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_EMV_WIDTH,
      height = DEFAULT_CHART_LINE_EMV_HEIGHT,
      padding = DEFAULT_CHART_LINE_EMV_PADDING,
      gap = DEFAULT_CHART_LINE_EMV_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_EMV_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_EMV_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_EMV_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_EMV_DOT_RADIUS,
      midpointColor = DEFAULT_CHART_LINE_EMV_MIDPOINT_COLOR,
      bandColor = DEFAULT_CHART_LINE_EMV_BAND_COLOR,
      emvColor = DEFAULT_CHART_LINE_EMV_EMV_COLOR,
      positiveColor = DEFAULT_CHART_LINE_EMV_POSITIVE_COLOR,
      negativeColor = DEFAULT_CHART_LINE_EMV_NEGATIVE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_EMV_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_EMV_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_EMV_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showBand = true,
      showEmv = true,
      showZeroLine = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with an Ease of Movement panel',
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
        computeLineEmvLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(smaPeriod) ? { smaPeriod } : {}),
          ...(isFiniteNumber(volumeDivisor) ? { volumeDivisor } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        smaPeriod,
        volumeDivisor,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineEmvChart(data, {
          ...(isFiniteNumber(smaPeriod) ? { smaPeriod } : {}),
          ...(isFiniteNumber(volumeDivisor) ? { volumeDivisor } : {}),
        }),
      [ariaDescription, data, smaPeriod, volumeDivisor],
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
      (s: ChartLineEmvSign): string =>
        s === 'positive'
          ? positiveColor
          : s === 'negative'
            ? negativeColor
            : emvColor,
      [positiveColor, negativeColor, emvColor],
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
          data-section="chart-line-emv"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-emv-aria-desc"
            style={EMV_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const ep = layout.emvPanel;
    const midpointVisible = !hiddenSet.has('midpoint');
    const emvVisible = showEmv && !hiddenSet.has('emv');
    const bandVisible = showBand && midpointVisible;

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'midpoint', label: 'Midpoint', color: midpointColor },
      { id: 'emv', label: 'EMV', color: emvColor },
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
        data-section="chart-line-emv"
        data-empty="false"
        data-sma-period={layout.smaPeriod}
        data-volume-divisor={layout.volumeDivisor}
        data-emv-final={layout.emvFinal}
        data-positive-count={layout.positiveCount}
        data-negative-count={layout.negativeCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-emv-aria-desc"
          style={EMV_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-emv-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-emv-badge"
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
                data-section="chart-line-emv-badge-icon"
                aria-hidden="true"
                style={{ color: emvColor }}
              >
                EMV
              </span>
              <span data-section="chart-line-emv-badge-sma">
                n={layout.smaPeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-emv-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-emv-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-emv-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.emvYTicks.map((t, i) => (
                  <line
                    key={`egy-${i}`}
                    data-section="chart-line-emv-grid-line"
                    data-panel="emv"
                    x1={ep.x}
                    x2={ep.x + ep.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZeroLine ? (
              <line
                data-section="chart-line-emv-zero-line"
                x1={ep.x}
                x2={ep.x + ep.width}
                y1={layout.zeroY}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-emv-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: ep, name: 'emv', yt: layout.emvYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-emv-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-emv-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-emv-axis"
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
                        data-section="chart-line-emv-tick"
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
                          data-section="chart-line-emv-tick-label"
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
                <g data-section="chart-line-emv-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-emv-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={ep.y + ep.height}
                        y2={ep.y + ep.height + 4}
                      />
                      <text
                        data-section="chart-line-emv-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={ep.y + ep.height + 14}
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

            <g data-section="chart-line-emv-panel-labels">
              <text
                data-section="chart-line-emv-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price
              </text>
              <text
                data-section="chart-line-emv-panel-label"
                data-panel="emv"
                x={ep.x + ep.width / 2}
                y={ep.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Ease of Movement
              </text>
            </g>

            {bandVisible ? (
              <path
                data-section="chart-line-emv-band"
                d={layout.bandPath}
                fill={bandColor}
                fillOpacity={0.45}
                stroke="none"
              />
            ) : null}

            {midpointVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Midpoint line"
                data-section="chart-line-emv-midpoint-path"
                d={layout.midpointPath}
                fill="none"
                stroke={midpointColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {midpointVisible && showDots ? (
              <g data-section="chart-line-emv-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, midpoint ${formatValue(d.midpoint)}`}
                      data-section="chart-line-emv-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.midpoint}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={midpointColor}
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

            {emvVisible && layout.emvPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Ease of Movement line"
                data-section="chart-line-emv-emv-line"
                d={layout.emvPath}
                fill="none"
                stroke={emvColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {emvVisible ? (
              <g data-section="chart-line-emv-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Ease of Movement at x ${formatX(m.x)}: ${formatValue(m.emv)} (${m.sign})`}
                      data-section="chart-line-emv-marker"
                      data-point-index={m.index}
                      data-emv={m.emv}
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
                    data-section="chart-line-emv-tooltip"
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
                    <div data-section="chart-line-emv-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-high">
                      high: {formatValue(d.high)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-low">
                      low: {formatValue(d.low)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-midpoint">
                      midpoint: {formatValue(d.midpoint)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-volume">
                      volume: {formatValue(d.volume)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-raw">
                      raw: {d.emv1 === null ? 'n/a' : formatValue(d.emv1)}
                    </div>
                    <div
                      data-section="chart-line-emv-tooltip-emv"
                      style={{ fontWeight: 600 }}
                    >
                      emv: {d.emv === null ? 'n/a' : formatValue(d.emv)}
                    </div>
                    <div data-section="chart-line-emv-tooltip-sign">
                      sign: {d.sign}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-emv-legend"
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
                  data-section="chart-line-emv-legend-item"
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
                    data-section="chart-line-emv-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-emv-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-emv-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.positiveCount} above, {layout.negativeCount} below
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineEmv.displayName = 'ChartLineEmv';
