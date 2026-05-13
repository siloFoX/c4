import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useBatchSubmit } from './use-batch-submit';

// useBatchSubmit is the dispatcher for `c4 batch` runs. POSTs
// /api/batch with either { task, count } or { tasks: [...] }
// depending on the active tab. Owns its own busy/result/error
// triplet and emits the success/partial-fail toast itself. All
// input validation happens before the POST so an empty form
// never reaches the network.

type HookArgs = Parameters<typeof useBatchSubmit>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    mode: 'count',
    task: 'lint',
    count: 3,
    tasksText: '',
    namePrefix: 'batch',
    branch: '',
    profile: '',
    autoMode: false,
    showToast: vi.fn(),
    ...overrides,
  };
}

describe('useBatchSubmit', () => {
  it('starts idle: busy=false, result=null, error=null, submit is a function', () => {
    const { result } = renderHook(() => useBatchSubmit(makeArgs()));
    expect(result.current.busy).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.submit).toBe('function');
  });

  it('rejects mode=count with an empty task: error set, no POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/batch', () => {
        calls++;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({ mode: 'count', task: '   ', count: 3 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(calls).toBe(0);
    expect(result.current.error).toBe('Task is required.');
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('rejects mode=count with count<1: error set, no POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/batch', () => {
        calls++;
        return HttpResponse.json({ ok: 0, fail: 0, total: 0, results: [] });
      }),
    );
    const args = makeArgs({ mode: 'count', task: 'lint', count: 0 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(calls).toBe(0);
    expect(result.current.error).toBe('Count must be at least 1.');
    expect(args.showToast).not.toHaveBeenCalled();
  });

  it('rejects mode=file when tasksText has no non-comment lines: error set, no POST', async () => {
    let calls = 0;
    server.use(
      http.post('/api/batch', () => {
        calls++;
        return HttpResponse.json({ ok: 0, fail: 0, total: 0, results: [] });
      }),
    );
    const args = makeArgs({
      mode: 'file',
      tasksText: '# only a comment\n#another\n   ',
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(calls).toBe(0);
    expect(result.current.error).toBe(
      'Paste at least one non-comment line in Tasks.',
    );
  });

  it('happy-path mode=count: POSTs { namePrefix, task, count } and shows a success toast on fail=0', async () => {
    let receivedPath = '';
    let receivedBody: unknown = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        receivedPath = new URL(request.url).pathname;
        receivedBody = await request.json();
        return HttpResponse.json({
          ok: 2,
          fail: 0,
          total: 2,
          results: [
            { name: 'batch-1', ok: true },
            { name: 'batch-2', ok: true },
          ],
        });
      }),
    );
    const args = makeArgs({
      mode: 'count',
      task: 'fix lint',
      count: 2,
      namePrefix: 'batch',
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(receivedPath).toBe('/api/batch');
    expect(receivedBody).toEqual({
      namePrefix: 'batch',
      task: 'fix lint',
      count: 2,
    });
    expect(result.current.result).toMatchObject({ ok: 2, fail: 0, total: 2 });
    expect(result.current.error).toBeNull();
    expect(args.showToast).toHaveBeenCalledTimes(1);
    const [, kind] = (args.showToast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(kind).toBe('success');
  });

  it('happy-path mode=file: parses tasksText (trims, drops blanks + comments) and POSTs { tasks }', async () => {
    let receivedBody: unknown = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          ok: 3,
          fail: 0,
          total: 3,
          results: [],
        });
      }),
    );
    const args = makeArgs({
      mode: 'file',
      tasksText:
        '# header\n  add tests for auth.js  \n\nfix lint in src/\n   # commented\nupdate CHANGELOG\n',
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(receivedBody).toEqual({
      namePrefix: 'batch',
      tasks: [
        'add tests for auth.js',
        'fix lint in src/',
        'update CHANGELOG',
      ],
    });
  });

  it('forwards branch + profile + autoMode keys only when each is set', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({
      mode: 'count',
      task: 'x',
      count: 1,
      branch: 'feat',
      profile: 'web',
      autoMode: true,
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(receivedBody).toEqual({
      namePrefix: 'batch',
      task: 'x',
      count: 1,
      branch: 'feat',
      profile: 'web',
      autoMode: true,
    });
  });

  it('omits branch/profile/autoMode entirely when each is the empty string / false', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({
      task: 'x',
      count: 1,
      branch: '',
      profile: '',
      autoMode: false,
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(receivedBody).toEqual({
      namePrefix: 'batch',
      task: 'x',
      count: 1,
    });
    expect(receivedBody && 'branch' in receivedBody).toBe(false);
    expect(receivedBody && 'profile' in receivedBody).toBe(false);
    expect(receivedBody && 'autoMode' in receivedBody).toBe(false);
  });

  it("falls back to namePrefix='batch' when the prop is the empty string", async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({
      task: 'x',
      count: 1,
      namePrefix: '',
    });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(receivedBody?.namePrefix).toBe('batch');
  });

  it('treats a 2xx with { error } payload as a failure (sets error, suppresses toast)', async () => {
    server.use(
      http.post('/api/batch', () =>
        HttpResponse.json({
          ok: 0,
          fail: 0,
          total: 0,
          results: [],
          error: 'no workers available',
        }),
      ),
    );
    const args = makeArgs({ task: 'x', count: 1 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('no workers available');
    expect(result.current.result).toBeNull();
    expect(args.showToast).not.toHaveBeenCalled();
  });

  it("emits an 'error' toast when the response is ok but reports fail>0 (partial failure)", async () => {
    server.use(
      http.post('/api/batch', () =>
        HttpResponse.json({
          ok: 2,
          fail: 1,
          total: 3,
          results: [
            { name: 'batch-1', ok: true },
            { name: 'batch-2', ok: true },
            { name: 'batch-3', ok: false, error: 'spawn EACCES' },
          ],
        }),
      ),
    );
    const args = makeArgs({ task: 'x', count: 3 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.result).toMatchObject({ ok: 2, fail: 1, total: 3 });
    expect(result.current.error).toBeNull();
    const [, kind] = (args.showToast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(kind).toBe('error');
  });

  it('catches a non-2xx response and surfaces the HTTP message as error (busy back to false)', async () => {
    server.use(
      http.post('/api/batch', () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 }),
      ),
    );
    const args = makeArgs({ task: 'x', count: 1 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.error).toContain('HTTP 403');
    expect(result.current.result).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(args.showToast).not.toHaveBeenCalled();
  });

  it('flips busy=true during the in-flight POST and back to false on resolve (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/batch', async () => {
        await gate;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({ task: 'x', count: 1 });
    const { result } = renderHook(() => useBatchSubmit(args));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.submit();
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('a parallel call issued while the first is gated still fires a second POST (no internal mutex)', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/batch', async () => {
        calls++;
        await gate;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const args = makeArgs({ task: 'x', count: 1 });
    const { result } = renderHook(() => useBatchSubmit(args));
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.submit();
      await Promise.resolve();
    });
    expect(calls).toBe(1);
    await act(async () => {
      second = result.current.submit();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.busy).toBe(false);
  });

  it('clears stale error and result at the start of each submit (no leak from the previous call)', async () => {
    // First call fails with a 2xx error payload to populate error state.
    server.use(
      http.post('/api/batch', () =>
        HttpResponse.json({
          ok: 0,
          fail: 0,
          total: 0,
          results: [],
          error: 'first run failed',
        }),
      ),
    );
    const args = makeArgs({ task: 'x', count: 1 });
    const { result } = renderHook(() => useBatchSubmit(args));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.error).toBe('first run failed');

    // Second call: server hangs on a gate. Mid-flight, error and
    // result should already be cleared by the submit() prelude.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/batch', async () => {
        await gate;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.submit();
      await Promise.resolve();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
  });

  it('rerender with a new task picks up the new value on the next submit (prop-driven re-eval)', async () => {
    let received: { task?: string; count?: number } | null = null;
    server.use(
      http.post('/api/batch', async ({ request }) => {
        received = (await request.json()) as typeof received;
        return HttpResponse.json({
          ok: 1,
          fail: 0,
          total: 1,
          results: [],
        });
      }),
    );
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ task }: { task: string }) =>
        useBatchSubmit({
          mode: 'count',
          task,
          count: 1,
          tasksText: '',
          namePrefix: 'batch',
          branch: '',
          profile: '',
          autoMode: false,
          showToast,
        }),
      { initialProps: { task: 'first' } },
    );
    await act(async () => {
      await result.current.submit();
    });
    expect(received?.task).toBe('first');
    rerender({ task: 'second' });
    await act(async () => {
      await result.current.submit();
    });
    expect(received?.task).toBe('second');
  });
});
