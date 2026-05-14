import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { usePlanDispatch } from './use-plan-dispatch';
import type { PlanResponse } from './use-plan-content';

// usePlanDispatch owns two related flows that share a single
// `dispatching` busy slot:
//   - dispatchPlan(): POST /api/plan with the inline task and
//     forward branch/output when set. Surfaces r.error via
//     setError + a plan.toast.dispatchFailed toast; on success
//     fires plan.toast.dispatched and refetches via loadPlan().
//     Validation: empty selected OR blank task short-circuits with
//     plan.error.selectWorker via setError (no POST, no toast).
//   - redispatch(): POST /api/task with the saved plan content
//     under useBranch=true. Gated by window.confirm -- a false
//     answer short-circuits before busy flips. Toasts are routed
//     through plan.toast.taskDispatched / .taskDispatchFailed.
//     A throw still funnels into the dispatchFailed toast.
// busy-gate: dispatching flips true while in flight on both
// flows, back to false on every exit branch including the early
// returns from validation / confirm cancel (which never flip it).

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(overrides: Partial<Parameters<typeof usePlanDispatch>[0]> = {}) {
  const setError = vi.fn();
  const showToast = vi.fn();
  const loadPlan = vi.fn().mockResolvedValue(undefined);
  return {
    selected: 'w1',
    task: 'do a thing',
    branch: '',
    output: '',
    plan: null as PlanResponse | null,
    setError,
    showToast,
    loadPlan,
    ...overrides,
  };
}

describe('usePlanDispatch', () => {
  it('mounts idle: dispatching=false, both callbacks are functions', () => {
    const args = makeArgs();
    const { result } = renderHook(() => usePlanDispatch(args));
    expect(result.current.dispatching).toBe(false);
    expect(typeof result.current.dispatchPlan).toBe('function');
    expect(typeof result.current.redispatch).toBe('function');
  });

  it('dispatchPlan: empty selected sets plan.error.selectWorker via setError, no POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/plan', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs({ selected: '' });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    expect(args.setError).toHaveBeenCalledWith('Select a worker and enter a task.');
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(args.loadPlan).not.toHaveBeenCalled();
    expect(result.current.dispatching).toBe(false);
  });

  it('dispatchPlan: whitespace-only task short-circuits with setError, no POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/plan', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const args = makeArgs({ task: '   ' });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    expect(args.setError).toHaveBeenCalledWith('Select a worker and enter a task.');
    expect(calls).toBe(0);
    expect(args.loadPlan).not.toHaveBeenCalled();
  });

  it('dispatchPlan happy path: POSTs minimal body {name, task} when branch/output blank', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/plan', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ name: 'w1', content: '# plan' });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    expect(body).toEqual({ name: 'w1', task: 'do a thing' });
    expect(args.setError).toHaveBeenNthCalledWith(1, null);
    expect(args.showToast).toHaveBeenCalledWith(
      expect.stringContaining('Planner dispatched'),
      'success',
    );
    expect(args.loadPlan).toHaveBeenCalledTimes(1);
    expect(result.current.dispatching).toBe(false);
  });

  it('dispatchPlan: includes branch + output in the POST body when set', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/plan', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ name: 'w1' });
      }),
    );
    const args = makeArgs({ branch: 'c4/feat', output: 'docs/plan.md' });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    expect(body).toEqual({
      name: 'w1',
      task: 'do a thing',
      branch: 'c4/feat',
      output: 'docs/plan.md',
    });
  });

  it('dispatchPlan envelope error: sets error, fires dispatchFailed toast, skips loadPlan', async () => {
    server.use(
      http.post('/api/plan', () =>
        HttpResponse.json({ error: 'no planner free' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    expect(args.setError).toHaveBeenCalledWith('no planner free');
    expect(args.showToast).toHaveBeenCalledWith(
      'Plan dispatch failed: no planner free',
      'error',
    );
    expect(args.loadPlan).not.toHaveBeenCalled();
    expect(result.current.dispatching).toBe(false);
  });

  it('dispatchPlan thrown path: 500 surfaces e.message via setError, no toast, no loadPlan', async () => {
    server.use(
      http.post('/api/plan', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.dispatchPlan();
    });
    const lastError = args.setError.mock.calls.at(-1)?.[0] as string;
    expect(lastError).toMatch(/HTTP 500/);
    expect(args.loadPlan).not.toHaveBeenCalled();
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.dispatching).toBe(false);
  });

  it('dispatchPlan flips dispatching=true while inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/plan', async () => {
        await gate;
        return HttpResponse.json({ name: 'w1' });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => usePlanDispatch(args));
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.dispatchPlan();
    });
    await waitFor(() => {
      expect(result.current.dispatching).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch: short-circuits when plan is null (no confirm, no POST)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/task', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const args = makeArgs({ plan: null });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch: short-circuits when plan.content is empty', async () => {
    let calls = 0;
    server.use(
      http.post('/api/task', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const args = makeArgs({ plan: { name: 'w1', content: '' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls).toBe(0);
  });

  it('redispatch: short-circuits when selected is empty', async () => {
    let calls = 0;
    server.use(
      http.post('/api/task', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const args = makeArgs({
      selected: '',
      plan: { name: 'w1', content: '# plan' },
    });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(calls).toBe(0);
  });

  it('redispatch: window.confirm=false short-circuits before busy flip and POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/task', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const args = makeArgs({ plan: { name: 'w1', content: '# plan' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch happy path: POSTs {name, task: plan.content, useBranch: true} + success toast', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/task', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs({ plan: { name: 'w1', content: '# plan body' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(body).toEqual({
      name: 'w1',
      task: '# plan body',
      useBranch: true,
    });
    expect(args.showToast).toHaveBeenCalledWith(
      'Plan dispatched as task to w1',
      'success',
    );
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch envelope error: fires taskDispatchFailed toast, dispatching back to false', async () => {
    server.use(
      http.post('/api/task', () =>
        HttpResponse.json({ error: 'no slots free' }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs({ plan: { name: 'w1', content: '# plan body' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    expect(args.showToast).toHaveBeenCalledWith(
      'Task dispatch failed: no slots free',
      'error',
    );
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch thrown path: 500 funnels into taskDispatchFailed toast with HTTP message', async () => {
    server.use(
      http.post('/api/task', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs({ plan: { name: 'w1', content: '# plan body' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    const arg = args.showToast.mock.calls[0]?.[0] as string;
    expect(arg).toMatch(/^Task dispatch failed: /);
    expect(arg).toMatch(/HTTP 500/);
    expect(args.showToast.mock.calls[0]?.[1]).toBe('error');
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch flips dispatching=true while inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/task', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs({ plan: { name: 'w1', content: '# plan body' } });
    const { result } = renderHook(() => usePlanDispatch(args));
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.redispatch();
    });
    await waitFor(() => {
      expect(result.current.dispatching).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.dispatching).toBe(false);
  });

  it('redispatch confirm message includes the selected worker name', async () => {
    server.use(
      http.post('/api/task', () => HttpResponse.json({ ok: true })),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const args = makeArgs({
      selected: 'demo-3',
      plan: { name: 'demo-3', content: '# plan' },
    });
    const { result } = renderHook(() => usePlanDispatch(args));
    await act(async () => {
      await result.current.redispatch();
    });
    const msg = confirmSpy.mock.calls[0]?.[0] as string;
    expect(msg).toContain('demo-3');
  });

  it('dispatchPlan identity changes when selected/task/branch/output mutate', () => {
    const setError = vi.fn();
    const showToast = vi.fn();
    const loadPlan = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({
        selected,
        task,
        branch,
        output,
      }: {
        selected: string;
        task: string;
        branch: string;
        output: string;
      }) =>
        usePlanDispatch({
          selected,
          task,
          branch,
          output,
          plan: null,
          setError,
          showToast,
          loadPlan,
        }),
      { initialProps: { selected: 'w1', task: 't1', branch: '', output: '' } },
    );
    const first = result.current.dispatchPlan;
    rerender({ selected: 'w1', task: 't1', branch: '', output: '' });
    expect(result.current.dispatchPlan).toBe(first);
    rerender({ selected: 'w2', task: 't1', branch: '', output: '' });
    expect(result.current.dispatchPlan).not.toBe(first);
  });
});
