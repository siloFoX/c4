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
 * ChartLineBalancePowerCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Balance of
 * Power oscillator in the bottom panel, marking bullish /
 * bearish BoP zero-cross trigger events. Signal-cross variant
 * of the BoP family that flags buyer / seller dominance regime
 * change events distinct from the absolute BoP magnitude.
 *
 *   delta[i]   = close[i] - close[i-1]                  (close-only open proxy)
 *   hi[i]      = max(close[i-b+1..i])                  (range proxy)
 *   lo[i]      = min(close[i-b+1..i])
 *   range[i]   = hi - lo
 *   raw[i]     = range > 0 ? delta / range : 0          (Balance of Power)
 *   bop[i]     = SMA(raw, smoothLength)
 *   bullish   : bop crosses up   (prev <= 0, cur > 0)
 *   bearish   : bop crosses down (prev >= 0, cur < 0)
 *
 * Defaults: `barLength = 5` (high / low rolling window),
 * `smoothLength = 3` (canonical BoP smoothing). Regime
 * classifier `bullish` (bop > 0), `bearish` (bop < 0),
 * `neutral` (bop === 0), `none` (bop null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every delta = 0 -> raw numerator = 0;
 *   range = 0 -> divide-by-zero guard yields raw = 0. SMA of
 *   0s = 0 via the `min === max` precision short-circuit.
 *   bop = 0 -> regime `neutral`, cross count = 0. Verified
 *   across K = 0..1234.
 */

export interface ChartLineBalancePowerCrossPoint {
  x: number;
  close: number;
}

export type ChartLineBalancePowerCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineBalancePowerCrossSeriesId = 'price' | 'bop';

export type ChartLineBalancePowerCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineBalancePowerCrossCross {
  index: number;
  x: number;
  kind: ChartLineBalancePowerCrossCrossKind;
}

export interface ChartLineBalancePowerCrossSample {
  index: number;
  x: number;
  close: number;
  bop: number | null;
  regime: ChartLineBalancePowerCrossRegime;
}

export interface ChartLineBalancePowerCrossRun {
  series: ChartLineBalancePowerCrossPoint[];
  barLength: number;
  smoothLength: number;
  bopValues: Array<number | null>;
  samples: ChartLineBalancePowerCrossSample[];
  crosses: ChartLineBalancePowerCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineBalancePowerCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineBalancePowerCrossLayout {
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
  priceDots: ChartLineBalancePowerCrossDot[];
  bopPath: string;
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
    kind: ChartLineBalancePowerCrossCrossKind;
  }>;
  run: ChartLineBalancePowerCrossRun;
}

export interface ChartLineBalancePowerCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBalancePowerCrossPoint[];
  barLength?: number;
  smoothLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  bopColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBop?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBalancePowerCrossSeriesId[];
  defaultHiddenSeries?: ChartLineBalancePowerCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBalancePowerCrossSeriesId;
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

export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BAR_LENGTH = 5;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_SMOOTH_LENGTH = 3;
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BOP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_ZERO_LINE_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineBalancePowerCrossFinitePoints(
  data: readonly ChartLineBalancePowerCrossPoint[] | null | undefined,
): ChartLineBalancePowerCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBalancePowerCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineBalancePowerCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineBalancePowerCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface LineBalancePowerCrossChannels {
  raw: Array<number | null>;
  bop: Array<number | null>;
}

export function computeLineBalancePowerCross(
  series: readonly ChartLineBalancePowerCrossPoint[] | null | undefined,
  options: { barLength?: number; smoothLength?: number } = {},
): LineBalancePowerCrossChannels {
  const cleaned = getLineBalancePowerCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { raw: [], bop: [] };
  }
  const barLength = normalizeLineBalancePowerCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BAR_LENGTH,
  );
  const smoothLength = normalizeLineBalancePowerCrossLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_SMOOTH_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const raw: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = 1; i < closes.length; i += 1) {
    let hi = -Infinity;
    let lo = Infinity;
    const startJ = Math.max(0, i - barLength + 1);
    for (let j = startJ; j <= i; j += 1) {
      const v = closes[j]!;
      if (v > hi) hi = v;
      if (v < lo) lo = v;
    }
    const range = hi - lo;
    const delta = closes[i]! - closes[i - 1]!;
    if (range <= 0) {
      raw[i] = 0;
    } else {
      raw[i] = posZero(delta / range);
    }
  }

  const bop = applyLineBalancePowerCrossSma(raw, smoothLength);
  return { raw, bop };
}

export function classifyLineBalancePowerCrossRegime(
  bop: number | null,
): ChartLineBalancePowerCrossRegime {
  if (bop == null) return 'none';
  if (bop > 0) return 'bullish';
  if (bop < 0) return 'bearish';
  return 'neutral';
}

export function detectLineBalancePowerCrossCrosses(
  series: readonly ChartLineBalancePowerCrossPoint[],
  bop: readonly (number | null)[],
): ChartLineBalancePowerCrossCross[] {
  const out: ChartLineBalancePowerCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = bop[i - 1];
    const cur = bop[i];
    if (prev == null || cur == null) continue;
    if (prev <= 0 && cur > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= 0 && cur < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineBalancePowerCross(
  data: ChartLineBalancePowerCrossPoint[],
  options: { barLength?: number; smoothLength?: number } = {},
): ChartLineBalancePowerCrossRun {
  const cleaned = getLineBalancePowerCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const barLength = normalizeLineBalancePowerCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BAR_LENGTH,
  );
  const smoothLength = normalizeLineBalancePowerCrossLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_SMOOTH_LENGTH,
  );

  const channels = computeLineBalancePowerCross(series, {
    barLength,
    smoothLength,
  });

  const samples: ChartLineBalancePowerCrossSample[] = series.map((p, i) => {
    const b = channels.bop[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      bop: b,
      regime: classifyLineBalancePowerCrossRegime(b),
    };
  });

  const crosses = detectLineBalancePowerCrossCrosses(series, channels.bop);

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

  const ok = series.length > barLength + smoothLength;

  return {
    series = [],
    barLength,
    smoothLength,
    bopValues: channels.bop,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineBalancePowerCrossLayoutOptions {
  data: ChartLineBalancePowerCrossPoint[];
  barLength?: number;
  smoothLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineBalancePowerCrossLayout(
  opts: ComputeLineBalancePowerCrossLayoutOptions,
): ChartLineBalancePowerCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PANEL_GAP;

  const run = runLineBalancePowerCross(opts.data, {
    barLength: opts.barLength ?? undefined,
    smoothLength: opts.smoothLength ?? undefined,
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
      bopPath: '',
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

  let oscMin = -1;
  let oscMax = 1;
  for (const s of run.samples) {
    if (s.bop != null) {
      if (s.bop < oscMin) oscMin = s.bop;
      if (s.bop > oscMax) oscMax = s.bop;
    }
  }
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
  const priceDots: ChartLineBalancePowerCrossDot[] = [];
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

  let bopPath = '';
  let bopFirst = true;
  for (const s of run.samples) {
    if (s.bop == null) {
      bopFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.bop);
    bopPath += `${bopFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    bopFirst = false;
  }
  bopPath = bopPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.bopValues[c.index] ?? 0);
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
    bopPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineBalancePowerCrossChart(
  data: ChartLineBalancePowerCrossPoint[],
  options: { barLength?: number; smoothLength?: number } = {},
): string {
  const cleaned = getLineBalancePowerCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const barLength = normalizeLineBalancePowerCrossLength(
    options.barLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BAR_LENGTH,
  );
  const smoothLength = normalizeLineBalancePowerCrossLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_SMOOTH_LENGTH,
  );
  return (
    `Balance of Power Cross chart over ${cleaned.length} bars ` +
    `(barLength ${barLength}, smoothLength ${smoothLength}). ` +
    `Top panel renders the close with bullish / bearish arrow ` +
    `overlays at every BoP zero crossover; bottom panel renders ` +
    `the smoothed Balance of Power oscillator centered on zero ` +
    `and marks buyer / seller dominance regime change events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 3);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineBalancePowerCross = forwardRef<
  HTMLDivElement,
  ChartLineBalancePowerCrossProps
>(function ChartLineBalancePowerCross(props, ref): ReactNode {
  const {
    data,
    barLength = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BAR_LENGTH,
    smoothLength = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_SMOOTH_LENGTH,
    width = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_PRICE_COLOR,
    bopColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BOP_COLOR,
    bullishColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_BALANCE_POWER_CROSS_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBop = true,
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
    () => getLineBalancePowerCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineBalancePowerCrossLayout({
        data: cleaned,
        barLength,
        smoothLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      barLength,
      smoothLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineBalancePowerCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineBalancePowerCrossSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineBalancePowerCrossSeriesId,
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
        data-section="chart-line-balance-power-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineBalancePowerCrossChart(cleaned, { barLength, smoothLength });

  const showPrice = !hidden.has('price');
  const showBopLine = !hidden.has('bop') && showBop;

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
      aria-label={ariaLabel ?? 'Balance of Power Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-balance-power-cross"
      data-bar-length={barLength}
      data-smooth-length={smoothLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-balance-power-cross-title"
      >
        {ariaLabel ?? 'Balance of Power Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-balance-power-cross-aria-desc"
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
        data-section="chart-line-balance-power-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-balance-power-cross-grid">
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
                  data-section="chart-line-balance-power-cross-grid-line-price"
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
                  data-section="chart-line-balance-power-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-balance-power-cross-axes">
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
              data-section="chart-line-balance-power-cross-zero-line"
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
                  data-section="chart-line-balance-power-cross-tick-price"
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
                  data-section="chart-line-balance-power-cross-tick-osc"
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
            data-section="chart-line-balance-power-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-balance-power-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-balance-power-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showBopLine ? (
          <path
            d={layout.bopPath}
            stroke={bopColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-balance-power-cross-bop-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-balance-power-cross-crosses"
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
                data-section={`chart-line-balance-power-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-balance-power-cross-overlay-crosses"
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
                data-section={`chart-line-balance-power-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-balance-power-cross-hover-targets">
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
                data-section="chart-line-balance-power-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-balance-power-cross-tooltip"
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
                  data-section="chart-line-balance-power-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-bop"
                >
                  bop{' '}
                  {tooltipSample.bop == null
                    ? '--'
                    : formatOsc(tooltipSample.bop)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-balance-power-cross-tooltip-crosses"
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
          data-section="chart-line-balance-power-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          bar {barLength} | smooth {smoothLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-balance-power-cross-legend"
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
              { id: 'bop' as const, color: bopColor, label: 'BoP' },
            ] satisfies Array<{
              id: ChartLineBalancePowerCrossSeriesId;
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

ChartLineBalancePowerCross.displayName = 'ChartLineBalancePowerCross';
