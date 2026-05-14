// (v1.11.132) Minimal client-side error capture. installErrorCapture()
// wires window 'error' and 'unhandledrejection' handlers once (guarded
// against double-install) and POSTs a small JSON payload to the daemon
// at /api/client-errors. Best-effort: fetch errors are swallowed, the
// capture never re-throws, and it does not replace existing handlers
// (addEventListener, not assignment). Truncates message/stack at a
// safe length so a runaway stack cannot blow up the request body.

const ENDPOINT = '/api/client-errors';
const MAX_FIELD_LEN = 4096;

let installed = false;

function truncate(value: unknown, max: number = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

function send(payload: Record<string, unknown>): void {
  try {
    const p = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (p && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* swallow: capture must never throw into caller */
  }
}

function userAgent(): string {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
      ? navigator.userAgent
      : '';
  } catch {
    return '';
  }
}

function currentUrl(): string {
  try {
    return typeof location !== 'undefined' && typeof location.href === 'string'
      ? location.href
      : '';
  } catch {
    return '';
  }
}

function onError(e: ErrorEvent): void {
  try {
    const errAny = e.error as { stack?: unknown } | null | undefined;
    send({
      kind: 'error',
      message: truncate(e.message),
      stack: truncate(errAny && typeof errAny === 'object' ? errAny.stack : ''),
      url: typeof e.filename === 'string' && e.filename ? e.filename : currentUrl(),
      line: typeof e.lineno === 'number' ? e.lineno : null,
      column: typeof e.colno === 'number' ? e.colno : null,
      userAgent: userAgent(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* swallow */
  }
}

function onRejection(e: PromiseRejectionEvent): void {
  try {
    const reason = e.reason as { message?: unknown; stack?: unknown } | null | undefined;
    let message = '';
    let stack = '';
    if (reason && typeof reason === 'object') {
      if (typeof reason.message === 'string') message = reason.message;
      else if (reason.message != null) message = String(reason.message);
      if (typeof reason.stack === 'string') stack = reason.stack;
    } else if (reason != null) {
      message = String(reason);
    }
    send({
      kind: 'unhandledrejection',
      message: truncate(message),
      stack: truncate(stack),
      url: currentUrl(),
      line: null,
      column: null,
      userAgent: userAgent(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* swallow */
  }
}

export function installErrorCapture(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;
  try {
    window.addEventListener('error', onError);
  } catch {
    /* swallow */
  }
  try {
    window.addEventListener('unhandledrejection', onRejection);
  } catch {
    /* swallow */
  }
}
