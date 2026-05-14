// (v1.11.213) Local in-memory error reporting sink (11.195). A
// component-scope replacement for a remote error service: keeps the
// last MAX_RECORDS error events in a FIFO ring buffer, exposes a
// subscribe/unsubscribe pattern for React consumers, and offers a
// JSON download for ad-hoc operator hand-off. Strictly local - no
// network calls, no third-party SDKs.

import { useEffect, useState } from 'react';

export type ErrorSource = 'window' | 'unhandledrejection' | 'react' | 'manual';

export interface ErrorRecord {
  id: string;
  timestamp: string;
  source: ErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
}

const MAX_RECORDS = 50;
const MAX_FIELD_LEN = 8192;

type Listener = (records: ErrorRecord[]) => void;

// getAll() returns newest-FIRST (index 0 is the most recent record).
const records: ErrorRecord[] = [];
const listeners = new Set<Listener>();

let installed = false;
let nextCounter = 0;
let prevOnError: OnErrorEventHandler | null = null;

function truncate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length <= MAX_FIELD_LEN) return value;
  return value.slice(0, MAX_FIELD_LEN);
}

function nextId(): string {
  // Prefer crypto.randomUUID when available; fall back to a monotonic
  // counter so tests in environments without crypto stay deterministic.
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
      return g.crypto.randomUUID();
    }
  } catch {
    /* swallow */
  }
  nextCounter += 1;
  return `err-${Date.now()}-${nextCounter}`;
}

function notify(): void {
  const snapshot = records.slice();
  for (const l of listeners) {
    try {
      l(snapshot);
    } catch {
      /* a misbehaving listener must not break the others */
    }
  }
}

function currentUrl(): string | undefined {
  try {
    if (typeof location !== 'undefined' && typeof location.href === 'string') {
      return location.href;
    }
  } catch {
    /* swallow */
  }
  return undefined;
}

export interface ReportInput {
  source: ErrorSource;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
}

export function report(input: ReportInput): ErrorRecord {
  const rec: ErrorRecord = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    source: input.source,
    message: truncate(input.message) ?? '',
    stack: truncate(input.stack),
    componentStack: truncate(input.componentStack),
    url: input.url ?? currentUrl(),
  };
  records.unshift(rec);
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }
  notify();
  return rec;
}

export function getAll(): ErrorRecord[] {
  return records.slice();
}

export function clear(): void {
  if (records.length === 0) return;
  records.length = 0;
  notify();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function onWindowError(event: ErrorEvent): void {
  const errAny = event.error as { stack?: unknown } | null | undefined;
  const stack =
    errAny && typeof errAny === 'object' && typeof errAny.stack === 'string'
      ? errAny.stack
      : undefined;
  report({
    source: 'window',
    message: event.message || 'Unknown error',
    stack,
    url: event.filename || currentUrl(),
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason as
    | { message?: unknown; stack?: unknown }
    | null
    | undefined;
  let message = 'Unhandled rejection';
  let stack: string | undefined;
  if (reason && typeof reason === 'object') {
    if (typeof reason.message === 'string') message = reason.message;
    else if (reason.message != null) message = String(reason.message);
    if (typeof reason.stack === 'string') stack = reason.stack;
  } else if (reason != null) {
    message = String(reason);
  }
  report({ source: 'unhandledrejection', message, stack });
}

export function install(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;
  prevOnError = window.onerror ?? null;
  // Chain through window.onerror so a previously-installed handler
  // still runs.
  window.onerror = function chained(
    message,
    source,
    lineno,
    colno,
    error
  ): boolean | void {
    try {
      const msg = typeof message === 'string' ? message : String(message ?? '');
      const stack =
        error && typeof error === 'object' && typeof error.stack === 'string'
          ? error.stack
          : undefined;
      report({
        source: 'window',
        message: msg,
        stack,
        url: typeof source === 'string' ? source : currentUrl(),
      });
    } catch {
      /* swallow */
    }
    if (typeof prevOnError === 'function') {
      try {
        return prevOnError.call(window, message, source, lineno, colno, error);
      } catch {
        /* swallow */
      }
    }
    return undefined;
  };
  try {
    window.addEventListener('error', onWindowError);
  } catch {
    /* swallow */
  }
  try {
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  } catch {
    /* swallow */
  }
}

export function _resetForTests(): void {
  records.length = 0;
  listeners.clear();
  installed = false;
  nextCounter = 0;
  if (typeof window !== 'undefined') {
    try {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener(
        'unhandledrejection',
        onUnhandledRejection as EventListener
      );
    } catch {
      /* swallow */
    }
    window.onerror = prevOnError;
    prevOnError = null;
  }
}

export function downloadJson(filename?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const body = JSON.stringify(getAll(), null, 2);
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name =
    filename ??
    `error-reports-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a tick to start the download before we revoke.
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* swallow */
    }
  }, 0);
}

export function useErrorRecords(): ErrorRecord[] {
  const [snap, setSnap] = useState<ErrorRecord[]>(() => getAll());
  useEffect(() => {
    setSnap(getAll());
    return subscribe((next) => setSnap(next));
  }, []);
  return snap;
}

export const errorReporter = {
  install,
  report,
  getAll,
  clear,
  subscribe,
  downloadJson,
  useErrorRecords,
};

export default errorReporter;
