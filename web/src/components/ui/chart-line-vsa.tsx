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
 * ChartLineVsa -- pure-SVG two-panel Volume Spread Analysis chart.
 *
 * Each bar has a SPREAD (high - low) and a VOLUME. VSA reads the
 * relationship between effort (volume) and result (spread):
 *
 *   spreadMean = mean(spread)   over the rolling window
 *   volumeMean = mean(volume)   over the rolling window
 *   effort     = volume / volumeMean
 *   result     = spread / spreadMean
 *   vsa        = effort - result
 *
 * A bar where the effort and the result agree gets `vsa ~ 0`. A bar
 * where the volume punches well above its mean but the spread is at
 * or below the mean reads `vsa > 0` (a "no demand" / "no supply"
 * pattern -- the effort produces no result). The mirror reads
 * `vsa < 0` (an "ease-of-move" -- a big move on light volume).
 *
 * The top panel plots the bar midpoint; the bottom panel plots the
 * VSA index with a horizontal zero line and `+/-threshold` reference
 * lines that classify each defined bar as `agreement` (within band)
 * or `no-demand` / `ease-of-move` (outside the band).
 */

export interface ChartLineVsaPoint {
  x: number;
  high: number;
  low: number;
  volume: number;
}

export type ChartLineVsaZone =
  | 'agreement'
  | 'no-demand'
  | 'ease-of-move'
  | 'none';

export type ChartLineVsaSeriesId = 'price' | 'vsa';

export interface ChartLineVsaSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  volume: number;
  spread: number;
  effort: number | null;
  result: number | null;
  vsa: number | null;
  zone: ChartLineVsaZone;
}

export interface ChartLineVsaRun {
  series: ChartLineVsaPoint[];
  period: number;
  threshold: number;
  vsa: Array<number | null>;
  samples: ChartLineVsaSample[];
  vsaFinal: number | null;
  agreementCount: number;
  noDemandCount: number;
  easeOfMoveCount: number;
  ok: boolean;
}

export interface ChartLineVsaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  vsa: number;
  zone: ChartLineVsaZone;
}

export interface ChartLineVsaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  midpoint: number;
}

export interface ChartLineVsaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  vsaPanelTop: number;
  vsaPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineVsaDot[];
  vsaPath: string;
  markers: ChartLineVsaMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  vsaMin: number;
  vsaMax: number;
  run: ChartLineVsaRun;
}

export interface ChartLineVsaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVsaPoint[];
  period?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vsaColor?: string;
  agreementColor?: string;
  noDemandColor?: string;
  easeOfMoveColor?: string;
  noneColor?: string;
  zeroColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVsa?: boolean;
  showZeroLine?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVsaSeriesId[];
  defaultHiddenSeries?: ChartLineVsaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVsaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVsaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VSA_WIDTH = 720;
export const DEFAULT_CHART_LINE_VSA_HEIGHT = 400;
export const DEFAULT_CHART_LINE_VSA_PADDING = 44;
export const DEFAULT_CHART_LINE_VSA_GAP = 12;
export const DEFAULT_CHART_LINE_VSA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VSA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VSA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VSA_PERIOD = 14;
export const DEFAULT_CHART_LINE_VSA_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_VSA_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VSA_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VSA_VSA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VSA_AGREEMENT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_VSA_NO_DEMAND_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VSA_EASE_OF_MOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VSA_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VSA_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VSA_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VSA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VSA_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite x, high, low and volume (with high >= low, volume >= 0). */
export function getLineVsaFinitePoints(
  data: readonly ChartLineVsaPoint[] | null | undefined,
): ChartLineVsaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVsaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.volume) &&
      point.high >= point.low &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce the rolling window to an integer of at least 2. */
export function normalizeLineVsaPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the divergence threshold to a strictly positive finite. */
export function normalizeLineVsaThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

export interface ChartLineVsaComputed {
  effort: Array<number | null>;
  result: Array<number | null>;
  vsa: Array<number | null>;
}

/**
 * Per-bar VSA index over a rolling window. The first `period - 1`
 * bars are null; a window with zero mean spread or zero mean volume
 * leaves the values null (no normalisation possible).
 */
export function computeLineVsa(
  bars: readonly ChartLineVsaPoint[] | null | undefined,
  period: unknown,
): ChartLineVsaComputed {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { effort: [], result: [], vsa: [] };
  }
  const p = normalizeLineVsaPeriod(period, DEFAULT_CHART_LINE_VSA_PERIOD);
  const effort: Array<number | null> = [];
  const result: Array<number | null> = [];
  const vsa: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      effort.push(null);
      result.push(null);
      vsa.push(null);
      continue;
    }
    let sumSpread = 0;
    let sumVol = 0;
    for (let j = i - p + 1; j <= i; j += 1) {
      sumSpread += bars[j]!.high - bars[j]!.low;
      sumVol += bars[j]!.volume;
    }
    const spreadMean = sumSpread / p;
    const volMean = sumVol / p;
    if (spreadMean <= 0 || volMean <= 0) {
      effort.push(null);
      result.push(null);
      vsa.push(null);
      continue;
    }
    const e = bars[i]!.volume / volMean;
    const r = (bars[i]!.high - bars[i]!.low) / spreadMean;
    effort.push(e);
    result.push(r);
    vsa.push(e - r);
  }
  return { effort, result, vsa };
}

/** Classify a VSA index against the threshold. */
export function classifyLineVsaZone(
  vsa: number | null,
  threshold: number,
): ChartLineVsaZone {
  if (!isFiniteNumber(vsa)) return 'none';
  if (vsa > threshold) return 'no-demand';
  if (vsa < -threshold) return 'ease-of-move';
  return 'agreement';
}

export interface ChartLineVsaOptions {
  period?: number;
  threshold?: number;
}

/** Run the full VSA pipeline. */
export function runLineVsa(
  data: readonly ChartLineVsaPoint[] | null | undefined,
  options: ChartLineVsaOptions = {},
): ChartLineVsaRun {
  const series = getLineVsaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineVsaPeriod(
    options.period,
    DEFAULT_CHART_LINE_VSA_PERIOD,
  );
  const threshold = normalizeLineVsaThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_VSA_THRESHOLD,
  );
  const { effort, result, vsa } = computeLineVsa(series, period);
  const samples: ChartLineVsaSample[] = series.map((point, index) => {
    const v = vsa[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      midpoint: (point.high + point.low) / 2,
      volume: point.volume,
      spread: point.high - point.low,
      effort: effort[index] ?? null,
      result: result[index] ?? null,
      vsa: v,
      zone: classifyLineVsaZone(v, threshold),
    };
  });
  let agreementCount = 0;
  let noDemandCount = 0;
  let easeOfMoveCount = 0;
  let vsaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'agreement') agreementCount += 1;
    else if (sample.zone === 'no-demand') noDemandCount += 1;
    else if (sample.zone === 'ease-of-move') easeOfMoveCount += 1;
    if (isFiniteNumber(sample.vsa)) vsaFinal = sample.vsa;
  }
  return {
    series = [],
    period,
    threshold,
    vsa,
    samples,
    vsaFinal,
    agreementCount,
    noDemandCount,
    easeOfMoveCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVsaLayoutOptions extends ChartLineVsaOptions {
  data: readonly ChartLineVsaPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
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

/** Project the run into a two-panel SVG layout. */
export function computeLineVsaLayout(
  options: ChartLineVsaLayoutOptions,
): ChartLineVsaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VSA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VSA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VSA_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_VSA_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_VSA_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineVsa(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const vsaPanelTop = pricePanelBottom + gap;
  const vsaPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    vsaPanelBottom - vsaPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.midpoint < priceMin) priceMin = sample.midpoint;
    if (sample.midpoint > priceMax) priceMax = sample.midpoint;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  let vsaMag = run.threshold * 1.5;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.vsa)) {
      const a = Math.abs(sample.vsa);
      if (a > vsaMag) vsaMag = a;
    }
  }
  const vsaMin = -vsaMag * 1.1;
  const vsaMax = vsaMag * 1.1;
  const vsaPanelHeight = vsaPanelBottom - vsaPanelTop;
  const vsaYAt = (value: number): number =>
    vsaPanelBottom - ((value - vsaMin) / (vsaMax - vsaMin)) * vsaPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVsaDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.midpoint);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, midpoint: sample.midpoint });
  });

  const vsaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVsaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.vsa)) return;
    const cx = xAt(index);
    const cy = vsaYAt(sample.vsa);
    vsaLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      vsa: sample.vsa,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    vsaPanelTop,
    vsaPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    vsaPath: buildLinePath(vsaLinePoints),
    markers,
    zeroY: vsaYAt(0),
    upperThresholdY: vsaYAt(run.threshold),
    lowerThresholdY: vsaYAt(-run.threshold),
    priceMin,
    priceMax,
    vsaMin,
    vsaMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineVsaChart(
  data: readonly ChartLineVsaPoint[] | null | undefined,
  options: ChartLineVsaOptions = {},
): string {
  const run = runLineVsa(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.vsaFinal === null ? 'n/a' : run.vsaFinal.toFixed(3);
  return (
    `Two-panel chart with a Volume Spread Analysis panel (period ` +
    `${run.period}, threshold ${run.threshold}): the top panel plots ` +
    `the bar midpoint, the bottom panel plots the effort-minus-result ` +
    `divergence between volume and spread, each normalised against ` +
    `the rolling window mean. A reading above the threshold marks a ` +
    `"no demand" bar (effort with no result); a reading below the ` +
    `negative threshold marks an "ease-of-move" bar (result on light ` +
    `effort); inside the band is agreement. Across ${total} bars the ` +
    `count is agreement ${run.agreementCount}, no-demand ` +
    `${run.noDemandCount}, ease-of-move ${run.easeOfMoveCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineVsaZone,
  agreementColor: string,
  noDemandColor: string,
  easeOfMoveColor: string,
  noneColor: string,
): string {
  if (zone === 'agreement') return agreementColor;
  if (zone === 'no-demand') return noDemandColor;
  if (zone === 'ease-of-move') return easeOfMoveColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineVsaZone): string {
  if (zone === 'agreement') return 'Agreement';
  if (zone === 'no-demand') return 'No demand';
  if (zone === 'ease-of-move') return 'Ease of move';
  return 'n/a';
}

/**
 * ChartLineVsa -- two-panel pure-SVG Volume Spread Analysis chart.
 */
export const ChartLineVsa = forwardRef<HTMLDivElement, ChartLineVsaProps>(
  function ChartLineVsa(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_VSA_PERIOD,
      threshold = DEFAULT_CHART_LINE_VSA_THRESHOLD,
      width = DEFAULT_CHART_LINE_VSA_WIDTH,
      height = DEFAULT_CHART_LINE_VSA_HEIGHT,
      padding = DEFAULT_CHART_LINE_VSA_PADDING,
      gap = DEFAULT_CHART_LINE_VSA_GAP,
      tickCount = DEFAULT_CHART_LINE_VSA_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VSA_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VSA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VSA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VSA_PRICE_COLOR,
      vsaColor = DEFAULT_CHART_LINE_VSA_VSA_COLOR,
      agreementColor = DEFAULT_CHART_LINE_VSA_AGREEMENT_COLOR,
      noDemandColor = DEFAULT_CHART_LINE_VSA_NO_DEMAND_COLOR,
      easeOfMoveColor = DEFAULT_CHART_LINE_VSA_EASE_OF_MOVE_COLOR,
      noneColor = DEFAULT_CHART_LINE_VSA_NONE_COLOR,
      zeroColor = DEFAULT_CHART_LINE_VSA_ZERO_COLOR,
      thresholdColor = DEFAULT_CHART_LINE_VSA_THRESHOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_VSA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VSA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVsa = true,
      showZeroLine = true,
      showThresholdLines = true,
      showMarkers = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      hiddenSeries,
      defaultHiddenSeries,
      onSeriesToggle,
      onPointClick,
      formatValue = defaultFormatValue,
      formatX = defaultFormatX,
      ariaLabel,
      ariaDescription,
      className,
      style,
      ...svgProps
    } = props;

    const reactId = useId();
    const baseId = `chart-line-vsa-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineVsaSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineVsaSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineVsaLayout({
          data,
          period,
          threshold,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [data, period, threshold, width, height, padding, gap, pricePanelRatio],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLineVsaChart(data, { period, threshold });
    const resolvedLabel =
      ariaLabel ??
      `Volume Spread Analysis chart, period ${run.period}, threshold ${run.threshold}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineVsaSeriesId): void => {
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
      const tooltipW = 204;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-vsa-tooltip" pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={132}
            rx={6}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            data-section="chart-line-vsa-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-spread"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Spread: ${formatValue(hoverSample.spread)}`}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-volume"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatValue(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-effort"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Effort: ${
              hoverSample.effort === null
                ? 'n/a'
                : hoverSample.effort.toFixed(3)
            }`}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-result"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Result: ${
              hoverSample.result === null
                ? 'n/a'
                : hoverSample.result.toFixed(3)
            }`}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-vsa"
            x={tx + 10}
            y={ty + 99}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`VSA: ${
              hoverSample.vsa === null ? 'n/a' : hoverSample.vsa.toFixed(3)
            }`}
          </text>
          <text
            data-section="chart-line-vsa-tooltip-zone"
            x={tx + 10}
            y={ty + 115}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const vsaHidden = isHidden('vsa') || !showVsa;

    const legendItems: Array<{
      id: ChartLineVsaSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Midpoint', color: priceColor },
      { id: 'vsa', label: 'VSA', color: vsaColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-vsa"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-threshold={run.threshold}
        data-vsa-final={run.vsaFinal === null ? '' : run.vsaFinal}
        data-agreement-count={run.agreementCount}
        data-no-demand-count={run.noDemandCount}
        data-ease-of-move-count={run.easeOfMoveCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-vsa-aria-desc"
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
            data-section="chart-line-vsa-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-vsa-empty"
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
            data-section="chart-line-vsa-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-vsa-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-vsa-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={py}
                      x2={layout.innerRight}
                      y2={py}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
                {tickValues.map((t, i) => {
                  const py =
                    layout.vsaPanelBottom -
                    t * (layout.vsaPanelBottom - layout.vsaPanelTop);
                  return (
                    <line
                      key={`vg-${i}`}
                      data-section="chart-line-vsa-grid-line"
                      data-panel="vsa"
                      x1={layout.innerLeft}
                      y1={py}
                      x2={layout.innerRight}
                      y2={py}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-vsa-axes">
                <line
                  data-section="chart-line-vsa-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vsa-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vsa-axis"
                  data-panel="vsa"
                  x1={layout.innerLeft}
                  y1={layout.vsaPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.vsaPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vsa-axis"
                  data-panel="vsa"
                  x1={layout.innerLeft}
                  y1={layout.vsaPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.vsaPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
              </g>
            ) : null}

            <text
              data-section="chart-line-vsa-panel-label"
              data-panel="price"
              x={layout.innerRight}
              y={layout.pricePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Midpoint
            </text>
            <text
              data-section="chart-line-vsa-panel-label"
              data-panel="vsa"
              x={layout.innerRight}
              y={layout.vsaPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Volume Spread Analysis
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-vsa-zero-line"
                x1={layout.innerLeft}
                y1={layout.zeroY}
                x2={layout.innerRight}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
              />
            ) : null}

            {showThresholdLines ? (
              <g data-section="chart-line-vsa-threshold-lines">
                <line
                  data-section="chart-line-vsa-threshold-line"
                  data-direction="upper"
                  x1={layout.innerLeft}
                  y1={layout.upperThresholdY}
                  x2={layout.innerRight}
                  y2={layout.upperThresholdY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <line
                  data-section="chart-line-vsa-threshold-line"
                  data-direction="lower"
                  x1={layout.innerLeft}
                  y1={layout.lowerThresholdY}
                  x2={layout.innerRight}
                  y2={layout.lowerThresholdY}
                  stroke={thresholdColor}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-vsa-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Bar midpoint line, ${run.series.length} bars`}
              />
            ) : null}

            {!priceHidden && showDots ? (
              <g data-section="chart-line-vsa-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-vsa-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dotRadius}
                    fill={priceColor}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(dot.x)}, midpoint ${formatValue(
                      dot.midpoint,
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

            {!vsaHidden ? (
              <path
                data-section="chart-line-vsa-vsa-line"
                d={layout.vsaPath}
                fill="none"
                stroke={vsaColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`VSA line, ${layout.markers.length} points`}
              />
            ) : null}

            {!vsaHidden && showMarkers ? (
              <g data-section="chart-line-vsa-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-vsa-marker"
                    data-zone={marker.zone}
                    data-vsa={marker.vsa}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      agreementColor,
                      noDemandColor,
                      easeOfMoveColor,
                      noneColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, VSA ${formatValue(
                      marker.vsa,
                    )}, ${zoneLabelOf(marker.zone)}`}
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
              <g data-section="chart-line-vsa-badge">
                <rect
                  data-section="chart-line-vsa-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={104}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-vsa-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`VSA ${run.period}/${run.threshold}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-vsa-legend"
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
                  data-section="chart-line-vsa-legend-item"
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
                    data-section="chart-line-vsa-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-vsa-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vsa-legend-stats"
              style={{ color: axisColor }}
            >
              {`agreement ${run.agreementCount} / no-demand ${run.noDemandCount} / ease-of-move ${run.easeOfMoveCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVsa.displayName = 'ChartLineVsa';
