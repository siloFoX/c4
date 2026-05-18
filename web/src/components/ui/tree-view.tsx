import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.415, TODO 11.397) TreeView primitive.
//
// Hierarchical tree with expand / collapse, full WAI-ARIA tree
// keyboard pattern, HTML5 drag-and-drop reorder, and lazy
// children loading. The host owns the node array; this component
// owns the visibility (expansion), selection, focus, and drag
// state. All write-side hooks are externalized so the caller
// can plug into its own store.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface TreeNode {
  id: string;
  label: ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  data?: unknown;
}

export interface FlatTreeRow {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  parentId: string | null;
}

export type DropPosition = 'before' | 'inside' | 'after';

export interface TreeViewProps {
  nodes: TreeNode[];

  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onExpandedIdsChange?: (ids: string[]) => void;

  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;

  focusedId?: string | null;
  onFocusedIdChange?: (id: string) => void;

  onLoadChildren?: (node: TreeNode) => Promise<TreeNode[]>;
  loadingLabel?: ReactNode;

  enableDrag?: boolean;
  onReorder?: (
    sourceId: string,
    targetId: string,
    position: DropPosition,
  ) => void;

  ariaLabel?: string;
  className?: string;
  indent?: number;
  renderNode?: (
    row: FlatTreeRow,
    context: {
      isSelected: boolean;
      isFocused: boolean;
      isLoading: boolean;
      dropPosition: DropPosition | null;
    },
  ) => ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function flattenTree(
  nodes: TreeNode[],
  expandedIds: Set<string>,
): FlatTreeRow[] {
  const result: FlatTreeRow[] = [];
  function walk(
    list: TreeNode[],
    depth: number,
    parentId: string | null,
  ): void {
    for (const node of list) {
      const hasChildren =
        Array.isArray(node.children) && node.children.length > 0;
      const expanded = expandedIds.has(node.id);
      result.push({ node, depth, expanded, hasChildren, parentId });
      if (expanded && hasChildren) {
        walk(node.children!, depth + 1, node.id);
      }
    }
  }
  walk(nodes, 0, null);
  return result;
}

export function findNodePath(
  nodes: TreeNode[],
  id: string,
): string[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node.id];
    if (Array.isArray(node.children) && node.children.length > 0) {
      const sub = findNodePath(node.children, id);
      if (sub) return [node.id, ...sub];
    }
  }
  return null;
}

export function updateNodeChildren(
  nodes: TreeNode[],
  id: string,
  children: TreeNode[],
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, children };
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const next = updateNodeChildren(node.children, id, children);
      if (next !== node.children) {
        return { ...node, children: next };
      }
    }
    return node;
  });
}

export function computeDropPosition(
  y: number,
  height: number,
  canHaveChildren: boolean,
): DropPosition {
  if (height <= 0) return 'after';
  const ratio = Math.max(0, Math.min(1, y / height));
  if (!canHaveChildren) {
    return ratio < 0.5 ? 'before' : 'after';
  }
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

function isAncestor(
  nodes: TreeNode[],
  sourceId: string,
  targetId: string,
): boolean {
  const sourcePath = findNodePath(nodes, sourceId);
  const targetPath = findNodePath(nodes, targetId);
  if (!sourcePath || !targetPath) return false;
  return (
    targetPath.length > sourcePath.length &&
    sourcePath.every((id, idx) => targetPath[idx] === id)
  );
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const DEFAULT_INDENT_PX = 16;

export const TreeView = forwardRef(function TreeView(
  {
    nodes,
    expandedIds,
    defaultExpandedIds = [],
    onExpandedIdsChange,
    selectedId,
    defaultSelectedId = null,
    onSelectedIdChange,
    focusedId,
    onFocusedIdChange,
    onLoadChildren,
    loadingLabel = 'Loading...',
    enableDrag = false,
    onReorder,
    ariaLabel = 'Tree',
    className,
    indent = DEFAULT_INDENT_PX,
    renderNode,
  }: TreeViewProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const isExpandedControlled = expandedIds !== undefined;
  const isSelectedControlled = selectedId !== undefined;
  const isFocusedControlled = focusedId !== undefined;

  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );
  const expandedSet = useMemo(() => {
    if (isExpandedControlled) return new Set(expandedIds ?? []);
    return internalExpanded;
  }, [isExpandedControlled, expandedIds, internalExpanded]);

  const [internalSelected, setInternalSelected] = useState<string | null>(
    defaultSelectedId,
  );
  const effectiveSelected = isSelectedControlled
    ? (selectedId ?? null)
    : internalSelected;

  const [internalFocused, setInternalFocused] = useState<string | null>(
    null,
  );
  const effectiveFocused = isFocusedControlled
    ? (focusedId ?? null)
    : internalFocused;

  const flat = useMemo(
    () => flattenTree(nodes, expandedSet),
    [nodes, expandedSet],
  );

  // Track lazy-load state per node id.
  const [loadingIds, setLoadingIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Drag + drop state.
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: DropPosition;
  } | null>(null);

  const onExpandedChangeRef = useRef(onExpandedIdsChange);
  const onSelectedChangeRef = useRef(onSelectedIdChange);
  const onFocusedChangeRef = useRef(onFocusedIdChange);
  const onLoadChildrenRef = useRef(onLoadChildren);
  const onReorderRef = useRef(onReorder);
  useEffect(() => {
    onExpandedChangeRef.current = onExpandedIdsChange;
    onSelectedChangeRef.current = onSelectedIdChange;
    onFocusedChangeRef.current = onFocusedIdChange;
    onLoadChildrenRef.current = onLoadChildren;
    onReorderRef.current = onReorder;
  }, [
    onExpandedIdsChange,
    onSelectedIdChange,
    onFocusedIdChange,
    onLoadChildren,
    onReorder,
  ]);

  const setExpanded = useCallback(
    (nextSet: Set<string>) => {
      if (!isExpandedControlled) {
        setInternalExpanded(nextSet);
      }
      onExpandedChangeRef.current?.(Array.from(nextSet));
    },
    [isExpandedControlled],
  );

  const setSelected = useCallback(
    (next: string | null) => {
      if (!isSelectedControlled) setInternalSelected(next);
      onSelectedChangeRef.current?.(next);
    },
    [isSelectedControlled],
  );

  const setFocused = useCallback(
    (next: string) => {
      if (!isFocusedControlled) setInternalFocused(next);
      onFocusedChangeRef.current?.(next);
    },
    [isFocusedControlled],
  );

  const findRow = useCallback(
    (id: string): FlatTreeRow | undefined => {
      return flat.find((row) => row.node.id === id);
    },
    [flat],
  );

  const requestLoadChildren = useCallback(
    async (node: TreeNode) => {
      const handler = onLoadChildrenRef.current;
      if (!handler) return;
      if (loadingIds.has(node.id)) return;
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(node.id);
        return next;
      });
      try {
        await handler(node);
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      }
    },
    [loadingIds],
  );

  const toggleExpand = useCallback(
    (row: FlatTreeRow) => {
      if (row.node.isLeaf === true) return;
      const isOpen = expandedSet.has(row.node.id);
      const next = new Set(expandedSet);
      if (isOpen) {
        next.delete(row.node.id);
      } else {
        next.add(row.node.id);
      }
      setExpanded(next);
      // Lazy load when expanding a node that has not loaded yet.
      // (row.node.isLeaf === true is already guarded above.)
      if (!isOpen && !row.hasChildren && onLoadChildrenRef.current) {
        void requestLoadChildren(row.node);
      }
    },
    [expandedSet, setExpanded, requestLoadChildren],
  );

  const expand = useCallback(
    (row: FlatTreeRow) => {
      if (row.node.isLeaf === true) return;
      if (expandedSet.has(row.node.id)) return;
      const next = new Set(expandedSet);
      next.add(row.node.id);
      setExpanded(next);
      if (!row.hasChildren && onLoadChildrenRef.current) {
        void requestLoadChildren(row.node);
      }
    },
    [expandedSet, setExpanded, requestLoadChildren],
  );

  const collapse = useCallback(
    (row: FlatTreeRow) => {
      if (!expandedSet.has(row.node.id)) return;
      const next = new Set(expandedSet);
      next.delete(row.node.id);
      setExpanded(next);
    },
    [expandedSet, setExpanded],
  );

  const moveFocus = useCallback(
    (offset: 1 | -1) => {
      if (flat.length === 0) return;
      const currentIdx = effectiveFocused
        ? flat.findIndex((row) => row.node.id === effectiveFocused)
        : -1;
      let nextIdx = currentIdx + offset;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx > flat.length - 1) nextIdx = flat.length - 1;
      const next = flat[nextIdx];
      if (!next) return;
      setFocused(next.node.id);
    },
    [flat, effectiveFocused, setFocused],
  );

  const moveTo = useCallback(
    (target: 'first' | 'last') => {
      if (flat.length === 0) return;
      const row = target === 'first' ? flat[0] : flat[flat.length - 1];
      if (!row) return;
      setFocused(row.node.id);
    },
    [flat, setFocused],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const focusedRow = effectiveFocused
        ? findRow(effectiveFocused)
        : flat[0];
      if (!focusedRow) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveFocus(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          moveFocus(-1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (focusedRow.node.isLeaf === true) break;
          if (expandedSet.has(focusedRow.node.id)) {
            // Move to first child if available.
            const idx = flat.indexOf(focusedRow);
            const next = flat[idx + 1];
            if (next && next.depth > focusedRow.depth) {
              setFocused(next.node.id);
            }
          } else {
            expand(focusedRow);
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (
            focusedRow.node.isLeaf !== true &&
            expandedSet.has(focusedRow.node.id)
          ) {
            collapse(focusedRow);
          } else if (focusedRow.parentId) {
            setFocused(focusedRow.parentId);
          }
          break;
        case 'Home':
          event.preventDefault();
          moveTo('first');
          break;
        case 'End':
          event.preventDefault();
          moveTo('last');
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedRow.node.isLeaf === true) {
            setSelected(focusedRow.node.id);
          } else {
            toggleExpand(focusedRow);
            setSelected(focusedRow.node.id);
          }
          break;
        default:
          break;
      }
    },
    [
      effectiveFocused,
      findRow,
      flat,
      moveFocus,
      moveTo,
      expandedSet,
      expand,
      collapse,
      setFocused,
      setSelected,
      toggleExpand,
    ],
  );

  const handleRowClick = useCallback(
    (row: FlatTreeRow) => {
      if (row.node.disabled) return;
      setFocused(row.node.id);
      setSelected(row.node.id);
    },
    [setFocused, setSelected],
  );

  const handleToggleClick = useCallback(
    (row: FlatTreeRow, event: React.MouseEvent) => {
      event.stopPropagation();
      if (row.node.disabled) return;
      toggleExpand(row);
    },
    [toggleExpand],
  );

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, row: FlatTreeRow) => {
      if (!enableDrag || row.node.disabled) {
        event.preventDefault();
        return;
      }
      setDragSourceId(row.node.id);
      try {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', row.node.id);
      } catch {
        // dataTransfer occasionally throws under jsdom; the
        // dragSourceId state is the authoritative source.
      }
    },
    [enableDrag],
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, row: FlatTreeRow) => {
      if (!enableDrag || dragSourceId === null) return;
      if (dragSourceId === row.node.id) return;
      // Refuse drops that would create a cycle.
      if (isAncestor(nodes, dragSourceId, row.node.id)) return;
      event.preventDefault();
      try {
        event.dataTransfer.dropEffect = 'move';
      } catch {
        /* jsdom safety */
      }
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const canHaveChildren = row.node.isLeaf !== true;
      const position = computeDropPosition(
        y,
        rect.height,
        canHaveChildren,
      );
      setDropTarget({ id: row.node.id, position });
    },
    [enableDrag, dragSourceId, nodes],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>, row: FlatTreeRow) => {
      if (!enableDrag || dragSourceId === null) return;
      event.preventDefault();
      const dropPos = dropTarget?.position ?? 'after';
      const source = dragSourceId;
      setDragSourceId(null);
      setDropTarget(null);
      if (source === row.node.id) return;
      if (isAncestor(nodes, source, row.node.id)) return;
      onReorderRef.current?.(source, row.node.id, dropPos);
    },
    [enableDrag, dragSourceId, dropTarget, nodes],
  );

  const handleDragEnd = useCallback(() => {
    setDragSourceId(null);
    setDropTarget(null);
  }, []);

  const renderRow = useCallback(
    (row: FlatTreeRow) => {
      const node = row.node;
      const isSelected = effectiveSelected === node.id;
      const isFocused = effectiveFocused === node.id;
      const isLoading = loadingIds.has(node.id);
      const showAsExpandable = node.isLeaf !== true;
      const ariaExpanded = showAsExpandable
        ? expandedSet.has(node.id)
        : undefined;
      const dropPosition =
        dropTarget?.id === node.id ? dropTarget.position : null;

      const rowStyle: CSSProperties = {
        paddingLeft: `${row.depth * indent}px`,
      };

      return (
        <div
          key={node.id}
          role="treeitem"
          aria-level={row.depth + 1}
          aria-expanded={ariaExpanded}
          aria-selected={isSelected}
          aria-disabled={node.disabled === true || undefined}
          tabIndex={
            (effectiveFocused ?? flat[0]?.node.id) === node.id ? 0 : -1
          }
          draggable={enableDrag && !node.disabled}
          data-section="tree-view-item"
          data-tree-id={node.id}
          data-tree-depth={row.depth}
          data-tree-expanded={ariaExpanded ?? 'leaf'}
          data-tree-selected={isSelected ? 'true' : 'false'}
          data-tree-focused={isFocused ? 'true' : 'false'}
          data-tree-loading={isLoading ? 'true' : 'false'}
          data-drop-position={dropPosition ?? undefined}
          onClick={() => handleRowClick(row)}
          onDragStart={(e) => handleDragStart(e, row)}
          onDragOver={(e) => handleDragOver(e, row)}
          onDrop={(e) => handleDrop(e, row)}
          onDragEnd={handleDragEnd}
          className={cn(
            'group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-muted/50',
            isSelected && 'bg-primary/10 text-primary',
            node.disabled && 'cursor-not-allowed opacity-50',
            dropPosition === 'inside' && 'ring-2 ring-primary/60',
            dropPosition === 'before' &&
              'border-t-2 border-t-primary',
            dropPosition === 'after' &&
              'border-b-2 border-b-primary',
          )}
          style={rowStyle}
        >
          {renderNode ? (
            renderNode(row, {
              isSelected,
              isFocused,
              isLoading,
              dropPosition,
            })
          ) : (
            <>
              {showAsExpandable ? (
                <button
                  type="button"
                  aria-label={
                    expandedSet.has(node.id) ? 'Collapse' : 'Expand'
                  }
                  data-section="tree-view-toggle"
                  onClick={(e) => handleToggleClick(row, e)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {expandedSet.has(node.id) ? 'v' : '>'}
                </button>
              ) : (
                <span
                  aria-hidden="true"
                  data-section="tree-view-spacer"
                  className="h-4 w-4 shrink-0"
                />
              )}
              {node.icon ? (
                <span
                  aria-hidden="true"
                  data-section="tree-view-icon"
                  className="flex h-4 w-4 shrink-0 items-center"
                >
                  {node.icon}
                </span>
              ) : null}
              <span
                data-section="tree-view-label"
                className="flex-1 truncate"
              >
                {node.label}
              </span>
              {isLoading ? (
                <span
                  data-section="tree-view-loading"
                  className="text-xs text-muted-foreground"
                >
                  {loadingLabel}
                </span>
              ) : null}
            </>
          )}
        </div>
      );
    },
    [
      effectiveSelected,
      effectiveFocused,
      loadingIds,
      expandedSet,
      dropTarget,
      flat,
      indent,
      enableDrag,
      renderNode,
      loadingLabel,
      handleRowClick,
      handleDragStart,
      handleDragOver,
      handleDrop,
      handleDragEnd,
      handleToggleClick,
    ],
  );

  return (
    <div
      ref={ref}
      role="tree"
      aria-label={ariaLabel}
      data-section="tree-view"
      data-node-count={flat.length}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col rounded-md border border-border bg-card p-1 text-sm',
        className,
      )}
    >
      {flat.length === 0 ? (
        <div
          data-section="tree-view-empty"
          className="px-2 py-1 text-muted-foreground"
        >
          (empty)
        </div>
      ) : (
        flat.map(renderRow)
      )}
    </div>
  );
});

TreeView.displayName = 'TreeView';
