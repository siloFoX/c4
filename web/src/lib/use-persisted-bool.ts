import { useCallback, useEffect, useState } from 'react';
import type * as React from 'react';

// (v1.10.690) Generic localStorage-backed boolean
// preference. Reads on first render via lazy
// initializer (avoids touching localStorage every
// render); writes on every change. Stores '1' / '0'
// rather than the JSON string-encoded `true` / `false`
// so the existing keys (created by ad-hoc reader/
// writer pairs across WorkerList + others) stay
// readable after this hook adopts them.
//
// (v1.10.758) Returns a 3-tuple — the third slot is a
// stable `toggle` so callers can flip the bool without
// allocating an inline `() => set((v) => !v)` arrow at
// every render.

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBoolPref(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode — ignore */
  }
}

export function usePersistedBool(
  key: string,
  fallback: boolean,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>, () => void] {
  const [value, setValue] = useState<boolean>(() => readBoolPref(key, fallback));
  useEffect(() => { writeBoolPref(key, value); }, [key, value]);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, setValue, toggle];
}
