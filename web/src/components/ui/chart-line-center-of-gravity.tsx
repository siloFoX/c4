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
 * ChartLineCenterOfGravity -- pure-SVG dual-panel chart with the
 * Ehlers Center of Gravity (CG) oscillator panel beneath the
 * close.
 *
 * Definition:
 *
 *   num = sum_{j = 0..L - 1} (1 + j) * close[i - j]
 *   den = sum_{j = 0..L - 1} close[i - j]
 *   CG[i] = -num / den + (L + 1) / 2
 *
 * The shift `(L + 1) / 2` recentres the centroid so a flat
 * input yields zero.
 *
 * Bit-exact anchor on integer fixtures:
 *
 *   * `CONST_FLAT (close == K, K != 0)` ->
 *     `num = K * L (L + 1) / 2`, `den = K * L`,
 *     `num / den = (L + 1) / 2` (when `K * L (L + 1) / 2` and
 *     `K * L` are exactly representable -- true for any
 *     small integer or simple fractional `K`),
 *     so `CG = -(L + 1) / 2 + (L + 1) / 2 = 0` bit-exact.
 *   * `K == 0`: `num = den = 0` -> division by zero -> `null`.
 *
 * Layout:
 *
 *   The chart is split into two stacked panels: the top panel
 *   plots the close, the bottom plots the CG oscillator with a
 *   zero baseline. A 12 px gap separates the two panels by
 *   default.
 */

export interface ChartLineCenterOfGravityPoint {
  x: number;
  close: number;
}

export type ChartLineCenterOfGravityZone =
  | 'positive'
  | 'zero'
  | 'negative'
  | 'none';

export type ChartLineCenterOfGravitySeriesId = 'price' | 'cg';

export interface ChartLineCenterOfGravitySample {
  index: number;
  x: number;
  close: number;
  cg: number | null;
  zone: ChartLineCenterOfGravityZone;
}

export interface ChartLineCenterOfGravityRun {
  series: ChartLineCenterOfGravityPoint[];
  length: number;
  cg: Array<number | null>;
  samples: ChartLineCenterOfGravitySample[];
  cgFinal: number | null;
  positiveCount: number;
  zeroCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineCenterOfGravityMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  cg: number;
  zone: ChartLineCenterOfGravityZone;
}

export interface ChartLineCenterOfGravityDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCenterOfGravityLayout {
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
  priceDots: ChartLineCenterOfGravityDot[];
  cgPath: string;
  markers: ChartLineCenterOfGravityMarker[];
  priceMin: number;
  priceMax: number;
  cgMin: number;
  cgMax: number;
  zeroLineY: number;
  run: ChartLineCenterOfGravityRun;
}

export interface ChartLineCenterOfGravityProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCenterOfGravityPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cgColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCg?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCenterOfGravitySeriesId[];
  defaultHiddenSeries?: ChartLineCenterOfGravitySeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCenterOfGravitySeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineCenterOfGravitySample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatCg?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_WIDTH = 720;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PADDING = 44;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH = 10;
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_CG_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_ZERO_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCenterOfGravityFinitePoints(
  data: readonly ChartLineCenterOfGravityPoint[] | null | undefined,
): ChartLineCenterOfGravityPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCenterOfGravityPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the length to an integer of at least 2. */
export function normalizeLineCenterOfGravityLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Compute the Ehlers Center of Gravity oscillator per bar. Bars
 * before `length - 1` are `null`; non-finite closes inside the
 * window also null the bar. When the moving sum of the closes is
 * zero the result is `null` (singular). The shift `(L + 1) / 2`
 * recentres the centroid so a constant input collapses to zero.
 */
export function computeLineCenterOfGravity(
  closes: readonly number[] | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const L = normalizeLineCenterOfGravityLength(
    length,
    DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH,
  );
  const out: Array<number | null> = [];
  const shift = (L + 1) / 2;
  for (let i = 0; i < closes.length; i += 1) {
    if (i < L - 1) {
      out.push(null);
      continue;
    }
    let num = 0;
    let den = 0;
    let ok = true;
    for (let j = 0; j < L; j += 1) {
      const c = closes[i - j];
      if (!isFiniteNumber(c)) {
        ok = false;
        break;
      }
      num += (1 + j) * c;
      den += c;
    }
    if (!ok || den === 0) {
      out.push(null);
      continue;
    }
    out.push(-num / den + shift);
  }
  return out;
}

/** Classify a CG reading against the zero line. */
export function classifyLineCenterOfGravityZone(
  cg: number | null,
): ChartLineCenterOfGravityZone {
  if (!isFiniteNumber(cg)) return 'none';
  if (cg > 0) return 'positive';
  if (cg < 0) return 'negative';
  return 'zero';
}

export interface ChartLineCenterOfGravityOptions {
  length?: number;
}

/** Run the full Center of Gravity pipeline plus sample classification. */
export function runLineCenterOfGravity(
  data: readonly ChartLineCenterOfGravityPoint[] | null | undefined,
  options: ChartLineCenterOfGravityOptions = {},
): ChartLineCenterOfGravityRun {
  const series = getLineCenterOfGravityFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineCenterOfGravityLength(
    options.length,
    DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const cg = computeLineCenterOfGravity(closes, length);
  const samples: ChartLineCenterOfGravitySample[] = series.map(
    (point, index) => {
      const value = cg[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        cg: value,
        zone: classifyLineCenterOfGravityZone(value),
      };
    },
  );
  let positiveCount = 0;
  let zeroCount = 0;
  let negativeCount = 0;
  let cgFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    if (isFiniteNumber(sample.cg)) cgFinal = sample.cg;
  }
  return {
    series = [],
    length,
    cg,
    samples,
    cgFinal,
    positiveCount,
    zeroCount,
    negativeCount,
    ok: series.length >= length,
  };
}

export interface ChartLineCenterOfGravityLayoutOptions
  extends ChartLineCenterOfGravityOptions {
  data: readonly ChartLineCenterOfGravityPoint[] | null | undefined;
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
export function computeLineCenterOfGravityLayout(
  options: ChartLineCenterOfGravityLayoutOptions,
): ChartLineCenterOfGravityLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PANEL_GAP;

  const run = runLineCenterOfGravity(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  // Split the inner box into two panels: 60% price, 40% oscillator
  // (with `panelGap` between).
  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const oscHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const oscTop = priceBottom + panelGap;
  const oscBottom = oscTop + oscHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  // Price panel scale
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

  // Oscillator panel scale: symmetric around zero where possible.
  let cgMin = Infinity;
  let cgMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.cg)) {
      if (sample.cg < cgMin) cgMin = sample.cg;
      if (sample.cg > cgMax) cgMax = sample.cg;
    }
  }
  if (!Number.isFinite(cgMin) || !Number.isFinite(cgMax)) {
    cgMin = -1;
    cgMax = 1;
  }
  if (cgMin === cgMax) {
    cgMin -= 1;
    cgMax += 1;
  }
  // Ensure zero is included in the visible range.
  if (cgMin > 0) cgMin = 0;
  if (cgMax < 0) cgMax = 0;
  const cgY = (value: number): number =>
    oscBottom - ((value - cgMin) / (cgMax - cgMin)) * oscHeight;
  const zeroLineY = cgY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCenterOfGravityDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cgLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCenterOfGravityMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cg)) return;
    const cx = xAt(index);
    const yc = cgY(sample.cg);
    cgLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      cg: sample.cg,
      zone: sample.zone,
    });
  });

  return {
    ok,
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
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cgPath: buildLinePath(cgLinePoints),
    markers,
    priceMin,
    priceMax,
    cgMin,
    cgMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCenterOfGravityChart(
  data: readonly ChartLineCenterOfGravityPoint[] | null | undefined,
  options: ChartLineCenterOfGravityOptions = {},
): string {
  const run = runLineCenterOfGravity(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cgFinal === null ? 'n/a' : run.cgFinal.toFixed(4);
  return (
    `Dual-panel chart with an Ehlers Center of Gravity ` +
    `oscillator beneath the close (length ${run.length}): the ` +
    `oscillator is CG = -sum((1 + j) * close[i - j]) / ` +
    `sum(close[i - j]) + (L + 1) / 2 over a window of ${run.length} ` +
    `bars, with the (L + 1) / 2 shift recentring the centroid so ` +
    `a flat close collapses to zero. Across ${total} bars the CG ` +
    `is positive on ${run.positiveCount}, exactly zero on ` +
    `${run.zeroCount}, and negative on ${run.negativeCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatCg(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineCenterOfGravityZone,
  positiveColor: string,
  negativeColor: string,
  zeroColor: string,
  noneColor: string,
): string {
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'zero') return zeroColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineCenterOfGravityZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

/**
 * ChartLineCenterOfGravity -- dual-panel pure-SVG Ehlers Center
 * of Gravity oscillator chart.
 */
export const ChartLineCenterOfGravity = forwardRef<
  HTMLDivElement,
  ChartLineCenterOfGravityProps
>(function ChartLineCenterOfGravity(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_LENGTH,
    width = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_WIDTH,
    height = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_HEIGHT,
    padding = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PADDING,
    panelGap = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_PRICE_COLOR,
    cgColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_CG_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_ZERO_COLOR,
    noneColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CENTER_OF_GRAVITY_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCg = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatCg = defaultFormatCg,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-center-of-gravity-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCenterOfGravitySeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCenterOfGravitySeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCenterOfGravityLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCenterOfGravityChart(data, { length });
  const resolvedLabel =
    ariaLabel ??
    `Ehlers Center of Gravity chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCenterOfGravitySeriesId): void => {
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
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-center-of-gravity-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={88}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-center-of-gravity-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-center-of-gravity-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-center-of-gravity-tooltip-cg"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CG: ${
            hoverSample.cg === null ? 'n/a' : formatCg(hoverSample.cg)
          }`}
        </text>
        <text
          data-section="chart-line-center-of-gravity-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const cgHidden = isHidden('cg') || !showCg;

  const legendItems: Array<{
    id: ChartLineCenterOfGravitySeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cg', label: 'Center of Gravity', color: cgColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-center-of-gravity"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-cg-final={run.cgFinal === null ? '' : run.cgFinal}
      data-positive-count={run.positiveCount}
      data-zero-count={run.zeroCount}
      data-negative-count={run.negativeCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-center-of-gravity-aria-desc"
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
          data-section="chart-line-center-of-gravity-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-center-of-gravity-empty"
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
          data-section="chart-line-center-of-gravity-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-center-of-gravity-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yo =
                  layout.oscBottom -
                  t * (layout.oscBottom - layout.oscTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-center-of-gravity-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-center-of-gravity-grid-line"
                      data-panel="osc"
                      x1={layout.innerLeft}
                      y1={yo}
                      x2={layout.innerRight}
                      y2={yo}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-center-of-gravity-axes">
              <line
                data-section="chart-line-center-of-gravity-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-center-of-gravity-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-center-of-gravity-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscTop}
                x2={layout.innerLeft}
                y2={layout.oscBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-center-of-gravity-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscBottom}
                x2={layout.innerRight}
                y2={layout.oscBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-center-of-gravity-tick-label"
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
                data-section="chart-line-center-of-gravity-tick-label"
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
                data-section="chart-line-center-of-gravity-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCg(layout.cgMax)}
              </text>
              <text
                data-section="chart-line-center-of-gravity-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCg(layout.cgMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-center-of-gravity-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-center-of-gravity-price-path"
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
            <g data-section="chart-line-center-of-gravity-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-center-of-gravity-dot"
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

          {!cgHidden ? (
            <path
              data-section="chart-line-center-of-gravity-line"
              d={layout.cgPath}
              fill="none"
              stroke={cgColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Center of Gravity line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-center-of-gravity-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-center-of-gravity-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-cg={marker.cg}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    positiveColor,
                    negativeColor,
                    zeroColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, CG ${formatCg(marker.cg)}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-center-of-gravity-badge">
              <rect
                data-section="chart-line-center-of-gravity-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={130}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-center-of-gravity-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CG length ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-center-of-gravity-legend"
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
                data-section="chart-line-center-of-gravity-legend-item"
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
                  data-section="chart-line-center-of-gravity-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-center-of-gravity-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-center-of-gravity-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / zero ${run.zeroCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCenterOfGravity.displayName = 'ChartLineCenterOfGravity';
