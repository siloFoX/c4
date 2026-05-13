import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor, act } from '@testing-library/react';
import { server } from '../test/server';
import { usePlanWorkers } from './use-plan-workers';
import type { Worker } from '../types';

// usePlanWorkers loads /api/list once on mount and auto-selects the
// first worker when nothing is currently selected. Selection +
// error reporting are delegated to the parent via setSelected /
// setError callbacks. loadWorkers is also exposed for manual
// refresh. Failure surfaces through setError; loadWorkers swallows
// the thrown error rather than rejecting so the caller does not
// have to wrap each refresh in try/catch.
//
// Note: vi.fn() instances are hoisted out of the renderHook callback
// because the hook keys its loadWorkers useCallback off the setter
// references. Fresh fns on each render would otherwise trigger an
// infinite mount loop.

function makeWorker(name: string): Worker {
  return {
    name,
    command: 'claude',
    target: 'local',
    branch: `c4/${name}`,
    worktree: `/tmp/${name}`,
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
  };
}

describe('usePlanWorkers', () => {
  it('starts with workers=[] and a callable loadWorkers', async () => {
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
    const setSelected = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: '', setSelected, setError }),
    );
    expect(Array.isArray(result.current.workers)).toBe(true);
    expect(result.current.workers).toEqual([]);
    expect(typeof result.current.loadWorkers).toBe('function');
  });

  it('loads workers on mount from /api/list and populates state', async () => {
    const workers = [makeWorker('w1'), makeWorker('w2')];
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers,
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const setSelected = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: 'w1', setSelected, setError }),
    );
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(2);
    });
    expect(result.current.workers[0]?.name).toBe('w1');
    expect(result.current.workers[1]?.name).toBe('w2');
  });

  it('auto-selects the first worker when selected is empty', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('first'), makeWorker('second')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    renderHook(() =>
      usePlanWorkers({ selected: '', setSelected, setError }),
    );
    await waitFor(() => {
      expect(setSelected).toHaveBeenCalledWith('first');
    });
  });

  it('does NOT auto-select when something is already selected', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('a'), makeWorker('b')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: 'already-set', setSelected, setError }),
    );
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(2);
    });
    expect(setSelected).not.toHaveBeenCalled();
  });

  it('does NOT auto-select when the worker list is empty', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
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
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: '', setSelected, setError }),
    );
    await waitFor(() => {
      expect(Array.isArray(result.current.workers)).toBe(true);
    });
    expect(setSelected).not.toHaveBeenCalled();
  });

  it('defaults to [] when /api/list returns a non-array workers field', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: null,
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const setSelected = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: 'x', setSelected, setError }),
    );
    await waitFor(() => {
      expect(result.current.workers).toEqual([]);
    });
  });

  it('forwards the HTTP error message via setError on a 5xx response', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    renderHook(() =>
      usePlanWorkers({ selected: '', setSelected, setError }),
    );
    await waitFor(() => {
      expect(setError).toHaveBeenCalled();
    });
    const arg = setError.mock.calls[0]![0] as string;
    expect(arg).toContain('HTTP 500');
  });

  it('manual loadWorkers refetch picks up a fresh /api/list response', async () => {
    let count = 0;
    server.use(
      http.get('/api/list', () => {
        count++;
        return HttpResponse.json({
          workers:
            count === 1
              ? [makeWorker('a')]
              : [makeWorker('a'), makeWorker('b')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        });
      }),
    );
    const setSelected = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: 'a', setSelected, setError }),
    );
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(1);
    });
    await act(async () => {
      await result.current.loadWorkers();
    });
    expect(result.current.workers).toHaveLength(2);
  });

  it('setError is NOT called on a happy /api/list response', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('only')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: 'only', setSelected, setError }),
    );
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(1);
    });
    expect(setError).not.toHaveBeenCalled();
  });

  it('loadWorkers resolves (does not reject) when /api/list returns a 4xx', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 }),
      ),
    );
    const setSelected = vi.fn();
    const setError = vi.fn();
    const { result } = renderHook(() =>
      usePlanWorkers({ selected: '', setSelected, setError }),
    );
    // Should not throw / reject — error path drains via setError instead.
    await expect(result.current.loadWorkers()).resolves.toBeUndefined();
  });

  it('a rerender with a new selected prop still hits the auto-select branch only when empty', async () => {
    const setSelected = vi.fn();
    const setError = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha'), makeWorker('beta')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string }) =>
        usePlanWorkers({ selected, setSelected, setError }),
      { initialProps: { selected: 'already' } },
    );
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(2);
    });
    expect(setSelected).not.toHaveBeenCalled();
    // Rerender with empty selected and manually refresh — this time it
    // should auto-select the first worker.
    rerender({ selected: '' });
    await act(async () => {
      await result.current.loadWorkers();
    });
    expect(setSelected).toHaveBeenCalledWith('alpha');
  });
});
