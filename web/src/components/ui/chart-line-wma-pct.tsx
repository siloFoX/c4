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
 * ChartLineWmaPct -- pure-SVG dual-panel chart with the close on
 * top and a WMA Percent-Change oscillator on the bottom:
 *
 *   wma[i]    = sum_{k=0..length-1} (length - k) * close[i - k]
 *                 / (length * (length + 1) / 2)
 *   wmaPct[i] = wma[i] === 0 ? null : (close[i] - wma[i]) / wma[i] * 100
 *
 * Linear weights run from `length` at the current bar down to `1` at
 * the oldest. `wmaPct[i]` is `null` during WMA warmup
 * (`i < length - 1`) and whenever `wma[i]` is zero.
 *
 * Parallel to 11.836 chart-line-ema-pct and 11.837 chart-line-sma-pct,
 * swapping the SMA-seeded EMA / rolling SMA for the Weighted Moving
 * Average.
 *
 * Bit-exact anchors:
 * - **CONST close = K, K != 0**: with all values equal to `K` the
 *   weighted sum is `K * sum(weights)`, divided by `sum(weights)`
 *   returns `K` exactly via the helper's `min === max` short-circuit.
 *   `wmaPct = 0` bit-exact post-warmup.
 * - **CONST close = 0**: `wma = 0`, divide-by-zero guard returns
 *   `null`.
 */

export interface ChartLineWmaPctPoint {
  x: number;
  close: number;
}

export type ChartLineWmaPctZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineWmaPctCross = 'up' | 'down' | null;

export type ChartLineWmaPctSeriesId = 'price' | 'wma' | 'pct';

export interface ChartLineWmaPctSample {
  index: number;
  x: number;
  close: number;
  wma: number | null;
  delta: number | null;
  wmaPct: number | null;
  zone: ChartLineWmaPctZone;
  crossed: ChartLineWmaPctCross;
}

export interface ChartLineWmaPctRun {
  series: ChartLineWmaPctPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  wmaValues: Array<number | null>;
  deltaValues: Array<number | null>;
  wmaPctValues: Array<number | null>;
  samples: ChartLineWmaPctSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineWmaPctMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  wmaPct: number;
  crossed: 'up' | 'down';
}

export interface ChartLineWmaPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWmaPctLayout {
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
  wmaPath: string;
  priceDots: ChartLineWmaPctDot[];
  pctPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineWmaPctMarker[];
  priceMin: number;
  priceMax: number;
  pctMin: number;
  pctMax: number;
  run: ChartLineWmaPctRun;
}

export interface ChartLineWmaPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWmaPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wmaColor?: string;
  pctColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWma?: boolean;
  showPct?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWmaPctSeriesId[];
  defaultHiddenSeries?: ChartLineWmaPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWmaPctSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineWmaPctSample }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_WMA_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_WMA_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_WMA_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_WMA_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_WMA_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WMA_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WMA_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WMA_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_WMA_PCT_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_WMA_PCT_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_WMA_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WMA_PCT_WMA_COLOR = '#84cc16';
export const DEFAULT_CHART_LINE_WMA_PCT_PCT_COLOR = '#c026d3';
export const DEFAULT_CHART_LINE_WMA_PCT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WMA_PCT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WMA_PCT_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_WMA_PCT_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_WMA_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WMA_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and close. */
export function getLineWmaPctFinitePoints(
  data: readonly ChartLineWmaPctPoint[] | null | undefined,
): ChartLineWmaPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWmaPctPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer WMA length (>= 2). */
export function normalizeLineWmaPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold. */
export function normalizeLineWmaPctThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/**
 * Weighted Moving Average with linear front-weighted scheme.
 * Returns the exact constant when the entire window is constant
 * (`min === max` short-circuit) to avoid 1-ULP drift.
 */
export function applyLineWmaPctWma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  const totalWeight = (length * (length + 1)) / 2;
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      const weight = length - j;
      sum += weight * v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(
      winMin === winMax ? posZero(winMin) : posZero(sum / totalWeight),
    );
  }
  return out;
}

export interface LineWmaPctChannels {
  wma: Array<number | null>;
  delta: Array<number | null>;
  wmaPct: Array<number | null>;
}

export function computeLineWmaPct(
  series: readonly ChartLineWmaPctPoint[] | null | undefined,
  options: { length?: number } = {},
): LineWmaPctChannels {
  const cleaned = getLineWmaPctFinitePoints(series);
  if (cleaned.length === 0) {
    return { wma: [], delta: [], wmaPct: [] };
  }
  const length = normalizeLineWmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_WMA_PCT_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const wma = applyLineWmaPctWma(closes, length);

  const delta: Array<number | null> = [];
  const wmaPct: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const m = wma[i];
    const c = closes[i]!;
    if (m == null) {
      delta.push(null);
      wmaPct.push(null);
      continue;
    }
    delta.push(posZero(c - m));
    if (m === 0) {
      wmaPct.push(null);
      continue;
    }
    const raw = ((c - m) / m) * 100;
    wmaPct.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  return { wma, delta, wmaPct };
}

export function classifyLineWmaPctZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineWmaPctZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineWmaPctCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineWmaPctCross[] {
  const out: ChartLineWmaPctCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= bullishThreshold && v > bullishThreshold) {
      out.push('up');
    } else if (prev >= bearishThreshold && v < bearishThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineWmaPct(
  data: ChartLineWmaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineWmaPctRun {
  const cleaned = getLineWmaPctFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineWmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_WMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineWmaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_WMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineWmaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_WMA_PCT_BEARISH_THRESHOLD,
  );

  const channels = computeLineWmaPct(series, { length });
  const crosses = detectLineWmaPctCrosses(
    channels.wmaPct,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineWmaPctSample[] = series.map((p, i) => {
    const wma = channels.wma[i] ?? null;
    const delta = channels.delta[i] ?? null;
    const wmaPct = channels.wmaPct[i] ?? null;
    const zone = classifyLineWmaPctZone(
      wmaPct,
      bullishThreshold,
      bearishThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      wma,
      delta,
      wmaPct,
      zone,
      crossed,
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series = [],
    length,
    bullishThreshold,
    bearishThreshold,
    wmaValues: channels.wma,
    deltaValues: channels.delta,
    wmaPctValues: channels.wmaPct,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineWmaPctLayoutOptions {
  data: ChartLineWmaPctPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineWmaPctLayout(
  opts: ComputeLineWmaPctLayoutOptions,
): ChartLineWmaPctLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_WMA_PCT_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_WMA_PCT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_WMA_PCT_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_WMA_PCT_PANEL_GAP;

  const run = runLineWmaPct(opts.data, {
    length: opts.length ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
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
      wmaPath: '',
      priceDots: [],
      pctPath: '',
      bullishY: pctTop,
      bearishY: pctBottom,
      zeroY: (pctTop + pctBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      pctMin: -1,
      pctMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.wma != null) {
      if (s.wma < priceMin) priceMin = s.wma;
      if (s.wma > priceMax) priceMax = s.wma;
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
    if (s.wmaPct == null) continue;
    if (s.wmaPct < pctMin) pctMin = s.wmaPct;
    if (s.wmaPct > pctMax) pctMax = s.wmaPct;
  }
  if (!Number.isFinite(pctMin) || !Number.isFinite(pctMax)) {
    pctMin = -1;
    pctMax = 1;
  }
  if (pctMin > 0) pctMin = 0;
  if (pctMax < 0) pctMax = 0;
  if (pctMin === pctMax) {
    pctMin -= 1;
    pctMax += 1;
  }

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
  const priceDots: ChartLineWmaPctDot[] = [];
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

  let wmaPath = '';
  let firstW = true;
  for (const s of run.samples) {
    if (s.wma == null) {
      firstW = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.wma);
    wmaPath += `${firstW ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstW = false;
  }

  let pctPath = '';
  let firstP = true;
  for (const s of run.samples) {
    if (s.wmaPct == null) {
      firstP = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syPct(s.wmaPct);
    pctPath += `${firstP ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstP = false;
  }

  const markers: ChartLineWmaPctMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.wmaPct == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPct(s.wmaPct),
      close: s.close,
      wmaPct: s.wmaPct,
      crossed: s.crossed,
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
    pctTop,
    pctBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    wmaPath: wmaPath.trim(),
    priceDots,
    pctPath: pctPath.trim(),
    bullishY: syPct(run.bullishThreshold),
    bearishY: syPct(run.bearishThreshold),
    zeroY: syPct(0),
    markers,
    priceMin,
    priceMax,
    pctMin,
    pctMax,
    run,
  };
}

export function describeLineWmaPctChart(
  data: ChartLineWmaPctPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineWmaPctFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineWmaPctLength(
    options.length,
    DEFAULT_CHART_LINE_WMA_PCT_LENGTH,
  );
  const bullishThreshold = normalizeLineWmaPctThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_WMA_PCT_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineWmaPctThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_WMA_PCT_BEARISH_THRESHOLD,
  );
  return (
    `WMA Percent-Change chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close and the WMA; bottom panel renders the close minus the WMA ` +
    `over the WMA scaled to percent.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultPctFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineWmaPct = forwardRef<
  HTMLDivElement,
  ChartLineWmaPctProps
>(function ChartLineWmaPct(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_WMA_PCT_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_WMA_PCT_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_WMA_PCT_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_WMA_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_WMA_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_WMA_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_WMA_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_WMA_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WMA_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WMA_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WMA_PCT_PRICE_COLOR,
    wmaColor = DEFAULT_CHART_LINE_WMA_PCT_WMA_COLOR,
    pctColor = DEFAULT_CHART_LINE_WMA_PCT_PCT_COLOR,
    bullishColor = DEFAULT_CHART_LINE_WMA_PCT_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_WMA_PCT_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_WMA_PCT_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_WMA_PCT_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_WMA_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_WMA_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWma = true,
    showPct = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
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

  const cleaned = useMemo(
    () => getLineWmaPctFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineWmaPctLayout({
        data: cleaned,
        length,
        bullishThreshold,
        bearishThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      bullishThreshold,
      bearishThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineWmaPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineWmaPctSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineWmaPctSeriesId,
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
        data-section="chart-line-wma-pct-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineWmaPctChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showWmaLine = !hidden.has('wma') && showWma;
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
      aria-label={ariaLabel ?? 'WMA Percent-Change chart'}
      aria-describedby={descId}
      data-section="chart-line-wma-pct"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-wma-pct-title"
      >
        {ariaLabel ?? 'WMA Percent-Change chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-wma-pct-aria-desc"
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
        data-section="chart-line-wma-pct-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-wma-pct-grid">
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
                  data-section="chart-line-wma-pct-grid-line-price"
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
                  data-section="chart-line-wma-pct-grid-line-pct"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-wma-pct-axes">
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
                  data-section="chart-line-wma-pct-tick-price"
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
                  data-section="chart-line-wma-pct-tick-pct"
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
            data-section="chart-line-wma-pct-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-wma-pct-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-wma-pct-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-wma-pct-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-wma-pct-price-path"
          />
        ) : null}

        {showWmaLine ? (
          <path
            d={layout.wmaPath}
            stroke={wmaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-wma-pct-wma-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-wma-pct-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-wma-pct-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPctLine ? (
          <path
            d={layout.pctPath}
            stroke={pctColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-wma-pct-line"
          />
        ) : null}

        {showMarkers && showPctLine ? (
          <g data-section="chart-line-wma-pct-markers">
            {layout.markers.map((m) => (
              <circle
                key={`pct-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-wma-pct-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-wma-pct-hover-targets">
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
                data-section="chart-line-wma-pct-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-wma-pct-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={122}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-wma"
                >
                  wma{' '}
                  {tooltipSample.wma == null
                    ? '--'
                    : formatPrice(tooltipSample.wma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-delta"
                >
                  delta{' '}
                  {tooltipSample.delta == null
                    ? '--'
                    : formatPrice(tooltipSample.delta)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-pct"
                >
                  wmaPct{' '}
                  {tooltipSample.wmaPct == null
                    ? '--'
                    : formatPct(tooltipSample.wmaPct)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-wma-pct-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-wma-pct-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bull {bullishThreshold} | bear{' '}
          {bearishThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-wma-pct-legend"
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
              { id: 'wma' as const, color: wmaColor, label: 'wma' },
              { id: 'pct' as const, color: pctColor, label: 'wma pct' },
            ] satisfies Array<{
              id: ChartLineWmaPctSeriesId;
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

ChartLineWmaPct.displayName = 'ChartLineWmaPct';
