import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkerSelection } from './use-worker-selection';
import type { Worker } from '../types';

// useWorkerSelection owns the multi-select + batch driver for the
// ControlPanel sidebar:
//   - selected Set of worker names with toggleSelected / selectAll
//     (Set built from workers prop on every call) / clearSelection
//   - runBatch(kind): no-op when selected is empty; else gates on
//     window.confirm with controlPanel.batch.confirmClose|Cancel.
//     For each name posts to /api/close or /api/cancel via postAction,
//     collects { name, ok, error } into batchResults, fires a success
//     or error toast based on okCount/failCount totals, then refreshes
//     via fetchList(). Close also clears the selection on success.
//   - batchBusy flips to kind while the loop runs, back to null when
//     done.

afterEach(() => {
  vi.restoreAllMocks();
});

function makeWorker(name: string, overrides: Partial<Worker> = {}): Worker {
  return {
    name,
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
    ...overrides,
  };
}

type HookArgs = Parameters<typeof useWorkerSelection>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    workers: [makeWorker('w1'), makeWorker('w2'), makeWorker('w3')],
    showToast: vi.fn(),
    fetchList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useWorkerSelection', () => {
  it('mounts idle: selected=empty Set, batchBusy=null, batchResults=null, callbacks exposed', () => {
    const { result } = renderHook(() => useWorkerSelection(makeArgs()));
    expect(result.current.selected.size).toBe(0);
    expect(result.current.batchBusy).toBeNull();
    expect(result.current.batchResults).toBeNull();
    expect(typeof result.current.toggleSelected).toBe('function');
    expect(typeof result.current.selectAll).toBe('function');
    expect(typeof result.current.clearSelection).toBe('function');
    expect(typeof result.current.runBatch).toBe('function');
  });

  it('toggleSelected adds the name when absent and removes it when present', () => {
    const { result } = renderHook(() => useWorkerSelection(makeArgs()));
    act(() => {
      result.current.toggleSelected('w1');
    });
    expect(result.current.selected.has('w1')).toBe(true);
    act(() => {
      result.current.toggleSelected('w2');
    });
    expect([...result.current.selected].sort()).toEqual(['w1', 'w2']);
    act(() => {
      result.current.toggleSelected('w1');
    });
    expect(result.current.selected.has('w1')).toBe(false);
    expect(result.current.selected.has('w2')).toBe(true);
  });

  it('selectAll seeds the selection from the current workers prop', () => {
    const args = makeArgs({
      workers: [makeWorker('a'), makeWorker('b'), makeWorker('c')],
    });
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.selectAll();
    });
    expect([...result.current.selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('clearSelection empties the set', () => {
    const { result } = renderHook(() => useWorkerSelection(makeArgs()));
    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selected.size).toBe(3);
    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selected.size).toBe(0);
  });

  it('runBatch with empty selection short-circuits: no confirm, no POST, no toast, no fetchList', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/close', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    await act(async () => {
      await result.current.runBatch('close');
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(args.fetchList).not.toHaveBeenCalled();
    expect(result.current.batchBusy).toBeNull();
  });

  it('runBatch with confirm=false short-circuits before batchBusy flips and before any POST', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/close', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
      result.current.toggleSelected('w2');
    });
    await act(async () => {
      await result.current.runBatch('close');
    });
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(args.fetchList).not.toHaveBeenCalled();
    expect(result.current.batchBusy).toBeNull();
  });

  it('runBatch close happy path: POSTs /api/close per name, success toast, fetchList, selection cleared', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const seen: Array<{ path: string; body: unknown }> = [];
    server.use(
      http.post('/api/close', async ({ request }) => {
        seen.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
      result.current.toggleSelected('w2');
    });
    await act(async () => {
      await result.current.runBatch('close');
    });
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s.path === '/api/close')).toBe(true);
    expect(seen.map((s) => s.body)).toEqual([
      { name: 'w1' },
      { name: 'w2' },
    ]);
    const [, toastKind] = (args.showToast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(toastKind).toBe('success');
    expect(args.fetchList).toHaveBeenCalledTimes(1);
    expect(result.current.selected.size).toBe(0);
    expect(result.current.batchBusy).toBeNull();
    expect(result.current.batchResults).toEqual([
      { name: 'w1', ok: true, error: undefined },
      { name: 'w2', ok: true, error: undefined },
    ]);
  });

  it('runBatch cancel happy path: POSTs to /api/cancel and KEEPS the selection (close-only clear)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const paths: string[] = [];
    server.use(
      http.post('/api/cancel', async ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
    });
    await act(async () => {
      await result.current.runBatch('cancel');
    });
    expect(paths).toEqual(['/api/cancel']);
    expect(result.current.selected.has('w1')).toBe(true);
    expect(args.fetchList).toHaveBeenCalledTimes(1);
  });

  it('runBatch mixed results: collects per-name outcomes and fires an error toast when any fail', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/close', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        if (body.name === 'w2') {
          return HttpResponse.json({ error: 'busy' }, { status: 503 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
      result.current.toggleSelected('w2');
    });
    await act(async () => {
      await result.current.runBatch('close');
    });
    const outcomes = result.current.batchResults || [];
    const byName = Object.fromEntries(outcomes.map((o) => [o.name, o]));
    expect(byName['w1']?.ok).toBe(true);
    expect(byName['w2']?.ok).toBe(false);
    expect(byName['w2']?.error).toBe('busy');
    const [, kind] = (args.showToast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(kind).toBe('error');
  });

  it('runBatch 2xx + { error } body: surfaces the daemon no-op error per-name (postAction shape)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/close', () =>
        HttpResponse.json({ error: 'already-closed' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
    });
    await act(async () => {
      await result.current.runBatch('close');
    });
    expect(result.current.batchResults?.[0]).toEqual({
      name: 'w1',
      ok: false,
      error: 'already-closed',
    });
    const [, kind] = (args.showToast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(kind).toBe('error');
  });

  it('runBatch flips batchBusy to the kind during the run and back to null on completion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/close', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
    });
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.runBatch('close');
    });
    await waitFor(() => {
      expect(result.current.batchBusy).toBe('close');
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.batchBusy).toBeNull();
  });

  it('runBatch resets batchResults to null at the start of a new run', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/close', () => HttpResponse.json({ ok: true })),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerSelection(args));
    act(() => {
      result.current.toggleSelected('w1');
    });
    await act(async () => {
      await result.current.runBatch('close');
    });
    expect(result.current.batchResults).not.toBeNull();
    act(() => {
      result.current.toggleSelected('w2');
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/close', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.runBatch('close');
    });
    await waitFor(() => {
      expect(result.current.batchResults).toBeNull();
    });
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('toggleSelected callback identity is stable across re-renders (empty deps)', () => {
    const { result, rerender } = renderHook(() => useWorkerSelection(makeArgs()));
    const first = result.current.toggleSelected;
    rerender();
    expect(result.current.toggleSelected).toBe(first);
  });

  it('selectAll callback identity changes when the workers prop changes (workers dep)', () => {
    const { result, rerender } = renderHook(
      ({ workers }: { workers: Worker[] }) =>
        useWorkerSelection({
          workers,
          showToast: vi.fn(),
          fetchList: vi.fn().mockResolvedValue(undefined),
        }),
      { initialProps: { workers: [makeWorker('a')] } },
    );
    const first = result.current.selectAll;
    rerender({ workers: [makeWorker('a'), makeWorker('b')] });
    expect(result.current.selectAll).not.toBe(first);
  });
});
