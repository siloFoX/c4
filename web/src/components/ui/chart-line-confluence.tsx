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
 * ChartLineConfluence -- pure-SVG two-panel Confluence chart.
 *
 * The Confluence indicator sums aligned momentum signals from a set
 * of lookback oscillators into a single integer score. For each
 * lookback `L_k`, the per-bar signal is the sign of the bar's value
 * minus the value `L_k` bars ago:
 *
 *   signal_k(i) = +1   if value[i] > value[i - L_k]
 *                -1   if value[i] < value[i - L_k]
 *                 0   if value[i] = value[i - L_k]
 *                null if i < L_k (the lookback has not filled)
 *
 *   score(i) = sum over k of signal_k(i)   in [-N, +N]
 *
 * The score is null until every lookback has filled. The threshold
 * partitions the score into three zones: `bullish` (score above
 * threshold), `bearish` (score below the negative threshold),
 * `neutral` (within the band).
 *
 * The top panel plots the price; the bottom panel plots the score
 * with a horizontal zero line and dashed `+/-threshold` reference
 * lines.
 */

export interface ChartLineConfluencePoint {
  x: number;
  value: number;
}

export type ChartLineConfluenceZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineConfluenceSeriesId = 'price' | 'score';

export interface ChartLineConfluenceSample {
  index: number;
  x: number;
  value: number;
  signals: Array<-1 | 0 | 1 | null>;
  score: number | null;
  zone: ChartLineConfluenceZone;
}

export interface ChartLineConfluenceRun {
  series: ChartLineConfluencePoint[];
  lookbacks: number[];
  threshold: number;
  signals: Array<Array<-1 | 0 | 1 | null>>;
  score: Array<number | null>;
  samples: ChartLineConfluenceSample[];
  scoreFinal: number | null;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineConfluenceMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  score: number;
  zone: ChartLineConfluenceZone;
}

export interface ChartLineConfluenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineConfluenceLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  scorePanelTop: number;
  scorePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineConfluenceDot[];
  scorePath: string;
  markers: ChartLineConfluenceMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  scoreMin: number;
  scoreMax: number;
  run: ChartLineConfluenceRun;
}

export interface ChartLineConfluenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineConfluencePoint[];
  lookbacks?: number[];
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
  scoreColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  neutralColor?: string;
  noneColor?: string;
  zeroColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showScore?: boolean;
  showZeroLine?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineConfluenceSeriesId[];
  defaultHiddenSeries?: ChartLineConfluenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineConfluenceSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineConfluenceSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CONFLUENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_CONFLUENCE_HEIGHT = 400;
export const DEFAULT_CHART_LINE_CONFLUENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_CONFLUENCE_GAP = 12;
export const DEFAULT_CHART_LINE_CONFLUENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CONFLUENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CONFLUENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CONFLUENCE_LOOKBACKS: number[] = [5, 10, 20];
export const DEFAULT_CHART_LINE_CONFLUENCE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_CONFLUENCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CONFLUENCE_SCORE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CONFLUENCE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CONFLUENCE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CONFLUENCE_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CONFLUENCE_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONFLUENCE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CONFLUENCE_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONFLUENCE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CONFLUENCE_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineConfluenceFinitePoints(
  data: readonly ChartLineConfluencePoint[] | null | undefined,
): ChartLineConfluencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineConfluencePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/**
 * Coerce the lookbacks to a sorted array of positive integers (>= 1).
 * Non-finite or sub-1 entries are dropped; an empty result falls back
 * to the fallback array.
 */
export function normalizeLineConfluenceLookbacks(
  lookbacks: unknown,
  fallback: readonly number[],
): number[] {
  if (!Array.isArray(lookbacks)) {
    return [...fallback];
  }
  const out: number[] = [];
  for (const v of lookbacks) {
    if (isFiniteNumber(v) && v >= 1) out.push(Math.floor(v));
  }
  if (out.length === 0) return [...fallback];
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Coerce the threshold to a non-negative finite. The default fallback
 * is half the lookback count (floor), so a majority of aligned
 * signals reads as bullish or bearish.
 */
export function normalizeLineConfluenceThreshold(
  threshold: unknown,
  lookbackCount: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return Math.max(0, Math.floor(lookbackCount / 2));
}

/**
 * Per-bar momentum signal at a single lookback `L`:
 *   `+1` if `value[i] > value[i - L]`
 *   `-1` if `value[i] < value[i - L]`
 *   `0`  if `value[i] = value[i - L]`
 *   `null` for the warm-up bars (i < L) or non-finite operands.
 */
export function computeLineConfluenceSignal(
  values: readonly number[] | null | undefined,
  lookback: unknown,
): Array<-1 | 0 | 1 | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const l = isFiniteNumber(lookback) && lookback >= 1 ? Math.floor(lookback) : 1;
  const out: Array<-1 | 0 | 1 | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < l) {
      out.push(null);
      continue;
    }
    const curr = values[i];
    const prev = values[i - l];
    if (!isFiniteNumber(curr) || !isFiniteNumber(prev)) {
      out.push(null);
      continue;
    }
    if (curr > prev) out.push(1);
    else if (curr < prev) out.push(-1);
    else out.push(0);
  }
  return out;
}

/**
 * Sum the signals across the lookbacks. A bar's score is null until
 * EVERY lookback has filled (all the per-bar signals must be defined).
 */
export function computeLineConfluence(
  values: readonly number[] | null | undefined,
  lookbacks: readonly number[],
): {
  signals: Array<Array<-1 | 0 | 1 | null>>;
  score: Array<number | null>;
} {
  if (!Array.isArray(values) || values.length === 0) {
    return { signals: lookbacks.map(() => []), score: [] };
  }
  const signals: Array<Array<-1 | 0 | 1 | null>> = lookbacks.map((l) =>
    computeLineConfluenceSignal(values, l),
  );
  const score: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < signals.length; k += 1) {
      const s = signals[k]![i];
      if (s === null || s === undefined) {
        ok = false;
        break;
      }
      sum += s;
    }
    score.push(ok ? sum : null);
  }
  return { signals, score };
}

/** Classify a score against the threshold. */
export function classifyLineConfluenceZone(
  score: number | null,
  threshold: number,
): ChartLineConfluenceZone {
  if (!isFiniteNumber(score)) return 'none';
  if (score > threshold) return 'bullish';
  if (score < -threshold) return 'bearish';
  return 'neutral';
}

export interface ChartLineConfluenceOptions {
  lookbacks?: number[];
  threshold?: number;
}

/** Run the full confluence pipeline. */
export function runLineConfluence(
  data: readonly ChartLineConfluencePoint[] | null | undefined,
  options: ChartLineConfluenceOptions = {},
): ChartLineConfluenceRun {
  const series = getLineConfluenceFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const lookbacks = normalizeLineConfluenceLookbacks(
    options.lookbacks,
    DEFAULT_CHART_LINE_CONFLUENCE_LOOKBACKS,
  );
  const threshold = normalizeLineConfluenceThreshold(
    options.threshold,
    lookbacks.length,
  );
  const { signals, score } = computeLineConfluence(
    series.map((p) => p.value),
    lookbacks,
  );
  const samples: ChartLineConfluenceSample[] = series.map((point, index) => {
    const s = score[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      signals: signals.map((arr) => arr[index] ?? null),
      score: s,
      zone: classifyLineConfluenceZone(s, threshold),
    };
  });
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let scoreFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'bullish') bullishCount += 1;
    else if (sample.zone === 'bearish') bearishCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.score)) scoreFinal = sample.score;
  }
  return {
    series,
    lookbacks,
    threshold,
    signals,
    score,
    samples,
    scoreFinal,
    bullishCount,
    bearishCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineConfluenceLayoutOptions
  extends ChartLineConfluenceOptions {
  data: readonly ChartLineConfluencePoint[] | null | undefined;
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
export function computeLineConfluenceLayout(
  options: ChartLineConfluenceLayoutOptions,
): ChartLineConfluenceLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CONFLUENCE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CONFLUENCE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CONFLUENCE_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_CONFLUENCE_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_CONFLUENCE_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineConfluence(options.data, {
    ...(options.lookbacks !== undefined ? { lookbacks: options.lookbacks } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const scorePanelTop = pricePanelBottom + gap;
  const scorePanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    scorePanelBottom - scorePanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.value < priceMin) priceMin = sample.value;
    if (sample.value > priceMax) priceMax = sample.value;
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

  const n = run.lookbacks.length;
  const scoreBound = Math.max(n, run.threshold) + 1;
  const scoreMin = -scoreBound;
  const scoreMax = scoreBound;
  const scorePanelHeight = scorePanelBottom - scorePanelTop;
  const scoreYAt = (value: number): number =>
    scorePanelBottom -
    ((value - scoreMin) / (scoreMax - scoreMin)) * scorePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineConfluenceDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const scoreLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineConfluenceMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.score)) return;
    const cx = xAt(index);
    const cy = scoreYAt(sample.score);
    scoreLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      score: sample.score,
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
    scorePanelTop,
    scorePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    scorePath: buildLinePath(scoreLinePoints),
    markers,
    zeroY: scoreYAt(0),
    upperThresholdY: scoreYAt(run.threshold),
    lowerThresholdY: scoreYAt(-run.threshold),
    priceMin,
    priceMax,
    scoreMin,
    scoreMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineConfluenceChart(
  data: readonly ChartLineConfluencePoint[] | null | undefined,
  options: ChartLineConfluenceOptions = {},
): string {
  const run = runLineConfluence(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.scoreFinal === null ? 'n/a' : String(run.scoreFinal);
  return (
    `Two-panel chart with a Confluence panel (lookbacks ` +
    `${run.lookbacks.join(', ')}, threshold ${run.threshold}): the ` +
    `top panel plots the price, the bottom panel plots the score that ` +
    `sums the per-lookback momentum signs into a single integer in ` +
    `[-${run.lookbacks.length}, +${run.lookbacks.length}]. A score ` +
    `above the threshold marks bullish confluence; below the negative ` +
    `threshold marks bearish; inside the band is neutral. Across ` +
    `${total} bars the count is bullish ${run.bullishCount}, bearish ` +
    `${run.bearishCount}, neutral ${run.neutralCount}. The final score ` +
    `is ${finalText}.`
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
  zone: ChartLineConfluenceZone,
  bullishColor: string,
  bearishColor: string,
  neutralColor: string,
  noneColor: string,
): string {
  if (zone === 'bullish') return bullishColor;
  if (zone === 'bearish') return bearishColor;
  if (zone === 'neutral') return neutralColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineConfluenceZone): string {
  if (zone === 'bullish') return 'Bullish';
  if (zone === 'bearish') return 'Bearish';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineConfluence -- two-panel pure-SVG Confluence chart.
 */
export const ChartLineConfluence = forwardRef<
  HTMLDivElement,
  ChartLineConfluenceProps
>(function ChartLineConfluence(props, ref) {
  const {
    data,
    lookbacks,
    threshold,
    width = DEFAULT_CHART_LINE_CONFLUENCE_WIDTH,
    height = DEFAULT_CHART_LINE_CONFLUENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CONFLUENCE_PADDING,
    gap = DEFAULT_CHART_LINE_CONFLUENCE_GAP,
    tickCount = DEFAULT_CHART_LINE_CONFLUENCE_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_CONFLUENCE_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_CONFLUENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CONFLUENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CONFLUENCE_PRICE_COLOR,
    scoreColor = DEFAULT_CHART_LINE_CONFLUENCE_SCORE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CONFLUENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CONFLUENCE_BEARISH_COLOR,
    neutralColor = DEFAULT_CHART_LINE_CONFLUENCE_NEUTRAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_CONFLUENCE_NONE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CONFLUENCE_ZERO_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_CONFLUENCE_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_CONFLUENCE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CONFLUENCE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showScore = true,
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
  const baseId = `chart-line-confluence-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineConfluenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineConfluenceSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineConfluenceLayout({
        data,
        ...(lookbacks !== undefined ? { lookbacks } : {}),
        ...(threshold !== undefined ? { threshold } : {}),
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, lookbacks, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineConfluenceChart(data, {
      ...(lookbacks !== undefined ? { lookbacks } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
    });
  const resolvedLabel =
    ariaLabel ??
    `Confluence chart, lookbacks ${run.lookbacks.join('/')}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineConfluenceSeriesId): void => {
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
    const ty = layout.pricePanelTop + 6;
    const signalsText = hoverSample.signals
      .map((s, k) => `L${run.lookbacks[k]}=${s === null ? '?' : s}`)
      .join(' ');
    tooltip = (
      <g data-section="chart-line-confluence-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-confluence-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-confluence-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-confluence-tooltip-score"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Score: ${
            hoverSample.score === null ? 'n/a' : String(hoverSample.score)
          }`}
        </text>
        <text
          data-section="chart-line-confluence-tooltip-signals"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {signalsText}
        </text>
        <text
          data-section="chart-line-confluence-tooltip-zone"
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
  const scoreHidden = isHidden('score') || !showScore;

  const legendItems: Array<{
    id: ChartLineConfluenceSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'score', label: 'Confluence', color: scoreColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-confluence"
      data-empty={isEmpty ? 'true' : 'false'}
      data-lookbacks={run.lookbacks.join(',')}
      data-threshold={run.threshold}
      data-score-final={run.scoreFinal === null ? '' : run.scoreFinal}
      data-bullish-count={run.bullishCount}
      data-bearish-count={run.bearishCount}
      data-neutral-count={run.neutralCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-confluence-aria-desc"
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
          data-section="chart-line-confluence-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-confluence-empty"
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
          data-section="chart-line-confluence-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-confluence-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-confluence-grid-line"
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
                  layout.scorePanelBottom -
                  t * (layout.scorePanelBottom - layout.scorePanelTop);
                return (
                  <line
                    key={`sg-${i}`}
                    data-section="chart-line-confluence-grid-line"
                    data-panel="score"
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
            <g data-section="chart-line-confluence-axes">
              <line
                data-section="chart-line-confluence-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-confluence-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-confluence-axis"
                data-panel="score"
                x1={layout.innerLeft}
                y1={layout.scorePanelTop}
                x2={layout.innerLeft}
                y2={layout.scorePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-confluence-axis"
                data-panel="score"
                x1={layout.innerLeft}
                y1={layout.scorePanelBottom}
                x2={layout.innerRight}
                y2={layout.scorePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-confluence-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Price
          </text>
          <text
            data-section="chart-line-confluence-panel-label"
            data-panel="score"
            x={layout.innerRight}
            y={layout.scorePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Confluence
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-confluence-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines && run.threshold > 0 ? (
            <g data-section="chart-line-confluence-threshold-lines">
              <line
                data-section="chart-line-confluence-threshold-line"
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
                data-section="chart-line-confluence-threshold-line"
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
              data-section="chart-line-confluence-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Price line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-confluence-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-confluence-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
                    dot.value,
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

          {!scoreHidden ? (
            <path
              data-section="chart-line-confluence-score-line"
              d={layout.scorePath}
              fill="none"
              stroke={scoreColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Confluence score line, ${layout.markers.length} points`}
            />
          ) : null}

          {!scoreHidden && showMarkers ? (
            <g data-section="chart-line-confluence-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-confluence-marker"
                  data-zone={marker.zone}
                  data-score={marker.score}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    bullishColor,
                    bearishColor,
                    neutralColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, score ${marker.score}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-confluence-badge">
              <rect
                data-section="chart-line-confluence-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-confluence-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CONF ${run.lookbacks.join('/')} t${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-confluence-legend"
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
                data-section="chart-line-confluence-legend-item"
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
                  data-section="chart-line-confluence-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-confluence-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-confluence-legend-stats"
            style={{ color: axisColor }}
          >
            {`bullish ${run.bullishCount} / bearish ${run.bearishCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineConfluence.displayName = 'ChartLineConfluence';
