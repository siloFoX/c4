import { useEffect, useState } from 'react';

// (v1.11.218) Per-user keyboard binding overrides. Centralises the set
// of remappable action ids, persists overrides to localStorage under
// the `c4:bindings` key, and exposes a React hook so consumers stay in
// sync via the `keyboard-bindings-changed` CustomEvent.

export type BindingId =
  | 'commandPalette'
  | 'help'
  | 'newWorker'
  | 'closeWorker'
  | 'mergeBranch'
  | 'toggleTheme'
  | 'focusSearch'
  | 'gotoHealth'
  | 'gotoSessions'
  | 'gotoHistory';

export const DEFAULT_BINDINGS: Record<BindingId, string> = {
  commandPalette: 'mod+k',
  help: '?',
  newWorker: 'mod+n',
  closeWorker: 'mod+w',
  mergeBranch: 'mod+shift+m',
  toggleTheme: 't',
  focusSearch: '/',
  gotoHealth: 'g h',
  gotoSessions: 'g s',
  gotoHistory: 'g y',
};

export const STORAGE_KEY = 'c4:bindings';
export const EVENT_NAME = 'keyboard-bindings-changed';

export const BINDING_IDS: readonly BindingId[] = Object.keys(
  DEFAULT_BINDINGS,
) as BindingId[];

function readOverrides(): Partial<Record<BindingId, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Partial<Record<BindingId, string>> = {};
    for (const id of BINDING_IDS) {
      const v = (parsed as Record<string, unknown>)[id];
      if (typeof v === 'string' && v.length > 0) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(map: Partial<Record<BindingId, string>>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / disabled storage -- swallow.
  }
}

function dispatch(map: Record<BindingId, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { bindings: map } }),
    );
  } catch {
    // non-browser test env
  }
}

function merged(): Record<BindingId, string> {
  const overrides = readOverrides();
  const out = { ...DEFAULT_BINDINGS } as Record<BindingId, string>;
  for (const id of BINDING_IDS) {
    const v = overrides[id];
    if (typeof v === 'string' && v.length > 0) out[id] = v;
  }
  return out;
}

export function getBinding(id: BindingId): string {
  return merged()[id];
}

export function getBindings(): Record<BindingId, string> {
  return merged();
}

export function setBinding(id: BindingId, combo: string): void {
  if (!BINDING_IDS.includes(id)) return;
  const overrides = readOverrides();
  const trimmed = (combo || '').trim();
  if (trimmed.length === 0 || trimmed === DEFAULT_BINDINGS[id]) {
    delete overrides[id];
  } else {
    overrides[id] = trimmed;
  }
  writeOverrides(overrides);
  dispatch(merged());
}

export function resetBindings(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  dispatch({ ...DEFAULT_BINDINGS });
}

export function useBindings(): Record<BindingId, string> {
  const [map, setMap] = useState<Record<BindingId, string>>(() => merged());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { bindings?: Record<BindingId, string> }
        | undefined;
      if (detail && detail.bindings) {
        setMap(detail.bindings);
      } else {
        setMap(merged());
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setMap(merged());
    };
    window.addEventListener(EVENT_NAME, onChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return map;
}

// Normalise raw combo strings like 'Ctrl+Shift+P', 'mod+k', '?'. The
// canonical form is lowercase, '+' separated, modifiers sorted (mod,
// ctrl, alt, shift, meta), then the printable key. Space-separated
// chord prefixes (e.g. 'g h') are preserved as a leading token.
export function parseCombo(input: string): string {
  if (!input) return '';
  const raw = input.trim().toLowerCase();
  if (!raw) return '';
  // Chord (sequence) -- preserve order, normalise each token.
  if (/\s+/.test(raw) && !raw.includes('+')) {
    return raw.split(/\s+/).filter(Boolean).join(' ');
  }
  const parts = raw.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  const aliasMap: Record<string, string> = {
    cmd: 'mod',
    command: 'mod',
    meta: 'mod',
    control: 'ctrl',
    option: 'alt',
    return: 'enter',
    esc: 'escape',
  };
  const modOrder = ['mod', 'ctrl', 'alt', 'shift'];
  const mods: string[] = [];
  let key = '';
  for (const p of parts) {
    const norm = aliasMap[p] ?? p;
    if (modOrder.includes(norm)) {
      if (!mods.includes(norm)) mods.push(norm);
    } else {
      key = norm;
    }
  }
  mods.sort((a, b) => modOrder.indexOf(a) - modOrder.indexOf(b));
  return key ? [...mods, key].join('+') : mods.join('+');
}
