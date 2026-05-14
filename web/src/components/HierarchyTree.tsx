import { useMemo } from 'react';
import { ChevronDown, ChevronRight, Dot, WifiOff } from 'lucide-react';
import { useWorkerList } from '../lib/use-worker-list';
import { useExpandedSet } from '../lib/use-expanded-set';
import { Badge, Button } from './ui';
import { cn } from '../lib/cn';
import { t, tFormat, useLocale } from '../lib/i18n';
import {
  mapWorkerStatusToBadgeVariant,
  statusLabel,
} from '../lib/worker-classify';
import { buildTree, type TreeNode } from '../lib/hierarchy-tree';

// 8.2 Hierarchy tree sidebar view. Builds a parent/child forest from the
// flat /api/list worker array (same endpoint as WorkerList) and renders it
// with expand/collapse + per-subtree status rollup badges. Kept in the
// frontend (vs. consuming /api/tree) so SSE-triggered re-renders reuse the
// list cache and do not double-fetch.


// (v1.10.572) isInterventionActive moved to ../lib/worker-classify.ts.
// (v1.10.697) Rollup + TreeNode types + buildTree +
// computeRollup + zeroRollup moved to ../lib/hierarchy-tree.

// (v1.10.572) statusLabel + statusVariant moved to
// ../lib/worker-classify.ts (statusVariant renamed to
// mapWorkerStatusToBadgeVariant for consistency with WorkerList).

interface HierarchyTreeProps {
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (name: string) => void;
  selectedWorker: string | null;
  onSelect: (name: string) => void;
}

function TreeRow({ node, depth, expanded, toggle, selectedWorker, onSelect }: RowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.worker.name);
  const isSelected = selectedWorker === node.worker.name;
  const r = node.rollup;
  const rollupBadges: string[] = [];
  if (r.total > 1) {
    if (r.idle) rollupBadges.push(r.idle + ' idle');
    if (r.busy) rollupBadges.push(r.busy + ' busy');
    if (r.intervention) rollupBadges.push(r.intervention + ' intervention');
    if (r.error) rollupBadges.push(r.error + ' error');
    if (r.exited) rollupBadges.push(r.exited + ' exited');
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 text-sm',
          isSelected
            ? 'bg-accent text-accent-foreground ring-1 ring-ring'
            : 'hover:bg-accent/60'
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          type="button"
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:hover:bg-transparent'
          )}
          onClick={() => hasChildren && toggle(node.worker.name)}
          aria-label={hasChildren ? (isOpen ? t('hierarchy.collapse') : t('hierarchy.expand')) : t('hierarchy.leaf')}
          aria-expanded={hasChildren ? isOpen : undefined}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <Dot className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left font-medium text-foreground"
          onClick={() => onSelect(node.worker.name)}
          title={node.worker.name}
        >
          {node.worker.name}
        </button>
        <Badge variant={mapWorkerStatusToBadgeVariant(node.worker)} className="shrink-0 uppercase">
          {statusLabel(node.worker)}
        </Badge>
      </div>
      {rollupBadges.length > 0 && (
        <div
          className="flex flex-wrap gap-1 pb-1 text-[10px] text-muted-foreground"
          style={{ paddingLeft: 28 + depth * 16 }}
        >
          {rollupBadges.map((b) => (
            <Badge key={b} variant="outline" className="px-1.5 py-0 text-[10px] normal-case">
              {b}
            </Badge>
          ))}
        </div>
      )}
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.worker.name}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedWorker={selectedWorker}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HierarchyTree({ selectedWorker, onSelect }: HierarchyTreeProps) {
  useLocale();
  // (v1.10.666) Worker poll + SSE shared with WorkerList via
  // lib/use-worker-list (extracted v1.10.660).
  const { workers, error, sseConnected } = useWorkerList();

  // (v1.10.675) Expanded-set state machine moved to lib/use-expanded-set.
  const { expanded, toggle, expandAll, collapseAll } = useExpandedSet({ workers });

  const roots = useMemo(() => buildTree(workers), [workers]);

  return (
    <div className="space-y-2">
      {!sseConnected && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{t('workerList.disconnected')}</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span className="min-w-0 break-words">{tFormat('workerList.failedToLoad', { error: error || '' })}</span>
        </div>
      )}
      {!error && workers.length === 0 && (
        <div className="text-sm text-muted-foreground">{t('workerList.empty')}</div>
      )}
      {workers.length > 0 && (
        <div className="flex gap-2 text-xs">
          <Button type="button" variant="secondary" size="sm" onClick={expandAll}>
            {t('hierarchy.expandAll')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={collapseAll}>
            {t('hierarchy.collapseAll')}
          </Button>
        </div>
      )}
      <div>
        {roots.map((root) => (
          <TreeRow
            key={root.worker.name}
            node={root}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            selectedWorker={selectedWorker}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
