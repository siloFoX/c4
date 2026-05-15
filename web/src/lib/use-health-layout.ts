import { useCallback, useEffect, useState } from 'react';

// (v1.11.222 / patch 11.204) Component-scoped Health hero card layout.
// Persists the user's preferred order of hero StatCards under
// `c4:health:layout` and broadcasts changes via a CustomEvent so the
// page subscribes without a context provider. SSR-safe: every window
// touch is guarded.

export type HealthLayoutKey = 'uptime' | 'workers' | 'queue';

export const DEFAULT_LAYOUT: readonly HealthLayoutKey[] = [
  'uptime',
  'workers',
  'queue',
];

export const STORAGE_KEY = 'c4:health:layout';
export const EVENT_NAME = 'health-layout-changed';

const VALID = new Set<HealthLayoutKey>(DEFAULT_LAYOUT);

function isValidKey(v: unknown): v is HealthLayoutKey {
  return typeof v === 'string' && VALID.has(v as HealthLayoutKey);
}

function readRaw(): HealthLayoutKey[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isValidKey);
  } catch {
    return null;
  }
}

export function getLayout(): HealthLayoutKey[] {
  const stored = readRaw();
  if (!stored || stored.length === 0) return [...DEFAULT_LAYOUT];
  const seen = new Set<HealthLayoutKey>();
  const out: HealthLayoutKey[] = [];
  for (const k of stored) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of DEFAULT_LAYOUT) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

function dispatchChange(order: HealthLayoutKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<{ order: HealthLayoutKey[] }>(EVENT_NAME, {
        detail: { order },
      }),
    );
  } catch {
    /* environments without CustomEvent constructor -- ignore */
  }
}

export function setLayout(order: HealthLayoutKey[]): void {
  const filtered: HealthLayoutKey[] = [];
  const seen = new Set<HealthLayoutKey>();
  for (const k of order) {
    if (isValidKey(k) && !seen.has(k)) {
      seen.add(k);
      filtered.push(k);
    }
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch {
      /* private mode -- ignore */
    }
  }
  dispatchChange(getLayout());
}

export function resetLayout(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  dispatchChange([...DEFAULT_LAYOUT]);
}

export function useHealthLayout(): [
  HealthLayoutKey[],
  (order: HealthLayoutKey[]) => void,
  () => void,
] {
  const [layout, setLayoutState] = useState<HealthLayoutKey[]>(() =>
    getLayout(),
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setLayoutState(getLayout());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  const set = useCallback((order: HealthLayoutKey[]) => {
    setLayout(order);
  }, []);
  const reset = useCallback(() => {
    resetLayout();
  }, []);
  return [layout, set, reset];
}
