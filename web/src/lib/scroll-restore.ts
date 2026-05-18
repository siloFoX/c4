import { useEffect, useRef } from 'react';

// (v1.11.366, TODO 11.348) Per-route scroll position
// save / restore via sessionStorage.
//
// The c4 dashboard does not use React Router today --
// navigation is driven by a `topView` enum + a
// per-route render switch in `App.tsx`. So instead of
// hooking the Router's `useLocation`, this module
// takes a `routeKey` string from the host and treats
// each unique value as a separate scroll surface.
//
// The dispatch asks for:
//   - Restore on back / forward.
//   - Reset on forward navigation.
//
// "Forward" here means the operator chose a new route
// (e.g. clicked a different sidebar entry) -- their
// expectation is a fresh top-of-page render. "Back /
// forward" means the browser history button or the
// keyboard equivalent (`Alt+Left` / `Alt+Right`).
//
// The host decides which discriminator to pass in via
// the `navigationType` argument; the helper does the
// session-storage plumbing either way.

const STORAGE_PREFIX = 'c4:scroll-restore:';

export type NavigationType = 'forward' | 'pop' | 'replace';

function resolveKey(routeKey: string): string {
  return routeKey.includes(':')
    ? routeKey
    : `${STORAGE_PREFIX}${routeKey}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    if (typeof window.sessionStorage === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// ----- Pure helpers (importable from non-React code) -----------

export function saveScrollPosition(
  routeKey: string,
  position: number,
): boolean {
  const store = safeStorage();
  if (!store) return false;
  if (!Number.isFinite(position) || position < 0) return false;
  try {
    store.setItem(resolveKey(routeKey), String(Math.round(position)));
    return true;
  } catch {
    return false;
  }
}

export function getScrollPosition(routeKey: string): number | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(resolveKey(routeKey));
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch {
    return null;
  }
}

export function clearScrollPosition(routeKey: string): boolean {
  const store = safeStorage();
  if (!store) return false;
  try {
    store.removeItem(resolveKey(routeKey));
    return true;
  } catch {
    return false;
  }
}

export function clearAllScrollPositions(): number {
  const store = safeStorage();
  if (!store) return 0;
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      try {
        store.removeItem(k);
        removed++;
      } catch {
        // ignore individual quota errors; continue
      }
    }
  } catch {
    // ignore
  }
  return removed;
}

// Decides whether to restore a previously-saved
// scroll position given the navigation type. Pure,
// no side effects -- the host calls this and then
// either `window.scrollTo()` or leaves the page at 0.
export function shouldRestoreScroll(
  navigationType: NavigationType,
): boolean {
  return navigationType === 'pop' || navigationType === 'replace';
}

// ----- React hook ----------------------------------------------

export interface UseWindowScrollRestoreOptions {
  // Unique identifier for the current route / view.
  // When the value changes, the hook saves the
  // outgoing scroll position under the previous key
  // and applies the save/restore policy for the new
  // key.
  routeKey: string;
  // Discriminator from the host. 'forward' resets
  // the new route to 0; 'pop' / 'replace' restore.
  // Defaults to 'forward' so a host that never
  // wires the discriminator gets the predictable
  // top-of-page render on every navigation.
  navigationType?: NavigationType;
  // Optional override for the scroll target. When
  // omitted, the hook reads + writes
  // `window.scrollY` / `window.scrollTo`. Pass a
  // ref to drive a specific scroll container.
  targetRef?: { current: HTMLElement | null };
  // Debounce window for the scroll-listener write.
  // Default 100ms -- aligned with the existing
  // `useScrollRestoration` hook contract.
  debounceMs?: number;
}

export function useWindowScrollRestore({
  routeKey,
  navigationType = 'forward',
  targetRef,
  debounceMs = 100,
}: UseWindowScrollRestoreOptions): void {
  const lastKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-route navigation effect: save the OUTGOING
  // scroll, then either restore or reset for the
  // INCOMING route.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Save outgoing scroll under the previous key
    // (if any). The hook reads the previous key
    // from the ref, not from a closure, so a rapid
    // re-render does not double-save.
    const prevKey = lastKeyRef.current;
    if (prevKey && prevKey !== routeKey) {
      const outgoing = readScrollTop(targetRef);
      if (outgoing != null) saveScrollPosition(prevKey, outgoing);
    }
    // Decide the incoming policy.
    if (shouldRestoreScroll(navigationType)) {
      const saved = getScrollPosition(routeKey);
      if (saved != null) {
        writeScrollTop(targetRef, saved);
      } else {
        writeScrollTop(targetRef, 0);
      }
    } else {
      // Forward navigation -- clear any stale entry
      // for this route AND reset to 0 so a fresh
      // top-of-page render is visible.
      clearScrollPosition(routeKey);
      writeScrollTop(targetRef, 0);
    }
    lastKeyRef.current = routeKey;
  }, [routeKey, navigationType, targetRef]);

  // Per-mount scroll listener: persist the current
  // scrollTop into sessionStorage every `debounceMs`
  // so a refresh / back navigation lands at the same
  // spot.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = resolveScrollTarget(targetRef);
    const onScroll = (): void => {
      const value = readScrollTop(targetRef);
      if (value == null) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        saveScrollPosition(routeKey, value);
      }, debounceMs);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const final = readScrollTop(targetRef);
        if (final != null) saveScrollPosition(routeKey, final);
      }
    };
  }, [routeKey, debounceMs, targetRef]);
}

function resolveScrollTarget(
  ref: UseWindowScrollRestoreOptions['targetRef'],
): EventTarget {
  if (ref && ref.current) return ref.current;
  return window;
}

function readScrollTop(
  ref: UseWindowScrollRestoreOptions['targetRef'],
): number | null {
  if (typeof window === 'undefined') return null;
  if (ref && ref.current) {
    return ref.current.scrollTop;
  }
  if (typeof window.scrollY === 'number') return window.scrollY;
  return null;
}

function writeScrollTop(
  ref: UseWindowScrollRestoreOptions['targetRef'],
  value: number,
): void {
  if (typeof window === 'undefined') return;
  if (ref && ref.current) {
    ref.current.scrollTop = value;
    return;
  }
  // Use auto behaviour so the restored scroll is
  // instant -- a smooth scroll on every navigation
  // surfaces as a visible re-scroll glitch.
  window.scrollTo({ top: value, left: 0, behavior: 'auto' });
}
