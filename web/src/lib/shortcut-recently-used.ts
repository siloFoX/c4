import { useCallback, useEffect, useState } from 'react';

// shortcut-recently-used.ts -- localStorage-backed
// recently-used shortcut tracker.
//
// (v1.11.330, TODO 11.312) The KeyboardShortcutsModal
// now shows a "Recently used" section at the top so
// the operator sees the shortcuts they have actually
// invoked instead of having to scan the full list
// every time. The state is persisted in localStorage
// under `c4:shortcuts:recent` and broadcast through a
// `shortcut-recently-used-changed` CustomEvent so
// every modal instance picks up the same list
// without a parent context provider.
//
// Tracking model:
//   - The list is keyed by the canonical shortcut
//     label (`'Ctrl+B'`, `'g h'`, `'?'`). Recently-used
//     ordering: most-recent first, with duplicate
//     entries deduped.
//   - The list is capped at `MAX_ENTRIES` items so the
//     storage cost stays bounded; old entries fall off
//     the end on each push.
//   - The recording is opt-in: callers wire it where
//     they handle the shortcut (the global key
//     listener calls `markShortcutUsed(label)` after
//     dispatching its action). This commit ships the
//     storage + hook; per-shortcut adoption is
//     deferred.

export const STORAGE_KEY = 'c4:shortcuts:recent';
export const EVENT_NAME = 'shortcut-recently-used-changed';
export const MAX_ENTRIES = 5;

function readAll(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string');
  } catch {
    return [];
  }
}

function writeAll(values: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // private mode / quota exceeded -- ignore
  }
}

function dispatchChange(values: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<string[]>(EVENT_NAME, { detail: values }),
    );
  } catch {
    // environments without CustomEvent constructor -- ignore
  }
}

export function getRecentlyUsedShortcuts(): string[] {
  return readAll();
}

export function markShortcutUsed(label: string): void {
  if (!label) return;
  const current = readAll();
  // Move-to-front (dedup), cap to MAX_ENTRIES.
  const filtered = current.filter((v) => v !== label);
  const next = [label, ...filtered].slice(0, MAX_ENTRIES);
  writeAll(next);
  dispatchChange(next);
}

export function clearRecentlyUsedShortcuts(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  dispatchChange([]);
}

// Reactive hook -- returns the live list and updates
// when `markShortcutUsed` fires the change event.
export function useRecentlyUsedShortcuts(): string[] {
  const [values, setValues] = useState<string[]>(() => readAll());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail;
      if (Array.isArray(detail)) {
        setValues(detail);
      } else {
        setValues(readAll());
      }
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return values;
}

// Convenience setter hook -- returns the mark callback
// bound to the current React reconciler so call sites
// do not have to import both the value hook and the
// imperative API.
export function useMarkShortcutUsed(): (label: string) => void {
  return useCallback((label: string) => markShortcutUsed(label), []);
}
