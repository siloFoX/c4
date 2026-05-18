import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// (v1.11.374, TODO 11.356) SSE notification stream
// + toast queue.
//
// Subscribes to `/api/notifications` (or a
// caller-supplied URL) via `EventSource`, parses
// JSON payloads, and feeds them into a bounded
// toast queue with auto-dismiss, hover-pause, and
// click-to-action handlers.
//
// Composes with the existing `Toast` portal +
// `useToast` from `lib/use-toast.ts` -- the toast
// queue here is the canonical surface for
// server-pushed notifications, distinct from the
// imperative `showToast` host pattern.
//
// Public surface:
//
//   const stream = useNotificationStream({
//     url: '/api/notifications',
//     maxVisible: 5,
//     autoDismissMs: 5000,
//     onAction: (notification) => navigate(notification.action.href),
//   });
//   stream.toasts        // active toast list
//   stream.dismiss(id)   // imperative dismiss
//   stream.enqueue(...)  // host-side enqueue (tests / local events)
//   stream.setPaused(b)  // pause auto-dismiss timers on hover
//   stream.connected     // true when the EventSource is open
//
// SSR-safe: every `EventSource` / `window` access
// runs inside `useEffect`.

export type NotificationKind =
  | 'success'
  | 'error'
  | 'info'
  | 'warning';

export interface NotificationAction {
  // Visible label rendered as a button / link.
  label: string;
  // Optional URL the host can navigate to.
  href?: string;
  // Free-form metadata the host can route on
  // (e.g. `{ kind: 'open-worker', name: 'auto-w42' }`).
  payload?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  message: string;
  ts: number; // ms epoch
  // Optional action chip on the toast.
  action?: NotificationAction;
  // Optional title rendered above the message.
  title?: string;
  // Override the auto-dismiss timeout for this
  // entry. 0 disables (stays until manually
  // dismissed).
  durationMs?: number;
  // Sticky entries skip the auto-dismiss timer
  // entirely. Convenience flag equivalent to
  // `durationMs: 0`.
  sticky?: boolean;
}

export interface UseNotificationStreamOptions {
  // SSE endpoint. Defaults to '/api/notifications'.
  url?: string;
  // Maximum visible toasts. Older entries shift
  // out (FIFO) when the cap is exceeded.
  // Default 5 per the dispatch.
  maxVisible?: number;
  // Default auto-dismiss timeout in ms. Per-entry
  // `durationMs` wins when set.
  // Default 5000.
  autoDismissMs?: number;
  // Fires when a notification arrives. Useful for
  // logging / analytics. The toast is still
  // enqueued regardless.
  onMessage?: (notification: Notification) => void;
  // Fires when the operator clicks a toast's
  // action button. The toast is dismissed AFTER
  // the handler runs.
  onAction?: (notification: Notification) => void;
  // Connection-error callback.
  onError?: (event: Event) => void;
  // Factory for the EventSource. Defaults to
  // `new EventSource(url)`. Tests inject a fake.
  eventSourceFactory?: (url: string) => EventSourceLike;
  // When false, the SSE wiring is skipped. The
  // queue still works for imperative
  // `enqueue(...)` calls (useful for tests and
  // optional notification surfaces).
  enabled?: boolean;
}

export interface EventSourceLike {
  onopen?: ((event: Event) => void) | null;
  onmessage?: ((event: MessageEvent) => void) | null;
  onerror?: ((event: Event) => void) | null;
  close: () => void;
}

export interface NotificationStreamApi {
  toasts: Notification[];
  connected: boolean;
  paused: boolean;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  enqueue: (notification: Notification) => void;
  setPaused: (paused: boolean) => void;
  fireAction: (id: string) => void;
}

export const DEFAULT_NOTIFICATIONS_URL = '/api/notifications';
export const DEFAULT_MAX_VISIBLE = 5;
export const DEFAULT_AUTO_DISMISS_MS = 5000;

// (v1.11.374) Parses a raw SSE payload string into
// a `Notification`. Returns `null` when the
// payload is unrecognised or malformed; callers
// should silently drop invalid frames so a
// corrupted server message does not crash the
// client.
export function parseNotificationPayload(
  raw: string,
  fallbackId: () => string = generateFallbackId,
): Notification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;
  const message =
    typeof data['message'] === 'string' ? (data['message'] as string) : null;
  if (!message) return null;
  const rawId = data['id'];
  const id =
    typeof rawId === 'string' && rawId ? rawId : fallbackId();
  const kindRaw = data['kind'] ?? data['type'];
  const kind: NotificationKind =
    kindRaw === 'success' ||
    kindRaw === 'error' ||
    kindRaw === 'warning' ||
    kindRaw === 'info'
      ? kindRaw
      : 'info';
  const tsRaw = data['ts'];
  const ts =
    typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : Date.now();
  const out: Notification = { id, kind, message, ts };
  if (typeof data['title'] === 'string') out.title = data['title'] as string;
  const dur = data['durationMs'];
  if (typeof dur === 'number' && dur >= 0) {
    out.durationMs = dur;
  }
  if (data['sticky'] === true) out.sticky = true;
  const action = parseAction(data['action']);
  if (action) out.action = action;
  return out;
}

function parseAction(raw: unknown): NotificationAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const label = typeof a['label'] === 'string' ? (a['label'] as string) : null;
  if (!label) return null;
  const out: NotificationAction = { label };
  if (typeof a['href'] === 'string') out.href = a['href'] as string;
  const payload = a['payload'];
  if (payload && typeof payload === 'object') {
    out.payload = payload as Record<string, unknown>;
  }
  return out;
}

let fallbackCounter = 0;
function generateFallbackId(): string {
  fallbackCounter += 1;
  return `notif-${Date.now()}-${fallbackCounter}`;
}

export function useNotificationStream(
  options: UseNotificationStreamOptions = {},
): NotificationStreamApi {
  const {
    url = DEFAULT_NOTIFICATIONS_URL,
    maxVisible = DEFAULT_MAX_VISIBLE,
    autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
    onMessage,
    onAction,
    onError,
    eventSourceFactory,
    enabled = true,
  } = options;

  const [toasts, setToasts] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPausedState] = useState(false);

  // Timer registry keyed by notification id. Each
  // entry tracks the remaining ms + the active
  // timeout handle. Hover-pause clears every
  // handle and recomputes `remaining`; resume
  // schedules a fresh handle with the stored
  // remaining time.
  const timersRef = useRef<Map<string, {
    remaining: number;
    handle: ReturnType<typeof setTimeout> | null;
    startedAt: number;
    durationMs: number;
  }>>(new Map());

  // Latest callbacks held in refs so the
  // EventSource effect does not re-bind when the
  // host re-renders.
  const onMessageRef = useRef(onMessage);
  const onActionRef = useRef(onAction);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onActionRef.current = onAction;
    onErrorRef.current = onError;
  }, [onMessage, onAction, onError]);

  // ---- Queue mutators -----------------------------------------

  const clearTimer = useCallback((id: string) => {
    const entry = timersRef.current.get(id);
    if (!entry) return;
    if (entry.handle !== null) {
      clearTimeout(entry.handle);
      entry.handle = null;
    }
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((n) => n.id !== id));
    },
    [clearTimer],
  );

  const dismissAll = useCallback(() => {
    for (const id of Array.from(timersRef.current.keys())) {
      clearTimer(id);
    }
    setToasts([]);
  }, [clearTimer]);

  // Schedule (or re-schedule) the auto-dismiss
  // timer for a single notification. No-ops when
  // the entry is sticky, has duration <= 0, or
  // the queue is currently paused.
  const scheduleTimer = useCallback(
    (notification: Notification) => {
      const duration =
        notification.sticky === true
          ? 0
          : notification.durationMs ?? autoDismissMs;
      if (duration <= 0) return;
      if (paused) {
        // Record the remaining time but skip the
        // setTimeout call -- resume picks it up.
        timersRef.current.set(notification.id, {
          remaining: duration,
          handle: null,
          startedAt: Date.now(),
          durationMs: duration,
        });
        return;
      }
      const handle = setTimeout(() => {
        timersRef.current.delete(notification.id);
        setToasts((prev) => prev.filter((n) => n.id !== notification.id));
      }, duration);
      timersRef.current.set(notification.id, {
        remaining: duration,
        handle,
        startedAt: Date.now(),
        durationMs: duration,
      });
    },
    [autoDismissMs, paused],
  );

  const enqueue = useCallback(
    (notification: Notification) => {
      setToasts((prev) => {
        // Dedup by id: replace in place so the
        // server can update an existing toast
        // (e.g. progress message).
        const idx = prev.findIndex((n) => n.id === notification.id);
        let next: Notification[];
        if (idx >= 0) {
          // Replace + clear any in-flight timer
          // so the new entry's duration takes
          // over.
          clearTimer(notification.id);
          next = [...prev];
          next[idx] = notification;
        } else {
          next = [...prev, notification];
        }
        // Cap at maxVisible. Oldest entries shift
        // out first.
        if (next.length > maxVisible) {
          const overflow = next.slice(0, next.length - maxVisible);
          for (const dropped of overflow) {
            clearTimer(dropped.id);
          }
          next = next.slice(next.length - maxVisible);
        }
        return next;
      });
      scheduleTimer(notification);
    },
    [maxVisible, clearTimer, scheduleTimer],
  );

  const fireAction = useCallback(
    (id: string) => {
      const target = toasts.find((n) => n.id === id);
      if (!target) return;
      if (onActionRef.current) {
        try {
          onActionRef.current(target);
        } catch {
          // Don't let a host onAction throw bring
          // the surface down.
        }
      }
      dismiss(id);
    },
    [toasts, dismiss],
  );

  // ---- Hover-pause --------------------------------------------

  const setPaused = useCallback((next: boolean) => {
    setPausedState((prev) => {
      if (prev === next) return prev;
      const map = timersRef.current;
      if (next) {
        // Freeze every active timer; record the
        // remaining time so resume can re-arm.
        for (const [id, entry] of map.entries()) {
          if (entry.handle !== null) {
            clearTimeout(entry.handle);
            const elapsed = Date.now() - entry.startedAt;
            entry.remaining = Math.max(0, entry.durationMs - elapsed);
            entry.handle = null;
            map.set(id, entry);
          }
        }
      } else {
        // Resume each entry with its remaining
        // duration.
        for (const [id, entry] of map.entries()) {
          if (entry.handle === null && entry.remaining > 0) {
            const remaining = entry.remaining;
            const handle = setTimeout(() => {
              timersRef.current.delete(id);
              setToasts((prevToasts) =>
                prevToasts.filter((n) => n.id !== id),
              );
            }, remaining);
            entry.handle = handle;
            entry.startedAt = Date.now();
            entry.durationMs = remaining;
            map.set(id, entry);
          }
        }
      }
      return next;
    });
  }, []);

  // ---- SSE wiring ---------------------------------------------

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    if (typeof window === 'undefined') return;

    const factory =
      eventSourceFactory ??
      ((target: string): EventSourceLike => {
        return new EventSource(target) as unknown as EventSourceLike;
      });

    let es: EventSourceLike | null = null;
    try {
      es = factory(url);
    } catch (err) {
      onErrorRef.current?.(err as Event);
      setConnected(false);
      return;
    }

    es.onopen = () => setConnected(true);
    es.onerror = (event: Event) => {
      setConnected(false);
      onErrorRef.current?.(event);
    };
    es.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : null;
      if (!data) return;
      const notification = parseNotificationPayload(data);
      if (!notification) return;
      onMessageRef.current?.(notification);
      enqueue(notification);
    };

    return () => {
      es?.close();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, eventSourceFactory]);

  // Cleanup every timer on full unmount.
  useEffect(() => {
    return () => {
      for (const entry of timersRef.current.values()) {
        if (entry.handle !== null) clearTimeout(entry.handle);
      }
      timersRef.current.clear();
    };
  }, []);

  return useMemo<NotificationStreamApi>(
    () => ({
      toasts,
      connected,
      paused,
      dismiss,
      dismissAll,
      enqueue,
      setPaused,
      fireAction,
    }),
    [
      toasts,
      connected,
      paused,
      dismiss,
      dismissAll,
      enqueue,
      setPaused,
      fireAction,
    ],
  );
}
