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
 * ChartLineElderForce -- pure-SVG dual-panel chart with the
 * close on the top panel and the Elder Force Index (EFI)
 * oscillator beneath. EFI weights price change by volume and
 * smooths the result with an EMA:
 *
 *   raw[i] = (close[i] - close[i - 1]) * volume[i]    (i >= 1)
 *   EFI[i] = EMA(raw, length)[i]
 *
 * Defaults: `length = 13` (Elder's classic period). Bar 0 has
 * no prior close so `raw[0]` is `null` and the EMA is seeded at
 * the first finite `raw` (bar 1).
 *
 * Bit-exact anchor: **CONST close** (`close = K` constant): every
 * `close - close[i - 1]` is exactly zero, so every `raw` is zero
 * (regardless of volume), and `EFI = EMA(0) = 0` bit-exact past
 * warmup. The integration sweep verifies this across many `K`
 * and `volume` levels, including zero volume.
 *
 * `volume = 0` is not singular: when close is constant the raw
 * is still zero and EFI = 0.
 */

export interface ChartLineElderForcePoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineElderForceZone =
  | 'strong-up'
  | 'above'
  | 'below'
  | 'strong-down'
  | 'at'
  | 'none';

export type ChartLineElderForceSeriesId = 'price' | 'efi';

export interface ChartLineElderForceSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  efi: number | null;
  zone: ChartLineElderForceZone;
}

export interface ChartLineElderForceRun {
  series: ChartLineElderForcePoint[];
  length: number;
  raw: Array<number | null>;
  efi: Array<number | null>;
  samples: ChartLineElderForceSample[];
  efiFinal: number | null;
  efiAbsMaxSeen: number;
  strongUpCount: number;
  aboveCount: number;
  belowCount: number;
  strongDownCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineElderForceMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  efi: number;
  zone: ChartLineElderForceZone;
}

export interface ChartLineElderForceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineElderForceLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  efiTop: number;
  efiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineElderForceDot[];
  efiPath: string;
  markers: ChartLineElderForceMarker[];
  priceMin: number;
  priceMax: number;
  efiMin: number;
  efiMax: number;
  zeroBaselineY: number;
  run: ChartLineElderForceRun;
}

export interface ChartLineElderForceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineElderForcePoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  efiColor?: string;
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
  showEfi?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineElderForceSeriesId[];
  defaultHiddenSeries?: ChartLineElderForceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineElderForceSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineElderForceSample }) => void;
  formatPrice?: (value: number) => string;
  formatEfi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ELDER_FORCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_ELDER_FORCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ELDER_FORCE_PADDING = 44;
export const DEFAULT_CHART_LINE_ELDER_FORCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ELDER_FORCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_FORCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_FORCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH = 13;
export const DEFAULT_CHART_LINE_ELDER_FORCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_FORCE_EFI_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ELDER_FORCE_STRONG_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ELDER_FORCE_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_ELDER_FORCE_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ELDER_FORCE_STRONG_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_FORCE_AT_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ELDER_FORCE_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ELDER_FORCE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ELDER_FORCE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_FORCE_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `close`, and `volume`. */
export function getLineElderForceFinitePoints(
  data: readonly ChartLineElderForcePoint[] | null | undefined,
): ChartLineElderForcePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineElderForcePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
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
export function normalizeLineElderForceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Single-pass EMA seeded at the first finite value. Nulls break
 * the chain (re-seed on next finite).
 */
export function applyLineElderForceEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

/**
 * Raw Force per bar: `(close[i] - close[i - 1]) * volume[i]`.
 * Bar 0 is `null`.
 */
export function computeLineElderForceRaw(
  series: ReadonlyArray<{ close: number; volume: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(series) || series.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const bar = series[i];
    if (
      !bar ||
      !isFiniteNumber(bar.close) ||
      !isFiniteNumber(bar.volume)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(null);
      continue;
    }
    const prev = series[i - 1];
    if (!prev || !isFiniteNumber(prev.close)) {
      out.push(null);
      continue;
    }
    const raw = (bar.close - prev.close) * bar.volume;
    // Normalize -0 to +0 so the bit-exact zero anchor holds even
    // when `bar.volume` is negative or zero.
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

export interface ChartLineElderForceOptions {
  length?: number;
}

export interface ChartLineElderForceChannels {
  raw: Array<number | null>;
  efi: Array<number | null>;
}

/**
 * Compute the Elder Force Index per bar. Bar 0 is `null` and
 * the EMA is seeded at the first finite `raw` (bar 1).
 */
export function computeLineElderForce(
  series: ReadonlyArray<{ close: number; volume: number }> | null | undefined,
  options: ChartLineElderForceOptions = {},
): ChartLineElderForceChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { raw: [], efi: [] };
  }
  const length = normalizeLineElderForceLength(
    options.length,
    DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH,
  );
  const raw = computeLineElderForceRaw(series);
  const efi = applyLineElderForceEma(raw, length);
  return { raw, efi };
}

/** Classify an EFI reading by ratio to the absolute max seen. */
export function classifyLineElderForceZone(
  value: number | null,
  efiAbsMaxSeen: number,
): ChartLineElderForceZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value === 0) return 'at';
  if (!isFiniteNumber(efiAbsMaxSeen) || efiAbsMaxSeen <= 0) {
    return value > 0 ? 'above' : 'below';
  }
  const ratio = value / efiAbsMaxSeen;
  if (ratio >= 0.5) return 'strong-up';
  if (ratio > 0) return 'above';
  if (ratio > -0.5) return 'below';
  return 'strong-down';
}

/** Run the full EFI pipeline plus sample classification. */
export function runLineElderForce(
  data: readonly ChartLineElderForcePoint[] | null | undefined,
  options: ChartLineElderForceOptions = {},
): ChartLineElderForceRun {
  const series = getLineElderForceFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineElderForceLength(
    options.length,
    DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH,
  );
  const channels = computeLineElderForce(series, { length });
  let efiAbsMaxSeen = 0;
  for (const e of channels.efi) {
    if (e != null && isFiniteNumber(e)) {
      const abs = Math.abs(e);
      if (abs > efiAbsMaxSeen) efiAbsMaxSeen = abs;
    }
  }
  const samples: ChartLineElderForceSample[] = series.map((point, index) => {
    const value = channels.efi[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      volume: point.volume,
      efi: value,
      zone: classifyLineElderForceZone(value, efiAbsMaxSeen),
    };
  });
  let strongUpCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let strongDownCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let efiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-up') strongUpCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'strong-down') strongDownCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.efi)) efiFinal = sample.efi;
  }
  return {
    series,
    length,
    raw: channels.raw,
    efi: channels.efi,
    samples,
    efiFinal,
    efiAbsMaxSeen,
    strongUpCount,
    aboveCount,
    belowCount,
    strongDownCount,
    atCount,
    noneCount,
    ok: series.length > 1,
  };
}

export interface ChartLineElderForceLayoutOptions
  extends ChartLineElderForceOptions {
  data: readonly ChartLineElderForcePoint[] | null | undefined;
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
export function computeLineElderForceLayout(
  options: ChartLineElderForceLayoutOptions,
): ChartLineElderForceLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ELDER_FORCE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ELDER_FORCE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ELDER_FORCE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ELDER_FORCE_PANEL_GAP;

  const run = runLineElderForce(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const efiHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const efiTop = priceBottom + panelGap;
  const efiBottom = efiTop + efiHeight;

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

  // EFI oscillates around 0 and can take any sign.
  let efiMin = -1;
  let efiMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.efi)) {
      if (sample.efi < efiMin) efiMin = sample.efi;
      if (sample.efi > efiMax) efiMax = sample.efi;
    }
  }
  if (efiMin === efiMax) {
    efiMin -= 1;
    efiMax += 1;
  }
  const efiY = (value: number): number =>
    efiBottom - ((value - efiMin) / (efiMax - efiMin)) * efiHeight;
  const zeroBaselineY = efiY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineElderForceDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const efiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineElderForceMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.efi)) return;
    const cx = xAt(index);
    const yc = efiY(sample.efi);
    efiLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      efi: sample.efi,
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
    efiTop,
    efiBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    efiPath: buildLinePath(efiLinePoints),
    markers,
    priceMin,
    priceMax,
    efiMin,
    efiMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineElderForceChart(
  data: readonly ChartLineElderForcePoint[] | null | undefined,
  options: ChartLineElderForceOptions = {},
): string {
  const run = runLineElderForce(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.efiFinal === null ? 'n/a' : run.efiFinal.toFixed(4);
  return (
    `Dual-panel chart with an Elder Force Index oscillator panel ` +
    `beneath the close (length ${run.length}). EFI = EMA( ` +
    `(close - prevClose) * volume, length ). Across ${total} bars ` +
    `EFI is strongly up on ${run.strongUpCount}, mildly up on ` +
    `${run.aboveCount}, at zero on ${run.atCount}, mildly down on ` +
    `${run.belowCount}, strongly down on ${run.strongDownCount}, ` +
    `and undefined on ${run.noneCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatEfi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineElderForceZone,
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

function zoneLabelOf(zone: ChartLineElderForceZone): string {
  if (zone === 'strong-up') return 'Strong Up';
  if (zone === 'above') return 'Above Zero';
  if (zone === 'below') return 'Below Zero';
  if (zone === 'strong-down') return 'Strong Down';
  if (zone === 'at') return 'At Zero';
  return 'n/a';
}

/** ChartLineElderForce -- dual-panel pure-SVG EFI chart. */
export const ChartLineElderForce = forwardRef<
  HTMLDivElement,
  ChartLineElderForceProps
>(function ChartLineElderForce(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ELDER_FORCE_LENGTH,
    width = DEFAULT_CHART_LINE_ELDER_FORCE_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_FORCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_FORCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_ELDER_FORCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ELDER_FORCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_FORCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_FORCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ELDER_FORCE_PRICE_COLOR,
    efiColor = DEFAULT_CHART_LINE_ELDER_FORCE_EFI_COLOR,
    strongUpColor = DEFAULT_CHART_LINE_ELDER_FORCE_STRONG_UP_COLOR,
    aboveColor = DEFAULT_CHART_LINE_ELDER_FORCE_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_ELDER_FORCE_BELOW_COLOR,
    strongDownColor = DEFAULT_CHART_LINE_ELDER_FORCE_STRONG_DOWN_COLOR,
    atColor = DEFAULT_CHART_LINE_ELDER_FORCE_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_ELDER_FORCE_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_FORCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_FORCE_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_ELDER_FORCE_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showEfi = true,
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
    formatEfi = defaultFormatEfi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-elder-force-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineElderForceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineElderForceSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineElderForceLayout({
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
    ariaDescription ?? describeLineElderForceChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Elder Force Index chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineElderForceSeriesId): void => {
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
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-elder-force-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-elder-force-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-elder-force-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-elder-force-tooltip-volume"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Volume: ${formatPrice(hoverSample.volume)}`}
        </text>
        <text
          data-section="chart-line-elder-force-tooltip-efi"
          x={tx + 10}
          y={ty + 67}
          fill="#d8b4fe"
          fontSize={11}
          fontWeight={600}
        >
          {`EFI: ${
            hoverSample.efi === null
              ? 'n/a'
              : formatEfi(hoverSample.efi)
          }`}
        </text>
        <text
          data-section="chart-line-elder-force-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const efiHidden = isHidden('efi') || !showEfi;

  const legendItems: Array<{
    id: ChartLineElderForceSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'efi', label: 'Elder Force', color: efiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-elder-force"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-efi-final={run.efiFinal === null ? '' : run.efiFinal}
      data-efi-abs-max-seen={run.efiAbsMaxSeen}
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
        data-section="chart-line-elder-force-aria-desc"
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
          data-section="chart-line-elder-force-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-elder-force-empty"
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
          data-section="chart-line-elder-force-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-elder-force-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.efiBottom -
                  t * (layout.efiBottom - layout.efiTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-elder-force-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-elder-force-grid-line"
                      data-panel="efi"
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
            <g data-section="chart-line-elder-force-axes">
              <line
                data-section="chart-line-elder-force-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-force-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-force-axis"
                data-panel="efi"
                x1={layout.innerLeft}
                y1={layout.efiTop}
                x2={layout.innerLeft}
                y2={layout.efiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-force-axis"
                data-panel="efi"
                x1={layout.innerLeft}
                y1={layout.efiBottom}
                x2={layout.innerRight}
                y2={layout.efiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-elder-force-tick-label"
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
                data-section="chart-line-elder-force-tick-label"
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
                data-section="chart-line-elder-force-tick-label"
                data-panel="efi"
                x={layout.innerLeft - 6}
                y={layout.efiTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatEfi(layout.efiMax)}
              </text>
              <text
                data-section="chart-line-elder-force-tick-label"
                data-panel="efi"
                x={layout.innerLeft - 6}
                y={layout.efiBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatEfi(layout.efiMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-elder-force-baseline"
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
              data-section="chart-line-elder-force-price-path"
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
            <g data-section="chart-line-elder-force-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-elder-force-dot"
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

          {!efiHidden ? (
            <path
              data-section="chart-line-elder-force-line"
              d={layout.efiPath}
              fill="none"
              stroke={efiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Elder Force line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-elder-force-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-elder-force-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-efi={marker.efi}
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
                  )}, EFI ${formatEfi(marker.efi)}, ${zoneLabelOf(
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
            <g data-section="chart-line-elder-force-badge">
              <rect
                data-section="chart-line-elder-force-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-elder-force-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Elder Force ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-elder-force-legend"
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
                data-section="chart-line-elder-force-legend-item"
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
                  data-section="chart-line-elder-force-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-elder-force-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-elder-force-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong-up ${run.strongUpCount} / above ${run.aboveCount} / below ${run.belowCount} / strong-down ${run.strongDownCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineElderForce.displayName = 'ChartLineElderForce';
