import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useControlPanelSingle } from './use-control-panel-single';
import type { SingleAction } from '../components/ControlPanel';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAction(overrides: Partial<SingleAction> = {}): SingleAction {
  return {
    kind: 'pause',
    label: 'Pause',
    description: 'Pause worker',
    endpoint: '/api/key',
    body: { name: 'w1', key: 'C-c' },
    confirm: null,
    tone: 'neutral',
    // The hook never reads `icon`; it is only consumed by the JSX layer.
    icon: null as unknown as JSX.Element,
    successMessage: (n) => `Paused ${n}`,
    ...overrides,
  };
}

type HookArgs = Parameters<typeof useControlPanelSingle>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    workerName: 'w1',
    showToast: vi.fn(),
    fetchList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useControlPanelSingle', () => {
  it('starts idle: busyKind=null, runSingle is a function', () => {
    const { result } = renderHook(() => useControlPanelSingle(makeArgs()));
    expect(result.current.busyKind).toBeNull();
    expect(typeof result.current.runSingle).toBe('function');
  });

  it('POSTs to action.endpoint with the action.body and fires a success toast on 2xx', async () => {
    let receivedBody: unknown = null;
    let receivedPath = '';
    server.use(
      http.post('/api/key', async ({ request }) => {
        receivedPath = new URL(request.url).pathname;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ workerName: 'demo-1' });
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({
      endpoint: '/api/key',
      body: { name: 'demo-1', key: 'C-c' },
      successMessage: (n) => `Paused ${n}`,
    });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(receivedPath).toBe('/api/key');
    expect(receivedBody).toEqual({ name: 'demo-1', key: 'C-c' });
    expect(args.showToast).toHaveBeenCalledWith('Paused demo-1', 'success');
    expect(args.fetchList).toHaveBeenCalledTimes(1);
    expect(result.current.busyKind).toBeNull();
  });

  it('skips the POST and every side effect when window.confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/key', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ confirm: 'Are you sure?' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(calls).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(args.fetchList).not.toHaveBeenCalled();
    expect(result.current.busyKind).toBeNull();
  });

  it('proceeds with the POST when window.confirm returns true', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/key', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ confirm: 'sure?' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(calls).toBe(1);
    expect(args.showToast).toHaveBeenCalledWith(expect.any(String), 'success');
    expect(args.fetchList).toHaveBeenCalledTimes(1);
  });

  it('fires an error toast with the server-provided error string on non-2xx', async () => {
    server.use(
      http.post('/api/key', () =>
        HttpResponse.json({ error: 'worker not found' }, { status: 404 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ label: 'Pause' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(args.showToast).toHaveBeenCalledTimes(1);
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Pause');
    expect(message).toContain('worker not found');
    expect(args.fetchList).toHaveBeenCalledTimes(1);
    expect(result.current.busyKind).toBeNull();
  });

  it('falls back to the i18n "unknown" string when postAction yields an empty error', async () => {
    // Non-2xx + empty `error` field → postAction returns { ok:false, error:'' },
    // which is falsy, so the hook substitutes t('controlPanel.action.failedUnknown')
    // (== "unknown" in en.json).
    server.use(
      http.post('/api/key', () =>
        HttpResponse.json({ error: '' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ label: 'Cancel' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Cancel');
    expect(message.toLowerCase()).toContain('unknown');
  });

  it('flips busyKind to action.kind during the in-flight POST and back to null on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/key', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ kind: 'restart' });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runSingle(action);
      await Promise.resolve();
    });
    expect(result.current.busyKind).toBe('restart');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busyKind).toBeNull();
  });

  it('picks up the workerName prop change on the next runSingle invocation', async () => {
    server.use(
      http.post('/api/key', () => HttpResponse.json({ ok: true })),
    );
    const showToast = vi.fn();
    const fetchList = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ workerName }) =>
        useControlPanelSingle({ workerName, showToast, fetchList }),
      { initialProps: { workerName: 'alpha' } },
    );
    const action = makeAction({
      successMessage: (n) => `Acted on ${n}`,
    });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(showToast).toHaveBeenLastCalledWith('Acted on alpha', 'success');

    rerender({ workerName: 'beta' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(showToast).toHaveBeenLastCalledWith('Acted on beta', 'success');
  });

  it('surfaces a network error as an error toast that still includes the action label', async () => {
    server.use(http.post('/api/key', () => HttpResponse.error()));
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ label: 'Restart' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Restart');
    expect(args.fetchList).toHaveBeenCalledTimes(1);
    expect(result.current.busyKind).toBeNull();
  });

  it('treats a 2xx + payload.error as a failure (daemon no-op convention)', async () => {
    server.use(
      http.post('/api/key', () =>
        HttpResponse.json({ error: 'already paused' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction({ label: 'Pause' });
    await act(async () => {
      await result.current.runSingle(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Pause');
    expect(message).toContain('already paused');
  });

  it('always calls fetchList after the POST resolves, both on success and on failure', async () => {
    server.use(http.post('/api/key', () => HttpResponse.json({ ok: true })));
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const action = makeAction();
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(args.fetchList).toHaveBeenCalledTimes(1);

    server.use(
      http.post('/api/key', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    );
    await act(async () => {
      await result.current.runSingle(action);
    });
    expect(args.fetchList).toHaveBeenCalledTimes(2);
  });

  it('honours per-call action.endpoint + action.body so callers can dispatch different actions through one hook', async () => {
    const received: Array<{ path: string; body: unknown }> = [];
    server.use(
      http.post('/api/key', async ({ request }) => {
        received.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/control/close', async ({ request }) => {
        received.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useControlPanelSingle(args));
    const pause = makeAction({
      kind: 'pause',
      endpoint: '/api/key',
      body: { name: 'w1', key: 'C-c' },
    });
    const close = makeAction({
      kind: 'close',
      endpoint: '/api/control/close',
      body: { name: 'w1' },
      successMessage: (n) => `Closed ${n}`,
    });
    await act(async () => {
      await result.current.runSingle(pause);
    });
    await act(async () => {
      await result.current.runSingle(close);
    });
    expect(received).toEqual([
      { path: '/api/key', body: { name: 'w1', key: 'C-c' } },
      { path: '/api/control/close', body: { name: 'w1' } },
    ]);
  });
});
