import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CAMARILLA_WIDTH = 560;
export const DEFAULT_CHART_LINE_CAMARILLA_HEIGHT = 360;
export const DEFAULT_CHART_LINE_CAMARILLA_PADDING = 40;
export const DEFAULT_CHART_LINE_CAMARILLA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CAMARILLA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CAMARILLA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CAMARILLA_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CAMARILLA_RESISTANCE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CAMARILLA_SUPPORT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CAMARILLA_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CAMARILLA_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CAMARILLA_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CAMARILLA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CAMARILLA_AXIS_COLOR = '#cbd5e1';

export type ChartLineCamarillaZone = 'bull' | 'bear' | 'neutral' | 'none';

export interface ChartLineCamarillaPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartLineCamarillaPivots {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export interface ChartLineCamarillaLevels {
  r1: (number | null)[];
  r2: (number | null)[];
  r3: (number | null)[];
  r4: (number | null)[];
  s1: (number | null)[];
  s2: (number | null)[];
  s3: (number | null)[];
  s4: (number | null)[];
}

export interface ChartLineCamarillaSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  s4: number | null;
  zone: ChartLineCamarillaZone;
}

export interface ChartLineCamarillaRun {
  series: ChartLineCamarillaPoint[];
  r1: (number | null)[];
  r2: (number | null)[];
  r3: (number | null)[];
  r4: (number | null)[];
  s1: (number | null)[];
  s2: (number | null)[];
  s3: (number | null)[];
  s4: (number | null)[];
  samples: ChartLineCamarillaSample[];
  r3Final: number;
  s3Final: number;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineCamarillaPriceDot {
  index: number;
  x: number;
  close: number;
  r3: number | null;
  s3: number | null;
  zone: ChartLineCamarillaZone;
  px: number;
  py: number;
}

export interface ChartLineCamarillaMarker {
  index: number;
  x: number;
  close: number;
  zone: ChartLineCamarillaZone;
  px: number;
  py: number;
}

export interface ChartLineCamarillaLevelLine {
  key: 'r1' | 'r2' | 'r3' | 'r4' | 's1' | 's2' | 's3' | 's4';
  kind: 'resistance' | 'support';
  path: string;
}

export interface ChartLineCamarillaPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineCamarillaLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: ChartLineCamarillaPanel;
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineCamarillaPriceDot[];
  levelLines: ChartLineCamarillaLevelLine[];
  markers: ChartLineCamarillaMarker[];
  r3Final: number;
  s3Final: number;
  bullCount: number;
  bearCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineCamarillaLayoutOptions {
  data: readonly ChartLineCamarillaPoint[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineCamarillaProps {
  data: readonly ChartLineCamarillaPoint[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  resistanceColor?: string;
  supportColor?: string;
  bullColor?: string;
  bearColor?: string;
  neutralColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showResistance?: boolean;
  showSupport?: boolean;
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
  onPointClick?: (payload: { point: ChartLineCamarillaPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineCamarillaFinitePoints(
  points: readonly ChartLineCamarillaPoint[] | null | undefined,
): ChartLineCamarillaPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineCamarillaPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.high) &&
      isFiniteNumber(p.low) &&
      isFiniteNumber(p.close),
  );
}

/**
 * The Camarilla pivot levels for one bar's high, low and close.
 * Each level offsets the close by a Camarilla fraction of the
 * range -- `range * 1.1 / 12`, `/ 6`, `/ 4`, `/ 2` -- evaluated
 * as the exact rationals `11/120`, `11/60`, `11/40`, `11/20`.
 * R1..R4 sit above the close, S1..S4 below.
 */
export function computeLineCamarillaPivots(
  high: number,
  low: number,
  close: number,
): ChartLineCamarillaPivots {
  const range = high - low;
  const o1 = (range * 11) / 120;
  const o2 = (range * 11) / 60;
  const o3 = (range * 11) / 40;
  const o4 = (range * 11) / 20;
  return {
    r1: close + o1,
    r2: close + o2,
    r3: close + o3,
    r4: close + o4,
    s1: close - o1,
    s2: close - o2,
    s3: close - o3,
    s4: close - o4,
  };
}

/**
 * The per-bar Camarilla pivot levels. Each bar's eight levels are
 * derived from the prior bar's high, low and close. The opening
 * bar has no prior bar and is null.
 */
export function computeLineCamarilla(
  bars: readonly ChartLineCamarillaPoint[] | null | undefined,
): ChartLineCamarillaLevels {
  const n = Array.isArray(bars) ? bars.length : 0;
  const mk = (): (number | null)[] => new Array(n).fill(null);
  const r1 = mk();
  const r2 = mk();
  const r3 = mk();
  const r4 = mk();
  const s1 = mk();
  const s2 = mk();
  const s3 = mk();
  const s4 = mk();
  if (!Array.isArray(bars)) return { r1, r2, r3, r4, s1, s2, s3, s4 };
  for (let i = 1; i < n; i += 1) {
    const prev = bars[i - 1];
    if (
      !prev ||
      !isFiniteNumber(prev.high) ||
      !isFiniteNumber(prev.low) ||
      !isFiniteNumber(prev.close)
    ) {
      continue;
    }
    const p = computeLineCamarillaPivots(prev.high, prev.low, prev.close);
    if (
      !isFiniteNumber(p.r1) ||
      !isFiniteNumber(p.r4) ||
      !isFiniteNumber(p.s1) ||
      !isFiniteNumber(p.s4)
    ) {
      continue;
    }
    r1[i] = p.r1;
    r2[i] = p.r2;
    r3[i] = p.r3;
    r4[i] = p.r4;
    s1[i] = p.s1;
    s2[i] = p.s2;
    s3[i] = p.s3;
    s4[i] = p.s4;
  }
  return { r1, r2, r3, r4, s1, s2, s3, s4 };
}

function classifyZone(
  close: number,
  r3: number | null,
  s3: number | null,
): ChartLineCamarillaZone {
  if (r3 === null || s3 === null) return 'none';
  if (close > r3) return 'bull';
  if (close < s3) return 'bear';
  return 'neutral';
}

export function runLineCamarilla(
  points: readonly ChartLineCamarillaPoint[] | null | undefined,
): ChartLineCamarillaRun {
  const finite = getLineCamarillaFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const n = series.length;

  if (n < 2) {
    return {
      series,
      r1: [],
      r2: [],
      r3: [],
      r4: [],
      s1: [],
      s2: [],
      s3: [],
      s4: [],
      samples: [],
      r3Final: NaN,
      s3Final: NaN,
      bullCount: 0,
      bearCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const levels = computeLineCamarilla(series);

  const samples: ChartLineCamarillaSample[] = series.map((p, i) => {
    const r3 = levels.r3[i] ?? null;
    const s3 = levels.s3[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      r1: levels.r1[i] ?? null,
      r2: levels.r2[i] ?? null,
      r3,
      r4: levels.r4[i] ?? null,
      s1: levels.s1[i] ?? null,
      s2: levels.s2[i] ?? null,
      s3,
      s4: levels.s4[i] ?? null,
      zone: classifyZone(p.close, r3, s3),
    };
  });

  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  let r3Final = NaN;
  let s3Final = NaN;
  for (const s of samples) {
    if (s.zone === 'bull') bullCount += 1;
    else if (s.zone === 'bear') bearCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.r3 !== null) r3Final = s.r3;
    if (s.s3 !== null) s3Final = s.s3;
  }

  return {
    series = [],
    r1: levels.r1,
    r2: levels.r2,
    r3: levels.r3,
    r4: levels.r4,
    s1: levels.s1,
    s2: levels.s2,
    s3: levels.s3,
    s4: levels.s4,
    samples,
    r3Final,
    s3Final,
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

const LEVEL_KEYS: {
  key: ChartLineCamarillaLevelLine['key'];
  kind: ChartLineCamarillaLevelLine['kind'];
}[] = [
  { key: 'r4', kind: 'resistance' },
  { key: 'r3', kind: 'resistance' },
  { key: 'r2', kind: 'resistance' },
  { key: 'r1', kind: 'resistance' },
  { key: 's1', kind: 'support' },
  { key: 's2', kind: 'support' },
  { key: 's3', kind: 'support' },
  { key: 's4', kind: 'support' },
];

export function computeLineCamarillaLayout(
  options: ComputeLineCamarillaLayoutOptions,
): ChartLineCamarillaLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_CAMARILLA_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineCamarilla(data);

  const emptyPanel: ChartLineCamarillaPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineCamarillaLayout = {
    ok: false,
    width,
    height,
    panel: emptyPanel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    levelLines: [],
    markers: [],
    r3Final: NaN,
    s3Final: NaN,
    bullCount: 0,
    bearCount: 0,
    neutralCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel: ChartLineCamarillaPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.close < yLo) yLo = s.close;
    if (s.close > yHi) yHi = s.close;
    for (const v of [s.r4, s.s4]) {
      if (v !== null) {
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineCamarillaPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    close: s.close,
    r3: s.r3,
    s3: s.s3,
    zone: s.zone,
    px: projectX(s.x),
    py: projectY(s.close),
  }));

  const levelLines: ChartLineCamarillaLevelLine[] = [];
  for (const { key, kind } of LEVEL_KEYS) {
    const pts: { px: number; py: number }[] = [];
    for (const s of run.samples) {
      const v = s[key];
      if (v !== null) pts.push({ px: projectX(s.x), py: projectY(v) });
    }
    const path = buildPath(pts);
    if (path) levelLines.push({ key, kind, path });
  }

  const markers: ChartLineCamarillaMarker[] = run.samples
    .filter((s) => s.zone !== 'none')
    .map((s) => ({
      index: s.index,
      x: s.x,
      close: s.close,
      zone: s.zone,
      px: projectX(s.x),
      py: projectY(s.close),
    }));

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    levelLines,
    markers,
    r3Final: run.r3Final,
    s3Final: run.s3Final,
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

export function describeLineCamarillaChart(
  data: readonly ChartLineCamarillaPoint[] | null | undefined,
): string {
  const run = runLineCamarilla(data);
  if (!run.ok) return 'No data';
  return `Single-panel line chart with Camarilla pivot levels: the price line is overlaid with eight pivot levels derived from the prior bar's high, low and close. The four resistance levels R1 to R4 sit above the prior close and the four support levels S1 to S4 below it, each offset by a Camarilla fraction of the prior bar's range. R3 and S3 are the reversal levels; R4 and S4 mark breakouts. The close clears R3 on ${run.bullCount} bars, breaks S3 on ${run.bearCount} and holds between them on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const CAMARILLA_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineCamarilla = forwardRef<
  HTMLDivElement,
  ChartLineCamarillaProps
>(function ChartLineCamarilla(
  props: ChartLineCamarillaProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_CAMARILLA_WIDTH,
    height = DEFAULT_CHART_LINE_CAMARILLA_HEIGHT,
    padding = DEFAULT_CHART_LINE_CAMARILLA_PADDING,
    tickCount = DEFAULT_CHART_LINE_CAMARILLA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CAMARILLA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CAMARILLA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CAMARILLA_PRICE_COLOR,
    resistanceColor = DEFAULT_CHART_LINE_CAMARILLA_RESISTANCE_COLOR,
    supportColor = DEFAULT_CHART_LINE_CAMARILLA_SUPPORT_COLOR,
    bullColor = DEFAULT_CHART_LINE_CAMARILLA_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_CAMARILLA_BEAR_COLOR,
    neutralColor = DEFAULT_CHART_LINE_CAMARILLA_NEUTRAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_CAMARILLA_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CAMARILLA_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showResistance = true,
    showSupport = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Camarilla pivot levels',
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
      computeLineCamarillaLayout({ data, width, height, padding, tickCount }),
    [data, width, height, padding, tickCount],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineCamarillaChart(data),
    [ariaDescription, data],
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
        data-section="chart-line-camarilla"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-camarilla-aria-desc"
          style={CAMARILLA_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const panel = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const resistanceVisible = showResistance && !hiddenSet.has('resistance');
  const supportVisible = showSupport && !hiddenSet.has('support');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineCamarillaZone): string => {
    if (zone === 'bull') return bullColor;
    if (zone === 'bear') return bearColor;
    return neutralColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'resistance', label: 'Resistance', color: resistanceColor },
    { id: 'support', label: 'Support', color: supportColor },
  ];

  const visibleLevels = layout.levelLines.filter((l) =>
    l.kind === 'resistance' ? resistanceVisible : supportVisible,
  );

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
      data-section="chart-line-camarilla"
      data-empty="false"
      data-r3-final={layout.r3Final}
      data-s3-final={layout.s3Final}
      data-bull-count={layout.bullCount}
      data-bear-count={layout.bearCount}
      data-neutral-count={layout.neutralCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-camarilla-aria-desc"
        style={CAMARILLA_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-camarilla-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-camarilla-badge"
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
              data-section="chart-line-camarilla-badge-icon"
              aria-hidden="true"
              style={{ color: resistanceColor }}
            >
              CAM
            </span>
            <span data-section="chart-line-camarilla-badge-config">
              {layout.totalPoints} bars
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-camarilla-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-camarilla-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-camarilla-grid-line"
                  x1={panel.x}
                  x2={panel.x + panel.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-camarilla-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-camarilla-axis"
                data-axis="y"
                x1={panel.x}
                y1={panel.y}
                x2={panel.x}
                y2={panel.y + panel.height}
              />
              <line
                data-section="chart-line-camarilla-axis"
                data-axis="x"
                x1={panel.x}
                y1={panel.y + panel.height}
                x2={panel.x + panel.width}
                y2={panel.y + panel.height}
              />
              {layout.yTicks.map((t, i) => (
                <text
                  key={`yt-${i}`}
                  data-section="chart-line-camarilla-tick-label"
                  data-axis="y"
                  x={panel.x - 6}
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
                  data-section="chart-line-camarilla-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={panel.y + panel.height + 14}
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

          <g data-section="chart-line-camarilla-levels">
            {visibleLevels.map((l) => (
              <path
                key={l.key}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Camarilla ${l.key.toUpperCase()} level`}
                data-section="chart-line-camarilla-level-line"
                data-level={l.key}
                data-kind={l.kind}
                d={l.path}
                fill="none"
                stroke={l.kind === 'resistance' ? resistanceColor : supportColor}
                strokeWidth={l.key === 'r3' || l.key === 's3' ? 1.5 : 1}
                strokeDasharray={l.key === 'r4' || l.key === 's4' ? '5 3' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-camarilla-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-camarilla-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, close ${formatValue(d.close)}`}
                    data-section="chart-line-camarilla-dot"
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

          {priceVisible && showMarkers ? (
            <g data-section="chart-line-camarilla-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${m.index + 1} at x ${formatX(m.x)}: close ${formatValue(m.close)}, ${m.zone}`}
                    data-section="chart-line-camarilla-marker"
                    data-point-index={m.index}
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
                  data-section="chart-line-camarilla-tooltip"
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
                  <div data-section="chart-line-camarilla-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-camarilla-tooltip-close"
                    style={{ fontWeight: 600 }}
                  >
                    close: {formatValue(d.close)}
                  </div>
                  <div data-section="chart-line-camarilla-tooltip-r3">
                    R3: {fmtNullable(d.r3)}
                  </div>
                  <div data-section="chart-line-camarilla-tooltip-s3">
                    S3: {fmtNullable(d.s3)}
                  </div>
                  <div data-section="chart-line-camarilla-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-camarilla-legend"
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
                data-section="chart-line-camarilla-legend-item"
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
                  data-section="chart-line-camarilla-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-camarilla-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-camarilla-legend-stats"
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

ChartLineCamarilla.displayName = 'ChartLineCamarilla';
