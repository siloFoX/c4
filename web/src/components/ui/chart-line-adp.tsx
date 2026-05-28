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
 * ChartLineAdp -- pure-SVG dual-panel chart with the close on top
 * and an Advance-Decline Percent breadth oscillator on the bottom.
 * The breadth oscillator aggregates advancing and declining issues
 * across a fixed-bar lookback:
 *
 *   rollAdv[i] = sum(advances[i - length + 1 .. i])
 *   rollDec[i] = sum(declines[i - length + 1 .. i])
 *   rollTot[i] = sum(total[i    - length + 1 .. i])
 *   adp[i]     = rollTot[i] === 0
 *                  ? null
 *                  : (rollAdv[i] - rollDec[i]) / rollTot[i] * 100
 *
 * `total[i]` falls back to `advances[i] + declines[i]` when the
 * caller does not supply a `totalIssues` field on the point.
 *
 * `adp[i]` is `null` during warmup (`i < length - 1`) and whenever
 * the rolling total is zero (divide-by-zero guard).
 *
 * Bit-exact anchors:
 * - **CONST adv = A, dec = D, total = T, T != 0**: rolling sums
 *   become `L*A`, `L*D`, `L*T`. The `L` factor cancels in the
 *   division, so `adp = (A - D) / T * 100`. Verified bit-exact
 *   for `(A, D, T)` combinations with dyadic ratios:
 *   `(100, 0, 100) -> 100`, `(0, 100, 100) -> -100`,
 *   `(50, 50, 100) -> 0`, `(75, 25, 100) -> 50`,
 *   `(25, 75, 100) -> -50`.
 * - **CONST total = 0**: divide-by-zero guard returns `null`.
 */

export interface ChartLineAdpPoint {
  x: number;
  close: number;
  advances: number;
  declines: number;
  totalIssues?: number;
}

export type ChartLineAdpZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineAdpCross = 'up' | 'down' | null;

export type ChartLineAdpSeriesId = 'price' | 'adp';

export interface ChartLineAdpSample {
  index: number;
  x: number;
  close: number;
  advances: number;
  declines: number;
  total: number;
  rollAdv: number | null;
  rollDec: number | null;
  rollTot: number | null;
  adp: number | null;
  zone: ChartLineAdpZone;
  crossed: ChartLineAdpCross;
}

export interface ChartLineAdpRun {
  series: ChartLineAdpPoint[];
  length: number;
  bullishThreshold: number;
  bearishThreshold: number;
  rollAdvValues: Array<number | null>;
  rollDecValues: Array<number | null>;
  rollTotValues: Array<number | null>;
  adpValues: Array<number | null>;
  samples: ChartLineAdpSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAdpMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  adp: number;
  crossed: 'up' | 'down';
}

export interface ChartLineAdpDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdpLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  adpTop: number;
  adpBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdpDot[];
  adpPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineAdpMarker[];
  priceMin: number;
  priceMax: number;
  adpMin: number;
  adpMax: number;
  run: ChartLineAdpRun;
}

export interface ChartLineAdpProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdpPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adpColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdp?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdpSeriesId[];
  defaultHiddenSeries?: ChartLineAdpSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdpSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAdpSample }) => void;
  formatPrice?: (value: number) => string;
  formatAdp?: (value: number) => string;
  formatCount?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADP_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADP_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADP_PADDING = 44;
export const DEFAULT_CHART_LINE_ADP_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADP_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADP_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADP_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADP_LENGTH = 10;
export const DEFAULT_CHART_LINE_ADP_BULLISH_THRESHOLD = 30;
export const DEFAULT_CHART_LINE_ADP_BEARISH_THRESHOLD = -30;
export const DEFAULT_CHART_LINE_ADP_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADP_ADP_COLOR = '#f43f5e';
export const DEFAULT_CHART_LINE_ADP_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADP_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADP_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ADP_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ADP_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADP_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite required fields. */
export function getLineAdpFinitePoints(
  data: readonly ChartLineAdpPoint[] | null | undefined,
): ChartLineAdpPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdpPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.advances) &&
      isFiniteNumber(point.declines) &&
      point.advances >= 0 &&
      point.declines >= 0
    ) {
      const tot = isFiniteNumber(point.totalIssues)
        ? point.totalIssues
        : point.advances + point.declines;
      if (tot >= 0) {
        out.push({
          x: point.x,
          close: point.close,
          advances: point.advances,
          declines: point.declines,
          totalIssues: tot,
        });
      }
    }
  }
  return out;
}

/** Coerce a positive integer lookback length (>= 1). */
export function normalizeLineAdpLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in [-100, 100]. */
export function normalizeLineAdpThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= -100 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Rolling sum across a window of length bars. */
export function applyLineAdpRollingSum(
  values: readonly number[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? posZero(sum) : null);
  }
  return out;
}

export interface LineAdpChannels {
  rollAdv: Array<number | null>;
  rollDec: Array<number | null>;
  rollTot: Array<number | null>;
  adp: Array<number | null>;
}

export function computeLineAdp(
  series: readonly ChartLineAdpPoint[] | null | undefined,
  options: { length?: number } = {},
): LineAdpChannels {
  const cleaned = getLineAdpFinitePoints(series);
  if (cleaned.length === 0) {
    return { rollAdv: [], rollDec: [], rollTot: [], adp: [] };
  }
  const length = normalizeLineAdpLength(
    options.length,
    DEFAULT_CHART_LINE_ADP_LENGTH,
  );

  const advs = cleaned.map((p) => p.advances);
  const decs = cleaned.map((p) => p.declines);
  const tots = cleaned.map((p) => p.totalIssues!);

  const rollAdv = applyLineAdpRollingSum(advs, length);
  const rollDec = applyLineAdpRollingSum(decs, length);
  const rollTot = applyLineAdpRollingSum(tots, length);

  const adp: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = rollAdv[i];
    const d = rollDec[i];
    const t = rollTot[i];
    if (a == null || d == null || t == null) {
      adp.push(null);
      continue;
    }
    if (t === 0) {
      adp.push(null);
      continue;
    }
    const raw = ((a - d) / t) * 100;
    adp.push(Number.isFinite(raw) ? posZero(raw) : null);
  }

  return { rollAdv, rollDec, rollTot, adp };
}

export function classifyLineAdpZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineAdpZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= bullishThreshold) return 'bullish';
  if (value <= bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineAdpCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineAdpCross[] {
  const out: ChartLineAdpCross[] = [];
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
    if (prev < bullishThreshold && v >= bullishThreshold) {
      out.push('up');
    } else if (prev > bearishThreshold && v <= bearishThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineAdp(
  data: ChartLineAdpPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineAdpRun {
  const cleaned = getLineAdpFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdpLength(
    options.length,
    DEFAULT_CHART_LINE_ADP_LENGTH,
  );
  const bullishThreshold = normalizeLineAdpThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_ADP_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineAdpThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_ADP_BEARISH_THRESHOLD,
  );

  const channels = computeLineAdp(series, { length });
  const crosses = detectLineAdpCrosses(
    channels.adp,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineAdpSample[] = series.map((p, i) => {
    const total = p.totalIssues ?? p.advances + p.declines;
    const rollAdv = channels.rollAdv[i] ?? null;
    const rollDec = channels.rollDec[i] ?? null;
    const rollTot = channels.rollTot[i] ?? null;
    const adp = channels.adp[i] ?? null;
    const zone = classifyLineAdpZone(
      adp,
      bullishThreshold,
      bearishThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      advances: p.advances,
      declines: p.declines,
      total,
      rollAdv,
      rollDec,
      rollTot,
      adp,
      zone,
      crossed,
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series = [],
    length,
    bullishThreshold,
    bearishThreshold,
    rollAdvValues: channels.rollAdv,
    rollDecValues: channels.rollDec,
    rollTotValues: channels.rollTot,
    adpValues: channels.adp,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineAdpLayoutOptions {
  data: ChartLineAdpPoint[];
  length?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdpLayout(
  opts: ComputeLineAdpLayoutOptions,
): ChartLineAdpLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADP_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADP_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ADP_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ADP_PANEL_GAP;

  const run = runLineAdp(opts.data, {
    length: opts.length ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const adpTop = priceBottom + panelGap;
  const adpBottom = priceBottom + panelGap + usable * 0.45;

  const adpMin = -100;
  const adpMax = 100;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      adpTop,
      adpBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      adpPath: '',
      bullishY: adpTop,
      bearishY: adpBottom,
      zeroY: (adpTop + adpBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      adpMin,
      adpMax,
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
  const syAdp = (y: number): number =>
    adpBottom - ((y - adpMin) / (adpMax - adpMin)) * (adpBottom - adpTop);

  let pricePath = '';
  const priceDots: ChartLineAdpDot[] = [];
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

  let adpPath = '';
  let firstA = true;
  for (const s of run.samples) {
    if (s.adp == null) {
      firstA = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syAdp(s.adp);
    adpPath += `${firstA ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstA = false;
  }

  const markers: ChartLineAdpMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.adp == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syAdp(s.adp),
      close: s.close,
      adp: s.adp,
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
    adpTop,
    adpBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    adpPath: adpPath.trim(),
    bullishY: syAdp(run.bullishThreshold),
    bearishY: syAdp(run.bearishThreshold),
    zeroY: syAdp(0),
    markers,
    priceMin,
    priceMax,
    adpMin,
    adpMax,
    run,
  };
}

export function describeLineAdpChart(
  data: ChartLineAdpPoint[],
  options: {
    length?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineAdpFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdpLength(
    options.length,
    DEFAULT_CHART_LINE_ADP_LENGTH,
  );
  const bullishThreshold = normalizeLineAdpThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_ADP_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineAdpThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_ADP_BEARISH_THRESHOLD,
  );
  return (
    `Advance-Decline Percent chart over ${cleaned.length} bars ` +
    `(length ${length}, bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the ` +
    `close; bottom panel renders rolling advances minus rolling ` +
    `declines over rolling total issues, scaled to percent.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultAdpFormatter = (value: number): string => formatNumber(value);
const defaultCountFormatter = (value: number): string =>
  formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAdp = forwardRef<
  HTMLDivElement,
  ChartLineAdpProps
>(function ChartLineAdp(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADP_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_ADP_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_ADP_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADP_WIDTH,
    height = DEFAULT_CHART_LINE_ADP_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADP_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADP_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADP_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADP_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADP_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADP_PRICE_COLOR,
    adpColor = DEFAULT_CHART_LINE_ADP_ADP_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADP_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADP_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ADP_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ADP_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADP_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADP_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdp = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatAdp = defaultAdpFormatter,
    formatCount = defaultCountFormatter,
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
    () => getLineAdpFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdpLayout({
        data: cleaned,
        length,
        bullishThreshold,
        bearishThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      bullishThreshold,
      bearishThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdpSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdpSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdpSeriesId,
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
        data-section="chart-line-adp-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdpChart(cleaned, {
      length,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showAdpLine = !hidden.has('adp') && showAdp;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickAdpValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickAdpValues.push(
      layout.adpMin + ((layout.adpMax - layout.adpMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Advance-Decline Percent chart'}
      aria-describedby={descId}
      data-section="chart-line-adp"
      data-length={length}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-adp-title"
      >
        {ariaLabel ?? 'Advance-Decline Percent chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adp-aria-desc"
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
        data-section="chart-line-adp-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adp-grid">
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
                  data-section="chart-line-adp-grid-line-price"
                />
              );
            })}
            {tickAdpValues.map((v, i) => {
              const y =
                layout.adpBottom -
                ((v - layout.adpMin) /
                  (layout.adpMax - layout.adpMin)) *
                  (layout.adpBottom - layout.adpTop);
              return (
                <line
                  key={`grid-adp-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-adp-grid-line-adp"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adp-axes">
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
              y1={layout.adpTop}
              x2={layout.innerLeft}
              y2={layout.adpBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.adpBottom}
              x2={layout.innerRight}
              y2={layout.adpBottom}
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
                  data-section="chart-line-adp-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickAdpValues.map((v, i) => {
              const y =
                layout.adpBottom -
                ((v - layout.adpMin) /
                  (layout.adpMax - layout.adpMin)) *
                  (layout.adpBottom - layout.adpTop);
              return (
                <text
                  key={`tick-adp-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-adp-tick-adp"
                >
                  {formatAdp(v)}
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
            data-section="chart-line-adp-zero-line"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-adp-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-adp-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-adp-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adp-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adp-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adp-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdpLine ? (
          <path
            d={layout.adpPath}
            stroke={adpColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adp-line"
          />
        ) : null}

        {showMarkers && showAdpLine ? (
          <g data-section="chart-line-adp-markers">
            {layout.markers.map((m) => (
              <circle
                key={`adp-marker-${m.index}`}
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
                data-section="chart-line-adp-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adp-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.adpBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-adp-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adp-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={190}
                  height={150}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-adv"
                >
                  adv {formatCount(tooltipSample.advances)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-dec"
                >
                  dec {formatCount(tooltipSample.declines)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-total"
                >
                  total {formatCount(tooltipSample.total)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-rollAdv"
                >
                  rollAdv{' '}
                  {tooltipSample.rollAdv == null
                    ? '--'
                    : formatCount(tooltipSample.rollAdv)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-rollDec"
                >
                  rollDec{' '}
                  {tooltipSample.rollDec == null
                    ? '--'
                    : formatCount(tooltipSample.rollDec)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-rollTot"
                >
                  rollTot{' '}
                  {tooltipSample.rollTot == null
                    ? '--'
                    : formatCount(tooltipSample.rollTot)}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-adp"
                >
                  adp{' '}
                  {tooltipSample.adp == null
                    ? '--'
                    : formatAdp(tooltipSample.adp)}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adp-tooltip-zone"
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
          data-section="chart-line-adp-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | bull {bullishThreshold} | bear{' '}
          {bearishThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adp-legend"
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
            data-series-id="adp"
            aria-pressed={!hidden.has('adp')}
            onClick={() => handleLegendClick('adp')}
            onKeyDown={(e) => handleLegendKey(e, 'adp')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('adp') ? 0.4 : 1,
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
                background: adpColor,
                borderRadius: 2,
              }}
            />
            adp
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAdp.displayName = 'ChartLineAdp';
