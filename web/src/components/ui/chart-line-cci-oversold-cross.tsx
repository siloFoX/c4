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
 * ChartLineCciOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Commodity
 * Channel Index (CCI) line in the bottom panel, marking
 * bullish (exit upward from oversold) / bearish (entry
 * downward into oversold) trigger events at the canonical -100
 * oversold threshold. Single-threshold cross variant of the
 * CCI family that flags the discrete CCI level -100 entry /
 * exit events. Mirror of 11.930 `chart-line-cci-overbought-
 * cross` using the oversold level (-100) instead of the
 * overbought level (+100).
 *
 *   sma[i]  = SMA(close, length)
 *   md[i]   = avg |close[i-n+1..i] - sma[i]|
 *   cci[i]  = md > 0
 *               ? (close - sma) / (0.015 * md)
 *               : 0
 *   bullish : prev <= -100 && cur > -100  (exit upward)
 *   bearish : prev >= -100 && cur < -100  (entry downward)
 *
 * Defaults: `length = 20` (canonical CCI window),
 * `threshold = -100` (canonical oversold level). Regime
 * classifier `oversold` (cci <= -100), `neutral` (cci > -100),
 * `none` (cci null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: sma = K every bar so |close - sma| = 0
 *   every bar -> mean deviation = 0 -> 0/0 short-circuit
 *   returns cci = 0. cci = 0 > -100, regime is `neutral` and
 *   the threshold is never crossed. cross count = 0. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: cci = +126.667 constant once warm
 *   (length 20). 126.667 > -100, regime `neutral`. 0 crosses.
 * - **LINEAR DOWN close = -i**: cci = -126.667 constant.
 *   -126.667 < -100, regime `oversold`. 0 crosses (cci jumps
 *   from null to -126.667 so prev-null skips the strict-
 *   inequality detector).
 */

export interface ChartLineCciOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineCciOversoldCrossRegime =
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineCciOversoldCrossSeriesId = 'price' | 'cci';

export type ChartLineCciOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineCciOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineCciOversoldCrossCrossKind;
}

export interface ChartLineCciOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  cci: number | null;
  regime: ChartLineCciOversoldCrossRegime;
}

export interface ChartLineCciOversoldCrossRun {
  series: ChartLineCciOversoldCrossPoint[];
  length: number;
  threshold: number;
  cciValues: Array<number | null>;
  samples: ChartLineCciOversoldCrossSample[];
  crosses: ChartLineCciOversoldCrossCross[];
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  exitCount: number;
  entryCount: number;
  ok: boolean;
}

export interface ChartLineCciOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCciOversoldCrossLayout {
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
  priceDots: ChartLineCciOversoldCrossDot[];
  cciPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineCciOversoldCrossCrossKind;
  }>;
  run: ChartLineCciOversoldCrossRun;
}

export interface ChartLineCciOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCciOversoldCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cciColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCci?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCciOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineCciOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCciOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD = -100;
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_CCI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE = 300;
const CCI_FACTOR = 0.015;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineCciOversoldCrossFinitePoints(
  data: readonly ChartLineCciOversoldCrossPoint[] | null | undefined,
): ChartLineCciOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCciOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCciOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite negative threshold. */
export function normalizeLineCciOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value < 0) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineCciOversoldCrossSma(
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

export interface LineCciOversoldCrossChannels {
  cci: Array<number | null>;
}

export function computeLineCciOversoldCross(
  series: readonly ChartLineCciOversoldCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineCciOversoldCrossChannels {
  const cleaned = getLineCciOversoldCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { cci: [] };
  }
  const length = normalizeLineCciOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const sma = applyLineCciOversoldCrossSma(closes, length);

  const cci: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length - 1; i < closes.length; i += 1) {
    const mean = sma[i];
    if (mean == null) continue;
    let sumAbsDev = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      sumAbsDev += Math.abs((closes[j] ?? 0) - mean);
    }
    const md = sumAbsDev / length;
    if (md === 0) {
      cci[i] = 0;
    } else {
      cci[i] = posZero(((closes[i] ?? 0) - mean) / (CCI_FACTOR * md));
    }
  }

  return { cci };
}

export function classifyLineCciOversoldCrossRegime(
  cci: number | null,
  threshold: number,
): ChartLineCciOversoldCrossRegime {
  if (cci == null) return 'none';
  if (cci <= threshold) return 'oversold';
  return 'neutral';
}

export function detectLineCciOversoldCrossCrosses(
  series: readonly ChartLineCciOversoldCrossPoint[],
  cci: readonly (number | null)[],
  threshold: number,
): ChartLineCciOversoldCrossCross[] {
  const out: ChartLineCciOversoldCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = cci[i - 1];
    const cur = cci[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineCciOversoldCross(
  data: ChartLineCciOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): ChartLineCciOversoldCrossRun {
  const cleaned = getLineCciOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineCciOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH,
  );
  const threshold = normalizeLineCciOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD,
  );

  const channels = computeLineCciOversoldCross(series, { length });

  const samples: ChartLineCciOversoldCrossSample[] = series.map((p, i) => {
    const v = channels.cci[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cci: v,
      regime: classifyLineCciOversoldCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineCciOversoldCrossCrosses(
    series,
    channels.cci,
    threshold,
  );

  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'oversold') oversoldCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }
  let exitCount = 0;
  let entryCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') exitCount += 1;
    else entryCount += 1;
  }

  const ok = series.length > length;

  return {
    series,
    length,
    threshold,
    cciValues: channels.cci,
    samples,
    crosses,
    oversoldCount,
    neutralCount,
    noneCount,
    exitCount,
    entryCount,
    ok,
  };
}

export interface ComputeLineCciOversoldCrossLayoutOptions {
  data: ChartLineCciOversoldCrossPoint[];
  length?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCciOversoldCrossLayout(
  opts: ComputeLineCciOversoldCrossLayoutOptions,
): ChartLineCciOversoldCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineCciOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineCciOversoldCross(opts.data, {
    length: opts.length ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscMin = -DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE;
  let oscMax = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE;
  for (const v of run.cciValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (
    !Number.isFinite(oscMin) ||
    !Number.isFinite(oscMax) ||
    oscMin === oscMax
  ) {
    oscMin = -DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE;
    oscMax = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_OSC_RANGE;
  }
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const midY = syOscBase(0);
  const thresholdY = syOscBase(threshold);

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
      cciPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      thresholdY,
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
  const priceDots: ChartLineCciOversoldCrossDot[] = [];
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

  let cciPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.cci == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.cci);
    cciPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  cciPath = cciPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.cciValues[c.index] ?? 0);
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
    cciPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineCciOversoldCrossChart(
  data: ChartLineCciOversoldCrossPoint[],
  options: {
    length?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineCciOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineCciOversoldCrossLength(
    options.length,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH,
  );
  const threshold = normalizeLineCciOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `CCI Oversold Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, threshold ${threshold}). Top panel ` +
    `renders the close with bullish (exit upward from oversold) ` +
    `/ bearish (entry downward into oversold) chevron overlays ` +
    `at every CCI threshold cross; bottom panel renders the ` +
    `close-only Commodity Channel Index line on an auto-` +
    `expanding +/- 300 oscillator with the threshold and 0 ` +
    `reference bands and marks CCI level ${threshold} trigger ` +
    `entry / exit events.`
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

export const ChartLineCciOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineCciOversoldCrossProps
>(function ChartLineCciOversoldCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_LENGTH,
    threshold = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_PRICE_COLOR,
    cciColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_CCI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_CCI_OVERSOLD_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCci = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
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
    () => getLineCciOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCciOversoldCrossLayout({
        data: cleaned,
        length,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineCciOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCciOversoldCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCciOversoldCrossSeriesId,
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
        data-section="chart-line-cci-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCciOversoldCrossChart(cleaned, { length, threshold });

  const showPrice = !hidden.has('price');
  const showCciLine = !hidden.has('cci') && showCci;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    threshold,
    0,
    layout.oscMax,
  ];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'CCI Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-cci-oversold-cross"
      data-length={length}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-oversold-count={layout.run.oversoldCount}
      data-neutral-count={layout.run.neutralCount}
      data-exit-count={layout.run.exitCount}
      data-entry-count={layout.run.entryCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-cci-oversold-cross-title"
      >
        {ariaLabel ?? 'CCI Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cci-oversold-cross-aria-desc"
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
        data-section="chart-line-cci-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cci-oversold-cross-grid">
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
                  data-section="chart-line-cci-oversold-cross-grid-line-price"
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
                  data-section="chart-line-cci-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-cci-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-cci-oversold-cross-band-threshold"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-cci-oversold-cross-band-mid"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cci-oversold-cross-axes">
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
                  data-section="chart-line-cci-oversold-cross-tick-price"
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
                  data-section="chart-line-cci-oversold-cross-tick-osc"
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
            data-section="chart-line-cci-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cci-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cci-oversold-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCciLine ? (
          <path
            d={layout.cciPath}
            stroke={cciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-oversold-cross-cci-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cci-oversold-cross-crosses"
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
                data-section={`chart-line-cci-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cci-oversold-cross-overlay-crosses"
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
                data-section={`chart-line-cci-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cci-oversold-cross-hover-targets">
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
                data-section="chart-line-cci-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cci-oversold-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={220}
                  height={118}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-cci"
                >
                  CCI{' '}
                  {tooltipSample.cci == null
                    ? '--'
                    : formatOsc(tooltipSample.cci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-counts"
                >
                  oversold {layout.run.oversoldCount} | normal{' '}
                  {layout.run.neutralCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-entries"
                >
                  exits {layout.run.exitCount} | entries{' '}
                  {layout.run.entryCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-oversold-cross-tooltip-crosses"
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
          data-section="chart-line-cci-oversold-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-cci-oversold-cross-legend"
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
              { id: 'cci' as const, color: cciColor, label: 'CCI' },
            ] satisfies Array<{
              id: ChartLineCciOversoldCrossSeriesId;
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

ChartLineCciOversoldCross.displayName = 'ChartLineCciOversoldCross';
