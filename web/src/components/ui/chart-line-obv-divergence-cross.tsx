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
 * ChartLineObvDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close+volume On Balance
 * Volume (OBV) cumulative line in the bottom panel, marking
 * bullish (price down + OBV up, potential accumulation /
 * bottom-reversal warning) / bearish (price up + OBV down,
 * potential distribution / top-reversal warning) divergence
 * cross events. Divergence variant of the OBV family: when
 * OBV diverges from price, the smart-money accumulation /
 * distribution thesis usually leads the eventual price move.
 *
 *   direction[i] = sign(close[i] - close[i-1])
 *   obv[i]       = obv[i-1] + direction[i] * volume[i]; obv[0]=0
 *   priceUp      = close[i] > close[i-window]
 *   obvUp        = obv[i]   > obv[i-window]
 *   state
 *     aligned-bullish    : priceUp && obvUp
 *     aligned-bearish    : !priceUp && !obvUp
 *     divergent-bullish  : !priceUp && obvUp   (price down, OBV up)
 *     divergent-bearish  : priceUp && !obvUp   (price up, OBV down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `divergenceWindow = 5`. Unlike the SMA-warmup
 * divergence primitives, OBV is a running cumulative total and
 * needs no length-based warmup -- only the look-back window.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K, V = const**: direction = 0 (every bar)
 *   -> obv = 0 constant. priceUp = false (close[i] ===
 *   close[i-5]), obvUp = false (0 === 0) -> regime
 *   `aligned-bearish` (neither rising). 0 divergence crosses.
 *   Verified across K = 0..1234 and V = 1, 100, 1000, 1234.
 * - **LINEAR UP close = i, V = 1000**: direction = +1 -> obv =
 *   [0, V, 2V, 3V, ...]. priceUp = true, obvUp = true (5V > 0)
 *   -> regime `aligned-bullish` (price and OBV both rising,
 *   accumulation confirmed). 0 crosses. Unlike RSI / Stochastic
 *   / CMO which saturate on monotonic uptrends and produce
 *   `divergent-bearish`, OBV correctly tracks the trend
 *   linearly -- canonical OBV behavior.
 * - **LINEAR DOWN close = -i, V = 1000**: direction = -1 ->
 *   obv = [0, -V, -2V, ...]. priceUp = false, obvUp = false
 *   (-i*V < -(i-5)*V) -> regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineObvDivergenceCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineObvDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineObvDivergenceCrossSeriesId = 'price' | 'obv';

export type ChartLineObvDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineObvDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineObvDivergenceCrossCrossKind;
}

export interface ChartLineObvDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  obv: number;
  priceUp: boolean | null;
  obvUp: boolean | null;
  regime: ChartLineObvDivergenceCrossRegime;
}

export interface ChartLineObvDivergenceCrossRun {
  series: ChartLineObvDivergenceCrossPoint[];
  divergenceWindow: number;
  obvValues: number[];
  samples: ChartLineObvDivergenceCrossSample[];
  crosses: ChartLineObvDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineObvDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineObvDivergenceCrossLayout {
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
  priceDots: ChartLineObvDivergenceCrossDot[];
  obvPath: string;
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
    kind: ChartLineObvDivergenceCrossCrossKind;
  }>;
  run: ChartLineObvDivergenceCrossRun;
}

export interface ChartLineObvDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineObvDivergenceCrossPoint[];
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  obvColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showObv?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineObvDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineObvDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineObvDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_OBV_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineObvDivergenceCrossFinitePoints(
  data: readonly ChartLineObvDivergenceCrossPoint[] | null | undefined,
): ChartLineObvDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineObvDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

export function normalizeLineObvDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * Cumulative On Balance Volume from close + volume series.
 * obv[0] = 0 by convention. For i >= 1:
 *   obv[i] = obv[i-1] + sign(close[i] - close[i-1]) * volume[i]
 */
export function applyLineObvDivergenceCrossObv(
  series: readonly ChartLineObvDivergenceCrossPoint[],
): number[] {
  const out: number[] = new Array(series.length).fill(0);
  if (series.length === 0) return out;
  out[0] = 0;
  for (let i = 1; i < series.length; i += 1) {
    const dC = series[i]!.close - series[i - 1]!.close;
    let dir = 0;
    if (dC > 0) dir = 1;
    else if (dC < 0) dir = -1;
    out[i] = posZero(out[i - 1]! + dir * series[i]!.volume);
  }
  return out;
}

export interface LineObvDivergenceCrossChannels {
  obv: number[];
}

export function computeLineObvDivergenceCross(
  series: readonly ChartLineObvDivergenceCrossPoint[] | null | undefined,
): LineObvDivergenceCrossChannels {
  const cleaned = getLineObvDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) return { obv: [] };
  return { obv: applyLineObvDivergenceCrossObv(cleaned) };
}

export function classifyLineObvDivergenceCrossRegime(
  priceUp: boolean | null,
  obvUp: boolean | null,
): ChartLineObvDivergenceCrossRegime {
  if (priceUp == null || obvUp == null) return 'none';
  if (priceUp && obvUp) return 'aligned-bullish';
  if (!priceUp && !obvUp) return 'aligned-bearish';
  if (!priceUp && obvUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineObvDivergenceCrossCrosses(
  series: readonly ChartLineObvDivergenceCrossPoint[],
  states: readonly ChartLineObvDivergenceCrossRegime[],
): ChartLineObvDivergenceCrossCross[] {
  const out: ChartLineObvDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = states[i - 1];
    const cur = states[i];
    if (prev === 'none' || cur === 'none') continue;
    if (prev !== 'divergent-bullish' && cur === 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (
      prev !== 'divergent-bearish' &&
      cur === 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineObvDivergenceCross(
  data: ChartLineObvDivergenceCrossPoint[],
  options: { divergenceWindow?: number } = {},
): ChartLineObvDivergenceCrossRun {
  const cleaned = getLineObvDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const divergenceWindow = normalizeLineObvDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineObvDivergenceCross(series);

  const samples: ChartLineObvDivergenceCrossSample[] = series.map((p, i) => {
    const obv = channels.obv[i] ?? 0;
    let priceUp: boolean | null = null;
    let obvUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const oPrev = channels.obv[i - divergenceWindow];
      if (oPrev != null) obvUp = obv > oPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      obv,
      priceUp,
      obvUp,
      regime: classifyLineObvDivergenceCrossRegime(priceUp, obvUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineObvDivergenceCrossCrosses(series, states);

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    switch (s.regime) {
      case 'aligned-bullish':
        alignedBullishCount += 1;
        break;
      case 'aligned-bearish':
        alignedBearishCount += 1;
        break;
      case 'divergent-bullish':
        divergentBullishCount += 1;
        break;
      case 'divergent-bearish':
        divergentBearishCount += 1;
        break;
      default:
        noneCount += 1;
    }
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > divergenceWindow;

  return {
    series,
    divergenceWindow,
    obvValues: channels.obv,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineObvDivergenceCrossLayoutOptions {
  data: ChartLineObvDivergenceCrossPoint[];
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineObvDivergenceCrossLayout(
  opts: ComputeLineObvDivergenceCrossLayoutOptions,
): ChartLineObvDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineObvDivergenceCross(opts.data, {
    divergenceWindow: opts.divergenceWindow ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let obvMin = Infinity;
  let obvMax = -Infinity;
  for (const v of run.obvValues) {
    if (v < obvMin) obvMin = v;
    if (v > obvMax) obvMax = v;
  }
  let oscMin: number;
  let oscMax: number;
  if (!Number.isFinite(obvMin) || !Number.isFinite(obvMax)) {
    oscMin = -1;
    oscMax = 1;
  } else {
    const lo = Math.min(obvMin, 0);
    const hi = Math.max(obvMax, 0);
    if (lo === hi) {
      oscMin = -1;
      oscMax = 1;
    } else {
      const span = Math.max(Math.abs(lo), Math.abs(hi));
      oscMin = -span * 1.1;
      oscMax = span * 1.1;
    }
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroY = syOscBase(0);

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
      obvPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      zeroY,
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

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);

  let pricePath = '';
  const priceDots: ChartLineObvDivergenceCrossDot[] = [];
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

  let obvPath = '';
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syOscBase(s.obv);
    obvPath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
  }
  obvPath = obvPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.obvValues[c.index] ?? 0);
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
    obvPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineObvDivergenceCrossChart(
  data: ChartLineObvDivergenceCrossPoint[],
  options: { divergenceWindow?: number } = {},
): string {
  const cleaned = getLineObvDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const divergenceWindow = normalizeLineObvDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `OBV Divergence Cross chart over ${cleaned.length} bars ` +
    `(divergenceWindow ${divergenceWindow}). Top panel renders ` +
    `the close with bullish (price down + OBV up, potential ` +
    `accumulation / bottom reversal warning) / bearish (price up ` +
    `+ OBV down, potential distribution / top reversal warning) ` +
    `chevron overlays at every price-versus-OBV direction ` +
    `disagreement event; bottom panel renders the cumulative ` +
    `On Balance Volume line (running total of signed volume) on ` +
    `an auto-fitted symmetric oscillator with the zero reference ` +
    `and marks accumulation distribution warning events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineObvDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineObvDivergenceCrossProps
>(function ChartLineObvDivergenceCross(props, ref): ReactNode {
  const {
    data,
    divergenceWindow = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_PRICE_COLOR,
    obvColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_OBV_COLOR,
    bullishColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_OBV_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showObv = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZero = true,
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
    () => getLineObvDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineObvDivergenceCrossLayout({
        data: cleaned,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, divergenceWindow, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineObvDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineObvDivergenceCrossSeriesId,
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
    seriesId: ChartLineObvDivergenceCrossSeriesId,
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
        data-section="chart-line-obv-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineObvDivergenceCrossChart(cleaned, { divergenceWindow });

  const showPrice = !hidden.has('price');
  const showObvLine = !hidden.has('obv') && showObv;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, 0, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'OBV Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-obv-divergence-cross"
      data-divergence-window={divergenceWindow}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-obv-divergence-cross-title"
      >
        {ariaLabel ?? 'OBV Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-obv-divergence-cross-aria-desc"
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
        data-section="chart-line-obv-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-obv-divergence-cross-grid">
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
                  data-section="chart-line-obv-divergence-cross-grid-line-price"
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
                  data-section="chart-line-obv-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-obv-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-obv-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-obv-divergence-cross-axes">
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
                  data-section="chart-line-obv-divergence-cross-tick-price"
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
                  data-section="chart-line-obv-divergence-cross-tick-osc"
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
            data-section="chart-line-obv-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-obv-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-obv-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showObvLine ? (
          <path
            d={layout.obvPath}
            stroke={obvColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-divergence-cross-obv-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-obv-divergence-cross-crosses"
            role="group"
            aria-label="divergence markers"
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
                aria-label={`${m.kind} divergence at ${formatX(m.x)}`}
                data-section={`chart-line-obv-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-obv-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay divergence markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} divergence overlay at ${formatX(m.x)}`}
                data-section={`chart-line-obv-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-obv-divergence-cross-hover-targets">
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
                data-section="chart-line-obv-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-obv-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-obv"
                >
                  OBV {formatOsc(tooltipSample.obv)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-obv-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          window {divergenceWindow} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-obv-divergence-cross-legend"
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
              { id: 'obv' as const, color: obvColor, label: 'OBV' },
            ] satisfies Array<{
              id: ChartLineObvDivergenceCrossSeriesId;
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

ChartLineObvDivergenceCross.displayName = 'ChartLineObvDivergenceCross';
