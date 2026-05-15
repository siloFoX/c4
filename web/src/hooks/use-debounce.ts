// (v1.11.230) Debounce primitives. Trailing-edge: the value
// or callback fires after `ms` of quiet. Rapid changes
// restart the timer so only the latest invocation wins.
//
// SSR-safe: both hooks rely on browser timers via useEffect /
// useRef, so they do not touch window during render and are
// safe to import from server-rendered code paths.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => clearTimeout(id);
  }, [value, ms]);

  return debounced;
}

export function useDebouncedCallback<F extends (...args: never[]) => unknown>(
  fn: F,
  ms: number,
): (...args: Parameters<F>) => void {
  const fnRef = useRef<F>(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<F>) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, ms);
    },
    [ms],
  );
}
