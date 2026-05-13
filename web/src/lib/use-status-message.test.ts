import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useStatusMessage } from './use-status-message';

// useStatusMessage owns the status-update card's message buffer +
// sending state. send() POSTs /api/status-update with the trimmed
// message, clears the textarea on success, and surfaces both
// success and failure through the parent-supplied onToast callback.
// An empty / whitespace-only message short-circuits before the
// POST.

describe('useStatusMessage', () => {
  it('starts with message="" and sending=false', () => {
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    expect(result.current.message).toBe('');
    expect(result.current.sending).toBe(false);
    expect(typeof result.current.setMessage).toBe('function');
    expect(typeof result.current.send).toBe('function');
  });

  it('setMessage updates the message slot', () => {
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    act(() => result.current.setMessage('typing'));
    expect(result.current.message).toBe('typing');
  });

  it('send short-circuits when message is empty: no POST, no toast', async () => {
    let hits = 0;
    const onToast = vi.fn();
    server.use(
      http.post('/api/status-update', () => {
        hits++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast }),
    );
    await act(async () => {
      await result.current.send();
    });
    expect(hits).toBe(0);
    expect(onToast).not.toHaveBeenCalled();
    expect(result.current.sending).toBe(false);
  });

  it('send short-circuits when message is whitespace-only', async () => {
    let hits = 0;
    server.use(
      http.post('/api/status-update', () => {
        hits++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    act(() => result.current.setMessage('    '));
    await act(async () => {
      await result.current.send();
    });
    expect(hits).toBe(0);
  });

  it('happy path: POSTs { worker, message } trimmed, fires success toast, clears message', async () => {
    let receivedBody: { worker?: string; message?: string } | null = null;
    server.use(
      http.post('/api/status-update', async ({ request }) => {
        receivedBody = (await request.json()) as typeof receivedBody;
        return HttpResponse.json({ ok: true });
      }),
    );
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'demo-7', onToast }),
    );
    act(() => result.current.setMessage('  hello there  '));
    await act(async () => {
      await result.current.send();
    });
    expect(receivedBody).toEqual({ worker: 'demo-7', message: 'hello there' });
    expect(onToast).toHaveBeenCalledTimes(1);
    const [text, kind] = onToast.mock.calls[0]!;
    expect(typeof text).toBe('string');
    expect(text).toContain('demo-7');
    expect(kind).toBe('success');
    expect(result.current.message).toBe('');
    expect(result.current.sending).toBe(false);
  });

  it('error path: fires error toast on 500 and does NOT clear the message', async () => {
    server.use(
      http.post('/api/status-update', () =>
        HttpResponse.json({ error: 'oh no' }, { status: 500 }),
      ),
    );
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast }),
    );
    act(() => result.current.setMessage('keep me'));
    await act(async () => {
      await result.current.send();
    });
    expect(onToast).toHaveBeenCalledTimes(1);
    const [, kind] = onToast.mock.calls[0]!;
    expect(kind).toBe('error');
    expect(result.current.message).toBe('keep me');
    expect(result.current.sending).toBe(false);
  });

  it('flips sending=true during the in-flight POST then back to false', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/status-update', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    act(() => result.current.setMessage('go'));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.send();
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sending).toBe(false);
  });

  it('sending returns to false even after an error', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/status-update', async () => {
        await gate;
        return HttpResponse.json({ error: 'denied' }, { status: 403 });
      }),
    );
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    act(() => result.current.setMessage('go'));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.send();
      await Promise.resolve();
    });
    expect(result.current.sending).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.sending).toBe(false);
  });

  it('error toast text contains the HTTP error detail', async () => {
    server.use(
      http.post('/api/status-update', () =>
        HttpResponse.json({ error: 'forbidden' }, { status: 403 }),
      ),
    );
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast }),
    );
    act(() => result.current.setMessage('please'));
    await act(async () => {
      await result.current.send();
    });
    const [text] = onToast.mock.calls[0]!;
    expect(text).toContain('HTTP 403');
  });

  it('uses the current workerName at send time (post-rerender)', async () => {
    let receivedWorker: string | undefined;
    server.use(
      http.post('/api/status-update', async ({ request }) => {
        const body = (await request.json()) as { worker?: string };
        receivedWorker = body.worker;
        return HttpResponse.json({ ok: true });
      }),
    );
    const onToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useStatusMessage({ workerName: name, onToast }),
      { initialProps: { name: 'first' } },
    );
    act(() => result.current.setMessage('hello'));
    await act(async () => {
      await result.current.send();
    });
    expect(receivedWorker).toBe('first');
    rerender({ name: 'second' });
    act(() => result.current.setMessage('hello2'));
    await act(async () => {
      await result.current.send();
    });
    expect(receivedWorker).toBe('second');
  });

  it('send reference changes when workerName changes (useCallback dep)', () => {
    const onToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) =>
        useStatusMessage({ workerName: name, onToast }),
      { initialProps: { name: 'w1' } },
    );
    const first = result.current.send;
    rerender({ name: 'w2' });
    expect(result.current.send).not.toBe(first);
  });

  it('a second send call while the first is gated still POSTs again (no internal guard)', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/status-update', async () => {
        calls++;
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useStatusMessage({ workerName: 'w1', onToast: vi.fn() }),
    );
    act(() => result.current.setMessage('hello'));
    let first: Promise<void> | null = null;
    await act(async () => {
      first = result.current.send();
      await Promise.resolve();
    });
    expect(calls).toBe(1);
    // The first send clears the message; setMessage again so the
    // second call is not short-circuited by the empty-check.
    act(() => result.current.setMessage('hello again'));
    let second: Promise<void> | null = null;
    await act(async () => {
      second = result.current.send();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
  });
});
