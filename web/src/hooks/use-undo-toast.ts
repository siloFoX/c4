import { useCallback, useEffect, useRef, useState } from 'react';

// (v1.11.262, TODO 11.244) Generic 5-second undo toast hook. The
// destructive action is optimistic at the UI layer: the consumer
// removes the item immediately, then calls `showUndo({ message,
// onCommit, onUndo })`. The hook starts a countdown; on undo
// click, the consumer's `onUndo` runs (restore the snapshot) and
// `onCommit` is cancelled. On timeout (or explicit dismiss),
// `onCommit` fires (perform the actual destruction -- server call,
// queue write, etc.) and the toast disappears.
//
// The hook also exposes a `progress` value in `[0, 1]` (fraction
// elapsed) and a live `remainingMs` count so the consumer can
// render a countdown progress bar without owning its own timer.
//
// Lifecycle invariants:
//   - Exactly one of `onCommit` or `onUndo` fires per session.
//   - Showing a new toast while one is active commits the prior
//     one first (mimics the canonical Google Drive trash pattern
//     where a second deletion finalizes the first).
//   - Unmount cancels the pending commit (no leaked side effect).

export interface UndoSpec {
  message: string;
  onCommit: () => void;
  onUndo: () => void;
}

export interface ActiveUndo {
  message: string;
  durationMs: number;
  remainingMs: number;
  progress: number;
  undo: () => void;
  dismiss: () => void;
}

export interface UseUndoToastOptions {
  durationMs?: number;
  // Update interval for `remainingMs` / `progress`. Defaults to 50
  // ms which is comfortably smooth at 60 Hz without flooding state
  // updates.
  tickMs?: number;
}

export interface UseUndoToastResult {
  active: ActiveUndo | null;
  showUndo: (spec: UndoSpec) => void;
}

export const DEFAULT_UNDO_DURATION_MS = 5000;
export const DEFAULT_UNDO_TICK_MS = 50;

interface InternalState {
  message: string;
  durationMs: number;
  startedAt: number;
  remainingMs: number;
  spec: UndoSpec;
}

export function useUndoToast(
  options: UseUndoToastOptions = {},
): UseUndoToastResult {
  const durationMs = options.durationMs ?? DEFAULT_UNDO_DURATION_MS;
  const tickMs = options.tickMs ?? DEFAULT_UNDO_TICK_MS;
  const [internal, setInternal] = useState<InternalState | null>(null);
  const tickIdRef = useRef<number | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const internalRef = useRef<InternalState | null>(null);

  // Keep a ref to the current internal state so async callbacks
  // (timer tick, commit) read the value at the time of firing
  // rather than the value at hook-instantiation time.
  internalRef.current = internal;

  const clearTimers = useCallback(() => {
    if (tickIdRef.current !== null) {
      window.clearInterval(tickIdRef.current);
      tickIdRef.current = null;
    }
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  const finalizeWithCommit = useCallback(() => {
    const snap = internalRef.current;
    if (!snap) return;
    clearTimers();
    setInternal(null);
    snap.spec.onCommit();
  }, [clearTimers]);

  const finalizeWithUndo = useCallback(() => {
    const snap = internalRef.current;
    if (!snap) return;
    clearTimers();
    setInternal(null);
    snap.spec.onUndo();
  }, [clearTimers]);

  const showUndo = useCallback(
    (spec: UndoSpec) => {
      // Commit the previous session, if any, before starting the
      // new one. Matches the canonical "second delete finalizes
      // the first" semantics.
      const prior = internalRef.current;
      if (prior) {
        clearTimers();
        prior.spec.onCommit();
      }
      const startedAt = Date.now();
      const next: InternalState = {
        message: spec.message,
        durationMs,
        startedAt,
        remainingMs: durationMs,
        spec,
      };
      setInternal(next);
      commitTimerRef.current = window.setTimeout(() => {
        const snap = internalRef.current;
        if (!snap) return;
        clearTimers();
        setInternal(null);
        snap.spec.onCommit();
      }, durationMs);
      tickIdRef.current = window.setInterval(() => {
        const snap = internalRef.current;
        if (!snap) return;
        const elapsed = Date.now() - snap.startedAt;
        const remaining = Math.max(0, snap.durationMs - elapsed);
        setInternal({ ...snap, remainingMs: remaining });
      }, tickMs);
    },
    [durationMs, tickMs, clearTimers],
  );

  // Cancel any pending commit when the consumer unmounts so the
  // destructive action does not leak after the UI is gone.
  useEffect(() => {
    return () => {
      clearTimers();
      // Intentionally NOT firing onCommit on unmount: the consumer
      // is gone, so there is no owner to receive the side effect
      // anyway. Leaving the commit pending would be worse than
      // dropping it (you can't undo what already shipped).
    };
  }, [clearTimers]);

  if (!internal) return { active: null, showUndo };

  const progress =
    internal.durationMs > 0
      ? Math.min(1, Math.max(0, 1 - internal.remainingMs / internal.durationMs))
      : 1;

  const active: ActiveUndo = {
    message: internal.message,
    durationMs: internal.durationMs,
    remainingMs: internal.remainingMs,
    progress,
    undo: finalizeWithUndo,
    dismiss: finalizeWithCommit,
  };

  return { active, showUndo };
}
