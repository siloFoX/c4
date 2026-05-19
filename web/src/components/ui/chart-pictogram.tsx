import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_PICTOGRAM_WIDTH = 560;
export const DEFAULT_CHART_PICTOGRAM_HEIGHT = 320;
export const DEFAULT_CHART_PICTOGRAM_PADDING = 32;
export const DEFAULT_CHART_PICTOGRAM_ICON_SIZE = 18;
export const DEFAULT_CHART_PICTOGRAM_ICON_GAP = 4;
export const DEFAULT_CHART_PICTOGRAM_ROW_GAP = 14;
export const DEFAULT_CHART_PICTOGRAM_LABEL_WIDTH = 100;
export const DEFAULT_CHART_PICTOGRAM_UNIT_VALUE = 1;
export const DEFAULT_CHART_PICTOGRAM_ICON_SHAPE = 'circle';
export const DEFAULT_CHART_PICTOGRAM_EMPTY_OPACITY = 0.18;
export const DEFAULT_CHART_PICTOGRAM_PALETTE = [
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

export type ChartPictogramIconShape =
  | 'circle'
  | 'square'
  | 'rounded'
  | 'star'
  | 'triangle'
  | 'hexagon'
  | 'person';

export interface ChartPictogramRow {
  id: string;
  label: string;
  value: number;
  color?: string;
  icon?: ChartPictogramIconShape | string;
}

export interface ChartPictogramIconLayout {
  index: number;
  x: number;
  y: number;
  fill: number; // 0..1
}

export interface ChartPictogramLayoutRow {
  id: string;
  label: string;
  index: number;
  value: number;
  color: string;
  icon: ChartPictogramIconShape | string;
  totalIcons: number;
  fullIcons: number;
  fractionalIcon: number;
  iconsPerRow: number;
  visualRows: number;
  rowY: number;
  rowHeight: number;
  icons: ChartPictogramIconLayout[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getPictogramDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_PICTOGRAM_PALETTE[0]!;
  }
  return DEFAULT_CHART_PICTOGRAM_PALETTE[
    Math.floor(index) % DEFAULT_CHART_PICTOGRAM_PALETTE.length
  ]!;
}

export function getPictogramIconCount(
  value: number,
  unitValue: number
): { full: number; fractional: number; total: number } {
  if (!isFiniteNumber(value) || value <= 0) {
    return { full: 0, fractional: 0, total: 0 };
  }
  if (!isFiniteNumber(unitValue) || unitValue <= 0) {
    return { full: 0, fractional: 0, total: 0 };
  }
  const ratio = value / unitValue;
  const full = Math.floor(ratio);
  const rem = ratio - full;
  const fractional = rem > 1e-9 ? rem : 0;
  const total = full + (fractional > 0 ? 1 : 0);
  return { full, fractional, total };
}

export function buildPictogramIconPath(
  shape: ChartPictogramIconShape | string,
  size: number
): string {
  if (size <= 0) return '';
  if (typeof shape === 'string' && shape.startsWith('M')) {
    return shape;
  }
  const half = size / 2;
  switch (shape) {
    case 'square': {
      return `M 0 0 L ${size} 0 L ${size} ${size} L 0 ${size} Z`;
    }
    case 'rounded': {
      const r = Math.min(size / 6, 4);
      return [
        `M ${r} 0`,
        `L ${size - r} 0`,
        `A ${r} ${r} 0 0 1 ${size} ${r}`,
        `L ${size} ${size - r}`,
        `A ${r} ${r} 0 0 1 ${size - r} ${size}`,
        `L ${r} ${size}`,
        `A ${r} ${r} 0 0 1 0 ${size - r}`,
        `L 0 ${r}`,
        `A ${r} ${r} 0 0 1 ${r} 0`,
        'Z',
      ].join(' ');
    }
    case 'triangle': {
      return `M ${half} 0 L ${size} ${size} L 0 ${size} Z`;
    }
    case 'hexagon': {
      const w = size;
      const h = size;
      const inset = w * 0.25;
      return [
        `M ${inset} 0`,
        `L ${w - inset} 0`,
        `L ${w} ${h / 2}`,
        `L ${w - inset} ${h}`,
        `L ${inset} ${h}`,
        `L 0 ${h / 2}`,
        'Z',
      ].join(' ');
    }
    case 'star': {
      const cx = half;
      const cy = half;
      const outer = half;
      const inner = half * 0.4;
      const parts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (Math.PI / 5) * i;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        parts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
      }
      parts.push('Z');
      return parts.join(' ');
    }
    case 'person': {
      const headR = size * 0.18;
      const bodyTop = headR * 2 + 1;
      const bodyW = size * 0.55;
      const bodyX = (size - bodyW) / 2;
      const armSpread = size * 0.85;
      const armX = (size - armSpread) / 2;
      const legSpread = size * 0.5;
      const legX = (size - legSpread) / 2;
      const headCx = half;
      const headCy = headR;
      return [
        `M ${headCx} 0`,
        `A ${headR} ${headR} 0 1 1 ${headCx - 0.001} 0`,
        'Z',
        `M ${bodyX} ${bodyTop}`,
        `L ${bodyX + bodyW} ${bodyTop}`,
        `L ${bodyX + bodyW} ${bodyTop + size * 0.4}`,
        `L ${bodyX} ${bodyTop + size * 0.4}`,
        'Z',
        `M ${armX} ${bodyTop + 1}`,
        `L ${armX + armSpread} ${bodyTop + 1}`,
        `L ${armX + armSpread} ${bodyTop + 4}`,
        `L ${armX} ${bodyTop + 4}`,
        'Z',
        `M ${legX} ${bodyTop + size * 0.4}`,
        `L ${legX + legSpread * 0.3} ${bodyTop + size * 0.4}`,
        `L ${legX + legSpread * 0.3} ${size}`,
        `L ${legX} ${size}`,
        'Z',
        `M ${legX + legSpread * 0.7} ${bodyTop + size * 0.4}`,
        `L ${legX + legSpread} ${bodyTop + size * 0.4}`,
        `L ${legX + legSpread} ${size}`,
        `L ${legX + legSpread * 0.7} ${size}`,
        'Z',
      ].join(' ');
    }
    case 'circle':
    default: {
      return [
        `M ${half} 0`,
        `A ${half} ${half} 0 1 1 ${half - 0.001} 0`,
        'Z',
      ].join(' ');
    }
  }
}

export interface ComputePictogramLayoutInput {
  rows: readonly ChartPictogramRow[];
  unitValue: number;
  iconSize: number;
  iconGap: number;
  rowGap: number;
  labelWidth: number;
  innerW: number;
  padX: number;
  padY: number;
  defaultIcon: ChartPictogramIconShape | string;
}

export function computePictogramLayout(
  input: ComputePictogramLayoutInput
): ChartPictogramLayoutRow[] {
  const {
    rows,
    unitValue,
    iconSize,
    iconGap,
    rowGap,
    labelWidth,
    innerW,
    padX,
    padY,
    defaultIcon,
  } = input;
  if (!rows.length || innerW <= 0 || iconSize <= 0) return [];
  const usableW = Math.max(0, innerW - labelWidth);
  const iconsPerRow = Math.max(1, Math.floor((usableW + iconGap) / (iconSize + iconGap)));
  const out: ChartPictogramLayoutRow[] = [];
  let cursorY = padY;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const counts = getPictogramIconCount(row.value, unitValue);
    const visualRows = Math.max(1, Math.ceil(counts.total / iconsPerRow));
    const rowHeight = visualRows * iconSize + (visualRows - 1) * iconGap;
    const color = row.color ?? getPictogramDefaultColor(i);
    const icon = row.icon ?? defaultIcon;
    const icons: ChartPictogramIconLayout[] = [];
    for (let k = 0; k < counts.total; k++) {
      const visualRow = Math.floor(k / iconsPerRow);
      const visualCol = k % iconsPerRow;
      const x =
        padX + labelWidth + visualCol * (iconSize + iconGap);
      const y = cursorY + visualRow * (iconSize + iconGap);
      const fill =
        k < counts.full ? 1 : counts.fractional > 0 ? counts.fractional : 0;
      icons.push({ index: k, x, y, fill });
    }
    out.push({
      id: row.id,
      label: row.label,
      index: i,
      value: isFiniteNumber(row.value) ? row.value : 0,
      color,
      icon,
      totalIcons: counts.total,
      fullIcons: counts.full,
      fractionalIcon: counts.fractional,
      iconsPerRow,
      visualRows,
      rowY: cursorY,
      rowHeight,
      icons,
    });
    cursorY += rowHeight + rowGap;
  }
  return out;
}

export function describePictogramChart(
  rows: readonly ChartPictogramRow[],
  unitValue: number,
  formatValue?: (v: number) => string
): string {
  if (!rows.length) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let total = 0;
  let totalIcons = 0;
  for (const r of rows) {
    if (!isFiniteNumber(r.value) || r.value <= 0) continue;
    total += r.value;
    totalIcons += getPictogramIconCount(r.value, unitValue).total;
  }
  if (totalIcons === 0) return 'No data';
  return `Pictogram chart with ${rows.length} rows, total ${fmt(total)} across ${totalIcons} icons (each icon = ${fmt(unitValue)}).`;
}

export interface ChartPictogramProps {
  rows: readonly ChartPictogramRow[];
  unitValue?: number;
  width?: number;
  height?: number;
  padding?: number;
  iconSize?: number;
  iconGap?: number;
  rowGap?: number;
  labelWidth?: number;
  defaultIcon?: ChartPictogramIconShape | string;
  emptyOpacity?: number;
  showLabels?: boolean;
  showCounts?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatCount?: (count: number, value: number) => string;
  onRowClick?: (args: {
    row: ChartPictogramRow;
    layout: ChartPictogramLayoutRow;
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

const ChartPictogramInner = (
  {
    rows,
    unitValue = DEFAULT_CHART_PICTOGRAM_UNIT_VALUE,
    width = DEFAULT_CHART_PICTOGRAM_WIDTH,
    height = DEFAULT_CHART_PICTOGRAM_HEIGHT,
    padding = DEFAULT_CHART_PICTOGRAM_PADDING,
    iconSize = DEFAULT_CHART_PICTOGRAM_ICON_SIZE,
    iconGap = DEFAULT_CHART_PICTOGRAM_ICON_GAP,
    rowGap = DEFAULT_CHART_PICTOGRAM_ROW_GAP,
    labelWidth = DEFAULT_CHART_PICTOGRAM_LABEL_WIDTH,
    defaultIcon = DEFAULT_CHART_PICTOGRAM_ICON_SHAPE,
    emptyOpacity = DEFAULT_CHART_PICTOGRAM_EMPTY_OPACITY,
    showLabels = true,
    showCounts = true,
    showTooltip = true,
    showLegend = false,
    animate = true,
    className,
    ariaLabel = 'Pictogram chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatCount,
    onRowClick,
    style,
  }: ChartPictogramProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-pictogram-desc-${reactId}`;
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);

  const layout = useMemo(
    () =>
      computePictogramLayout({
        rows,
        unitValue,
        iconSize,
        iconGap,
        rowGap,
        labelWidth,
        innerW,
        padX: padding,
        padY: padding,
        defaultIcon,
      }),
    [
      rows,
      unitValue,
      iconSize,
      iconGap,
      rowGap,
      labelWidth,
      innerW,
      padding,
      defaultIcon,
    ]
  );

  const totalIconCount = useMemo(
    () => layout.reduce((acc, r) => acc + r.totalIcons, 0),
    [layout]
  );

  const totalValue = useMemo(() => {
    let total = 0;
    for (const r of rows) {
      if (isFiniteNumber(r.value) && r.value > 0) total += r.value;
    }
    return total;
  }, [rows]);

  const autoDescription = useMemo(
    () => describePictogramChart(rows, unitValue, formatValue),
    [rows, unitValue, formatValue]
  );

  const hovered = useMemo(
    () => layout.find((r) => r.id === hoveredId) ?? null,
    [layout, hoveredId]
  );

  const fmtCount = (count: number, value: number) =>
    formatCount
      ? formatCount(count, value)
      : `${count} x ${formatValue(unitValue)} = ${formatValue(value)}`;

  return (
    <div
      ref={ref}
      data-section="chart-pictogram"
      data-row-count={rows.length}
      data-visible-row-count={layout.length}
      data-icon-count={totalIconCount}
      data-unit-value={unitValue}
      data-total-value={totalValue}
      data-default-icon={defaultIcon}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-pictogram flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-pictogram-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-pictogram-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-pictogram-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-pictogram-rows">
            {layout.map((row) => {
              const isHovered = hoveredId === row.id;
              const dim = hoveredId != null && !isHovered ? 0.4 : 1;
              const iconPath = buildPictogramIconPath(row.icon, iconSize);
              const clipId = `chart-pictogram-clip-${reactId}-${row.id}`;
              return (
                <g
                  key={row.id}
                  data-section="chart-pictogram-row"
                  data-row-id={row.id}
                  data-row-index={row.index}
                  data-row-value={row.value}
                  data-row-color={row.color}
                  data-row-icon-count={row.totalIcons}
                  data-row-full-icons={row.fullIcons}
                  data-row-fractional-icon={row.fractionalIcon}
                  data-row-visual-rows={row.visualRows}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(row.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === row.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(row.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === row.id ? null : cur))
                  }
                  onClick={() => {
                    const orig = rows[row.index];
                    if (orig) onRowClick?.({ row: orig, layout: row });
                  }}
                  style={{ opacity: dim }}
                >
                  {showLabels && (
                    <text
                      data-section="chart-pictogram-row-label"
                      x={padding + labelWidth - 8}
                      y={row.rowY + iconSize * 0.75}
                      textAnchor="end"
                      fontSize={11}
                      fontWeight={500}
                      fill="rgb(51 65 85)"
                    >
                      {row.label}
                    </text>
                  )}
                  {row.fractionalIcon > 0 && (
                    <defs>
                      <clipPath id={clipId}>
                        <rect
                          x={0}
                          y={0}
                          width={iconSize * row.fractionalIcon}
                          height={iconSize}
                        />
                      </clipPath>
                    </defs>
                  )}
                  <g
                    data-section="chart-pictogram-icons"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${row.label}: ${formatValue(row.value)} (${row.totalIcons} icons)`}
                  >
                    {row.icons.map((icon) => {
                      const isFractional =
                        icon.fill > 0 && icon.fill < 1;
                      return (
                        <g
                          key={`${row.id}-${icon.index}`}
                          data-section="chart-pictogram-icon"
                          data-icon-index={icon.index}
                          data-icon-fill={icon.fill}
                          transform={`translate(${icon.x}, ${icon.y})`}
                        >
                          <path
                            data-section="chart-pictogram-icon-empty"
                            d={iconPath}
                            fill={row.color}
                            fillOpacity={emptyOpacity}
                            stroke={row.color}
                            strokeWidth={0.5}
                          />
                          {icon.fill > 0 && (
                            <path
                              data-section="chart-pictogram-icon-fill"
                              d={iconPath}
                              fill={row.color}
                              fillOpacity={1}
                              stroke={row.color}
                              strokeWidth={0.5}
                              clipPath={
                                isFractional ? `url(#${clipId})` : undefined
                              }
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                  {showCounts && row.totalIcons > 0 && (
                    <text
                      data-section="chart-pictogram-count"
                      x={
                        padding +
                        labelWidth +
                        Math.min(row.totalIcons, row.iconsPerRow) *
                          (iconSize + iconGap) +
                        4
                      }
                      y={row.rowY + iconSize * 0.75}
                      textAnchor="start"
                      fontSize={10}
                      fill="rgb(100 116 139)"
                    >
                      {fmtCount(row.totalIcons, row.value)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-pictogram-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-pictogram-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-pictogram-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-pictogram-tooltip-icons"
              className="font-mono text-slate-500"
            >
              icons: {hovered.totalIcons} (each {formatValue(unitValue)})
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <ul
          data-section="chart-pictogram-legend"
          className="flex flex-wrap gap-2 text-xs"
        >
          {rows.map((row, idx) => {
            const color = row.color ?? getPictogramDefaultColor(idx);
            return (
              <li
                key={row.id}
                data-section="chart-pictogram-legend-item"
                data-row-id={row.id}
              >
                <div
                  data-section="chart-pictogram-legend-row"
                  className="flex items-center gap-1"
                >
                  <span
                    data-section="chart-pictogram-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-pictogram-legend-label"
                    className="text-slate-700"
                  >
                    {row.label}
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

export const ChartPictogram = forwardRef<HTMLDivElement, ChartPictogramProps>(
  ChartPictogramInner
);
ChartPictogram.displayName = 'ChartPictogram';
