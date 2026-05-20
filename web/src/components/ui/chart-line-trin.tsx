import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TRIN_WIDTH = 560;
export const DEFAULT_CHART_LINE_TRIN_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TRIN_PADDING = 40;
export const DEFAULT_CHART_LINE_TRIN_GAP = 12;
export const DEFAULT_CHART_LINE_TRIN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIN_THRESHOLD = 0.2;
export const DEFAULT_CHART_LINE_TRIN_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TRIN_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TRIN_TRIN_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIN_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIN_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIN_BALANCE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIN_AXIS_COLOR = '#cbd5e1';

export type ChartLineTrinZone = 'bullish' | 'bearish' | 'neutral' | 'none';

export interface ChartLineTrinPoint {
  x: number;
  value: number;
  advIssues: number;
  decIssues: number;
  advVolume: number;
  decVolume: number;
}

export interface ChartLineTrinSample {
  index: number;
  x: number;
  value: number;
  advIssues: number;
  decIssues: number;
  advVolume: number;
  decVolume: number;
  trin: number | null;
  zone: ChartLineTrinZone;
}

export interface ChartLineTrinRun {
  series: ChartLineTrinPoint[];
  threshold: number;
  trin: (number | null)[];
  samples: ChartLineTrinSample[];
  trinFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineTrinPriceDot {
  index: number;
  x: number;
  value: number;
  trin: number | null;
  zone: ChartLineTrinZone;
  px: number;
  py: number;
}

export interface ChartLineTrinMarker {
  index: number;
  x: number;
  trin: number;
  zone: ChartLineTrinZone;
  px: number;
  py: number;
}

export interface ChartLineTrinPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineTrinLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineTrinPanel;
  trinPanel: ChartLineTrinPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  trinYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  trinYMin: number;
  trinYMax: number;
  pricePath: string;
  priceDots: ChartLineTrinPriceDot[];
  trinPath: string;
  trinMarkers: ChartLineTrinMarker[];
  balanceY: number;
  bullishY: number;
  bearishY: number;
  threshold: number;
  trinFinal: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineTrinLayoutOptions {
  data: readonly ChartLineTrinPoint[];
  threshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineTrinProps {
  data: readonly ChartLineTrinPoint[];
  threshold?: number;
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
  trinColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  balanceColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrin?: boolean;
  showLevels?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineTrinPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTrinFinitePoints(
  points: readonly ChartLineTrinPoint[] | null | undefined,
): ChartLineTrinPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTrinPoint =>
      !!p &&
      isFiniteNumber(p.x) &&
      isFiniteNumber(p.value) &&
      isFiniteNumber(p.advIssues) &&
      isFiniteNumber(p.decIssues) &&
      isFiniteNumber(p.advVolume) &&
      isFiniteNumber(p.decVolume) &&
      p.advIssues >= 0 &&
      p.decIssues >= 0 &&
      p.advVolume >= 0 &&
      p.decVolume >= 0,
  );
}

/**
 * Coerce an Arms Index neutral-band half-width. A non-finite
 * value, or one outside `(0, 1)`, falls back to `fallback`.
 */
export function normalizeLineTrinThreshold(
  threshold: number,
  fallback: number,
): number {
  if (!isFiniteNumber(threshold) || threshold <= 0 || threshold >= 1) {
    return fallback;
  }
  return threshold;
}

/**
 * The Arms Index (TRIN) for one bar -- the ratio of the
 * advance/decline issue ratio to the advance/decline volume
 * ratio:
 *
 *   TRIN = (advIssues / decIssues) / (advVolume / decVolume)
 *
 * computed in the cross-multiplied form
 * `(advIssues * decVolume) / (decIssues * advVolume)`. A zero in
 * the denominator (no declining issues or no advancing volume)
 * returns null.
 */
export function computeLineTrinValue(
  advIssues: number,
  decIssues: number,
  advVolume: number,
  decVolume: number,
): number | null {
  if (
    !isFiniteNumber(advIssues) ||
    !isFiniteNumber(decIssues) ||
    !isFiniteNumber(advVolume) ||
    !isFiniteNumber(decVolume)
  ) {
    return null;
  }
  const denom = decIssues * advVolume;
  if (denom === 0) return null;
  return (advIssues * decVolume) / denom;
}

/**
 * The TRIN for each point of a series.
 */
export function computeLineTrin(
  points: readonly ChartLineTrinPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(points)) return [];
  return points.map((p) =>
    computeLineTrinValue(p.advIssues, p.decIssues, p.advVolume, p.decVolume),
  );
}

function classifyZone(
  trin: number | null,
  threshold: number,
): ChartLineTrinZone {
  if (trin === null) return 'none';
  if (trin < 1 - threshold) return 'bullish';
  if (trin > 1 + threshold) return 'bearish';
  return 'neutral';
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function runLineTrin(
  points: readonly ChartLineTrinPoint[] | null | undefined,
  options?: { threshold?: number },
): ChartLineTrinRun {
  const finite = getLineTrinFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineTrinThreshold(
    options?.threshold ?? DEFAULT_CHART_LINE_TRIN_THRESHOLD,
    DEFAULT_CHART_LINE_TRIN_THRESHOLD,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      threshold,
      trin: [],
      samples: [],
      trinFinal: NaN,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      ok: false,
    };
  }

  const trin = computeLineTrin(series);

  const samples: ChartLineTrinSample[] = series.map((p, i) => {
    const t = trin[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      advIssues: p.advIssues,
      decIssues: p.decIssues,
      advVolume: p.advVolume,
      decVolume: p.decVolume,
      trin: t,
      zone: classifyZone(t, threshold),
    };
  });

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let trinFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    if (s.trin !== null) trinFinal = s.trin;
  }

  return {
    series,
    threshold,
    trin,
    samples,
    trinFinal,
    bullishCount,
    bearishCount,
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

export function computeLineTrinLayout(
  options: ComputeLineTrinLayoutOptions,
): ChartLineTrinLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_TRIN_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIN_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TRIN_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineTrin(data, {
    ...(isFiniteNumber(options.threshold)
      ? { threshold: options.threshold }
      : {}),
  });

  const emptyPanel: ChartLineTrinPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineTrinLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    trinPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    trinYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    trinYMin: 0,
    trinYMax: 0,
    pricePath: '',
    priceDots: [],
    trinPath: '',
    trinMarkers: [],
    balanceY: 0,
    bullishY: 0,
    bearishY: 0,
    threshold: run.threshold,
    trinFinal: NaN,
    bullishCount: 0,
    bearishCount: 0,
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
  const trinHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineTrinPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const trinPanel: ChartLineTrinPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: trinHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let trinLo = 1 - run.threshold;
  let trinHi = 1 + run.threshold;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.trin !== null) {
      if (s.trin < trinLo) trinLo = s.trin;
      if (s.trin > trinHi) trinHi = s.trin;
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
  if (trinLo === trinHi) {
    trinLo -= 1;
    trinHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const trinRange = trinHi - trinLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectTrinY = (v: number): number =>
    trinPanel.y +
    trinPanel.height -
    ((v - trinLo) / trinRange) * trinPanel.height;

  const priceDots: ChartLineTrinPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    trin: s.trin,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const trinPts: { px: number; py: number }[] = [];
  const trinMarkers: ChartLineTrinMarker[] = [];
  for (const s of run.samples) {
    if (s.trin === null) continue;
    const px = projectX(s.x);
    const py = projectTrinY(s.trin);
    trinPts.push({ px, py });
    trinMarkers.push({
      index: s.index,
      x: s.x,
      trin: s.trin,
      zone: s.zone,
      px,
      py,
    });
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    trinPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    trinYTicks: computeTicks(trinLo, trinHi, tickCount).map((v) => ({
      value: v,
      py: projectTrinY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    trinYMin: trinLo,
    trinYMax: trinHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    trinPath: buildPath(trinPts),
    trinMarkers,
    balanceY: projectTrinY(1),
    bullishY: projectTrinY(1 - run.threshold),
    bearishY: projectTrinY(1 + run.threshold),
    threshold: run.threshold,
    trinFinal: run.trinFinal,
    bullishCount: run.bullishCount,
    bearishCount: run.bearishCount,
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

export function describeLineTrinChart(
  data: readonly ChartLineTrinPoint[] | null | undefined,
  options?: { threshold?: number },
): string {
  const run = runLineTrin(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with an Arms Index (TRIN): the top panel plots the market index; the bottom panel plots the TRIN. The TRIN is the ratio of two ratios -- the advance/decline issue ratio (advancing issues over declining issues) divided by the advance/decline volume ratio (advancing volume over declining volume). A TRIN of 1 means volume is spread in proportion to the issue counts; a TRIN below 1 is bullish, with volume concentrated in the advancing stocks; above 1 is bearish. The TRIN is bullish on ${run.bullishCount} bars, bearish on ${run.bearishCount} and neutral on ${run.neutralCount} across ${run.samples.length} bars.`;
}

const TRIN_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineTrin = forwardRef<HTMLDivElement, ChartLineTrinProps>(
  function ChartLineTrin(
    props: ChartLineTrinProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      threshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_TRIN_WIDTH,
      height = DEFAULT_CHART_LINE_TRIN_HEIGHT,
      padding = DEFAULT_CHART_LINE_TRIN_PADDING,
      gap = DEFAULT_CHART_LINE_TRIN_GAP,
      tickCount = DEFAULT_CHART_LINE_TRIN_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_TRIN_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_TRIN_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TRIN_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TRIN_PRICE_COLOR,
      trinColor = DEFAULT_CHART_LINE_TRIN_TRIN_COLOR,
      bullishColor = DEFAULT_CHART_LINE_TRIN_BULLISH_COLOR,
      bearishColor = DEFAULT_CHART_LINE_TRIN_BEARISH_COLOR,
      balanceColor = DEFAULT_CHART_LINE_TRIN_BALANCE_COLOR,
      gridColor = DEFAULT_CHART_LINE_TRIN_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TRIN_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTrin = true,
      showLevels = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Two-panel chart with an Arms Index TRIN',
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
        computeLineTrinLayout({
          data,
          width,
          height,
          padding,
          gap,
          tickCount,
          pricePanelRatio,
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        threshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineTrinChart(data, {
          ...(isFiniteNumber(threshold) ? { threshold } : {}),
        }),
      [ariaDescription, data, threshold],
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
          data-section="chart-line-trin"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-trin-aria-desc"
            style={TRIN_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const tp = layout.trinPanel;
    const priceVisible = !hiddenSet.has('price');
    const trinVisible = showTrin && !hiddenSet.has('trin');
    const levelsVisible = showLevels && !hiddenSet.has('levels');

    const fmtNullable = (v: number | null): string =>
      v === null ? 'n/a' : formatValue(v);

    const zoneColor = (zone: ChartLineTrinZone): string => {
      if (zone === 'bullish') return bullishColor;
      if (zone === 'bearish') return bearishColor;
      return trinColor;
    };

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'trin', label: 'TRIN', color: trinColor },
      { id: 'levels', label: 'Levels', color: balanceColor },
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
        data-section="chart-line-trin"
        data-empty="false"
        data-threshold={layout.threshold}
        data-trin-final={layout.trinFinal}
        data-bullish-count={layout.bullishCount}
        data-bearish-count={layout.bearishCount}
        data-neutral-count={layout.neutralCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-trin-aria-desc"
          style={TRIN_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-trin-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-trin-badge"
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
                data-section="chart-line-trin-badge-icon"
                aria-hidden="true"
                style={{ color: trinColor }}
              >
                TRIN
              </span>
              <span data-section="chart-line-trin-badge-config">
                {layout.threshold}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-trin-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-trin-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`gp-${i}`}
                    data-section="chart-line-trin-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.trinYTicks.map((t, i) => (
                  <line
                    key={`gt-${i}`}
                    data-section="chart-line-trin-grid-line"
                    data-panel="trin"
                    x1={tp.x}
                    x2={tp.x + tp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-trin-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-trin-axis"
                  data-panel="price"
                  data-axis="y"
                  x1={pp.x}
                  y1={pp.y}
                  x2={pp.x}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-trin-axis"
                  data-panel="price"
                  data-axis="x"
                  x1={pp.x}
                  y1={pp.y + pp.height}
                  x2={pp.x + pp.width}
                  y2={pp.y + pp.height}
                />
                <line
                  data-section="chart-line-trin-axis"
                  data-panel="trin"
                  data-axis="y"
                  x1={tp.x}
                  y1={tp.y}
                  x2={tp.x}
                  y2={tp.y + tp.height}
                />
                <line
                  data-section="chart-line-trin-axis"
                  data-panel="trin"
                  data-axis="x"
                  x1={tp.x}
                  y1={tp.y + tp.height}
                  x2={tp.x + tp.width}
                  y2={tp.y + tp.height}
                />
                {layout.priceYTicks.map((t, i) => (
                  <text
                    key={`pyt-${i}`}
                    data-section="chart-line-trin-tick-label"
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
                {layout.trinYTicks.map((t, i) => (
                  <text
                    key={`tyt-${i}`}
                    data-section="chart-line-trin-tick-label"
                    data-panel="trin"
                    data-axis="y"
                    x={tp.x - 6}
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
                    data-section="chart-line-trin-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={tp.y + tp.height + 14}
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
              data-section="chart-line-trin-panel-label"
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
              data-section="chart-line-trin-panel-label"
              data-panel="trin"
              x={tp.x + 2}
              y={tp.y + 10}
              fontSize={10}
              fontWeight={600}
              fill={axisColor}
              stroke="none"
            >
              TRIN
            </text>

            {levelsVisible ? (
              <g data-section="chart-line-trin-levels">
                <line
                  data-section="chart-line-trin-level-line"
                  data-level="bearish"
                  x1={tp.x}
                  x2={tp.x + tp.width}
                  y1={layout.bearishY}
                  y2={layout.bearishY}
                  stroke={bearishColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-trin-level-line"
                  data-level="balance"
                  x1={tp.x}
                  x2={tp.x + tp.width}
                  y1={layout.balanceY}
                  y2={layout.balanceY}
                  stroke={balanceColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-trin-level-line"
                  data-level="bullish"
                  x1={tp.x}
                  x2={tp.x + tp.width}
                  y1={layout.bullishY}
                  y2={layout.bullishY}
                  stroke={bullishColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Market index line"
                data-section="chart-line-trin-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-trin-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-trin-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
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

            {trinVisible && layout.trinPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Arms Index TRIN line"
                data-section="chart-line-trin-trin-line"
                d={layout.trinPath}
                fill="none"
                stroke={trinColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {trinVisible ? (
              <g data-section="chart-line-trin-markers">
                {layout.trinMarkers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`TRIN at x ${formatX(m.x)}: ${formatValue(m.trin)}, ${m.zone}`}
                      data-section="chart-line-trin-marker"
                      data-point-index={m.index}
                      data-trin={m.trin}
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
                    data-section="chart-line-trin-tooltip"
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
                      minWidth: 140,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-trin-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-trin-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-trin-tooltip-trin">
                      trin: {fmtNullable(d.trin)}
                    </div>
                    <div data-section="chart-line-trin-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-trin-legend"
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
                  data-section="chart-line-trin-legend-item"
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
                    data-section="chart-line-trin-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-trin-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-trin-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.bullishCount} bullish, {layout.bearishCount} bearish
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineTrin.displayName = 'ChartLineTrin';
