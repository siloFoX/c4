import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, Ref } from 'react';
import { ChevronRight, File as FileIcon, Folder, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.198) FileTree primitive (11.180). Recursive collapsible
// folder/file tree implementing the WAI-ARIA tree pattern: role='tree'
// outer ul, role='treeitem' per node with aria-level, aria-expanded,
// aria-selected. Roving tabindex; only one item is tab-reachable.

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

export interface FileTreeProps {
  nodes: FileTreeNode[];
  defaultExpanded?: string[];
  selectedId?: string;
  onSelect?: (id: string, node: FileTreeNode) => void;
  className?: string;
  ariaLabel?: string;
}

interface VisibleEntry {
  node: FileTreeNode;
  depth: number;
  parentId: string | null;
}

function flatten(
  nodes: FileTreeNode[],
  expanded: Set<string>,
  depth = 1,
  parentId: string | null = null,
  out: VisibleEntry[] = [],
): VisibleEntry[] {
  for (const node of nodes) {
    out.push({ node, depth, parentId });
    if (node.type === 'folder' && expanded.has(node.id) && node.children) {
      flatten(node.children, expanded, depth + 1, node.id, out);
    }
  }
  return out;
}

export const FileTree = forwardRef<HTMLUListElement, FileTreeProps>(
  (
    { nodes, defaultExpanded, selectedId, onSelect, className, ariaLabel },
    ref,
  ) => {
    const [expanded, setExpanded] = useState<Set<string>>(
      () => new Set(defaultExpanded ?? []),
    );

    const visible = useMemo(
      () => flatten(nodes, expanded),
      [nodes, expanded],
    );

    const firstId = visible[0]?.node.id ?? null;
    const [focusedId, setFocusedId] = useState<string | null>(
      selectedId && visible.some((e) => e.node.id === selectedId)
        ? selectedId
        : firstId,
    );

    // If focused node falls out of view (parent collapsed), pull focus to parent.
    useEffect(() => {
      if (focusedId && !visible.some((e) => e.node.id === focusedId)) {
        setFocusedId(firstId);
      }
    }, [visible, focusedId, firstId]);

    const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
    const setItemRef = useCallback(
      (id: string) => (el: HTMLLIElement | null) => {
        if (el) itemRefs.current.set(id, el);
        else itemRefs.current.delete(id);
      },
      [],
    );

    const focusItem = useCallback((id: string) => {
      setFocusedId(id);
      const el = itemRefs.current.get(id);
      if (el) el.focus();
    }, []);

    const toggleExpanded = useCallback((id: string, next?: boolean) => {
      setExpanded((prev) => {
        const copy = new Set(prev);
        const willOpen = next ?? !copy.has(id);
        if (willOpen) copy.add(id);
        else copy.delete(id);
        return copy;
      });
    }, []);

    const handleSelect = useCallback(
      (node: FileTreeNode) => {
        onSelect?.(node.id, node);
      },
      [onSelect],
    );

    const onKeyDown = useCallback(
      (e: KeyboardEvent<HTMLUListElement>) => {
        if (!focusedId) return;
        const idx = visible.findIndex((entry) => entry.node.id === focusedId);
        if (idx < 0) return;
        const entry = visible[idx];
        const { node, parentId } = entry;
        const isFolder = node.type === 'folder';
        const isOpen = isFolder && expanded.has(node.id);

        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault();
            const nextEntry = visible[idx + 1];
            if (nextEntry) focusItem(nextEntry.node.id);
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            const prevEntry = visible[idx - 1];
            if (prevEntry) focusItem(prevEntry.node.id);
            break;
          }
          case 'ArrowRight': {
            e.preventDefault();
            if (isFolder) {
              if (!isOpen) {
                toggleExpanded(node.id, true);
              } else {
                const nextEntry = visible[idx + 1];
                if (nextEntry && nextEntry.parentId === node.id) {
                  focusItem(nextEntry.node.id);
                }
              }
            }
            break;
          }
          case 'ArrowLeft': {
            e.preventDefault();
            if (isFolder && isOpen) {
              toggleExpanded(node.id, false);
            } else if (parentId) {
              focusItem(parentId);
            }
            break;
          }
          case 'Home': {
            e.preventDefault();
            if (visible[0]) focusItem(visible[0].node.id);
            break;
          }
          case 'End': {
            e.preventDefault();
            const last = visible[visible.length - 1];
            if (last) focusItem(last.node.id);
            break;
          }
          case 'Enter': {
            e.preventDefault();
            handleSelect(node);
            break;
          }
          default:
            break;
        }
      },
      [focusedId, visible, expanded, focusItem, toggleExpanded, handleSelect],
    );

    return (
      <ul
        ref={ref as Ref<HTMLUListElement>}
        role="tree"
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        className={cn(
          'select-none rounded-md border border-border bg-card/30 p-1 text-sm text-foreground',
          className,
        )}
      >
        {visible.map((entry) => {
          const { node, depth } = entry;
          const isFolder = node.type === 'folder';
          const isOpen = isFolder && expanded.has(node.id);
          const isSelected = selectedId === node.id;
          const isFocused = focusedId === node.id;
          return (
            <li
              key={node.id}
              ref={setItemRef(node.id)}
              role="treeitem"
              aria-level={depth}
              aria-selected={isSelected}
              aria-expanded={isFolder ? isOpen : undefined}
              tabIndex={isFocused ? 0 : -1}
              data-id={node.id}
              data-type={node.type}
              onFocus={() => setFocusedId(node.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (isFolder) {
                  toggleExpanded(node.id);
                } else {
                  handleSelect(node);
                }
                focusItem(node.id);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                isSelected
                  ? 'bg-primary/15 text-foreground'
                  : 'hover:bg-accent/40',
              )}
              style={{ paddingLeft: `${(depth - 1) * 14 + 4}px` }}
            >
              {isFolder ? (
                <ChevronRight
                  aria-hidden="true"
                  data-chevron
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                    isOpen && 'rotate-90 motion-reduce:rotate-0',
                  )}
                />
              ) : (
                <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0" />
              )}
              {isFolder ? (
                isOpen ? (
                  <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <FileIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{node.name}</span>
            </li>
          );
        })}
      </ul>
    );
  },
);
FileTree.displayName = 'FileTree';
