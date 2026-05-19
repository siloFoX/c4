import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_ICICLE_WIDTH = 560;
export const DEFAULT_CHART_ICICLE_HEIGHT = 320;
export const DEFAULT_CHART_ICICLE_PADDING = 16;
export const DEFAULT_CHART_ICICLE_CELL_GAP = 1;
export const DEFAULT_CHART_ICICLE_LABEL_MIN_WIDTH = 36;
export const DEFAULT_CHART_ICICLE_LABEL_MIN_HEIGHT = 14;
export const DEFAULT_CHART_ICICLE_FILL_OPACITY = 0.85;
export const DEFAULT_CHART_ICICLE_ORIENTATION = 'horizontal';
export const DEFAULT_CHART_ICICLE_PALETTE = [
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

export type ChartIcicleOrientation = 'horizontal' | 'vertical';

export interface ChartIcicleNode {
  id: string;
  label: string;
  value?: number;
  color?: string;
  children?: readonly ChartIcicleNode[];
}

export interface ChartIcicleFlatNode {
  id: string;
  label: string;
  color?: string;
  depth: number;
  parentId: string | null;
  path: string[];
  value: number;
  isLeaf: boolean;
}

export interface ChartIcicleLayoutCell {
  id: string;
  label: string;
  path: string[];
  depth: number;
  parentId: string | null;
  value: number;
  share: number;
  globalShare: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isFocus: boolean;
}

export interface ComputeIcicleLayoutResult {
  cells: ChartIcicleLayoutCell[];
  flat: ChartIcicleFlatNode[];
  focusNode: ChartIcicleFlatNode | null;
  focusValue: number;
  maxDepth: number;
  bandSize: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getIcicleDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_ICICLE_PALETTE[0]!;
  }
  return DEFAULT_CHART_ICICLE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_ICICLE_PALETTE.length
  ]!;
}

export function getIcicleNodeValue(node: ChartIcicleNode): number {
  if (node.children?.length) {
    let sum = 0;
    for (const child of node.children) sum += getIcicleNodeValue(child);
    if (sum > 0) return sum;
    return isFiniteNumber(node.value) && node.value > 0 ? node.value : 0;
  }
  return isFiniteNumber(node.value) && node.value > 0 ? node.value : 0;
}

export function flattenIcicleHierarchy(
  root: ChartIcicleNode | null
): ChartIcicleFlatNode[] {
  if (!root) return [];
  const out: ChartIcicleFlatNode[] = [];
  const visit = (
    node: ChartIcicleNode,
    parentId: string | null,
    path: string[]
  ): void => {
    const value = getIcicleNodeValue(node);
    const isLeaf = !node.children?.length;
    const entry: ChartIcicleFlatNode = {
      id: node.id,
      label: node.label,
      depth: path.length,
      parentId,
      path: [...path, node.id],
      value,
      isLeaf,
    };
    if (typeof node.color === 'string') entry.color = node.color;
    out.push(entry);
    if (node.children?.length) {
      for (const child of node.children) {
        visit(child, node.id, [...path, node.id]);
      }
    }
  };
  visit(root, null, []);
  return out;
}

export function getIcicleMaxDepth(
  nodes: readonly ChartIcicleFlatNode[]
): number {
  let max = 0;
  for (const n of nodes) {
    if (n.depth > max) max = n.depth;
  }
  return max;
}

export interface ComputeIcicleLayoutInput {
  root: ChartIcicleNode | null;
  focusPath: readonly string[];
  orientation: ChartIcicleOrientation;
  width: number;
  height: number;
  padX: number;
  padY: number;
  cellGap: number;
  fallbackColor: string;
}

export function computeIcicleLayout(
  input: ComputeIcicleLayoutInput
): ComputeIcicleLayoutResult {
  const {
    root,
    focusPath,
    orientation,
    width,
    height,
    padX,
    padY,
    cellGap,
    fallbackColor,
  } = input;
  const flat = flattenIcicleHierarchy(root);
  if (!root || !flat.length || width <= 0 || height <= 0) {
    return {
      cells: [],
      flat,
      focusNode: null,
      focusValue: 0,
      maxDepth: 0,
      bandSize: 0,
    };
  }
  const focusId = focusPath[focusPath.length - 1] ?? root.id;
  let focusNode = flat.find((n) => n.id === focusId);
  if (!focusNode) focusNode = flat[0]!;
  const focusValue = focusNode.value;
  const focusPathRef = focusNode.path;
  const focusDepth = focusNode.depth;

  let maxDepth = 0;
  for (const n of flat) {
    if (n.path.length >= focusPathRef.length) {
      let inFocus = true;
      for (let i = 0; i < focusPathRef.length; i++) {
        if (n.path[i] !== focusPathRef[i]) {
          inFocus = false;
          break;
        }
      }
      if (inFocus) {
        const rel = n.depth - focusDepth;
        if (rel > maxDepth) maxDepth = rel;
      }
    }
  }
  const bands = maxDepth + 1;
  const bandSize =
    bands > 0
      ? orientation === 'horizontal'
        ? height / bands
        : width / bands
      : 0;
  if (bandSize <= 0 || focusValue <= 0) {
    return {
      cells: [],
      flat,
      focusNode,
      focusValue,
      maxDepth,
      bandSize,
    };
  }

  const cells: ChartIcicleLayoutCell[] = [];

  const recurse = (
    node: ChartIcicleNode,
    parentId: string | null,
    depth: number,
    path: string[],
    x: number,
    y: number,
    blockW: number,
    blockH: number,
    inheritedColorIndex: number
  ) => {
    const nodeValue = getIcicleNodeValue(node);
    const inFocusBranch =
      depth >= focusDepth &&
      focusPathRef.every((id, i) => path[i] === id);
    if (!inFocusBranch) {
      if (node.children?.length) {
        for (const child of node.children) {
          recurse(
            child,
            node.id,
            depth + 1,
            [...path, child.id],
            x,
            y,
            blockW,
            blockH,
            inheritedColorIndex
          );
        }
      }
      return;
    }
    const relDepth = depth - focusDepth;
    if (relDepth >= bands) return;
    if (nodeValue <= 0) return;
    const isFocus = depth === focusDepth;
    const color =
      node.color ??
      (isFocus
        ? fallbackColor
        : getIcicleDefaultColor(inheritedColorIndex));
    const cellGapHalf = Math.min(
      cellGap / 2,
      blockW / 4,
      blockH / 4
    );
    const cellX = x + cellGapHalf;
    const cellY = y + cellGapHalf;
    const cellW = Math.max(0, blockW - cellGapHalf * 2);
    const cellH = Math.max(0, blockH - cellGapHalf * 2);
    const share = focusValue > 0 ? nodeValue / focusValue : 0;
    const globalShare =
      flat[0] && flat[0].value > 0 ? nodeValue / flat[0].value : 0;
    cells.push({
      id: node.id,
      label: node.label,
      path: [...path],
      depth,
      parentId,
      value: nodeValue,
      share,
      globalShare,
      color,
      x: cellX,
      y: cellY,
      width: cellW,
      height: cellH,
      isFocus,
    });
    if (!node.children?.length) return;
    let totalChildValue = 0;
    for (const c of node.children) totalChildValue += getIcicleNodeValue(c);
    if (totalChildValue <= 0) return;
    let cursorMain = orientation === 'horizontal' ? x : y;
    const fullMain = orientation === 'horizontal' ? blockW : blockH;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      const childValue = getIcicleNodeValue(child);
      if (childValue <= 0) continue;
      const span = (childValue / totalChildValue) * fullMain;
      const nextColorIndex = depth === focusDepth ? i : inheritedColorIndex;
      if (orientation === 'horizontal') {
        recurse(
          child,
          node.id,
          depth + 1,
          [...path, child.id],
          cursorMain,
          y + blockH,
          span,
          bandSize,
          nextColorIndex
        );
      } else {
        recurse(
          child,
          node.id,
          depth + 1,
          [...path, child.id],
          x + blockW,
          cursorMain,
          bandSize,
          span,
          nextColorIndex
        );
      }
      cursorMain += span;
    }
  };

  if (orientation === 'horizontal') {
    recurse(
      root,
      null,
      0,
      [root.id],
      padX,
      padY,
      width,
      bandSize,
      0
    );
  } else {
    recurse(
      root,
      null,
      0,
      [root.id],
      padX,
      padY,
      bandSize,
      height,
      0
    );
  }

  return { cells, flat, focusNode, focusValue, maxDepth, bandSize };
}

export function describeIcicleChart(
  root: ChartIcicleNode | null,
  focusPath: readonly string[],
  orientation: ChartIcicleOrientation,
  formatValue?: (v: number) => string
): string {
  if (!root) return 'No data';
  const flat = flattenIcicleHierarchy(root);
  if (!flat.length || flat[0]!.value <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const focusId = focusPath[focusPath.length - 1] ?? root.id;
  const focus = flat.find((n) => n.id === focusId) ?? flat[0]!;
  return `Icicle chart (${orientation}) with ${flat.length} nodes across ${getIcicleMaxDepth(flat) + 1} levels, total ${fmt(flat[0]!.value)}. Focused on ${focus.label} (depth ${focus.depth}).`;
}

export interface ChartIcicleProps {
  root: ChartIcicleNode | null;
  width?: number;
  height?: number;
  padding?: number;
  cellGap?: number;
  orientation?: ChartIcicleOrientation;
  focusPath?: readonly string[];
  defaultFocusPath?: readonly string[];
  onFocusPathChange?: (path: string[]) => void;
  fillOpacity?: number;
  labelMinWidth?: number;
  labelMinHeight?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  showBreadcrumb?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (p: number) => string;
  fallbackColor?: string;
  onCellClick?: (args: {
    cell: ChartIcicleLayoutCell;
    becameFocus: boolean;
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

const ChartIcicleInner = (
  {
    root,
    width = DEFAULT_CHART_ICICLE_WIDTH,
    height = DEFAULT_CHART_ICICLE_HEIGHT,
    padding = DEFAULT_CHART_ICICLE_PADDING,
    cellGap = DEFAULT_CHART_ICICLE_CELL_GAP,
    orientation = DEFAULT_CHART_ICICLE_ORIENTATION,
    focusPath,
    defaultFocusPath,
    onFocusPathChange,
    fillOpacity = DEFAULT_CHART_ICICLE_FILL_OPACITY,
    labelMinWidth = DEFAULT_CHART_ICICLE_LABEL_MIN_WIDTH,
    labelMinHeight = DEFAULT_CHART_ICICLE_LABEL_MIN_HEIGHT,
    showLabels = true,
    showTooltip = true,
    showBreadcrumb = true,
    animate = true,
    className,
    ariaLabel = 'Icicle chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatPercent = defaultFormatPercent,
    fallbackColor = '#94a3b8',
    onCellClick,
    style,
  }: ChartIcicleProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-icicle-desc-${reactId}`;
  const initialFocus = useMemo<string[]>(() => {
    if (defaultFocusPath && defaultFocusPath.length) {
      return [...defaultFocusPath];
    }
    if (root) return [root.id];
    return [];
  }, [defaultFocusPath, root]);
  const [internalFocus, setInternalFocus] = useState<string[]>(initialFocus);
  const focusResolved = useMemo<string[]>(() => {
    if (isControlled(focusPath)) return [...focusPath];
    return internalFocus;
  }, [focusPath, internalFocus]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);

  const result = useMemo(
    () =>
      computeIcicleLayout({
        root,
        focusPath: focusResolved,
        orientation,
        width: innerW,
        height: innerH,
        padX: padding,
        padY: padding,
        cellGap,
        fallbackColor,
      }),
    [
      root,
      focusResolved,
      orientation,
      innerW,
      innerH,
      padding,
      cellGap,
      fallbackColor,
    ]
  );

  const autoDescription = useMemo(
    () => describeIcicleChart(root, focusResolved, orientation, formatValue),
    [root, focusResolved, orientation, formatValue]
  );

  const setFocus = useCallback(
    (path: string[]) => {
      if (!isControlled(focusPath)) setInternalFocus(path);
      onFocusPathChange?.(path);
    },
    [focusPath, onFocusPathChange]
  );

  const handleCellClick = useCallback(
    (cell: ChartIcicleLayoutCell) => {
      const isFocus =
        cell.path.length === focusResolved.length &&
        cell.path.every((id, i) => focusResolved[i] === id);
      const becameFocus = !isFocus;
      if (becameFocus) setFocus([...cell.path]);
      onCellClick?.({ cell, becameFocus });
    },
    [focusResolved, setFocus, onCellClick]
  );

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      const nextPath = focusResolved.slice(0, index + 1);
      if (nextPath.length) setFocus(nextPath);
    },
    [focusResolved, setFocus]
  );

  const hovered = useMemo(
    () => result.cells.find((c) => c.id === hoveredId) ?? null,
    [result.cells, hoveredId]
  );

  const breadcrumb = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (let i = 0; i < focusResolved.length; i++) {
      const flat = result.flat.find((n) => n.id === focusResolved[i]);
      if (flat) out.push({ id: flat.id, label: flat.label });
    }
    return out;
  }, [focusResolved, result.flat]);

  return (
    <div
      ref={ref}
      data-section="chart-icicle"
      data-node-count={result.flat.length}
      data-cell-count={result.cells.length}
      data-focus-id={result.focusNode?.id ?? ''}
      data-focus-depth={result.focusNode?.depth ?? 0}
      data-max-depth={result.maxDepth}
      data-orientation={orientation}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-icicle flex flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      {showBreadcrumb && breadcrumb.length > 0 && (
        <nav
          data-section="chart-icicle-breadcrumb"
          aria-label="Icicle breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs"
        >
          {breadcrumb.map((entry, idx) => (
            <span
              key={`bc-${entry.id}-${idx}`}
              data-section="chart-icicle-breadcrumb-item"
              data-breadcrumb-id={entry.id}
              data-breadcrumb-index={idx}
            >
              <button
                type="button"
                data-section="chart-icicle-breadcrumb-button"
                aria-label={`Zoom to ${entry.label}`}
                className="rounded px-1 py-0.5 text-slate-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-slate-400"
                onClick={() => handleBreadcrumbClick(idx)}
              >
                {entry.label}
              </button>
              {idx < breadcrumb.length - 1 && (
                <span
                  data-section="chart-icicle-breadcrumb-sep"
                  className="px-0.5 text-slate-400"
                >
                  /
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div
        data-section="chart-icicle-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-icicle-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-icicle-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          <g data-section="chart-icicle-cells">
            {result.cells.map((cell) => {
              const isHovered = hoveredId === cell.id;
              const showLabel =
                showLabels &&
                cell.width >= labelMinWidth &&
                cell.height >= labelMinHeight;
              return (
                <g
                  key={cell.id}
                  data-section="chart-icicle-cell"
                  data-cell-id={cell.id}
                  data-cell-depth={cell.depth}
                  data-cell-parent={cell.parentId ?? ''}
                  data-cell-value={cell.value}
                  data-cell-share={cell.share}
                  data-cell-global-share={cell.globalShare}
                  data-cell-color={cell.color}
                  data-cell-is-focus={cell.isFocus ? 'true' : 'false'}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredId(cell.id)}
                  onMouseLeave={() =>
                    setHoveredId((cur) => (cur === cell.id ? null : cur))
                  }
                  onFocus={() => setHoveredId(cell.id)}
                  onBlur={() =>
                    setHoveredId((cur) => (cur === cell.id ? null : cur))
                  }
                  onClick={() => handleCellClick(cell)}
                >
                  <rect
                    data-section="chart-icicle-rect"
                    x={cell.x}
                    y={cell.y}
                    width={cell.width}
                    height={cell.height}
                    fill={cell.color}
                    fillOpacity={fillOpacity}
                    stroke={cell.color}
                    strokeWidth={1}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${cell.label}: ${formatValue(cell.value)} (${formatPercent(cell.share)})`}
                  />
                  {showLabel && (
                    <text
                      data-section="chart-icicle-cell-label"
                      x={cell.x + 4}
                      y={cell.y + 12}
                      fontSize={10}
                      fontWeight={500}
                      fill="rgb(255 255 255)"
                      pointerEvents="none"
                    >
                      {cell.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-icicle-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-icicle-tooltip-label"
              className="font-semibold"
            >
              {hovered.path.join(' / ')}
            </div>
            <div
              data-section="chart-icicle-tooltip-value"
              className="font-mono text-slate-700"
            >
              {formatValue(hovered.value)}
            </div>
            <div
              data-section="chart-icicle-tooltip-share"
              className="font-mono text-slate-500"
            >
              share: {formatPercent(hovered.share)}
            </div>
            <div
              data-section="chart-icicle-tooltip-global"
              className="font-mono text-slate-500"
            >
              of total: {formatPercent(hovered.globalShare)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChartIcicle = forwardRef<HTMLDivElement, ChartIcicleProps>(
  ChartIcicleInner
);
ChartIcicle.displayName = 'ChartIcicle';
