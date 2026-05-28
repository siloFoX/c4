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
 * ChartLineNetVolume -- pure-SVG dual-panel chart with the close on
 * top and a Net Volume oscillator on the bottom. Net Volume scales
 * the per-bar (up-volume minus down-volume) over the lookback by the
 * total volume in the same window, multiplied by 100:
 *
 *   dir[i] = sign(close[i] - close[i - 1])  for i >= 1
 *   dir[0] = 0  (no prior bar)
 *   upVol[i]    = sum_{k = i - length + 1 .. i}(volume[k]  | dir[k] > 0)
 *   downVol[i]  = sum_{k = i - length + 1 .. i}(volume[k]  | dir[k] < 0)
 *   totalVol[i] = sum_{k = i - length + 1 .. i}(volume[k])
 *   net[i]      = totalVol[i] === 0
 *                   ? null
 *                   : (upVol[i] - downVol[i]) / totalVol[i] * 100
 *
 * `net[i]` is `null` during warmup (`i < length - 1`) and whenever the
 * rolling total volume in the window is zero. The output is bounded
 * in `[-100, 100]`.
 *
 * Bit-exact anchors:
 * - **CONST close = K, volume = V > 0**: every defined bar is `flat`
 *   so `upVol = downVol = 0`, `net = 0` bit-exact post-warmup.
 * - **CONST close = K, volume = 0**: `totalVol = 0`, divide-by-zero
 *   guard returns `null` everywhere.
 * - **LINEAR UP close = i + 1, volume = V > 0**: from index `length`
 *   onward every window excludes the index-0 bar (which has no prior
 *   close and is treated as flat), so `upVol = totalVol`,
 *   `downVol = 0`, `net = 100` bit-exact.
 * - **LINEAR DOWN close = N - i, volume = V > 0**: symmetric -> `net
 *   = -100` bit-exact post the warmup span.
 */

export interface ChartLineNetVolumePoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineNetVolumeDirection = 'up' | 'down' | 'flat';

export type ChartLineNetVolumeZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineNetVolumeCross = 'up' | 'down' | null;

export type ChartLineNetVolumeSeriesId = 'price' | 'net';

export interface ChartLineNetVolumeSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  direction: ChartLineNetVolumeDirection;
  upVolume: number | null;
  downVolume: number | null;
  totalVolume: number | null;
  net: number | null;
  zone: ChartLineNetVolumeZone;
  crossed: ChartLineNetVolumeCross;
}

export interface ChartLineNetVolumeRun {
  series: ChartLineNetVolumePoint[];
  length: number;
  overbought: number;
  oversold: number;
  directions: ChartLineNetVolumeDirection[];
  upVolumeValues: Array<number | null>;
  downVolumeValues: Array<number | null>;
  totalVolumeValues: Array<number | null>;
  netValues: Array<number | null>;
  samples: ChartLineNetVolumeSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineNetVolumeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  net: number;
  crossed: 'up' | 'down';
}

export interface ChartLineNetVolumeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineNetVolumeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  netTop: number;
  netBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineNetVolumeDot[];
  netPath: string;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  markers: ChartLineNetVolumeMarker[];
  priceMin: number;
  priceMax: number;
  netMin: number;
  netMax: number;
  run: ChartLineNetVolumeRun;
}

export interface ChartLineNetVolumeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineNetVolumePoint[];
  length?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  netColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showNet?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineNetVolumeSeriesId[];
  defaultHiddenSeries?: ChartLineNetVolumeSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineNetVolumeSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineNetVolumeSample }) => void;
  formatPrice?: (value: number) => string;
  formatNet?: (value: number) => string;
  formatVolume?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_NET_VOLUME_WIDTH = 720;
export const DEFAULT_CHART_LINE_NET_VOLUME_HEIGHT = 460;
export const DEFAULT_CHART_LINE_NET_VOLUME_PADDING = 44;
export const DEFAULT_CHART_LINE_NET_VOLUME_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_NET_VOLUME_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_NET_VOLUME_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_NET_VOLUME_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_NET_VOLUME_LENGTH = 20;
export const DEFAULT_CHART_LINE_NET_VOLUME_OVERBOUGHT = 30;
export const DEFAULT_CHART_LINE_NET_VOLUME_OVERSOLD = -30;
export const DEFAULT_CHART_LINE_NET_VOLUME_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_NET_VOLUME_NET_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_NET_VOLUME_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_NET_VOLUME_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_NET_VOLUME_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_NET_VOLUME_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_NET_VOLUME_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_NET_VOLUME_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x, close, and non-negative volume. */
export function getLineNetVolumeFinitePoints(
  data: readonly ChartLineNetVolumePoint[] | null | undefined,
): ChartLineNetVolumePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineNetVolumePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
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
export function normalizeLineNetVolumeLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in `[-100, 100]`. */
export function normalizeLineNetVolumeThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= -100 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Classify per-bar close direction (first bar is always 'flat'). */
export function classifyLineNetVolumeDirections(
  closes: readonly number[],
): ChartLineNetVolumeDirection[] {
  const out: ChartLineNetVolumeDirection[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      out.push('flat');
      continue;
    }
    const c = closes[i];
    const p = closes[i - 1];
    if (c == null || p == null || !isFiniteNumber(c) || !isFiniteNumber(p)) {
      out.push('flat');
      continue;
    }
    if (c > p) out.push('up');
    else if (c < p) out.push('down');
    else out.push('flat');
  }
  return out;
}

export interface LineNetVolumeChannels {
  directions: ChartLineNetVolumeDirection[];
  upVolume: Array<number | null>;
  downVolume: Array<number | null>;
  totalVolume: Array<number | null>;
  net: Array<number | null>;
}

/** Compute the full pipeline. */
export function computeLineNetVolume(
  series: readonly ChartLineNetVolumePoint[] | null | undefined,
  options: { length?: number } = {},
): LineNetVolumeChannels {
  const cleaned = getLineNetVolumeFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      directions: [],
      upVolume: [],
      downVolume: [],
      totalVolume: [],
      net: [],
    };
  }
  const length = normalizeLineNetVolumeLength(
    options.length,
    DEFAULT_CHART_LINE_NET_VOLUME_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const volumes = cleaned.map((p) => p.volume);
  const directions = classifyLineNetVolumeDirections(closes);

  const upVolume: Array<number | null> = [];
  const downVolume: Array<number | null> = [];
  const totalVolume: Array<number | null> = [];
  const net: Array<number | null> = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    if (i < length - 1) {
      upVolume.push(null);
      downVolume.push(null);
      totalVolume.push(null);
      net.push(null);
      continue;
    }
    let up = 0;
    let down = 0;
    let total = 0;
    for (let j = 0; j < length; j += 1) {
      const idx = i - j;
      const v = volumes[idx]!;
      total += v;
      const d = directions[idx];
      if (d === 'up') up += v;
      else if (d === 'down') down += v;
    }
    upVolume.push(posZero(up));
    downVolume.push(posZero(down));
    totalVolume.push(posZero(total));
    if (total === 0) {
      net.push(null);
    } else {
      const raw = ((up - down) / total) * 100;
      net.push(Number.isFinite(raw) ? posZero(raw) : null);
    }
  }

  return { directions, upVolume, downVolume, totalVolume, net };
}

export function classifyLineNetVolumeZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineNetVolumeZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

export function detectLineNetVolumeCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): ChartLineNetVolumeCross[] {
  const out: ChartLineNetVolumeCross[] = [];
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
    if (prev < overbought && v >= overbought) {
      out.push('up');
    } else if (prev > oversold && v <= oversold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineNetVolume(
  data: ChartLineNetVolumePoint[],
  options: {
    length?: number;
    overbought?: number;
    oversold?: number;
  } = {},
): ChartLineNetVolumeRun {
  const cleaned = getLineNetVolumeFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineNetVolumeLength(
    options.length,
    DEFAULT_CHART_LINE_NET_VOLUME_LENGTH,
  );
  const overbought = normalizeLineNetVolumeThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_NET_VOLUME_OVERBOUGHT,
  );
  const oversold = normalizeLineNetVolumeThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_NET_VOLUME_OVERSOLD,
  );

  const channels = computeLineNetVolume(series, { length });
  const crosses = detectLineNetVolumeCrosses(
    channels.net,
    overbought,
    oversold,
  );

  const samples: ChartLineNetVolumeSample[] = series.map((p, i) => {
    const upVolume = channels.upVolume[i] ?? null;
    const downVolume = channels.downVolume[i] ?? null;
    const totalVolume = channels.totalVolume[i] ?? null;
    const net = channels.net[i] ?? null;
    const zone = classifyLineNetVolumeZone(net, overbought, oversold);
    const crossed = crosses[i] ?? null;
    const direction = channels.directions[i] ?? 'flat';
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      direction,
      upVolume,
      downVolume,
      totalVolume,
      net,
      zone,
      crossed,
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series = [],
    length,
    overbought,
    oversold,
    directions: channels.directions,
    upVolumeValues: channels.upVolume,
    downVolumeValues: channels.downVolume,
    totalVolumeValues: channels.totalVolume,
    netValues: channels.net,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineNetVolumeLayoutOptions {
  data: ChartLineNetVolumePoint[];
  length?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineNetVolumeLayout(
  opts: ComputeLineNetVolumeLayoutOptions,
): ChartLineNetVolumeLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_NET_VOLUME_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_NET_VOLUME_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_NET_VOLUME_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_NET_VOLUME_PANEL_GAP;

  const run = runLineNetVolume(opts.data, {
    length: opts.length ?? undefined,
    overbought: opts.overbought ?? undefined,
    oversold: opts.oversold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const netTop = priceBottom + panelGap;
  const netBottom = priceBottom + panelGap + usable * 0.45;

  const netMin = -100;
  const netMax = 100;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      netTop,
      netBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      netPath: '',
      overboughtY: netTop,
      oversoldY: netBottom,
      midlineY: (netTop + netBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      netMin,
      netMax,
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
  const syNet = (y: number): number =>
    netBottom - ((y - netMin) / (netMax - netMin)) * (netBottom - netTop);

  let pricePath = '';
  const priceDots: ChartLineNetVolumeDot[] = [];
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

  let netPath = '';
  let firstN = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.net == null) {
      firstN = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syNet(s.net);
    netPath += `${firstN ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstN = false;
  }

  const markers: ChartLineNetVolumeMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.net == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syNet(s.net),
      close: s.close,
      net: s.net,
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
    netTop,
    netBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    netPath: netPath.trim(),
    overboughtY: syNet(run.overbought),
    oversoldY: syNet(run.oversold),
    midlineY: syNet(0),
    markers,
    priceMin,
    priceMax,
    netMin,
    netMax,
    run,
  };
}

export function describeLineNetVolumeChart(
  data: ChartLineNetVolumePoint[],
  options: {
    length?: number;
    overbought?: number;
    oversold?: number;
  } = {},
): string {
  const cleaned = getLineNetVolumeFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineNetVolumeLength(
    options.length,
    DEFAULT_CHART_LINE_NET_VOLUME_LENGTH,
  );
  const overbought = normalizeLineNetVolumeThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_NET_VOLUME_OVERBOUGHT,
  );
  const oversold = normalizeLineNetVolumeThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_NET_VOLUME_OVERSOLD,
  );
  return (
    `Net Volume chart over ${cleaned.length} bars ` +
    `(length ${length}, overbought ${overbought}, oversold ${oversold}). ` +
    `Top panel renders the close; bottom panel renders the ` +
    `(upVolume - downVolume) / totalVolume * 100 oscillator.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultNetFormatter = (value: number): string => formatNumber(value);
const defaultVolumeFormatter = (value: number): string =>
  formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineNetVolume = forwardRef<
  HTMLDivElement,
  ChartLineNetVolumeProps
>(function ChartLineNetVolume(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_NET_VOLUME_LENGTH,
    overbought = DEFAULT_CHART_LINE_NET_VOLUME_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_NET_VOLUME_OVERSOLD,
    width = DEFAULT_CHART_LINE_NET_VOLUME_WIDTH,
    height = DEFAULT_CHART_LINE_NET_VOLUME_HEIGHT,
    padding = DEFAULT_CHART_LINE_NET_VOLUME_PADDING,
    panelGap = DEFAULT_CHART_LINE_NET_VOLUME_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_NET_VOLUME_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_NET_VOLUME_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_NET_VOLUME_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_NET_VOLUME_PRICE_COLOR,
    netColor = DEFAULT_CHART_LINE_NET_VOLUME_NET_COLOR,
    bullishColor = DEFAULT_CHART_LINE_NET_VOLUME_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_NET_VOLUME_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_NET_VOLUME_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_NET_VOLUME_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_NET_VOLUME_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_NET_VOLUME_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showNet = true,
    showMarkers = true,
    showThresholds = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatNet = defaultNetFormatter,
    formatVolume = defaultVolumeFormatter,
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
    () => getLineNetVolumeFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineNetVolumeLayout({
        data: cleaned,
        length,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      overbought,
      oversold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineNetVolumeSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineNetVolumeSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineNetVolumeSeriesId,
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
        data-section="chart-line-net-volume-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineNetVolumeChart(cleaned, {
      length,
      overbought,
      oversold,
    });

  const showPrice = !hidden.has('price');
  const showNetLine = !hidden.has('net') && showNet;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickNetValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickNetValues.push(
      layout.netMin + ((layout.netMax - layout.netMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Net Volume chart'}
      aria-describedby={descId}
      data-section="chart-line-net-volume"
      data-length={length}
      data-overbought={overbought}
      data-oversold={oversold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-net-volume-title"
      >
        {ariaLabel ?? 'Net Volume chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-net-volume-aria-desc"
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
        data-section="chart-line-net-volume-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-net-volume-grid">
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
                  data-section="chart-line-net-volume-grid-line-price"
                />
              );
            })}
            {tickNetValues.map((v, i) => {
              const y =
                layout.netBottom -
                ((v - layout.netMin) /
                  (layout.netMax - layout.netMin)) *
                  (layout.netBottom - layout.netTop);
              return (
                <line
                  key={`grid-net-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-net-volume-grid-line-net"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-net-volume-axes">
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
              y1={layout.netTop}
              x2={layout.innerLeft}
              y2={layout.netBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.netBottom}
              x2={layout.innerRight}
              y2={layout.netBottom}
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
                  data-section="chart-line-net-volume-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickNetValues.map((v, i) => {
              const y =
                layout.netBottom -
                ((v - layout.netMin) /
                  (layout.netMax - layout.netMin)) *
                  (layout.netBottom - layout.netTop);
              return (
                <text
                  key={`tick-net-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-net-volume-tick-net"
                >
                  {formatNet(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-net-volume-midline"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-net-volume-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.overboughtY}
              x2={layout.innerRight}
              y2={layout.overboughtY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-net-volume-overbought-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oversoldY}
              x2={layout.innerRight}
              y2={layout.oversoldY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-net-volume-oversold-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-net-volume-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-net-volume-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-net-volume-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showNetLine ? (
          <path
            d={layout.netPath}
            stroke={netColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-net-volume-line"
          />
        ) : null}

        {showMarkers && showNetLine ? (
          <g data-section="chart-line-net-volume-markers">
            {layout.markers.map((m) => (
              <circle
                key={`net-marker-${m.index}`}
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
                data-section="chart-line-net-volume-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-net-volume-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.netBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-net-volume-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-net-volume-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={190}
                  height={144}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-volume"
                >
                  vol {formatVolume(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-direction"
                >
                  dir {tooltipSample.direction}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-up"
                >
                  up{' '}
                  {tooltipSample.upVolume == null
                    ? '--'
                    : formatVolume(tooltipSample.upVolume)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-down"
                >
                  down{' '}
                  {tooltipSample.downVolume == null
                    ? '--'
                    : formatVolume(tooltipSample.downVolume)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-total"
                >
                  total{' '}
                  {tooltipSample.totalVolume == null
                    ? '--'
                    : formatVolume(tooltipSample.totalVolume)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-net"
                >
                  net{' '}
                  {tooltipSample.net == null
                    ? '--'
                    : formatNet(tooltipSample.net)}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-net-volume-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-net-volume-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | OB {overbought} | OS {oversold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-net-volume-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
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
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="net"
            aria-pressed={!hidden.has('net')}
            onClick={() => handleLegendClick('net')}
            onKeyDown={(e) => handleLegendKey(e, 'net')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('net') ? 0.4 : 1,
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
                background: netColor,
                borderRadius: 2,
              }}
            />
            net volume
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineNetVolume.displayName = 'ChartLineNetVolume';
