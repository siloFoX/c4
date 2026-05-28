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
 * ChartLinePivotCamarilla -- pure-SVG single-panel line chart
 * that overlays Camarilla pivot levels on the close.
 *
 * For each bar `i` the levels are derived from the **prior**
 * bar's high (H), low (L), and close (C):
 *
 *   pivot[i] = (H + L + C) / 3
 *   R1[i]    = C + (H - L) * 1.1 / 12
 *   R2[i]    = C + (H - L) * 1.1 / 6
 *   R3[i]    = C + (H - L) * 1.1 / 4
 *   R4[i]    = C + (H - L) * 1.1 / 2
 *   S1[i]    = C - (H - L) * 1.1 / 12
 *   S2[i]    = C - (H - L) * 1.1 / 6
 *   S3[i]    = C - (H - L) * 1.1 / 4
 *   S4[i]    = C - (H - L) * 1.1 / 2
 *
 * Bar 0 has no prior bar so all levels are `null`.
 *
 * Bit-exact anchor: **CONST_FLAT** (`H = L = C = K`). The prior
 * bar's range is zero, so every R/S offset vanishes and
 * `pivot = R1 = R2 = R3 = R4 = S1 = S2 = S3 = S4 = K`
 * bit-exact past bar 0. The integration sweep verifies this
 * across several `K` (including 0 and negatives).
 */

export interface ChartLinePivotCamarillaPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLinePivotCamarillaZone =
  | 'breakout-up'
  | 'above-pivot'
  | 'at-pivot'
  | 'below-pivot'
  | 'breakout-down'
  | 'none';

export type ChartLinePivotCamarillaSeriesId =
  | 'price'
  | 'pivot'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'r4'
  | 's1'
  | 's2'
  | 's3'
  | 's4';

export interface ChartLinePivotCamarillaSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  pivot: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  s4: number | null;
  zone: ChartLinePivotCamarillaZone;
}

export interface ChartLinePivotCamarillaRun {
  series: ChartLinePivotCamarillaPoint[];
  pivot: Array<number | null>;
  r1: Array<number | null>;
  r2: Array<number | null>;
  r3: Array<number | null>;
  r4: Array<number | null>;
  s1: Array<number | null>;
  s2: Array<number | null>;
  s3: Array<number | null>;
  s4: Array<number | null>;
  samples: ChartLinePivotCamarillaSample[];
  pivotFinal: number | null;
  breakoutUpCount: number;
  abovePivotCount: number;
  atPivotCount: number;
  belowPivotCount: number;
  breakoutDownCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLinePivotCamarillaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  pivot: number;
  zone: ChartLinePivotCamarillaZone;
}

export interface ChartLinePivotCamarillaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePivotCamarillaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLinePivotCamarillaDot[];
  pivotPath: string;
  r1Path: string;
  r2Path: string;
  r3Path: string;
  r4Path: string;
  s1Path: string;
  s2Path: string;
  s3Path: string;
  s4Path: string;
  markers: ChartLinePivotCamarillaMarker[];
  yMin: number;
  yMax: number;
  run: ChartLinePivotCamarillaRun;
}

export interface ChartLinePivotCamarillaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePivotCamarillaPoint[];
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  pivotColor?: string;
  r1Color?: string;
  r2Color?: string;
  r3Color?: string;
  r4Color?: string;
  s1Color?: string;
  s2Color?: string;
  s3Color?: string;
  s4Color?: string;
  breakoutUpColor?: string;
  abovePivotColor?: string;
  atPivotColor?: string;
  belowPivotColor?: string;
  breakoutDownColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPivot?: boolean;
  showResistance?: boolean;
  showSupport?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePivotCamarillaSeriesId[];
  defaultHiddenSeries?: ChartLinePivotCamarillaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePivotCamarillaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLinePivotCamarillaSample }) => void;
  formatPrice?: (value: number) => string;
  formatPivot?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_WIDTH = 720;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_HEIGHT = 400;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PADDING = 44;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PIVOT_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R1_COLOR = '#fca5a5';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R2_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R3_COLOR = '#b91c1c';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R4_COLOR = '#7f1d1d';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S1_COLOR = '#86efac';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S2_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S3_COLOR = '#15803d';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S4_COLOR = '#14532d';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BREAKOUT_UP_COLOR = '#7f1d1d';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_ABOVE_PIVOT_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_AT_PIVOT_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BELOW_PIVOT_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BREAKOUT_DOWN_COLOR = '#14532d';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PIVOT_CAMARILLA_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLinePivotCamarillaFinitePoints(
  data: readonly ChartLinePivotCamarillaPoint[] | null | undefined,
): ChartLinePivotCamarillaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePivotCamarillaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

export interface ChartLinePivotCamarillaChannels {
  pivot: Array<number | null>;
  r1: Array<number | null>;
  r2: Array<number | null>;
  r3: Array<number | null>;
  r4: Array<number | null>;
  s1: Array<number | null>;
  s2: Array<number | null>;
  s3: Array<number | null>;
  s4: Array<number | null>;
}

/**
 * Compute Camarilla pivot levels per bar. Levels are derived
 * from the **prior** bar's H/L/C, so bar 0 is all `null`.
 */
export function computeLinePivotCamarilla(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
): ChartLinePivotCamarillaChannels {
  const empty: ChartLinePivotCamarillaChannels = {
    pivot: [],
    r1: [],
    r2: [],
    r3: [],
    r4: [],
    s1: [],
    s2: [],
    s3: [],
    s4: [],
  };
  if (!Array.isArray(bars) || bars.length === 0) return empty;
  const pivot: Array<number | null> = [];
  const r1: Array<number | null> = [];
  const r2: Array<number | null> = [];
  const r3: Array<number | null> = [];
  const r4: Array<number | null> = [];
  const s1: Array<number | null> = [];
  const s2: Array<number | null> = [];
  const s3: Array<number | null> = [];
  const s4: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i === 0) {
      pivot.push(null);
      r1.push(null);
      r2.push(null);
      r3.push(null);
      r4.push(null);
      s1.push(null);
      s2.push(null);
      s3.push(null);
      s4.push(null);
      continue;
    }
    const prev = bars[i - 1];
    if (
      !prev ||
      !isFiniteNumber(prev.high) ||
      !isFiniteNumber(prev.low) ||
      !isFiniteNumber(prev.close)
    ) {
      pivot.push(null);
      r1.push(null);
      r2.push(null);
      r3.push(null);
      r4.push(null);
      s1.push(null);
      s2.push(null);
      s3.push(null);
      s4.push(null);
      continue;
    }
    const H = prev.high;
    const L = prev.low;
    const C = prev.close;
    const range = H - L;
    const p = (H + L + C) / 3;
    const offset1 = (range * 1.1) / 12;
    const offset2 = (range * 1.1) / 6;
    const offset3 = (range * 1.1) / 4;
    const offset4 = (range * 1.1) / 2;
    pivot.push(p);
    r1.push(C + offset1);
    r2.push(C + offset2);
    r3.push(C + offset3);
    r4.push(C + offset4);
    s1.push(C - offset1);
    s2.push(C - offset2);
    s3.push(C - offset3);
    s4.push(C - offset4);
  }
  return { pivot, r1, r2, r3, r4, s1, s2, s3, s4 };
}

/** Classify the close relative to the Camarilla level stack. */
export function classifyLinePivotCamarillaZone(
  close: number,
  pivot: number | null,
  r4: number | null,
  s4: number | null,
): ChartLinePivotCamarillaZone {
  if (
    pivot == null ||
    r4 == null ||
    s4 == null ||
    !isFiniteNumber(pivot) ||
    !isFiniteNumber(r4) ||
    !isFiniteNumber(s4) ||
    !isFiniteNumber(close)
  ) {
    return 'none';
  }
  // Zero-width level stack (CONST_FLAT singular): r4 == pivot == s4.
  // Collapse to the pivot comparison so a flat bar reads `at-pivot`
  // instead of triggering breakouts.
  if (r4 === pivot && s4 === pivot) {
    if (close > pivot) return 'above-pivot';
    if (close < pivot) return 'below-pivot';
    return 'at-pivot';
  }
  if (close >= r4) return 'breakout-up';
  if (close <= s4) return 'breakout-down';
  if (close > pivot) return 'above-pivot';
  if (close < pivot) return 'below-pivot';
  return 'at-pivot';
}

/** Run the full Camarilla pipeline plus sample classification. */
export function runLinePivotCamarilla(
  data: readonly ChartLinePivotCamarillaPoint[] | null | undefined,
): ChartLinePivotCamarillaRun {
  const series = getLinePivotCamarillaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const channels = computeLinePivotCamarilla(series);
  const samples: ChartLinePivotCamarillaSample[] = series.map((point, index) => {
    const pivot = channels.pivot[index] ?? null;
    const r4 = channels.r4[index] ?? null;
    const s4 = channels.s4[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      pivot,
      r1: channels.r1[index] ?? null,
      r2: channels.r2[index] ?? null,
      r3: channels.r3[index] ?? null,
      r4,
      s1: channels.s1[index] ?? null,
      s2: channels.s2[index] ?? null,
      s3: channels.s3[index] ?? null,
      s4,
      zone: classifyLinePivotCamarillaZone(point.close, pivot, r4, s4),
    };
  });
  let breakoutUpCount = 0;
  let abovePivotCount = 0;
  let atPivotCount = 0;
  let belowPivotCount = 0;
  let breakoutDownCount = 0;
  let noneCount = 0;
  let pivotFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'breakout-up') breakoutUpCount += 1;
    else if (sample.zone === 'above-pivot') abovePivotCount += 1;
    else if (sample.zone === 'at-pivot') atPivotCount += 1;
    else if (sample.zone === 'below-pivot') belowPivotCount += 1;
    else if (sample.zone === 'breakout-down') breakoutDownCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.pivot)) pivotFinal = sample.pivot;
  }
  return {
    series = [],
    pivot: channels.pivot,
    r1: channels.r1,
    r2: channels.r2,
    r3: channels.r3,
    r4: channels.r4,
    s1: channels.s1,
    s2: channels.s2,
    s3: channels.s3,
    s4: channels.s4,
    samples,
    pivotFinal,
    breakoutUpCount,
    abovePivotCount,
    atPivotCount,
    belowPivotCount,
    breakoutDownCount,
    noneCount,
    ok: series.length > 1,
  };
}

export interface ChartLinePivotCamarillaLayoutOptions {
  data: readonly ChartLinePivotCamarillaPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a single-panel SVG layout. */
export function computeLinePivotCamarillaLayout(
  options: ChartLinePivotCamarillaLayoutOptions,
): ChartLinePivotCamarillaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_PIVOT_CAMARILLA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_PIVOT_CAMARILLA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PADDING;

  const run = runLinePivotCamarilla(options.data);

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  // y-range covers close and all 9 pivot levels.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    const levels = [
      sample.pivot,
      sample.r1,
      sample.r2,
      sample.r3,
      sample.r4,
      sample.s1,
      sample.s2,
      sample.s3,
      sample.s4,
    ];
    for (const l of levels) {
      if (l != null && isFiniteNumber(l)) {
        if (l < yMin) yMin = l;
        if (l > yMax) yMax = l;
      }
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLinePivotCamarillaDot[] = [];
  const pivotLinePoints: Array<{ x: number; y: number }> = [];
  const r1Points: Array<{ x: number; y: number }> = [];
  const r2Points: Array<{ x: number; y: number }> = [];
  const r3Points: Array<{ x: number; y: number }> = [];
  const r4Points: Array<{ x: number; y: number }> = [];
  const s1Points: Array<{ x: number; y: number }> = [];
  const s2Points: Array<{ x: number; y: number }> = [];
  const s3Points: Array<{ x: number; y: number }> = [];
  const s4Points: Array<{ x: number; y: number }> = [];
  const markers: ChartLinePivotCamarillaMarker[] = [];

  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cyClose = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cyClose });
    priceDots.push({ index, x: sample.x, cx, cy: cyClose, close: sample.close });
    if (isFiniteNumber(sample.pivot)) {
      const yc = yAt(sample.pivot);
      pivotLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        pivot: sample.pivot,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.r1)) r1Points.push({ x: cx, y: yAt(sample.r1) });
    if (isFiniteNumber(sample.r2)) r2Points.push({ x: cx, y: yAt(sample.r2) });
    if (isFiniteNumber(sample.r3)) r3Points.push({ x: cx, y: yAt(sample.r3) });
    if (isFiniteNumber(sample.r4)) r4Points.push({ x: cx, y: yAt(sample.r4) });
    if (isFiniteNumber(sample.s1)) s1Points.push({ x: cx, y: yAt(sample.s1) });
    if (isFiniteNumber(sample.s2)) s2Points.push({ x: cx, y: yAt(sample.s2) });
    if (isFiniteNumber(sample.s3)) s3Points.push({ x: cx, y: yAt(sample.s3) });
    if (isFiniteNumber(sample.s4)) s4Points.push({ x: cx, y: yAt(sample.s4) });
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    pivotPath: buildLinePath(pivotLinePoints),
    r1Path: buildLinePath(r1Points),
    r2Path: buildLinePath(r2Points),
    r3Path: buildLinePath(r3Points),
    r4Path: buildLinePath(r4Points),
    s1Path: buildLinePath(s1Points),
    s2Path: buildLinePath(s2Points),
    s3Path: buildLinePath(s3Points),
    s4Path: buildLinePath(s4Points),
    markers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLinePivotCamarillaChart(
  data: readonly ChartLinePivotCamarillaPoint[] | null | undefined,
): string {
  const run = runLinePivotCamarilla(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.pivotFinal === null ? 'n/a' : run.pivotFinal.toFixed(4);
  return (
    `Single-panel chart with Camarilla pivot level overlays on ` +
    `the close. Each bar's pivot and resistance / support levels ` +
    `are derived from the prior bar's high, low, and close: ` +
    `pivot = (H + L + C) / 3, R/S levels = C +/- (H - L) * 1.1 / ` +
    `{12, 6, 4, 2}. Across ${total} bars the close breaks out ` +
    `above R4 on ${run.breakoutUpCount}, sits above the pivot on ` +
    `${run.abovePivotCount}, at the pivot on ${run.atPivotCount}, ` +
    `below the pivot on ${run.belowPivotCount}, breaks out below ` +
    `S4 on ${run.breakoutDownCount}, and is undefined on ` +
    `${run.noneCount}. The final pivot value is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPivot(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLinePivotCamarillaZone,
  breakoutUpColor: string,
  abovePivotColor: string,
  atPivotColor: string,
  belowPivotColor: string,
  breakoutDownColor: string,
  noneColor: string,
): string {
  if (zone === 'breakout-up') return breakoutUpColor;
  if (zone === 'above-pivot') return abovePivotColor;
  if (zone === 'at-pivot') return atPivotColor;
  if (zone === 'below-pivot') return belowPivotColor;
  if (zone === 'breakout-down') return breakoutDownColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLinePivotCamarillaZone): string {
  if (zone === 'breakout-up') return 'Breakout Up (>= R4)';
  if (zone === 'above-pivot') return 'Above Pivot';
  if (zone === 'at-pivot') return 'At Pivot';
  if (zone === 'below-pivot') return 'Below Pivot';
  if (zone === 'breakout-down') return 'Breakout Down (<= S4)';
  return 'n/a';
}

/** ChartLinePivotCamarilla -- single-panel pure-SVG chart. */
export const ChartLinePivotCamarilla = forwardRef<
  HTMLDivElement,
  ChartLinePivotCamarillaProps
>(function ChartLinePivotCamarilla(props, ref) {
  const {
    data,
    width = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_WIDTH,
    height = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_HEIGHT,
    padding = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PADDING,
    tickCount = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PRICE_COLOR,
    pivotColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_PIVOT_COLOR,
    r1Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R1_COLOR,
    r2Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R2_COLOR,
    r3Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R3_COLOR,
    r4Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_R4_COLOR,
    s1Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S1_COLOR,
    s2Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S2_COLOR,
    s3Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S3_COLOR,
    s4Color = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_S4_COLOR,
    breakoutUpColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BREAKOUT_UP_COLOR,
    abovePivotColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_ABOVE_PIVOT_COLOR,
    atPivotColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_AT_PIVOT_COLOR,
    belowPivotColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BELOW_PIVOT_COLOR,
    breakoutDownColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_BREAKOUT_DOWN_COLOR,
    noneColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PIVOT_CAMARILLA_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPivot = true,
    showResistance = true,
    showSupport = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPivot = defaultFormatPivot,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-pivot-camarilla-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLinePivotCamarillaSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLinePivotCamarillaSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () => computeLinePivotCamarillaLayout({ data, width, height, padding }),
    [data, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLinePivotCamarillaChart(data);
  const resolvedLabel = ariaLabel ?? 'Camarilla pivot chart';

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLinePivotCamarillaSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 270;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-pivot-camarilla-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={166}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-pivot-camarilla-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-pivot"
          x={tx + 10}
          y={ty + 51}
          fill="#d8b4fe"
          fontSize={11}
          fontWeight={600}
        >
          {`Pivot: ${
            hoverSample.pivot === null
              ? 'n/a'
              : formatPivot(hoverSample.pivot)
          }`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-r"
          x={tx + 10}
          y={ty + 67}
          fill="#fca5a5"
          fontSize={11}
        >
          {`R1/R2: ${
            hoverSample.r1 === null
              ? 'n/a'
              : formatPivot(hoverSample.r1)
          } / ${
            hoverSample.r2 === null
              ? 'n/a'
              : formatPivot(hoverSample.r2)
          }`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-r34"
          x={tx + 10}
          y={ty + 83}
          fill="#ef4444"
          fontSize={11}
        >
          {`R3/R4: ${
            hoverSample.r3 === null
              ? 'n/a'
              : formatPivot(hoverSample.r3)
          } / ${
            hoverSample.r4 === null
              ? 'n/a'
              : formatPivot(hoverSample.r4)
          }`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-s"
          x={tx + 10}
          y={ty + 99}
          fill="#86efac"
          fontSize={11}
        >
          {`S1/S2: ${
            hoverSample.s1 === null
              ? 'n/a'
              : formatPivot(hoverSample.s1)
          } / ${
            hoverSample.s2 === null
              ? 'n/a'
              : formatPivot(hoverSample.s2)
          }`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-s34"
          x={tx + 10}
          y={ty + 115}
          fill="#22c55e"
          fontSize={11}
        >
          {`S3/S4: ${
            hoverSample.s3 === null
              ? 'n/a'
              : formatPivot(hoverSample.s3)
          } / ${
            hoverSample.s4 === null
              ? 'n/a'
              : formatPivot(hoverSample.s4)
          }`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-zone"
          x={tx + 10}
          y={ty + 131}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-pivot-camarilla-tooltip-hl"
          x={tx + 10}
          y={ty + 147}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const pivotHidden = isHidden('pivot') || !showPivot;
  const r1Hidden = isHidden('r1') || !showResistance;
  const r2Hidden = isHidden('r2') || !showResistance;
  const r3Hidden = isHidden('r3') || !showResistance;
  const r4Hidden = isHidden('r4') || !showResistance;
  const s1Hidden = isHidden('s1') || !showSupport;
  const s2Hidden = isHidden('s2') || !showSupport;
  const s3Hidden = isHidden('s3') || !showSupport;
  const s4Hidden = isHidden('s4') || !showSupport;

  const legendItems: Array<{
    id: ChartLinePivotCamarillaSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'pivot', label: 'Pivot', color: pivotColor },
    { id: 'r1', label: 'R1', color: r1Color },
    { id: 'r2', label: 'R2', color: r2Color },
    { id: 'r3', label: 'R3', color: r3Color },
    { id: 'r4', label: 'R4', color: r4Color },
    { id: 's1', label: 'S1', color: s1Color },
    { id: 's2', label: 'S2', color: s2Color },
    { id: 's3', label: 'S3', color: s3Color },
    { id: 's4', label: 'S4', color: s4Color },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-pivot-camarilla"
      data-empty={isEmpty ? 'true' : 'false'}
      data-pivot-final={run.pivotFinal === null ? '' : run.pivotFinal}
      data-breakout-up-count={run.breakoutUpCount}
      data-above-pivot-count={run.abovePivotCount}
      data-at-pivot-count={run.atPivotCount}
      data-below-pivot-count={run.belowPivotCount}
      data-breakout-down-count={run.breakoutDownCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-pivot-camarilla-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-pivot-camarilla-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-pivot-camarilla-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-pivot-camarilla-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-pivot-camarilla-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-pivot-camarilla-grid-line"
                    x1={layout.innerLeft}
                    y1={yp}
                    x2={layout.innerRight}
                    y2={yp}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-pivot-camarilla-axes">
              <line
                data-section="chart-line-pivot-camarilla-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-pivot-camarilla-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-pivot-camarilla-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-pivot-camarilla-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMin)}
              </text>
            </g>
          ) : null}

          {!r4Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-r4-path"
              d={layout.r4Path}
              fill="none"
              stroke={r4Color}
              strokeWidth={1}
              strokeDasharray="4 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla R4"
            />
          ) : null}
          {!r3Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-r3-path"
              d={layout.r3Path}
              fill="none"
              stroke={r3Color}
              strokeWidth={1}
              strokeDasharray="4 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla R3"
            />
          ) : null}
          {!r2Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-r2-path"
              d={layout.r2Path}
              fill="none"
              stroke={r2Color}
              strokeWidth={1}
              strokeDasharray="3 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla R2"
            />
          ) : null}
          {!r1Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-r1-path"
              d={layout.r1Path}
              fill="none"
              stroke={r1Color}
              strokeWidth={1}
              strokeDasharray="3 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla R1"
            />
          ) : null}
          {!s1Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-s1-path"
              d={layout.s1Path}
              fill="none"
              stroke={s1Color}
              strokeWidth={1}
              strokeDasharray="3 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla S1"
            />
          ) : null}
          {!s2Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-s2-path"
              d={layout.s2Path}
              fill="none"
              stroke={s2Color}
              strokeWidth={1}
              strokeDasharray="3 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla S2"
            />
          ) : null}
          {!s3Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-s3-path"
              d={layout.s3Path}
              fill="none"
              stroke={s3Color}
              strokeWidth={1}
              strokeDasharray="4 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla S3"
            />
          ) : null}
          {!s4Hidden ? (
            <path
              data-section="chart-line-pivot-camarilla-s4-path"
              d={layout.s4Path}
              fill="none"
              stroke={s4Color}
              strokeWidth={1}
              strokeDasharray="4 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Camarilla S4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-pivot-camarilla-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-pivot-camarilla-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-pivot-camarilla-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {!pivotHidden ? (
            <path
              data-section="chart-line-pivot-camarilla-pivot-path"
              d={layout.pivotPath}
              fill="none"
              stroke={pivotColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Pivot line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-pivot-camarilla-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-pivot-camarilla-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-pivot={marker.pivot}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    breakoutUpColor,
                    abovePivotColor,
                    atPivotColor,
                    belowPivotColor,
                    breakoutDownColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, pivot ${formatPivot(marker.pivot)}, ${zoneLabelOf(
                    marker.zone,
                  )}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-pivot-camarilla-badge">
              <rect
                data-section="chart-line-pivot-camarilla-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-pivot-camarilla-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Camarilla Pivot`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-pivot-camarilla-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-pivot-camarilla-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-pivot-camarilla-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-pivot-camarilla-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-pivot-camarilla-legend-stats"
            style={{ color: axisColor }}
          >
            {`>=R4 ${run.breakoutUpCount} / above ${run.abovePivotCount} / below ${run.belowPivotCount} / <=S4 ${run.breakoutDownCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLinePivotCamarilla.displayName = 'ChartLinePivotCamarilla';
