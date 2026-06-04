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
 * ChartLineObvCross -- pure-SVG dual-panel chart with the close on
 * top and the OBV (On Balance Volume) running total plus its
 * moving-average signal line on the bottom. Markers fire whenever
 * OBV crosses through its signal -- the canonical accumulation /
 * distribution regime flip:
 *
 *   OBV[0] = 0
 *   OBV[i] = OBV[i-1] + (close[i] > close[i-1] ?  volume[i]
 *                      : close[i] < close[i-1] ? -volume[i]
 *                      : 0)
 *   signal = SMA(OBV, signalLength)
 *
 * Cross events: `up` (OBV newly exceeds signal -> `accumulation`)
 * and `down` (OBV newly drops below signal -> `distribution`).
 *
 * Bit-exact anchors (with the `min === max` window-constant
 * precision fix in the SMA helper):
 *
 * - **CONST close = K, volume = V**: every step has close === prev,
 *   so the OBV delta is 0 -- OBV stays at 0 forever, signal SMA
 *   stays at 0. Relation is `equal` forever and zero crosses fire.
 * - **LINEAR UP close = i+1, volume = V**: every step has close >
 *   prev, so OBV[i] = i * V (a strict arithmetic series). The
 *   signal SMA tracks the same line shifted by `(n-1)/2` bars,
 *   giving `OBV - signal = V * (n-1) / 2 > 0` permanently.
 *   Relation is `bullish` forever -- jumps from `none` to bullish
 *   with no prev relation, so zero crosses fire.
 * - **LINEAR DOWN close = N-i, volume = V**: mirror image -- OBV
 *   drops by V per bar, `OBV - signal = -V * (n-1) / 2 < 0`
 *   permanently. Relation is `bearish` forever; zero crosses.
 */

export interface ChartLineObvCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineObvCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineObvCrossCross = 'up' | 'down' | null;

export type ChartLineObvCrossRegime =
  | 'accumulation'
  | 'distribution'
  | 'neutral'
  | 'none';

export type ChartLineObvCrossSeriesId = 'price' | 'obv' | 'signal';

export interface ChartLineObvCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  obv: number | null;
  signal: number | null;
  relation: ChartLineObvCrossRelation;
  regime: ChartLineObvCrossRegime;
  crossed: ChartLineObvCrossCross;
}

export interface ChartLineObvCrossRun {
  series: ChartLineObvCrossPoint[];
  signalLength: number;
  obvValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineObvCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  accumulationCount: number;
  distributionCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineObvCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  obv: number;
  kind: 'up' | 'down';
}

export interface ChartLineObvCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineObvCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  obvTop: number;
  obvBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineObvCrossDot[];
  obvPath: string;
  signalPath: string;
  markers: ChartLineObvCrossMarker[];
  priceMin: number;
  priceMax: number;
  obvMin: number;
  obvMax: number;
  zeroY: number;
  run: ChartLineObvCrossRun;
}

export interface ChartLineObvCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineObvCrossPoint[];
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
  obvColor?: string;
  signalColor?: string;
  accumulationColor?: string;
  distributionColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showObv?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineObvCrossSeriesId[];
  defaultHiddenSeries?: ChartLineObvCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineObvCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineObvCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatObv?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_OBV_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_OBV_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_OBV_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_OBV_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_OBV_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_OBV_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_OBV_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_OBV_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH = 20;
export const DEFAULT_CHART_LINE_OBV_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_OBV_CROSS_OBV_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_OBV_CROSS_ACCUMULATION_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_OBV_CROSS_DISTRIBUTION_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_OBV_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_OBV_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_OBV_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineObvCrossFinitePoints(
  data: readonly ChartLineObvCrossPoint[] | null | undefined,
): ChartLineObvCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineObvCrossPoint[] = [];
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineObvCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Compute the cumulative OBV series. OBV[0] = 0. */
export function computeLineObvCrossObv(
  data: readonly ChartLineObvCrossPoint[],
): number[] {
  const out: number[] = [];
  if (data.length === 0) return out;
  let total = 0;
  out.push(0);
  for (let i = 1; i < data.length; i += 1) {
    const cur = data[i];
    const prev = data[i - 1];
    if (!cur || !prev) {
      out.push(total);
      continue;
    }
    if (cur.close > prev.close) total += cur.volume;
    else if (cur.close < prev.close) total -= cur.volume;
    out.push(posZero(total));
  }
  return out;
}

/**
 * Rolling SMA with `min === max` window-constant precision fix.
 */
export function applyLineObvCrossSma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = values[k];
      if (v == null) {
        sum = Number.NaN;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!Number.isFinite(sum)) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

export interface LineObvCrossChannels {
  obv: number[];
  signal: Array<number | null>;
}

export function computeLineObvCross(
  series: readonly ChartLineObvCrossPoint[] | null | undefined,
  options: { signalLength?: number } = {},
): LineObvCrossChannels {
  const cleaned = getLineObvCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { obv: [], signal: [] };
  }
  const signalLength = normalizeLineObvCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
  );
  const obv = computeLineObvCrossObv(cleaned);
  const signal = applyLineObvCrossSma(obv, signalLength);
  return { obv, signal };
}

export function classifyLineObvCrossRelation(
  obv: number | null,
  signal: number | null,
): ChartLineObvCrossRelation {
  if (obv == null || signal == null) return 'none';
  if (obv > signal) return 'bullish';
  if (obv < signal) return 'bearish';
  return 'equal';
}

export function classifyLineObvCrossRegime(
  relation: ChartLineObvCrossRelation,
): ChartLineObvCrossRegime {
  if (relation === 'bullish') return 'accumulation';
  if (relation === 'bearish') return 'distribution';
  if (relation === 'equal') return 'neutral';
  return 'none';
}

export function detectLineObvCrossCrosses(
  obvValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineObvCrossCross[] {
  const out: ChartLineObvCrossCross[] = [];
  let prevObv: number | null = null;
  let prevSig: number | null = null;
  for (let i = 0; i < obvValues.length; i += 1) {
    const o = obvValues[i];
    const s = signalValues[i];
    if (o == null || s == null) {
      out.push(null);
      prevObv = null;
      prevSig = null;
      continue;
    }
    if (prevObv == null || prevSig == null) {
      out.push(null);
      prevObv = o;
      prevSig = s;
      continue;
    }
    if (prevObv <= prevSig && o > s) {
      out.push('up');
    } else if (prevObv >= prevSig && o < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevObv = o;
    prevSig = s;
  }
  return out;
}

export function runLineObvCross(
  data: ChartLineObvCrossPoint[],
  options: { signalLength?: number } = {},
): ChartLineObvCrossRun {
  const cleaned = getLineObvCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const signalLength = normalizeLineObvCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineObvCross(series, { signalLength });
  const crosses = detectLineObvCrossCrosses(
    channels.obv,
    channels.signal,
  );

  const samples: ChartLineObvCrossSample[] = series.map((p, i) => {
    const obv = channels.obv[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const relation = classifyLineObvCrossRelation(obv, signal);
    const regime = classifyLineObvCrossRegime(relation);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      obv,
      signal,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let accumulationCount = 0;
  let distributionCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'accumulation') accumulationCount += 1;
    else if (s.regime === 'distribution') distributionCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > signalLength;

  return {
    series,
    signalLength,
    obvValues: channels.obv,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    accumulationCount,
    distributionCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineObvCrossLayoutOptions {
  data: ChartLineObvCrossPoint[];
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineObvCrossLayout(
  opts: ComputeLineObvCrossLayoutOptions,
): ChartLineObvCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_OBV_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_OBV_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_OBV_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_OBV_CROSS_PANEL_GAP;

  const run = runLineObvCross(opts.data, {
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const obvTop = priceBottom + panelGap;
  const obvBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      obvTop,
      obvBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      obvPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      obvMin: -1,
      obvMax: 1,
      zeroY: (obvTop + obvBottom) / 2,
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

  let obvMin = Infinity;
  let obvMax = -Infinity;
  for (const s of run.samples) {
    if (s.obv != null) {
      if (s.obv < obvMin) obvMin = s.obv;
      if (s.obv > obvMax) obvMax = s.obv;
    }
    if (s.signal != null) {
      if (s.signal < obvMin) obvMin = s.signal;
      if (s.signal > obvMax) obvMax = s.signal;
    }
  }
  if (!Number.isFinite(obvMin) || !Number.isFinite(obvMax)) {
    obvMin = -1;
    obvMax = 1;
  }
  if (obvMin === obvMax) {
    obvMin -= 1;
    obvMax += 1;
  }
  if (obvMin > 0) obvMin = 0;
  if (obvMax < 0) obvMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syObv = (y: number): number =>
    obvBottom - ((y - obvMin) / (obvMax - obvMin)) * (obvBottom - obvTop);

  let pricePath = '';
  const priceDots: ChartLineObvCrossDot[] = [];
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

  const buildPath = (key: 'obv' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syObv(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const obvPath = buildPath('obv');
  const signalPath = buildPath('signal');

  const markers: ChartLineObvCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.obv == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syObv(s.obv),
      obv: s.obv,
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
    obvTop,
    obvBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    obvPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    obvMin,
    obvMax,
    zeroY: syObv(0),
    run,
  };
}

export function describeLineObvCrossChart(
  data: ChartLineObvCrossPoint[],
  options: { signalLength?: number } = {},
): string {
  const cleaned = getLineObvCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const signalLength = normalizeLineObvCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
  );
  return (
    `OBV Cross chart over ${cleaned.length} bars ` +
    `(signalLength ${signalLength}). Top panel renders the close; ` +
    `bottom panel renders the cumulative OBV and its signal SMA ` +
    `with markers at every crossover (up -> accumulation, down -> ` +
    `distribution).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultObvFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineObvCross = forwardRef<
  HTMLDivElement,
  ChartLineObvCrossProps
>(function ChartLineObvCross(props, ref): ReactNode {
  const {
    data,
    signalLength = DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_OBV_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_OBV_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_OBV_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_OBV_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_OBV_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_OBV_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_OBV_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_OBV_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_OBV_CROSS_PRICE_COLOR,
    obvColor = DEFAULT_CHART_LINE_OBV_CROSS_OBV_COLOR,
    signalColor = DEFAULT_CHART_LINE_OBV_CROSS_SIGNAL_COLOR,
    accumulationColor = DEFAULT_CHART_LINE_OBV_CROSS_ACCUMULATION_COLOR,
    distributionColor = DEFAULT_CHART_LINE_OBV_CROSS_DISTRIBUTION_COLOR,
    zeroColor = DEFAULT_CHART_LINE_OBV_CROSS_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_OBV_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_OBV_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showObv = true,
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
    formatObv = defaultObvFormatter,
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
    () => getLineObvCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineObvCrossLayout({
        data: cleaned,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineObvCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineObvCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineObvCrossSeriesId,
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
        data-section="chart-line-obv-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineObvCrossChart(cleaned, { signalLength });

  const showPrice = !hidden.has('price');
  const showObvLine = !hidden.has('obv') && showObv;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickObvValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickObvValues.push(
      layout.obvMin + ((layout.obvMax - layout.obvMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? accumulationColor : distributionColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'OBV Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-obv-cross"
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-accumulation-count={layout.run.accumulationCount}
      data-distribution-count={layout.run.distributionCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-obv-cross-title"
      >
        {ariaLabel ?? 'OBV Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-obv-cross-aria-desc"
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
        data-section="chart-line-obv-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-obv-cross-grid">
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
                  data-section="chart-line-obv-cross-grid-line-price"
                />
              );
            })}
            {tickObvValues.map((v, i) => {
              const y =
                layout.obvBottom -
                ((v - layout.obvMin) /
                  (layout.obvMax - layout.obvMin)) *
                  (layout.obvBottom - layout.obvTop);
              return (
                <line
                  key={`grid-obv-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-obv-cross-grid-line-obv"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-obv-cross-axes">
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
              y1={layout.obvTop}
              x2={layout.innerLeft}
              y2={layout.obvBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.obvBottom}
              x2={layout.innerRight}
              y2={layout.obvBottom}
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
                  data-section="chart-line-obv-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickObvValues.map((v, i) => {
              const y =
                layout.obvBottom -
                ((v - layout.obvMin) /
                  (layout.obvMax - layout.obvMin)) *
                  (layout.obvBottom - layout.obvTop);
              return (
                <text
                  key={`tick-obv-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-obv-cross-tick-obv"
                >
                  {formatObv(v)}
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
            data-section="chart-line-obv-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-obv-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-obv-cross-price-dot"
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
            data-section="chart-line-obv-cross-signal"
          />
        ) : null}

        {showObvLine ? (
          <path
            d={layout.obvPath}
            stroke={obvColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-obv-cross-obv"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-obv-cross-markers">
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
                data-section="chart-line-obv-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-obv-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.obvBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-obv-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-obv-cross-tooltip"
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
                  data-section="chart-line-obv-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-volume"
                >
                  volume {formatObv(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-obv"
                >
                  obv{' '}
                  {tooltipSample.obv == null
                    ? '--'
                    : formatObv(tooltipSample.obv)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatObv(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-obv-cross-tooltip-counts"
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
          data-section="chart-line-obv-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          signal {signalLength} | up {layout.run.upCrossCount} | down{' '}
          {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-obv-cross-legend"
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
              { id: 'obv' as const, color: obvColor, label: 'obv' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineObvCrossSeriesId;
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

ChartLineObvCross.displayName = 'ChartLineObvCross';
