import type { Worker } from '../types';
import { isInterventionActive } from './worker-classify';

// (v1.10.697) Extracted from components/HierarchyTree. Pure
// tree-building helpers — no React, no JSX. Builds a
// parent/child forest from the flat /api/list array and
// computes per-subtree status rollups (total / idle / busy
// / exited / intervention / error). Cycle guard walks the
// chain upward; if the proposed parent loops back to the
// current node, the edge is demoted to a root link so the
// render loop terminates.

export interface Rollup {
  total: number;
  idle: number;
  busy: number;
  exited: number;
  intervention: number;
  error: number;
}

export interface TreeNode {
  worker: Worker;
  children: TreeNode[];
  rollup: Rollup;
}

export function zeroRollup(): Rollup {
  return { total: 0, idle: 0, busy: 0, exited: 0, intervention: 0, error: 0 };
}

export function computeRollup(node: TreeNode): Rollup {
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

export function buildTree(workers: Worker[]): TreeNode[] {
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
