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
 * ChartLineVwapCross -- pure-SVG dual-panel chart with the close
 * on top (overlaid with the anchored VWAP line) and the
 * `close - VWAP` deviation panel on the bottom. Markers fire at
 * every close-vs-VWAP crossover -- the canonical session bias
 * regime transition. Anchor reset is supported via a per-point
 * `anchor` flag: when `true`, the cumulative `sum(typical*volume)`
 * and `sum(volume)` reset at that bar so the next session starts
 * fresh.
 *
 *   typical = (high + low + close) / 3
 *   anchor[i] = true -> reset cumulative sums at i (the bar
 *               itself contributes its single typical*volume)
 *   VWAP[i]   = sum(typical*volume)[from last anchor .. i] /
 *               sum(volume)[from last anchor .. i]
 *
 * Cross events: `up` (close newly exceeds VWAP -> regime
 * `bullish`), `down` (close newly drops below VWAP -> regime
 * `bearish`). At every reset bar a `reset` marker is emitted
 * separately (no cross logic for the very first bar of a session).
 *
 * Bit-exact anchors:
 *
 * - **CONST h = l = close = K, volume = V**: typical = K, VWAP = K
 *   on every bar. close - VWAP = 0 forever, relation `equal`,
 *   zero crosses.
 * - **LINEAR UP h = l = close = i+1, volume = V**: typical = i+1,
 *   `VWAP[i] = (i + 2) / 2`. `close - VWAP = i / 2`. Bar 0 has
 *   close == VWAP (no cross because prev is null); bar 1 strictly
 *   crosses upward (prev equal -> cur bullish), so exactly one
 *   `up` event fires. Bars 2+ stay bullish.
 * - **LINEAR DOWN h = l = close = N-i, volume = V**: mirror image.
 *   Exactly one `down` cross fires at i=1.
 *
 * Multi-session anchor: a series with `anchor = true` at the
 * midpoint plus LINEAR UP shape inside each session fires the
 * `up` cross once per session -- two crosses total.
 */

export interface ChartLineVwapCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  anchor?: boolean;
}

export type ChartLineVwapCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineVwapCrossCross = 'up' | 'down' | null;

export type ChartLineVwapCrossSeriesId = 'price' | 'vwap' | 'deviation';

export interface ChartLineVwapCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  typical: number;
  vwap: number | null;
  deviation: number | null;
  relation: ChartLineVwapCrossRelation;
  crossed: ChartLineVwapCrossCross;
  resetHere: boolean;
}

export interface ChartLineVwapCrossRun {
  series: ChartLineVwapCrossPoint[];
  vwapValues: Array<number | null>;
  deviationValues: Array<number | null>;
  samples: ChartLineVwapCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  bullishCount: number;
  bearishCount: number;
  equalCount: number;
  noneCount: number;
  resetCount: number;
  ok: boolean;
}

export interface ChartLineVwapCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  kind: 'up' | 'down';
}

export interface ChartLineVwapCrossReset {
  index: number;
  x: number;
  cx: number;
  yTop: number;
  yBottom: number;
}

export interface ChartLineVwapCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVwapCrossLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  devTop: number;
  devBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVwapCrossDot[];
  vwapPath: string;
  deviationPath: string;
  markers: ChartLineVwapCrossMarker[];
  resetLines: ChartLineVwapCrossReset[];
  priceMin: number;
  priceMax: number;
  devMin: number;
  devMax: number;
  zeroY: number;
  run: ChartLineVwapCrossRun;
}

export interface ChartLineVwapCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVwapCrossPoint[];
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  vwapColor?: string;
  deviationColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  resetColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVwap?: boolean;
  showDeviation?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showResets?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVwapCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVwapCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVwapCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineVwapCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatDeviation?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VWAP_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VWAP_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VWAP_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VWAP_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VWAP_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VWAP_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VWAP_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VWAP_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_VWAP_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VWAP_CROSS_VWAP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VWAP_CROSS_DEVIATION_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VWAP_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VWAP_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VWAP_CROSS_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_VWAP_CROSS_RESET_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_VWAP_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VWAP_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / high / low / close / volume. */
export function getLineVwapCrossFinitePoints(
  data: readonly ChartLineVwapCrossPoint[] | null | undefined,
): ChartLineVwapCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVwapCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
        anchor: point.anchor === true,
      });
    }
  }
  return out;
}

/** typical = (high + low + close) / 3 */
export function computeLineVwapCrossTypical(
  data: readonly ChartLineVwapCrossPoint[],
): number[] {
  const out: number[] = [];
  for (const p of data) {
    out.push(posZero((p.high + p.low + p.close) / 3));
  }
  return out;
}

/**
 * Compute the anchored VWAP series. The cumulative sums reset
 * whenever a point has `anchor === true` (the anchor bar itself
 * starts a fresh session).
 */
export function computeLineVwapCrossVwap(
  data: readonly ChartLineVwapCrossPoint[],
  typical: readonly number[],
): Array<number | null> {
  const out: Array<number | null> = new Array(data.length).fill(null);
  let sumPV = 0;
  let sumV = 0;
  for (let i = 0; i < data.length; i += 1) {
    const p = data[i];
    if (!p) continue;
    if (p.anchor === true || i === 0) {
      sumPV = 0;
      sumV = 0;
    }
    const tp = typical[i] ?? 0;
    sumPV += tp * p.volume;
    sumV += p.volume;
    if (sumV === 0) continue;
    out[i] = posZero(sumPV / sumV);
  }
  return out;
}

export interface LineVwapCrossChannels {
  typical: number[];
  vwap: Array<number | null>;
  deviation: Array<number | null>;
}

export function computeLineVwapCross(
  series: readonly ChartLineVwapCrossPoint[] | null | undefined,
): LineVwapCrossChannels {
  const cleaned = getLineVwapCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { typical: [], vwap: [], deviation: [] };
  }
  const typical = computeLineVwapCrossTypical(cleaned);
  const vwap = computeLineVwapCrossVwap(cleaned, typical);
  const deviation: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const v = vwap[i];
    const p = cleaned[i];
    if (v == null || !p) {
      deviation.push(null);
      continue;
    }
    deviation.push(posZero(p.close - v));
  }
  return { typical, vwap, deviation };
}

export function classifyLineVwapCrossRelation(
  close: number | null,
  vwap: number | null,
): ChartLineVwapCrossRelation {
  if (close == null || vwap == null) return 'none';
  if (close > vwap) return 'bullish';
  if (close < vwap) return 'bearish';
  return 'equal';
}

export function detectLineVwapCrossCrosses(
  closes: readonly (number | null)[],
  vwaps: readonly (number | null)[],
  resetFlags: readonly boolean[],
): ChartLineVwapCrossCross[] {
  const out: ChartLineVwapCrossCross[] = [];
  let prevClose: number | null = null;
  let prevVwap: number | null = null;
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    const v = vwaps[i];
    const reset = resetFlags[i] === true;
    if (c == null || v == null) {
      out.push(null);
      prevClose = null;
      prevVwap = null;
      continue;
    }
    if (reset || prevClose == null || prevVwap == null) {
      out.push(null);
      prevClose = c;
      prevVwap = v;
      continue;
    }
    if (prevClose <= prevVwap && c > v) {
      out.push('up');
    } else if (prevClose >= prevVwap && c < v) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevClose = c;
    prevVwap = v;
  }
  return out;
}

export function runLineVwapCross(
  data: ChartLineVwapCrossPoint[],
): ChartLineVwapCrossRun {
  const cleaned = getLineVwapCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);

  const channels = computeLineVwapCross(series);
  const closes = series.map((p) => p.close);
  const resetFlags = series.map((p, i) => p.anchor === true || i === 0);
  const crosses = detectLineVwapCrossCrosses(
    closes,
    channels.vwap,
    resetFlags,
  );

  const samples: ChartLineVwapCrossSample[] = series.map((p, i) => {
    const vwap = channels.vwap[i] ?? null;
    const deviation = channels.deviation[i] ?? null;
    const relation = classifyLineVwapCrossRelation(p.close, vwap);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      typical: channels.typical[i] ?? 0,
      vwap,
      deviation,
      relation,
      crossed,
      resetHere: resetFlags[i] === true,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let equalCount = 0;
  let noneCount = 0;
  let resetCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.relation === 'bullish') bullishCount += 1;
    else if (s.relation === 'bearish') bearishCount += 1;
    else if (s.relation === 'equal') equalCount += 1;
    else noneCount += 1;
    if (s.resetHere) resetCount += 1;
  }

  const ok = series.length >= 2;

  return {
    series = [],
    vwapValues: channels.vwap,
    deviationValues: channels.deviation,
    samples,
    upCrossCount,
    downCrossCount,
    bullishCount,
    bearishCount,
    equalCount,
    noneCount,
    resetCount,
    ok,
  };
}

export interface ComputeLineVwapCrossLayoutOptions {
  data: ChartLineVwapCrossPoint[];
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVwapCrossLayout(
  opts: ComputeLineVwapCrossLayoutOptions,
): ChartLineVwapCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VWAP_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VWAP_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VWAP_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_VWAP_CROSS_PANEL_GAP;

  const run = runLineVwapCross(opts.data);

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const devTop = priceBottom + panelGap;
  const devBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      devTop,
      devBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      vwapPath: '',
      deviationPath: '',
      markers: [],
      resetLines: [],
      priceMin: 0,
      priceMax: 0,
      devMin: -1,
      devMax: 1,
      zeroY: (devTop + devBottom) / 2,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.vwap != null) {
      if (s.vwap < priceMin) priceMin = s.vwap;
      if (s.vwap > priceMax) priceMax = s.vwap;
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

  let devMin = Infinity;
  let devMax = -Infinity;
  for (const s of run.samples) {
    if (s.deviation == null) continue;
    if (s.deviation < devMin) devMin = s.deviation;
    if (s.deviation > devMax) devMax = s.deviation;
  }
  if (!Number.isFinite(devMin) || !Number.isFinite(devMax)) {
    devMin = -1;
    devMax = 1;
  }
  if (devMin === devMax) {
    devMin -= 1;
    devMax += 1;
  }
  if (devMin > 0) devMin = 0;
  if (devMax < 0) devMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syDev = (y: number): number =>
    devBottom - ((y - devMin) / (devMax - devMin)) * (devBottom - devTop);

  let pricePath = '';
  const priceDots: ChartLineVwapCrossDot[] = [];
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

  let vwapPath = '';
  let vwapFirst = true;
  for (const s of run.samples) {
    if (s.vwap == null) {
      vwapFirst = true;
      continue;
    }
    if (s.resetHere && !vwapFirst) {
      vwapFirst = true;
    }
    const cx = sx(s.x);
    const cy = syPrice(s.vwap);
    vwapPath += `${vwapFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    vwapFirst = false;
  }
  vwapPath = vwapPath.trim();

  let deviationPath = '';
  let devFirst = true;
  for (const s of run.samples) {
    if (s.deviation == null) {
      devFirst = true;
      continue;
    }
    if (s.resetHere && !devFirst) {
      devFirst = true;
    }
    const cx = sx(s.x);
    const cy = syDev(s.deviation);
    deviationPath += `${devFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    devFirst = false;
  }
  deviationPath = deviationPath.trim();

  const markers: ChartLineVwapCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syPrice(s.close),
      close: s.close,
      kind: s.crossed,
    });
  }

  const resetLines: ChartLineVwapCrossReset[] = [];
  for (const s of run.samples) {
    if (!s.resetHere) continue;
    if (s.index === 0) continue;
    resetLines.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      yTop: priceTop,
      yBottom: devBottom,
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
    devTop,
    devBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    vwapPath,
    deviationPath,
    markers,
    resetLines,
    priceMin,
    priceMax,
    devMin,
    devMax,
    zeroY: syDev(0),
    run,
  };
}

export function describeLineVwapCrossChart(
  data: ChartLineVwapCrossPoint[],
): string {
  const cleaned = getLineVwapCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  let anchorCount = 0;
  for (const p of cleaned) {
    if (p.anchor === true) anchorCount += 1;
  }
  return (
    `VWAP Cross chart over ${cleaned.length} bars ` +
    `(anchor resets ${anchorCount}). Top panel renders the close ` +
    `overlaid with the anchored VWAP; bottom panel renders the ` +
    `close - VWAP deviation with markers at every close-vs-VWAP ` +
    `cross (up -> bullish bias, down -> bearish bias).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultDeviationFormatter = (value: number): string =>
  formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVwapCross = forwardRef<
  HTMLDivElement,
  ChartLineVwapCrossProps
>(function ChartLineVwapCross(props, ref): ReactNode {
  const {
    data,
    width = DEFAULT_CHART_LINE_VWAP_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VWAP_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VWAP_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VWAP_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VWAP_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VWAP_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VWAP_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_VWAP_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VWAP_CROSS_PRICE_COLOR,
    vwapColor = DEFAULT_CHART_LINE_VWAP_CROSS_VWAP_COLOR,
    deviationColor = DEFAULT_CHART_LINE_VWAP_CROSS_DEVIATION_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VWAP_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VWAP_CROSS_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_VWAP_CROSS_ZERO_COLOR,
    resetColor = DEFAULT_CHART_LINE_VWAP_CROSS_RESET_COLOR,
    axisColor = DEFAULT_CHART_LINE_VWAP_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VWAP_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVwap = true,
    showDeviation = true,
    showMarkers = true,
    showZeroLine = true,
    showResets = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatDeviation = defaultDeviationFormatter,
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
    () => getLineVwapCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVwapCrossLayout({
        data: cleaned,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVwapCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVwapCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVwapCrossSeriesId,
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
        data-section="chart-line-vwap-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc = ariaDescription ?? describeLineVwapCrossChart(cleaned);

  const showPrice = !hidden.has('price');
  const showVwapLine = !hidden.has('vwap') && showVwap;
  const showDeviationLine = !hidden.has('deviation') && showDeviation;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickDevValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickDevValues.push(
      layout.devMin + ((layout.devMax - layout.devMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'VWAP Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-vwap-cross"
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-reset-count={layout.run.resetCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-vwap-cross-title"
      >
        {ariaLabel ?? 'VWAP Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vwap-cross-aria-desc"
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
        data-section="chart-line-vwap-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vwap-cross-grid">
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
                  data-section="chart-line-vwap-cross-grid-line-price"
                />
              );
            })}
            {tickDevValues.map((v, i) => {
              const y =
                layout.devBottom -
                ((v - layout.devMin) /
                  (layout.devMax - layout.devMin)) *
                  (layout.devBottom - layout.devTop);
              return (
                <line
                  key={`grid-dev-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-vwap-cross-grid-line-dev"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vwap-cross-axes">
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
              y1={layout.devTop}
              x2={layout.innerLeft}
              y2={layout.devBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.devBottom}
              x2={layout.innerRight}
              y2={layout.devBottom}
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
                  data-section="chart-line-vwap-cross-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickDevValues.map((v, i) => {
              const y =
                layout.devBottom -
                ((v - layout.devMin) /
                  (layout.devMax - layout.devMin)) *
                  (layout.devBottom - layout.devTop);
              return (
                <text
                  key={`tick-dev-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-vwap-cross-tick-dev"
                >
                  {formatDeviation(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showResets ? (
          <g data-section="chart-line-vwap-cross-resets">
            {layout.resetLines.map((r) => (
              <line
                key={`reset-${r.index}`}
                x1={r.cx}
                y1={r.yTop}
                x2={r.cx}
                y2={r.yBottom}
                stroke={resetColor}
                strokeDasharray="2 4"
                data-section="chart-line-vwap-cross-reset-line"
              />
            ))}
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
            data-section="chart-line-vwap-cross-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vwap-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vwap-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vwap-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVwapLine ? (
          <path
            d={layout.vwapPath}
            stroke={vwapColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vwap-cross-vwap"
          />
        ) : null}

        {showDeviationLine ? (
          <path
            d={layout.deviationPath}
            stroke={deviationColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vwap-cross-deviation"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-vwap-cross-markers">
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
                data-section="chart-line-vwap-cross-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vwap-cross-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.devBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-vwap-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vwap-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={154}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-volume"
                >
                  volume {formatDeviation(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-vwap"
                >
                  vwap{' '}
                  {tooltipSample.vwap == null
                    ? '--'
                    : formatPrice(tooltipSample.vwap)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-deviation"
                >
                  deviation{' '}
                  {tooltipSample.deviation == null
                    ? '--'
                    : formatDeviation(tooltipSample.deviation)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-reset"
                >
                  reset {tooltipSample.resetHere ? 'yes' : 'no'}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vwap-cross-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount} | resets{' '}
                  {layout.run.resetCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-vwap-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          resets {layout.run.resetCount} | up {layout.run.upCrossCount} |
          down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vwap-cross-legend"
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
              { id: 'vwap' as const, color: vwapColor, label: 'vwap' },
              {
                id: 'deviation' as const,
                color: deviationColor,
                label: 'deviation',
              },
            ] satisfies Array<{
              id: ChartLineVwapCrossSeriesId;
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

ChartLineVwapCross.displayName = 'ChartLineVwapCross';
