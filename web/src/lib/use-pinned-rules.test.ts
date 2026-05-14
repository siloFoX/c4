import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { usePinnedRules } from './use-pinned-rules';

// usePinnedRules owns the per-worker pinned-memory editor:
//   - mount: load() fires for non-empty workerName, fills rulesText (joined with
//     "\n\n---\n\n") + defaultTemplate + lastRefreshAt
//   - empty workerName: load() short-circuits (no fetch, no state churn)
//   - load() error path: sets error to e.message, loading flips back to false
//   - save() POSTs the split-by-`---` userRules form + defaultTemplate (null when empty)
//     + the requested refresh flag, then stores lastRefreshAt from the response
//   - save() error path: sets error, saving flips back to false
//   - busy flags: loading flips around load(), saving flips around save()
//   - setRulesText / setDefaultTemplate update local state immediately
//   - workerName change re-fires load() against the encoded URL

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePinnedRules', () => {
  it('mount with empty workerName: no fetch, no error, idle state', async () => {
    let calls = 0;
    server.use(
      http.get('/api/workers/:name/pinned-memory', () => {
        calls++;
        return HttpResponse.json({ pinnedMemory: null, lastRefreshAt: null });
      }),
    );
    const { result } = renderHook(() => usePinnedRules({ workerName: '' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(0);
    expect(result.current.rulesText).toBe('');
    expect(result.current.defaultTemplate).toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastRefreshAt).toBeNull();
  });

  it('mount with workerName: load() joins userRules with the --- separator', async () => {
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: {
            userRules: ['rule one', 'rule two', 'rule three'],
            defaultTemplate: 'role-worker.md',
          },
          lastRefreshAt: 1700000000000,
        }),
      ),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => {
      expect(result.current.rulesText).toBe(
        'rule one\n\n---\n\nrule two\n\n---\n\nrule three',
      );
    });
    expect(result.current.defaultTemplate).toBe('role-worker.md');
    expect(result.current.lastRefreshAt).toBe(1700000000000);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('load() encodes the worker name into the URL', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/workers/:name/pinned-memory', ({ request }) => {
        capturedUrl = new URL(request.url).pathname;
        return HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        });
      }),
    );
    renderHook(() => usePinnedRules({ workerName: 'auto manager/1' }));
    await waitFor(() => {
      expect(capturedUrl).toBe(
        '/api/workers/auto%20manager%2F1/pinned-memory',
      );
    });
  });

  it('load() defensive fallback: missing/non-array userRules => empty rulesText', async () => {
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: null, defaultTemplate: null },
          lastRefreshAt: null,
        }),
      ),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rulesText).toBe('');
    expect(result.current.defaultTemplate).toBe('');
  });

  it('load() error path: sets error from apiGet, loading flips back to false', async () => {
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({ error: 'no such worker' }, { status: 404 }),
      ),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'gone' }),
    );
    await waitFor(() => expect(result.current.error).toMatch(/HTTP 404/));
    expect(result.current.loading).toBe(false);
  });

  it('save() POSTs split-by-`---` userRules + defaultTemplate=null when empty', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        }),
      ),
      http.post('/api/workers/:name/pinned-memory', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ lastRefreshAt: 1700000000999 });
      }),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setRulesText('alpha\n\n---\n\nbeta\n\n  ---  \n\n  ');
      result.current.setDefaultTemplate('');
    });
    await act(async () => {
      await result.current.save({ refresh: true });
    });
    expect(capturedBody).toEqual({
      userRules: ['alpha', 'beta'],
      defaultTemplate: null,
      refresh: true,
    });
    expect(result.current.lastRefreshAt).toBe(1700000000999);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('save() with non-empty defaultTemplate forwards it verbatim', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        }),
      ),
      http.post('/api/workers/:name/pinned-memory', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ lastRefreshAt: null });
      }),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setRulesText('only-one');
      result.current.setDefaultTemplate('role-mgr.md');
    });
    await act(async () => {
      await result.current.save({ refresh: false });
    });
    expect(capturedBody).toEqual({
      userRules: ['only-one'],
      defaultTemplate: 'role-mgr.md',
      refresh: false,
    });
  });

  it('save() error path: sets error from apiPost, saving flips back to false', async () => {
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        }),
      ),
      http.post('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({ error: 'locked' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save({ refresh: false });
    });
    expect(result.current.error).toMatch(/HTTP 409/);
    expect(result.current.saving).toBe(false);
  });

  it('flips loading=true around in-flight load and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/workers/:name/pinned-memory', async () => {
        await gate;
        return HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        });
      }),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(true));
    release();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('flips saving=true around in-flight save and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: [], defaultTemplate: null },
          lastRefreshAt: null,
        }),
      ),
      http.post('/api/workers/:name/pinned-memory', async () => {
        await gate;
        return HttpResponse.json({ lastRefreshAt: null });
      }),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.save({ refresh: false });
    });
    await waitFor(() => expect(result.current.saving).toBe(true));
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.saving).toBe(false);
  });

  it('workerName change re-fires load() against the new encoded URL', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/workers/:name/pinned-memory', ({ params }) => {
        seen.push(String(params['name']));
        return HttpResponse.json({
          pinnedMemory: { userRules: [`hi from ${params['name']}`], defaultTemplate: null },
          lastRefreshAt: null,
        });
      }),
    );
    const { result, rerender } = renderHook(
      ({ workerName }: { workerName: string }) =>
        usePinnedRules({ workerName }),
      { initialProps: { workerName: 'A' } },
    );
    await waitFor(() =>
      expect(result.current.rulesText).toBe('hi from A'),
    );
    rerender({ workerName: 'B' });
    await waitFor(() =>
      expect(result.current.rulesText).toBe('hi from B'),
    );
    expect(seen).toEqual(['A', 'B']);
  });

  it('setRulesText / setDefaultTemplate apply immediately without a fetch', async () => {
    server.use(
      http.get('/api/workers/:name/pinned-memory', () =>
        HttpResponse.json({
          pinnedMemory: { userRules: ['init'], defaultTemplate: 'init.md' },
          lastRefreshAt: null,
        }),
      ),
    );
    const { result } = renderHook(() =>
      usePinnedRules({ workerName: 'w1' }),
    );
    await waitFor(() =>
      expect(result.current.rulesText).toBe('init'),
    );
    act(() => {
      result.current.setRulesText('edited');
      result.current.setDefaultTemplate('edited.md');
    });
    expect(result.current.rulesText).toBe('edited');
    expect(result.current.defaultTemplate).toBe('edited.md');
  });
});
