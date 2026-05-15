// (v1.11.230) Throttle primitives. Leading-edge: the first
// change after mount (or after a full `ms` window has
// elapsed since the last accepted change) propagates
// immediately. Changes inside the window are dropped --
// they do not get emitted on the trailing edge. Callers
// that need the trailing-edge "latest wins" guarantee
// should reach for the debounce variants instead.
//
// SSR-safe: timers are scheduled only inside useEffect.

import { useCallback, useEffect, useRef, useState } from 'react';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function useThrottle<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  // -Infinity makes the FIRST change after mount fall
  // outside the window, so it propagates immediately --
  // matching leading-edge semantics for "first update".
  const lastEmitRef = useRef<number>(Number.NEGATIVE_INFINITY);

  // Derived-state pattern: when a new value arrives and the
  // throttle window has elapsed, update synchronously during
  // render so consumers observe the change on the same tick
  // (React bails out and re-runs this hook with fresh state).
  if (!Object.is(throttled, value)) {
    const now = nowMs();
    if (now - lastEmitRef.current >= ms) {
      lastEmitRef.current = now;
      setThrottled(value);
    }
  }

  return throttled;
}

export function useThrottledCallback<F extends (...args: never[]) => unknown>(
  fn: F,
  ms: number,
): (...args: Parameters<F>) => void {
  const fnRef = useRef<F>(fn);
  const lastCallRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(
    (...args: Parameters<F>) => {
      if (!mountedRef.current) return;
      const now = nowMs();
      if (now - lastCallRef.current >= ms) {
        lastCallRef.current = now;
        fnRef.current(...args);
      }
    },
    [ms],
  );
}
