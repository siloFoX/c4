import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_TORNADO_WIDTH = 560;
export const DEFAULT_CHART_TORNADO_HEIGHT = 360;
export const DEFAULT_CHART_TORNADO_PADDING = 48;
export const DEFAULT_CHART_TORNADO_CENTER_GAP = 4;
export const DEFAULT_CHART_TORNADO_TICK_COUNT = 5;
export const DEFAULT_CHART_TORNADO_BAND_GAP = 4;
export const DEFAULT_CHART_TORNADO_BAR_OPACITY = 0.9;
export const DEFAULT_CHART_TORNADO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_TORNADO_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_TORNADO_CENTER_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_TORNADO_LEFT_COLOR = '#dc2626';
export const DEFAULT_CHART_TORNADO_RIGHT_COLOR = '#2563eb';
export const DEFAULT_CHART_TORNADO_ORIENTATION = 'horizontal';
export const DEFAULT_CHART_TORNADO_SCALE_MODE = 'shared';

export type ChartTornadoOrientation = 'horizontal' | 'vertical';
export type ChartTornadoScaleMode = 'shared' | 'independent';
export type ChartTornadoSortBy = 'left' | 'right' | 'sum' | 'diff' | 'absDiff';
export type ChartTornadoSortOrder = 'asc' | 'desc';
export type ChartTornadoSide = 'left' | 'right';

export interface ChartTornadoItem {
  id: string;
  label: string;
  left: number;
  right: number;
  leftColor?: string;
  rightColor?: string;
}

export interface ChartTornadoLayoutItem {
  id: string;
  label: string;
  index: number;
  originalIndex: number;
  left: number;
  right: number;
  diff: number;
  sum: number;
  leftColor: string;
  rightColor: string;
  leftX: number;
  leftY: number;
  leftWidth: number;
  leftHeight: number;
  rightX: number;
  rightY: number;
  rightWidth: number;
  rightHeight: number;
  rowCenter: number;
}

export interface ComputeTornadoLayoutResult {
  items: ChartTornadoLayoutItem[];
  leftTicks: { value: number; position: number }[];
  rightTicks: { value: number; position: number }[];
  leftMax: number;
  rightMax: number;
  orientation: ChartTornadoOrientation;
  scaleMode: ChartTornadoScaleMode;
  innerWidth: number;
  innerHeight: number;
  bandWidth: number;
  barThickness: number;
  centerLine: number;
  leftSideStart: number;
  leftSideEnd: number;
  rightSideStart: number;
  rightSideEnd: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNonNeg(v: number): number {
  if (!isFiniteNumber(v) || v < 0) return 0;
  return v;
}

export function getTornadoFiniteItems(
  items: readonly ChartTornadoItem[],
): ChartTornadoItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it) =>
      it &&
      typeof it.id === 'string' &&
      isFiniteNumber(it.left) &&
      isFiniteNumber(it.right),
  );
}

export function getTornadoMaxValue(
  items: readonly ChartTornadoItem[],
  side: ChartTornadoSide,
  mode: ChartTornadoScaleMode = 'shared',
): number {
  const finite = getTornadoFiniteItems(items);
  if (finite.length === 0) return 1;
  let m = 0;
  if (mode === 'shared') {
    for (const it of finite) {
      const l = clampNonNeg(it.left);
      const r = clampNonNeg(it.right);
      if (l > m) m = l;
      if (r > m) m = r;
    }
  } else {
    for (const it of finite) {
      const v =
        side === 'left' ? clampNonNeg(it.left) : clampNonNeg(it.right);
      if (v > m) m = v;
    }
  }
  return m > 0 ? m : 1;
}

export function getTornadoTicks(
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(max) || max <= 0) {
    return [
      { value: 0, position: 0 },
      { value: 1, position: 1 },
    ];
  }
  const n = Math.max(2, Math.floor(count ?? DEFAULT_CHART_TORNADO_TICK_COUNT));
  const step = max / (n - 1);
  const out: { value: number; position: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = step * i;
    out.push({ value, position: value / max });
  }
  return out;
}

export interface SortedTornadoItem {
  item: ChartTornadoItem;
  originalIndex: number;
}

export function sortTornadoItems(
  items: readonly ChartTornadoItem[],
  sortBy?: ChartTornadoSortBy,
  order?: ChartTornadoSortOrder,
): SortedTornadoItem[] {
  const indexed: SortedTornadoItem[] = items.map((item, originalIndex) => ({
    item,
    originalIndex,
  }));
  if (!sortBy) return indexed;
  const dir = order === 'desc' ? -1 : 1;
  const keyFor = (it: ChartTornadoItem): number => {
    const l = clampNonNeg(it.left);
    const r = clampNonNeg(it.right);
    switch (sortBy) {
      case 'left':
        return l;
      case 'right':
        return r;
      case 'sum':
        return l + r;
      case 'diff':
        return r - l;
      case 'absDiff':
        return Math.abs(r - l);
    }
  };
  indexed.sort((a, b) => {
    const ka = keyFor(a.item);
    const kb = keyFor(b.item);
    if (ka === kb) return a.originalIndex - b.originalIndex;
    return (ka - kb) * dir;
  });
  return indexed;
}

export interface ComputeTornadoLayoutInput {
  items: readonly ChartTornadoItem[];
  orientation?: ChartTornadoOrientation;
  scaleMode?: ChartTornadoScaleMode;
  sortBy?: ChartTornadoSortBy;
  sortOrder?: ChartTornadoSortOrder;
  valueMax?: number;
  width: number;
  height: number;
  padding: number;
  centerGap?: number;
  bandGap?: number;
  barThickness?: number;
  tickCount?: number;
  leftColor?: string;
  rightColor?: string;
}

export function computeTornadoLayout(
  input: ComputeTornadoLayoutInput,
): ComputeTornadoLayoutResult {
  const orientation: ChartTornadoOrientation =
    input.orientation ?? DEFAULT_CHART_TORNADO_ORIENTATION;
  const scaleMode: ChartTornadoScaleMode =
    input.scaleMode ?? DEFAULT_CHART_TORNADO_SCALE_MODE;
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const centerGap = Math.max(
    0,
    input.centerGap ?? DEFAULT_CHART_TORNADO_CENTER_GAP,
  );
  const bandGap = Math.max(
    0,
    input.bandGap ?? DEFAULT_CHART_TORNADO_BAND_GAP,
  );

  const empty: ComputeTornadoLayoutResult = {
    items: [],
    leftTicks: [],
    rightTicks: [],
    leftMax: 1,
    rightMax: 1,
    orientation,
    scaleMode,
    innerWidth,
    innerHeight,
    bandWidth: 0,
    barThickness: 0,
    centerLine: padding + innerWidth / 2,
    leftSideStart: padding,
    leftSideEnd: padding + innerWidth / 2 - centerGap,
    rightSideStart: padding + innerWidth / 2 + centerGap,
    rightSideEnd: padding + innerWidth,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.items || input.items.length === 0) return empty;
  const finite = getTornadoFiniteItems(input.items);
  if (finite.length === 0) return empty;

  let leftMax = getTornadoMaxValue(finite, 'left', scaleMode);
  let rightMax = getTornadoMaxValue(finite, 'right', scaleMode);
  if (isFiniteNumber(input.valueMax) && input.valueMax > 0) {
    leftMax = input.valueMax;
    rightMax = input.valueMax;
  }

  const sorted = sortTornadoItems(finite, input.sortBy, input.sortOrder);
  const N = sorted.length;
  const catAxisLength = orientation === 'horizontal' ? innerHeight : innerWidth;
  const totalGap = bandGap * Math.max(0, N - 1);
  const bandWidth = Math.max(0, (catAxisLength - totalGap) / Math.max(1, N));
  const barThickness = isFiniteNumber(input.barThickness)
    ? Math.max(0, input.barThickness)
    : Math.max(2, bandWidth * 0.7);

  const leftColor = input.leftColor ?? DEFAULT_CHART_TORNADO_LEFT_COLOR;
  const rightColor = input.rightColor ?? DEFAULT_CHART_TORNADO_RIGHT_COLOR;

  let centerLine: number;
  let leftSideStart: number;
  let leftSideEnd: number;
  let rightSideStart: number;
  let rightSideEnd: number;
  let halfSpanForLeft: number;
  let halfSpanForRight: number;

  if (orientation === 'horizontal') {
    centerLine = padding + innerWidth / 2;
    leftSideStart = padding;
    leftSideEnd = centerLine - centerGap;
    rightSideStart = centerLine + centerGap;
    rightSideEnd = padding + innerWidth;
    halfSpanForLeft = Math.max(0, leftSideEnd - leftSideStart);
    halfSpanForRight = Math.max(0, rightSideEnd - rightSideStart);
  } else {
    centerLine = padding + innerHeight / 2;
    leftSideStart = padding;
    leftSideEnd = centerLine - centerGap;
    rightSideStart = centerLine + centerGap;
    rightSideEnd = padding + innerHeight;
    halfSpanForLeft = Math.max(0, leftSideEnd - leftSideStart);
    halfSpanForRight = Math.max(0, rightSideEnd - rightSideStart);
  }

  const items: ChartTornadoLayoutItem[] = sorted.map((entry, i) => {
    const { item, originalIndex } = entry;
    const l = clampNonNeg(item.left);
    const r = clampNonNeg(item.right);
    const lPos = leftMax > 0 ? Math.min(1, l / leftMax) : 0;
    const rPos = rightMax > 0 ? Math.min(1, r / rightMax) : 0;
    const itemLeftColor = item.leftColor ?? leftColor;
    const itemRightColor = item.rightColor ?? rightColor;

    if (orientation === 'horizontal') {
      const rowCenter = padding + bandGap * i + bandWidth * (i + 0.5);
      const barY = rowCenter - barThickness / 2;
      const leftBarW = lPos * halfSpanForLeft;
      const rightBarW = rPos * halfSpanForRight;
      const leftBarX = leftSideEnd - leftBarW;
      const rightBarX = rightSideStart;
      return {
        id: item.id,
        label: item.label,
        index: i,
        originalIndex,
        left: l,
        right: r,
        diff: r - l,
        sum: l + r,
        leftColor: itemLeftColor,
        rightColor: itemRightColor,
        leftX: leftBarX,
        leftY: barY,
        leftWidth: leftBarW,
        leftHeight: barThickness,
        rightX: rightBarX,
        rightY: barY,
        rightWidth: rightBarW,
        rightHeight: barThickness,
        rowCenter,
      };
    }
    const rowCenter = padding + bandGap * i + bandWidth * (i + 0.5);
    const barX = rowCenter - barThickness / 2;
    const leftBarH = lPos * halfSpanForLeft;
    const rightBarH = rPos * halfSpanForRight;
    const leftBarY = leftSideEnd - leftBarH;
    const rightBarY = rightSideStart;
    return {
      id: item.id,
      label: item.label,
      index: i,
      originalIndex,
      left: l,
      right: r,
      diff: r - l,
      sum: l + r,
      leftColor: itemLeftColor,
      rightColor: itemRightColor,
      leftX: barX,
      leftY: leftBarY,
      leftWidth: barThickness,
      leftHeight: leftBarH,
      rightX: barX,
      rightY: rightBarY,
      rightWidth: barThickness,
      rightHeight: rightBarH,
      rowCenter,
    };
  });

  const tickCount = input.tickCount ?? DEFAULT_CHART_TORNADO_TICK_COUNT;
  const leftRaw = getTornadoTicks(leftMax, tickCount);
  const rightRaw = getTornadoTicks(rightMax, tickCount);

  const leftTicks = leftRaw.map((t) => ({
    value: t.value,
    position:
      orientation === 'horizontal'
        ? leftSideEnd - t.position * halfSpanForLeft
        : leftSideEnd - t.position * halfSpanForLeft,
  }));
  const rightTicks = rightRaw.map((t) => ({
    value: t.value,
    position:
      orientation === 'horizontal'
        ? rightSideStart + t.position * halfSpanForRight
        : rightSideStart + t.position * halfSpanForRight,
  }));

  return {
    items,
    leftTicks,
    rightTicks,
    leftMax,
    rightMax,
    orientation,
    scaleMode,
    innerWidth,
    innerHeight,
    bandWidth,
    barThickness,
    centerLine,
    leftSideStart,
    leftSideEnd,
    rightSideStart,
    rightSideEnd,
  };
}

export function describeTornadoChart(
  items: readonly ChartTornadoItem[],
  leftLabel: string,
  rightLabel: string,
  formatValue?: (n: number) => string,
): string {
  const finite = getTornadoFiniteItems(items);
  if (finite.length === 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  let leftMax = 0;
  let rightMax = 0;
  for (const it of finite) {
    const l = clampNonNeg(it.left);
    const r = clampNonNeg(it.right);
    if (l > leftMax) leftMax = l;
    if (r > rightMax) rightMax = r;
  }
  return `Tornado chart comparing ${leftLabel} and ${rightLabel} across ${finite.length} categor${finite.length === 1 ? 'y' : 'ies'}. Peak ${leftLabel} ${fmt(leftMax)}, peak ${rightLabel} ${fmt(rightMax)}.`;
}

export interface ChartTornadoItemClick {
  item: ChartTornadoItem;
  layout: ChartTornadoLayoutItem;
  side: ChartTornadoSide;
}

export interface ChartTornadoProps {
  items: readonly ChartTornadoItem[];
  orientation?: ChartTornadoOrientation;
  scaleMode?: ChartTornadoScaleMode;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
  sortBy?: ChartTornadoSortBy;
  sortOrder?: ChartTornadoSortOrder;
  valueMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  centerGap?: number;
  bandGap?: number;
  barThickness?: number;
  tickCount?: number;
  barOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  centerLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showCenterLine?: boolean;
  showCategoryLabels?: boolean;
  showValueLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatCategory?: (item: ChartTornadoItem) => string;
  valueLabel?: string;
  onItemClick?: (info: ChartTornadoItemClick) => void;
  style?: CSSProperties;
}

export const ChartTornado = forwardRef(function ChartTornado(
  {
    items,
    orientation = DEFAULT_CHART_TORNADO_ORIENTATION,
    scaleMode = DEFAULT_CHART_TORNADO_SCALE_MODE,
    leftLabel = 'Left',
    rightLabel = 'Right',
    leftColor = DEFAULT_CHART_TORNADO_LEFT_COLOR,
    rightColor = DEFAULT_CHART_TORNADO_RIGHT_COLOR,
    sortBy,
    sortOrder,
    valueMax,
    width = DEFAULT_CHART_TORNADO_WIDTH,
    height = DEFAULT_CHART_TORNADO_HEIGHT,
    padding = DEFAULT_CHART_TORNADO_PADDING,
    centerGap = DEFAULT_CHART_TORNADO_CENTER_GAP,
    bandGap = DEFAULT_CHART_TORNADO_BAND_GAP,
    barThickness,
    tickCount = DEFAULT_CHART_TORNADO_TICK_COUNT,
    barOpacity = DEFAULT_CHART_TORNADO_BAR_OPACITY,
    gridColor = DEFAULT_CHART_TORNADO_GRID_COLOR,
    axisColor = DEFAULT_CHART_TORNADO_AXIS_COLOR,
    centerLineColor = DEFAULT_CHART_TORNADO_CENTER_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showCenterLine = true,
    showCategoryLabels = true,
    showValueLabels = false,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Tornado chart',
    ariaDescription,
    formatValue,
    formatCategory,
    valueLabel,
    onItemClick,
    style,
  }: ChartTornadoProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtCategory = useCallback(
    (it: ChartTornadoItem) =>
      formatCategory ? formatCategory(it) : it.label,
    [formatCategory],
  );

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeTornadoLayout({
        items,
        orientation,
        scaleMode,
        ...(sortBy ? { sortBy } : {}),
        ...(sortOrder ? { sortOrder } : {}),
        ...(valueMax !== undefined ? { valueMax } : {}),
        width,
        height,
        padding,
        centerGap,
        bandGap,
        ...(barThickness !== undefined ? { barThickness } : {}),
        tickCount,
        leftColor,
        rightColor,
      }),
    [
      items,
      orientation,
      scaleMode,
      sortBy,
      sortOrder,
      valueMax,
      width,
      height,
      padding,
      centerGap,
      bandGap,
      barThickness,
      tickCount,
      leftColor,
      rightColor,
    ],
  );

  const description =
    ariaDescription ??
    describeTornadoChart(items, leftLabel, rightLabel, fmtValue);

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const isH = orientation === 'horizontal';

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-tornado"
      data-orientation={orientation}
      data-scale-mode={scaleMode}
      data-category-count={items.length}
      data-finite-count={layout.items.length}
      data-left-max={layout.leftMax}
      data-right-max={layout.rightMax}
      data-sort-by={sortBy ?? 'none'}
      data-sort-order={sortOrder ?? 'none'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-tornado-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-tornado-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-tornado-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-tornado-grid">
              {layout.leftTicks.map((t) => (
                <line
                  key={`grid-l-${t.value}`}
                  data-section="chart-tornado-grid-line"
                  data-side="left"
                  data-tick-value={t.value}
                  x1={isH ? t.position : padding}
                  y1={isH ? padding : t.position}
                  x2={isH ? t.position : padding + layout.innerWidth}
                  y2={isH ? padding + layout.innerHeight : t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
              {layout.rightTicks.map((t) => (
                <line
                  key={`grid-r-${t.value}`}
                  data-section="chart-tornado-grid-line"
                  data-side="right"
                  data-tick-value={t.value}
                  x1={isH ? t.position : padding}
                  y1={isH ? padding : t.position}
                  x2={isH ? t.position : padding + layout.innerWidth}
                  y2={isH ? padding + layout.innerHeight : t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-tornado-axes">
              <line
                data-section="chart-tornado-axis"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <g data-section="chart-tornado-ticks">
                {layout.leftTicks.map((t) => (
                  <g
                    key={`tick-l-${t.value}`}
                    data-section="chart-tornado-tick"
                    data-side="left"
                  >
                    <text
                      data-section="chart-tornado-tick-label"
                      data-side="left"
                      data-tick-value={t.value}
                      x={isH ? t.position : padding - 6}
                      y={isH ? padding + layout.innerHeight + 14 : t.position + 3}
                      textAnchor={isH ? 'middle' : 'end'}
                      fontSize={10}
                      fill="currentColor"
                    >
                      {fmtValue(t.value)}
                    </text>
                  </g>
                ))}
                {layout.rightTicks.map((t) => (
                  <g
                    key={`tick-r-${t.value}`}
                    data-section="chart-tornado-tick"
                    data-side="right"
                  >
                    <text
                      data-section="chart-tornado-tick-label"
                      data-side="right"
                      data-tick-value={t.value}
                      x={isH ? t.position : padding - 6}
                      y={isH ? padding + layout.innerHeight + 14 : t.position + 3}
                      textAnchor={isH ? 'middle' : 'end'}
                      fontSize={10}
                      fill="currentColor"
                    >
                      {fmtValue(t.value)}
                    </text>
                  </g>
                ))}
              </g>
              {valueLabel ? (
                <text
                  data-section="chart-tornado-value-label"
                  x={
                    isH
                      ? padding + layout.innerWidth / 2
                      : padding - 32
                  }
                  y={
                    isH
                      ? padding + layout.innerHeight + 30
                      : padding + layout.innerHeight / 2
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {valueLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {showCenterLine ? (
            <line
              data-section="chart-tornado-center-line"
              x1={isH ? layout.centerLine : padding}
              y1={isH ? padding : layout.centerLine}
              x2={isH ? layout.centerLine : padding + layout.innerWidth}
              y2={isH ? padding + layout.innerHeight : layout.centerLine}
              stroke={centerLineColor}
              strokeWidth={1.2}
            />
          ) : null}

          {showCategoryLabels ? (
            <g data-section="chart-tornado-category-labels">
              {layout.items.map((it) => (
                <text
                  key={`cat-${it.id}`}
                  data-section="chart-tornado-category-text"
                  data-item-id={it.id}
                  x={
                    isH
                      ? layout.centerLine
                      : it.rowCenter
                  }
                  y={
                    isH
                      ? it.rowCenter - layout.barThickness / 2 - 4
                      : layout.centerLine - 6
                  }
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {it.label}
                </text>
              ))}
            </g>
          ) : null}

          <g data-section="chart-tornado-items">
            {layout.items.map((it) => {
              const leftKey = `${it.id}::left`;
              const rightKey = `${it.id}::right`;
              const isHoverLeft = hoveredKey === leftKey;
              const isHoverRight = hoveredKey === rightKey;
              const isHoverItem = isHoverLeft || isHoverRight;
              const isDimLeft =
                hoveredKey !== null && !isHoverLeft ? 0.3 : barOpacity;
              const isDimRight =
                hoveredKey !== null && !isHoverRight ? 0.3 : barOpacity;
              const ariaLeft = `${fmtCategory({ id: it.id, label: it.label, left: it.left, right: it.right })}: ${leftLabel} ${fmtValue(it.left)}`;
              const ariaRight = `${fmtCategory({ id: it.id, label: it.label, left: it.left, right: it.right })}: ${rightLabel} ${fmtValue(it.right)}`;
              return (
                <g
                  key={it.id}
                  data-section="chart-tornado-item"
                  data-item-id={it.id}
                  data-item-index={it.index}
                  data-item-original-index={it.originalIndex}
                  data-item-left={it.left}
                  data-item-right={it.right}
                  data-item-diff={it.diff}
                  data-item-sum={it.sum}
                  data-hovered={isHoverItem ? 'true' : 'false'}
                >
                  <rect
                    data-section="chart-tornado-bar"
                    data-item-id={it.id}
                    data-side="left"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={ariaLeft}
                    x={it.leftX}
                    y={it.leftY}
                    width={it.leftWidth}
                    height={it.leftHeight}
                    fill={it.leftColor}
                    fillOpacity={isDimLeft}
                    onMouseEnter={() => setHoveredKey(leftKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(leftKey)}
                    onBlur={() => setHoveredKey(null)}
                    onClick={() => {
                      if (onItemClick) {
                        onItemClick({
                          item: {
                            id: it.id,
                            label: it.label,
                            left: it.left,
                            right: it.right,
                          },
                          layout: it,
                          side: 'left',
                        });
                      }
                    }}
                  />
                  <rect
                    data-section="chart-tornado-bar"
                    data-item-id={it.id}
                    data-side="right"
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={ariaRight}
                    x={it.rightX}
                    y={it.rightY}
                    width={it.rightWidth}
                    height={it.rightHeight}
                    fill={it.rightColor}
                    fillOpacity={isDimRight}
                    onMouseEnter={() => setHoveredKey(rightKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(rightKey)}
                    onBlur={() => setHoveredKey(null)}
                    onClick={() => {
                      if (onItemClick) {
                        onItemClick({
                          item: {
                            id: it.id,
                            label: it.label,
                            left: it.left,
                            right: it.right,
                          },
                          layout: it,
                          side: 'right',
                        });
                      }
                    }}
                  />
                  {showValueLabels ? (
                    <g data-section="chart-tornado-value-texts">
                      <text
                        data-section="chart-tornado-value-text"
                        data-item-id={it.id}
                        data-side="left"
                        x={isH ? it.leftX - 4 : it.leftX + it.leftWidth / 2}
                        y={
                          isH
                            ? it.leftY + it.leftHeight / 2 + 3
                            : it.leftY - 4
                        }
                        textAnchor={isH ? 'end' : 'middle'}
                        fontSize={10}
                        fill={it.leftColor}
                      >
                        {fmtValue(it.left)}
                      </text>
                      <text
                        data-section="chart-tornado-value-text"
                        data-item-id={it.id}
                        data-side="right"
                        x={
                          isH
                            ? it.rightX + it.rightWidth + 4
                            : it.rightX + it.rightWidth / 2
                        }
                        y={
                          isH
                            ? it.rightY + it.rightHeight / 2 + 3
                            : it.rightY + it.rightHeight + 12
                        }
                        textAnchor={isH ? 'start' : 'middle'}
                        fontSize={10}
                        fill={it.rightColor}
                      >
                        {fmtValue(it.right)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const [hid, side] = hoveredKey.split('::');
          const it = layout.items.find((x) => x.id === hid);
          if (!it) return null;
          const isLeft = side === 'left';
          const anchorX = isLeft
            ? it.leftX + it.leftWidth / 2
            : it.rightX + it.rightWidth / 2;
          const anchorY = isLeft
            ? it.leftY + it.leftHeight / 2
            : it.rightY + it.rightHeight / 2;
          const tx = Math.min(Math.max(anchorX + 8, 0), width - 180);
          const ty = Math.min(Math.max(anchorY - 36, 0), height - 60);
          return (
            <div
              data-section="chart-tornado-tooltip"
              data-item-id={it.id}
              data-side={side}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-tornado-tooltip-label"
                className="font-medium"
              >
                {fmtCategory({
                  id: it.id,
                  label: it.label,
                  left: it.left,
                  right: it.right,
                })}
              </div>
              <div
                data-section="chart-tornado-tooltip-left"
                className="text-slate-600"
                style={isLeft ? { fontWeight: 600 } : undefined}
              >
                {leftLabel}: {fmtValue(it.left)}
              </div>
              <div
                data-section="chart-tornado-tooltip-right"
                className="text-slate-600"
                style={!isLeft ? { fontWeight: 600 } : undefined}
              >
                {rightLabel}: {fmtValue(it.right)}
              </div>
              <div
                data-section="chart-tornado-tooltip-diff"
                className="text-slate-500"
              >
                diff: {fmtValue(it.diff)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend ? (
        <ul
          data-section="chart-tornado-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          <li data-section="chart-tornado-legend-item" data-side="left">
            <span className="flex items-center gap-1">
              <span
                data-section="chart-tornado-legend-swatch"
                className="inline-block h-2 w-3"
                style={{ backgroundColor: leftColor }}
              />
              <span data-section="chart-tornado-legend-label">
                {leftLabel}
              </span>
            </span>
          </li>
          <li data-section="chart-tornado-legend-item" data-side="right">
            <span className="flex items-center gap-1">
              <span
                data-section="chart-tornado-legend-swatch"
                className="inline-block h-2 w-3"
                style={{ backgroundColor: rightColor }}
              />
              <span data-section="chart-tornado-legend-label">
                {rightLabel}
              </span>
            </span>
          </li>
        </ul>
      ) : null}
    </div>
  );
});

ChartTornado.displayName = 'ChartTornado';
