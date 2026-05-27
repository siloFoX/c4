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
 * ChartLineVortexCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the Vortex Indicator (VI+ over
 * VI-) in the bottom panel, marking bullish / bearish cross
 * trigger events for directional movement regime changes. Cross
 * markers are also painted as arrow overlays on the price panel
 * for direct charting-overlay use.
 *
 * Simplified close-only Vortex with sum-of-window normalisation:
 *
 *   TR[i]    = i === 0 ? 0 : |close[i] - close[i-1]|
 *   VMp[i]   = i === 0 ? 0
 *                    : close[i] > close[i-1]
 *                        ? close[i] - close[i-1] : 0
 *   VMn[i]   = i === 0 ? 0
 *                    : close[i] < close[i-1]
 *                        ? close[i-1] - close[i] : 0
 *   sumTR[i] = sum(TR[i-length+1 .. i])
 *   sumVMp[i]= sum(VMp[i-length+1 .. i])
 *   sumVMn[i]= sum(VMn[i-length+1 .. i])
 *   VIplus[i] = sumTR === 0 ? 0.5 : sumVMp / sumTR
 *   VIminus[i]= sumTR === 0 ? 0.5 : sumVMn / sumTR
 *   bullish : (VIplus - VIminus) crosses up
 *   bearish : (VIplus - VIminus) crosses down
 *
 * Defaults: `length = 14` (canonical Vortex). Regime
 * classifier: `bullish` (VIplus > VIminus), `bearish` (VIplus <
 * VIminus), `neutral` (VIplus === VIminus), `none` (either side
 * null).
 *
 * Bit-exact anchors (three):
 *
 * - **CONST close = K**: every TR = VMp = VMn = 0 -> sumTR = 0
 *   -> VIplus = VIminus = 0.5 every bar after warmup. VIplus
 *   === VIminus -> regime `neutral`, cross count = 0.
 * - **LINEAR UP step > 0**: every close > close[i-1], so
 *   VMp = step, VMn = 0, TR = step. sum(VMp) = length*step,
 *   sum(TR) = length*step -> VIplus = 1, VIminus = 0 every bar
 *   after warmup. Regime `bullish`, cross count = 0 (no
 *   transition - starts bullish at warmup).
 * - **LINEAR DOWN step < 0**: symmetric, VIplus = 0, VIminus
 *   = 1, regime `bearish`, cross count = 0.
 */

export interface ChartLineVortexCrossPoint {
  x: number;
  close: number;
}

export type ChartLineVortexCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineVortexCrossSeriesId = 'price' | 'plus' | 'minus';

export type ChartLineVortexCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVortexCrossCross {
  index: number;
  x: number;
  kind: ChartLineVortexCrossCrossKind;
}

export interface ChartLineVortexCrossSample {
  index: number;
  x: number;
  close: number;
  viPlus: number | null;
  viMinus: number | null;
  regime: ChartLineVortexCrossRegime;
}

export interface ChartLineVortexCrossRun {
  series: ChartLineVortexCrossPoint[];
  length: number;
  plusValues: Array<number | null>;
  minusValues: Array<number | null>;
  samples: ChartLineVortexCrossSample[];
  crosses: ChartLineVortexCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineVortexCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVortexCrossLayout {
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
  priceDots: ChartLineVortexCrossDot[];
  plusPath: string;
  minusPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineVortexCrossCrossKind;
  }>;
  run: ChartLineVortexCrossRun;
}

export interface ChartLineVortexCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVortexCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  plusColor?: string;
  minusColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  midColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPlus?: boolean;
  showMinus?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showMidLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVortexCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVortexCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVortexCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VORTEX_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_VORTEX_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_PLUS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_MINUS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_MID_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineVortexCrossFinitePoints(
  data: readonly ChartLineVortexCrossPoint[] | null | undefined,
): ChartLineVortexCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVortexCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineVortexCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface LineVortexCrossChannels {
  plus: Array<number | null>;
  minus: Array<number | null>;
}

export function computeLineVortexCross(
  series: readonly ChartLineVortexCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineVortexCrossChannels {
  const cleaned = getLineVortexCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { plus: [], minus: [] };
  }
  const length = normalizeLineVortexCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VORTEX_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  const vmp: number[] = new Array(closes.length).fill(0);
  const vmn: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i]! - closes[i - 1]!;
    tr[i] = Math.abs(delta);
    if (delta > 0) vmp[i] = delta;
    else if (delta < 0) vmn[i] = -delta;
  }

  const plus: Array<number | null> = new Array(closes.length).fill(null);
  const minus: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length; i < closes.length; i += 1) {
    let sumTr = 0;
    let sumVmp = 0;
    let sumVmn = 0;
    for (let k = 0; k < length; k += 1) {
      sumTr += tr[i - k]!;
      sumVmp += vmp[i - k]!;
      sumVmn += vmn[i - k]!;
    }
    if (sumTr === 0) {
      plus[i] = 0.5;
      minus[i] = 0.5;
    } else {
      plus[i] = posZero(sumVmp / sumTr);
      minus[i] = posZero(sumVmn / sumTr);
    }
  }

  return { plus, minus };
}

export function classifyLineVortexCrossRegime(
  plus: number | null,
  minus: number | null,
): ChartLineVortexCrossRegime {
  if (plus == null || minus == null) return 'none';
  if (plus > minus) return 'bullish';
  if (plus < minus) return 'bearish';
  return 'neutral';
}

export function detectLineVortexCrossCrosses(
  series: readonly ChartLineVortexCrossPoint[],
  plus: readonly (number | null)[],
  minus: readonly (number | null)[],
): ChartLineVortexCrossCross[] {
  const out: ChartLineVortexCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pp = plus[i - 1];
    const mp = minus[i - 1];
    const pc = plus[i];
    const mc = minus[i];
    if (pp == null || mp == null || pc == null || mc == null) continue;
    const prevDiff = pp - mp;
    const curDiff = pc - mc;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineVortexCross(
  data: ChartLineVortexCrossPoint[],
  options: { length?: number } = {},
): ChartLineVortexCrossRun {
  const cleaned = getLineVortexCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineVortexCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VORTEX_CROSS_LENGTH,
  );

  const channels = computeLineVortexCross(series, { length });

  const samples: ChartLineVortexCrossSample[] = series.map((p, i) => {
    const plus = channels.plus[i] ?? null;
    const minus = channels.minus[i] ?? null;
    const regime = classifyLineVortexCrossRegime(plus, minus);
    return {
      index: i,
      x: p.x,
      close: p.close,
      viPlus: plus,
      viMinus: minus,
      regime,
    };
  });

  const crosses = detectLineVortexCrossCrosses(
    series,
    channels.plus,
    channels.minus,
  );

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

  const ok = series.length > length;

  return {
    series,
    length,
    plusValues: channels.plus,
    minusValues: channels.minus,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineVortexCrossLayoutOptions {
  data: ChartLineVortexCrossPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVortexCrossLayout(
  opts: ComputeLineVortexCrossLayoutOptions,
): ChartLineVortexCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VORTEX_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VORTEX_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VORTEX_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VORTEX_CROSS_PANEL_GAP;

  const run = runLineVortexCross(opts.data, {
    length: opts.length ?? undefined,
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
      plusPath: '',
      minusPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 1,
      midY: (oscTop + oscBottom) / 2,
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

  // VI values are in [0, 1]; pin axis to that range so the midline
  // at 0.5 stays visually anchored.
  const oscMin = 0;
  const oscMax = 1;

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
  const priceDots: ChartLineVortexCrossDot[] = [];
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

  let plusPath = '';
  let plusFirst = true;
  for (const s of run.samples) {
    if (s.viPlus == null) {
      plusFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.viPlus);
    plusPath += `${plusFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    plusFirst = false;
  }
  plusPath = plusPath.trim();

  let minusPath = '';
  let minusFirst = true;
  for (const s of run.samples) {
    if (s.viMinus == null) {
      minusFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.viMinus);
    minusPath += `${minusFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    minusFirst = false;
  }
  minusPath = minusPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.plusValues[c.index] ?? 0.5);
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
    plusPath,
    minusPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY: syOsc(0.5),
    crossMarkers,
    run,
  };
}

export function describeLineVortexCrossChart(
  data: ChartLineVortexCrossPoint[],
  options: { length?: number } = {},
): string {
  const cleaned = getLineVortexCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVortexCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VORTEX_CROSS_LENGTH,
  );
  return (
    `Vortex Cross chart over ${cleaned.length} bars (length ` +
    `${length}). Top panel renders the close with bullish / ` +
    `bearish arrow overlays at every VI+/VI- crossover; bottom ` +
    `panel overlays VI+ and VI- and marks directional movement ` +
    `regime change events.`
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

export const ChartLineVortexCross = forwardRef<
  HTMLDivElement,
  ChartLineVortexCrossProps
>(function ChartLineVortexCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VORTEX_CROSS_LENGTH,
    width = DEFAULT_CHART_LINE_VORTEX_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VORTEX_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VORTEX_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VORTEX_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VORTEX_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VORTEX_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VORTEX_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VORTEX_CROSS_PRICE_COLOR,
    plusColor = DEFAULT_CHART_LINE_VORTEX_CROSS_PLUS_COLOR,
    minusColor = DEFAULT_CHART_LINE_VORTEX_CROSS_MINUS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VORTEX_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VORTEX_CROSS_BEARISH_COLOR,
    midColor = DEFAULT_CHART_LINE_VORTEX_CROSS_MID_COLOR,
    axisColor = DEFAULT_CHART_LINE_VORTEX_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VORTEX_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPlus = true,
    showMinus = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showMidLine = true,
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
    () => getLineVortexCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVortexCrossLayout({
        data: cleaned,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVortexCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVortexCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVortexCrossSeriesId,
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
        data-section="chart-line-vortex-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineVortexCrossChart(cleaned, { length });

  const showPrice = !hidden.has('price');
  const showPlusLine = !hidden.has('plus') && showPlus;
  const showMinusLine = !hidden.has('minus') && showMinus;

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
      aria-label={ariaLabel ?? 'Vortex Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-vortex-cross"
      data-length={length}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-vortex-cross-title"
      >
        {ariaLabel ?? 'Vortex Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vortex-cross-aria-desc"
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
        data-section="chart-line-vortex-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vortex-cross-grid">
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
                  data-section="chart-line-vortex-cross-grid-line-price"
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
                  data-section="chart-line-vortex-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vortex-cross-axes">
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
                  data-section="chart-line-vortex-cross-tick-price"
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
                  data-section="chart-line-vortex-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showMidLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midY}
            x2={layout.innerRight}
            y2={layout.midY}
            stroke={midColor}
            strokeDasharray="2 4"
            data-section="chart-line-vortex-cross-midline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vortex-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vortex-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPlusLine ? (
          <path
            d={layout.plusPath}
            stroke={plusColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-cross-plus-path"
          />
        ) : null}

        {showMinusLine ? (
          <path
            d={layout.minusPath}
            stroke={minusColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-cross-minus-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vortex-cross-crosses"
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
                data-section={`chart-line-vortex-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-vortex-cross-overlay-crosses"
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
                data-section={`chart-line-vortex-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vortex-cross-hover-targets">
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
                data-section="chart-line-vortex-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vortex-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-plus"
                >
                  VI+{' '}
                  {tooltipSample.viPlus == null
                    ? '--'
                    : formatOsc(tooltipSample.viPlus)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-minus"
                >
                  VI-{' '}
                  {tooltipSample.viMinus == null
                    ? '--'
                    : formatOsc(tooltipSample.viMinus)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-cross-tooltip-crosses"
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
          data-section="chart-line-vortex-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vortex-cross-legend"
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
              { id: 'plus' as const, color: plusColor, label: 'VI+' },
              { id: 'minus' as const, color: minusColor, label: 'VI-' },
            ] satisfies Array<{
              id: ChartLineVortexCrossSeriesId;
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

ChartLineVortexCross.displayName = 'ChartLineVortexCross';
