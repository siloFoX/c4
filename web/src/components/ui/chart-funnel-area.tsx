import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_FUNNEL_AREA_WIDTH = 480;
export const DEFAULT_CHART_FUNNEL_AREA_HEIGHT = 360;
export const DEFAULT_CHART_FUNNEL_AREA_PADDING = 32;
export const DEFAULT_CHART_FUNNEL_AREA_NECK_RATIO = 0.3;
export const DEFAULT_CHART_FUNNEL_AREA_STAGE_GAP = 2;
export const DEFAULT_CHART_FUNNEL_AREA_LABEL_MIN_HEIGHT = 18;
export const DEFAULT_CHART_FUNNEL_AREA_FILL_OPACITY = 0.85;
export const DEFAULT_CHART_FUNNEL_AREA_PALETTE = [
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

export interface ChartFunnelAreaStage {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartFunnelAreaLayoutStage {
  id: string;
  label: string;
  index: number;
  value: number;
  share: number;
  cumulativeShare: number;
  color: string;
  yTop: number;
  yBottom: number;
  topWidth: number;
  bottomWidth: number;
  centerX: number;
  height: number;
  path: string;
  conversionRate: number;
  dropRate: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getFunnelAreaDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_FUNNEL_AREA_PALETTE[0]!;
  }
  return DEFAULT_CHART_FUNNEL_AREA_PALETTE[
    Math.floor(index) % DEFAULT_CHART_FUNNEL_AREA_PALETTE.length
  ]!;
}

export function getFunnelAreaTotalValue(
  stages: readonly ChartFunnelAreaStage[]
): number {
  let total = 0;
  for (const s of stages) {
    if (isFiniteNumber(s.value) && s.value > 0) total += s.value;
  }
  return total;
}

export function getFunnelAreaConversionRate(
  current: number,
  previous: number
): number {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return 0;
  if (previous <= 0) return 0;
  return current / previous;
}

export interface ComputeFunnelAreaLayoutInput {
  stages: readonly ChartFunnelAreaStage[];
  innerW: number;
  innerH: number;
  padX: number;
  padY: number;
  neckRatio: number;
  stageGap: number;
}

export function computeFunnelAreaLayout(
  input: ComputeFunnelAreaLayoutInput
): ChartFunnelAreaLayoutStage[] {
  const { stages, innerW, innerH, padX, padY, neckRatio, stageGap } = input;
  if (innerW <= 0 || innerH <= 0 || !stages.length) return [];
  const total = getFunnelAreaTotalValue(stages);
  if (total <= 0) return [];

  const clampedNeck = Math.max(0, Math.min(1, neckRatio));
  const topWidthFull = innerW;
  const bottomWidthFull = innerW * clampedNeck;
  const centerX = padX + innerW / 2;

  const gapTotal = Math.max(0, stageGap) * Math.max(0, stages.length - 1);
  const heightBudget = Math.max(0, innerH - gapTotal);

  const out: ChartFunnelAreaLayoutStage[] = [];
  let cursorY = padY;
  let cumulativeShare = 0;
  let prevValue = 0;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;
    const valueRaw = isFiniteNumber(stage.value) ? Math.max(0, stage.value) : 0;
    const share = valueRaw / total;
    const stageHeight = heightBudget * share;
    const startShare = cumulativeShare;
    const endShare = cumulativeShare + share;
    const topWidth =
      topWidthFull + (bottomWidthFull - topWidthFull) * startShare;
    const bottomWidth =
      topWidthFull + (bottomWidthFull - topWidthFull) * endShare;
    const yTop = cursorY;
    const yBottom = cursorY + stageHeight;
    const xTL = centerX - topWidth / 2;
    const xTR = centerX + topWidth / 2;
    const xBL = centerX - bottomWidth / 2;
    const xBR = centerX + bottomWidth / 2;
    const path =
      `M ${xTL.toFixed(2)} ${yTop.toFixed(2)} ` +
      `L ${xTR.toFixed(2)} ${yTop.toFixed(2)} ` +
      `L ${xBR.toFixed(2)} ${yBottom.toFixed(2)} ` +
      `L ${xBL.toFixed(2)} ${yBottom.toFixed(2)} Z`;
    const color = stage.color ?? getFunnelAreaDefaultColor(i);
    const conversionRate =
      i === 0 ? 1 : getFunnelAreaConversionRate(stage.value, prevValue);
    const dropRate =
      i === 0
        ? 0
        : prevValue > 0
        ? Math.max(0, 1 - conversionRate)
        : 0;
    out.push({
      id: stage.id,
      label: stage.label,
      index: i,
      value: valueRaw,
      share,
      cumulativeShare: endShare,
      color,
      yTop,
      yBottom,
      topWidth,
      bottomWidth,
      centerX,
      height: stageHeight,
      path,
      conversionRate,
      dropRate,
    });
    cumulativeShare = endShare;
    cursorY = yBottom + stageGap;
    prevValue = stage.value;
  }
  return out;
}

export function describeFunnelAreaChart(
  stages: readonly ChartFunnelAreaStage[],
  formatValue?: (v: number) => string
): string {
  if (!stages.length) return 'No data';
  const total = getFunnelAreaTotalValue(stages);
  if (total <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (!first || !last) return 'No data';
  const conversion =
    isFiniteNumber(first.value) && first.value > 0 && isFiniteNumber(last.value)
      ? `${Math.round((last.value / first.value) * 100)}%`
      : 'N/A';
  return `Area funnel with ${stages.length} stages, total ${fmt(total)}. Top stage ${first.label} ${fmt(first.value)}, end stage ${last.label} ${fmt(last.value)} (${conversion} conversion).`;
}

export interface ChartFunnelAreaProps {
  stages: readonly ChartFunnelAreaStage[];
  width?: number;
  height?: number;
  padding?: number;
  neckRatio?: number;
  stageGap?: number;
  labelMinHeight?: number;
  fillOpacity?: number;
  showLabels?: boolean;
  showValues?: boolean;
  showConversionRates?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onStageClick?: (args: {
    stage: ChartFunnelAreaStage;
    layout: ChartFunnelAreaLayoutStage;
  }) => void;
  style?: CSSProperties;
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

const ChartFunnelAreaInner = (
  {
    stages,
    width = DEFAULT_CHART_FUNNEL_AREA_WIDTH,
    height = DEFAULT_CHART_FUNNEL_AREA_HEIGHT,
    padding = DEFAULT_CHART_FUNNEL_AREA_PADDING,
    neckRatio = DEFAULT_CHART_FUNNEL_AREA_NECK_RATIO,
    stageGap = DEFAULT_CHART_FUNNEL_AREA_STAGE_GAP,
    labelMinHeight = DEFAULT_CHART_FUNNEL_AREA_LABEL_MIN_HEIGHT,
    fillOpacity = DEFAULT_CHART_FUNNEL_AREA_FILL_OPACITY,
    showLabels = true,
    showValues = true,
    showConversionRates = false,
    showTooltip = true,
    showLegend = false,
    animate = true,
    className,
    ariaLabel = 'Area funnel chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    legendPlacement = 'bottom',
    onStageClick,
    style,
  }: ChartFunnelAreaProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-funnel-area-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const layout = useMemo(
    () =>
      computeFunnelAreaLayout({
        stages,
        innerW,
        innerH,
        padX: padding,
        padY: padding,
        neckRatio,
        stageGap,
      }),
    [stages, innerW, innerH, padding, neckRatio, stageGap]
  );

  const total = useMemo(() => getFunnelAreaTotalValue(stages), [stages]);

  const autoDescription = useMemo(
    () => describeFunnelAreaChart(stages, formatValue),
    [stages, formatValue]
  );

  const hovered = useMemo(
    () => layout.find((s) => s.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-funnel-area"
      data-stage-count={stages.length}
      data-visible-count={layout.length}
      data-total={total}
      data-neck-ratio={neckRatio}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-funnel-area flex',
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
        data-section="chart-funnel-area-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-funnel-area-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-funnel-area-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-funnel-area-stages">
            {layout.map((stage) => {
              const isHovered = hoveredId === stage.id;
              const dim = hoveredId != null && !isHovered ? 0.4 : 1;
              const canLabel = stage.height >= labelMinHeight;
              const labelY = stage.yTop + stage.height / 2;
              return (
                <g
                  key={stage.id}
                  data-section="chart-funnel-area-stage"
                  data-stage-id={stage.id}
                  data-stage-index={stage.index}
                  data-stage-value={stage.value}
                  data-stage-share={stage.share}
                  data-stage-color={stage.color}
                  data-stage-conversion={stage.conversionRate}
                  data-stage-drop={stage.dropRate}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(stage.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === stage.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(stage.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === stage.id ? null : cur))
                  }
                  onClick={() => {
                    const orig = stages[stage.index];
                    if (orig) onStageClick?.({ stage: orig, layout: stage });
                  }}
                  style={{ opacity: dim }}
                >
                  <path
                    data-section="chart-funnel-area-path"
                    d={stage.path}
                    fill={stage.color}
                    fillOpacity={fillOpacity}
                    stroke={stage.color}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${stage.label}: ${formatValue(stage.value)} (${formatPercent(stage.share)} of total)`}
                  />
                  {showLabels && canLabel && (
                    <text
                      data-section="chart-funnel-area-label"
                      x={stage.centerX}
                      y={labelY - 2}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {stage.label}
                    </text>
                  )}
                  {showValues && canLabel && stage.height >= labelMinHeight + 12 && (
                    <text
                      data-section="chart-funnel-area-value"
                      x={stage.centerX}
                      y={labelY + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {formatValue(stage.value)}
                    </text>
                  )}
                  {showConversionRates && stage.index > 0 && (
                    <text
                      data-section="chart-funnel-area-conversion"
                      x={stage.centerX + stage.topWidth / 2 + 12}
                      y={stage.yTop + 12}
                      textAnchor="start"
                      fontSize={10}
                      fontWeight={500}
                      fill="rgb(71 85 105)"
                      pointerEvents="none"
                    >
                      {formatPercent(stage.conversionRate)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-funnel-area-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-funnel-area-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-funnel-area-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-funnel-area-tooltip-share"
              className="font-mono text-slate-500"
            >
              share: {formatPercent(hovered.share)}
            </div>
            {hovered.index > 0 && (
              <div
                data-section="chart-funnel-area-tooltip-conversion"
                className="font-mono text-slate-500"
              >
                conversion: {formatPercent(hovered.conversionRate)}
              </div>
            )}
          </div>
        )}
      </div>
      {(showBottomLegend || showRightLegend) && (
        <ul
          data-section="chart-funnel-area-legend"
          data-placement={showRightLegend ? 'right' : 'bottom'}
          className={
            showRightLegend
              ? 'flex flex-col gap-1 text-xs'
              : 'flex flex-wrap gap-2 text-xs'
          }
        >
          {stages.map((stage, idx) => {
            const color = stage.color ?? getFunnelAreaDefaultColor(idx);
            return (
              <li
                key={stage.id}
                data-section="chart-funnel-area-legend-item"
                data-stage-id={stage.id}
              >
                <div
                  data-section="chart-funnel-area-legend-row"
                  className="flex items-center gap-1"
                >
                  <span
                    data-section="chart-funnel-area-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-funnel-area-legend-label"
                    className="text-slate-700"
                  >
                    {stage.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartFunnelArea = forwardRef<HTMLDivElement, ChartFunnelAreaProps>(
  ChartFunnelAreaInner
);
ChartFunnelArea.displayName = 'ChartFunnelArea';
