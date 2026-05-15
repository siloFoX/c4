// (v1.11.238 / patch 11.220) Generic JSON-backed localStorage hook
// + matching imperative helpers for non-React callers.
//
// Storage contract: every value is JSON.stringify-d on write and
// JSON.parse-d on read. Malformed payloads fall back to defaultValue.
// Cross-tab sync rides the browser-native 'storage' event; same-tab
// observers wake up via a synthetic StorageEvent dispatched by
// setLocalStorage / removeLocalStorage on `window`.
//
// SSR-safe: every window touch is guarded by typeof window. The hook
// reads its initial value through the lazy useState initializer so a
// single render pass never hits localStorage twice.

import { useCallback, useEffect, useRef, useState } from 'react';

const SYNTHETIC_DISPATCHER_FLAG = '__c4UseLocalStorageSynthetic';

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function readRaw(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, defaultValue: T): T {
  if (raw === null) return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function dispatchSyntheticStorage(key: string, newValue: string | null): void {
  if (!hasWindow()) return;
  try {
    const event = new StorageEvent('storage', {
      key,
      newValue,
      storageArea: window.localStorage,
    });
    // Tag so listeners can tell the synthetic event apart from the
    // real cross-tab one if they ever need to.
    (event as unknown as Record<string, boolean>)[SYNTHETIC_DISPATCHER_FLAG] = true;
    window.dispatchEvent(event);
  } catch {
    // Older jsdom builds reject the StorageEvent constructor; fall
    // back to a CustomEvent that mirrors the shape we care about.
    try {
      const fallback = new CustomEvent('storage', {
        detail: { key, newValue },
      });
      (fallback as unknown as Record<string, unknown>).key = key;
      (fallback as unknown as Record<string, unknown>).newValue = newValue;
      window.dispatchEvent(fallback);
    } catch {
      // ignore
    }
  }
}

export function getLocalStorage<T>(key: string, defaultValue: T): T {
  return parse<T>(readRaw(key), defaultValue);
}

export function setLocalStorage<T>(key: string, value: T): void {
  if (!hasWindow()) return;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return;
  }
  try {
    window.localStorage.setItem(key, serialized);
  } catch {
    return;
  }
  dispatchSyntheticStorage(key, serialized);
}

export function removeLocalStorage(key: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
  dispatchSyntheticStorage(key, null);
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void, () => void] {
  const defaultRef = useRef<T>(defaultValue);
  defaultRef.current = defaultValue;

  const [value, setValue] = useState<T>(() =>
    getLocalStorage<T>(key, defaultValue),
  );

  // Re-seed from storage when the key changes so two hooks pointing
  // at different keys never share state.
  const lastKeyRef = useRef<string>(key);
  useEffect(() => {
    if (lastKeyRef.current !== key) {
      lastKeyRef.current = key;
      setValue(getLocalStorage<T>(key, defaultRef.current));
    }
  }, [key]);

  useEffect(() => {
    if (!hasWindow()) return;
    const onStorage = (event: Event) => {
      const se = event as StorageEvent;
      if (se.key !== null && se.key !== key) return;
      // key === null happens on localStorage.clear() -- treat as reset.
      if (se.key === null) {
        setValue(defaultRef.current);
        return;
      }
      setValue(parse<T>(se.newValue ?? null, defaultRef.current));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      setLocalStorage<T>(key, next);
    },
    [key],
  );

  const remove = useCallback(() => {
    setValue(defaultRef.current);
    removeLocalStorage(key);
  }, [key]);

  return [value, set, remove];
}
