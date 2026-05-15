import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';

// The hook now consumes `useConfirm()` (promise-based confirm dialog,
// v1.11.225). The existing test bed asserts behaviour through the
// legacy `window.confirm` spy, so we bridge the two by mocking the
// hook to defer to `window.confirm`. The dedicated
// `use-confirm.test.tsx` covers the new hook's own contract.
const stableConfirm = (
  opts: { title: string; message?: string },
): Promise<boolean> =>
  Promise.resolve(window.confirm(opts.message ?? opts.title));
vi.mock('../hooks/use-confirm', () => ({
  useConfirm: () => stableConfirm,
}));

import { useWorkerActionStrip } from './use-worker-action-strip';
import type { ActionConfig, ActionKind } from '../components/WorkerActions';

// useWorkerActionStrip is the row-action runner for the per-worker
// toolbar. Contract:
//   - action.disabled => no confirm, no POST, no toast
//   - window.confirm(action.confirm) === false => no POST, no toast
//   - flips busyKind to action.kind while in flight, clears on done
//   - 2xx response => showToast(successMessage, 'success')
//   - non-2xx or 2xx+error => showToast('<label> failed: <error>', 'error')
//   - error fallback uses t('common.unknown') == 'unknown'

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAction(overrides: Partial<ActionConfig> = {}): ActionConfig {
  return {
    kind: 'merge',
    label: 'Merge',
    confirm: 'Merge?',
    endpoint: '/api/merge',
    body: { name: 'w1' },
    successMessage: 'Merged',
    icon: null as unknown as JSX.Element,
    variant: 'primary',
    ...overrides,
  };
}

type HookArgs = Parameters<typeof useWorkerActionStrip>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return { showToast: vi.fn(), ...overrides };
}

describe('useWorkerActionStrip', () => {
  it('starts idle: busyKind=null, runAction is a function', () => {
    const { result } = renderHook(() => useWorkerActionStrip(makeArgs()));
    expect(result.current.busyKind).toBeNull();
    expect(typeof result.current.runAction).toBe('function');
  });

  it('happy path: POSTs to action.endpoint, fires a success toast, and leaves busyKind=null', async () => {
    let receivedPath = '';
    let receivedBody: unknown = null;
    server.use(
      http.post('/api/merge', async ({ request }) => {
        receivedPath = new URL(request.url).pathname;
        receivedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({
      endpoint: '/api/merge',
      body: { name: 'demo-1' },
      successMessage: 'Merged demo-1',
    });
    await act(async () => {
      await result.current.runAction(action);
    });
    expect(receivedPath).toBe('/api/merge');
    expect(receivedBody).toEqual({ name: 'demo-1' });
    expect(args.showToast).toHaveBeenCalledWith('Merged demo-1', 'success');
    expect(result.current.busyKind).toBeNull();
  });

  it('skips confirm + POST + toast when action.disabled is true', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let hits = 0;
    server.use(
      http.post('/api/merge', () => {
        hits++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ disabled: true });
    await act(async () => {
      await result.current.runAction(action);
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(hits).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.busyKind).toBeNull();
  });

  it('skips POST + toast when window.confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let hits = 0;
    server.use(
      http.post('/api/merge', () => {
        hits++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ confirm: 'Sure?' });
    await act(async () => {
      await result.current.runAction(action);
    });
    expect(hits).toBe(0);
    expect(args.showToast).not.toHaveBeenCalled();
    expect(result.current.busyKind).toBeNull();
  });

  it('passes action.confirm verbatim to window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ confirm: 'Really merge worker w1 into main?' });
    await act(async () => {
      await result.current.runAction(action);
    });
    expect(confirmSpy).toHaveBeenCalledWith('Really merge worker w1 into main?');
  });

  it('fires an error toast carrying the server-provided error on non-2xx', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/merge', () =>
        HttpResponse.json({ error: 'merge conflict' }, { status: 409 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ label: 'Merge' });
    await act(async () => {
      await result.current.runAction(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Merge');
    expect(message).toContain('merge conflict');
    expect(result.current.busyKind).toBeNull();
  });

  it('falls back to the i18n "unknown" string when postAction yields an empty error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/merge', () =>
        HttpResponse.json({ error: '' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ label: 'Close' });
    await act(async () => {
      await result.current.runAction(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Close');
    expect(message.toLowerCase()).toContain('unknown');
  });

  it('treats a 2xx + payload.error as a failure (daemon no-op convention)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/merge', () =>
        HttpResponse.json({ error: 'already merged' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ label: 'Merge' });
    await act(async () => {
      await result.current.runAction(action);
    });
    const [message, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(message).toContain('Merge');
    expect(message).toContain('already merged');
  });

  it('surfaces a network error as an error toast', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(http.post('/api/merge', () => HttpResponse.error()));
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ label: 'Merge' });
    await act(async () => {
      await result.current.runAction(action);
    });
    const [, kind] = (
      args.showToast as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(kind).toBe('error');
    expect(result.current.busyKind).toBeNull();
  });

  it('flips busyKind to action.kind during in-flight POST and back to null on success', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/merge', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ kind: 'approve' as ActionKind });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runAction(action);
      await Promise.resolve();
    });
    expect(result.current.busyKind).toBe('approve');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busyKind).toBeNull();
  });

  it('busyKind returns to null even when the call errors', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/merge', async () => {
        await gate;
        return HttpResponse.json({ error: 'nope' }, { status: 503 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActionStrip(args));
    const action = makeAction({ kind: 'interrupt' as ActionKind });
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.runAction(action);
      await Promise.resolve();
    });
    expect(result.current.busyKind).toBe('interrupt');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busyKind).toBeNull();
  });

  it('honours per-call action.endpoint + body so callers can dispatch different actions through one hook', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const received: Array<{ path: string; body: unknown }> = [];
    server.use(
      http.post('/api/merge', async ({ request }) => {
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
    const { result } = renderHook(() => useWorkerActionStrip(args));
    await act(async () => {
      await result.current.runAction(
        makeAction({
          kind: 'merge',
          endpoint: '/api/merge',
          body: { name: 'w1' },
        }),
      );
    });
    await act(async () => {
      await result.current.runAction(
        makeAction({
          kind: 'close' as ActionKind,
          endpoint: '/api/control/close',
          body: { name: 'w1' },
        }),
      );
    });
    expect(received).toEqual([
      { path: '/api/merge', body: { name: 'w1' } },
      { path: '/api/control/close', body: { name: 'w1' } },
    ]);
  });

  it('runAction reference is stable across re-renders when showToast identity is unchanged', () => {
    const showToast = vi.fn();
    const { result, rerender } = renderHook(() =>
      useWorkerActionStrip({ showToast }),
    );
    const first = result.current.runAction;
    rerender();
    expect(result.current.runAction).toBe(first);
  });

  it('runAction reference changes when showToast identity changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ showToast }: { showToast: (msg: string, type: 'success' | 'error' | 'info') => void }) =>
        useWorkerActionStrip({ showToast }),
      { initialProps: { showToast: vi.fn() } },
    );
    const first = result.current.runAction;
    rerender({ showToast: vi.fn() });
    expect(result.current.runAction).not.toBe(first);
  });
});
