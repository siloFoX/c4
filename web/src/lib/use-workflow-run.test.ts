import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkflowRun } from './use-workflow-run';
import type { WorkflowRun } from '../components/WorkflowEditor';

function makeRun(id: string, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    workflowId: 'wf1',
    status: 'completed',
    startedAt: '2026-05-11T00:00:00.000Z',
    completedAt: '2026-05-11T00:01:00.000Z',
    inputs: {},
    nodeResults: {},
    ...overrides,
  };
}

function makeArgs(
  overrides: Partial<Parameters<typeof useWorkflowRun>[0]> = {},
): Parameters<typeof useWorkflowRun>[0] {
  return {
    selectedId: 'wf1',
    setRuns: vi.fn(),
    setBusy: vi.fn(),
    setError: vi.fn(),
    ...overrides,
  };
}

describe('useWorkflowRun', () => {
  it('starts idle: inputsOpen=false, inputsJson="{}", inputsError=null', () => {
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    expect(result.current.inputsOpen).toBe(false);
    expect(result.current.inputsJson).toBe('{}');
    expect(result.current.inputsError).toBeNull();
  });

  it('toggleInputs() flips inputsOpen', () => {
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    expect(result.current.inputsOpen).toBe(true);
    act(() => result.current.toggleInputs());
    expect(result.current.inputsOpen).toBe(false);
  });

  it('setInputsJson updates the draft JSON string', () => {
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.setInputsJson('{"x":1}'));
    expect(result.current.inputsJson).toBe('{"x":1}');
  });

  it('handleRun is a no-op when selectedId is null (no fetch, no setBusy)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ selectedId: null });
    const { result } = renderHook(() => useWorkflowRun(args));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(calls).toBe(0);
    expect(args.setBusy).not.toHaveBeenCalled();
    expect(args.setRuns).not.toHaveBeenCalled();
  });

  it('POSTs { inputs: {} } and re-fetches runs on the happy path (inputsOpen=false)', async () => {
    let body: unknown = null;
    let postUrl = '';
    let runsUrl = '';
    server.use(
      http.post('/api/workflows/:id/run', async ({ request }) => {
        body = await request.json();
        postUrl = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/workflows/:id/runs', ({ request }) => {
        runsUrl = new URL(request.url).pathname;
        return HttpResponse.json({
          workflowId: 'wf1',
          runs: [makeRun('latest')],
          count: 1,
        });
      }),
    );
    const args = makeArgs({ selectedId: 'wf1' });
    const { result } = renderHook(() => useWorkflowRun(args));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(body).toEqual({ inputs: {} });
    expect(postUrl).toBe('/api/workflows/wf1/run');
    expect(runsUrl).toBe('/api/workflows/wf1/runs');
    expect(args.setRuns).toHaveBeenCalledWith([expect.objectContaining({ id: 'latest' })]);
    expect(args.setError).not.toHaveBeenCalled();
  });

  it('POSTs the parsed inputsJson as { inputs } when inputsOpen=true', async () => {
    let body: { inputs?: unknown } | null = null;
    server.use(
      http.post('/api/workflows/:id/run', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('{"alpha":1,"beta":"two"}'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(body?.inputs).toEqual({ alpha: 1, beta: 'two' });
  });

  it('URL-encodes the selectedId with encodeURIComponent on both POST and GET', async () => {
    let postUrl = '';
    let runsUrl = '';
    server.use(
      http.post('/api/workflows/:id/run', ({ request }) => {
        postUrl = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/workflows/:id/runs', ({ request }) => {
        runsUrl = new URL(request.url).pathname;
        return HttpResponse.json({ workflowId: 'a/b c', runs: [], count: 0 });
      }),
    );
    const { result } = renderHook(() =>
      useWorkflowRun(makeArgs({ selectedId: 'a/b c' })),
    );
    await act(async () => {
      await result.current.handleRun();
    });
    expect(postUrl).toBe('/api/workflows/a%2Fb%20c/run');
    expect(runsUrl).toBe('/api/workflows/a%2Fb%20c/runs');
  });

  it('rejects invalid JSON when inputsOpen=true: sets inputsError, no fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowRun(args));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('{ not: json'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.inputsError).toBeTruthy();
    expect(calls).toBe(0);
    expect(args.setBusy).not.toHaveBeenCalled();
    expect(args.setRuns).not.toHaveBeenCalled();
  });

  it('rejects a JSON null payload (inputsOpen=true): inputsError set, no fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('null'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.inputsError).toBeTruthy();
    expect(calls).toBe(0);
  });

  it('rejects a JSON array payload (inputsOpen=true): inputsError set, no fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('[1,2,3]'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.inputsError).toBeTruthy();
    expect(calls).toBe(0);
  });

  it('rejects a JSON primitive (inputsOpen=true): inputsError set, no fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('42'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.inputsError).toBeTruthy();
    expect(calls).toBe(0);
  });

  it('does NOT validate inputsJson when inputsOpen=false (garbage JSON is ignored)', async () => {
    let body: { inputs?: unknown } | null = null;
    server.use(
      http.post('/api/workflows/:id/run', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    // inputsOpen remains false — even invalid JSON in the draft is irrelevant.
    act(() => result.current.setInputsJson('not json at all'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(body?.inputs).toEqual({});
    expect(result.current.inputsError).toBeNull();
  });

  it('surfaces setError on POST failure and skips the runs refetch', async () => {
    let runsCalls = 0;
    server.use(
      http.post('/api/workflows/:id/run', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
      http.get('/api/workflows/:id/runs', () => {
        runsCalls++;
        return HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowRun(args));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(args.setError).toHaveBeenCalled();
    const lastErr = (args.setError as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(lastErr).toBeTruthy();
    expect(runsCalls).toBe(0);
    expect(args.setRuns).not.toHaveBeenCalled();
  });

  it('surfaces setError when the runs refetch fails after a successful POST', async () => {
    server.use(
      http.post('/api/workflows/:id/run', () => HttpResponse.json({ ok: true })),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkflowRun(args));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(args.setError).toHaveBeenCalled();
    expect(args.setRuns).not.toHaveBeenCalled();
  });

  it('flips setBusy(true) before the POST and setBusy(false) after settle (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.post('/api/workflows/:id/run', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const args = makeArgs();
    const setBusy = args.setBusy as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useWorkflowRun(args));
    let runPromise: Promise<void> = Promise.resolve();
    act(() => { runPromise = result.current.handleRun(); });
    await waitFor(() => {
      expect(setBusy).toHaveBeenCalledWith(true);
    });
    // Still gated — the final setBusy(false) hasn't fired yet.
    expect(setBusy.mock.calls.filter((c) => c[0] === false)).toHaveLength(0);
    release();
    await act(async () => { await runPromise; });
    expect(setBusy.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it('clears inputsError on the next handleRun() invocation that gets past validation', async () => {
    server.use(
      http.post('/api/workflows/:id/run', () => HttpResponse.json({ ok: true })),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const { result } = renderHook(() => useWorkflowRun(makeArgs()));
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('not json'));
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.inputsError).toBeTruthy();
    act(() => result.current.setInputsJson('{"ok":1}'));
    await act(async () => { await result.current.handleRun(); });
    expect(result.current.inputsError).toBeNull();
  });

  it('resets inputsOpen / inputsJson / inputsError when selectedId changes', async () => {
    server.use(
      http.post('/api/workflows/:id/run', () => HttpResponse.json({ ok: true })),
      http.get('/api/workflows/:id/runs', () =>
        HttpResponse.json({ workflowId: 'wf1', runs: [], count: 0 }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useWorkflowRun(makeArgs({ selectedId: id })),
      { initialProps: { id: 'wf1' as string | null } },
    );
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('{"keep":true}'));
    act(() => result.current.toggleInputs()); // back to closed... reverse next:
    act(() => result.current.toggleInputs()); // open again so we see the reset clearly
    expect(result.current.inputsOpen).toBe(true);
    expect(result.current.inputsJson).toBe('{"keep":true}');
    rerender({ id: 'wf2' });
    expect(result.current.inputsOpen).toBe(false);
    expect(result.current.inputsJson).toBe('{}');
    expect(result.current.inputsError).toBeNull();
  });

  it('also resets when selectedId flips to null (workflow deselected)', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useWorkflowRun(makeArgs({ selectedId: id })),
      { initialProps: { id: 'wf1' as string | null } },
    );
    act(() => result.current.toggleInputs());
    act(() => result.current.setInputsJson('{"x":1}'));
    expect(result.current.inputsOpen).toBe(true);
    rerender({ id: null });
    expect(result.current.inputsOpen).toBe(false);
    expect(result.current.inputsJson).toBe('{}');
  });
});
