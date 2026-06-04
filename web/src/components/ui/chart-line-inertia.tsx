import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_INERTIA_WIDTH = 560;
export const DEFAULT_CHART_LINE_INERTIA_HEIGHT = 360;
export const DEFAULT_CHART_LINE_INERTIA_PADDING = 40;
export const DEFAULT_CHART_LINE_INERTIA_GAP = 12;
export const DEFAULT_CHART_LINE_INERTIA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_INERTIA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_INERTIA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD = 10;
export const DEFAULT_CHART_LINE_INERTIA_REG_PERIOD = 14;
export const DEFAULT_CHART_LINE_INERTIA_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_INERTIA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_INERTIA_INERTIA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_INERTIA_RVGI_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_INERTIA_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_INERTIA_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_INERTIA_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_INERTIA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_INERTIA_AXIS_COLOR = '#cbd5e1';

export type ChartLineInertiaZone = 'bull' | 'bear' | 'neutral' | 'none';

export interface ChartLineInertiaPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineInertiaSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rvgi: number | null;
  inertia: number | null;
  zone: ChartLineInertiaZone;
}

export interface ChartLineInertiaRun {
  series: ChartLineInertiaPoint[];
  vigorPeriod: number;
  regPeriod: number;
  rvgi: (number | null)[];
  inertia: (number | null)[];
  samples: ChartLineInertiaSample[];
  inertiaFinal: number;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineInertiaPriceDot {
  index: number;
  x: number;
  close: number;
  rvgi: number | null;
  inertia: number | null;
  zone: ChartLineInertiaZone;
  px: number;
  py: number;
}

export interface ChartLineInertiaMarker {
  index: number;
  x: number;
  inertia: number;
  zone: ChartLineInertiaZone;
  px: number;
  py: number;
}

export interface ChartLineInertiaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineInertiaLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineInertiaPanel;
  inertiaPanel: ChartLineInertiaPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  inertiaYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  inertiaYMin: number;
  inertiaYMax: number;
  pricePath: string;
  priceDots: ChartLineInertiaPriceDot[];
  inertiaPath: string;
  rvgiPath: string;
  markers: ChartLineInertiaMarker[];
  zeroY: number;
  vigorPeriod: number;
  regPeriod: number;
  inertiaFinal: number;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineInertiaLayoutOptions {
  data: readonly ChartLineInertiaPoint[];
  vigorPeriod?: number;
  regPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineInertiaProps {
  data: readonly ChartLineInertiaPoint[];
  vigorPeriod?: number;
  regPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  inertiaColor?: string;
  rvgiColor?: string;
  bullColor?: string;
  bearColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRvgi?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineInertiaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineInertiaFinitePoints(
  points: readonly ChartLineInertiaPoint[] | null | undefined,
): ChartLineInertiaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineInertiaPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.open) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * Coerce an Inertia vigor or regression length to an integer of
 * at least 2. A non-finite or sub-2 value falls back to
 * `fallback`; a fractional value floors.
 */
export function normalizeLineInertiaPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 2 ? fallback : p;
}

/**
 * The Relative Vigor Index over each trailing window of
 * `vigorPeriod` bars -- the sum of the close-minus-open spread
 * divided by the sum of the high-to-low range. It reads how
 * vigorously the closes finished against their opens relative to
 * the bar ranges. A window with no total range is null.
 */
export function computeLineInertiaRvgi(
  bars: readonly ChartLineInertiaPoint[] | null | undefined,
  vigorPeriod: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const p = normalizeLineInertiaPeriod(
    vigorPeriod,
    DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD,
  );
  const n = bars.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sumCo = 0;
    let sumHl = 0;
    let valid = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const b = bars[k];
      if (
        !b ||
        !isFiniteNumber(b.open) ||
        !isFiniteNumber(b.high) ||
        !isFiniteNumber(b.low) ||
        !isFiniteNumber(b.close)
      ) {
        valid = false;
        break;
      }
      sumCo += b.close - b.open;
      sumHl += b.high - b.low;
    }
    if (!valid || sumHl <= 0) continue;
    out[i] = sumCo / sumHl;
  }
  return out;
}

/**
 * A rolling linear regression smoothing -- for each bar, the
 * least-squares trend line is fit to the trailing `period`
 * values and evaluated at the endpoint. Bars whose window is not
 * fully defined are null.
 */
export function computeLineInertiaLinReg(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineInertiaPeriod(
    period,
    DEFAULT_CHART_LINE_INERTIA_REG_PERIOD,
  );
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let valid = true;
    for (let j = 0; j < p; j += 1) {
      const v = values[i - p + 1 + j];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sumX += j;
      sumY += v;
      sumXY += j * v;
      sumXX += j * j;
    }
    if (!valid) continue;
    const denom = p * sumXX - sumX * sumX;
    if (denom === 0) continue;
    const slope = (p * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / p;
    out[i] = intercept + slope * (p - 1);
  }
  return out;
}

/**
 * Donald Dorsey's Inertia -- the Relative Vigor Index passed
 * through a rolling linear regression smoothing.
 */
export function computeLineInertia(
  bars: readonly ChartLineInertiaPoint[] | null | undefined,
  vigorPeriod: number,
  regPeriod: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const rvgi = computeLineInertiaRvgi(bars, vigorPeriod);
  return computeLineInertiaLinReg(rvgi, regPeriod);
}

function classifyZone(inertia: number | null): ChartLineInertiaZone {
  if (inertia === null) return 'none';
  if (inertia > 0) return 'bull';
  if (inertia < 0) return 'bear';
  return 'neutral';
}

export function runLineInertia(
  points: readonly ChartLineInertiaPoint[] | null | undefined,
  options?: { vigorPeriod?: number; regPeriod?: number },
): ChartLineInertiaRun {
  const finite = getLineInertiaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const vigorPeriod = normalizeLineInertiaPeriod(
    options?.vigorPeriod ?? DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD,
    DEFAULT_CHART_LINE_INERTIA_VIGOR_PERIOD,
  );
  const regPeriod = normalizeLineInertiaPeriod(
    options?.regPeriod ?? DEFAULT_CHART_LINE_INERTIA_REG_PERIOD,
    DEFAULT_CHART_LINE_INERTIA_REG_PERIOD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      vigorPeriod,
      regPeriod,
      rvgi: [],
      inertia: [],
      samples: [],
      inertiaFinal: NaN,
      bullCount: 0,
      bearCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const rvgi = computeLineInertiaRvgi(series, vigorPeriod);
  const inertia = computeLineInertiaLinReg(rvgi, regPeriod);

  const samples: ChartLineInertiaSample[] = series.map((p, i) => {
    const v = inertia[i] ?? null;
    return {
      index: i,
      x: p.x,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      rvgi: rvgi[i] ?? null,
      inertia: v,
      zone: classifyZone(v),
    };
  });

  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  let inertiaFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bull') bullCount += 1;
    else if (s.zone === 'bear') bearCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.inertia !== null) inertiaFinal = s.inertia;
  }

  return {
    series,
    vigorPeriod,
    regPeriod,
    rvgi,
    inertia,
    samples,
    inertiaFinal,
    bullCount,
    bearCount,
    neutralCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineInertiaLayout(
  options: ComputeLineInertiaLayoutOptions,
): ChartLineInertiaLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_INERTIA_GAP,
    tickCount = DEFAULT_CHART_LINE_INERTIA_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_INERTIA_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineInertia(data, {
    ...(isFiniteNumber(options.vigorPeriod)
      ? { vigorPeriod: options.vigorPeriod }
      : {}),
    ...(isFiniteNumber(options.regPeriod)
      ? { regPeriod: options.regPeriod }
      : {}),
  });

  const emptyPanel: ChartLineInertiaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineInertiaLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    inertiaPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    inertiaYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    inertiaYMin: 0,
    inertiaYMax: 0,
    pricePath: '',
    priceDots: [],
    inertiaPath: '',
    rvgiPath: '',
    markers: [],
    zeroY: 0,
    vigorPeriod: run.vigorPeriod,
    regPeriod: run.regPeriod,
    inertiaFinal: NaN,
    bullCount: 0,
    bearCount: 0,
    neutralCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const inertiaHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineInertiaPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const inertiaPanel: ChartLineInertiaPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: inertiaHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let inertiaLo = 0;
  let inertiaHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < priceLo) priceLo = s.close;
    if (s.close > priceHi) priceHi = s.close;
    if (s.rvgi !== null) {
      if (s.rvgi < inertiaLo) inertiaLo = s.rvgi;
      if (s.rvgi > inertiaHi) inertiaHi = s.rvgi;
    }
    if (s.inertia !== null) {
      if (s.inertia < inertiaLo) inertiaLo = s.inertia;
      if (s.inertia > inertiaHi) inertiaHi = s.inertia;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (inertiaLo === inertiaHi) {
    inertiaLo -= 1;
    inertiaHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const inertiaRange = inertiaHi - inertiaLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectInertiaY = (v: number): number =>
    inertiaPanel.y +
    inertiaPanel.height -
    ((v - inertiaLo) / inertiaRange) * inertiaPanel.height;

  const priceDots: ChartLineInertiaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    rvgi: s.rvgi,
    inertia: s.inertia,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.close),
  }));

  const inertiaPts: { px: number; py: number }[] = [];
  const rvgiPts: { px: number; py: number }[] = [];
  const markers: ChartLineInertiaMarker[] = [];
  for (const s of run.samples) {
    if (s.rvgi !== null) {
      rvgiPts.push({ px: projectX(s.x), py: projectInertiaY(s.rvgi) });
    }
    if (s.inertia !== null) {
      const px = projectX(s.x);
      const py = projectInertiaY(s.inertia);
      inertiaPts.push({ px, py });
      if (s.zone !== 'none') {
        markers.push({
          index: s.index,
          x: s.x,
          inertia: s.inertia,
          zone: s.zone,
          px,
          py,
        });
      }
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    inertiaPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    inertiaYTicks: computeTicks(inertiaLo, inertiaHi, tickCount).map((v) => ({
      value: v,
      py: projectInertiaY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    inertiaYMin: inertiaLo,
    inertiaYMax: inertiaHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    inertiaPath: buildPath(inertiaPts),
    rvgiPath: buildPath(rvgiPts),
    markers,
    zeroY: projectInertiaY(0),
    vigorPeriod: run.vigorPeriod,
    regPeriod: run.regPeriod,
    inertiaFinal: run.inertiaFinal,
    bullCount: run.bullCount,
    bearCount: run.bearCount,
    neutralCount: run.neutralCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineInertiaChart(
  data: readonly ChartLineInertiaPoint[] | null | undefined,
  options?: { vigorPeriod?: number; regPeriod?: number },
): string {
  const run = runLineInertia(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with the Inertia indicator (vigor ${run.vigorPeriod}, regression ${run.regPeriod}): the top panel plots the close; the bottom panel plots the Inertia. The Relative Vigor Index measures how vigorously the closes finished against their opens relative to the bar ranges over the vigor window; the Inertia is that index passed through a rolling linear regression, the least-squares trend line evaluated at each bar. A positive Inertia marks upward vigor, a negative one downward. The Inertia is bullish on ${run.bullCount} bars, bearish on ${run.bearCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const INERTIA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineInertia = forwardRef<
  HTMLDivElement,
  ChartLineInertiaProps
>(function ChartLineInertia(
  props: ChartLineInertiaProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    vigorPeriod,
    regPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_INERTIA_WIDTH,
    height = DEFAULT_CHART_LINE_INERTIA_HEIGHT,
    padding = DEFAULT_CHART_LINE_INERTIA_PADDING,
    gap = DEFAULT_CHART_LINE_INERTIA_GAP,
    tickCount = DEFAULT_CHART_LINE_INERTIA_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_INERTIA_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_INERTIA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_INERTIA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_INERTIA_PRICE_COLOR,
    inertiaColor = DEFAULT_CHART_LINE_INERTIA_INERTIA_COLOR,
    rvgiColor = DEFAULT_CHART_LINE_INERTIA_RVGI_COLOR,
    bullColor = DEFAULT_CHART_LINE_INERTIA_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_INERTIA_BEAR_COLOR,
    zeroColor = DEFAULT_CHART_LINE_INERTIA_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_INERTIA_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_INERTIA_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRvgi = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Two-panel chart with the Inertia indicator',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineInertiaLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...(isFiniteNumber(vigorPeriod) ? { vigorPeriod } : {}),
        ...(isFiniteNumber(regPeriod) ? { regPeriod } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      gap,
      tickCount,
      pricePanelRatio,
      vigorPeriod,
      regPeriod,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineInertiaChart(data, {
        ...(isFiniteNumber(vigorPeriod) ? { vigorPeriod } : {}),
        ...(isFiniteNumber(regPeriod) ? { regPeriod } : {}),
      }),
    [ariaDescription, data, vigorPeriod, regPeriod],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-inertia"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-inertia-aria-desc"
          style={INERTIA_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const ip = layout.inertiaPanel;
  const priceVisible = !hiddenSet.has('price');
  const inertiaVisible = !hiddenSet.has('inertia');
  const rvgiVisible = showRvgi && !hiddenSet.has('rvgi');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineInertiaZone): string => {
    if (zone === 'bull') return bullColor;
    if (zone === 'bear') return bearColor;
    return inertiaColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'inertia', label: 'Inertia', color: inertiaColor },
    { id: 'rvgi', label: 'RVGI', color: rvgiColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={
        [className, animateClass].filter(Boolean).join(' ') || undefined
      }
      style={containerStyle}
      data-section="chart-line-inertia"
      data-empty="false"
      data-vigor-period={layout.vigorPeriod}
      data-reg-period={layout.regPeriod}
      data-inertia-final={layout.inertiaFinal}
      data-bull-count={layout.bullCount}
      data-bear-count={layout.bearCount}
      data-neutral-count={layout.neutralCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-inertia-aria-desc"
        style={INERTIA_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-inertia-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-inertia-badge"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-inertia-badge-icon"
              aria-hidden="true"
              style={{ color: inertiaColor }}
            >
              INRT
            </span>
            <span data-section="chart-line-inertia-badge-config">
              {layout.vigorPeriod}/{layout.regPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-inertia-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-inertia-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-inertia-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.inertiaYTicks.map((t, i) => (
                <line
                  key={`gi-${i}`}
                  data-section="chart-line-inertia-grid-line"
                  data-panel="inertia"
                  x1={ip.x}
                  x2={ip.x + ip.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-inertia-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-inertia-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-inertia-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-inertia-axis"
                data-panel="inertia"
                data-axis="y"
                x1={ip.x}
                y1={ip.y}
                x2={ip.x}
                y2={ip.y + ip.height}
              />
              <line
                data-section="chart-line-inertia-axis"
                data-panel="inertia"
                data-axis="x"
                x1={ip.x}
                y1={ip.y + ip.height}
                x2={ip.x + ip.width}
                y2={ip.y + ip.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-inertia-tick-label"
                  data-panel="price"
                  data-axis="y"
                  x={pp.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.inertiaYTicks.map((t, i) => (
                <text
                  key={`iyt-${i}`}
                  data-section="chart-line-inertia-tick-label"
                  data-panel="inertia"
                  data-axis="y"
                  x={ip.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.xTicks.map((t, i) => (
                <text
                  key={`xt-${i}`}
                  data-section="chart-line-inertia-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={ip.y + ip.height + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatX(t.value)}
                </text>
              ))}
            </g>
          ) : null}

          <text
            data-section="chart-line-inertia-panel-label"
            data-panel="price"
            x={pp.x + 2}
            y={pp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Price
          </text>
          <text
            data-section="chart-line-inertia-panel-label"
            data-panel="inertia"
            x={ip.x + 2}
            y={ip.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Inertia
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-inertia-zero-line"
              x1={ip.x}
              x2={ip.x + ip.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-inertia-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-inertia-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-inertia-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-close={d.close}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}

          {rvgiVisible && layout.rvgiPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Relative Vigor Index line"
              data-section="chart-line-inertia-rvgi-line"
              d={layout.rvgiPath}
              fill="none"
              stroke={rvgiColor}
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {inertiaVisible && layout.inertiaPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Inertia line"
              data-section="chart-line-inertia-inertia-line"
              d={layout.inertiaPath}
              fill="none"
              stroke={inertiaColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {inertiaVisible && showMarkers ? (
            <g data-section="chart-line-inertia-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Inertia at x ${formatX(m.x)}: ${formatValue(m.inertia)}, ${m.zone}`}
                    data-section="chart-line-inertia-marker"
                    data-point-index={m.index}
                    data-inertia={m.inertia}
                    data-zone={m.zone}
                    cx={m.px}
                    cy={m.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={zoneColor(m.zone)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-inertia-tooltip"
                  data-point-index={d.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-inertia-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-inertia-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-inertia-tooltip-rvgi">
                    rvgi: {fmtNullable(d.rvgi)}
                  </div>
                  <div data-section="chart-line-inertia-tooltip-inertia">
                    inertia: {fmtNullable(d.inertia)}
                  </div>
                  <div data-section="chart-line-inertia-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-inertia-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-inertia-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-inertia-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-inertia-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-inertia-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bullCount} bull, {layout.bearCount} bear,{' '}
            {layout.neutralCount} neutral
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineInertia.displayName = 'ChartLineInertia';
