import { useCallback, useState } from 'react';

// (v1.10.736) Extracted from SessionsView. The
// per-group collapse map + the attached-section
// collapse flag live on the master pane sidebar
// (one bool per project group plus a single bool
// for the attached-sessions block at the top).
// Bundled here so the parent stops carrying two
// closely-related useState slots and the inline
// per-key toggle lambda.

export interface UseSessionsCollapseState {
  collapsed: Record<string, boolean>;
  toggleGroup: (key: string) => void;
  attachedCollapsed: boolean;
  toggleAttachedCollapsed: () => void;
}

export function useSessionsCollapse(): UseSessionsCollapseState {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [attachedCollapsed, setAttachedCollapsed] = useState(false);

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAttachedCollapsed = useCallback(() => {
    setAttachedCollapsed((v) => !v);
  }, []);

  return { collapsed, toggleGroup, attachedCollapsed, toggleAttachedCollapsed };
}
