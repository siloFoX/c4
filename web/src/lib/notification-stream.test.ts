import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AUTO_DISMISS_MS,
  parseNotificationPayload,
  useNotificationStream,
  type EventSourceLike,
  type Notification,
} from './notification-stream';

// Mock EventSource factory captures the latest
// instance so the tests can fire onopen / onmessage
// / onerror events synchronously.
interface MockEventSource extends EventSourceLike {
  url: string;
  fireOpen: () => void;
  fireMessage: (data: string) => void;
  fireError: () => void;
  closed: boolean;
}

let lastEventSource: MockEventSource | null = null;

function makeFactory() {
  return (url: string): MockEventSource => {
    const instance: MockEventSource = {
      url,
      closed: false,
      onopen: null,
      onmessage: null,
      onerror: null,
      close() {
        instance.closed = true;
      },
      fireOpen() {
        instance.onopen?.(new Event('open'));
      },
      fireMessage(data: string) {
        const event = new MessageEvent('message', { data });
        instance.onmessage?.(event);
      },
      fireError() {
        instance.onerror?.(new Event('error'));
      },
    };
    lastEventSource = instance;
    return instance;
  };
}

beforeEach(() => {
  lastEventSource = null;
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseNotificationPayload', () => {
  it('parses a minimal { message } payload', () => {
    const n = parseNotificationPayload(
      JSON.stringify({ message: 'hi' }),
    );
    expect(n).not.toBeNull();
    expect(n?.message).toBe('hi');
    expect(n?.kind).toBe('info');
    expect(typeof n?.id).toBe('string');
    expect(typeof n?.ts).toBe('number');
  });

  it('maps `type` alias to `kind`', () => {
    const n = parseNotificationPayload(
      JSON.stringify({ message: 'err', type: 'error' }),
    );
    expect(n?.kind).toBe('error');
  });

  it('falls back to info for unrecognised kinds', () => {
    const n = parseNotificationPayload(
      JSON.stringify({ message: 'm', kind: 'whatever' }),
    );
    expect(n?.kind).toBe('info');
  });

  it('parses action with label + href', () => {
    const n = parseNotificationPayload(
      JSON.stringify({
        message: 'm',
        action: { label: 'Open', href: '/x' },
      }),
    );
    expect(n?.action).toEqual({ label: 'Open', href: '/x' });
  });

  it('drops an action that has no label', () => {
    const n = parseNotificationPayload(
      JSON.stringify({ message: 'm', action: { href: '/x' } }),
    );
    expect(n?.action).toBeUndefined();
  });

  it('returns null on malformed JSON', () => {
    expect(parseNotificationPayload('not-json')).toBeNull();
  });

  it('returns null when message is missing', () => {
    expect(parseNotificationPayload(JSON.stringify({ kind: 'error' }))).toBeNull();
  });

  it('honours an explicit ts', () => {
    const n = parseNotificationPayload(
      JSON.stringify({ message: 'm', ts: 1000 }),
    );
    expect(n?.ts).toBe(1000);
  });

  it('respects sticky + durationMs', () => {
    const a = parseNotificationPayload(
      JSON.stringify({ message: 'm', sticky: true }),
    );
    expect(a?.sticky).toBe(true);
    const b = parseNotificationPayload(
      JSON.stringify({ message: 'm', durationMs: 8000 }),
    );
    expect(b?.durationMs).toBe(8000);
  });
});

describe('useNotificationStream', () => {
  function makeNotification(over: Partial<Notification> = {}): Notification {
    return {
      id: 'n1',
      kind: 'info',
      message: 'hello',
      ts: Date.now(),
      ...over,
    };
  }

  it('opens the EventSource and flips `connected` on open', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory }),
    );
    expect(lastEventSource?.url).toBe('/api/notifications');
    expect(result.current.connected).toBe(false);
    act(() => lastEventSource?.fireOpen());
    expect(result.current.connected).toBe(true);
  });

  it('flips `connected` to false on error and fires onError', () => {
    const onError = vi.fn();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        onError,
      }),
    );
    act(() => lastEventSource?.fireOpen());
    act(() => lastEventSource?.fireError());
    expect(result.current.connected).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('enqueues a notification on a JSON message', () => {
    const factory = makeFactory();
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory, onMessage }),
    );
    act(() =>
      lastEventSource?.fireMessage(
        JSON.stringify({ id: 'a', message: 'hi', kind: 'success' }),
      ),
    );
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.id).toBe('a');
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', message: 'hi', kind: 'success' }),
    );
  });

  it('silently drops malformed messages', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory }),
    );
    act(() => lastEventSource?.fireMessage('not-json'));
    act(() => lastEventSource?.fireMessage(JSON.stringify({ no: 'message' })));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('caps the visible queue at maxVisible', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        maxVisible: 3,
      }),
    );
    for (let i = 0; i < 5; i++) {
      act(() => result.current.enqueue(makeNotification({ id: `n${i}` })));
    }
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((n) => n.id)).toEqual(['n2', 'n3', 'n4']);
  });

  it('replaces an existing notification by id (dedup)', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'n1', message: 'a' })));
    act(() => result.current.enqueue(makeNotification({ id: 'n1', message: 'b' })));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.message).toBe('b');
  });

  it('auto-dismisses after autoDismissMs', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        autoDismissMs: 1000,
      }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a' })));
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('honours per-notification durationMs override', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        autoDismissMs: 5000,
      }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a', durationMs: 250 })));
    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('sticky notifications never auto-dismiss', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        autoDismissMs: 100,
      }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a', sticky: true })));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.toasts).toHaveLength(1);
  });

  it('hover-pause freezes the timer; resume keeps the remaining duration', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        autoDismissMs: 1000,
      }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a' })));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.toasts).toHaveLength(1);
    // Hover pause
    act(() => result.current.setPaused(true));
    act(() => {
      vi.advanceTimersByTime(2000); // would normally have dismissed
    });
    expect(result.current.toasts).toHaveLength(1);
    // Resume
    act(() => result.current.setPaused(false));
    // Remaining ~ 600ms
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismiss(id) removes one notification + clears its timer', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        autoDismissMs: 1000,
      }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a' })));
    act(() => result.current.enqueue(makeNotification({ id: 'b' })));
    expect(result.current.toasts).toHaveLength(2);
    act(() => result.current.dismiss('a'));
    expect(result.current.toasts.map((n) => n.id)).toEqual(['b']);
  });

  it('dismissAll() empties the queue', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory }),
    );
    act(() => result.current.enqueue(makeNotification({ id: 'a' })));
    act(() => result.current.enqueue(makeNotification({ id: 'b' })));
    act(() => result.current.dismissAll());
    expect(result.current.toasts).toHaveLength(0);
  });

  it('fireAction(id) calls onAction + dismisses the toast', () => {
    const factory = makeFactory();
    const onAction = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        onAction,
      }),
    );
    act(() =>
      result.current.enqueue(
        makeNotification({
          id: 'a',
          action: { label: 'Open', href: '/x' },
        }),
      ),
    );
    act(() => result.current.fireAction('a'));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
    );
    expect(result.current.toasts).toHaveLength(0);
  });

  it('fireAction with unknown id no-ops', () => {
    const factory = makeFactory();
    const onAction = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        onAction,
      }),
    );
    act(() => result.current.fireAction('does-not-exist'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('closes the EventSource on unmount', () => {
    const factory = makeFactory();
    const { unmount } = renderHook(() =>
      useNotificationStream({ eventSourceFactory: factory }),
    );
    expect(lastEventSource?.closed).toBe(false);
    unmount();
    expect(lastEventSource?.closed).toBe(true);
  });

  it('enabled=false skips the SSE wiring but keeps enqueue working', () => {
    const factory = makeFactory();
    const { result } = renderHook(() =>
      useNotificationStream({
        eventSourceFactory: factory,
        enabled: false,
      }),
    );
    expect(lastEventSource).toBeNull();
    act(() => result.current.enqueue(makeNotification({ id: 'a' })));
    expect(result.current.toasts).toHaveLength(1);
  });

  it('default autoDismissMs is 5000', () => {
    expect(DEFAULT_AUTO_DISMISS_MS).toBe(5000);
  });
});
