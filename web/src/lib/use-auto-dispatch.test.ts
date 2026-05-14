import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useAutoDispatch } from './use-auto-dispatch';

// useAutoDispatch owns the autonomous-manager spawn flow:
//   - idle: busy=false, error=null, result=null
//   - dispatch() pre-validates trimmed task (empty -> error=auto.error.taskRequired, no POST)
//   - dispatch() gates the POST behind window.confirm; confirm=false -> early return, no POST
//   - happy path: POST /api/auto with { task, optional name }, stores result, fires success toast
//     (uses auto.toast.spawnedAs when r.name present, else auto.toast.spawned)
//   - server-side error envelope (r.error): sets error, fires auto.toast.dispatchFailed toast
//   - thrown path (apiPost rejects on non-ok): sets error to thrown message, fires
//     auto.toast.dispatchFailed toast
//   - busy flag flips true during inflight, back to false at end of both happy + error paths
//   - dispatch callback identity is tied to (task, name, showToast)

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAutoDispatch', () => {
  it('mounts idle: busy=false, error=null, result=null, dispatch is a function', () => {
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 't', name: '', showToast }),
    );
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(typeof result.current.dispatch).toBe('function');
  });

  it('empty task sets error=auto.error.taskRequired, never POSTs, never confirms', async () => {
    let calls = 0;
    server.use(
      http.post('/api/auto', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: '   ', name: 'w', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(result.current.error).toBe('Task is required.');
    expect(calls).toBe(0);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('window.confirm=false short-circuits before POST, busy stays false', async () => {
    let calls = 0;
    server.use(
      http.post('/api/auto', () => {
        calls++;
        return HttpResponse.json({});
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(calls).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('happy path with no name: POSTs { task } only and fires auto.toast.spawned', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('/api/auto', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ status: 'spawned' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '   ', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(capturedBody).toEqual({ task: 'do thing' });
    expect(result.current.result).toEqual({ status: 'spawned' });
    expect(result.current.error).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Auto manager spawned', 'success');
    expect(result.current.busy).toBe(false);
  });

  it('happy path with name: trims name into body and fires auto.toast.spawnedAs', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post('/api/auto', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ name: 'auto-mgr', status: 'spawned' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '  worker1  ', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(capturedBody).toEqual({ task: 'do thing', name: 'worker1' });
    expect(result.current.result?.name).toBe('auto-mgr');
    expect(showToast).toHaveBeenCalledWith(
      'Auto manager spawned as auto-mgr',
      'success',
    );
  });

  it('server error envelope: sets error, fires dispatchFailed toast, result stays null', async () => {
    server.use(
      http.post('/api/auto', () =>
        HttpResponse.json({ error: 'no slots free' }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(result.current.error).toBe('no slots free');
    expect(result.current.result).toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      'Auto dispatch failed: no slots free',
      'error',
    );
    expect(result.current.busy).toBe(false);
  });

  it('thrown path (HTTP 500): sets error to apiPost message and fires dispatchFailed toast', async () => {
    server.use(
      http.post('/api/auto', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(result.current.error).toMatch(/HTTP 500/);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0]?.[1]).toBe('error');
    expect(result.current.busy).toBe(false);
  });

  it('flips busy=true while inflight and back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/auto', async () => {
        await gate;
        return HttpResponse.json({ status: 'spawned' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '', showToast }),
    );
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.dispatch();
    });
    await waitFor(() => {
      expect(result.current.busy).toBe(true);
    });
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('clears stale error on the next dispatch attempt', async () => {
    server.use(
      http.post('/api/auto', () =>
        HttpResponse.json({ error: 'first call' }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useAutoDispatch({ task: 'do thing', name: '', showToast }),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(result.current.error).toBe('first call');
    server.use(
      http.post('/api/auto', () => HttpResponse.json({ status: 'ok' })),
    );
    await act(async () => {
      await result.current.dispatch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual({ status: 'ok' });
  });

  it('dispatch callback identity changes when task or name changes', () => {
    const showToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ task, name }: { task: string; name: string }) =>
        useAutoDispatch({ task, name, showToast }),
      { initialProps: { task: 't1', name: 'w1' } },
    );
    const first = result.current.dispatch;
    rerender({ task: 't1', name: 'w1' });
    expect(result.current.dispatch).toBe(first);
    rerender({ task: 't2', name: 'w1' });
    expect(result.current.dispatch).not.toBe(first);
    const second = result.current.dispatch;
    rerender({ task: 't2', name: 'w2' });
    expect(result.current.dispatch).not.toBe(second);
  });
});
