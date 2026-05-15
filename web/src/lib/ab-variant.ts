import { useEffect, useState, useCallback } from 'react';

// (v1.11.220 / patch 11.202) Component-scoped A/B variant harness.
// Assignment is deterministic per (experimentName, sessionId) so the
// same visitor sees the same variant across reloads in a session;
// overrides under `c4:ab-variants` let operators force a variant for
// QA without touching the daemon. Changes are broadcast through the
// `ab-variant-changed` CustomEvent so React subtrees can subscribe
// without a context provider. SSR-safe: every window touch is guarded.

export type VariantId = 'A' | 'B';

export interface ExperimentDef {
  name: string;
  splits?: number[];
}

export const VARIANT_IDS: readonly VariantId[] = ['A', 'B'] as const;

export const SESSION_KEY = 'c4:session-id';
export const STORAGE_KEY = 'c4:ab-variants';
export const EVENT_NAME = 'ab-variant-changed';

const DEFAULT_SPLITS: readonly number[] = [0.5, 0.5];

// FNV-1a 32-bit hash. Deterministic and good enough for bucketing.
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function normalizeSplits(splits?: number[]): number[] {
  const src =
    splits && splits.length >= 2 && splits.every((n) => Number.isFinite(n) && n >= 0)
      ? splits.slice(0, VARIANT_IDS.length)
      : DEFAULT_SPLITS.slice();
  const sum = src.reduce((a, b) => a + b, 0);
  if (sum <= 0) return DEFAULT_SPLITS.slice();
  return src.map((n) => n / sum);
}

export function assignVariant(
  experimentName: string,
  sessionId: string,
  splits?: number[],
): VariantId {
  const norm = normalizeSplits(splits);
  const h = hashString(`${experimentName}:${sessionId}`);
  const bucket = (h % 10000) / 10000;
  let cumulative = 0;
  for (let i = 0; i < norm.length && i < VARIANT_IDS.length; i += 1) {
    cumulative += norm[i];
    if (bucket < cumulative) return VARIANT_IDS[i];
  }
  return VARIANT_IDS[VARIANT_IDS.length - 1];
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `s-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && typeof existing === 'string') return existing;
    const fresh = randomId();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    return 'ephemeral';
  }
}

function readOverrides(): Partial<Record<string, VariantId>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object') return {};
    const out: Partial<Record<string, VariantId>> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      if (v === 'A' || v === 'B') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(values: Partial<Record<string, VariantId>>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* private mode -- ignore */
  }
}

export interface ABVariantChangedDetail {
  experiment: string;
  variant: VariantId;
}

function dispatchChange(detail: ABVariantChangedDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch {
    /* ignore */
  }
}

export function getVariant(experimentName: string, splits?: number[]): VariantId {
  const overrides = readOverrides();
  const override = overrides[experimentName];
  if (override === 'A' || override === 'B') return override;
  return assignVariant(experimentName, getSessionId(), splits);
}

export function setVariant(experimentName: string, variant: VariantId): void {
  const all = readOverrides();
  all[experimentName] = variant;
  writeOverrides(all);
  dispatchChange({ experiment: experimentName, variant });
}

export function clearVariants(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function useABVariant(
  experimentName: string,
  splits?: number[],
): [VariantId, (v: VariantId) => void] {
  const [value, setValue] = useState<VariantId>(() => getVariant(experimentName, splits));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setValue(getVariant(experimentName, splits));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ABVariantChangedDetail>).detail;
      if (!detail || detail.experiment !== experimentName) return;
      setValue(detail.variant);
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentName]);
  const set = useCallback(
    (next: VariantId) => {
      setVariant(experimentName, next);
    },
    [experimentName],
  );
  return [value, set];
}
