import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
} from 'react';

export const DEFAULT_CHART_DONUT_WIDTH = 320;
export const DEFAULT_CHART_DONUT_HEIGHT = 320;
export const DEFAULT_CHART_DONUT_PADDING = 24;
export const DEFAULT_CHART_DONUT_THICKNESS_RATIO = 0.32;
export const DEFAULT_CHART_DONUT_PAD_ANGLE = 0.012;
export const DEFAULT_CHART_DONUT_CORNER_RADIUS = 0;
export const DEFAULT_CHART_DONUT_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_DONUT_COLORS = [
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

export interface ChartDonutSlice {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartDonutArc {
  id: string;
  label: string;
  value: number;
  color: string;
  index: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  path: string;
  fraction: number;
}

export function getDonutDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_DONUT_COLORS[0]!;
  }
  return DEFAULT_CHART_DONUT_COLORS[
    Math.floor(index) % DEFAULT_CHART_DONUT_COLORS.length
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

export function getDonutTotal(slices: readonly ChartDonutSlice[]): number {
  let total = 0;
  for (const s of slices) {
    const v = Number(s.value);
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

export function getDonutVisibleTotal(
  slices: readonly ChartDonutSlice[],
  hidden: ReadonlySet<string>
): number {
  let total = 0;
  for (const s of slices) {
    if (hidden.has(s.id)) continue;
    const v = Number(s.value);
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

function buildArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
  cornerRadius: number
): string {
  const span = endAngle - startAngle;
  if (!Number.isFinite(span) || span <= 0) return '';
  if (outerR <= 0) return '';
  const innerRClamped = Math.max(0, Math.min(innerR, outerR));
  if (span >= Math.PI * 2 - 1e-6) {
    const oTop = polarToCartesian(cx, cy, outerR, 0);
    const oBottom = polarToCartesian(cx, cy, outerR, Math.PI);
    if (innerRClamped > 0) {
      const iTop = polarToCartesian(cx, cy, innerRClamped, 0);
      const iBottom = polarToCartesian(cx, cy, innerRClamped, Math.PI);
      return [
        `M ${oTop.x} ${oTop.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oBottom.x} ${oBottom.y}`,
        `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
        `M ${iTop.x} ${iTop.y}`,
        `A ${innerRClamped} ${innerRClamped} 0 1 0 ${iBottom.x} ${iBottom.y}`,
        `A ${innerRClamped} ${innerRClamped} 0 1 0 ${iTop.x} ${iTop.y}`,
        'Z',
      ].join(' ');
    }
    return [
      `M ${oTop.x} ${oTop.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oBottom.x} ${oBottom.y}`,
      `A ${outerR} ${outerR} 0 1 1 ${oTop.x} ${oTop.y}`,
      'Z',
    ].join(' ');
  }
  const largeArc = span > Math.PI ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
  if (innerRClamped > 0) {
    const startInner = polarToCartesian(cx, cy, innerRClamped, endAngle);
    const endInner = polarToCartesian(cx, cy, innerRClamped, startAngle);
    if (cornerRadius > 0) {
      const cr = Math.min(cornerRadius, (outerR - innerRClamped) / 2);
      return [
        `M ${startOuter.x} ${startOuter.y}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
        `A ${cr} ${cr} 0 0 1 ${startInner.x} ${startInner.y}`,
        `A ${innerRClamped} ${innerRClamped} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
        `A ${cr} ${cr} 0 0 1 ${startOuter.x} ${startOuter.y}`,
        'Z',
      ].join(' ');
    }
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${innerRClamped} ${innerRClamped} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
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

export interface ComputeDonutArcsInput {
  slices: readonly ChartDonutSlice[];
  hidden: ReadonlySet<string>;
  cx: number;
  cy: number;
  outerRadius: number;
  thicknessRatio: number;
  startAngle: number;
  padAngle: number;
  cornerRadius: number;
}

export function computeDonutArcs(input: ComputeDonutArcsInput): ChartDonutArc[] {
  const {
    slices,
    hidden,
    cx,
    cy,
    outerRadius,
    thicknessRatio,
    startAngle,
    padAngle,
    cornerRadius,
  } = input;
  if (!slices.length || outerRadius <= 0) return [];
  const visibleSlices: { slice: ChartDonutSlice; index: number; value: number }[] = [];
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i]!;
    if (hidden.has(s.id)) continue;
    const v = Number(s.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    visibleSlices.push({ slice: s, index: i, value: v });
  }
  if (!visibleSlices.length) return [];
  const total = visibleSlices.reduce((acc, x) => acc + x.value, 0);
  if (total <= 0) return [];
  const ratio = Math.max(0, Math.min(1, thicknessRatio));
  const innerRadius = outerRadius * (1 - ratio);
  const padTotal =
    visibleSlices.length > 1 ? padAngle * visibleSlices.length : 0;
  const angularSpan = Math.max(0, Math.PI * 2 - padTotal);
  const arcs: ChartDonutArc[] = [];
  let cursor = startAngle;
  for (const v of visibleSlices) {
    const fraction = v.value / total;
    const sweep = angularSpan * fraction;
    const arcStart = cursor;
    const arcEnd = cursor + sweep;
    const midAngle = (arcStart + arcEnd) / 2;
    const color = v.slice.color ?? getDonutDefaultColor(v.index);
    const path = buildArcPath(
      cx,
      cy,
      outerRadius,
      innerRadius,
      arcStart,
      arcEnd,
      cornerRadius
    );
    arcs.push({
      id: v.slice.id,
      label: v.slice.label,
      value: v.value,
      color,
      index: v.index,
      startAngle: arcStart,
      endAngle: arcEnd,
      midAngle,
      innerRadius,
      outerRadius,
      path,
      fraction,
    });
    cursor = arcEnd + padAngle;
  }
  return arcs;
}

export function describeDonutChart(
  slices: readonly ChartDonutSlice[],
  hidden: ReadonlySet<string>,
  formatValue?: (v: number) => string
): string {
  if (!slices.length) return 'No data';
  const visible: { label: string; value: number }[] = [];
  for (const s of slices) {
    if (hidden.has(s.id)) continue;
    const v = Number(s.value);
    if (Number.isFinite(v) && v > 0) {
      visible.push({ label: s.label, value: v });
    }
  }
  if (!visible.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const total = visible.reduce((acc, x) => acc + x.value, 0);
  const parts = visible.map((v) => {
    const pct = total > 0 ? Math.round((v.value / total) * 100) : 0;
    return `${v.label} ${fmt(v.value)} (${pct}%)`;
  });
  return `Donut chart with ${visible.length} slices, total ${fmt(total)}. ${parts.join(', ')}`;
}

export interface ChartDonutCenterContent {
  primary?: ReactNode;
  secondary?: ReactNode;
}

export interface ChartDonutProps {
  slices: readonly ChartDonutSlice[];
  width?: number;
  height?: number;
  padding?: number;
  thicknessRatio?: number;
  padAngle?: number;
  cornerRadius?: number;
  startAngle?: number;
  hiddenSlices?: readonly string[];
  defaultHiddenSlices?: readonly string[];
  onHiddenSlicesChange?: (hidden: string[]) => void;
  showLegend?: boolean;
  showTooltip?: boolean;
  showCenter?: boolean;
  showLabels?: boolean;
  showCenterTotal?: boolean;
  animate?: boolean;
  centerContent?: ChartDonutCenterContent;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onArcClick?: (args: { slice: ChartDonutSlice; arc: ChartDonutArc }) => void;
  onSliceToggle?: (args: { slice: ChartDonutSlice; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  return String(v);
}

function defaultFormatPercent(p: number): string {
  return `${Math.round(p)}%`;
}

const ChartDonutInner = (
  {
    slices,
    width = DEFAULT_CHART_DONUT_WIDTH,
    height = DEFAULT_CHART_DONUT_HEIGHT,
    padding = DEFAULT_CHART_DONUT_PADDING,
    thicknessRatio = DEFAULT_CHART_DONUT_THICKNESS_RATIO,
    padAngle = DEFAULT_CHART_DONUT_PAD_ANGLE,
    cornerRadius = DEFAULT_CHART_DONUT_CORNER_RADIUS,
    startAngle = DEFAULT_CHART_DONUT_START_ANGLE,
    hiddenSlices,
    defaultHiddenSlices,
    onHiddenSlicesChange,
    showLegend = true,
    showTooltip = true,
    showCenter = true,
    showLabels = false,
    showCenterTotal = true,
    animate = true,
    centerContent,
    centerLabel,
    centerValue,
    className,
    ariaLabel = 'Donut chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    legendPlacement = 'bottom',
    onArcClick,
    onSliceToggle,
    style,
  }: ChartDonutProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-donut-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSlices ?? [])
  );
  const hiddenSet = useMemo(
    () => (isControlled(hiddenSlices) ? new Set(hiddenSlices) : internalHidden),
    [hiddenSlices, internalHidden]
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const arcs = useMemo(
    () =>
      computeDonutArcs({
        slices,
        hidden: hiddenSet,
        cx,
        cy,
        outerRadius,
        thicknessRatio,
        startAngle,
        padAngle,
        cornerRadius,
      }),
    [
      slices,
      hiddenSet,
      cx,
      cy,
      outerRadius,
      thicknessRatio,
      startAngle,
      padAngle,
      cornerRadius,
    ]
  );

  const visibleTotal = useMemo(
    () => getDonutVisibleTotal(slices, hiddenSet),
    [slices, hiddenSet]
  );

  const autoDescription = useMemo(
    () => describeDonutChart(slices, hiddenSet, formatValue),
    [slices, hiddenSet, formatValue]
  );

  const toggleHidden = useCallback(
    (slice: ChartDonutSlice) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(slice.id);
      if (willHide) next.add(slice.id);
      else next.delete(slice.id);
      if (!isControlled(hiddenSlices)) setInternalHidden(next);
      onHiddenSlicesChange?.(Array.from(next));
      onSliceToggle?.({ slice, hidden: willHide });
    },
    [hiddenSet, hiddenSlices, onHiddenSlicesChange, onSliceToggle]
  );

  const hoveredArc = useMemo(
    () => arcs.find((a) => a.id === hoveredId) ?? null,
    [arcs, hoveredId]
  );

  const renderedCenter = (() => {
    if (!showCenter) return null;
    const primary =
      centerValue ??
      centerContent?.primary ??
      (showCenterTotal ? formatValue(visibleTotal) : null);
    const secondary = centerLabel ?? centerContent?.secondary ?? null;
    if (primary == null && secondary == null) return null;
    return (
      <g data-section="chart-donut-center" pointerEvents="none">
        {primary != null && (
          <text
            data-section="chart-donut-center-primary"
            x={cx}
            y={secondary != null ? cy - 4 : cy + 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={20}
            fontWeight={600}
            fill="rgb(15 23 42)"
          >
            {primary}
          </text>
        )}
        {secondary != null && (
          <text
            data-section="chart-donut-center-secondary"
            x={cx}
            y={primary != null ? cy + 18 : cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fill="rgb(100 116 139)"
          >
            {secondary}
          </text>
        )}
      </g>
    );
  })();

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-donut"
      data-slice-count={slices.length}
      data-visible-count={arcs.length}
      data-hidden-count={slices.length - arcs.length}
      data-animate={animate ? 'true' : 'false'}
      data-thickness-ratio={thicknessRatio}
      className={[
        'chart-donut flex',
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
        data-section="chart-donut-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-donut-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-donut-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-donut-arcs">
            {arcs.map((arc) => {
              const slice = slices[arc.index]!;
              const isHovered = hoveredId === arc.id;
              return (
                <g
                  key={arc.id}
                  data-section="chart-donut-arc"
                  data-slice-id={arc.id}
                  data-slice-index={arc.index}
                  data-arc-value={arc.value}
                  data-arc-color={arc.color}
                  data-arc-fraction={arc.fraction}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(arc.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === arc.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(arc.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === arc.id ? null : cur))
                  }
                  onClick={() => onArcClick?.({ slice, arc })}
                >
                  <path
                    data-section="chart-donut-path"
                    d={arc.path}
                    fill={arc.color}
                    stroke="rgb(255 255 255)"
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${arc.label}: ${formatValue(arc.value)} (${formatPercent(arc.fraction * 100)})`}
                  />
                  {showLabels && arc.fraction > 0.05 && (
                    (() => {
                      const labelR = (arc.innerRadius + arc.outerRadius) / 2;
                      const pos = polarToCartesian(cx, cy, labelR, arc.midAngle);
                      return (
                        <text
                          data-section="chart-donut-label"
                          x={pos.x}
                          y={pos.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight={500}
                          fill="rgb(255 255 255)"
                          pointerEvents="none"
                        >
                          {formatPercent(arc.fraction * 100)}
                        </text>
                      );
                    })()
                  )}
                </g>
              );
            })}
          </g>
          {renderedCenter}
        </svg>
        {showTooltip && hoveredArc && (
          <div
            data-section="chart-donut-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div data-section="chart-donut-tooltip-label" className="font-semibold">
              {hoveredArc.label}
            </div>
            <div
              data-section="chart-donut-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hoveredArc.value)}
            </div>
            <div
              data-section="chart-donut-tooltip-percent"
              className="font-mono text-slate-500"
            >
              {formatPercent(hoveredArc.fraction * 100)}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-donut-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {slices.map((slice, idx) => {
            const color = slice.color ?? getDonutDefaultColor(idx);
            const isHidden = hiddenSet.has(slice.id);
            return (
              <li
                key={slice.id}
                data-section="chart-donut-legend-item"
                data-slice-id={slice.id}
                data-slice-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-donut-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${slice.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleHidden(slice)}
                >
                  <span
                    data-section="chart-donut-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-donut-legend-label"
                    className="text-slate-700"
                  >
                    {slice.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-donut-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {slices.map((slice, idx) => {
            const color = slice.color ?? getDonutDefaultColor(idx);
            const isHidden = hiddenSet.has(slice.id);
            return (
              <li
                key={slice.id}
                data-section="chart-donut-legend-item"
                data-slice-id={slice.id}
                data-slice-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-donut-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${slice.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleHidden(slice)}
                >
                  <span
                    data-section="chart-donut-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-donut-legend-label"
                    className="text-slate-700"
                  >
                    {slice.label}
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

export const ChartDonut = forwardRef<HTMLDivElement, ChartDonutProps>(
  ChartDonutInner
);
ChartDonut.displayName = 'ChartDonut';
