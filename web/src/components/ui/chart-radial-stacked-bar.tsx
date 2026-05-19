import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_RADIAL_STACKED_BAR_WIDTH = 380;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_HEIGHT = 380;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_PADDING = 32;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_INNER_RADIUS = 36;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_RING_GAP = 6;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_PAD_ANGLE = 0.01;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_FILL_OPACITY = 0.85;
export const DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export interface ChartRadialStackedBarSeries {
  id: string;
  label: string;
  color?: string;
}

export interface ChartRadialStackedBarCategory {
  id: string;
  label: string;
  values: readonly number[];
}

export interface ChartRadialStackedBarSegment {
  categoryId: string;
  categoryIndex: number;
  seriesId: string;
  seriesIndex: number;
  value: number;
  shareWithinCategory: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  color: string;
  path: string;
}

export interface ChartRadialStackedBarRing {
  id: string;
  index: number;
  label: string;
  innerRadius: number;
  outerRadius: number;
  total: number;
  segments: ChartRadialStackedBarSegment[];
}

export interface ComputeRadialStackedBarLayoutResult {
  rings: ChartRadialStackedBarRing[];
  visibleSeriesCount: number;
  totalsByCategory: number[];
  ringThickness: number;
  outerRadius: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getRadialStackedBarDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE[0]!;
  }
  return DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE[
    Math.floor(index) % DEFAULT_CHART_RADIAL_STACKED_BAR_PALETTE.length
  ]!;
}

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function getRadialStackedBarCategoryTotal(
  values: readonly number[],
  hidden: ReadonlySet<number>
): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    if (hidden.has(i)) continue;
    const v = values[i];
    if (isFiniteNumber(v) && v > 0) total += v;
  }
  return total;
}

function buildArcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  if (outerR <= 0) return '';
  const safeInner = Math.max(0, Math.min(innerR, outerR));
  const span = endAngle - startAngle;
  if (!Number.isFinite(span) || span <= 0) return '';
  if (span >= Math.PI * 2 - 1e-9) {
    const oTop = polarToCartesian(cx, cy, outerR, 0);
    const oBot = polarToCartesian(cx, cy, outerR, Math.PI);
    if (safeInner > 0) {
      const iTop = polarToCartesian(cx, cy, safeInner, 0);
      const iBot = polarToCartesian(cx, cy, safeInner, Math.PI);
      return [
        `M ${oTop.x} ${oTop.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oBot.x} ${oBot.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
        `M ${iTop.x} ${iTop.y}`,
        `A ${safeInner} ${safeInner} 0 1 0 ${iBot.x} ${iBot.y}`,
        `A ${safeInner} ${safeInner} 0 1 0 ${iTop.x} ${iTop.y}`,
        'Z',
      ].join(' ');
    }
    return [
      `M ${oTop.x} ${oTop.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oBot.x} ${oBot.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
      'Z',
    ].join(' ');
  }
  const largeArc = span > Math.PI ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
  if (safeInner > 0) {
    const startInner = polarToCartesian(cx, cy, safeInner, endAngle);
    const endInner = polarToCartesian(cx, cy, safeInner, startAngle);
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${safeInner} ${safeInner} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${cx} ${cy}`,
    `L ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    'Z',
  ].join(' ');
}

export interface ComputeRadialStackedBarLayoutInput {
  categories: readonly ChartRadialStackedBarCategory[];
  series: readonly ChartRadialStackedBarSeries[];
  hiddenSeries: ReadonlySet<string>;
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  ringGap: number;
  padAngle: number;
  startAngle: number;
  fallbackColor: string;
}

export function computeRadialStackedBarLayout(
  input: ComputeRadialStackedBarLayoutInput
): ComputeRadialStackedBarLayoutResult {
  const {
    categories,
    series,
    hiddenSeries,
    cx,
    cy,
    innerRadius,
    outerRadius,
    ringGap,
    padAngle,
    startAngle,
    fallbackColor,
  } = input;
  if (
    !categories.length ||
    !series.length ||
    outerRadius <= 0 ||
    outerRadius <= innerRadius
  ) {
    return {
      rings: [],
      visibleSeriesCount: 0,
      totalsByCategory: [],
      ringThickness: 0,
      outerRadius: 0,
    };
  }
  const hiddenIdx = new Set<number>();
  for (let i = 0; i < series.length; i++) {
    if (hiddenSeries.has(series[i]!.id)) hiddenIdx.add(i);
  }
  const visibleSeriesCount = series.length - hiddenIdx.size;
  const ringCount = categories.length;
  const totalGap = Math.max(0, ringGap) * Math.max(0, ringCount - 1);
  const available = Math.max(0, outerRadius - innerRadius - totalGap);
  const ringThickness = available > 0 ? available / ringCount : 0;
  if (ringThickness <= 0) {
    return {
      rings: [],
      visibleSeriesCount,
      totalsByCategory: categories.map(() => 0),
      ringThickness: 0,
      outerRadius,
    };
  }

  const totalsByCategory: number[] = [];
  const rings: ChartRadialStackedBarRing[] = [];
  let cursorR = innerRadius;
  for (let r = 0; r < categories.length; r++) {
    const category = categories[r]!;
    const total = getRadialStackedBarCategoryTotal(category.values, hiddenIdx);
    totalsByCategory.push(total);
    const innerR = cursorR;
    const outerR = cursorR + ringThickness;
    const segments: ChartRadialStackedBarSegment[] = [];
    if (total > 0 && visibleSeriesCount > 0) {
      let visiblePositiveCount = 0;
      for (let s = 0; s < series.length; s++) {
        if (hiddenIdx.has(s)) continue;
        const v = category.values[s];
        if (isFiniteNumber(v) && v > 0) visiblePositiveCount++;
      }
      const padTotal =
        visiblePositiveCount > 1
          ? Math.max(0, padAngle) * visiblePositiveCount
          : 0;
      const span = Math.max(0, Math.PI * 2 - padTotal);
      let cursorAngle = startAngle;
      for (let s = 0; s < series.length; s++) {
        if (hiddenIdx.has(s)) continue;
        const v = category.values[s];
        if (!isFiniteNumber(v) || v <= 0) continue;
        const seriesDef = series[s]!;
        const share = total > 0 ? v / total : 0;
        const segSpan = span * share;
        const segStart = cursorAngle;
        const segEnd = segStart + segSpan;
        const color =
          seriesDef.color ?? getRadialStackedBarDefaultColor(s);
        const path = buildArcPath(cx, cy, innerR, outerR, segStart, segEnd);
        segments.push({
          categoryId: category.id,
          categoryIndex: r,
          seriesId: seriesDef.id,
          seriesIndex: s,
          value: v,
          shareWithinCategory: share,
          startAngle: segStart,
          endAngle: segEnd,
          midAngle: (segStart + segEnd) / 2,
          innerRadius: innerR,
          outerRadius: outerR,
          color,
          path,
        });
        cursorAngle = segEnd + (visiblePositiveCount > 1 ? padAngle : 0);
      }
    }
    rings.push({
      id: category.id,
      index: r,
      label: category.label,
      innerRadius: innerR,
      outerRadius: outerR,
      total,
      segments,
    });
    cursorR = outerR + ringGap;
  }
  // referenced for type-checking
  fallbackColor;

  return {
    rings,
    visibleSeriesCount,
    totalsByCategory,
    ringThickness,
    outerRadius,
  };
}

export function describeRadialStackedBarChart(
  categories: readonly ChartRadialStackedBarCategory[],
  series: readonly ChartRadialStackedBarSeries[],
  hidden: ReadonlySet<string>,
  formatValue?: (v: number) => string
): string {
  if (!categories.length || !series.length) return 'No data';
  const hiddenIdx = new Set<number>();
  for (let i = 0; i < series.length; i++) {
    if (hidden.has(series[i]!.id)) hiddenIdx.add(i);
  }
  const visibleSeries = series.length - hiddenIdx.size;
  if (visibleSeries === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let grand = 0;
  for (const c of categories) {
    grand += getRadialStackedBarCategoryTotal(c.values, hiddenIdx);
  }
  if (grand <= 0) return 'No data';
  return `Radial stacked bar chart with ${categories.length} rings and ${visibleSeries} visible series. Total ${fmt(grand)}.`;
}

export interface ChartRadialStackedBarProps {
  categories: readonly ChartRadialStackedBarCategory[];
  series: readonly ChartRadialStackedBarSeries[];
  width?: number;
  height?: number;
  padding?: number;
  innerRadius?: number;
  ringGap?: number;
  padAngle?: number;
  startAngle?: number;
  fillOpacity?: number;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showRingLabels?: boolean;
  showCenterTotal?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  legendPlacement?: 'right' | 'bottom';
  centerLabel?: string;
  onSegmentClick?: (args: {
    segment: ChartRadialStackedBarSegment;
  }) => void;
  onSeriesToggle?: (args: {
    series: ChartRadialStackedBarSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

function defaultFormatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

const ChartRadialStackedBarInner = (
  {
    categories,
    series,
    width = DEFAULT_CHART_RADIAL_STACKED_BAR_WIDTH,
    height = DEFAULT_CHART_RADIAL_STACKED_BAR_HEIGHT,
    padding = DEFAULT_CHART_RADIAL_STACKED_BAR_PADDING,
    innerRadius = DEFAULT_CHART_RADIAL_STACKED_BAR_INNER_RADIUS,
    ringGap = DEFAULT_CHART_RADIAL_STACKED_BAR_RING_GAP,
    padAngle = DEFAULT_CHART_RADIAL_STACKED_BAR_PAD_ANGLE,
    startAngle = DEFAULT_CHART_RADIAL_STACKED_BAR_START_ANGLE,
    fillOpacity = DEFAULT_CHART_RADIAL_STACKED_BAR_FILL_OPACITY,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showLegend = true,
    showTooltip = true,
    showRingLabels = true,
    showCenterTotal = true,
    animate = true,
    className,
    ariaLabel = 'Radial stacked bar chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    legendPlacement = 'bottom',
    centerLabel,
    onSegmentClick,
    onSeriesToggle,
    style,
  }: ChartRadialStackedBarProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-radial-stacked-bar-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSeries ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenSeries) ? new Set(hiddenSeries) : internalHidden,
    [hiddenSeries, internalHidden]
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeRadialStackedBarLayout({
        categories,
        series,
        hiddenSeries: hiddenSet,
        cx,
        cy,
        innerRadius,
        outerRadius,
        ringGap,
        padAngle,
        startAngle,
        fallbackColor: '#94a3b8',
      }),
    [
      categories,
      series,
      hiddenSet,
      cx,
      cy,
      innerRadius,
      outerRadius,
      ringGap,
      padAngle,
      startAngle,
    ]
  );

  const totalSegmentCount = useMemo(
    () => result.rings.reduce((acc, r) => acc + r.segments.length, 0),
    [result.rings]
  );

  const grandTotal = useMemo(
    () => result.totalsByCategory.reduce((acc, t) => acc + t, 0),
    [result.totalsByCategory]
  );

  const autoDescription = useMemo(
    () =>
      describeRadialStackedBarChart(
        categories,
        series,
        hiddenSet,
        formatValue
      ),
    [categories, series, hiddenSet, formatValue]
  );

  const toggleSeries = useCallback(
    (idx: number) => {
      const s = series[idx];
      if (!s) return;
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled(hiddenSeries)) setInternalHidden(next);
      onHiddenSeriesChange?.(Array.from(next));
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [series, hiddenSet, hiddenSeries, onHiddenSeriesChange, onSeriesToggle]
  );

  const hovered = useMemo(() => {
    if (!hoveredKey) return null;
    for (const ring of result.rings) {
      for (const segment of ring.segments) {
        if (`${segment.categoryId}::${segment.seriesId}` === hoveredKey) {
          return { ring, segment };
        }
      }
    }
    return null;
  }, [result.rings, hoveredKey]);

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-radial-stacked-bar"
      data-category-count={categories.length}
      data-series-count={series.length}
      data-visible-series-count={result.visibleSeriesCount}
      data-segment-count={totalSegmentCount}
      data-grand-total={grandTotal}
      data-ring-thickness={result.ringThickness}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-radial-stacked-bar flex',
        showRightLegend ? 'flex-row items-start gap-4' : 'flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-radial-stacked-bar-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-radial-stacked-bar-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-radial-stacked-bar-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-radial-stacked-bar-rings">
            {result.rings.map((ring) => (
              <g
                key={ring.id}
                data-section="chart-radial-stacked-bar-ring"
                data-ring-id={ring.id}
                data-ring-index={ring.index}
                data-ring-total={ring.total}
                data-ring-inner-radius={ring.innerRadius}
                data-ring-outer-radius={ring.outerRadius}
              >
                {ring.segments.map((segment) => {
                  const key = `${segment.categoryId}::${segment.seriesId}`;
                  const isHovered = hoveredKey === key;
                  return (
                    <g
                      key={key}
                      data-section="chart-radial-stacked-bar-segment"
                      data-category-id={segment.categoryId}
                      data-series-id={segment.seriesId}
                      data-series-index={segment.seriesIndex}
                      data-segment-value={segment.value}
                      data-segment-share={segment.shareWithinCategory}
                      data-segment-color={segment.color}
                      data-hovered={isHovered ? 'true' : 'false'}
                      className={
                        animate ? 'motion-safe:animate-fade-in' : undefined
                      }
                      onMouseEnter={() => setHoveredKey(key)}
                      onMouseLeave={() =>
                        setHoveredKey((cur) => (cur === key ? null : cur))
                      }
                      onFocus={() => setHoveredKey(key)}
                      onBlur={() =>
                        setHoveredKey((cur) => (cur === key ? null : cur))
                      }
                      onClick={() => onSegmentClick?.({ segment })}
                    >
                      <path
                        data-section="chart-radial-stacked-bar-path"
                        d={segment.path}
                        fill={segment.color}
                        fillOpacity={fillOpacity}
                        stroke={segment.color}
                        strokeWidth={1}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${ring.label} / ${
                          series[segment.seriesIndex]?.label ??
                          segment.seriesId
                        }: ${formatValue(segment.value)} (${formatPercent(segment.shareWithinCategory)} of ${ring.label})`}
                      />
                    </g>
                  );
                })}
                {showRingLabels && ring.segments.length > 0 && (
                  <text
                    data-section="chart-radial-stacked-bar-ring-label"
                    x={cx}
                    y={ring.innerRadius + cy - cy + 0}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgb(71 85 105)"
                    pointerEvents="none"
                    transform={`translate(${cx} ${
                      cy - (ring.innerRadius + ring.outerRadius) / 2 - 4
                    })`}
                  >
                    {ring.label}
                  </text>
                )}
              </g>
            ))}
          </g>
          {showCenterTotal && (centerLabel || grandTotal > 0) && (
            <g data-section="chart-radial-stacked-bar-center" pointerEvents="none">
              {centerLabel && (
                <text
                  data-section="chart-radial-stacked-bar-center-label"
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="rgb(51 65 85)"
                >
                  {centerLabel}
                </text>
              )}
              <text
                data-section="chart-radial-stacked-bar-center-value"
                x={cx}
                y={centerLabel ? cy + 12 : cy + 4}
                textAnchor="middle"
                fontSize={centerLabel ? 11 : 13}
                fontWeight={centerLabel ? 400 : 600}
                fill={centerLabel ? 'rgb(100 116 139)' : 'rgb(51 65 85)'}
              >
                {formatValue(grandTotal)}
              </text>
            </g>
          )}
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-radial-stacked-bar-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-radial-stacked-bar-tooltip-label"
              className="font-semibold"
            >
              {hovered.ring.label} /{' '}
              {series[hovered.segment.seriesIndex]?.label ??
                hovered.segment.seriesId}
            </div>
            <div
              data-section="chart-radial-stacked-bar-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.segment.value)}
            </div>
            <div
              data-section="chart-radial-stacked-bar-tooltip-share"
              className="font-mono text-slate-500"
            >
              {formatPercent(hovered.segment.shareWithinCategory)} of {hovered.ring.label}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-radial-stacked-bar-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {series.map((s, idx) => {
            const color =
              s.color ?? getRadialStackedBarDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-stacked-bar-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-stacked-bar-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-radial-stacked-bar-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-stacked-bar-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-radial-stacked-bar-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {series.map((s, idx) => {
            const color =
              s.color ?? getRadialStackedBarDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-stacked-bar-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-stacked-bar-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-radial-stacked-bar-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-stacked-bar-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartRadialStackedBar = forwardRef<
  HTMLDivElement,
  ChartRadialStackedBarProps
>(ChartRadialStackedBarInner);
ChartRadialStackedBar.displayName = 'ChartRadialStackedBar';
