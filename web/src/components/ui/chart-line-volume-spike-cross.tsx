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
 * ChartLineVolumeSpikeCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the volume bars
 * plus a spike-threshold line (multiplier * rolling
 * SMA of volume) in the bottom panel, marking bullish
 * (volume crosses up through threshold -- abnormal volume
 * surge entry trigger, breakout confirmation) / bearish
 * (volume crosses down through threshold -- spike ends,
 * volume returns to normal) volume-vs-threshold crossover
 * trigger events with bias coloring derived from the
 * volume slope at the trigger bar.
 *
 *   avgVolume[i] = SMA(volume, period)
 *   threshold[i] = multiplier * avgVolume[i]
 *
 *   bullish (spike-entry trigger) :
 *     prev volume <= prev threshold &&
 *     cur volume > cur threshold
 *   bearish (spike-exit trigger) :
 *     prev volume >= prev threshold &&
 *     cur volume < cur threshold
 *   regime       : 'bullish' when volume >= threshold
 *                  'bearish' when volume <  threshold
 *                  'none'    when either is null
 *   bias         : volume[i] vs volume[i-1] -> up /
 *                  down / flat / none
 *
 * Defaults: `period = 20`, `multiplier = 2`. The volume
 * spike pattern is one of the oldest breakout-confirmation
 * filters: when current volume exceeds its rolling
 * average by a configured multiplier, the move is
 * considered "confirmed by participation". A `2x` spike
 * on a 20-bar rolling window is the canonical "abnormal
 * volume" threshold used by Wyckoff / Joe Granville
 * volume-pattern analysts.
 *
 * Unlike most cross-sig family members which feature
 * symmetric thresholds around 0, this primitive uses an
 * asymmetric threshold (always positive, always above
 * avgVolume). Steady-state volume sits *below* the
 * threshold -- the bullish "spike entry" trigger fires
 * only on extraordinary volume readings.
 *
 * Volume must be non-negative; the input filter drops
 * any point with negative volume.
 *
 * Warmup is `period + 1 = 21` for the default tuning:
 * avgVolume valid from i = period - 1 = 19, and cross
 * detection requires the previous bar's volume +
 * threshold, so the first potential cross lands at i =
 * period = 20.
 *
 * Bit-exact anchors (close + volume input):
 *
 * - **CONST volume** `volume = V > 0`: avgVolume = V,
 *   threshold = multiplier * V = 2V. volume = V is
 *   always < 2V (for multiplier > 1) -> regime
 *   `bearish` (below threshold) for every valid bar.
 *   0 crosses. Verified across V in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP volume** `volume = i + 100`: avgVolume
 *   = i + 100 - 9.5 (centroid lag). threshold = 2 *
 *   (i + 90.5) = 2i + 181. volume = i + 100. threshold
 *   - volume = i + 81. Always positive and growing,
 *   so volume stays below threshold forever -> regime
 *   `bearish`. 0 crosses (volume rising steadily but
 *   threshold rises 2x faster on average).
 * - **LINEAR DOWN volume** `volume = 1000 - i`:
 *   avgVolume = 1000 - i + 9.5. threshold = 2 *
 *   (1009.5 - i). volume = 1000 - i. threshold -
 *   volume = 1019 - i. Stays positive for i < 1019, so
 *   volume below threshold for the entire useful
 *   range. 0 crosses.
 *
 * All three anchors produce zero crosses because steady-
 * state volume (regardless of trend direction) sits
 * below the multiplier-scaled threshold. Crosses only
 * fire on volume spikes that exceed the configured
 * multiple of the rolling average -- this is the
 * defining behaviour of the indicator.
 */

export interface ChartLineVolumeSpikeCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVolumeSpikeCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineVolumeSpikeCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineVolumeSpikeCrossSeriesId =
  | 'price'
  | 'volume'
  | 'threshold';

export type ChartLineVolumeSpikeCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVolumeSpikeCrossCross {
  index: number;
  x: number;
  kind: ChartLineVolumeSpikeCrossCrossKind;
  bias: ChartLineVolumeSpikeCrossBias;
}

export interface ChartLineVolumeSpikeCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  avgVolume: number | null;
  threshold: number | null;
  regime: ChartLineVolumeSpikeCrossRegime;
  bias: ChartLineVolumeSpikeCrossBias;
}

export interface ChartLineVolumeSpikeCrossRun {
  series: ChartLineVolumeSpikeCrossPoint[];
  period: number;
  multiplier: number;
  avgVolumeValues: Array<number | null>;
  thresholdValues: Array<number | null>;
  samples: ChartLineVolumeSpikeCrossSample[];
  crosses: ChartLineVolumeSpikeCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineVolumeSpikeCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVolumeSpikeCrossVolumeBar {
  index: number;
  x: number;
  cx: number;
  cyTop: number;
  cyBase: number;
  volume: number;
}

export interface ChartLineVolumeSpikeCrossLayout {
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
  priceDots: ChartLineVolumeSpikeCrossDot[];
  volumeBars: ChartLineVolumeSpikeCrossVolumeBar[];
  thresholdPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineVolumeSpikeCrossCrossKind;
    bias: ChartLineVolumeSpikeCrossBias;
  }>;
  run: ChartLineVolumeSpikeCrossRun;
}

export interface ChartLineVolumeSpikeCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolumeSpikeCrossPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  volumeColor?: string;
  thresholdColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVolume?: boolean;
  showThreshold?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolumeSpikeCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVolumeSpikeCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVolumeSpikeCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD = 20;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_VOLUME_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_THRESHOLD_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineVolumeSpikeCrossFinitePoints(
  data: readonly ChartLineVolumeSpikeCrossPoint[] | null | undefined,
): ChartLineVolumeSpikeCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolumeSpikeCrossPoint[] = [];
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

export function normalizeLineVolumeSpikeCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineVolumeSpikeCrossMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineVolumeSpikeCrossSma(
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

export interface VolumeSpikeCrossChannels {
  avgVolume: Array<number | null>;
  threshold: Array<number | null>;
}

export function computeLineVolumeSpikeCross(
  series: readonly ChartLineVolumeSpikeCrossPoint[] | null | undefined,
  options: { period?: number; multiplier?: number } = {},
): VolumeSpikeCrossChannels {
  const cleaned = getLineVolumeSpikeCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { avgVolume: [], threshold: [] };
  }
  const period = normalizeLineVolumeSpikeCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineVolumeSpikeCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER,
  );

  const volumes: Array<number | null> = cleaned.map((p) => p.volume);
  const avgVolume = applyLineVolumeSpikeCrossSma(volumes, period);
  const threshold: Array<number | null> = avgVolume.map((v) =>
    v == null ? null : posZero(v * multiplier),
  );
  return { avgVolume, threshold };
}

export function classifyLineVolumeSpikeCrossRegime(
  volume: number | null,
  threshold: number | null,
): ChartLineVolumeSpikeCrossRegime {
  if (volume == null || threshold == null) return 'none';
  if (volume >= threshold) return 'bullish';
  return 'bearish';
}

export function classifyLineVolumeSpikeCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineVolumeSpikeCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineVolumeSpikeCrossCrosses(
  series: readonly ChartLineVolumeSpikeCrossPoint[],
  thresholdValues: readonly (number | null)[],
): ChartLineVolumeSpikeCrossCross[] {
  const out: ChartLineVolumeSpikeCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pv = series[i - 1]?.volume;
    const pt = thresholdValues[i - 1];
    const cv = series[i]?.volume;
    const ct = thresholdValues[i];
    if (pv == null || pt == null || cv == null || ct == null) continue;
    const bias = classifyLineVolumeSpikeCrossBias(cv, pv);
    if (pv <= pt && cv > ct) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pv >= pt && cv < ct) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineVolumeSpikeCross(
  data: ChartLineVolumeSpikeCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): ChartLineVolumeSpikeCrossRun {
  const cleaned = getLineVolumeSpikeCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineVolumeSpikeCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineVolumeSpikeCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER,
  );

  const channels = computeLineVolumeSpikeCross(series, {
    period,
    multiplier,
  });

  const samples: ChartLineVolumeSpikeCrossSample[] = series.map((p, i) => {
    const avgVolume = channels.avgVolume[i] ?? null;
    const threshold = channels.threshold[i] ?? null;
    const prev = i > 0 ? (series[i - 1]?.volume ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      avgVolume,
      threshold,
      regime: classifyLineVolumeSpikeCrossRegime(p.volume, threshold),
      bias: classifyLineVolumeSpikeCrossBias(p.volume, prev),
    };
  });

  const crosses = detectLineVolumeSpikeCrossCrosses(
    series,
    channels.threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = period + 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    multiplier,
    avgVolumeValues: channels.avgVolume,
    thresholdValues: channels.threshold,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineVolumeSpikeCrossLayoutOptions {
  data: ChartLineVolumeSpikeCrossPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVolumeSpikeCrossLayout(
  opts: ComputeLineVolumeSpikeCrossLayoutOptions,
): ChartLineVolumeSpikeCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PANEL_GAP;

  const run = runLineVolumeSpikeCross(opts.data, {
    period: opts.period ?? undefined,
    multiplier: opts.multiplier ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // Volume is non-negative; floor at 0. Top is max(volume, threshold).
  let oscRawMax = -Infinity;
  for (let i = 0; i < run.samples.length; i += 1) {
    const v = run.samples[i]?.volume;
    const t = run.thresholdValues[i];
    if (v != null && v > oscRawMax) oscRawMax = v;
    if (t != null && t > oscRawMax) oscRawMax = t;
  }
  if (!Number.isFinite(oscRawMax)) oscRawMax = 1;
  if (oscRawMax === 0) oscRawMax = 1;
  const oscMin = 0;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

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
      volumeBars: [],
      thresholdPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
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
  const priceDots: ChartLineVolumeSpikeCrossDot[] = [];
  const volumeBars: ChartLineVolumeSpikeCrossVolumeBar[] = [];
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
    volumeBars.push({
      index: s.index,
      x: s.x,
      cx,
      cyTop: syOscBase(s.volume),
      cyBase: oscBottom,
      volume: s.volume,
    });
  }

  let thresholdPath = '';
  let firstT = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const t = run.thresholdValues[i];
    if (t == null) {
      firstT = true;
      continue;
    }
    const cx = sx(run.samples[i]!.x);
    const cy = syOscBase(t);
    thresholdPath += `${firstT ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstT = false;
  }
  thresholdPath = thresholdPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const vAt = samp?.volume;
    const cyOsc = vAt != null ? syOscBase(vAt) : oscBottom;
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      bias: c.bias,
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
    volumeBars,
    thresholdPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineVolumeSpikeCrossChart(
  data: ChartLineVolumeSpikeCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): string {
  const cleaned = getLineVolumeSpikeCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineVolumeSpikeCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineVolumeSpikeCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER,
  );
  return (
    `Volume spike-cross chart over ${cleaned.length} bars (period ` +
    `${period}, multiplier ${multiplier}). Top panel renders the ` +
    `close with bullish (volume crosses up through threshold, ` +
    `abnormal volume surge entry trigger, breakout confirmation) / ` +
    `bearish (volume crosses down through threshold, spike ends, ` +
    `volume returns to normal) chevron overlays at every volume- ` +
    `threshold trigger event; bottom panel renders the bar volume ` +
    `with a spike-threshold line (multiplier times rolling SMA of ` +
    `volume), marker-coloured by volume slope bias (rising / ` +
    `falling / flat) at the trigger bar, flagging abnormal volume ` +
    `surge entry events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineVolumeSpikeCrossCrossKind,
  bias: ChartLineVolumeSpikeCrossBias,
  upColor: string,
  downColor: string,
  flatColor: string,
  bullishColor: string,
  bearishColor: string,
): string {
  if (bias === 'up') return upColor;
  if (bias === 'down') return downColor;
  if (bias === 'flat') return flatColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVolumeSpikeCross = forwardRef<
  HTMLDivElement,
  ChartLineVolumeSpikeCrossProps
>(function ChartLineVolumeSpikeCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PERIOD,
    multiplier = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_MULTIPLIER,
    width = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_PRICE_COLOR,
    volumeColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_VOLUME_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_THRESHOLD_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VOLUME_SPIKE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVolume = true,
    showThreshold = true,
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
    () => getLineVolumeSpikeCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVolumeSpikeCrossLayout({
        data: cleaned,
        period,
        multiplier,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, multiplier, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVolumeSpikeCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVolumeSpikeCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVolumeSpikeCrossSeriesId,
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
        data-section="chart-line-volume-spike-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVolumeSpikeCrossChart(cleaned, { period, multiplier });

  const showPrice = !hidden.has('price');
  const showVolumeBars = !hidden.has('volume') && showVolume;
  const showThresholdLine = !hidden.has('threshold') && showThreshold;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  const barWidth =
    layout.priceDots.length > 1
      ? Math.max(
          1,
          (layout.innerRight - layout.innerLeft) /
            layout.priceDots.length -
            1,
        )
      : 6;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Volume spike-cross chart'}
      aria-describedby={descId}
      data-section="chart-line-volume-spike-cross"
      data-period={period}
      data-multiplier={multiplier}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-up-bias-count={layout.run.upBiasCount}
      data-down-bias-count={layout.run.downBiasCount}
      data-flat-bias-count={layout.run.flatBiasCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-volume-spike-cross-title"
      >
        {ariaLabel ?? 'Volume spike-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-volume-spike-cross-aria-desc"
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
        data-section="chart-line-volume-spike-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-volume-spike-cross-grid">
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
                  data-section="chart-line-volume-spike-cross-grid-line-price"
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
                  data-section="chart-line-volume-spike-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-volume-spike-cross-axes">
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
                  data-section="chart-line-volume-spike-cross-tick-price"
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
                  data-section="chart-line-volume-spike-cross-tick-osc"
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
            data-section="chart-line-volume-spike-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-volume-spike-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-volume-spike-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVolumeBars ? (
          <g data-section="chart-line-volume-spike-cross-volume-bars">
            {layout.volumeBars.map((b) => (
              <rect
                key={`vol-${b.index}`}
                x={b.cx - barWidth / 2}
                y={Math.min(b.cyTop, b.cyBase)}
                width={barWidth}
                height={Math.abs(b.cyBase - b.cyTop)}
                fill={volumeColor}
                opacity={0.6}
                data-section="chart-line-volume-spike-cross-volume-bar"
              />
            ))}
          </g>
        ) : null}

        {showThresholdLine ? (
          <path
            d={layout.thresholdPath}
            stroke={thresholdColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="4 3"
            data-section="chart-line-volume-spike-cross-threshold-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-volume-spike-cross-crosses"
            role="group"
            aria-label="Volume spike trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} volume spike trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-volume-spike-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-volume-spike-cross-overlay-crosses"
            role="group"
            aria-label="overlay Volume spike trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-volume-spike-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-volume-spike-cross-hover-targets">
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
                data-section="chart-line-volume-spike-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-volume-spike-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-volume"
                >
                  volume {formatOsc(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-avg"
                >
                  avg{' '}
                  {tooltipSample.avgVolume == null
                    ? '--'
                    : formatOsc(tooltipSample.avgVolume)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-threshold"
                >
                  threshold{' '}
                  {tooltipSample.threshold == null
                    ? '--'
                    : formatOsc(tooltipSample.threshold)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-counts"
                >
                  above {layout.run.bullishCount} | below{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-volume-spike-cross-tooltip-crosses"
                >
                  bull spikes {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-volume-spike-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | mult {multiplier} | spikes{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-volume-spike-cross-legend"
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
                id: 'volume' as const,
                color: volumeColor,
                label: 'volume',
              },
              {
                id: 'threshold' as const,
                color: thresholdColor,
                label: 'threshold',
              },
            ] satisfies Array<{
              id: ChartLineVolumeSpikeCrossSeriesId;
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

ChartLineVolumeSpikeCross.displayName = 'ChartLineVolumeSpikeCross';
