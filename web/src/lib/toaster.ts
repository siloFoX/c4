import type { ReactNode } from 'react';

// (v1.11.411, TODO 11.393) Programmatic toaster utility.
//
// Pure non-react store + `toast` namespace mirroring the sonner /
// react-hot-toast surface (`toast.success` / `.error` / `.info` /
// `.warning` / `.promise` / `.dismiss` / `.clear`). Any module --
// React or not -- can `import { toast } from '@/lib/toaster'` and
// push a toast without needing a hook handle.
//
// A host component (see `<ToastProvider>` in
// `components/ui/toast.tsx`) bridges the singleton to the visual
// stack by calling `subscribeToaster(listener)`. The listener
// receives the current entry snapshot on subscribe + on every
// mutation, so the host stays a thin reactive wrapper.
//
// Auto-dismiss timers live inside the store so a host that
// renders, unmounts, and remounts (e.g., HMR or a dialog-scoped
// provider) does not double-fire dismissals. `durationMs:
// Infinity` (or any non-positive value) opts out of auto-dismiss.

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  durationMs?: number;
  action?: ToastAction;
  description?: ReactNode;
  id?: number;
}

export interface ToasterEntry {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
  durationMs?: number;
  createdAt: number;
}

export type ToasterListener = (entries: readonly ToasterEntry[]) => void;

export interface ToasterStore {
  push: (
    kind: ToastKind,
    message: ReactNode,
    opts?: ToastOptions,
  ) => number;
  dismiss: (id: number) => void;
  clear: () => void;
  update: (id: number, patch: Partial<ToasterEntry>) => boolean;
  subscribe: (listener: ToasterListener) => () => void;
  list: () => readonly ToasterEntry[];
}

export interface ToasterConfig {
  defaultDurationMs?: number;
  visibleLimit?: number;
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const DEFAULT_TOAST_DURATION_MS = 5000;
export const DEFAULT_TOAST_VISIBLE_LIMIT = 100;

// Errors run a longer default so an operator does not miss a
// fail-state on a busy screen. Other kinds use defaultDurationMs.
const KIND_DURATION_OVERRIDE: Partial<Record<ToastKind, number>> = {
  error: 8000,
};

function resolveDuration(
  kind: ToastKind,
  optsDuration: number | undefined,
  defaultDurationMs: number,
): number | undefined {
  if (optsDuration === undefined) {
    return KIND_DURATION_OVERRIDE[kind] ?? defaultDurationMs;
  }
  if (Number.isFinite(optsDuration) && optsDuration > 0) {
    return optsDuration;
  }
  return undefined;
}

export function createToaster(config: ToasterConfig = {}): ToasterStore {
  const defaultDurationMs =
    config.defaultDurationMs ?? DEFAULT_TOAST_DURATION_MS;
  const visibleLimit = Math.max(
    1,
    config.visibleLimit ?? DEFAULT_TOAST_VISIBLE_LIMIT,
  );
  const now = config.now ?? (() => Date.now());
  const setTimer =
    config.setTimer ??
    ((cb: () => void, ms: number) =>
      setTimeout(cb, ms) as unknown);
  const clearTimer =
    config.clearTimer ??
    ((h: unknown) =>
      clearTimeout(h as ReturnType<typeof setTimeout>));

  let entries: ToasterEntry[] = [];
  let counter = 0;
  const listeners = new Set<ToasterListener>();
  const timers = new Map<number, unknown>();

  function notify() {
    const snapshot = entries.slice();
    for (const listener of listeners) listener(snapshot);
  }

  function trim() {
    if (entries.length <= visibleLimit) return;
    const overflow = entries.slice(0, entries.length - visibleLimit);
    entries = entries.slice(entries.length - visibleLimit);
    for (const dropped of overflow) {
      const handle = timers.get(dropped.id);
      if (handle !== undefined) {
        clearTimer(handle);
        timers.delete(dropped.id);
      }
    }
  }

  function scheduleDismiss(entry: ToasterEntry) {
    if (entry.durationMs === undefined) return;
    if (!Number.isFinite(entry.durationMs)) return;
    if (entry.durationMs <= 0) return;
    const handle = setTimer(() => {
      const stillThere = entries.some((e) => e.id === entry.id);
      if (!stillThere) {
        timers.delete(entry.id);
        return;
      }
      entries = entries.filter((e) => e.id !== entry.id);
      timers.delete(entry.id);
      notify();
    }, entry.durationMs);
    timers.set(entry.id, handle);
  }

  function generateId(): number {
    counter += 1;
    return now() * 1000 + counter;
  }

  function push(
    kind: ToastKind,
    message: ReactNode,
    opts?: ToastOptions,
  ): number {
    const duration = resolveDuration(
      kind,
      opts?.durationMs,
      defaultDurationMs,
    );
    const id = opts?.id ?? generateId();
    const createdAt = now();

    const entry: ToasterEntry = {
      id,
      kind,
      message,
      createdAt,
      ...(duration !== undefined ? { durationMs: duration } : {}),
      ...(opts?.action ? { action: opts.action } : {}),
      ...(opts?.description !== undefined
        ? { description: opts.description }
        : {}),
    };

    const existingIdx = entries.findIndex((e) => e.id === id);
    if (existingIdx !== -1) {
      const old = entries[existingIdx];
      if (old) {
        const handle = timers.get(old.id);
        if (handle !== undefined) {
          clearTimer(handle);
          timers.delete(old.id);
        }
      }
      const next = entries.slice();
      next[existingIdx] = entry;
      entries = next;
    } else {
      entries = [...entries, entry];
    }

    trim();
    scheduleDismiss(entry);
    notify();
    return id;
  }

  function dismiss(id: number) {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    entries = entries.filter((e) => e.id !== id);
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimer(handle);
      timers.delete(id);
    }
    notify();
  }

  function clear() {
    if (entries.length === 0 && timers.size === 0) return;
    for (const handle of timers.values()) clearTimer(handle);
    timers.clear();
    entries = [];
    notify();
  }

  function update(
    id: number,
    patch: Partial<ToasterEntry>,
  ): boolean {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const previous = entries[idx];
    if (!previous) return false;

    const next: ToasterEntry = {
      ...previous,
      ...patch,
      id: previous.id,
      createdAt: previous.createdAt,
    };
    const list = entries.slice();
    list[idx] = next;
    entries = list;

    if ('durationMs' in patch) {
      const oldHandle = timers.get(id);
      if (oldHandle !== undefined) {
        clearTimer(oldHandle);
        timers.delete(id);
      }
      scheduleDismiss(next);
    }
    notify();
    return true;
  }

  function subscribe(listener: ToasterListener): () => void {
    listeners.add(listener);
    listener(entries.slice());
    return () => {
      listeners.delete(listener);
    };
  }

  function list(): readonly ToasterEntry[] {
    return entries.slice();
  }

  return { push, dismiss, clear, update, subscribe, list };
}

export interface ToastPromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((err: unknown) => ReactNode);
  durationMs?: number;
}

export interface ToastApi {
  success: (message: ReactNode, opts?: ToastOptions) => number;
  error: (message: ReactNode, opts?: ToastOptions) => number;
  info: (message: ReactNode, opts?: ToastOptions) => number;
  warning: (message: ReactNode, opts?: ToastOptions) => number;
  promise: <T>(
    p: Promise<T>,
    messages: ToastPromiseMessages<T>,
  ) => Promise<T>;
  dismiss: (id: number) => void;
  clear: () => void;
}

export function createToastApi(store: ToasterStore): ToastApi {
  return {
    success: (message, opts) => store.push('success', message, opts),
    error: (message, opts) => store.push('error', message, opts),
    info: (message, opts) => store.push('info', message, opts),
    warning: (message, opts) => store.push('warning', message, opts),
    dismiss: (id) => store.dismiss(id),
    clear: () => store.clear(),
    promise: async <T,>(
      p: Promise<T>,
      messages: ToastPromiseMessages<T>,
    ): Promise<T> => {
      const loadingId = store.push('info', messages.loading, {
        durationMs: Infinity,
      });
      try {
        const data = await p;
        const successNode =
          typeof messages.success === 'function'
            ? (messages.success as (d: T) => ReactNode)(data)
            : messages.success;
        store.push('success', successNode, {
          id: loadingId,
          ...(messages.durationMs !== undefined
            ? { durationMs: messages.durationMs }
            : {}),
        });
        return data;
      } catch (err) {
        const errorNode =
          typeof messages.error === 'function'
            ? (messages.error as (e: unknown) => ReactNode)(err)
            : messages.error;
        store.push('error', errorNode, {
          id: loadingId,
          ...(messages.durationMs !== undefined
            ? { durationMs: messages.durationMs }
            : {}),
        });
        throw err;
      }
    },
  };
}

// Module-level shared singleton. `import { toast } from
// '@/lib/toaster'` resolves here -- callers do NOT need to
// instantiate their own store.
const sharedStore = createToaster();

export const toast: ToastApi = createToastApi(sharedStore);

export function subscribeToaster(listener: ToasterListener): () => void {
  return sharedStore.subscribe(listener);
}

export function getToasterEntries(): readonly ToasterEntry[] {
  return sharedStore.list();
}

// Test helper -- clears the singleton between tests so cross-test
// state does not leak. Equivalent to `toast.clear()` but named so
// it does not look like a production call site.
export function resetToaster(): void {
  sharedStore.clear();
}
