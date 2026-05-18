import { useEffect, useState, useCallback } from 'react';

// (v1.11.216 / patch 11.198) Component-scoped feature flag registry.
// Persists a `{key: bool}` object under `c4:feature-flags` and broadcasts
// changes through a `feature-flag-changed` CustomEvent so React subtrees
// can subscribe without a context provider. SSR-safe: every window touch
// is guarded.

export type FeatureFlagKey =
  | 'gridDebug'
  | 'routeProgress'
  | 'pageTransitions'
  | 'motion'
  | 'reducedMotion'
  | 'uiDemoRoute';

// (v1.11.339, TODO 11.321) Category buckets for the
// FeatureFlags admin page. Drives the Tabs filter strip so
// the operator can narrow long flag lists by intent rather
// than scanning every row. The set is intentionally small --
// new flags should pick the closest fit instead of inventing
// new categories. Add a new category here only when none of
// the existing buckets capture the new flag's intent.
export type FeatureFlagCategory = 'motion' | 'navigation' | 'developer';

export const CATEGORY_LABELS: Record<FeatureFlagCategory, string> = {
  motion: 'Motion',
  navigation: 'Navigation',
  developer: 'Developer',
};

export interface FeatureFlagDef {
  key: FeatureFlagKey;
  label: string;
  description: string;
  defaultValue: boolean;
  // (v1.11.339, TODO 11.321) Category bucket. Required so
  // the FeatureFlags page can always sort every flag into a
  // tab; unknown values would break the Tabs filter contract.
  category: FeatureFlagCategory;
}

export const FLAGS: readonly FeatureFlagDef[] = [
  {
    key: 'gridDebug',
    label: 'Grid Debug Overlay',
    description:
      'Show the 12-column grid + breakpoint pills overlay (dev only).',
    defaultValue: false,
    category: 'developer',
  },
  {
    key: 'routeProgress',
    label: 'Route Progress Bar',
    description: 'Top-of-page progress indicator while a route is loading.',
    defaultValue: true,
    category: 'navigation',
  },
  {
    key: 'pageTransitions',
    label: 'Page Transitions',
    description:
      'Animate between feature pages using the View Transitions API.',
    defaultValue: true,
    category: 'motion',
  },
  {
    key: 'motion',
    label: 'Motion / Animations',
    description: 'Master toggle for all UI animations.',
    defaultValue: true,
    category: 'motion',
  },
  {
    key: 'reducedMotion',
    label: 'Reduced Motion Override',
    description:
      'Force reduced-motion treatment regardless of the OS-level preference.',
    defaultValue: false,
    category: 'motion',
  },
  // (v1.11.325, TODO 11.307) Gate the storybook-style /ui-demo
  // route. Off by default so the per-page rollout stays a
  // dev-only affordance until the operator explicitly opts in.
  {
    key: 'uiDemoRoute',
    label: 'UI Demo Route',
    description:
      'Enable the /ui-demo gallery page that renders every UI primitive with its main variants. Dev/visual-QA only.',
    defaultValue: false,
    category: 'developer',
  },
] as const;

export const STORAGE_KEY = 'c4:feature-flags';
export const EVENT_NAME = 'feature-flag-changed';

const DEFAULTS: Record<FeatureFlagKey, boolean> = FLAGS.reduce(
  (acc, f) => {
    acc[f.key] = f.defaultValue;
    return acc;
  },
  {} as Record<FeatureFlagKey, boolean>,
);

function readAll(): Record<FeatureFlagKey, boolean> {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  let parsed: Partial<Record<FeatureFlagKey, boolean>> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const json = JSON.parse(raw);
      if (json && typeof json === 'object') {
        parsed = json as Partial<Record<FeatureFlagKey, boolean>>;
      }
    }
  } catch {
    parsed = {};
  }
  const out = { ...DEFAULTS };
  for (const f of FLAGS) {
    const v = parsed[f.key];
    if (typeof v === 'boolean') out[f.key] = v;
  }
  return out;
}

function writeAll(values: Record<FeatureFlagKey, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* private mode -- ignore */
  }
}

export interface FeatureFlagChangedDetail {
  key: FeatureFlagKey;
  value: boolean;
}

function dispatchChange(detail: FeatureFlagChangedDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
  } catch {
    /* environments without CustomEvent constructor -- ignore */
  }
}

export function getFlag(key: FeatureFlagKey): boolean {
  return readAll()[key];
}

export function setFlag(key: FeatureFlagKey, value: boolean): void {
  const all = readAll();
  all[key] = value;
  writeAll(all);
  dispatchChange({ key, value });
}

export function resetFlags(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const f of FLAGS) {
    dispatchChange({ key: f.key, value: f.defaultValue });
  }
}

export function useFeatureFlag(
  key: FeatureFlagKey,
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => getFlag(key));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<FeatureFlagChangedDetail>).detail;
      if (!detail || detail.key !== key) {
        setValue(getFlag(key));
        return;
      }
      setValue(detail.value);
    };
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      setFlag(key, next);
    },
    [key],
  );
  return [value, set];
}

export function useAllFlags(): Record<FeatureFlagKey, boolean> {
  const [values, setValues] = useState<Record<FeatureFlagKey, boolean>>(
    () => readAll(),
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => setValues(readAll());
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);
  return values;
}
