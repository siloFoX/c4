import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// (v1.11.355, TODO 11.337) Generic undo/redo history
// hook.
//
// State is modeled as the classic past/present/future
// triple:
//
//   past:    [s0, s1, s2]
//   present: s3
//   future:  [s4, s5]
//
//   set(s6)   -> past=[s0,s1,s2,s3], present=s6, future=[]
//   undo()    -> past=[s0,s1], present=s2, future=[s3,s4,s5]
//   redo()    -> past=[s0,s1,s2], present=s3, future=[s4,s5]
//
// A new `set(...)` ALWAYS clears the future (the
// canonical undo-redo semantics across every text
// editor / drawing tool the world has standardised
// on). Tests / docs both cover this.
//
// Keyboard shortcuts (default off):
//
//   - `Cmd+Z` / `Ctrl+Z`        -> undo
//   - `Cmd+Shift+Z` / `Ctrl+Shift+Z` / `Cmd+Y` / `Ctrl+Y` -> redo
//
// The shortcut listener is skipped when focus is in a
// text-entry surface (`<input>`, `<textarea>`, or any
// `contenteditable` node) so the browser's native
// undo-in-text-input keeps working.

export interface UseUndoHistoryOptions {
  // Maximum number of past entries kept. Older entries
  // are dropped from the front of the `past` array.
  // Default 100; pass `Infinity` for unbounded.
  maxHistory?: number;
  // Wire Cmd/Ctrl+Z + Cmd/Ctrl+Shift+Z global
  // listeners on `window`. Default false.
  shortcuts?: boolean;
}

export interface UseUndoHistoryReturn<T> {
  state: T;
  set: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Replace `state` AND clear the past + future stacks.
  // Useful for "load saved data from server" flows.
  reset: (next: T) => void;
  past: readonly T[];
  future: readonly T[];
}

const DEFAULT_MAX_HISTORY = 100;

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useUndoHistory<T>(
  initial: T,
  options: UseUndoHistoryOptions = {},
): UseUndoHistoryReturn<T> {
  const maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
  const shortcuts = options.shortcuts ?? false;

  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setHistory((h) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(h.present) : next;
        if (Object.is(resolved, h.present)) return h;
        // Cap the past array. Drop the oldest entries
        // when the cap is exceeded.
        const nextPast = [...h.past, h.present];
        while (nextPast.length > maxHistory) nextPast.shift();
        return {
          past: nextPast,
          present: resolved,
          future: [],
        };
      });
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1] as T;
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0] as T;
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  // (v1.11.355, TODO 11.337) Keyboard shortcut wiring.
  // Hold the latest undo/redo + the active-flag in refs
  // so the document-level listener stays referentially
  // stable across renders.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const historyRef = useRef(history);
  undoRef.current = undo;
  redoRef.current = redo;
  historyRef.current = history;

  useEffect(() => {
    if (!shortcuts) return undefined;
    if (typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Only intercept the Z / Y keys.
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      // Don't steal undo from text inputs -- the browser
      // owns Cmd+Z inside <input> / <textarea>.
      if (isTextEntryTarget(e.target)) return;
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (historyRef.current.future.length === 0) return;
        e.preventDefault();
        redoRef.current();
      } else {
        // key === 'z' && !shiftKey
        if (historyRef.current.past.length === 0) return;
        e.preventDefault();
        undoRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [shortcuts]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // Memoise the returned shape so consumers that
  // depend on referential stability (deps arrays) do
  // not thrash on every render. The past / future
  // arrays' identity still tracks history changes.
  return useMemo(
    () => ({
      state: history.present,
      set,
      undo,
      redo,
      canUndo,
      canRedo,
      reset,
      past: history.past,
      future: history.future,
    }),
    [history, set, undo, redo, canUndo, canRedo, reset],
  );
}

export const UNDO_HISTORY_DEFAULT_MAX = DEFAULT_MAX_HISTORY;
