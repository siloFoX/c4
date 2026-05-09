import { useCallback, useEffect, useState } from 'react';
import type { Worker } from '../types';

// (v1.10.675) Extracted from HierarchyTree. Owns the
// expanded `Set<string>` for the tree, plus the four
// helpers that manipulate it: toggle (single name),
// expandAll (every worker), collapseAll (empty),
// and an auto-expand-on-first-load effect that opens
// the whole tree when workers first arrive. User toggles
// are sticky after that — the auto-expand only runs once
// (when prev.size is 0 and workers.length transitions
// from empty).

interface ExpandedSetState {
  expanded: Set<string>;
  toggle: (name: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
}

export function useExpandedSet(args: {
  workers: Worker[];
}): ExpandedSetState {
  const { workers } = args;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const expandAll = useCallback(() => {
    const next = new Set<string>();
    for (const w of workers) next.add(w.name);
    setExpanded(next);
  }, [workers]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return { expanded, toggle, expandAll, collapseAll };
}
