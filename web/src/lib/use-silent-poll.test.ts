import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSilentPoll, useSilentPollWithRefresh } from './use-silent-poll';

// useSilentPoll polls `url` every intervalMs and stores the latest
// response in a state slot. Failures are swallowed silently so the
// host panel can hide itself when the endpoint is missing.
//
// useSilentPollWithRefresh is the same plus a manual refresh()
// callback that maps the polled `T` through a `mapper` so the
// public type stays domain-shaped. Mapper identity is held in a
// ref so re-renders with a fresh mapper don't restart the timer.
//
// Both variants:
//   - tick once immediately on mount, then on a window.setInterval
//   - cancel + clearInterval on unmount so a slow inflight request
//     does not write into a stale state slot
//   - silently degrade on error (no toast, no error state)

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useSilentPoll', () => {
  it('returns null before the first fetch resolves, then the response after', async () => {
    server.use(
      http.get('/api/silent', () => HttpResponse.json({ value: 42 })),
    );
    const { result } = renderHook(() =>
      useSilentPoll<{ value: number }>('/api/silent', 1000),
    );
    expect(result.current).toBeNull();
    await vi.waitFor(() => {
      expect(result.current).toEqual({ value: 42 });
    });
  });

  it('polls on the configured interval and stores the latest payload', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        return HttpResponse.json({ value: calls });
      }),
    );
    const { result } = renderHook(() =>
      useSilentPoll<{ value: number }>('/api/silent', 1000),
    );
    await vi.waitFor(() => expect(result.current?.value).toBe(1));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await vi.waitFor(() => expect(result.current?.value).toBe(2));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await vi.waitFor(() => expect(result.current?.value).toBe(3));
  });

  it('silently swallows fetch errors and leaves data=null', async () => {
    server.use(
      http.get('/api/silent', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useSilentPoll<{ value: number }>('/api/silent', 1000),
    );
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current).toBeNull();
  });

  it('recovers on the next tick when an error is followed by a success', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json({ error: 'gone' }, { status: 500 });
        }
        return HttpResponse.json({ value: 'ok' });
      }),
    );
    const { result } = renderHook(() =>
      useSilentPoll<{ value: string }>('/api/silent', 1000),
    );
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await vi.waitFor(() => expect(result.current?.value).toBe('ok'));
  });

  it('does not write into state after unmount (cancel flag flips)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/silent', async () => {
        await gate;
        return HttpResponse.json({ value: 'late' });
      }),
    );
    const { result, unmount } = renderHook(() =>
      useSilentPoll<{ value: string }>('/api/silent', 1000),
    );
    expect(result.current).toBeNull();
    unmount();
    release();
    // Give microtasks a beat to settle. State must remain at last seen
    // value (which is the pre-unmount null) because the result reference
    // is frozen after unmount.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('clears the interval on unmount so no further polls fire', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        return HttpResponse.json({ value: calls });
      }),
    );
    const { unmount } = renderHook(() =>
      useSilentPoll<{ value: number }>('/api/silent', 1000),
    );
    await vi.waitFor(() => expect(calls).toBe(1));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(calls).toBe(1);
  });

  it('restarts the effect when url changes', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/silent-a', () => {
        seen.push('a');
        return HttpResponse.json({ value: 'a' });
      }),
      http.get('/api/silent-b', () => {
        seen.push('b');
        return HttpResponse.json({ value: 'b' });
      }),
    );
    const { result, rerender } = renderHook(
      ({ url }: { url: string }) =>
        useSilentPoll<{ value: string }>(url, 1000),
      { initialProps: { url: '/api/silent-a' } },
    );
    await vi.waitFor(() => expect(result.current?.value).toBe('a'));
    rerender({ url: '/api/silent-b' });
    await vi.waitFor(() => expect(result.current?.value).toBe('b'));
    expect(seen).toContain('a');
    expect(seen).toContain('b');
  });
});

describe('useSilentPollWithRefresh', () => {
  it('returns the fallback while the first fetch is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/silent', async () => {
        await gate;
        return HttpResponse.json({ raw: 'never-seen' });
      }),
    );
    const { result } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, string>(
        '/api/silent',
        1000,
        'fallback',
        (r) => r.raw,
      ),
    );
    expect(result.current.data).toBe('fallback');
    release();
  });

  it('happy path: maps the response through `mapper` into the public shape', async () => {
    server.use(
      http.get('/api/silent', () =>
        HttpResponse.json({ raw: 'hello world' }),
      ),
    );
    const { result } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, number>(
        '/api/silent',
        1000,
        -1,
        (r) => r.raw.length,
      ),
    );
    await vi.waitFor(() => expect(result.current.data).toBe('hello world'.length));
  });

  it('refresh() awaits a fresh fetch and updates data before resolving', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        return HttpResponse.json({ raw: `r-${calls}` });
      }),
    );
    const { result } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, string>(
        '/api/silent',
        100000,
        'init',
        (r) => r.raw,
      ),
    );
    await vi.waitFor(() => expect(result.current.data).toBe('r-1'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(calls).toBe(2);
    expect(result.current.data).toBe('r-2');
  });

  it('refresh() silently swallows errors (data stays at last good value)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        if (calls === 1) return HttpResponse.json({ raw: 'good' });
        return HttpResponse.json({ error: 'no' }, { status: 500 });
      }),
    );
    const { result } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, string>(
        '/api/silent',
        100000,
        'init',
        (r) => r.raw,
      ),
    );
    await vi.waitFor(() => expect(result.current.data).toBe('good'));
    await act(async () => {
      await expect(result.current.refresh()).resolves.toBeUndefined();
    });
    expect(result.current.data).toBe('good');
  });

  it('mapper updates are picked up by the next tick without restarting the timer', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        return HttpResponse.json({ raw: 'abc' });
      }),
    );
    const { result, rerender } = renderHook(
      ({ mapper }: { mapper: (r: { raw: string }) => string }) =>
        useSilentPollWithRefresh<{ raw: string }, string>(
          '/api/silent',
          1000,
          'init',
          mapper,
        ),
      { initialProps: { mapper: (r) => r.raw.toUpperCase() } },
    );
    await vi.waitFor(() => expect(result.current.data).toBe('ABC'));
    // Swap mapper without changing url/intervalMs. Effect should not
    // re-mount (no extra immediate fetch). New mapper applies on the
    // next tick.
    rerender({ mapper: (r) => r.raw.split('').join('-') });
    expect(calls).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await vi.waitFor(() => expect(result.current.data).toBe('a-b-c'));
  });

  it('clears the interval on unmount (no further polls)', async () => {
    let calls = 0;
    server.use(
      http.get('/api/silent', () => {
        calls++;
        return HttpResponse.json({ raw: 'x' });
      }),
    );
    const { unmount } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, string>(
        '/api/silent',
        1000,
        'init',
        (r) => r.raw,
      ),
    );
    await vi.waitFor(() => expect(calls).toBe(1));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(calls).toBe(1);
  });

  it('does not write into state after unmount even if a fetch is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/silent', async () => {
        await gate;
        return HttpResponse.json({ raw: 'late' });
      }),
    );
    const { result, unmount } = renderHook(() =>
      useSilentPollWithRefresh<{ raw: string }, string>(
        '/api/silent',
        1000,
        'init',
        (r) => r.raw,
      ),
    );
    expect(result.current.data).toBe('init');
    unmount();
    release();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.data).toBe('init');
  });
});
