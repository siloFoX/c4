import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkerList } from './use-worker-list';

// useWorkerList polls /api/list every 5s, subscribes to /api/events
// for SSE-driven refreshes, and exposes a manual refresh().
// Contract:
//   - mounts and immediately fetches /api/list (workers default to [])
//   - happy path: ListResponse.workers stored verbatim, error cleared
//   - non-array workers field => workers=[] (defensive)
//   - HTTP error => error=message, previous workers state unchanged
//   - sseConnected starts false, flips true on open, false on error
//   - any non-`connected` event triggers a refetch
//   - `connected` event alone does NOT trigger a refetch
//   - malformed JSON event payload is swallowed
//   - unmount clears the 5s interval and closes the EventSource

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
  vi.useRealTimers();
});

function emptyList() {
  return { workers: [], queuedTasks: [], lostWorkers: [], lastHealthCheck: null };
}

describe('useWorkerList', () => {
  it('mounts with empty workers, no error, sseConnected=false', () => {
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    const { result } = renderHook(() => useWorkerList());
    expect(result.current.workers).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.sseConnected).toBe(false);
  });

  it('fetches /api/list once on mount and stores the workers array', async () => {
    const w = [
      {
        name: 'w1',
        command: 'claude',
        target: 'local',
        branch: null,
        worktree: null,
        parent: null,
        scope: false,
        pid: null,
        status: 'idle',
        unreadSnapshots: 0,
        totalSnapshots: 0,
        intervention: null,
        lastQuestion: null,
        errorCount: 0,
        phase: null,
        testFailCount: 0,
      },
    ];
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ ...emptyList(), workers: w }),
      ),
    );
    const { result } = renderHook(() => useWorkerList());
    await waitFor(() => expect(result.current.workers).toHaveLength(1));
    expect(result.current.workers[0]?.name).toBe('w1');
    expect(result.current.error).toBeNull();
  });

  it('opens an EventSource pointed at /api/events on mount', () => {
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    renderHook(() => useWorkerList());
    expect(EventSourceStub.instances).toHaveLength(1);
    expect(EventSourceStub.instances[0]?.url).toContain('/api/events');
  });

  it('sseConnected flips true on EventSource onopen and false on onerror', () => {
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    const { result } = renderHook(() => useWorkerList());
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

  it('refetches /api/list when a non-`connected` SSE event arrives', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json(emptyList());
      }),
    );
    renderHook(() => useWorkerList());
    await waitFor(() => expect(calls).toBe(1));
    const es = EventSourceStub.instances[0]!;
    await act(async () => {
      es.onmessage?.({ data: JSON.stringify({ type: 'worker.changed' }) });
      await Promise.resolve();
    });
    await waitFor(() => expect(calls).toBe(2));
  });

  it('does NOT refetch on a `connected` SSE event (heartbeat is silent)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json(emptyList());
      }),
    );
    renderHook(() => useWorkerList());
    await waitFor(() => expect(calls).toBe(1));
    const es = EventSourceStub.instances[0]!;
    await act(async () => {
      es.onmessage?.({ data: JSON.stringify({ type: 'connected' }) });
      await Promise.resolve();
    });
    // Settle for a tick so any reaction would have shown up.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });

  it('swallows malformed JSON SSE payloads without throwing or refetching', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json(emptyList());
      }),
    );
    renderHook(() => useWorkerList());
    await waitFor(() => expect(calls).toBe(1));
    const es = EventSourceStub.instances[0]!;
    expect(() => {
      act(() => {
        es.onmessage?.({ data: 'not-json{' });
      });
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });

  it('falls back to [] when the workers field is not an array (defensive)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ ...emptyList(), workers: 'not-array' as unknown }),
      ),
    );
    const { result } = renderHook(() => useWorkerList());
    await waitFor(() => expect(result.current.workers).toEqual([]));
    expect(result.current.error).toBeNull();
  });

  it('error path: HTTP 500 surfaces error message, sseConnected unaffected', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkerList());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.workers).toEqual([]);
  });

  it('refresh() re-hits /api/list and updates workers', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json({
          ...emptyList(),
          workers: [
            {
              name: `w-${calls}`,
              command: 'claude',
              target: 'local',
              branch: null,
              worktree: null,
              parent: null,
              scope: false,
              pid: null,
              status: 'idle',
              unreadSnapshots: 0,
              totalSnapshots: 0,
              intervention: null,
              lastQuestion: null,
              errorCount: 0,
              phase: null,
              testFailCount: 0,
            },
          ],
        });
      }),
    );
    const { result } = renderHook(() => useWorkerList());
    await waitFor(() => expect(result.current.workers[0]?.name).toBe('w-1'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.current.workers[0]?.name).toBe(`w-${calls}`);
  });

  it('refresh() clears a prior error on success', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWorkerList());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
  });

  it('refresh reference is stable across re-renders (useCallback has no deps)', () => {
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    const { result, rerender } = renderHook(() => useWorkerList());
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('closes the EventSource on unmount', async () => {
    server.use(
      http.get('/api/list', () => HttpResponse.json(emptyList())),
    );
    const { unmount } = renderHook(() => useWorkerList());
    const es = EventSourceStub.instances[0]!;
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it('clears the 5s polling interval on unmount (no further fetches)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json(emptyList());
      }),
    );
    const { unmount } = renderHook(() => useWorkerList());
    await waitFor(() => expect(calls).toBe(1));
    unmount();
    const before = calls;
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(calls).toBe(before);
  });

  it('5s timer fires a refresh while mounted (belt-and-braces with SSE)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json(emptyList());
      }),
    );
    renderHook(() => useWorkerList());
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
  });
});
