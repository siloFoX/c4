import { useCallback, useEffect, useState } from 'react';

// (v1.11.255, TODO 11.237) Operator-local workspace
// preferences. Workspaces themselves come from
// `config.workspaces` and the daemon does not expose a mutation
// endpoint -- but the operator still wants to (a) drag-reorder
// the list and (b) rename a workspace for their own use without
// editing the canonical config. Both lean on `localStorage` so
// the prefs stay personal + survive across reloads.
//
// Keys:
//   c4:workspace:order   -> string[] of workspace names. Rows
//                           render in this order; unknown names
//                           fall back to the daemon's order.
//   c4:workspace:aliases -> Record<name, displayName>. When set
//                           the page renders `displayName`
//                           instead of `name`; the underlying
//                           id is unchanged so CLI flags
//                           (--workspace <name>) keep working.

export const WORKSPACE_ORDER_KEY = 'c4:workspace:order';
export const WORKSPACE_ALIASES_KEY = 'c4:workspace:aliases';
export const WORKSPACE_PREFS_EVENT = 'c4:workspace-prefs-changed';

export interface WorkspacePrefs {
  order: string[];
  aliases: Record<string, string>;
}

const EMPTY_PREFS: WorkspacePrefs = { order: [], aliases: {} };

function safeRead(): WorkspacePrefs {
  if (typeof window === 'undefined') return { ...EMPTY_PREFS };
  const out: WorkspacePrefs = { order: [], aliases: {} };
  try {
    const rawOrder = window.localStorage.getItem(WORKSPACE_ORDER_KEY);
    if (rawOrder) {
      const parsed = JSON.parse(rawOrder);
      if (Array.isArray(parsed)) {
        out.order = parsed.filter((x): x is string => typeof x === 'string');
      }
    }
  } catch {
    // bad JSON -> use empty list
  }
  try {
    const rawAliases = window.localStorage.getItem(WORKSPACE_ALIASES_KEY);
    if (rawAliases) {
      const parsed = JSON.parse(rawAliases);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length > 0) out.aliases[k] = v;
        }
      }
    }
  } catch {
    // bad JSON -> use empty map
  }
  return out;
}

function emit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(WORKSPACE_PREFS_EVENT));
  } catch {
    // SSR / unusual env -- skip
  }
}

export function getWorkspacePrefs(): WorkspacePrefs {
  return safeRead();
}

export function setWorkspaceOrder(order: readonly string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      WORKSPACE_ORDER_KEY,
      JSON.stringify(order.filter((x) => typeof x === 'string')),
    );
    emit();
  } catch {
    // quota / private mode -- silently drop
  }
}

export function setWorkspaceAlias(name: string, alias: string): void {
  if (typeof window === 'undefined') return;
  if (!name) return;
  const current = safeRead().aliases;
  const trimmed = alias.trim();
  if (trimmed.length === 0) {
    delete current[name];
  } else {
    current[name] = trimmed;
  }
  try {
    window.localStorage.setItem(WORKSPACE_ALIASES_KEY, JSON.stringify(current));
    emit();
  } catch {
    // ignore
  }
}

export function clearWorkspaceAlias(name: string): void {
  setWorkspaceAlias(name, '');
}

export function clearWorkspacePrefs(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(WORKSPACE_ORDER_KEY);
    window.localStorage.removeItem(WORKSPACE_ALIASES_KEY);
    emit();
  } catch {
    // ignore
  }
}

export interface UseWorkspacePrefsState {
  order: string[];
  aliases: Record<string, string>;
  setOrder: (order: readonly string[]) => void;
  setAlias: (name: string, alias: string) => void;
  clearAlias: (name: string) => void;
  clearAll: () => void;
}

export function useWorkspacePrefs(): UseWorkspacePrefsState {
  const [state, setState] = useState<WorkspacePrefs>(() => safeRead());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setState(safeRead());
    window.addEventListener(WORKSPACE_PREFS_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(WORKSPACE_PREFS_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    order: state.order,
    aliases: state.aliases,
    setOrder: (order) => setWorkspaceOrder(order),
    setAlias: (name, alias) => setWorkspaceAlias(name, alias),
    clearAlias: (name) => clearWorkspaceAlias(name),
    clearAll: () => clearWorkspacePrefs(),
  };
}

// Sort the daemon's workspace list by the operator-local order
// override. Unknown names (workspaces added after the override
// was saved) keep their original relative position appended at
// the end so the page never drops a row when the daemon adds a
// new workspace.
export function applyWorkspaceOrder<T extends { name: string }>(
  source: readonly T[],
  order: readonly string[],
): T[] {
  if (!order || order.length === 0) return [...source];
  const seen = new Set<string>();
  const ordered: T[] = [];
  const byName = new Map<string, T>();
  for (const w of source) byName.set(w.name, w);
  for (const id of order) {
    const w = byName.get(id);
    if (w && !seen.has(id)) {
      ordered.push(w);
      seen.add(id);
    }
  }
  for (const w of source) {
    if (!seen.has(w.name)) {
      ordered.push(w);
      seen.add(w.name);
    }
  }
  return ordered;
}
