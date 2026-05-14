import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useValidations } from './use-validations';

// useValidations owns the Validation page state:
//   - mount + refresh: GET /api/list -> setWorkers, then fan-out
//     /api/validation?name=<worker> in parallel via Promise.all
//     for every worker in the list.
//   - Per-worker failures surface as { error: <message> } entries
//     in the validations map (mapped from the catch branch) rather
//     than aborting the entire sweep -- one broken worker should
//     not blank the rest of the table.
//   - /api/list failure surfaces via the shared error slot; the
//     fan-out is skipped and workers / validations stay as they
//     were (typically the initial [] / {}).
//   - Non-array workers field on /api/list defaults to [] so a
//     malformed payload does not throw in .map().
//   - loading flips true while either phase runs and back to false
//     after Promise.all settles.
//   - refresh is useCallback([]); identity is stable across renders.

afterEach(() => {
  vi.restoreAllMocks();
});

function makeWorker(name: string) {
  return {
    name,
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scope: false,
    pid: null,
    status: 'idle' as const,
    unreadSnapshots: 0,
    totalSnapshots: 0,
    intervention: null,
    lastQuestion: null,
    errorCount: 0,
    phase: null,
    testFailCount: 0,
  };
}

describe('useValidations', () => {
  it('mounts loading=true with workers=[], validations={}, error=null', () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ workers: [], queuedTasks: [], lostWorkers: [] }),
      ),
    );
    const { result } = renderHook(() => useValidations());
    expect(result.current.loading).toBe(true);
    expect(result.current.workers).toEqual([]);
    expect(result.current.validations).toEqual({});
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe('function');
  });

  it('happy path: lists workers + fans-out one /api/validation per worker name', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('w1'), makeWorker('w2')],
          queuedTasks: [],
          lostWorkers: [],
        }),
      ),
      http.get('/api/validation', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') ?? '';
        seen.push(name);
        return HttpResponse.json({
          name,
          tests: { passed: 3, failed: 0, ok: true },
          typecheck: { ok: true, errors: 0 },
          lint: { ok: true, errors: 0, warnings: 0 },
        });
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(seen.sort()).toEqual(['w1', 'w2']);
    expect(result.current.workers.map((w) => w.name)).toEqual(['w1', 'w2']);
    expect(result.current.validations['w1']?.tests?.passed).toBe(3);
    expect(result.current.validations['w2']?.typecheck?.ok).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('per-worker validation HTTP error surfaces as { error } entry, sweep continues', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('w1'), makeWorker('w2')],
          queuedTasks: [],
          lostWorkers: [],
        }),
      ),
      http.get('/api/validation', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') ?? '';
        if (name === 'w1') {
          return HttpResponse.json({ error: 'broken' }, { status: 500 });
        }
        return HttpResponse.json({ name, tests: { passed: 5 } });
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.validations['w1']?.error).toMatch(/HTTP 500/);
    expect(result.current.validations['w2']?.tests?.passed).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it('/api/list HTTP error surfaces via top-level error, no validation fan-out', async () => {
    let validationCalls = 0;
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      http.get('/api/validation', () => {
        validationCalls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(validationCalls).toBe(0);
    expect(result.current.workers).toEqual([]);
    expect(result.current.validations).toEqual({});
  });

  it('non-array workers field on /api/list defaults to [] (defensive)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: 'not-an-array',
          queuedTasks: [],
          lostWorkers: [],
        }),
      ),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workers).toEqual([]);
    expect(result.current.validations).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('worker names with special chars are URL-encoded in the validation query', async () => {
    let capturedUrl: string | null = null;
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('auto/w 1')],
          queuedTasks: [],
          lostWorkers: [],
        }),
      ),
      http.get('/api/validation', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(capturedUrl).toContain('name=auto%2Fw%201');
  });

  it('refresh() re-fires /api/list AND the validation fan-out', async () => {
    let listCalls = 0;
    let validationCalls = 0;
    server.use(
      http.get('/api/list', () => {
        listCalls++;
        return HttpResponse.json({
          workers: [makeWorker('w1')],
          queuedTasks: [],
          lostWorkers: [],
        });
      }),
      http.get('/api/validation', () => {
        validationCalls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listCalls).toBe(1);
    expect(validationCalls).toBe(1);
    await act(async () => {
      await result.current.refresh();
    });
    expect(listCalls).toBe(2);
    expect(validationCalls).toBe(2);
  });

  it('refresh() clears the stale error slot on success', async () => {
    let listCalls = 0;
    server.use(
      http.get('/api/list', () => {
        listCalls++;
        return listCalls === 1
          ? HttpResponse.json({ error: 'down' }, { status: 500 })
          : HttpResponse.json({ workers: [], queuedTasks: [], lostWorkers: [] });
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/HTTP 500/);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
  });

  it('loading flips true while inflight and false after fan-out settles', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.get('/api/list', async () => {
        await gate;
        return HttpResponse.json({
          workers: [makeWorker('w1')],
          queuedTasks: [],
          lostWorkers: [],
        });
      }),
      http.get('/api/validation', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useValidations());
    expect(result.current.loading).toBe(true);
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('refresh callback identity is stable across re-renders (empty deps)', async () => {
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ workers: [], queuedTasks: [], lostWorkers: [] }),
      ),
    );
    const { result, rerender } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('empty workers list: no validation fan-out, validations stays {}', async () => {
    let validationCalls = 0;
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({ workers: [], queuedTasks: [], lostWorkers: [] }),
      ),
      http.get('/api/validation', () => {
        validationCalls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(validationCalls).toBe(0);
    expect(result.current.validations).toEqual({});
  });

  it('parallel fan-out: 3 workers all populate before loading flips to false', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/list', () =>
        HttpResponse.json({
          workers: [makeWorker('a'), makeWorker('b'), makeWorker('c')],
          queuedTasks: [],
          lostWorkers: [],
        }),
      ),
      http.get('/api/validation', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') ?? '';
        seen.push(name);
        return HttpResponse.json({ name, tests: { passed: 1 } });
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(seen.sort()).toEqual(['a', 'b', 'c']);
    expect(Object.keys(result.current.validations).sort()).toEqual(['a', 'b', 'c']);
  });

  it('refresh after a worker is added picks up the new worker in the fan-out', async () => {
    let listCalls = 0;
    server.use(
      http.get('/api/list', () => {
        listCalls++;
        const workers = listCalls === 1
          ? [makeWorker('w1')]
          : [makeWorker('w1'), makeWorker('w2')];
        return HttpResponse.json({ workers, queuedTasks: [], lostWorkers: [] });
      }),
      http.get('/api/validation', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') ?? '';
        return HttpResponse.json({ name, tests: { passed: 1 } });
      }),
    );
    const { result } = renderHook(() => useValidations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.validations)).toEqual(['w1']);
    await act(async () => {
      await result.current.refresh();
    });
    expect(Object.keys(result.current.validations).sort()).toEqual(['w1', 'w2']);
  });
});
