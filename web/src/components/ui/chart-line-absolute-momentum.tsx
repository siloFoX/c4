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
 * ChartLineAbsoluteMomentum -- pure-SVG dual-panel chart with the
 * close on top and an Absolute Momentum oscillator on the bottom.
 * Each bar reports `|close[i] - close[i - length]|` -- the magnitude
 * of price travel over the lookback, direction-independent:
 *
 *   raw[i]    = close[i] - close[i - length]
 *   absMom[i] = Math.abs(raw[i])
 *
 * `absMom[i]` is `null` during warmup (`i < length`) or when an input
 * is non-finite. The output is non-negative by construction.
 *
 * Bit-exact anchor: **CONST close=K**: `raw = 0` -> `absMom = 0`
 * (bit-exact). Verified across `K in {0, 1, 5, 100, -3}` and `length
 * in {3, 4, 7, 10}`.
 *
 * Additional bit-exact anchors:
 * - **LINEAR UP** (`close[i] = i + 1`): `raw = (i + 1) - (i - length
 *   + 1) = length` -> `absMom = length` (integer-exact).
 * - **LINEAR DOWN** (`close[i] = N - i`): `raw = (N - i) - (N - i +
 *   length) = -length` -> `absMom = length` (integer-exact).
 * - **ALTERNATING** (`close[i] = i % 2`, `length = 2`): same parity
 *   bars (i and i-2) have the same value, so `raw = 0`, `absMom =
 *   0`. With `length = 1`: bars alternate `|close[i] - close[i-1]| =
 *   1` every step.
 */

export interface ChartLineAbsoluteMomentumPoint {
  x: number;
  close: number;
}

export type ChartLineAbsoluteMomentumZone =
  | 'strong'
  | 'weak'
  | 'flat'
  | 'none';

export type ChartLineAbsoluteMomentumCross = 'up' | 'down' | null;

export type ChartLineAbsoluteMomentumSeriesId = 'price' | 'absMom';

export interface ChartLineAbsoluteMomentumSample {
  index: number;
  x: number;
  close: number;
  raw: number | null;
  absMom: number | null;
  zone: ChartLineAbsoluteMomentumZone;
  crossed: ChartLineAbsoluteMomentumCross;
}

export interface ChartLineAbsoluteMomentumRun {
  series: ChartLineAbsoluteMomentumPoint[];
  length: number;
  strongThreshold: number;
  rawValues: Array<number | null>;
  absMomValues: Array<number | null>;
  samples: ChartLineAbsoluteMomentumSample[];
  strongCount: number;
  weakCount: number;
  flatCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAbsoluteMomentumMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  absMom: number;
  crossed: 'up' | 'down';
}

export interface ChartLineAbsoluteMomentumDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAbsoluteMomentumLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  absMomTop: number;
  absMomBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAbsoluteMomentumDot[];
  absMomPath: string;
  thresholdY: number;
  markers: ChartLineAbsoluteMomentumMarker[];
  priceMin: number;
  priceMax: number;
  absMomMin: number;
  absMomMax: number;
  run: ChartLineAbsoluteMomentumRun;
}

export interface ChartLineAbsoluteMomentumProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAbsoluteMomentumPoint[];
  length?: number;
  strongThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  absMomColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAbsMom?: boolean;
  showMarkers?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAbsoluteMomentumSeriesId[];
  defaultHiddenSeries?: ChartLineAbsoluteMomentumSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAbsoluteMomentumSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineAbsoluteMomentumSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatMom?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_WIDTH = 720;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PADDING = 44;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH = 14;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_STRONG_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_ABS_MOM_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineAbsoluteMomentumFinitePoints(
  data: readonly ChartLineAbsoluteMomentumPoint[] | null | undefined,
): ChartLineAbsoluteMomentumPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAbsoluteMomentumPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAbsoluteMomentumLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineAbsoluteMomentumThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

export interface ChartLineAbsoluteMomentumOptions {
  length?: number;
  strongThreshold?: number;
}

export interface ChartLineAbsoluteMomentumChannels {
  raw: Array<number | null>;
  absMom: Array<number | null>;
}

/** Compute the absolute momentum pipeline. */
export function computeLineAbsoluteMomentum(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineAbsoluteMomentumOptions = {},
): ChartLineAbsoluteMomentumChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { raw: [], absMom: [] };
  }
  const length = normalizeLineAbsoluteMomentumLength(
    options.length,
    DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH,
  );
  const raw: Array<number | null> = [];
  const absMom: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length) {
      raw.push(null);
      absMom.push(null);
      continue;
    }
    const c = closes[i];
    const past = closes[i - length];
    if (
      c == null ||
      past == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(past)
    ) {
      raw.push(null);
      absMom.push(null);
      continue;
    }
    const r = c - past;
    raw.push(r === 0 ? 0 : r);
    const a = Math.abs(r);
    absMom.push(a === 0 ? 0 : a);
  }
  return { raw, absMom };
}

/** Classify an absMom reading. */
export function classifyLineAbsoluteMomentumZone(
  value: number | null,
  strongThreshold: number,
): ChartLineAbsoluteMomentumZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (value >= strongThreshold) return 'strong';
  return 'weak';
}

/**
 * Detect threshold crosses. `'up'` when prev `< strongThreshold` and
 * current `>= strongThreshold`; `'down'` is the mirror.
 */
export function detectLineAbsoluteMomentumCrosses(
  values: readonly (number | null)[],
  strongThreshold: number,
): Array<ChartLineAbsoluteMomentumCross> {
  const out: Array<ChartLineAbsoluteMomentumCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < strongThreshold && v >= strongThreshold) {
      out.push('up');
    } else if (prev >= strongThreshold && v < strongThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineAbsoluteMomentum(
  data: readonly ChartLineAbsoluteMomentumPoint[] | null | undefined,
  options: ChartLineAbsoluteMomentumOptions = {},
): ChartLineAbsoluteMomentumRun {
  const series = getLineAbsoluteMomentumFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineAbsoluteMomentumLength(
    options.length,
    DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH,
  );
  const strongThreshold = normalizeLineAbsoluteMomentumThreshold(
    options.strongThreshold,
    DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_STRONG_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineAbsoluteMomentum(closes, { length });
  const crosses = detectLineAbsoluteMomentumCrosses(
    channels.absMom,
    strongThreshold,
  );
  const samples: ChartLineAbsoluteMomentumSample[] = series.map(
    (point, index) => {
      const value = channels.absMom[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        raw: channels.raw[index] ?? null,
        absMom: value,
        zone: classifyLineAbsoluteMomentumZone(value, strongThreshold),
        crossed: crosses[index] ?? null,
      };
    },
  );
  let strongCount = 0;
  let weakCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series,
    length,
    strongThreshold,
    rawValues: channels.raw,
    absMomValues: channels.absMom,
    samples,
    strongCount,
    weakCount,
    flatCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length + 1,
  };
}

export interface ChartLineAbsoluteMomentumLayoutOptions
  extends ChartLineAbsoluteMomentumOptions {
  data: readonly ChartLineAbsoluteMomentumPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
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

/** Project the run into a dual-panel SVG layout. */
export function computeLineAbsoluteMomentumLayout(
  options: ChartLineAbsoluteMomentumLayoutOptions,
): ChartLineAbsoluteMomentumLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PANEL_GAP;

  const run = runLineAbsoluteMomentum(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.strongThreshold !== undefined
      ? { strongThreshold: options.strongThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const absMomHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const absMomTop = priceBottom + panelGap;
  const absMomBottom = absMomTop + absMomHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  // absMom is non-negative; seed y-axis to include strongThreshold.
  let absMomMax = Math.max(run.strongThreshold * 1.25, 1);
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.absMom) && sample.absMom > absMomMax) {
      absMomMax = sample.absMom;
    }
  }
  if (absMomMax === 0) absMomMax = 1;
  const absMomMin = 0;
  const absMomY = (value: number): number =>
    absMomBottom -
    ((value - absMomMin) / (absMomMax - absMomMin)) * absMomHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAbsoluteMomentumDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const absMomLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAbsoluteMomentumMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.absMom)) return;
    const cx = xAt(index);
    const yc = absMomY(sample.absMom);
    absMomLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        absMom: sample.absMom,
        crossed: sample.crossed,
      });
    }
  });

  const thresholdY = absMomY(run.strongThreshold);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    absMomTop,
    absMomBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    absMomPath: buildLinePath(absMomLinePoints),
    thresholdY,
    markers,
    priceMin,
    priceMax,
    absMomMin,
    absMomMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAbsoluteMomentumChart(
  data: readonly ChartLineAbsoluteMomentumPoint[] | null | undefined,
  options: ChartLineAbsoluteMomentumOptions = {},
): string {
  const run = runLineAbsoluteMomentum(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with an Absolute Momentum oscillator on the ` +
    `lower panel (length ${run.length}, strongThreshold ` +
    `${run.strongThreshold}). Each bar reports ` +
    `|close[i] - close[i - length]|, the magnitude of price travel ` +
    `over the lookback. Across ${total} bars the magnitude was ` +
    `strong on ${run.strongCount}, weak on ${run.weakCount}, flat on ` +
    `${run.flatCount}, and undefined on ${run.noneCount}, with ` +
    `${run.bullishCrossCount} threshold entries and ` +
    `${run.bearishCrossCount} exits.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatMom(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineAbsoluteMomentumZone): string {
  if (zone === 'strong') return 'Strong';
  if (zone === 'weak') return 'Weak';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineAbsoluteMomentumCross): string {
  if (crossed === 'up') return 'Threshold up';
  if (crossed === 'down') return 'Threshold down';
  return '-';
}

/** ChartLineAbsoluteMomentum -- dual-panel pure-SVG chart. */
export const ChartLineAbsoluteMomentum = forwardRef<
  HTMLDivElement,
  ChartLineAbsoluteMomentumProps
>(function ChartLineAbsoluteMomentum(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_LENGTH,
    strongThreshold = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_STRONG_THRESHOLD,
    width = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_WIDTH,
    height = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_HEIGHT,
    padding = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PADDING,
    panelGap = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_PRICE_COLOR,
    absMomColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_ABS_MOM_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ABSOLUTE_MOMENTUM_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAbsMom = true,
    showMarkers = true,
    showThreshold = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatMom = defaultFormatMom,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-absolute-momentum-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAbsoluteMomentumSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAbsoluteMomentumSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAbsoluteMomentumLayout({
        data,
        length,
        strongThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, strongThreshold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineAbsoluteMomentumChart(data, { length, strongThreshold });
  const resolvedLabel =
    ariaLabel ?? `Absolute Momentum chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAbsoluteMomentumSeriesId): void => {
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
    const tooltipW = 250;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-absolute-momentum-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={134}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-absolute-momentum-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-raw"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Raw: ${
            hoverSample.raw === null ? 'n/a' : formatMom(hoverSample.raw)
          }`}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-absmom"
          x={tx + 10}
          y={ty + 71}
          fill="#67e8f9"
          fontSize={11}
          fontWeight={600}
        >
          {`|Momentum|: ${
            hoverSample.absMom === null
              ? 'n/a'
              : formatMom(hoverSample.absMom)
          }`}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-zone"
          x={tx + 10}
          y={ty + 89}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-cross"
          x={tx + 10}
          y={ty + 105}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-absolute-momentum-tooltip-threshold"
          x={tx + 10}
          y={ty + 121}
          fill="#94a3b8"
          fontSize={10}
        >
          {`Threshold: ${formatMom(run.strongThreshold)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const absMomHidden = isHidden('absMom') || !showAbsMom;

  const legendItems: Array<{
    id: ChartLineAbsoluteMomentumSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'absMom', label: '|Momentum|', color: absMomColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-absolute-momentum"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-strong-threshold={run.strongThreshold}
      data-strong-count={run.strongCount}
      data-weak-count={run.weakCount}
      data-flat-count={run.flatCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-absolute-momentum-aria-desc"
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
          data-section="chart-line-absolute-momentum-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-absolute-momentum-empty"
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
          data-section="chart-line-absolute-momentum-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-absolute-momentum-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.absMomBottom -
                  t * (layout.absMomBottom - layout.absMomTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-absolute-momentum-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-absolute-momentum-grid-line"
                      data-panel="absMom"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-absolute-momentum-axes">
              <line
                data-section="chart-line-absolute-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-absolute-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-absolute-momentum-axis"
                data-panel="absMom"
                x1={layout.innerLeft}
                y1={layout.absMomTop}
                x2={layout.innerLeft}
                y2={layout.absMomBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-absolute-momentum-axis"
                data-panel="absMom"
                x1={layout.innerLeft}
                y1={layout.absMomBottom}
                x2={layout.innerRight}
                y2={layout.absMomBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-absolute-momentum-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-absolute-momentum-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-absolute-momentum-tick-label"
                data-panel="absMom"
                x={layout.innerLeft - 6}
                y={layout.absMomTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatMom(layout.absMomMax)}
              </text>
              <text
                data-section="chart-line-absolute-momentum-tick-label"
                data-panel="absMom"
                x={layout.innerLeft - 6}
                y={layout.absMomBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThreshold ? (
            <line
              data-section="chart-line-absolute-momentum-threshold-line"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-absolute-momentum-price-path"
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
            <g data-section="chart-line-absolute-momentum-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-absolute-momentum-dot"
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

          {!absMomHidden ? (
            <path
              data-section="chart-line-absolute-momentum-line"
              d={layout.absMomPath}
              fill="none"
              stroke={absMomColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Absolute Momentum line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-absolute-momentum-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-absolute-momentum-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-abs-mom={marker.absMom}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, |momentum| ${formatMom(marker.absMom)}, ${crossLabelOf(
                    marker.crossed,
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
            <g data-section="chart-line-absolute-momentum-badge">
              <rect
                data-section="chart-line-absolute-momentum-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-absolute-momentum-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Abs Mom ${run.length} / T>=${run.strongThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-absolute-momentum-legend"
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
                data-section="chart-line-absolute-momentum-legend-item"
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
                  data-section="chart-line-absolute-momentum-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-absolute-momentum-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-absolute-momentum-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / weak ${run.weakCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAbsoluteMomentum.displayName = 'ChartLineAbsoluteMomentum';
