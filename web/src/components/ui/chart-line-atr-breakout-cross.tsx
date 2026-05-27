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
 * ChartLineAtrBreakoutCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Average True
 * Range (ATR), its long-window SMA baseline, and a derived
 * breakout threshold line (`baseline * multiplier`) in the
 * bottom panel, marking ATR crosses up through threshold
 * (volatility expansion breakout -- range expansion entry
 * trigger) / ATR crosses down through threshold
 * (volatility compression -- expansion releasing) events
 * with bias coloring derived from the ATR slope at the
 * trigger bar.
 *
 *   TR[i]       = max(high[i] - low[i],
 *                     |high[i] - close[i-1]|,
 *                     |low[i]  - close[i-1]|)
 *   ATR[i]      = SMA(TR, period)        ; i >= period
 *   baseline[i] = SMA(ATR, baselineLen)  ; i >= period +
 *                                          baselineLen - 1
 *   threshold[i] = baseline[i] * multiplier
 *   bullish     : prev ATR <= prev threshold &&
 *                 cur ATR > cur threshold
 *                 (volatility expansion breakout)
 *   bearish     : prev ATR >= prev threshold &&
 *                 cur ATR < cur threshold
 *                 (volatility compressing back to baseline)
 *   regime      : 'compressed' when ATR < baseline
 *                 'neutral'    when baseline <= ATR <
 *                              threshold
 *                 'expanded'   when ATR >= threshold
 *                 'none'       when ATR or baseline null
 *   bias        : ATR[i] vs ATR[i-1] -> up / down / flat /
 *                 none
 *
 * Defaults: `period = 14`, `baselineLength = 20`,
 * `multiplier = 1.5`. Warmup is `period + baselineLength
 * - 1 = 33` for the default tuning: TR seeds at `i >= 1`,
 * ATR fills the SMA window first at `i = period = 14`, then
 * baseline = SMA(ATR, baselineLength) needs another
 * `baselineLength - 1 = 19` bars.
 *
 * ATR uses a simple SMA (not the original Wilder running
 * smoothing) so the steady-state value of constant TR
 * exactly equals TR -- no convergence transient. This
 * matches the trader-friendly modern ATR variant used by
 * pyalgotrade, tulip-indicators, and ta-lib's `ATR_SMA`.
 *
 * Bit-exact anchors (all use HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: TR = max(2, 1, 1) = 2 from `i >= 1` -> ATR = 2
 *   from `i = period` -> baseline = 2 -> threshold = 3.
 *   ATR = 2 < threshold = 3 -> regime `compressed` (since
 *   2 < baseline 2 is false; in fact 2 >= baseline 2, so
 *   regime is `neutral`). Actually with ATR === baseline
 *   the `>=` boundary settles into the `neutral` band.
 *   0 crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: TR = max(2, 2, 0) = 2. Same as CONST.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: TR = max(2, 0, 2) = 2. Mirror of LINEAR
 *   UP.
 * - **WIDE CONST band** `high = K + 2`, `low = K - 2`,
 *   `close = K`: TR = max(4, 2, 2) = 4. ATR = 4, baseline
 *   = 4, threshold = 6. Same regime, but the ATR / baseline
 *   level differs from the narrow-band anchor, exercising
 *   the bit-exact ATR pipeline at a second magnitude.
 */

export interface ChartLineAtrBreakoutCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrBreakoutCrossRegime =
  | 'compressed'
  | 'neutral'
  | 'expanded'
  | 'none';

export type ChartLineAtrBreakoutCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineAtrBreakoutCrossSeriesId =
  | 'price'
  | 'atr'
  | 'baseline'
  | 'threshold';

export type ChartLineAtrBreakoutCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAtrBreakoutCrossCross {
  index: number;
  x: number;
  kind: ChartLineAtrBreakoutCrossCrossKind;
  bias: ChartLineAtrBreakoutCrossBias;
}

export interface ChartLineAtrBreakoutCrossSample {
  index: number;
  x: number;
  close: number;
  atr: number | null;
  baseline: number | null;
  threshold: number | null;
  regime: ChartLineAtrBreakoutCrossRegime;
  bias: ChartLineAtrBreakoutCrossBias;
}

export interface ChartLineAtrBreakoutCrossRun {
  series: ChartLineAtrBreakoutCrossPoint[];
  period: number;
  baselineLength: number;
  multiplier: number;
  trueRange: Array<number | null>;
  atrValues: Array<number | null>;
  baselineValues: Array<number | null>;
  thresholdValues: Array<number | null>;
  samples: ChartLineAtrBreakoutCrossSample[];
  crosses: ChartLineAtrBreakoutCrossCross[];
  compressedCount: number;
  neutralCount: number;
  expandedCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineAtrBreakoutCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrBreakoutCrossLayout {
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
  priceDots: ChartLineAtrBreakoutCrossDot[];
  atrPath: string;
  baselinePath: string;
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
    kind: ChartLineAtrBreakoutCrossCrossKind;
    bias: ChartLineAtrBreakoutCrossBias;
  }>;
  run: ChartLineAtrBreakoutCrossRun;
}

export interface ChartLineAtrBreakoutCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrBreakoutCrossPoint[];
  period?: number;
  baselineLength?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  atrColor?: string;
  baselineColor?: string;
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
  showAtr?: boolean;
  showBaseline?: boolean;
  showThreshold?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrBreakoutCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAtrBreakoutCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrBreakoutCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH = 20;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER = 1.5;
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_ATR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_THRESHOLD_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAtrBreakoutCrossFinitePoints(
  data: readonly ChartLineAtrBreakoutCrossPoint[] | null | undefined,
): ChartLineAtrBreakoutCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrBreakoutCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

export function normalizeLineAtrBreakoutCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineAtrBreakoutCrossMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/** Simple moving average over a `(number | null)[]` series. */
export function applyLineAtrBreakoutCrossSma(
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

export interface AtrBreakoutCrossChannels {
  trueRange: Array<number | null>;
  atr: Array<number | null>;
  baseline: Array<number | null>;
  threshold: Array<number | null>;
}

export function computeLineAtrBreakoutCross(
  series: readonly ChartLineAtrBreakoutCrossPoint[] | null | undefined,
  options: {
    period?: number;
    baselineLength?: number;
    multiplier?: number;
  } = {},
): AtrBreakoutCrossChannels {
  const cleaned = getLineAtrBreakoutCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      trueRange: [],
      atr: [],
      baseline: [],
      threshold: [],
    };
  }
  const period = normalizeLineAtrBreakoutCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD,
  );
  const baselineLength = normalizeLineAtrBreakoutCrossLength(
    options.baselineLength,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH,
  );
  const multiplier = normalizeLineAtrBreakoutCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER,
  );

  const n = cleaned.length;
  const trueRange: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const range = cur.high - cur.low;
    const highToPrevClose = Math.abs(cur.high - prev.close);
    const lowToPrevClose = Math.abs(cur.low - prev.close);
    trueRange[i] = posZero(
      Math.max(range, highToPrevClose, lowToPrevClose),
    );
  }

  const atr = applyLineAtrBreakoutCrossSma(trueRange, period);
  const baseline = applyLineAtrBreakoutCrossSma(atr, baselineLength);
  const threshold: Array<number | null> = baseline.map((b) =>
    b == null ? null : posZero(b * multiplier),
  );

  return { trueRange, atr, baseline, threshold };
}

export function classifyLineAtrBreakoutCrossRegime(
  atr: number | null,
  baseline: number | null,
  threshold: number | null,
): ChartLineAtrBreakoutCrossRegime {
  if (atr == null || baseline == null || threshold == null) return 'none';
  if (atr < baseline) return 'compressed';
  if (atr < threshold) return 'neutral';
  return 'expanded';
}

export function classifyLineAtrBreakoutCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineAtrBreakoutCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAtrBreakoutCrossCrosses(
  series: readonly ChartLineAtrBreakoutCrossPoint[],
  atrValues: readonly (number | null)[],
  thresholdValues: readonly (number | null)[],
): ChartLineAtrBreakoutCrossCross[] {
  const out: ChartLineAtrBreakoutCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pa = atrValues[i - 1];
    const pt = thresholdValues[i - 1];
    const ca = atrValues[i];
    const ct = thresholdValues[i];
    if (pa == null || pt == null || ca == null || ct == null) continue;
    const bias = classifyLineAtrBreakoutCrossBias(ca, pa);
    if (pa <= pt && ca > ct) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pa >= pt && ca < ct) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineAtrBreakoutCross(
  data: ChartLineAtrBreakoutCrossPoint[],
  options: {
    period?: number;
    baselineLength?: number;
    multiplier?: number;
  } = {},
): ChartLineAtrBreakoutCrossRun {
  const cleaned = getLineAtrBreakoutCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineAtrBreakoutCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD,
  );
  const baselineLength = normalizeLineAtrBreakoutCrossLength(
    options.baselineLength,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH,
  );
  const multiplier = normalizeLineAtrBreakoutCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER,
  );

  const channels = computeLineAtrBreakoutCross(series, {
    period,
    baselineLength,
    multiplier,
  });

  const samples: ChartLineAtrBreakoutCrossSample[] = series.map((p, i) => {
    const atr = channels.atr[i] ?? null;
    const baseline = channels.baseline[i] ?? null;
    const threshold = channels.threshold[i] ?? null;
    const prevAtr = i > 0 ? (channels.atr[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      atr,
      baseline,
      threshold,
      regime: classifyLineAtrBreakoutCrossRegime(atr, baseline, threshold),
      bias: classifyLineAtrBreakoutCrossBias(atr, prevAtr),
    };
  });

  const crosses = detectLineAtrBreakoutCrossCrosses(
    series,
    channels.atr,
    channels.threshold,
  );

  let compressedCount = 0;
  let neutralCount = 0;
  let expandedCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'compressed') compressedCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else if (s.regime === 'expanded') expandedCount += 1;
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

  const warmup = period + baselineLength - 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    baselineLength,
    multiplier,
    trueRange: channels.trueRange,
    atrValues: channels.atr,
    baselineValues: channels.baseline,
    thresholdValues: channels.threshold,
    samples,
    crosses,
    compressedCount,
    neutralCount,
    expandedCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineAtrBreakoutCrossLayoutOptions {
  data: ChartLineAtrBreakoutCrossPoint[];
  period?: number;
  baselineLength?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAtrBreakoutCrossLayout(
  opts: ComputeLineAtrBreakoutCrossLayoutOptions,
): ChartLineAtrBreakoutCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PANEL_GAP;

  const run = runLineAtrBreakoutCross(opts.data, {
    period: opts.period ?? undefined,
    baselineLength: opts.baselineLength ?? undefined,
    multiplier: opts.multiplier ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscRawMin = Infinity;
  let oscRawMax = -Infinity;
  for (let i = 0; i < run.atrValues.length; i += 1) {
    const a = run.atrValues[i];
    const b = run.baselineValues[i];
    const t = run.thresholdValues[i];
    if (a != null) {
      if (a < oscRawMin) oscRawMin = a;
      if (a > oscRawMax) oscRawMax = a;
    }
    if (b != null) {
      if (b < oscRawMin) oscRawMin = b;
      if (b > oscRawMax) oscRawMax = b;
    }
    if (t != null) {
      if (t < oscRawMin) oscRawMin = t;
      if (t > oscRawMax) oscRawMax = t;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = 0;
    oscRawMax = 1;
  }
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
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
      atrPath: '',
      baselinePath: '',
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
  const priceDots: ChartLineAtrBreakoutCrossDot[] = [];
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

  const buildOscPath = (values: ReadonlyArray<number | null>): string => {
    let path = '';
    let first = true;
    for (let i = 0; i < run.samples.length; i += 1) {
      const v = values[i];
      const samp = run.samples[i];
      if (v == null || !samp) {
        first = true;
        continue;
      }
      const cx = sx(samp.x);
      const cy = syOscBase(v);
      path += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return path.trim();
  };

  const atrPath = buildOscPath(run.atrValues);
  const baselinePath = buildOscPath(run.baselineValues);
  const thresholdPath = buildOscPath(run.thresholdValues);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const atrAtCross = run.atrValues[c.index];
    const cyOsc = atrAtCross != null ? syOscBase(atrAtCross) : oscBottom;
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
    atrPath,
    baselinePath,
    thresholdPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineAtrBreakoutCrossChart(
  data: ChartLineAtrBreakoutCrossPoint[],
  options: {
    period?: number;
    baselineLength?: number;
    multiplier?: number;
  } = {},
): string {
  const cleaned = getLineAtrBreakoutCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineAtrBreakoutCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD,
  );
  const baselineLength = normalizeLineAtrBreakoutCrossLength(
    options.baselineLength,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH,
  );
  const multiplier = normalizeLineAtrBreakoutCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER,
  );
  return (
    `ATR volatility breakout chart over ${cleaned.length} bars ` +
    `(period ${period}, baselineLength ${baselineLength}, ` +
    `multiplier ${multiplier}). Top panel renders the close ` +
    `with bullish (ATR crosses up through baseline*multiplier ` +
    `threshold, volatility expansion breakout -- range ` +
    `expansion entry trigger) / bearish (ATR crosses down ` +
    `through threshold, volatility compressing back) chevron ` +
    `overlays at every ATR threshold trigger event; bottom ` +
    `panel renders the Average True Range, its long-window ` +
    `SMA baseline, and the derived breakout threshold line ` +
    `with markers coloured by ATR slope bias (rising / ` +
    `falling / flat) at the trigger bar, flagging range ` +
    `expansion entry trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAtrBreakoutCrossCrossKind,
  bias: ChartLineAtrBreakoutCrossBias,
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
const defaultOscFormatter = (value: number): string =>
  formatNumber(value, 3);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAtrBreakoutCross = forwardRef<
  HTMLDivElement,
  ChartLineAtrBreakoutCrossProps
>(function ChartLineAtrBreakoutCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PERIOD,
    baselineLength = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_LENGTH,
    multiplier = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_MULTIPLIER,
    width = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_PRICE_COLOR,
    atrColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_ATR_COLOR,
    baselineColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BASELINE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_THRESHOLD_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_BREAKOUT_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAtr = true,
    showBaseline = true,
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
    () => getLineAtrBreakoutCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAtrBreakoutCrossLayout({
        data: cleaned,
        period,
        baselineLength,
        multiplier,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      period,
      baselineLength,
      multiplier,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAtrBreakoutCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAtrBreakoutCrossSeriesId,
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
    seriesId: ChartLineAtrBreakoutCrossSeriesId,
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
        data-section="chart-line-atr-breakout-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAtrBreakoutCrossChart(cleaned, {
      period,
      baselineLength,
      multiplier,
    });

  const showPrice = !hidden.has('price');
  const showAtrLine = !hidden.has('atr') && showAtr;
  const showBaselineLine = !hidden.has('baseline') && showBaseline;
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

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ATR volatility breakout chart'}
      aria-describedby={descId}
      data-section="chart-line-atr-breakout-cross"
      data-period={period}
      data-baseline-length={baselineLength}
      data-multiplier={multiplier}
      data-total-points={cleaned.length}
      data-compressed-count={layout.run.compressedCount}
      data-neutral-count={layout.run.neutralCount}
      data-expanded-count={layout.run.expandedCount}
      data-none-count={layout.run.noneCount}
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
        data-section="chart-line-atr-breakout-cross-title"
      >
        {ariaLabel ?? 'ATR volatility breakout chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-atr-breakout-cross-aria-desc"
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
        data-section="chart-line-atr-breakout-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-atr-breakout-cross-grid">
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
                  data-section="chart-line-atr-breakout-cross-grid-line-price"
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
                  data-section="chart-line-atr-breakout-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-atr-breakout-cross-axes">
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
                  data-section="chart-line-atr-breakout-cross-tick-price"
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
                  data-section="chart-line-atr-breakout-cross-tick-osc"
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
            data-section="chart-line-atr-breakout-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-atr-breakout-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-atr-breakout-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showBaselineLine ? (
          <path
            d={layout.baselinePath}
            stroke={baselineColor}
            strokeWidth={strokeWidth}
            strokeDasharray="4 3"
            fill="none"
            data-section="chart-line-atr-breakout-cross-baseline-path"
          />
        ) : null}

        {showThresholdLine ? (
          <path
            d={layout.thresholdPath}
            stroke={thresholdColor}
            strokeWidth={strokeWidth}
            strokeDasharray="6 3"
            fill="none"
            data-section="chart-line-atr-breakout-cross-threshold-path"
          />
        ) : null}

        {showAtrLine ? (
          <path
            d={layout.atrPath}
            stroke={atrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-breakout-cross-atr-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-atr-breakout-cross-crosses"
            role="group"
            aria-label="ATR breakout trigger markers"
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
                aria-label={`${m.kind} ATR breakout trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-atr-breakout-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-atr-breakout-cross-overlay-crosses"
            role="group"
            aria-label="overlay ATR breakout trigger markers"
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
                data-section={`chart-line-atr-breakout-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-atr-breakout-cross-hover-targets">
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
                data-section="chart-line-atr-breakout-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-atr-breakout-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={264}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-atr"
                >
                  ATR{' '}
                  {tooltipSample.atr == null
                    ? '--'
                    : formatOsc(tooltipSample.atr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-baseline"
                >
                  baseline{' '}
                  {tooltipSample.baseline == null
                    ? '--'
                    : formatOsc(tooltipSample.baseline)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-threshold"
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
                  data-section="chart-line-atr-breakout-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-counts"
                >
                  compressed {layout.run.compressedCount} | neutral{' '}
                  {layout.run.neutralCount} | expanded{' '}
                  {layout.run.expandedCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-breakout-cross-tooltip-biases"
                >
                  up {layout.run.upBiasCount} | down {layout.run.downBiasCount}{' '}
                  | flat {layout.run.flatBiasCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-atr-breakout-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | baseline {baselineLength} | mult{' '}
          {multiplier} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-atr-breakout-cross-legend"
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
              { id: 'atr' as const, color: atrColor, label: 'ATR' },
              {
                id: 'baseline' as const,
                color: baselineColor,
                label: 'baseline',
              },
              {
                id: 'threshold' as const,
                color: thresholdColor,
                label: 'threshold',
              },
            ] satisfies Array<{
              id: ChartLineAtrBreakoutCrossSeriesId;
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

ChartLineAtrBreakoutCross.displayName = 'ChartLineAtrBreakoutCross';
