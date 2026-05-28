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
 * ChartLineElderBearCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Elder Bear Power
 * line in the bottom panel, marking bullish / bearish Bear
 * Power zero-cross trigger events. Zero-cross variant of the
 * Elder Ray family that flags seller strength regime transition
 * events distinct from the absolute Bear Power magnitude.
 *
 *   lowProxy[i] = min(close[i-h+1..i])                (close-only)
 *   ema[i]      = EMA(close, length)
 *   bear[i]     = lowProxy - ema
 *   bullish    : bear crosses up   (prev <= 0, cur > 0)
 *   bearish    : bear crosses down (prev >= 0, cur < 0)
 *
 * Defaults: `length = 13` (canonical Elder Ray EMA window),
 * `lowProxyLength = 2` (close-only low proxy from a 2-bar
 * window of closes). Regime classifier `bullish` (bear > 0
 * meaning weak bears), `bearish` (bear < 0 meaning strong
 * bears), `neutral` (bear === 0), `none` (bear null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: lowProxy = K every bar -> EMA(K) =
 *   K via the `min === max` precision short-circuit; bear =
 *   K - K = 0. Regime is `neutral`, cross count = 0. Verified
 *   across K = 0..1234.
 */

export interface ChartLineElderBearCrossPoint {
  x: number;
  close: number;
}

export type ChartLineElderBearCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineElderBearCrossSeriesId = 'price' | 'bear';

export type ChartLineElderBearCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineElderBearCrossCross {
  index: number;
  x: number;
  kind: ChartLineElderBearCrossCrossKind;
}

export interface ChartLineElderBearCrossSample {
  index: number;
  x: number;
  close: number;
  bear: number | null;
  regime: ChartLineElderBearCrossRegime;
}

export interface ChartLineElderBearCrossRun {
  series: ChartLineElderBearCrossPoint[];
  length: number;
  lowProxyLength: number;
  bearValues: Array<number | null>;
  samples: ChartLineElderBearCrossSample[];
  crosses: ChartLineElderBearCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineElderBearCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineElderBearCrossLayout {
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
  priceDots: ChartLineElderBearCrossDot[];
  bearPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineElderBearCrossCrossKind;
  }>;
  run: ChartLineElderBearCrossRun;
}

export interface ChartLineElderBearCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineElderBearCrossPoint[];
  length?: number;
  lowProxyLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  bearColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBear?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineElderBearCrossSeriesId[];
  defaultHiddenSeries?: ChartLineElderBearCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineElderBearCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LENGTH = 13;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LOW_PROXY_LENGTH = 2;
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_ZERO_LINE_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineElderBearCrossFinitePoints(
  data: readonly ChartLineElderBearCrossPoint[] | null | undefined,
): ChartLineElderBearCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineElderBearCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineElderBearCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineElderBearCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next =
          nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineElderBearCrossChannels {
  bear: Array<number | null>;
}

export function computeLineElderBearCross(
  series: readonly ChartLineElderBearCrossPoint[] | null | undefined,
  options: { length?: number; lowProxyLength?: number } = {},
): LineElderBearCrossChannels {
  const cleaned = getLineElderBearCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { bear: [] };
  }
  const length = normalizeLineElderBearCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LENGTH,
  );
  const lowProxyLength = normalizeLineElderBearCrossLength(
    options.lowProxyLength,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LOW_PROXY_LENGTH,
  );

  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const ema = applyLineElderBearCrossEma(closes, length);

  const bear: Array<number | null> = new Array(cleaned.length).fill(null);

  for (let i = lowProxyLength - 1; i < cleaned.length; i += 1) {
    let lo = Infinity;
    for (let j = i - lowProxyLength + 1; j <= i; j += 1) {
      const v = cleaned[j]!.close;
      if (v < lo) lo = v;
    }
    const e = ema[i];
    if (e == null) continue;
    bear[i] = posZero(lo - e);
  }
  return { bear };
}

export function classifyLineElderBearCrossRegime(
  bear: number | null,
): ChartLineElderBearCrossRegime {
  if (bear == null) return 'none';
  if (bear > 0) return 'bullish';
  if (bear < 0) return 'bearish';
  return 'neutral';
}

export function detectLineElderBearCrossCrosses(
  series: readonly ChartLineElderBearCrossPoint[],
  bear: readonly (number | null)[],
): ChartLineElderBearCrossCross[] {
  const out: ChartLineElderBearCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = bear[i - 1];
    const cur = bear[i];
    if (prev == null || cur == null) continue;
    if (prev <= 0 && cur > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= 0 && cur < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineElderBearCross(
  data: ChartLineElderBearCrossPoint[],
  options: { length?: number; lowProxyLength?: number } = {},
): ChartLineElderBearCrossRun {
  const cleaned = getLineElderBearCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineElderBearCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LENGTH,
  );
  const lowProxyLength = normalizeLineElderBearCrossLength(
    options.lowProxyLength,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LOW_PROXY_LENGTH,
  );

  const channels = computeLineElderBearCross(series, {
    length,
    lowProxyLength,
  });

  const samples: ChartLineElderBearCrossSample[] = series.map((p, i) => {
    const b = channels.bear[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      bear: b,
      regime: classifyLineElderBearCrossRegime(b),
    };
  });

  const crosses = detectLineElderBearCrossCrosses(series, channels.bear);

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length + 1;

  return {
    series = [],
    length,
    lowProxyLength,
    bearValues: channels.bear,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineElderBearCrossLayoutOptions {
  data: ChartLineElderBearCrossPoint[];
  length?: number;
  lowProxyLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineElderBearCrossLayout(
  opts: ComputeLineElderBearCrossLayoutOptions,
): ChartLineElderBearCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PANEL_GAP;

  const run = runLineElderBearCross(opts.data, {
    length: opts.length ?? undefined,
    lowProxyLength: opts.lowProxyLength ?? undefined,
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
      bearPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: oscBottom,
      crossMarkers: [],
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
    if (s.bear != null) {
      if (s.bear < oscMin) oscMin = s.bear;
      if (s.bear > oscMax) oscMax = s.bear;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

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

  const zeroY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineElderBearCrossDot[] = [];
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

  let bearPath = '';
  let bearFirst = true;
  for (const s of run.samples) {
    if (s.bear == null) {
      bearFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.bear);
    bearPath += `${bearFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    bearFirst = false;
  }
  bearPath = bearPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.bearValues[c.index] ?? 0);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
    };
  });

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
    bearPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineElderBearCrossChart(
  data: ChartLineElderBearCrossPoint[],
  options: { length?: number; lowProxyLength?: number } = {},
): string {
  const cleaned = getLineElderBearCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineElderBearCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LENGTH,
  );
  const lowProxyLength = normalizeLineElderBearCrossLength(
    options.lowProxyLength,
    DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LOW_PROXY_LENGTH,
  );
  return (
    `Elder Bear Cross chart over ${cleaned.length} bars (length ` +
    `${length}, lowProxyLength ${lowProxyLength}). Top panel ` +
    `renders the close with bullish / bearish arrow overlays at ` +
    `every Bear Power zero crossover; bottom panel renders the ` +
    `Elder Bear Power line and marks seller strength regime ` +
    `transition events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineElderBearCross = forwardRef<
  HTMLDivElement,
  ChartLineElderBearCrossProps
>(function ChartLineElderBearCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LENGTH,
    lowProxyLength = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_LOW_PROXY_LENGTH,
    width = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_PRICE_COLOR,
    bearColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BEAR_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ELDER_BEAR_CROSS_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBear = true,
    showCrosses = true,
    showOverlayCrosses = true,
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
    () => getLineElderBearCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineElderBearCrossLayout({
        data: cleaned,
        length,
        lowProxyLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      lowProxyLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineElderBearCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineElderBearCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineElderBearCrossSeriesId,
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
        data-section="chart-line-elder-bear-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineElderBearCrossChart(cleaned, { length, lowProxyLength });

  const showPrice = !hidden.has('price');
  const showBearLine = !hidden.has('bear') && showBear;

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
      aria-label={ariaLabel ?? 'Elder Bear Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-elder-bear-cross"
      data-length={length}
      data-low-proxy-length={lowProxyLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-elder-bear-cross-title"
      >
        {ariaLabel ?? 'Elder Bear Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-elder-bear-cross-aria-desc"
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
        data-section="chart-line-elder-bear-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-elder-bear-cross-grid">
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
                  data-section="chart-line-elder-bear-cross-grid-line-price"
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
                  data-section="chart-line-elder-bear-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-elder-bear-cross-axes">
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
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroLineColor}
              strokeDasharray="4 4"
              data-section="chart-line-elder-bear-cross-zero-line"
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
                  data-section="chart-line-elder-bear-cross-tick-price"
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
                  data-section="chart-line-elder-bear-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-elder-bear-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-elder-bear-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-elder-bear-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showBearLine ? (
          <path
            d={layout.bearPath}
            stroke={bearColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-elder-bear-cross-bear-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-elder-bear-cross-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-elder-bear-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-elder-bear-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-elder-bear-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-elder-bear-cross-hover-targets">
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
                data-section="chart-line-elder-bear-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-elder-bear-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-bear"
                >
                  bear{' '}
                  {tooltipSample.bear == null
                    ? '--'
                    : formatOsc(tooltipSample.bear)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-elder-bear-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-elder-bear-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | proxy {lowProxyLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-elder-bear-cross-legend"
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
              {
                id: 'bear' as const,
                color: bearColor,
                label: 'Bear Power',
              },
            ] satisfies Array<{
              id: ChartLineElderBearCrossSeriesId;
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

ChartLineElderBearCross.displayName = 'ChartLineElderBearCross';
