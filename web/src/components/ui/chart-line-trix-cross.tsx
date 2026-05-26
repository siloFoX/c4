import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineTrixCross -- pure-SVG dual-panel chart with the close
 * on top and the TRIX (triple-smoothed rate of change) plus its
 * signal-line EMA on the bottom. Scatter markers fire at every
 * TRIX-vs-signal cross -- the canonical triple-smoothed momentum
 * turning point.
 *
 *   ema1   = EMA(close,  length)
 *   ema2   = EMA(ema1,   length)
 *   ema3   = EMA(ema2,   length)
 *   TRIX[i] = ema3[i-1] === 0 ? null
 *                             : 100 * (ema3[i] - ema3[i-1]) / ema3[i-1]
 *   signal = EMA(TRIX, signalLength)
 *
 * Cross events: `up` (TRIX newly exceeds signal -> regime
 * `accelerating-up`) and `down` (TRIX newly drops below signal
 * -> regime `accelerating-down`). Otherwise regime is `aligned`
 * (relation equal) or `none` (warmup).
 *
 * Bit-exact anchor (with the `min === max` EMA precision fix in
 * the smoothing helper):
 *
 * - **CONST close = K (K > 0)**: every EMA collapses to K via the
 *   precision fix. ema3 stays K -> `TRIX = 100 * 0 / K = 0`,
 *   signal = EMA(0) = 0. Relation `equal` forever, regime
 *   `aligned`, zero crosses.
 *
 * Soft anchors used for cross-count tests (the `0.015`-free EMA
 * chains still lag bit-rationally but the SIGN of TRIX-vs-signal
 * stays consistent):
 *
 * - **LINEAR UP / DOWN**: TRIX and its signal both share the same
 *   sign (positive for LINEAR UP, negative for LINEAR DOWN), and
 *   the signal trails TRIX in the same direction -- so TRIX
 *   never crosses signal back the other way. Zero crosses.
 */

export interface ChartLineTrixCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTrixCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineTrixCrossCross = 'up' | 'down' | null;

export type ChartLineTrixCrossRegime =
  | 'accelerating-up'
  | 'accelerating-down'
  | 'aligned'
  | 'none';

export type ChartLineTrixCrossSeriesId = 'price' | 'trix' | 'signal';

export interface ChartLineTrixCrossSample {
  index: number;
  x: number;
  close: number;
  ema3: number | null;
  trix: number | null;
  signal: number | null;
  relation: ChartLineTrixCrossRelation;
  regime: ChartLineTrixCrossRegime;
  crossed: ChartLineTrixCrossCross;
}

export interface ChartLineTrixCrossRun {
  series: ChartLineTrixCrossPoint[];
  length: number;
  signalLength: number;
  trixValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineTrixCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  acceleratingUpCount: number;
  acceleratingDownCount: number;
  alignedCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTrixCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  trix: number;
  kind: 'up' | 'down';
}

export interface ChartLineTrixCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  trixTop: number;
  trixBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrixCrossDot[];
  trixPath: string;
  signalPath: string;
  markers: ChartLineTrixCrossMarker[];
  priceMin: number;
  priceMax: number;
  trixMin: number;
  trixMax: number;
  zeroY: number;
  run: ChartLineTrixCrossRun;
}

export interface ChartLineTrixCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixCrossPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  trixColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTrixCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineTrixCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatTrix?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TRIX_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_TRIX_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_CROSS_TRIX_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_TRIX_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TRIX_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTrixCrossFinitePoints(
  data: readonly ChartLineTrixCrossPoint[] | null | undefined,
): ChartLineTrixCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTrixCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit so constant inputs land bit-exactly on the constant.
 */
export function applyLineTrixCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

export interface LineTrixCrossChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  trix: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineTrixCross(
  series: readonly ChartLineTrixCrossPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineTrixCrossChannels {
  const cleaned = getLineTrixCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ema3: [], trix: [], signal: [] };
  }
  const length = normalizeLineTrixCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const ema1 = applyLineTrixCrossEma(closes, length);
  const ema2 = applyLineTrixCrossEma(ema1, length);
  const ema3 = applyLineTrixCrossEma(ema2, length);
  const trix: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i += 1) {
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (cur == null || prev == null) continue;
    if (prev === 0) continue;
    trix[i] = posZero(((cur - prev) / prev) * 100);
  }
  const signal = applyLineTrixCrossEma(trix, signalLength);
  return { ema1, ema2, ema3, trix, signal };
}

export function classifyLineTrixCrossRelation(
  trix: number | null,
  signal: number | null,
): ChartLineTrixCrossRelation {
  if (trix == null || signal == null) return 'none';
  if (trix > signal) return 'bullish';
  if (trix < signal) return 'bearish';
  return 'equal';
}

export function classifyLineTrixCrossRegime(
  relation: ChartLineTrixCrossRelation,
): ChartLineTrixCrossRegime {
  if (relation === 'bullish') return 'accelerating-up';
  if (relation === 'bearish') return 'accelerating-down';
  if (relation === 'equal') return 'aligned';
  return 'none';
}

export function detectLineTrixCrossCrosses(
  trixValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineTrixCrossCross[] {
  const out: ChartLineTrixCrossCross[] = [];
  let prevT: number | null = null;
  let prevS: number | null = null;
  for (let i = 0; i < trixValues.length; i += 1) {
    const t = trixValues[i];
    const s = signalValues[i];
    if (t == null || s == null) {
      out.push(null);
      prevT = null;
      prevS = null;
      continue;
    }
    if (prevT == null || prevS == null) {
      out.push(null);
      prevT = t;
      prevS = s;
      continue;
    }
    if (prevT <= prevS && t > s) {
      out.push('up');
    } else if (prevT >= prevS && t < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevT = t;
    prevS = s;
  }
  return out;
}

export function runLineTrixCross(
  data: ChartLineTrixCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): ChartLineTrixCrossRun {
  const cleaned = getLineTrixCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTrixCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineTrixCross(series, { length, signalLength });
  const crosses = detectLineTrixCrossCrosses(
    channels.trix,
    channels.signal,
  );

  const samples: ChartLineTrixCrossSample[] = series.map((p, i) => {
    const trix = channels.trix[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const ema3 = channels.ema3[i] ?? null;
    const relation = classifyLineTrixCrossRelation(trix, signal);
    const regime = classifyLineTrixCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      ema3,
      trix,
      signal,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let acceleratingUpCount = 0;
  let acceleratingDownCount = 0;
  let alignedCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'accelerating-up') acceleratingUpCount += 1;
    else if (s.regime === 'accelerating-down') acceleratingDownCount += 1;
    else if (s.regime === 'aligned') alignedCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length * 3 + signalLength;

  return {
    series,
    length,
    signalLength,
    trixValues: channels.trix,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    acceleratingUpCount,
    acceleratingDownCount,
    alignedCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineTrixCrossLayoutOptions {
  data: ChartLineTrixCrossPoint[];
  length?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixCrossLayout(
  opts: ComputeLineTrixCrossLayoutOptions,
): ChartLineTrixCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TRIX_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TRIX_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TRIX_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_CROSS_PANEL_GAP;

  const run = runLineTrixCross(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const trixTop = priceBottom + panelGap;
  const trixBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      trixTop,
      trixBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      trixPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      trixMin: -1,
      trixMax: 1,
      zeroY: (trixTop + trixBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let trixMin = Infinity;
  let trixMax = -Infinity;
  for (const s of run.samples) {
    if (s.trix != null) {
      if (s.trix < trixMin) trixMin = s.trix;
      if (s.trix > trixMax) trixMax = s.trix;
    }
    if (s.signal != null) {
      if (s.signal < trixMin) trixMin = s.signal;
      if (s.signal > trixMax) trixMax = s.signal;
    }
  }
  if (!Number.isFinite(trixMin) || !Number.isFinite(trixMax)) {
    trixMin = -1;
    trixMax = 1;
  }
  if (trixMin === trixMax) {
    trixMin -= 1;
    trixMax += 1;
  }
  if (trixMin > 0) trixMin = 0;
  if (trixMax < 0) trixMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syTrix = (y: number): number =>
    trixBottom -
    ((y - trixMin) / (trixMax - trixMin)) * (trixBottom - trixTop);

  let pricePath = '';
  const priceDots: ChartLineTrixCrossDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const buildPath = (key: 'trix' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syTrix(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const trixPath = buildPath('trix');
  const signalPath = buildPath('signal');

  const markers: ChartLineTrixCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.trix == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syTrix(s.trix),
      trix: s.trix,
      kind: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    trixTop,
    trixBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    trixPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    trixMin,
    trixMax,
    zeroY: syTrix(0),
    run,
  };
}

export function describeLineTrixCrossChart(
  data: ChartLineTrixCrossPoint[],
  options: { length?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineTrixCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTrixCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH,
  );
  const signalLength = normalizeLineTrixCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
  );
  return (
    `TRIX Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, signalLength ${signalLength}). Top panel ` +
    `renders the close; bottom panel renders the TRIX (triple-` +
    `smoothed rate of change) and its signal EMA with markers at ` +
    `every TRIX-vs-signal cross (up -> accelerating-up, down -> ` +
    `accelerating-down).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultTrixFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTrixCross = forwardRef<
  HTMLDivElement,
  ChartLineTrixCrossProps
>(function ChartLineTrixCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TRIX_CROSS_LENGTH,
    signalLength = DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_TRIX_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_TRIX_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_CROSS_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_CROSS_TRIX_COLOR,
    signalColor = DEFAULT_CHART_LINE_TRIX_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRIX_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
    showSignal = true,
    showMarkers = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatTrix = defaultTrixFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineTrixCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixCrossLayout({
        data: cleaned,
        length,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineTrixCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTrixCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTrixCrossSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-trix-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixCrossChart(cleaned, { length, signalLength });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickTrixValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickTrixValues.push(
      layout.trixMin + ((layout.trixMax - layout.trixMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? bullishColor : bearishColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'TRIX Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-cross"
      data-length={length}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-trix-cross-title"
      >
        {ariaLabel ?? 'TRIX Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-cross-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-trix-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-cross-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-trix-cross-grid-line-price"
                />
              );
            })}
            {tickTrixValues.map((v, i) => {
              const y =
                layout.trixBottom -
                ((v - layout.trixMin) /
                  (layout.trixMax - layout.trixMin)) *
                  (layout.trixBottom - layout.trixTop);
              return (
                <line
                  key={`grid-trix-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-trix-cross-grid-line-trix"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-cross-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.trixTop}
              x2={layout.innerLeft}
              y2={layout.trixBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.trixBottom}
              x2={layout.innerRight}
              y2={layout.trixBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-trix-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickTrixValues.map((v, i) => {
              const y =
                layout.trixBottom -
                ((v - layout.trixMin) /
                  (layout.trixMax - layout.trixMin)) *
                  (layout.trixBottom - layout.trixTop);
              return (
                <text
                  key={`tick-trix-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-trix-cross-tick-trix"
                >
                  {formatTrix(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-trix-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-signal"
          />
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-cross-trix"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-trix-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.kind)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-trix-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.trixBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-trix-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={140}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-ema3"
                >
                  ema3{' '}
                  {tooltipSample.ema3 == null
                    ? '--'
                    : formatPrice(tooltipSample.ema3)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-trix"
                >
                  trix{' '}
                  {tooltipSample.trix == null
                    ? '--'
                    : formatTrix(tooltipSample.trix)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatTrix(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-trix-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-trix-cross-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'trix' as const, color: trixColor, label: 'trix' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineTrixCrossSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrixCross.displayName = 'ChartLineTrixCross';
