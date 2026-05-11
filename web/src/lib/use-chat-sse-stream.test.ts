import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useChatSseStream } from './use-chat-sse-stream';

// jsdom doesn't ship EventSource. This stub mirrors the slice the hook
// uses (onopen / onerror / onmessage + close()) so the tests can drive
// frames synchronously and observe the lifecycle.
class EventSourceStub {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  static instances: EventSourceStub[] = [];

  constructor(url: string) {
    this.url = url;
    EventSourceStub.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  EventSourceStub.instances = [];
  vi.stubGlobal('EventSource', EventSourceStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// btoa is available in jsdom but ChatSse decodes via atob -> TextDecoder,
// so the b64 we hand in via `data.data` must round-trip through atob.
const b64 = (s: string) => btoa(s);

describe('useChatSseStream', () => {
  it('starts idle: sseConnected=false before any onopen fires', () => {
    const { result } = renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput: vi.fn(), onCleanup: vi.fn() }),
    );
    expect(result.current.sseConnected).toBe(false);
    // One EventSource is opened on mount (the hook has no skip-if-empty branch).
    expect(EventSourceStub.instances).toHaveLength(1);
  });

  it('opens EventSource on /api/watch?name=<worker> on mount', () => {
    renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput: vi.fn(), onCleanup: vi.fn() }),
    );
    expect(EventSourceStub.instances[0]?.url).toContain('/api/watch?name=w1');
  });

  it('URL-encodes the worker name in the watch path', () => {
    renderHook(() =>
      useChatSseStream({ workerName: 'a/b c', onOutput: vi.fn(), onCleanup: vi.fn() }),
    );
    expect(EventSourceStub.instances[0]?.url).toContain('a%2Fb%20c');
  });

  it('flips sseConnected=true when EventSource emits onopen', () => {
    const { result } = renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput: vi.fn(), onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(result.current.sseConnected).toBe(false);
    act(() => {
      es.onopen?.();
    });
    expect(result.current.sseConnected).toBe(true);
  });

  it('flips sseConnected=false when EventSource emits onerror', () => {
    const { result } = renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput: vi.fn(), onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    // Seed connected so the flip is observable.
    act(() => {
      es.onopen?.();
    });
    expect(result.current.sseConnected).toBe(true);
    act(() => {
      es.onerror?.();
    });
    expect(result.current.sseConnected).toBe(false);
  });

  it('decodes a b64 output frame and hands the raw bytes to onOutput', () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput, onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ type: 'output', data: b64('hello\n') }),
      });
    });
    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith('hello\n');
  });

  it('ignores frames whose type is not "output"', () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput, onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ type: 'state', data: b64('ignored') }),
      });
    });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('ignores frames whose `data` field is missing or not a string', () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput, onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({ data: JSON.stringify({ type: 'output' }) });
    });
    act(() => {
      es.onmessage?.({ data: JSON.stringify({ type: 'output', data: 42 }) });
    });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('swallows malformed JSON payloads without throwing or calling onOutput', () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput, onCleanup: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(() => {
      act(() => {
        es.onmessage?.({ data: 'not-valid-json{' });
      });
    }).not.toThrow();
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('closes the EventSource and calls onCleanup on unmount', () => {
    const onCleanup = vi.fn();
    const { unmount } = renderHook(() =>
      useChatSseStream({ workerName: 'w1', onOutput: vi.fn(), onCleanup }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(es.closed).toBe(false);
    expect(onCleanup).not.toHaveBeenCalled();
    unmount();
    expect(es.closed).toBe(true);
    expect(onCleanup).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh EventSource (and closes the previous one + calls onCleanup) when workerName changes', () => {
    const onCleanup = vi.fn();
    const { rerender } = renderHook(
      ({ workerName }: { workerName: string }) =>
        useChatSseStream({ workerName, onOutput: vi.fn(), onCleanup }),
      { initialProps: { workerName: 'w1' } },
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/watch?name=w1');

    rerender({ workerName: 'w2' });
    expect(EventSourceStub.instances).toHaveLength(2);
    expect(EventSourceStub.instances[0]?.closed).toBe(true);
    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(EventSourceStub.instances[1]?.url).toContain('/api/watch?name=w2');
    expect(EventSourceStub.instances[1]?.closed).toBe(false);
  });
});
