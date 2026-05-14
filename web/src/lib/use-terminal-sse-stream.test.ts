import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useTerminalSseStream } from './use-terminal-sse-stream';

// useTerminalSseStream wires the worker watch SSE stream into an
// xterm Terminal. Contract:
//   - no-ops when term ref is null (no EventSource, no onError)
//   - constructs EventSource on /api/watch?name=<encoded>
//   - flips sseConnected via onopen/onerror
//   - "output" frames: b64-decode data and write() into the term
//   - non-output frames or malformed JSON are silently ignored
//   - EventSource construction throw => onError(message), no leak
//   - unmount closes the EventSource

class EventSourceStub {
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  static instances: EventSourceStub[] = [];
  static throwOnConstruct: Error | null = null;

  constructor(url: string) {
    if (EventSourceStub.throwOnConstruct) {
      throw EventSourceStub.throwOnConstruct;
    }
    this.url = url;
    EventSourceStub.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  EventSourceStub.instances = [];
  EventSourceStub.throwOnConstruct = null;
  vi.stubGlobal('EventSource', EventSourceStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeTerm(): {
  ref: MutableRefObject<Terminal | null>;
  writes: string[];
} {
  const writes: string[] = [];
  const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
  ref.current = {
    write: (chunk: string) => {
      writes.push(chunk);
    },
  } as unknown as Terminal;
  return { ref, writes };
}

const b64 = (s: string) => btoa(s);

describe('useTerminalSseStream', () => {
  it('no-ops when termRef.current is null (no EventSource, no error)', () => {
    const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
    ref.current = null;
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError }),
    );
    expect(EventSourceStub.instances).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.sseConnected).toBe(false);
  });

  it('opens EventSource on /api/watch?name=<worker> on mount when term is present', () => {
    const { ref } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/watch?name=w1');
  });

  it('URL-encodes the worker name in the watch path', () => {
    const { ref } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({
        termRef: ref,
        workerName: 'a/b c',
        onError: vi.fn(),
      }),
    );
    expect(EventSourceStub.instances[0]?.url).toContain('a%2Fb%20c');
  });

  it('starts with sseConnected=false', () => {
    const { ref } = makeTerm();
    const { result } = renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    expect(result.current.sseConnected).toBe(false);
  });

  it('flips sseConnected=true on EventSource onopen', () => {
    const { ref } = makeTerm();
    const { result } = renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onopen?.();
    });
    expect(result.current.sseConnected).toBe(true);
  });

  it('flips sseConnected=false on EventSource onerror', () => {
    const { ref } = makeTerm();
    const { result } = renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onopen?.();
    });
    expect(result.current.sseConnected).toBe(true);
    act(() => {
      es.onerror?.();
    });
    expect(result.current.sseConnected).toBe(false);
  });

  it('decodes a b64 output frame and writes raw bytes to term.write', () => {
    const { ref, writes } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ type: 'output', data: b64('hello\n') }),
      });
    });
    expect(writes).toEqual(['hello\n']);
  });

  it('passes ANSI escape sequences through verbatim (no stripping)', () => {
    const { ref, writes } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    const raw = '\x1b[31mred\x1b[0m';
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ type: 'output', data: b64(raw) }),
      });
    });
    expect(writes).toEqual([raw]);
  });

  it('ignores frames whose type is not "output"', () => {
    const { ref, writes } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({
        data: JSON.stringify({ type: 'state', data: b64('ignored') }),
      });
    });
    expect(writes).toHaveLength(0);
  });

  it('ignores frames whose data field is missing or not a string', () => {
    const { ref, writes } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    act(() => {
      es.onmessage?.({ data: JSON.stringify({ type: 'output' }) });
    });
    act(() => {
      es.onmessage?.({ data: JSON.stringify({ type: 'output', data: 42 }) });
    });
    expect(writes).toHaveLength(0);
  });

  it('swallows malformed JSON payloads without throwing or writing', () => {
    const { ref, writes } = makeTerm();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(() => {
      act(() => {
        es.onmessage?.({ data: 'not-valid-json{' });
      });
    }).not.toThrow();
    expect(writes).toHaveLength(0);
  });

  it('reports an EventSource construction throw via onError (no leaked EventSource)', () => {
    EventSourceStub.throwOnConstruct = new Error('SecurityError: mixed content');
    const { ref } = makeTerm();
    const onError = vi.fn();
    renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError }),
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('SecurityError: mixed content');
    expect(EventSourceStub.instances).toHaveLength(0);
  });

  it('closes the EventSource on unmount', () => {
    const { ref } = makeTerm();
    const { unmount } = renderHook(() =>
      useTerminalSseStream({ termRef: ref, workerName: 'w1', onError: vi.fn() }),
    );
    const es = EventSourceStub.instances[0]!;
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('opens a fresh EventSource and closes the previous one when workerName changes', () => {
    const { ref } = makeTerm();
    const { rerender } = renderHook(
      ({ workerName }: { workerName: string }) =>
        useTerminalSseStream({ termRef: ref, workerName, onError: vi.fn() }),
      { initialProps: { workerName: 'w1' } },
    );
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/watch?name=w1');
    rerender({ workerName: 'w2' });
    expect(EventSourceStub.instances).toHaveLength(2);
    expect(EventSourceStub.instances[0]?.closed).toBe(true);
    expect(EventSourceStub.instances[1]?.url).toContain('/api/watch?name=w2');
    expect(EventSourceStub.instances[1]?.closed).toBe(false);
  });
});
