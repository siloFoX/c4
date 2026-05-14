import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSwarm } from './use-swarm';
import type { Worker } from '../types';

// useSwarm couples two fetches:
//   1. /api/list to populate the worker dropdown and auto-select
//      the first worker when nothing is selected yet.
//   2. /api/swarm?name=<selected> to load the tree, re-runs on
//      every `selected` flip.
// Shared loading + error flags cover both calls. `refresh` re-runs
// the swarm fetch only -- the list itself is stable enough that
// operators do not need a manual trigger for it.

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

describe('useSwarm', () => {
  it('mounts idle: workers=[], selected="", data=null, loading=false, error=null', () => {
    // Block /api/list so the effect cannot resolve before the assertion.
    const gate = new Promise<HttpResponse>(() => {});
    server.use(
      http.get('/api/list', async () => gate),
      http.get('/api/swarm', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useSwarm());
    expect(result.current.workers).toEqual([]);
    expect(result.current.selected).toBe('');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.setSelected).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('loads workers and auto-selects the first one', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha'), makeWorker('beta')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () =>
        HttpResponse.json({ root: { name: 'alpha' } }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => {
      expect(result.current.workers).toHaveLength(2);
    });
    await waitFor(() => expect(result.current.selected).toBe('alpha'));
  });

  it('does not auto-select when /api/list returns no workers', async () => {
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
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => {
      expect(result.current.workers).toEqual([]);
    });
    expect(result.current.selected).toBe('');
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
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.workers).toEqual([]));
    expect(result.current.selected).toBe('');
  });

  it('surfaces HTTP error from /api/list via the shared error slot', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'no daemon' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toMatch(/HTTP 500/);
  });

  it('loads the swarm tree for the selected worker and clears loading', async () => {
    let swarmUrl = '';
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', ({ request }) => {
        swarmUrl = request.url;
        return HttpResponse.json({ root: { name: 'alpha', status: 'idle' } });
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(swarmUrl).toContain('/api/swarm?name=alpha');
    expect(result.current.data?.root?.name).toBe('alpha');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('URL-encodes the worker name in the swarm query string', async () => {
    let swarmUrl = '';
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('a/b c')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', ({ request }) => {
        swarmUrl = request.url;
        return HttpResponse.json({ root: { name: 'a/b c' } });
      }),
    );
    renderHook(() => useSwarm());
    await waitFor(() => {
      expect(swarmUrl).toContain('a%2Fb%20c');
    });
  });

  it('swarm envelope error: sets error, blanks data', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () =>
        HttpResponse.json({ error: 'no tree available' }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.error).toBe('no tree available'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('swarm HTTP 500 sets error to e.message and blanks data', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('flips loading=true around an in-flight swarm fetch then back to false', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', async () => {
        await gate;
        return HttpResponse.json({ root: { name: 'alpha' } });
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loading).toBe(true));
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.root?.name).toBe('alpha');
  });

  it('setSelected triggers a fresh /api/swarm fetch for the new name', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha'), makeWorker('beta')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') || '';
        seen.push(name);
        return HttpResponse.json({ root: { name } });
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.data?.root?.name).toBe('alpha'));
    act(() => {
      result.current.setSelected('beta');
    });
    await waitFor(() => expect(result.current.data?.root?.name).toBe('beta'));
    expect(seen).toEqual(['alpha', 'beta']);
  });

  it('refresh() re-runs the swarm fetch only (no extra /api/list call)', async () => {
    let listCalls = 0;
    let swarmCalls = 0;
    server.use(
      http.get('/api/list', () => {
        listCalls++;
        return HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        });
      }),
      http.get('/api/swarm', () => {
        swarmCalls++;
        return HttpResponse.json({ root: { name: 'alpha', status: `s-${swarmCalls}` } });
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.data?.root?.status).toBe('s-1'));
    const listBefore = listCalls;
    const swarmBefore = swarmCalls;
    await act(async () => {
      await result.current.refresh();
    });
    // refresh exposes loadSwarm only -- /api/list must not be re-hit.
    expect(listCalls).toBe(listBefore);
    expect(swarmCalls).toBe(swarmBefore + 1);
    expect(result.current.data?.root?.status).toBe(`s-${swarmCalls}`);
  });

  it('refresh() short-circuits when no worker is selected (no fetch)', async () => {
    let swarmCalls = 0;
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () => {
        swarmCalls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.workers).toEqual([]));
    await act(async () => {
      await result.current.refresh();
    });
    expect(swarmCalls).toBe(0);
  });

  it('refresh() clears stale error on a fresh success', async () => {
    let swarmCalls = 0;
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () => {
        swarmCalls++;
        if (swarmCalls === 1) {
          return HttpResponse.json({ error: 'first' });
        }
        return HttpResponse.json({ root: { name: 'alpha' } });
      }),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.error).toBe('first'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data?.root?.name).toBe('alpha');
  });

  it('setSelected to "" leaves data untouched (loadSwarm short-circuits)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () =>
        HttpResponse.json({ root: { name: 'alpha' } }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.data?.root?.name).toBe('alpha'));
    act(() => {
      result.current.setSelected('');
    });
    // Data slot is intentionally left as the last successful read so the
    // page does not flash empty when the operator clears the dropdown.
    expect(result.current.data?.root?.name).toBe('alpha');
  });

  it('refresh identity changes when selected changes (useCallback dep)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('alpha'), makeWorker('beta')],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () =>
        HttpResponse.json({ root: { name: 'x' } }),
      ),
    );
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.selected).toBe('alpha'));
    const first = result.current.refresh;
    act(() => {
      result.current.setSelected('beta');
    });
    await waitFor(() => expect(result.current.selected).toBe('beta'));
    expect(result.current.refresh).not.toBe(first);
  });

  it('does not call /api/swarm when no worker is selected (initial state)', async () => {
    let swarmCalls = 0;
    const setSelectedSpy = vi.fn();
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [],
          queuedTasks: [],
          lostWorkers: [],
          lastHealthCheck: null,
        }),
      ),
      http.get('/api/swarm', () => {
        swarmCalls++;
        setSelectedSpy();
        return HttpResponse.json({});
      }),
    );
    renderHook(() => useSwarm());
    await new Promise((r) => setTimeout(r, 10));
    expect(swarmCalls).toBe(0);
  });
});
