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
 * ChartLineStochCrossPct -- pure-SVG dual-panel chart with the
 * close in the top panel and the Stochastic %K - %D percent
 * deviation in the bottom panel. The "cross percent" treatment
 * surfaces the *momentum magnitude* (how stretched K is above or
 * below D) separate from the sign-based crossings rendered by
 * other Stochastic primitives:
 *
 *   highest[i]  = max(close[i - kLength + 1 .. i])
 *   lowest[i]   = min(close[i - kLength + 1 .. i])
 *   rawK[i]     = highest === lowest
 *                   ? null
 *                   : (close[i] - lowest) / (highest - lowest) * 100
 *   K[i]        = SMA(rawK, slowKLength)
 *   D[i]        = SMA(K, dLength)
 *   stochPct[i] = K[i] - D[i]
 *
 * Defaults: `kLength = 14`, `slowKLength = 3`, `dLength = 3`.
 * Regime classifier: `above` (stochPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null).
 *
 * Bit-exact anchors:
 *
 * - **LINEAR UP step = 1 (close[i] = start + i)**: highest =
 *   close[i] = i + start, lowest = close[i - k + 1] = i - k + 1
 *   + start, denominator = k - 1, numerator = close[i] - lowest
 *   = k - 1. So rawK = 100 every bar after warmup. K = SMA(100)
 *   = 100, D = SMA(100) = 100, stochPct = 100 - 100 = 0. Regime
 *   `at` after the full chained SMA warmup.
 * - **CONST close = K**: highest === lowest = K so the divide-
 *   by-zero guard yields rawK = null -> K = null -> D = null ->
 *   stochPct = null. Regime `none` everywhere.
 */

export interface ChartLineStochCrossPctPoint {
  x: number;
  close: number;
}

export type ChartLineStochCrossPctRegime =
  | 'above'
  | 'below'
  | 'at'
  | 'none';

export type ChartLineStochCrossPctSeriesId = 'price' | 'k' | 'd' | 'pct';

export interface ChartLineStochCrossPctSample {
  index: number;
  x: number;
  close: number;
  k: number | null;
  d: number | null;
  stochPct: number | null;
  regime: ChartLineStochCrossPctRegime;
}

export interface ChartLineStochCrossPctRun {
  series: ChartLineStochCrossPctPoint[];
  kLength: number;
  slowKLength: number;
  dLength: number;
  kValues: Array<number | null>;
  dValues: Array<number | null>;
  pctValues: Array<number | null>;
  samples: ChartLineStochCrossPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineStochCrossPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochCrossPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStochCrossPctDot[];
  kPath: string;
  dPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  run: ChartLineStochCrossPctRun;
}

export interface ChartLineStochCrossPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochCrossPctPoint[];
  kLength?: number;
  slowKLength?: number;
  dLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showD?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochCrossPctSeriesId[];
  defaultHiddenSeries?: ChartLineStochCrossPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochCrossPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_SLOW_K_LENGTH = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_LENGTH = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PCT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_CROSS_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochCrossPctFinitePoints(
  data: readonly ChartLineStochCrossPctPoint[] | null | undefined,
): ChartLineStochCrossPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochCrossPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochCrossPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * Simple moving average with the `min === max` window-constant
 * precision fix.
 */
export function applyLineStochCrossPctSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    let ok = true;
    for (let k = 0; k < length; k += 1) {
      const v = values[i - length + 1 + k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

export interface LineStochCrossPctChannels {
  k: Array<number | null>;
  d: Array<number | null>;
  pct: Array<number | null>;
}

export function computeLineStochCrossPct(
  series: readonly ChartLineStochCrossPctPoint[] | null | undefined,
  options: {
    kLength?: number;
    slowKLength?: number;
    dLength?: number;
  } = {},
): LineStochCrossPctChannels {
  const cleaned = getLineStochCrossPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { k: [], d: [], pct: [] };
  }
  const kLength = normalizeLineStochCrossPctLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_LENGTH,
  );
  const slowKLength = normalizeLineStochCrossPctLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_SLOW_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossPctLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const rawK: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = kLength - 1; i < closes.length; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let k = 0; k < kLength; k += 1) {
      const v = closes[i - kLength + 1 + k]!;
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    if (hh === ll) continue;
    rawK[i] = posZero(((closes[i]! - ll) / (hh - ll)) * 100);
  }

  const k = applyLineStochCrossPctSma(rawK, slowKLength);
  const d = applyLineStochCrossPctSma(k, dLength);

  const pct: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const kv = k[i];
    const dv = d[i];
    if (kv == null || dv == null) continue;
    pct[i] = posZero(kv - dv);
  }

  return { k, d, pct };
}

export function classifyLineStochCrossPctRegime(
  pct: number | null,
): ChartLineStochCrossPctRegime {
  if (pct == null) return 'none';
  if (pct > 0) return 'above';
  if (pct < 0) return 'below';
  return 'at';
}

export function runLineStochCrossPct(
  data: ChartLineStochCrossPctPoint[],
  options: {
    kLength?: number;
    slowKLength?: number;
    dLength?: number;
  } = {},
): ChartLineStochCrossPctRun {
  const cleaned = getLineStochCrossPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const kLength = normalizeLineStochCrossPctLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_LENGTH,
  );
  const slowKLength = normalizeLineStochCrossPctLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_SLOW_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossPctLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_LENGTH,
  );

  const channels = computeLineStochCrossPct(series, {
    kLength,
    slowKLength,
    dLength,
  });

  const samples: ChartLineStochCrossPctSample[] = series.map((p, i) => {
    const kv = channels.k[i] ?? null;
    const dv = channels.d[i] ?? null;
    const pv = channels.pct[i] ?? null;
    const regime = classifyLineStochCrossPctRegime(pv);
    return {
      index: i,
      x: p.x,
      close: p.close,
      k: kv,
      d: dv,
      stochPct: pv,
      regime,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'above') aboveCount += 1;
    else if (s.regime === 'below') belowCount += 1;
    else if (s.regime === 'at') atCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > kLength + slowKLength + dLength;

  return {
    series,
    kLength,
    slowKLength,
    dLength,
    kValues: channels.k,
    dValues: channels.d,
    pctValues: channels.pct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineStochCrossPctLayoutOptions {
  data: ChartLineStochCrossPctPoint[];
  kLength?: number;
  slowKLength?: number;
  dLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochCrossPctLayout(
  opts: ComputeLineStochCrossPctLayoutOptions,
): ChartLineStochCrossPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STOCH_CROSS_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STOCH_CROSS_PCT_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PANEL_GAP;

  const run = runLineStochCrossPct(opts.data, {
    kLength: opts.kLength ?? undefined,
    slowKLength: opts.slowKLength ?? undefined,
    dLength: opts.dLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      kPath: '',
      dPath: '',
      pctPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.k != null) {
      if (s.k < oscMin) oscMin = s.k;
      if (s.k > oscMax) oscMax = s.k;
    }
    if (s.d != null) {
      if (s.d < oscMin) oscMin = s.d;
      if (s.d > oscMax) oscMax = s.d;
    }
    if (s.stochPct != null) {
      if (s.stochPct < oscMin) oscMin = s.stochPct;
      if (s.stochPct > oscMax) oscMax = s.stochPct;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineStochCrossPctDot[] = [];
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

  let kPath = '';
  let kFirst = true;
  for (const s of run.samples) {
    if (s.k == null) {
      kFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.k);
    kPath += `${kFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    kFirst = false;
  }
  kPath = kPath.trim();

  let dPath = '';
  let dFirst = true;
  for (const s of run.samples) {
    if (s.d == null) {
      dFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.d);
    dPath += `${dFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    dFirst = false;
  }
  dPath = dPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.stochPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.stochPct);
    pctPath += `${pctFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    pctFirst = false;
  }
  pctPath = pctPath.trim();

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    kPath,
    dPath,
    pctPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    run,
  };
}

export function describeLineStochCrossPctChart(
  data: ChartLineStochCrossPctPoint[],
  options: {
    kLength?: number;
    slowKLength?: number;
    dLength?: number;
  } = {},
): string {
  const cleaned = getLineStochCrossPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const kLength = normalizeLineStochCrossPctLength(
    options.kLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_LENGTH,
  );
  const slowKLength = normalizeLineStochCrossPctLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_SLOW_K_LENGTH,
  );
  const dLength = normalizeLineStochCrossPctLength(
    options.dLength,
    DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_LENGTH,
  );
  return (
    `Stochastic Cross Pct chart over ${cleaned.length} bars ` +
    `(kLength ${kLength}, slowK ${slowKLength}, dLength ` +
    `${dLength}). Top panel renders the close; bottom panel ` +
    `overlays %K and %D with the K - D percent deviation ` +
    `surfacing momentum magnitude separate from the K-over-D ` +
    `crossings.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStochCrossPct = forwardRef<
  HTMLDivElement,
  ChartLineStochCrossPctProps
>(function ChartLineStochCrossPct(props, ref): ReactNode {
  const {
    data,
    kLength = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_LENGTH,
    slowKLength = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_SLOW_K_LENGTH,
    dLength = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_LENGTH,
    width = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_D_COLOR,
    pctColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_CROSS_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showPct = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
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
    () => getLineStochCrossPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochCrossPctLayout({
        data: cleaned,
        kLength,
        slowKLength,
        dLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      kLength,
      slowKLength,
      dLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochCrossPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineStochCrossPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStochCrossPctSeriesId,
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
        data-section="chart-line-stoch-cross-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochCrossPctChart(cleaned, {
      kLength,
      slowKLength,
      dLength,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;
  const showDLine = !hidden.has('d') && showD;
  const showPctLine = !hidden.has('pct') && showPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic Cross Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-cross-pct"
      data-k-length={kLength}
      data-slow-k-length={slowKLength}
      data-d-length={dLength}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-cross-pct-title"
      >
        {ariaLabel ?? 'Stochastic Cross Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-cross-pct-aria-desc"
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
        data-section="chart-line-stoch-cross-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-cross-pct-grid">
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
                  data-section="chart-line-stoch-cross-pct-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-stoch-cross-pct-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-cross-pct-axes">
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
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
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
                  data-section="chart-line-stoch-cross-pct-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-stoch-cross-pct-tick-osc"
                >
                  {formatOsc(v)}
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
            data-section="chart-line-stoch-cross-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-cross-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-cross-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-pct-k-path"
          />
        ) : null}

        {showDLine ? (
          <path
            d={layout.dPath}
            stroke={dColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-pct-d-path"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-pct-pct-path"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-cross-pct-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-stoch-cross-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-cross-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={210}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-k"
                >
                  k{' '}
                  {tooltipSample.k == null
                    ? '--'
                    : formatOsc(tooltipSample.k)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-d"
                >
                  d{' '}
                  {tooltipSample.d == null
                    ? '--'
                    : formatOsc(tooltipSample.d)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-pct"
                >
                  stochPct{' '}
                  {tooltipSample.stochPct == null
                    ? '--'
                    : formatOsc(tooltipSample.stochPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-pct-tooltip-counts2"
                >
                  at {layout.run.atCount} | none {layout.run.noneCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-cross-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          k {kLength} | slowK {slowKLength} | d {dLength} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-cross-pct-legend"
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
              { id: 'k' as const, color: kColor, label: 'k' },
              { id: 'd' as const, color: dColor, label: 'd' },
              { id: 'pct' as const, color: pctColor, label: 'stochPct' },
            ] satisfies Array<{
              id: ChartLineStochCrossPctSeriesId;
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

ChartLineStochCrossPct.displayName = 'ChartLineStochCrossPct';
