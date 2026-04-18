import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Dot, WifiOff } from 'lucide-react';
import type { ListResponse, SSEEvent, Worker } from '../types';
import { apiFetch, eventSourceUrl } from '../lib/api';
import { Badge, Button, type BadgeProps } from './ui';
import { cn } from '../lib/cn';

// 8.2 Hierarchy tree sidebar view. Builds a parent/child forest from the
// flat /api/list worker array (same endpoint as WorkerList) and renders it
// with expand/collapse + per-subtree status rollup badges. Kept in the
// frontend (vs. consuming /api/tree) so SSE-triggered re-renders reuse the
// list cache and do not double-fetch.

type BadgeVariant = NonNullable<BadgeProps['variant']>;

interface Rollup {
  total: number;
  idle: number;
  busy: number;
  exited: number;
  intervention: number;
  error: number;
}

interface TreeNode {
  worker: Worker;
  children: TreeNode[];
  rollup: Rollup;
}

function isInterventionActive(w: Worker | null | undefined): boolean {
  if (!w || !w.intervention) return false;
  const iv = w.intervention as { active?: unknown };
  if (Object.prototype.hasOwnProperty.call(iv, 'active')) {
    return Boolean(iv.active);
  }
  return true;
}

function zeroRollup(): Rollup {
  return { total: 0, idle: 0, busy: 0, exited: 0, intervention: 0, error: 0 };
}

function computeRollup(node: TreeNode): Rollup {
  const r = zeroRollup();
  r.total += 1;
  const w = node.worker;
  if (w.status === 'idle') r.idle += 1;
  else if (w.status === 'busy') r.busy += 1;
  else if (w.status === 'exited') r.exited += 1;
  if (isInterventionActive(w)) r.intervention += 1;
  if ((w.errorCount || 0) > 0) r.error += 1;
  for (const child of node.children) {
    const sub = computeRollup(child);
    r.total += sub.total;
    r.idle += sub.idle;
    r.busy += sub.busy;
    r.exited += sub.exited;
    r.intervention += sub.intervention;
    r.error += sub.error;
  }
  node.rollup = r;
  return r;
}

function buildTree(workers: Worker[]): TreeNode[] {
  const byName = new Map<string, TreeNode>();
  for (const w of workers) {
    byName.set(w.name, { worker: w, children: [], rollup: zeroRollup() });
  }
  const roots: TreeNode[] = [];
  for (const node of byName.values()) {
    const parentName = node.worker.parent;
    if (parentName && byName.has(parentName) && parentName !== node.worker.name) {
      // Cycle guard: walk upward from the proposed parent; if we find the
      // current node on the way up, demote this edge to a root link so the
      // render loop terminates.
      let cursor = byName.get(parentName);
      const seen = new Set<string>([node.worker.name]);
      let cycles = false;
      while (cursor) {
        if (seen.has(cursor.worker.name)) { cycles = true; break; }
        seen.add(cursor.worker.name);
        const up = cursor.worker.parent;
        if (!up || !byName.has(up)) break;
        cursor = byName.get(up);
      }
      if (cycles) roots.push(node);
      else byName.get(parentName)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.worker.name.localeCompare(b.worker.name));
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  for (const r of roots) computeRollup(r);
  return roots;
}

function statusLabel(w: Worker): string {
  if (isInterventionActive(w)) return 'intervention';
  return w.status;
}

function statusVariant(w: Worker): BadgeVariant {
  if (isInterventionActive(w)) return 'destructive';
  if (w.status === 'busy') return 'warning';
  if (w.status === 'idle') return 'success';
  return 'secondary';
}

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
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent'
          )}
          onClick={() => hasChildren && toggle(node.worker.name)}
          aria-label={hasChildren ? (isOpen ? 'Collapse' : 'Expand') : 'Leaf'}
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
        <Badge variant={statusVariant(node.worker)} className="shrink-0 uppercase">
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
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await apiFetch('/api/list');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ListResponse;
      setWorkers(Array.isArray(data.workers) ? data.workers : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchList();
    const interval = setInterval(fetchList, 5000);
    const es = new EventSource(eventSourceUrl('/api/events'));
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (ev) => {
      try {
        const evt = JSON.parse(ev.data) as SSEEvent;
        if (evt.type && evt.type !== 'connected') fetchList();
      } catch {
        // non-JSON payload
      }
    };
    return () => {
      clearInterval(interval);
      es.close();
    };
  }, [fetchList]);

  const roots = useMemo(() => buildTree(workers), [workers]);

  // First time workers arrive, open every node so the whole tree is
  // visible. User toggles are sticky after that.
  useEffect(() => {
    if (workers.length === 0) return;
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const w of workers) next.add(w.name);
      return next;
    });
  }, [workers]);

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const expandAll = () => {
    const next = new Set<string>();
    for (const w of workers) next.add(w.name);
    setExpanded(next);
  };
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="space-y-2">
      {!sseConnected && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Live updates disconnected - polling</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span className="min-w-0 break-words">Failed to load workers: {error}</span>
        </div>
      )}
      {!error && workers.length === 0 && (
        <div className="text-sm text-muted-foreground">No workers yet.</div>
      )}
      {workers.length > 0 && (
        <div className="flex gap-2 text-xs">
          <Button type="button" variant="secondary" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={collapseAll}>
            Collapse all
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
