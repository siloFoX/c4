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
 * ChartLineVortexMidCross -- pure-SVG dual-panel chart with
 * the close in the top panel and both Vortex Indicator
 * lines (VI+ in cyan, VI- in pink) in the bottom panel,
 * marking VI+ crosses up through VI- (trend reversal to
 * uptrend) / VI+ crosses down through VI- (trend reversal
 * to downtrend) direct mid-cross trigger events with bias
 * coloring derived from the VI+ slope at the trigger bar.
 *
 * Unlike `chart-line-vortex-pos-cross` and
 * `chart-line-vortex-neg-cross` (which compare a single VI
 * line to its own SMA signal smoothing), this primitive is
 * the canonical Vortex Indicator trade signal -- VI+
 * crossing VI- directly.
 *
 *   VM+[i]    = |high[i] - low[i-1]|
 *   VM-[i]    = |low[i]  - high[i-1]|
 *   TR[i]     = max(high[i] - low[i],
 *                   |high[i] - close[i-1]|,
 *                   |low[i]  - close[i-1]|)
 *   VI+[i]    = sum(VM+, period) / sum(TR, period)
 *   VI-[i]    = sum(VM-, period) / sum(TR, period)
 *   bullish   : prev VI+ <= prev VI- && cur VI+ > cur VI-
 *                (trend reversal to uptrend)
 *   bearish   : prev VI+ >= prev VI- && cur VI+ < cur VI-
 *                (trend reversal to downtrend)
 *   regime    : bullish (VI+ >= VI-), bearish (VI+ < VI-)
 *   bias      : up / down / flat / none from VI+[i] vs VI+[i-1]
 *
 * Defaults: `period = 14`. No signal SMA -- VI+ is compared
 * to VI- directly, so warmup is `period = 14` (vs `period +
 * signalLength - 1 = 16` for the SMA-smoothed siblings).
 *
 * Bit-exact anchors (all use HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close =
 *   K`: VM+ = 2, VM- = 2, TR = 2 -> VI+ = 1, VI- = 1 from
 *   `i = period`. VI+ === VI- -> regime `bullish` (>=).
 *   0 crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close =
 *   i`: VM+ = 3, VM- = 1, TR = 2 -> VI+ = 1.5, VI- = 0.5.
 *   VI+ - VI- = +1 -> regime `bullish`. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`, `close
 *   = -i`: VM+ = 1, VM- = 3, TR = 2 -> VI+ = 0.5, VI- =
 *   1.5. VI+ - VI- = -1 -> regime `bearish`. 0 crosses.
 *
 * The clean integer separation under linear input is the
 * direct, sign-mirrored counterpart of the two single-line
 * siblings: LINEAR UP forces VI+ above VI- by exactly 1
 * (the steady-state bullish anchor), LINEAR DOWN forces
 * VI+ below VI- by exactly 1 (the steady-state bearish
 * anchor).
 */

export interface ChartLineVortexMidCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineVortexMidCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineVortexMidCrossBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineVortexMidCrossSeriesId =
  | 'price'
  | 'vortexPos'
  | 'vortexNeg';

export type ChartLineVortexMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVortexMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineVortexMidCrossCrossKind;
  bias: ChartLineVortexMidCrossBias;
}

export interface ChartLineVortexMidCrossSample {
  index: number;
  x: number;
  close: number;
  vortexPos: number | null;
  vortexNeg: number | null;
  regime: ChartLineVortexMidCrossRegime;
  bias: ChartLineVortexMidCrossBias;
}

export interface ChartLineVortexMidCrossRun {
  series: ChartLineVortexMidCrossPoint[];
  period: number;
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  vortexPosValues: Array<number | null>;
  vortexNegValues: Array<number | null>;
  samples: ChartLineVortexMidCrossSample[];
  crosses: ChartLineVortexMidCrossCross[];
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

export interface ChartLineVortexMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVortexMidCrossLayout {
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
  priceDots: ChartLineVortexMidCrossDot[];
  vortexPosPath: string;
  vortexNegPath: string;
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
    kind: ChartLineVortexMidCrossCrossKind;
    bias: ChartLineVortexMidCrossBias;
  }>;
  run: ChartLineVortexMidCrossRun;
}

export interface ChartLineVortexMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVortexMidCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vortexPosColor?: string;
  vortexNegColor?: string;
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
  showVortexPos?: boolean;
  showVortexNeg?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVortexMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVortexMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVortexMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_VORTEX_POS_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_VORTEX_NEG_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VORTEX_MID_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineVortexMidCrossFinitePoints(
  data: readonly ChartLineVortexMidCrossPoint[] | null | undefined,
): ChartLineVortexMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVortexMidCrossPoint[] = [];
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

export function normalizeLineVortexMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface VortexMidCrossChannels {
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  vortexPos: Array<number | null>;
  vortexNeg: Array<number | null>;
}

export function computeLineVortexMidCross(
  series: readonly ChartLineVortexMidCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): VortexMidCrossChannels {
  const cleaned = getLineVortexMidCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      vortexPos: [],
      vortexNeg: [],
    };
  }
  const period = normalizeLineVortexMidCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const vmPlus: Array<number | null> = new Array(n).fill(null);
  const vmMinus: Array<number | null> = new Array(n).fill(null);
  const trueRange: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    vmPlus[i] = posZero(Math.abs(cur.high - prev.low));
    vmMinus[i] = posZero(Math.abs(cur.low - prev.high));
    const range = cur.high - cur.low;
    const highToPrevClose = Math.abs(cur.high - prev.close);
    const lowToPrevClose = Math.abs(cur.low - prev.close);
    trueRange[i] = posZero(
      Math.max(range, highToPrevClose, lowToPrevClose),
    );
  }

  const vortexPos: Array<number | null> = new Array(n).fill(null);
  const vortexNeg: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let sumVmPlus = 0;
    let sumVmMinus = 0;
    let sumTr = 0;
    let valid = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const vp = vmPlus[j];
      const vm = vmMinus[j];
      const tr = trueRange[j];
      if (vp == null || vm == null || tr == null) {
        valid = false;
        break;
      }
      sumVmPlus += vp;
      sumVmMinus += vm;
      sumTr += tr;
    }
    if (!valid || sumTr === 0) continue;
    vortexPos[i] = posZero(sumVmPlus / sumTr);
    vortexNeg[i] = posZero(sumVmMinus / sumTr);
  }

  return { vmPlus, vmMinus, trueRange, vortexPos, vortexNeg };
}

export function classifyLineVortexMidCrossRegime(
  vortexPos: number | null,
  vortexNeg: number | null,
): ChartLineVortexMidCrossRegime {
  if (vortexPos == null || vortexNeg == null) return 'none';
  if (vortexPos >= vortexNeg) return 'bullish';
  return 'bearish';
}

export function classifyLineVortexMidCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineVortexMidCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineVortexMidCrossCrosses(
  series: readonly ChartLineVortexMidCrossPoint[],
  vortexPosValues: readonly (number | null)[],
  vortexNegValues: readonly (number | null)[],
): ChartLineVortexMidCrossCross[] {
  const out: ChartLineVortexMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pp = vortexPosValues[i - 1];
    const pn = vortexNegValues[i - 1];
    const cp = vortexPosValues[i];
    const cn = vortexNegValues[i];
    if (pp == null || pn == null || cp == null || cn == null) continue;
    const bias = classifyLineVortexMidCrossBias(cp, pp);
    if (pp <= pn && cp > cn) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pp >= pn && cp < cn) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineVortexMidCross(
  data: ChartLineVortexMidCrossPoint[],
  options: { period?: number } = {},
): ChartLineVortexMidCrossRun {
  const cleaned = getLineVortexMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineVortexMidCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD,
  );

  const channels = computeLineVortexMidCross(series, { period });

  const samples: ChartLineVortexMidCrossSample[] = series.map((p, i) => {
    const vortexPos = channels.vortexPos[i] ?? null;
    const vortexNeg = channels.vortexNeg[i] ?? null;
    const prevVortexPos =
      i > 0 ? (channels.vortexPos[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      vortexPos,
      vortexNeg,
      regime: classifyLineVortexMidCrossRegime(vortexPos, vortexNeg),
      bias: classifyLineVortexMidCrossBias(vortexPos, prevVortexPos),
    };
  });

  const crosses = detectLineVortexMidCrossCrosses(
    series,
    channels.vortexPos,
    channels.vortexNeg,
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

  const warmup = period;
  const ok = series.length > warmup;

  return {
    series,
    period,
    vmPlus: channels.vmPlus,
    vmMinus: channels.vmMinus,
    trueRange: channels.trueRange,
    vortexPosValues: channels.vortexPos,
    vortexNegValues: channels.vortexNeg,
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

export interface ComputeLineVortexMidCrossLayoutOptions {
  data: ChartLineVortexMidCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVortexMidCrossLayout(
  opts: ComputeLineVortexMidCrossLayoutOptions,
): ChartLineVortexMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VORTEX_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VORTEX_MID_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PANEL_GAP;

  const run = runLineVortexMidCross(opts.data, {
    period: opts.period ?? undefined,
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
  for (let i = 0; i < run.vortexPosValues.length; i += 1) {
    const vp = run.vortexPosValues[i];
    const vn = run.vortexNegValues[i];
    if (vp != null) {
      if (vp < oscRawMin) oscRawMin = vp;
      if (vp > oscRawMax) oscRawMax = vp;
    }
    if (vn != null) {
      if (vn < oscRawMin) oscRawMin = vn;
      if (vn > oscRawMax) oscRawMax = vn;
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
      vortexPosPath: '',
      vortexNegPath: '',
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
  const priceDots: ChartLineVortexMidCrossDot[] = [];
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

  let vortexPosPath = '';
  let firstPos = true;
  for (const s of run.samples) {
    if (s.vortexPos == null) {
      firstPos = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.vortexPos);
    vortexPosPath += `${firstPos ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstPos = false;
  }
  vortexPosPath = vortexPosPath.trim();

  let vortexNegPath = '';
  let firstNeg = true;
  for (const s of run.samples) {
    if (s.vortexNeg == null) {
      firstNeg = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.vortexNeg);
    vortexNegPath += `${firstNeg ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstNeg = false;
  }
  vortexNegPath = vortexNegPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const vp = run.vortexPosValues[c.index];
    const cyOsc = vp != null ? syOscBase(vp) : oscBottom;
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
    vortexPosPath,
    vortexNegPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineVortexMidCrossChart(
  data: ChartLineVortexMidCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineVortexMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineVortexMidCrossLength(
    options.period,
    DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD,
  );
  return (
    `Vortex mid-cross chart over ${cleaned.length} bars ` +
    `(period ${period}). Top panel renders the close with ` +
    `bullish (VI+ crosses up through VI-, trend reversal to ` +
    `uptrend) / bearish (VI+ crosses down through VI-, trend ` +
    `reversal to downtrend) chevron overlays at every VI+/VI- ` +
    `direct crossover trigger event; bottom panel renders both ` +
    `Vortex Indicator lines (VI+ in cyan, VI- in pink) with ` +
    `markers coloured by VI+ slope bias (rising / falling / ` +
    `flat) at the trigger bar, flagging trend reversal direction ` +
    `change events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineVortexMidCrossCrossKind,
  bias: ChartLineVortexMidCrossBias,
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
  formatNumber(value, 4);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineVortexMidCross = forwardRef<
  HTMLDivElement,
  ChartLineVortexMidCrossProps
>(function ChartLineVortexMidCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_PRICE_COLOR,
    vortexPosColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_VORTEX_POS_COLOR,
    vortexNegColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_VORTEX_NEG_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VORTEX_MID_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVortexPos = true,
    showVortexNeg = true,
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
    () => getLineVortexMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVortexMidCrossLayout({
        data: cleaned,
        period,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVortexMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVortexMidCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVortexMidCrossSeriesId,
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
        data-section="chart-line-vortex-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineVortexMidCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showPosLine = !hidden.has('vortexPos') && showVortexPos;
  const showNegLine = !hidden.has('vortexNeg') && showVortexNeg;

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
      aria-label={ariaLabel ?? 'Vortex mid-cross chart'}
      aria-describedby={descId}
      data-section="chart-line-vortex-mid-cross"
      data-period={period}
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
        data-section="chart-line-vortex-mid-cross-title"
      >
        {ariaLabel ?? 'Vortex mid-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vortex-mid-cross-aria-desc"
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
        data-section="chart-line-vortex-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vortex-mid-cross-grid">
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
                  data-section="chart-line-vortex-mid-cross-grid-line-price"
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
                  data-section="chart-line-vortex-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vortex-mid-cross-axes">
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
                  data-section="chart-line-vortex-mid-cross-tick-price"
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
                  data-section="chart-line-vortex-mid-cross-tick-osc"
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
            data-section="chart-line-vortex-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vortex-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vortex-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPosLine ? (
          <path
            d={layout.vortexPosPath}
            stroke={vortexPosColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-mid-cross-vortex-pos-path"
          />
        ) : null}

        {showNegLine ? (
          <path
            d={layout.vortexNegPath}
            stroke={vortexNegColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vortex-mid-cross-vortex-neg-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vortex-mid-cross-crosses"
            role="group"
            aria-label="VI+/VI- mid-cross trigger markers"
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
                aria-label={`${m.kind} VI+/VI- trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-vortex-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-vortex-mid-cross-overlay-crosses"
            role="group"
            aria-label="overlay VI+/VI- mid-cross trigger markers"
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
                data-section={`chart-line-vortex-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vortex-mid-cross-hover-targets">
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
                data-section="chart-line-vortex-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vortex-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-pos"
                >
                  VI+{' '}
                  {tooltipSample.vortexPos == null
                    ? '--'
                    : formatOsc(tooltipSample.vortexPos)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-neg"
                >
                  VI-{' '}
                  {tooltipSample.vortexNeg == null
                    ? '--'
                    : formatOsc(tooltipSample.vortexNeg)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vortex-mid-cross-tooltip-biases"
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
          data-section="chart-line-vortex-mid-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vortex-mid-cross-legend"
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
                id: 'vortexPos' as const,
                color: vortexPosColor,
                label: 'VI+',
              },
              {
                id: 'vortexNeg' as const,
                color: vortexNegColor,
                label: 'VI-',
              },
            ] satisfies Array<{
              id: ChartLineVortexMidCrossSeriesId;
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

ChartLineVortexMidCross.displayName = 'ChartLineVortexMidCross';
