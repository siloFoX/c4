import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableSortDir } from '../components/ui/table';

// (v1.11.258, TODO 11.240) Operator-local sort persistence for any
// table-shaped surface. Stores `{ key, dir }` in localStorage under
// `c4:table-sort:<tableKey>` so the operator's chosen ordering
// survives a reload, a route switch, and a different tab. The hook
// is deliberately decoupled from the `<Table>` primitive: any
// surface that exposes sortable columns -- the canonical data
// table, a virtualized list, a list of cards -- can persist its
// sort via this hook by passing the value into a comparator.
//
// Storage shape (versioned via the v1 prefix so a future migration
// can fall back without breaking older keys):
//   key: `c4:table-sort:<tableKey>`
//   value: `{"v":1,"key":"total","dir":"desc"}`
//
// Cross-tab sync:
//   - `window`'s `storage` event fires when the same key changes in
//     another tab. The hook re-reads localStorage on the event.
//   - Same-tab updates dispatch a `c4:table-sort-changed`
//     CustomEvent (detail = { tableKey }) so siblings in the same
//     tab also re-sync.

export interface TableSortValue<K extends string = string> {
  key: K;
  dir: TableSortDir;
}

interface PersistedSort {
  v: 1;
  key: string;
  dir: TableSortDir;
}

export const TABLE_SORT_EVENT = 'c4:table-sort-changed';

export function tableSortStorageKey(tableKey: string): string {
  return `c4:table-sort:${tableKey}`;
}

function isValidDir(x: unknown): x is TableSortDir {
  return x === 'asc' || x === 'desc';
}

function readPersisted<K extends string>(
  tableKey: string,
): TableSortValue<K> | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(tableSortStorageKey(tableKey));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSort>;
    if (parsed && typeof parsed.key === 'string' && isValidDir(parsed.dir)) {
      return { key: parsed.key as K, dir: parsed.dir };
    }
  } catch {
    // malformed JSON -> fall through to null
  }
  return null;
}

function writePersisted(tableKey: string, value: TableSortValue): void {
  if (typeof window === 'undefined') return;
  const payload: PersistedSort = { v: 1, key: value.key, dir: value.dir };
  try {
    window.localStorage.setItem(
      tableSortStorageKey(tableKey),
      JSON.stringify(payload),
    );
  } catch {
    // quota / disabled -> silently no-op so the UI keeps working
  }
}

function clearPersisted(tableKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(tableSortStorageKey(tableKey));
  } catch {
    // ignore
  }
}

function dispatchChange(tableKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(TABLE_SORT_EVENT, { detail: { tableKey } }),
    );
  } catch {
    // older jsdom -> no CustomEvent; the storage event still
    // covers cross-tab, so this is a best-effort hop.
  }
}

export interface UseTableSortResult<K extends string = string> {
  sortKey: K | undefined;
  sortDir: TableSortDir | undefined;
  onSortChange: (key: K, dir: TableSortDir) => void;
  reset: () => void;
  clear: () => void;
}

/**
 * Operator-local persistent sort state.
 *
 * `tableKey` namespaces the storage slot. Use a short stable id
 * (e.g. `token-usage-per-task`, `history-sidebar`) so the same
 * surface re-finds its prefs after a reload.
 *
 * `defaultSort` is the initial value when nothing is saved yet,
 * and the value `reset()` falls back to. Pass `null` to keep the
 * surface unsorted by default.
 */
export function useTableSort<K extends string = string>(
  tableKey: string,
  defaultSort: TableSortValue<K> | null = null,
): UseTableSortResult<K> {
  const defaultRef = useRef(defaultSort);
  defaultRef.current = defaultSort;
  const [value, setValue] = useState<TableSortValue<K> | null>(() => {
    const persisted = readPersisted<K>(tableKey);
    if (persisted) return persisted;
    return defaultSort;
  });

  // Re-sync on cross-tab storage event + same-tab custom event.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const storageKey = tableSortStorageKey(tableKey);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const persisted = readPersisted<K>(tableKey);
      setValue(persisted ?? defaultRef.current);
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<{ tableKey?: string }>;
      if (ce.detail?.tableKey && ce.detail.tableKey !== tableKey) return;
      const persisted = readPersisted<K>(tableKey);
      setValue(persisted ?? defaultRef.current);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(TABLE_SORT_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(TABLE_SORT_EVENT, onCustom);
    };
  }, [tableKey]);

  const onSortChange = useCallback(
    (key: K, dir: TableSortDir) => {
      const next: TableSortValue<K> = { key, dir };
      setValue(next);
      writePersisted(tableKey, next);
      dispatchChange(tableKey);
    },
    [tableKey],
  );

  const reset = useCallback(() => {
    clearPersisted(tableKey);
    setValue(defaultRef.current);
    dispatchChange(tableKey);
  }, [tableKey]);

  return {
    sortKey: value?.key,
    sortDir: value?.dir,
    onSortChange,
    reset,
    clear: reset,
  };
}
