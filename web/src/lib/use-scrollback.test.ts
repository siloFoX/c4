import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useScrollback } from './use-scrollback';

// useScrollback owns the WorkerDetail "Scrollback" tab:
//   - mounts idle: content='', error=null, no fetch when tab !== 'scrollback'
//   - on tab change: setError(null) + setActionMsg(null) always; if the
//     incoming tab is 'scrollback', fires fetchScrollback() + setInterval(3s)
//   - happy path: stores data.content, clears the banner
//   - data.error path: stores the message, blanks the content
//   - throw path (apiGet rejects on non-ok): setError(e.message)
//   - polling cadence is 3000ms; interval is cleared on unmount + on tab swap
// We exercise the request path with real timers + MSW (per use-health's note
// that fake timers + RTL waitFor don't compose cleanly under vitest) and
// spy on setInterval / clearInterval for the cadence + cleanup contract.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useScrollback', () => {
  it('mounts idle when tab=screen: content empty, error null, no fetch issued', async () => {
    let calls = 0;
    server.use(
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({ content: 'should not reach me' });
      }),
    );
    const setActionMsg = vi.fn();
    const { result } = renderHook(() =>
      useScrollback({ workerName: 'w1', tab: 'screen', setActionMsg }),
    );
    expect(result.current.scrollbackContent).toBe('');
    expect(result.current.error).toBeNull();
    expect(typeof result.current.setError).toBe('function');
    expect(typeof result.current.fetchScrollback).toBe('function');
    // give one microtask in case the effect dispatched anything
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toBe(0);
    // The mount-time effect still resets the parent action banner.
    expect(setActionMsg).toHaveBeenCalledWith(null);
  });

  it('on mount with tab=scrollback fetches once and stores the content', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: 'line one\nline two', lines: 2 }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(result.current.scrollbackContent).toBe('line one\nline two');
    });
    expect(result.current.error).toBeNull();
  });

  it('GETs /api/scrollback with name encoded + lines=200', async () => {
    let capturedUrl = '';
    server.use(
      http.get('/api/scrollback', ({ request }) => {
        capturedUrl = new URL(request.url).search;
        return HttpResponse.json({ content: '' });
      }),
    );
    renderHook(() =>
      useScrollback({
        workerName: 'worker one',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(capturedUrl).toContain('name=worker%20one');
    });
    expect(capturedUrl).toContain('lines=200');
  });

  it('happy path clears any prior error (sets error=null after content)', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: 'fresh' }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    // Pre-seed an error via the exposed setter and confirm fetch wipes it.
    act(() => {
      result.current.setError('stale');
    });
    await waitFor(() => {
      expect(result.current.scrollbackContent).toBe('fresh');
    });
    expect(result.current.error).toBeNull();
  });

  it('data.error path surfaces the message and blanks the content', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'worker is gone', content: 'leftover' }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(result.current.error).toBe('worker is gone');
    });
    expect(result.current.scrollbackContent).toBe('');
  });

  it('thrown error path (non-OK response): setError(message) and content unchanged', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(result.current.error).toMatch(/HTTP 500/);
    });
    expect(result.current.scrollbackContent).toBe('');
  });

  it('non-string content field defaults scrollbackContent to empty', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ status: 'idle', lines: 0 }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(result.current.scrollbackContent).toBe('');
  });

  it('schedules polling at the documented 3000ms cadence when tab=scrollback', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '' }),
      ),
    );
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
    });
  });

  it('does NOT schedule polling when tab=screen', async () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'screen',
        setActionMsg: vi.fn(),
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Filter out unrelated React/jsdom internals — the only 3000ms tick is ours.
    const ours = setIntervalSpy.mock.calls.filter((c) => c[1] === 3000);
    expect(ours.length).toBe(0);
  });

  it('clears the polling interval on unmount', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: '' }),
      ),
    );
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('switching tab from scrollback to screen tears down the interval and stops fetching', async () => {
    let calls = 0;
    server.use(
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({ content: 'v' });
      }),
    );
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { result, rerender } = renderHook(
      ({ tab }: { tab: 'screen' | 'scrollback' }) =>
        useScrollback({ workerName: 'w1', tab, setActionMsg: vi.fn() }),
      { initialProps: { tab: 'scrollback' as const } },
    );
    await waitFor(() => {
      expect(result.current.scrollbackContent).toBe('v');
    });
    const before = calls;
    rerender({ tab: 'screen' });
    expect(clearIntervalSpy).toHaveBeenCalled();
    // No new fetches should fire after the tab swap.
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toBe(before);
  });

  it('tab swap clears the parent action banner (setActionMsg(null) on each tab change)', () => {
    const setActionMsg = vi.fn();
    const { rerender } = renderHook(
      ({ tab }: { tab: 'screen' | 'scrollback' }) =>
        useScrollback({ workerName: 'w1', tab, setActionMsg }),
      { initialProps: { tab: 'screen' as const } },
    );
    expect(setActionMsg).toHaveBeenCalledWith(null);
    setActionMsg.mockClear();
    rerender({ tab: 'scrollback' });
    expect(setActionMsg).toHaveBeenCalledWith(null);
    setActionMsg.mockClear();
    rerender({ tab: 'screen' });
    expect(setActionMsg).toHaveBeenCalledWith(null);
  });

  it('manual fetchScrollback is a no-op when tab=screen (no HTTP call)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/scrollback', () => {
        calls++;
        return HttpResponse.json({ content: 'never' });
      }),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'screen',
        setActionMsg: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.fetchScrollback();
    });
    expect(calls).toBe(0);
    expect(result.current.scrollbackContent).toBe('');
  });

  it('exposed setError setter overrides the hook-managed value (escape hatch for parent)', async () => {
    server.use(
      http.get('/api/scrollback', () =>
        HttpResponse.json({ content: 'ok' }),
      ),
    );
    const { result } = renderHook(() =>
      useScrollback({
        workerName: 'w1',
        tab: 'scrollback',
        setActionMsg: vi.fn(),
      }),
    );
    await waitFor(() => {
      expect(result.current.scrollbackContent).toBe('ok');
    });
    act(() => {
      result.current.setError('parent-injected');
    });
    expect(result.current.error).toBe('parent-injected');
  });
});
