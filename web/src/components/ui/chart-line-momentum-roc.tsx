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
 * ChartLineMomentumRoc -- pure-SVG dual-panel chart with the
 * close on the top panel and the Rate-of-Change (ROC) momentum
 * panel beneath. ROC measures price change relative to the bar
 * `length` periods ago:
 *
 *   ROC[i] = (close[i] - close[i - length]) /
 *            close[i - length] * 100
 *
 * Defaults: `length = 10`. Bars before `i = length` are warmup
 * (`ROC = null`). When `close[i - length] == 0` ROC is `null`
 * (divide-by-zero guard).
 *
 * Bit-exact anchors:
 *
 *   * **CONST close** (`close = K`, `K != 0`): the lookback
 *     close equals the current close, so the numerator is zero
 *     and `ROC = 0` exactly past warmup. `-0` from
 *     `0 / negative_K` is normalized to `+0` so the bit-exact
 *     zero anchor holds for negative K too.
 *   * **GEOMETRIC close = 2^i** (`close[i] = 2 ** i`): every
 *     close is an exact power of two (representable in IEEE
 *     754). For any `i >= length`,
 *     `close[i] - close[i - length] = 2^(i-length) * (2^length - 1)`
 *     and `close[i - length] = 2^(i-length)`. So
 *     `ROC = (2^length - 1) * 100` -- a constant integer
 *     bit-exact past warmup. The test sweeps `length` in
 *     `{2, 3, 4, 5}` (small enough to keep `2^length` exact).
 *
 * `close = 0` past warmup is the singular case: the lookback
 * close is zero so ROC is `null`.
 */

export interface ChartLineMomentumRocPoint {
  x: number;
  close: number;
}

export type ChartLineMomentumRocZone =
  | 'strong-up'
  | 'above'
  | 'below'
  | 'strong-down'
  | 'at'
  | 'none';

export type ChartLineMomentumRocSeriesId = 'price' | 'roc';

export interface ChartLineMomentumRocSample {
  index: number;
  x: number;
  close: number;
  roc: number | null;
  zone: ChartLineMomentumRocZone;
}

export interface ChartLineMomentumRocRun {
  series: ChartLineMomentumRocPoint[];
  length: number;
  roc: Array<number | null>;
  samples: ChartLineMomentumRocSample[];
  rocFinal: number | null;
  strongUpCount: number;
  aboveCount: number;
  belowCount: number;
  strongDownCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMomentumRocMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  roc: number;
  zone: ChartLineMomentumRocZone;
}

export interface ChartLineMomentumRocDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumRocLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  rocTop: number;
  rocBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineMomentumRocDot[];
  rocPath: string;
  markers: ChartLineMomentumRocMarker[];
  priceMin: number;
  priceMax: number;
  rocMin: number;
  rocMax: number;
  zeroBaselineY: number;
  run: ChartLineMomentumRocRun;
}

export interface ChartLineMomentumRocProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumRocPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rocColor?: string;
  strongUpColor?: string;
  aboveColor?: string;
  belowColor?: string;
  strongDownColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRoc?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumRocSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumRocSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumRocSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineMomentumRocSample }) => void;
  formatPrice?: (value: number) => string;
  formatRoc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MOMENTUM_ROC_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_ROC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_STRONG_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_STRONG_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_AT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MOMENTUM_ROC_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineMomentumRocFinitePoints(
  data: readonly ChartLineMomentumRocPoint[] | null | undefined,
): ChartLineMomentumRocPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumRocPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineMomentumRocLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface ChartLineMomentumRocOptions {
  length?: number;
}

/**
 * Compute ROC per bar. Bars before `i = length` are `null`
 * (need a valid lookback close). When `close[i - length] == 0`
 * ROC is `null`.
 */
export function computeLineMomentumRoc(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineMomentumRocOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const length = normalizeLineMomentumRocLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    const curr = closes[i];
    const past = closes[i - length];
    if (
      curr == null ||
      past == null ||
      !isFiniteNumber(curr) ||
      !isFiniteNumber(past) ||
      past === 0
    ) {
      out.push(null);
      continue;
    }
    const raw = ((curr - past) / past) * 100;
    // Normalize -0 (which arises from 0 / negative past) to +0.
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Classify a ROC reading. */
export function classifyLineMomentumRocZone(
  value: number | null,
): ChartLineMomentumRocZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 10) return 'strong-up';
  if (value > 0) return 'above';
  if (value === 0) return 'at';
  if (value > -10) return 'below';
  return 'strong-down';
}

/** Run the full ROC pipeline plus sample classification. */
export function runLineMomentumRoc(
  data: readonly ChartLineMomentumRocPoint[] | null | undefined,
  options: ChartLineMomentumRocOptions = {},
): ChartLineMomentumRocRun {
  const series = getLineMomentumRocFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineMomentumRocLength(
    options.length,
    DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const roc = computeLineMomentumRoc(closes, { length });
  const samples: ChartLineMomentumRocSample[] = series.map((point, index) => {
    const value = roc[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      roc: value,
      zone: classifyLineMomentumRocZone(value),
    };
  });
  let strongUpCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let strongDownCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let rocFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-up') strongUpCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'strong-down') strongDownCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.roc)) rocFinal = sample.roc;
  }
  return {
    series = [],
    length,
    roc,
    samples,
    rocFinal,
    strongUpCount,
    aboveCount,
    belowCount,
    strongDownCount,
    atCount,
    noneCount,
    ok: series.length > length,
  };
}

export interface ChartLineMomentumRocLayoutOptions
  extends ChartLineMomentumRocOptions {
  data: readonly ChartLineMomentumRocPoint[] | null | undefined;
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
export function computeLineMomentumRocLayout(
  options: ChartLineMomentumRocLayoutOptions,
): ChartLineMomentumRocLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MOMENTUM_ROC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MOMENTUM_ROC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MOMENTUM_ROC_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_MOMENTUM_ROC_PANEL_GAP;

  const run = runLineMomentumRoc(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const rocHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const rocTop = priceBottom + panelGap;
  const rocBottom = rocTop + rocHeight;

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

  // ROC oscillates around 0; pad to at least [-10, 10] for visual
  // context.
  let rocMin = -10;
  let rocMax = 10;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.roc)) {
      if (sample.roc < rocMin) rocMin = sample.roc;
      if (sample.roc > rocMax) rocMax = sample.roc;
    }
  }
  if (rocMin === rocMax) {
    rocMin -= 1;
    rocMax += 1;
  }
  const rocY = (value: number): number =>
    rocBottom - ((value - rocMin) / (rocMax - rocMin)) * rocHeight;
  const zeroBaselineY = rocY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineMomentumRocDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const rocLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMomentumRocMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.roc)) return;
    const cx = xAt(index);
    const yc = rocY(sample.roc);
    rocLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      roc: sample.roc,
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
    rocTop,
    rocBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    rocPath: buildLinePath(rocLinePoints),
    markers,
    priceMin,
    priceMax,
    rocMin,
    rocMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineMomentumRocChart(
  data: readonly ChartLineMomentumRocPoint[] | null | undefined,
  options: ChartLineMomentumRocOptions = {},
): string {
  const run = runLineMomentumRoc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.rocFinal === null ? 'n/a' : run.rocFinal.toFixed(4);
  return (
    `Dual-panel chart with a momentum Rate-of-Change (ROC) ` +
    `oscillator panel beneath the close (length ${run.length}). ` +
    `ROC = (close - close[i - length]) / close[i - length] * 100. ` +
    `Across ${total} bars ROC is strongly up (>= 10) on ` +
    `${run.strongUpCount}, mildly up (0..10) on ${run.aboveCount}, ` +
    `at zero on ${run.atCount}, mildly down (-10..0) on ` +
    `${run.belowCount}, strongly down (<= -10) on ` +
    `${run.strongDownCount}, and undefined on ${run.noneCount}. ` +
    `The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatRoc(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineMomentumRocZone,
  strongUpColor: string,
  aboveColor: string,
  belowColor: string,
  strongDownColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-up') return strongUpColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'strong-down') return strongDownColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineMomentumRocZone): string {
  if (zone === 'strong-up') return 'Strong Up';
  if (zone === 'above') return 'Above Zero';
  if (zone === 'below') return 'Below Zero';
  if (zone === 'strong-down') return 'Strong Down';
  if (zone === 'at') return 'At Zero';
  return 'n/a';
}

/** ChartLineMomentumRoc -- dual-panel pure-SVG ROC chart. */
export const ChartLineMomentumRoc = forwardRef<
  HTMLDivElement,
  ChartLineMomentumRocProps
>(function ChartLineMomentumRoc(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_MOMENTUM_ROC_LENGTH,
    width = DEFAULT_CHART_LINE_MOMENTUM_ROC_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_ROC_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_ROC_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_ROC_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_ROC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_ROC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_ROC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_PRICE_COLOR,
    rocColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_ROC_COLOR,
    strongUpColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_STRONG_UP_COLOR,
    aboveColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_BELOW_COLOR,
    strongDownColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_STRONG_DOWN_COLOR,
    atColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_MOMENTUM_ROC_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRoc = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBaseline = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatRoc = defaultFormatRoc,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-momentum-roc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMomentumRocSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMomentumRocSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMomentumRocLayout({
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
    ariaDescription ?? describeLineMomentumRocChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Momentum ROC chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMomentumRocSeriesId): void => {
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
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-momentum-roc-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={86}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-momentum-roc-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-momentum-roc-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-momentum-roc-tooltip-roc"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`ROC %: ${
            hoverSample.roc === null
              ? 'n/a'
              : formatRoc(hoverSample.roc)
          }`}
        </text>
        <text
          data-section="chart-line-momentum-roc-tooltip-zone"
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
  const rocHidden = isHidden('roc') || !showRoc;

  const legendItems: Array<{
    id: ChartLineMomentumRocSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'roc', label: 'ROC %', color: rocColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-momentum-roc"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-roc-final={run.rocFinal === null ? '' : run.rocFinal}
      data-strong-up-count={run.strongUpCount}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-strong-down-count={run.strongDownCount}
      data-at-count={run.atCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-momentum-roc-aria-desc"
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
          data-section="chart-line-momentum-roc-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-momentum-roc-empty"
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
          data-section="chart-line-momentum-roc-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-momentum-roc-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.rocBottom -
                  t * (layout.rocBottom - layout.rocTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-momentum-roc-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-momentum-roc-grid-line"
                      data-panel="roc"
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
            <g data-section="chart-line-momentum-roc-axes">
              <line
                data-section="chart-line-momentum-roc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-roc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-roc-axis"
                data-panel="roc"
                x1={layout.innerLeft}
                y1={layout.rocTop}
                x2={layout.innerLeft}
                y2={layout.rocBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-momentum-roc-axis"
                data-panel="roc"
                x1={layout.innerLeft}
                y1={layout.rocBottom}
                x2={layout.innerRight}
                y2={layout.rocBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-momentum-roc-tick-label"
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
                data-section="chart-line-momentum-roc-tick-label"
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
                data-section="chart-line-momentum-roc-tick-label"
                data-panel="roc"
                x={layout.innerLeft - 6}
                y={layout.rocTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatRoc(layout.rocMax)}
              </text>
              <text
                data-section="chart-line-momentum-roc-tick-label"
                data-panel="roc"
                x={layout.innerLeft - 6}
                y={layout.rocBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatRoc(layout.rocMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-momentum-roc-baseline"
              x1={layout.innerLeft}
              y1={layout.zeroBaselineY}
              x2={layout.innerRight}
              y2={layout.zeroBaselineY}
              stroke={baselineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-momentum-roc-price-path"
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
            <g data-section="chart-line-momentum-roc-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-momentum-roc-dot"
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

          {!rocHidden ? (
            <path
              data-section="chart-line-momentum-roc-line"
              d={layout.rocPath}
              fill="none"
              stroke={rocColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`ROC line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-momentum-roc-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-momentum-roc-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-roc={marker.roc}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongUpColor,
                    aboveColor,
                    belowColor,
                    strongDownColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, ROC ${formatRoc(marker.roc)}, ${zoneLabelOf(
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
            <g data-section="chart-line-momentum-roc-badge">
              <rect
                data-section="chart-line-momentum-roc-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-momentum-roc-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ROC ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-momentum-roc-legend"
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
                data-section="chart-line-momentum-roc-legend-item"
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
                  data-section="chart-line-momentum-roc-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-momentum-roc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-momentum-roc-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong-up ${run.strongUpCount} / above ${run.aboveCount} / below ${run.belowCount} / strong-down ${run.strongDownCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMomentumRoc.displayName = 'ChartLineMomentumRoc';
