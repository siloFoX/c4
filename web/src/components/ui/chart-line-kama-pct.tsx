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
 * ChartLineKamaPct -- pure-SVG dual-panel chart with the close
 * overlaid with the Kaufman Adaptive Moving Average (KAMA) in the
 * top panel and the KAMA percent deviation in the bottom panel:
 *
 *   ER[i]     = |close[i] - close[i - erLength]| /
 *               sum(|close[k] - close[k-1]|) for k in i-erLength+1..i
 *   fastSC    = 2 / (fastLength + 1)
 *   slowSC    = 2 / (slowLength + 1)
 *   SC[i]     = (ER[i] * (fastSC - slowSC) + slowSC) ^ 2
 *   KAMA[erLength]         = close[erLength]                    (seed)
 *   KAMA[i > erLength]     = KAMA[i-1] + SC[i] * (close[i] - KAMA[i-1])
 *   kamaPct[i] = KAMA[i] === 0 ? null
 *                              : (close[i] - KAMA[i]) / KAMA[i] * 100
 *
 * Regime classifier: `above` (kamaPct > 0), `below` (< 0),
 * `at` (= 0), `none` (null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: every change is 0 -> ER = 0 ->
 *   SC = slowSC^2. KAMA[seed] = K, then `K + SC * (K - K) = K`.
 *   KAMA stays K forever bit-exactly, close - KAMA = 0,
 *   kamaPct = 0 / K * 100 = 0. Verified across multiple K and
 *   `erLength`. K = 0 triggers the divide-by-zero guard ->
 *   kamaPct = null.
 *
 * Soft anchors:
 *
 * - **LINEAR UP close = i + 1**: KAMA seed = close[seed]; from
 *   the next bar onward the KAMA increment (`fastSC^2 * 1`) is
 *   less than the close increment of 1, so `close - KAMA` grows
 *   strictly positive -> kamaPct > 0.
 * - **LINEAR DOWN close = N - i**: mirror image, kamaPct < 0.
 */

export interface ChartLineKamaPctPoint {
  x: number;
  close: number;
}

export type ChartLineKamaPctRegime = 'above' | 'below' | 'at' | 'none';

export type ChartLineKamaPctSeriesId = 'price' | 'kama' | 'pct';

export interface ChartLineKamaPctSample {
  index: number;
  x: number;
  close: number;
  er: number | null;
  sc: number | null;
  kama: number | null;
  kamaPct: number | null;
  regime: ChartLineKamaPctRegime;
}

export interface ChartLineKamaPctRun {
  series: ChartLineKamaPctPoint[];
  erLength: number;
  fastLength: number;
  slowLength: number;
  fastSC: number;
  slowSC: number;
  erValues: Array<number | null>;
  scValues: Array<number | null>;
  kamaValues: Array<number | null>;
  kamaPctValues: Array<number | null>;
  samples: ChartLineKamaPctSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineKamaPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKamaPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  pctTop: number;
  pctBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineKamaPctDot[];
  kamaPath: string;
  pctPath: string;
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  zeroY: number;
  run: ChartLineKamaPctRun;
}

export interface ChartLineKamaPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKamaPctPoint[];
  erLength?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kamaColor?: string;
  pctColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKama?: boolean;
  showPct?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKamaPctSeriesId[];
  defaultHiddenSeries?: ChartLineKamaPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKamaPctSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KAMA_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_KAMA_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KAMA_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_KAMA_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KAMA_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAMA_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAMA_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH = 10;
export const DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH = 2;
export const DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH = 30;
export const DEFAULT_CHART_LINE_KAMA_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KAMA_PCT_KAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAMA_PCT_PCT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KAMA_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KAMA_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineKamaPctFinitePoints(
  data: readonly ChartLineKamaPctPoint[] | null | undefined,
): ChartLineKamaPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKamaPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineKamaPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Compute the rolling efficiency ratio.
 * ER[i] = |close[i] - close[i-n]| / sum(|delta|) over i-n+1..i.
 * Returns 0 when the sum is 0 (treat as slow regime).
 */
export function computeLineKamaPctEfficiencyRatio(
  closes: readonly number[],
  erLength: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (erLength < 1 || closes.length === 0) return out;
  for (let i = erLength; i < closes.length; i += 1) {
    const cur = closes[i];
    const prevN = closes[i - erLength];
    if (cur == null || prevN == null) continue;
    let sumAbs = 0;
    let ok = true;
    for (let k = i - erLength + 1; k <= i; k += 1) {
      const a = closes[k];
      const b = closes[k - 1];
      if (a == null || b == null) {
        ok = false;
        break;
      }
      sumAbs += Math.abs(a - b);
    }
    if (!ok) continue;
    const num = Math.abs(cur - prevN);
    if (sumAbs === 0) {
      out[i] = 0;
    } else {
      out[i] = posZero(num / sumAbs);
    }
  }
  return out;
}

export interface LineKamaPctChannels {
  er: Array<number | null>;
  sc: Array<number | null>;
  kama: Array<number | null>;
  kamaPct: Array<number | null>;
  fastSC: number;
  slowSC: number;
}

export function computeLineKamaPct(
  series: readonly ChartLineKamaPctPoint[] | null | undefined,
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): LineKamaPctChannels {
  const cleaned = getLineKamaPctFinitePoints(series);
  const erLength = normalizeLineKamaPctLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH,
  );
  const fastSC = 2 / (fastLength + 1);
  const slowSC = 2 / (slowLength + 1);

  if (cleaned.length === 0) {
    return {
      er: [],
      sc: [],
      kama: [],
      kamaPct: [],
      fastSC,
      slowSC,
    };
  }

  const closes = cleaned.map((p) => p.close);
  const er = computeLineKamaPctEfficiencyRatio(closes, erLength);
  const sc: Array<number | null> = new Array(closes.length).fill(null);
  const kama: Array<number | null> = new Array(closes.length).fill(null);
  const kamaPct: Array<number | null> = new Array(closes.length).fill(null);
  const scDiff = fastSC - slowSC;

  for (let i = 0; i < closes.length; i += 1) {
    const erVal = er[i];
    if (erVal != null) {
      const inner = erVal * scDiff + slowSC;
      sc[i] = posZero(inner * inner);
    }
  }

  let prevKama: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (c == null) {
      prevKama = null;
      continue;
    }
    if (i < erLength) continue;
    if (i === erLength) {
      kama[i] = posZero(c);
      prevKama = c;
      kamaPct[i] = c === 0 ? null : 0;
      continue;
    }
    if (prevKama == null) continue;
    const scVal = sc[i];
    const next =
      scVal == null ? prevKama : prevKama + scVal * (c - prevKama);
    kama[i] = posZero(next);
    prevKama = next;
    if (next === 0) {
      kamaPct[i] = null;
    } else {
      kamaPct[i] = posZero(((c - next) / next) * 100);
    }
  }

  return { er, sc, kama, kamaPct, fastSC, slowSC };
}

export function classifyLineKamaPctRegime(
  kamaPct: number | null,
): ChartLineKamaPctRegime {
  if (kamaPct == null) return 'none';
  if (kamaPct > 0) return 'above';
  if (kamaPct < 0) return 'below';
  return 'at';
}

export function runLineKamaPct(
  data: ChartLineKamaPctPoint[],
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): ChartLineKamaPctRun {
  const cleaned = getLineKamaPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const erLength = normalizeLineKamaPctLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH,
  );

  const channels = computeLineKamaPct(series, {
    erLength,
    fastLength,
    slowLength,
  });

  const samples: ChartLineKamaPctSample[] = series.map((p, i) => {
    const kama = channels.kama[i] ?? null;
    const kamaPct = channels.kamaPct[i] ?? null;
    const regime = classifyLineKamaPctRegime(kamaPct);
    return {
      index: i,
      x: p.x,
      close: p.close,
      er: channels.er[i] ?? null,
      sc: channels.sc[i] ?? null,
      kama,
      kamaPct,
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

  const ok = series.length > erLength + 1;

  return {
    series = [],
    erLength,
    fastLength,
    slowLength,
    fastSC: channels.fastSC,
    slowSC: channels.slowSC,
    erValues: channels.er,
    scValues: channels.sc,
    kamaValues: channels.kama,
    kamaPctValues: channels.kamaPct,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineKamaPctLayoutOptions {
  data: ChartLineKamaPctPoint[];
  erLength?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKamaPctLayout(
  opts: ComputeLineKamaPctLayoutOptions,
): ChartLineKamaPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KAMA_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KAMA_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_KAMA_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_KAMA_PCT_PANEL_GAP;

  const run = runLineKamaPct(opts.data, {
    erLength: opts.erLength ?? undefined,
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const pctTop = priceBottom + panelGap;
  const pctBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      pctTop,
      pctBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      kamaPath: '',
      pctPath: '',
      priceMin: 0,
      priceMax: 0,
      pctMin: -1,
      pctMax: 1,
      zeroY: (pctTop + pctBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.kama != null) {
      if (s.kama < priceMin) priceMin = s.kama;
      if (s.kama > priceMax) priceMax = s.kama;
    }
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let pctMin = Infinity;
  let pctMax = -Infinity;
  for (const s of run.samples) {
    if (s.kamaPct == null) continue;
    if (s.kamaPct < pctMin) pctMin = s.kamaPct;
    if (s.kamaPct > pctMax) pctMax = s.kamaPct;
  }
  if (!Number.isFinite(pctMin) || !Number.isFinite(pctMax)) {
    pctMin = -1;
    pctMax = 1;
  }
  if (pctMin === pctMax) {
    pctMin -= 1;
    pctMax += 1;
  }
  if (pctMin > 0) pctMin = 0;
  if (pctMax < 0) pctMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syPct = (y: number): number =>
    pctBottom - ((y - pctMin) / (pctMax - pctMin)) * (pctBottom - pctTop);

  let pricePath = '';
  const priceDots: ChartLineKamaPctDot[] = [];
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

  let kamaPath = '';
  let kamaFirst = true;
  for (const s of run.samples) {
    if (s.kama == null) {
      kamaFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.kama);
    kamaPath += `${kamaFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    kamaFirst = false;
  }
  kamaPath = kamaPath.trim();

  let pctPath = '';
  let pctFirst = true;
  for (const s of run.samples) {
    if (s.kamaPct == null) {
      pctFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.kamaPct);
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
    pctTop,
    pctBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    kamaPath,
    pctPath,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    zeroY: syPct(0),
    run,
  };
}

export function describeLineKamaPctChart(
  data: ChartLineKamaPctPoint[],
  options: {
    erLength?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): string {
  const cleaned = getLineKamaPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const erLength = normalizeLineKamaPctLength(
    options.erLength,
    DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH,
  );
  const fastLength = normalizeLineKamaPctLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaPctLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH,
  );
  return (
    `KAMA Pct chart over ${cleaned.length} bars (erLength ${erLength}, ` +
    `fastLength ${fastLength}, slowLength ${slowLength}). Top panel ` +
    `overlays the close with the Kaufman Adaptive Moving Average; ` +
    `bottom panel renders the (close - KAMA) / KAMA * 100 percent ` +
    `deviation across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineKamaPct = forwardRef<
  HTMLDivElement,
  ChartLineKamaPctProps
>(function ChartLineKamaPct(props, ref): ReactNode {
  const {
    data,
    erLength = DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH,
    fastLength = DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_KAMA_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_KAMA_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_KAMA_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_KAMA_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KAMA_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KAMA_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KAMA_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KAMA_PCT_PRICE_COLOR,
    kamaColor = DEFAULT_CHART_LINE_KAMA_PCT_KAMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_KAMA_PCT_PCT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KAMA_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_KAMA_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KAMA_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKama = true,
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
    formatPct = defaultPctFormatter,
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

  const cleaned = useMemo(() => getLineKamaPctFinitePoints(data), [data]);

  const layout = useMemo(
    () =>
      computeLineKamaPctLayout({
        data: cleaned,
        erLength,
        fastLength,
        slowLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      erLength,
      fastLength,
      slowLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKamaPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineKamaPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineKamaPctSeriesId,
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
        data-section="chart-line-kama-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKamaPctChart(cleaned, {
      erLength,
      fastLength,
      slowLength,
    });

  const showPrice = !hidden.has('price');
  const showKamaLine = !hidden.has('kama') && showKama;
  const showPctLine = !hidden.has('pct') && showPct;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickPctValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPctValues.push(
      layout.pctMin + ((layout.pctMax - layout.pctMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'KAMA Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-kama-pct"
      data-er-length={erLength}
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-total-points={cleaned.length}
      data-above-count={layout.run.aboveCount}
      data-below-count={layout.run.belowCount}
      data-at-count={layout.run.atCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-kama-pct-title"
      >
        {ariaLabel ?? 'KAMA Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kama-pct-aria-desc"
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
        data-section="chart-line-kama-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kama-pct-grid">
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
                  data-section="chart-line-kama-pct-grid-line-price"
                />
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <line
                  key={`grid-pct-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-kama-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kama-pct-axes">
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
              y1={layout.pctTop}
              x2={layout.innerLeft}
              y2={layout.pctBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.pctBottom}
              x2={layout.innerRight}
              y2={layout.pctBottom}
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
                  data-section="chart-line-kama-pct-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickPctValues.map((v, i) => {
              const y =
                layout.pctBottom -
                ((v - layout.pctMin) /
                  (layout.pctMax - layout.pctMin)) *
                  (layout.pctBottom - layout.pctTop);
              return (
                <text
                  key={`tick-pct-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-kama-pct-tick-pct"
                >
                  {formatPct(v)}
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
            data-section="chart-line-kama-pct-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-pct-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kama-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kama-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKamaLine ? (
          <path
            d={layout.kamaPath}
            stroke={kamaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-pct-kama"
          />
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-pct-pct"
          />
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kama-pct-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.pctBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-kama-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kama-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={200}
                  height={130}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-kama"
                >
                  kama{' '}
                  {tooltipSample.kama == null
                    ? '--'
                    : formatPrice(tooltipSample.kama)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-er"
                >
                  er{' '}
                  {tooltipSample.er == null
                    ? '--'
                    : formatPct(tooltipSample.er)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-sc"
                >
                  sc{' '}
                  {tooltipSample.sc == null
                    ? '--'
                    : formatPct(tooltipSample.sc)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-pct"
                >
                  kamaPct{' '}
                  {tooltipSample.kamaPct == null
                    ? '--'
                    : formatPct(tooltipSample.kamaPct)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-pct-tooltip-counts"
                >
                  above {layout.run.aboveCount} | below{' '}
                  {layout.run.belowCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-kama-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          er {erLength} | fast {fastLength} | slow {slowLength} | above{' '}
          {layout.run.aboveCount} | below {layout.run.belowCount} | at{' '}
          {layout.run.atCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kama-pct-legend"
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
              { id: 'kama' as const, color: kamaColor, label: 'kama' },
              { id: 'pct' as const, color: pctColor, label: 'kamaPct' },
            ] satisfies Array<{
              id: ChartLineKamaPctSeriesId;
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

ChartLineKamaPct.displayName = 'ChartLineKamaPct';
