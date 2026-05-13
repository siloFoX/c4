import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useControlPanelWorkerList } from './use-control-panel-worker-list';
import type { Worker } from '../types';

// useControlPanelWorkerList is a thin wrapper over
// useSilentPollWithRefresh<ListResponse, Worker[]> against /api/list
// at the documented 5s cadence with a stable EMPTY_WORKERS fallback
// and a mapper that defends against a non-array workers field. The
// hook stays silent on failure (sidebar surfaces list errors) and
// exposes a manual `fetchList` refresh that resolves once the next
// payload lands.
//
// Tests cover idle state, the happy-path REST exchange, the manual
// refresh promise, a server error preserving previous state silently,
// the non-array defense, the 5_000 ms interval cadence, and the
// interval cleanup on unmount.

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    name: 'w1',
    command: 'claude',
    target: 'local',
    branch: 'main',
    worktree: null,
    parent: null,
    scope: false,
    pid: 1234,
    status: 'idle',
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
    ...overrides,
  };
}

describe('useControlPanelWorkerList', () => {
  it('idle: workers starts as a stable empty array and fetchList is a function', () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    expect(Array.isArray(result.current.workers)).toBe(true);
    expect(result.current.workers).toHaveLength(0);
    expect(typeof result.current.fetchList).toBe('function');
  });

  it('happy-path: surfaces workers array after the first /api/list response lands', async () => {
    let path = '';
    server.use(
      http.get('/api/list', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          workers: [makeWorker({ name: 'w1' }), makeWorker({ name: 'w2' })],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        });
      }),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(2);
    });
    expect(path).toBe('/api/list');
    expect(result.current.workers[0]?.name).toBe('w1');
    expect(result.current.workers[1]?.name).toBe('w2');
  });

  it('fetchList resolves after the next /api/list response, replacing the workers slot', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        return HttpResponse.json({
          workers: [makeWorker({ name: `w-${calls}` })],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        });
      }),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(1);
    });
    expect(result.current.workers[0]?.name).toBe('w-1');
    await act(async () => {
      await result.current.fetchList();
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.current.workers[0]?.name).toBe(`w-${calls}`);
  });

  it('silently degrades on 500: previous workers stay, no throw, no toast surface', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json({
            workers: [makeWorker({ name: 'before' })],
            queuedTasks: [],
            lostWorkers: [],
            lastHealthCheck: null,
          });
        }
        return HttpResponse.json({ error: 'boom' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(1);
      expect(result.current.workers[0]?.name).toBe('before');
    });
    await act(async () => {
      await result.current.fetchList();
    });
    expect(result.current.workers[0]?.name).toBe('before');
  });

  it('fetchList swallows a network failure (silent degradation contract)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/list', () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json({
            workers: [],
            queuedTasks: [],
            lostWorkers: [],
            lastHealthCheck: null,
          });
        }
        return HttpResponse.error();
      }),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(0);
    });
    await expect(
      act(async () => {
        await result.current.fetchList();
      }),
    ).resolves.toBeUndefined();
    expect(result.current.workers).toHaveLength(0);
  });

  it('non-array workers field falls back to empty array (mapper guard)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: 'oops' as unknown as Worker[],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await new Promise((r) => setTimeout(r, 50));
    expect(Array.isArray(result.current.workers)).toBe(true);
    expect(result.current.workers).toHaveLength(0);
  });

  it('schedules polling at the documented 5s cadence via setInterval', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    try {
      renderHook(() => useControlPanelWorkerList());
      const intervalCall = setIntervalSpy.mock.calls.find(
        (c) => c[1] === 5000,
      );
      expect(intervalCall).toBeDefined();
    } finally {
      setIntervalSpy.mockRestore();
    }
  });

  it('clears the polling interval on unmount (no stale ticks)', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    try {
      const { unmount } = renderHook(() => useControlPanelWorkerList());
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
    }
  });

  it('busy slot via release-gate: a slow /api/list still resolves through fetchList without leaking state', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    server.use(
      http.get('/api/list', async () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json({
            workers: [makeWorker({ name: 'first' })],
            queuedTasks: [],
            lostWorkers: [],
            lastHealthCheck: null,
          });
        }
        await gate;
        return HttpResponse.json({
          workers: [makeWorker({ name: 'second' })],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        });
      }),
    );
    const { result } = renderHook(() => useControlPanelWorkerList());
    await waitFor(() => {
      expect(result.current.workers[0]?.name).toBe('first');
    });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.fetchList();
      await Promise.resolve();
    });
    // Mid-flight: previous workers slot must stay populated.
    expect(result.current.workers[0]?.name).toBe('first');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.workers[0]?.name).toBe('second');
  });
});
