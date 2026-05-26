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
 * ChartLineMonteCarlo -- pure-SVG single-panel Monte Carlo forecast
 * fan chart.
 *
 * The forecast is a non-parametric bootstrap. Given a historical price
 * series, the bar-to-bar returns are pooled; for each of `simulations`
 * sample paths and each of `horizon` future steps, one return is drawn
 * UNIFORMLY WITH REPLACEMENT from the pool and accumulated onto the
 * last historical price. The per-step quantile fan is then collected
 * from the simulated paths: `lower` at `quantileLow`, `median` at 0.5,
 * `upper` at `quantileHigh`.
 *
 * The PRNG is a deterministic Mulberry32 seeded from `seed`, so two
 * runs with the same input return the same fan bit-for-bit. The
 * defining algebraic invariants follow directly: a constant historical
 * series yields a zero-return pool, every bootstrapped sample is 0,
 * every simulated path equals the last historical price, so
 * `lower = median = upper = lastPrice` at every horizon step (exact).
 * A pool of one unique return value yields the same EXACT line for
 * every step (no variance, fan width = 0). The quantile order
 * `lower <= median <= upper` holds at every step by construction.
 */

export interface ChartLineMonteCarloPoint {
  x: number;
  value: number;
}

export type ChartLineMonteCarloSeriesId = 'history' | 'median' | 'fan';

export interface ChartLineMonteCarloStep {
  step: number;
  x: number;
  lower: number;
  median: number;
  upper: number;
  mean: number;
}

export interface ChartLineMonteCarloRun {
  history: ChartLineMonteCarloPoint[];
  returns: number[];
  forecast: ChartLineMonteCarloStep[];
  seed: number;
  horizon: number;
  simulations: number;
  quantileLow: number;
  quantileHigh: number;
  lastPrice: number | null;
  ok: boolean;
}

export interface ChartLineMonteCarloMarker {
  step: number;
  x: number;
  cx: number;
  cy: number;
  lower: number;
  median: number;
  upper: number;
  mean: number;
}

export interface ChartLineMonteCarloDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineMonteCarloLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  historyPath: string;
  historyDots: ChartLineMonteCarloDot[];
  medianPath: string;
  upperPath: string;
  lowerPath: string;
  fanPath: string;
  bridgePath: string;
  markers: ChartLineMonteCarloMarker[];
  forecastStartX: number;
  valueMin: number;
  valueMax: number;
  run: ChartLineMonteCarloRun;
}

export interface ChartLineMonteCarloProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMonteCarloPoint[];
  horizon?: number;
  simulations?: number;
  seed?: number;
  quantileLow?: number;
  quantileHigh?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  fanOpacity?: number;
  historyColor?: string;
  medianColor?: string;
  fanColor?: string;
  bridgeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFan?: boolean;
  showMedian?: boolean;
  showBridge?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMonteCarloSeriesId[];
  defaultHiddenSeries?: ChartLineMonteCarloSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMonteCarloSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { step: ChartLineMonteCarloStep }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_MONTE_CARLO_WIDTH = 720;
export const DEFAULT_CHART_LINE_MONTE_CARLO_HEIGHT = 360;
export const DEFAULT_CHART_LINE_MONTE_CARLO_PADDING = 44;
export const DEFAULT_CHART_LINE_MONTE_CARLO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MONTE_CARLO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MONTE_CARLO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON = 20;
export const DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS = 200;
export const DEFAULT_CHART_LINE_MONTE_CARLO_SEED = 1;
export const DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_LOW = 0.1;
export const DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_HIGH = 0.9;
export const DEFAULT_CHART_LINE_MONTE_CARLO_FAN_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_MONTE_CARLO_HISTORY_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MONTE_CARLO_MEDIAN_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MONTE_CARLO_FAN_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MONTE_CARLO_BRIDGE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MONTE_CARLO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MONTE_CARLO_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineMonteCarloFinitePoints(
  data: readonly ChartLineMonteCarloPoint[] | null | undefined,
): ChartLineMonteCarloPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMonteCarloPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the horizon to an integer of at least 1. */
export function normalizeLineMonteCarloHorizon(
  horizon: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(horizon) && horizon >= 1) return Math.floor(horizon);
  return fallback;
}

/** Coerce the simulation count to an integer of at least 1. */
export function normalizeLineMonteCarloSimulations(
  simulations: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(simulations) && simulations >= 1)
    return Math.floor(simulations);
  return fallback;
}

/** Coerce the seed to a non-negative integer. */
export function normalizeLineMonteCarloSeed(
  seed: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(seed)) return Math.abs(Math.floor(seed));
  return fallback;
}

/** Coerce a quantile to (0, 1). */
export function normalizeLineMonteCarloQuantile(
  q: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(q) && q > 0 && q < 1) return q;
  return fallback;
}

/**
 * Mulberry32 -- a small, fast, deterministic 32-bit PRNG. Returns a
 * function that yields the next pseudo-random number in `[0, 1)`. The
 * sequence is fully determined by the seed, so two runs with the same
 * seed produce the same path bit-for-bit.
 */
export function createLineMonteCarloRng(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compute bar-to-bar returns; the first bar yields null and is skipped. */
export function computeLineMonteCarloReturns(
  values: readonly number[] | null | undefined,
): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1];
    const b = values[i];
    if (isFiniteNumber(a) && isFiniteNumber(b)) out.push(b - a);
  }
  return out;
}

/**
 * Compute the quantile of a sorted array at fraction `q`, using a
 * simple floor-of-index rule. The array is assumed sorted ascending.
 */
export function computeLineMonteCarloQuantile(
  sortedAsc: readonly number[],
  q: number,
): number {
  if (sortedAsc.length === 0) return Number.NaN;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor(q * sortedAsc.length)),
  );
  return sortedAsc[idx]!;
}

export interface ChartLineMonteCarloOptions {
  horizon?: number;
  simulations?: number;
  seed?: number;
  quantileLow?: number;
  quantileHigh?: number;
}

/**
 * Run the bootstrap forecast: for each of `simulations` paths, draw
 * `horizon` returns with replacement from `returns` and cumulate them
 * onto `lastPrice`; at every step collect the lower / median / upper
 * quantiles plus the arithmetic mean across the simulations.
 */
export function computeLineMonteCarloForecast(
  lastPrice: number,
  returns: readonly number[],
  options: ChartLineMonteCarloOptions = {},
  lastX = 0,
): ChartLineMonteCarloStep[] {
  if (!isFiniteNumber(lastPrice) || returns.length === 0) return [];
  const horizon = normalizeLineMonteCarloHorizon(
    options.horizon,
    DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON,
  );
  const simulations = normalizeLineMonteCarloSimulations(
    options.simulations,
    DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS,
  );
  const seed = normalizeLineMonteCarloSeed(
    options.seed,
    DEFAULT_CHART_LINE_MONTE_CARLO_SEED,
  );
  const qLow = normalizeLineMonteCarloQuantile(
    options.quantileLow,
    DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_LOW,
  );
  const qHigh = normalizeLineMonteCarloQuantile(
    options.quantileHigh,
    DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_HIGH,
  );

  const rng = createLineMonteCarloRng(seed);
  const paths: number[] = new Array(simulations).fill(lastPrice);
  const out: ChartLineMonteCarloStep[] = [];
  for (let step = 1; step <= horizon; step += 1) {
    for (let s = 0; s < simulations; s += 1) {
      const idx = Math.min(
        returns.length - 1,
        Math.max(0, Math.floor(rng() * returns.length)),
      );
      paths[s] = paths[s]! + returns[idx]!;
    }
    const snapshot = paths.slice().sort((a, b) => a - b);
    const lower = computeLineMonteCarloQuantile(snapshot, qLow);
    const median = computeLineMonteCarloQuantile(snapshot, 0.5);
    const upper = computeLineMonteCarloQuantile(snapshot, qHigh);
    let total = 0;
    for (const v of paths) total += v;
    const mean = total / paths.length;
    out.push({
      step,
      x: lastX + step,
      lower,
      median,
      upper,
      mean,
    });
  }
  return out;
}

/** Run the full Monte Carlo pipeline. */
export function runLineMonteCarlo(
  data: readonly ChartLineMonteCarloPoint[] | null | undefined,
  options: ChartLineMonteCarloOptions = {},
): ChartLineMonteCarloRun {
  const history = getLineMonteCarloFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const horizon = normalizeLineMonteCarloHorizon(
    options.horizon,
    DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON,
  );
  const simulations = normalizeLineMonteCarloSimulations(
    options.simulations,
    DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS,
  );
  const seed = normalizeLineMonteCarloSeed(
    options.seed,
    DEFAULT_CHART_LINE_MONTE_CARLO_SEED,
  );
  const qLow = normalizeLineMonteCarloQuantile(
    options.quantileLow,
    DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_LOW,
  );
  const qHigh = normalizeLineMonteCarloQuantile(
    options.quantileHigh,
    DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_HIGH,
  );
  const returns = computeLineMonteCarloReturns(history.map((p) => p.value));
  const lastPoint = history.length > 0 ? history[history.length - 1]! : null;
  const lastPrice = lastPoint ? lastPoint.value : null;
  const lastX = lastPoint ? lastPoint.x : 0;
  const forecast =
    lastPrice !== null && returns.length > 0
      ? computeLineMonteCarloForecast(
          lastPrice,
          returns,
          { horizon, simulations, seed, quantileLow: qLow, quantileHigh: qHigh },
          lastX,
        )
      : [];
  return {
    history,
    returns,
    forecast,
    seed,
    horizon,
    simulations,
    quantileLow: qLow,
    quantileHigh: qHigh,
    lastPrice,
    ok: history.length >= 2 && returns.length > 0,
  };
}

export interface ChartLineMonteCarloLayoutOptions
  extends ChartLineMonteCarloOptions {
  data: readonly ChartLineMonteCarloPoint[] | null | undefined;
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

function buildBandPath(
  upper: ReadonlyArray<{ x: number; y: number }>,
  lower: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  let d = '';
  for (let i = 0; i < upper.length; i += 1) {
    const p = upper[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
  }
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    const p = lower[i]!;
    d += `L${p.x.toFixed(2)},${p.y.toFixed(2)} `;
  }
  d += 'Z';
  return d;
}

/** Project the run into a single-panel SVG layout. */
export function computeLineMonteCarloLayout(
  options: ChartLineMonteCarloLayoutOptions,
): ChartLineMonteCarloLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_MONTE_CARLO_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_MONTE_CARLO_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_MONTE_CARLO_PADDING;

  const run = runLineMonteCarlo(options.data, {
    ...(options.horizon !== undefined ? { horizon: options.horizon } : {}),
    ...(options.simulations !== undefined
      ? { simulations: options.simulations }
      : {}),
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.quantileLow !== undefined
      ? { quantileLow: options.quantileLow }
      : {}),
    ...(options.quantileHigh !== undefined
      ? { quantileHigh: options.quantileHigh }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;
  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const histCount = run.history.length;
  const fcCount = run.forecast.length;
  const totalSlots = histCount + fcCount;
  const stepX = totalSlots > 1 ? innerWidth / (totalSlots - 1) : 0;
  const xAt = (slot: number): number =>
    totalSlots > 1
      ? innerLeft + stepX * slot
      : (innerLeft + innerRight) / 2;

  let valueMin = Infinity;
  let valueMax = -Infinity;
  for (const point of run.history) {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
  }
  for (const step of run.forecast) {
    for (const v of [step.lower, step.median, step.upper]) {
      if (isFiniteNumber(v)) {
        if (v < valueMin) valueMin = v;
        if (v > valueMax) valueMax = v;
      }
    }
  }
  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    valueMin = 0;
    valueMax = 1;
  }
  if (valueMin === valueMax) {
    valueMin -= 1;
    valueMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - valueMin) / (valueMax - valueMin)) * innerHeight;

  const historyLinePoints: Array<{ x: number; y: number }> = [];
  const historyDots: ChartLineMonteCarloDot[] = [];
  run.history.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    historyLinePoints.push({ x: cx, y: cy });
    historyDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const medianPoints: Array<{ x: number; y: number }> = [];
  const upperPoints: Array<{ x: number; y: number }> = [];
  const lowerPoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineMonteCarloMarker[] = [];
  run.forecast.forEach((step, j) => {
    const slot = histCount + j;
    const cx = xAt(slot);
    medianPoints.push({ x: cx, y: yAt(step.median) });
    upperPoints.push({ x: cx, y: yAt(step.upper) });
    lowerPoints.push({ x: cx, y: yAt(step.lower) });
    markers.push({
      step: step.step,
      x: step.x,
      cx,
      cy: yAt(step.median),
      lower: step.lower,
      median: step.median,
      upper: step.upper,
      mean: step.mean,
    });
  });

  const forecastStartX = histCount > 0 ? xAt(histCount - 1) : innerLeft;

  let bridgePath = '';
  if (run.lastPrice !== null && run.forecast.length > 0) {
    const lastIdx = histCount - 1;
    bridgePath = buildLinePath([
      { x: xAt(lastIdx), y: yAt(run.lastPrice) },
      { x: xAt(histCount), y: yAt(run.forecast[0]!.median) },
    ]);
  }

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    historyPath: buildLinePath(historyLinePoints),
    historyDots,
    medianPath: buildLinePath(medianPoints),
    upperPath: buildLinePath(upperPoints),
    lowerPath: buildLinePath(lowerPoints),
    fanPath: buildBandPath(upperPoints, lowerPoints),
    bridgePath,
    markers,
    forecastStartX,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineMonteCarloChart(
  data: readonly ChartLineMonteCarloPoint[] | null | undefined,
  options: ChartLineMonteCarloOptions = {},
): string {
  const run = runLineMonteCarlo(data, options);
  if (!run.ok) return 'No data';
  const total = run.history.length;
  const lastFinal =
    run.forecast.length > 0 ? run.forecast[run.forecast.length - 1]! : null;
  const finalText = lastFinal === null ? 'n/a' : lastFinal.median.toFixed(2);
  const fanText =
    lastFinal === null
      ? 'n/a'
      : `${lastFinal.lower.toFixed(2)} to ${lastFinal.upper.toFixed(2)}`;
  return (
    `Single-panel chart with a Monte Carlo forecast fan (horizon ` +
    `${run.horizon}, simulations ${run.simulations}, seed ${run.seed}): ` +
    `the historical price line on the left, the bootstrap forecast ` +
    `fan on the right. For each future step one return is drawn with ` +
    `replacement from the pool of ${run.returns.length} historical ` +
    `bar-to-bar returns and accumulated onto the last price; the ` +
    `per-step quantile fan reports the lower (${run.quantileLow}), ` +
    `median (0.5) and upper (${run.quantileHigh}) quantiles across the ` +
    `simulations. The final median forecast is ${finalText} with the ` +
    `fan spanning ${fanText}. ${total} historical bars feed the pool.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

/**
 * ChartLineMonteCarlo -- single-panel pure-SVG Monte Carlo forecast
 * fan chart.
 */
export const ChartLineMonteCarlo = forwardRef<
  HTMLDivElement,
  ChartLineMonteCarloProps
>(function ChartLineMonteCarlo(props, ref) {
  const {
    data,
    horizon = DEFAULT_CHART_LINE_MONTE_CARLO_HORIZON,
    simulations = DEFAULT_CHART_LINE_MONTE_CARLO_SIMULATIONS,
    seed = DEFAULT_CHART_LINE_MONTE_CARLO_SEED,
    quantileLow = DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_LOW,
    quantileHigh = DEFAULT_CHART_LINE_MONTE_CARLO_QUANTILE_HIGH,
    width = DEFAULT_CHART_LINE_MONTE_CARLO_WIDTH,
    height = DEFAULT_CHART_LINE_MONTE_CARLO_HEIGHT,
    padding = DEFAULT_CHART_LINE_MONTE_CARLO_PADDING,
    tickCount = DEFAULT_CHART_LINE_MONTE_CARLO_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MONTE_CARLO_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MONTE_CARLO_DOT_RADIUS,
    fanOpacity = DEFAULT_CHART_LINE_MONTE_CARLO_FAN_OPACITY,
    historyColor = DEFAULT_CHART_LINE_MONTE_CARLO_HISTORY_COLOR,
    medianColor = DEFAULT_CHART_LINE_MONTE_CARLO_MEDIAN_COLOR,
    fanColor = DEFAULT_CHART_LINE_MONTE_CARLO_FAN_COLOR,
    bridgeColor = DEFAULT_CHART_LINE_MONTE_CARLO_BRIDGE_COLOR,
    gridColor = DEFAULT_CHART_LINE_MONTE_CARLO_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MONTE_CARLO_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFan = true,
    showMedian = true,
    showBridge = true,
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
  const baseId = `chart-line-monte-carlo-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineMonteCarloSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineMonteCarloSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineMonteCarloLayout({
        data,
        horizon,
        simulations,
        seed,
        quantileLow,
        quantileHigh,
        width,
        height,
        padding,
      }),
    [
      data,
      horizon,
      simulations,
      seed,
      quantileLow,
      quantileHigh,
      width,
      height,
      padding,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineMonteCarloChart(data, {
      horizon,
      simulations,
      seed,
      quantileLow,
      quantileHigh,
    });
  const resolvedLabel =
    ariaLabel ??
    `Monte Carlo forecast fan chart, horizon ${run.horizon}, simulations ${run.simulations}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineMonteCarloSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (markerIndex: number): void => {
    const marker = layout.markers[markerIndex];
    if (!marker) return;
    const step = run.forecast[markerIndex];
    if (step) onPointClick?.({ step });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    markerIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(markerIndex);
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

  const hoverMarker =
    hover !== null && layout.markers[hover] ? layout.markers[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverMarker && !isEmpty) {
    const tooltipW = 196;
    const rawX = hoverMarker.cx + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-monte-carlo-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={120}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-monte-carlo-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {`Step ${hoverMarker.step} (x=${formatX(hoverMarker.x)})`}
        </text>
        <text
          data-section="chart-line-monte-carlo-tooltip-median"
          x={tx + 10}
          y={ty + 35}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Median: ${formatValue(hoverMarker.median)}`}
        </text>
        <text
          data-section="chart-line-monte-carlo-tooltip-mean"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Mean: ${formatValue(hoverMarker.mean)}`}
        </text>
        <text
          data-section="chart-line-monte-carlo-tooltip-lower"
          x={tx + 10}
          y={ty + 67}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Lower: ${formatValue(hoverMarker.lower)}`}
        </text>
        <text
          data-section="chart-line-monte-carlo-tooltip-upper"
          x={tx + 10}
          y={ty + 83}
          fill="#86efac"
          fontSize={11}
        >
          {`Upper: ${formatValue(hoverMarker.upper)}`}
        </text>
        <text
          data-section="chart-line-monte-carlo-tooltip-width"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Fan width: ${formatValue(hoverMarker.upper - hoverMarker.lower)}`}
        </text>
      </g>
    );
  }

  const historyHidden = isHidden('history');
  const fanHidden = isHidden('fan') || !showFan;
  const medianHidden = isHidden('median') || !showMedian;

  const legendItems: Array<{
    id: ChartLineMonteCarloSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'history', label: 'History', color: historyColor },
    { id: 'median', label: 'Forecast median', color: medianColor },
    { id: 'fan', label: 'Forecast fan', color: fanColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-monte-carlo"
      data-empty={isEmpty ? 'true' : 'false'}
      data-horizon={run.horizon}
      data-simulations={run.simulations}
      data-seed={run.seed}
      data-quantile-low={run.quantileLow}
      data-quantile-high={run.quantileHigh}
      data-last-price={run.lastPrice === null ? '' : run.lastPrice}
      data-forecast-steps={run.forecast.length}
      data-history-points={run.history.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-monte-carlo-aria-desc"
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
          data-section="chart-line-monte-carlo-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-monte-carlo-empty"
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
          data-section="chart-line-monte-carlo-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-monte-carlo-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-monte-carlo-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-monte-carlo-axes">
              <line
                data-section="chart-line-monte-carlo-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-monte-carlo-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-monte-carlo-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-monte-carlo-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMin)}
              </text>
            </g>
          ) : null}

          <line
            data-section="chart-line-monte-carlo-forecast-divider"
            x1={layout.forecastStartX}
            y1={layout.innerTop}
            x2={layout.forecastStartX}
            y2={layout.innerBottom}
            stroke={bridgeColor}
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {!fanHidden ? (
            <path
              data-section="chart-line-monte-carlo-fan-band"
              d={layout.fanPath}
              fill={fanColor}
              fillOpacity={fanOpacity}
              stroke="none"
            />
          ) : null}

          {!historyHidden ? (
            <path
              data-section="chart-line-monte-carlo-history-path"
              d={layout.historyPath}
              fill="none"
              stroke={historyColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`History line, ${run.history.length} bars`}
            />
          ) : null}

          {!historyHidden && showDots ? (
            <g data-section="chart-line-monte-carlo-dots">
              {layout.historyDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-monte-carlo-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={historyColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
                    dot.value,
                  )}`}
                />
              ))}
            </g>
          ) : null}

          {!fanHidden ? (
            <g data-section="chart-line-monte-carlo-fan-lines">
              <path
                data-section="chart-line-monte-carlo-upper-line"
                d={layout.upperPath}
                fill="none"
                stroke={fanColor}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <path
                data-section="chart-line-monte-carlo-lower-line"
                d={layout.lowerPath}
                fill="none"
                stroke={fanColor}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            </g>
          ) : null}

          {showBridge ? (
            <path
              data-section="chart-line-monte-carlo-bridge"
              d={layout.bridgePath}
              fill="none"
              stroke={bridgeColor}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {!medianHidden ? (
            <path
              data-section="chart-line-monte-carlo-median-path"
              d={layout.medianPath}
              fill="none"
              stroke={medianColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Median forecast line, ${run.forecast.length} steps`}
            />
          ) : null}

          {!medianHidden && showMarkers ? (
            <g data-section="chart-line-monte-carlo-markers">
              {layout.markers.map((marker, j) => (
                <circle
                  key={`marker-${marker.step}`}
                  data-section="chart-line-monte-carlo-marker"
                  data-step={marker.step}
                  data-median={marker.median}
                  data-lower={marker.lower}
                  data-upper={marker.upper}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={medianColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Step ${marker.step}, median ${formatValue(
                    marker.median,
                  )}, fan ${formatValue(marker.lower)} to ${formatValue(marker.upper)}`}
                  onMouseEnter={() => setHover(j)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(j)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(j)}
                  onKeyDown={(e) => handleKey(e, j)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-monte-carlo-badge">
              <rect
                data-section="chart-line-monte-carlo-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-monte-carlo-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`MC H${run.horizon} S${run.simulations}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-monte-carlo-legend"
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
                data-section="chart-line-monte-carlo-legend-item"
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
                  data-section="chart-line-monte-carlo-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-monte-carlo-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-monte-carlo-legend-stats"
            style={{ color: axisColor }}
          >
            {`history ${run.history.length} / forecast ${run.forecast.length} / seed ${run.seed}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineMonteCarlo.displayName = 'ChartLineMonteCarlo';
