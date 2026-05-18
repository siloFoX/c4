import { useCallback, useEffect, useRef, useState } from 'react';

// (v1.11.375, TODO 11.357) Debounced save hook
// with optimistic UI + revert on failure.
//
// Adopters:
//
//   const save = useDebouncedSave({
//     initialValue: prefs,
//     onSave: async (next) => apiPut('/api/prefs', next),
//     debounceMs: 300,
//   });
//   save.value          // current optimistic value (renders instantly)
//   save.commit(next)   // schedules a save; the value updates immediately
//   save.flush()        // fires the pending save immediately
//   save.status         // 'idle' | 'pending' | 'saving' | 'error'
//   save.error          // last error (or null)
//
// On failure:
//
//   - `value` reverts to the last server-confirmed
//     state.
//   - `status` flips to 'error' and `error` carries
//     the rejection reason.
//   - The next `commit()` clears the error and
//     starts a fresh attempt from the new
//     optimistic value.
//
// On success:
//
//   - The result returned by `onSave` (if any) is
//     adopted as the new server-confirmed state.
//     Returning `void` keeps the optimistic value
//     as-is.
//
// SSR-safe: every timer lives inside useRef +
// useEffect, never touched during render.

export type DebouncedSaveStatus = 'idle' | 'pending' | 'saving' | 'error';

export interface UseDebouncedSaveOptions<T> {
  initialValue: T;
  // Save function. Returns void OR the
  // server-authoritative value that replaces the
  // optimistic state on success.
  onSave: (next: T) => Promise<T | void>;
  // Debounce window in ms. Default 300.
  debounceMs?: number;
  // Optional callback fired right before a save
  // attempt starts. Useful for analytics /
  // logging.
  onBeforeSave?: (next: T) => void;
  // Optional callback fired after a successful
  // save. Receives the server-authoritative value
  // (or the submitted value when `onSave` returns
  // void).
  onAfterSave?: (next: T) => void;
}

export interface UseDebouncedSaveResult<T> {
  value: T;
  status: DebouncedSaveStatus;
  error: unknown;
  commit: (next: T) => void;
  flush: () => Promise<void>;
  reset: (next?: T) => void;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useDebouncedSave<T>(
  options: UseDebouncedSaveOptions<T>,
): UseDebouncedSaveResult<T> {
  const {
    initialValue,
    onSave,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onBeforeSave,
    onAfterSave,
  } = options;

  // `value` is the optimistic / render-side state.
  // `committedRef` is the last value the server
  // accepted -- the rollback target on failure.
  const [value, setValue] = useState<T>(initialValue);
  const committedRef = useRef<T>(initialValue);
  const [status, setStatus] = useState<DebouncedSaveStatus>('idle');
  const [error, setError] = useState<unknown>(null);

  // Latest in-flight value the timer should save.
  // Updated on every commit() so a rapid sequence
  // collapses into one save with the latest value.
  const pendingRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs for the latest callbacks so re-renders
  // do not re-schedule the timer.
  const onSaveRef = useRef(onSave);
  const onBeforeSaveRef = useRef(onBeforeSave);
  const onAfterSaveRef = useRef(onAfterSave);
  useEffect(() => {
    onSaveRef.current = onSave;
    onBeforeSaveRef.current = onBeforeSave;
    onAfterSaveRef.current = onAfterSave;
  }, [onSave, onBeforeSave, onAfterSave]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async (): Promise<void> => {
    const next = pendingRef.current;
    if (next === null) return;
    pendingRef.current = null;
    setStatus('saving');
    setError(null);
    onBeforeSaveRef.current?.(next);
    try {
      const result = await onSaveRef.current(next);
      const accepted = result === undefined ? next : result;
      committedRef.current = accepted;
      setValue(accepted);
      setStatus('idle');
      onAfterSaveRef.current?.(accepted);
    } catch (err) {
      // Revert: drop the optimistic value back to
      // the last committed one.
      setValue(committedRef.current);
      setStatus('error');
      setError(err);
    }
  }, []);

  const commit = useCallback(
    (next: T) => {
      setValue(next);
      pendingRef.current = next;
      setStatus('pending');
      // Clear any prior error so the host can show
      // a fresh attempt indicator.
      setError(null);
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave();
      }, Math.max(0, debounceMs));
    },
    [debounceMs, clearTimer, performSave],
  );

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    await performSave();
  }, [clearTimer, performSave]);

  const reset = useCallback(
    (next?: T) => {
      clearTimer();
      const target = next === undefined ? committedRef.current : next;
      pendingRef.current = null;
      committedRef.current = target;
      setValue(target);
      setStatus('idle');
      setError(null);
    },
    [clearTimer],
  );

  // Cleanup on unmount: cancel pending timer.
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return { value, status, error, commit, flush, reset };
}

export const USE_DEBOUNCED_SAVE_DEFAULT_DEBOUNCE_MS = DEFAULT_DEBOUNCE_MS;
