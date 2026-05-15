import { useEffect, useState } from 'react';

// (v1.11.252, TODO 11.234) Command-result history. Persists the
// last N CommandPalette activations to localStorage so a
// dedicated "Command History" page can list them with rerun
// affordances. The list is operator-local (one per browser
// origin); the daemon does not see palette activity today.
//
// Why a separate module from CommandPalette.tsx:
// CommandPalette already owns a different localStorage slot
// (`cmdk:recent`) keyed by command id and used for the "Recent"
// section + ranking nudge. That list is a *set* of ids; this
// module is a *log* of timestamped entries so the same command
// can appear multiple times. Mixing the two would corrupt the
// existing fuzzy-ranking math.

export const COMMAND_HISTORY_STORAGE_KEY = 'c4:command-history';
export const COMMAND_HISTORY_EVENT = 'c4:command-history-changed';
export const COMMAND_HISTORY_MAX = 50;

export interface CommandHistoryEntry {
  /** Stable react key for list rendering. */
  readonly key: string;
  /** PaletteCommand id (e.g. `nav:settings-page`, `workers:new`). */
  readonly id: string;
  /** Display label captured at the time of activation. */
  readonly label: string;
  /** Section the command belonged to (Navigate / Workers / Queue / ...). */
  readonly section: string;
  /** Epoch ms when the activation fired. */
  readonly at: number;
}

function safeRead(): CommandHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMMAND_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: CommandHistoryEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as CommandHistoryEntry).id === 'string' &&
        typeof (item as CommandHistoryEntry).label === 'string' &&
        typeof (item as CommandHistoryEntry).section === 'string' &&
        typeof (item as CommandHistoryEntry).at === 'number' &&
        Number.isFinite((item as CommandHistoryEntry).at)
      ) {
        const e = item as CommandHistoryEntry;
        out.push({
          key: typeof e.key === 'string' ? e.key : `${e.id}-${e.at}`,
          id: e.id,
          label: e.label,
          section: e.section,
          at: e.at,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function safeWrite(entries: readonly CommandHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      COMMAND_HISTORY_STORAGE_KEY,
      JSON.stringify(entries),
    );
    window.dispatchEvent(new CustomEvent(COMMAND_HISTORY_EVENT));
  } catch {
    // quota / private mode: drop the write; the in-memory state
    // a calling hook holds will fall back to zero on next read.
  }
}

export function getCommandHistory(): CommandHistoryEntry[] {
  return safeRead();
}

export interface RecordCommandHistoryInput {
  id: string;
  label: string;
  section: string;
  /** Optional epoch ms; defaults to Date.now() so tests can pin. */
  at?: number;
}

export function recordCommandHistory(input: RecordCommandHistoryInput): void {
  const at = typeof input.at === 'number' ? input.at : Date.now();
  const entry: CommandHistoryEntry = {
    key: `${input.id}-${at}`,
    id: input.id,
    label: input.label,
    section: input.section,
    at,
  };
  const prev = safeRead();
  const next: CommandHistoryEntry[] = [entry, ...prev].slice(
    0,
    COMMAND_HISTORY_MAX,
  );
  safeWrite(next);
}

export function clearCommandHistory(): void {
  safeWrite([]);
}

// React surface: keeps the local snapshot in sync with the
// localStorage slot via the same-tab CustomEvent + the cross-tab
// `storage` event. The hook is read-only -- callers mutate via
// `recordCommandHistory` / `clearCommandHistory` and the
// listener picks the change up on the next render.
export function useCommandHistory(): {
  entries: CommandHistoryEntry[];
  refresh: () => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<CommandHistoryEntry[]>(() =>
    safeRead(),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setEntries(safeRead());
    window.addEventListener(COMMAND_HISTORY_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(COMMAND_HISTORY_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return {
    entries,
    refresh: () => setEntries(safeRead()),
    clear: () => {
      clearCommandHistory();
      setEntries([]);
    },
  };
}
