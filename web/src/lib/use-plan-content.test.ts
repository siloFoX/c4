import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { usePlanContent } from './use-plan-content';

// usePlanContent loads the saved plan markdown for the currently-
// selected worker via GET /api/plan?name=<worker>. Contract:
//   - empty `selected` => no fetch, no state change
//   - happy path stores the PlanResponse, leaves loading=false,
//     clears error
//   - HTTP error => plan=null, error=Error.message, loading=false
//   - re-runs whenever `selected` changes via the useEffect
//   - exposes a manual setError (clears or sets the surface)
//   - loadPlan is a stable handle that the parent can also call

describe('usePlanContent', () => {
  it('starts idle and short-circuits when selected is empty (no fetch, no state change)', async () => {
    let hits = 0;
    server.use(
      http.get('/api/plan', () => {
        hits++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => usePlanContent({ selected: '' }));
    // No await — but the empty short-circuit means we'd see plan stay null forever.
    await new Promise((r) => setTimeout(r, 10));
    expect(hits).toBe(0);
    expect(result.current.plan).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('happy path: loads /api/plan?name=<worker> and stores the response', async () => {
    const payload = {
      name: 'demo-1',
      content: '# Plan\n- step',
      path: '/tmp/plan.md',
      status: 'ok',
    };
    let receivedUrl = '';
    server.use(
      http.get('/api/plan', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json(payload);
      }),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => {
      expect(result.current.plan).not.toBeNull();
    });
    expect(receivedUrl).toContain('/api/plan?name=demo-1');
    expect(result.current.plan).toEqual(payload);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('URL-encodes the worker name in the query string', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/plan', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({});
      }),
    );
    renderHook(() => usePlanContent({ selected: 'a/b c' }));
    await waitFor(() => {
      expect(receivedUrl).toContain('a%2Fb%20c');
    });
  });

  it('error path: HTTP 500 sets plan=null, error=truthy, loading=false', async () => {
    server.use(
      http.get('/api/plan', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.plan).toBeNull();
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.loading).toBe(false);
  });

  it('clears the plan slot to null on HTTP error (so the empty state can re-render)', async () => {
    // First call succeeds.
    server.use(
      http.get('/api/plan', () =>
        HttpResponse.json({ name: 'demo-1', content: 'first' }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string }) => usePlanContent({ selected }),
      { initialProps: { selected: 'demo-1' } },
    );
    await waitFor(() => {
      expect(result.current.plan).toEqual({
        name: 'demo-1',
        content: 'first',
      });
    });
    // Switch endpoint to a 500. Re-trigger via selected flip.
    server.use(
      http.get('/api/plan', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    rerender({ selected: 'demo-2' });
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.plan).toBeNull();
  });

  it('refetches when selected changes', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/plan', ({ request }) => {
        const name = new URL(request.url).searchParams.get('name') || '';
        seen.push(name);
        return HttpResponse.json({ name, content: `plan-${name}` });
      }),
    );
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string }) => usePlanContent({ selected }),
      { initialProps: { selected: 'a' } },
    );
    await waitFor(() => {
      expect(result.current.plan?.content).toBe('plan-a');
    });
    rerender({ selected: 'b' });
    await waitFor(() => {
      expect(result.current.plan?.content).toBe('plan-b');
    });
    expect(seen).toEqual(['a', 'b']);
  });

  it('does not refetch when selected stays the same across rerenders', async () => {
    let calls = 0;
    server.use(
      http.get('/api/plan', () => {
        calls++;
        return HttpResponse.json({ name: 'demo-1' });
      }),
    );
    const { rerender } = renderHook(
      ({ selected }: { selected: string }) => usePlanContent({ selected }),
      { initialProps: { selected: 'demo-1' } },
    );
    await waitFor(() => expect(calls).toBe(1));
    rerender({ selected: 'demo-1' });
    // Give a moment for any rogue refetch to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(1);
  });

  it('flips loading=true during in-flight fetch then back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/plan', async () => {
        await gate;
        return HttpResponse.json({ name: 'demo-1' });
      }),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('exposes setError so the parent can clear or set the error surface manually', async () => {
    server.use(
      http.get('/api/plan', () => HttpResponse.json({ name: 'demo-1' })),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => expect(result.current.plan).not.toBeNull());
    act(() => result.current.setError('manual error'));
    expect(result.current.error).toBe('manual error');
    act(() => result.current.setError(null));
    expect(result.current.error).toBeNull();
  });

  it('manual loadPlan() can be called from the parent and re-fetches', async () => {
    let calls = 0;
    server.use(
      http.get('/api/plan', () => {
        calls++;
        return HttpResponse.json({ name: 'demo-1', content: `c-${calls}` });
      }),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await result.current.loadPlan();
    });
    expect(calls).toBe(2);
    expect(result.current.plan?.content).toBe('c-2');
  });

  it('manual loadPlan() short-circuits when selected is empty', async () => {
    let calls = 0;
    server.use(
      http.get('/api/plan', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => usePlanContent({ selected: '' }));
    await act(async () => {
      await result.current.loadPlan();
    });
    expect(calls).toBe(0);
  });

  it('loadPlan reference changes when selected changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ selected }: { selected: string }) => usePlanContent({ selected }),
      { initialProps: { selected: 'a' } },
    );
    const first = result.current.loadPlan;
    rerender({ selected: 'b' });
    expect(result.current.loadPlan).not.toBe(first);
  });

  it('clears stale error before a fresh load via setError(null) inside loadPlan', async () => {
    // First call errors.
    server.use(
      http.get('/api/plan', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      usePlanContent({ selected: 'demo-1' }),
    );
    await waitFor(() => expect(result.current.error).toBeTruthy());

    // Second call: gated + happy. Mid-flight we'd see the cleared error.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/plan', async () => {
        await gate;
        return HttpResponse.json({ name: 'demo-1', content: 'ok' });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.loadPlan();
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.plan?.content).toBe('ok');
  });
});
