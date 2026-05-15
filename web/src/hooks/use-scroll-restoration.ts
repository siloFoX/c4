// (v1.11.235 / patch 11.217) Scroll-restoration hook. Persists
// `scrollTop` of a container element into `sessionStorage` (debounced)
// and restores it on mount. SSR-safe: every browser-only access is
// gated behind `typeof window` / `typeof sessionStorage` checks and
// runs inside `useEffect`, never during render.
//
// Pairs with the v1.11.230 `useDebouncedCallback` primitive but falls
// back to an inline `setTimeout` debounce so this hook stays usable in
// environments where the debounce module hasn't been wired yet (the
// production tree always has it; the fallback exists for isolation
// tests).

import { useCallback, useEffect, useRef, type RefObject } from 'react';

const STORAGE_PREFIX = 'c4:scroll:';

export interface UseScrollRestorationOptions {
  containerRef: RefObject<HTMLElement>;
  storageKey: string;
  debounceMs?: number;
}

export interface UseScrollRestorationResult {
  reset: () => void;
}

function resolveKey(key: string): string {
  return key.includes(':') ? key : `${STORAGE_PREFIX}${key}`;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    if (typeof window.sessionStorage === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function useScrollRestoration({
  containerRef,
  storageKey,
  debounceMs = 100,
}: UseScrollRestorationOptions): UseScrollRestorationResult {
  const keyRef = useRef<string>(resolveKey(storageKey));
  const pendingValueRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    keyRef.current = resolveKey(storageKey);
  }, [storageKey]);

  const flushWrite = useCallback(() => {
    const store = safeSessionStorage();
    if (!store) {
      pendingValueRef.current = null;
      return;
    }
    if (pendingValueRef.current === null) return;
    try {
      store.setItem(keyRef.current, String(pendingValueRef.current));
    } catch {
      // Quota / disabled storage — swallow; restoration is best-effort.
    }
    pendingValueRef.current = null;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const store = safeSessionStorage();
    if (store) {
      try {
        const raw = store.getItem(keyRef.current);
        if (raw !== null) {
          const n = Number.parseInt(raw, 10);
          if (Number.isFinite(n) && n >= 0) {
            el.scrollTop = n;
          }
        }
      } catch {
        // ignore — best-effort restore
      }
    }

    const onScroll = () => {
      pendingValueRef.current = el.scrollTop;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushWrite();
      }, debounceMs);
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushWrite();
    };
  }, [containerRef, debounceMs, flushWrite]);

  const reset = useCallback(() => {
    pendingValueRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const store = safeSessionStorage();
    if (!store) return;
    try {
      store.removeItem(keyRef.current);
    } catch {
      // ignore
    }
  }, []);

  return { reset };
}
