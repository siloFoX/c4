import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWorkerActions } from './use-worker-actions';

// useWorkerActions wraps the per-worker REST endpoints
// (/api/send, /api/key, /api/merge, /api/close) under a shared
// busy + actionMsg banner. Contract:
//   - runAction(label, fn): flips busy=true, calls fn(); on res.error
//     sets actionMsg to 'workerDetail.actionFailed' template and
//     returns false; on success sets 'workerDetail.actionOk' template,
//     fires fetchScrollback, returns true. Thrown errors funnel into
//     the same actionFailed branch with e.message.
//   - handleSend(text): trims text; empty -> early return false, no POST.
//   - handleEnter(): runAction key Enter via /api/key.
//   - sendKey(key): runAction with given key via /api/key.
//   - handleMerge(): window.confirm gates the POST; cancelling returns
//     Promise.resolve(false) without flipping busy. Confirm true ->
//     /api/merge.
//   - handleClose(): runAction via /api/close.
//   - busy flips true while inflight and back to false on every exit
//     branch (success or error).

afterEach(() => {
  vi.restoreAllMocks();
});

type HookArgs = Parameters<typeof useWorkerActions>[0];

function makeArgs(overrides: Partial<HookArgs> = {}): HookArgs {
  return {
    workerName: 'w1',
    fetchScrollback: vi.fn(),
    ...overrides,
  };
}

describe('useWorkerActions', () => {
  it('mounts idle: actionMsg=null, busy=false, all callbacks are functions', () => {
    const { result } = renderHook(() => useWorkerActions(makeArgs()));
    expect(result.current.actionMsg).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(typeof result.current.runAction).toBe('function');
    expect(typeof result.current.handleSend).toBe('function');
    expect(typeof result.current.handleEnter).toBe('function');
    expect(typeof result.current.sendKey).toBe('function');
    expect(typeof result.current.handleMerge).toBe('function');
    expect(typeof result.current.handleClose).toBe('function');
  });

  it('setActionMsg writes the banner string directly (consumer-controlled clear)', () => {
    const { result } = renderHook(() => useWorkerActions(makeArgs()));
    act(() => {
      result.current.setActionMsg('hello');
    });
    expect(result.current.actionMsg).toBe('hello');
    act(() => {
      result.current.setActionMsg(null);
    });
    expect(result.current.actionMsg).toBeNull();
  });

  it('runAction happy path: fn returns no error, actionMsg becomes "<label> ok", fetchScrollback fires, returns true', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.runAction('do', async () => ({ status: 'fine' }));
    });
    expect(ok).toBe(true);
    expect(result.current.actionMsg).toBe('do ok');
    expect(args.fetchScrollback).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('runAction envelope error: sets actionFailed banner with res.error, skips fetchScrollback, returns false', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let ok = true;
    await act(async () => {
      ok = await result.current.runAction('do', async () => ({ error: 'nope' }));
    });
    expect(ok).toBe(false);
    expect(result.current.actionMsg).toBe('do failed: nope');
    expect(args.fetchScrollback).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('runAction throw: surfaces e.message in the failure banner, returns false, busy back to false', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let ok = true;
    await act(async () => {
      ok = await result.current.runAction('do', async () => {
        throw new Error('boom');
      });
    });
    expect(ok).toBe(false);
    expect(result.current.actionMsg).toBe('do failed: boom');
    expect(args.fetchScrollback).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('runAction flips busy=true while inflight, back to false on success', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let inflight: Promise<boolean> | null = null;
    act(() => {
      inflight = result.current.runAction('go', async () => {
        await gate;
        return { ok: true };
      });
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

  it('runAction clears stale actionMsg at the start of the next call', async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    await act(async () => {
      await result.current.runAction('first', async () => ({ error: 'x' }));
    });
    expect(result.current.actionMsg).toBe('first failed: x');
    await act(async () => {
      await result.current.runAction('second', async () => ({ ok: true }));
    });
    expect(result.current.actionMsg).toBe('second ok');
  });

  it('handleSend trimmed-empty: short-circuits false, no POST, no banner update', async () => {
    let calls = 0;
    server.use(
      http.post('/api/send', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let r = true;
    await act(async () => {
      r = await result.current.handleSend('   ');
    });
    expect(r).toBe(false);
    expect(calls).toBe(0);
    expect(args.fetchScrollback).not.toHaveBeenCalled();
    expect(result.current.actionMsg).toBeNull();
  });

  it('handleSend happy path: trims text into body, POSTs /api/send, fires fetchScrollback, returns true', async () => {
    let body: unknown = null;
    let path = '';
    server.use(
      http.post('/api/send', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ workerName: 'demo-1' });
    const { result } = renderHook(() => useWorkerActions(args));
    let r = false;
    await act(async () => {
      r = await result.current.handleSend('  hi there  ');
    });
    expect(path).toBe('/api/send');
    expect(body).toEqual({ name: 'demo-1', input: 'hi there' });
    expect(r).toBe(true);
    expect(args.fetchScrollback).toHaveBeenCalledTimes(1);
    expect(result.current.actionMsg).toBe('send ok');
  });

  it('handleSend HTTP 500: actionMsg = "send failed: HTTP 500", returns false', async () => {
    server.use(
      http.post('/api/send', () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let r = true;
    await act(async () => {
      r = await result.current.handleSend('hello');
    });
    expect(r).toBe(false);
    expect(result.current.actionMsg).toMatch(/^send failed: /);
    expect(result.current.actionMsg).toMatch(/HTTP 500/);
    expect(args.fetchScrollback).not.toHaveBeenCalled();
  });

  it('handleEnter POSTs { name, key: "Enter" } to /api/key with "key Enter ok" banner', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/key', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ workerName: 'demo-2' });
    const { result } = renderHook(() => useWorkerActions(args));
    let r = false;
    await act(async () => {
      r = await result.current.handleEnter();
    });
    expect(body).toEqual({ name: 'demo-2', key: 'Enter' });
    expect(r).toBe(true);
    expect(result.current.actionMsg).toBe('key Enter ok');
  });

  it('sendKey forwards the given key verbatim and embeds it in the banner label', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/key', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ workerName: 'w7' });
    const { result } = renderHook(() => useWorkerActions(args));
    await act(async () => {
      await result.current.sendKey('C-c');
    });
    expect(body).toEqual({ name: 'w7', key: 'C-c' });
    expect(result.current.actionMsg).toBe('key C-c ok');
  });

  it('handleMerge confirm=false: returns false, no POST, busy stays false, no banner', async () => {
    let calls = 0;
    server.use(
      http.post('/api/merge', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let r = true;
    await act(async () => {
      r = await result.current.handleMerge();
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(calls).toBe(0);
    expect(r).toBe(false);
    expect(args.fetchScrollback).not.toHaveBeenCalled();
    expect(result.current.actionMsg).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('handleMerge confirm=true: POSTs { name } to /api/merge, returns true, banner "merge ok"', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/merge', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs({ workerName: 'demo-3' });
    const { result } = renderHook(() => useWorkerActions(args));
    let r = false;
    await act(async () => {
      r = await result.current.handleMerge();
    });
    expect(body).toEqual({ name: 'demo-3' });
    expect(r).toBe(true);
    expect(result.current.actionMsg).toBe('merge ok');
  });

  it('handleMerge envelope error: banner "merge failed: <msg>", returns false', async () => {
    server.use(
      http.post('/api/merge', () =>
        HttpResponse.json({ error: 'conflict' }),
      ),
    );
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let r = true;
    await act(async () => {
      r = await result.current.handleMerge();
    });
    expect(r).toBe(false);
    expect(result.current.actionMsg).toBe('merge failed: conflict');
    expect(args.fetchScrollback).not.toHaveBeenCalled();
  });

  it('handleClose POSTs { name } to /api/close, returns true, banner "close ok"', async () => {
    let body: unknown = null;
    let path = '';
    server.use(
      http.post('/api/close', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs({ workerName: 'demo-4' });
    const { result } = renderHook(() => useWorkerActions(args));
    let r = false;
    await act(async () => {
      r = await result.current.handleClose();
    });
    expect(path).toBe('/api/close');
    expect(body).toEqual({ name: 'demo-4' });
    expect(r).toBe(true);
    expect(result.current.actionMsg).toBe('close ok');
  });

  it('handleClose HTTP 500: banner "close failed: HTTP 500", returns false', async () => {
    server.use(
      http.post('/api/close', () =>
        HttpResponse.json({ error: 'busy' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let r = true;
    await act(async () => {
      r = await result.current.handleClose();
    });
    expect(r).toBe(false);
    expect(result.current.actionMsg).toMatch(/^close failed: /);
    expect(result.current.actionMsg).toMatch(/HTTP 500/);
  });

  it('busy returns to false even when the action throws', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/close', async () => {
        await gate;
        return HttpResponse.json({ error: 'bad' }, { status: 503 });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWorkerActions(args));
    let inflight: Promise<boolean> | null = null;
    act(() => {
      inflight = result.current.handleClose();
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

  it('callback identity changes when workerName changes (useCallback dep)', () => {
    const fetchScrollback = vi.fn();
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useWorkerActions({ workerName: name, fetchScrollback }),
      { initialProps: { name: 'w1' } },
    );
    const first = result.current.handleEnter;
    rerender({ name: 'w1' });
    expect(result.current.handleEnter).toBe(first);
    rerender({ name: 'w2' });
    expect(result.current.handleEnter).not.toBe(first);
  });
});
