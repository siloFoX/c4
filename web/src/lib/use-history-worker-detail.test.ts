import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useHistoryWorkerDetail } from './use-history-worker-detail';

type Args = Parameters<typeof useHistoryWorkerDetail>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    selected: null,
    setError: vi.fn(),
    ...overrides,
  };
}

function makeDetail(name: string) {
  return {
    name,
    records: [],
    alive: true,
    status: 'idle',
    branch: `c4/${name}`,
    worktree: `/tmp/wt-${name}`,
    scrollback: null,
  };
}

describe('useHistoryWorkerDetail', () => {
  it('stays null when selected is null and never hits the server', async () => {
    let calls = 0;
    server.use(
      http.get('/api/history/:name', () => {
        calls++;
        return HttpResponse.json(makeDetail('w1'));
      }),
    );
    const args = makeArgs({ selected: null });
    const { result } = renderHook(() => useHistoryWorkerDetail(args));
    expect(result.current).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
    expect(args.setError).not.toHaveBeenCalled();
  });

  it('fetches GET /api/history/:name and surfaces the detail on success', async () => {
    server.use(
      http.get('/api/history/:name', ({ params }) =>
        HttpResponse.json(makeDetail(String(params.name))),
      ),
    );
    const args = makeArgs({ selected: 'w1' });
    const { result } = renderHook(() => useHistoryWorkerDetail(args));
    await waitFor(() => {
      expect(result.current?.name).toBe('w1');
    });
    expect(result.current?.branch).toBe('c4/w1');
    expect(args.setError).toHaveBeenLastCalledWith(null);
  });

  it('applies encodeURIComponent on the selected name in the URL', async () => {
    let calledUrl = '';
    server.use(
      http.get('/api/history/:name', ({ request, params }) => {
        calledUrl = request.url;
        return HttpResponse.json(makeDetail(String(params.name)));
      }),
    );
    const args = makeArgs({ selected: 'foo bar/baz' });
    const { result } = renderHook(() => useHistoryWorkerDetail(args));
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });
    const pathname = new URL(calledUrl).pathname;
    expect(pathname).toBe('/api/history/foo%20bar%2Fbaz');
    expect(pathname).not.toContain(' ');
  });

  it('refetches when selected flips to a different name', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/history/:name', ({ params }) => {
        const name = String(params.name);
        seen.push(name);
        return HttpResponse.json(makeDetail(name));
      }),
    );
    const { result, rerender } = renderHook(
      ({ a }: { a: Args }) => useHistoryWorkerDetail(a),
      { initialProps: { a: makeArgs({ selected: 'w1' }) } },
    );
    await waitFor(() => {
      expect(result.current?.name).toBe('w1');
    });
    rerender({ a: makeArgs({ selected: 'w2' }) });
    await waitFor(() => {
      expect(result.current?.name).toBe('w2');
    });
    expect(seen).toEqual(['w1', 'w2']);
  });

  it('clears the detail back to null when selected flips to null', async () => {
    server.use(
      http.get('/api/history/:name', ({ params }) =>
        HttpResponse.json(makeDetail(String(params.name))),
      ),
    );
    const { result, rerender } = renderHook(
      ({ a }: { a: Args }) => useHistoryWorkerDetail(a),
      { initialProps: { a: makeArgs({ selected: 'w1' }) } },
    );
    await waitFor(() => {
      expect(result.current?.name).toBe('w1');
    });
    rerender({ a: makeArgs({ selected: null }) });
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('does NOT call the server when selected flips to null', async () => {
    let calls = 0;
    server.use(
      http.get('/api/history/:name', ({ params }) => {
        calls++;
        return HttpResponse.json(makeDetail(String(params.name)));
      }),
    );
    const { rerender } = renderHook(
      ({ a }: { a: Args }) => useHistoryWorkerDetail(a),
      { initialProps: { a: makeArgs({ selected: 'w1' }) } },
    );
    await waitFor(() => {
      expect(calls).toBe(1);
    });
    rerender({ a: makeArgs({ selected: null }) });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });

  it('surfaces the error message via setError on a non-ok response', async () => {
    server.use(
      http.get('/api/history/:name', () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 }),
      ),
    );
    const args = makeArgs({ selected: 'missing' });
    const { result } = renderHook(() => useHistoryWorkerDetail(args));
    await waitFor(() => {
      const calls = (args.setError as ReturnType<typeof vi.fn>).mock.calls;
      const lastArg = calls.length ? calls[calls.length - 1]?.[0] : undefined;
      expect(typeof lastArg).toBe('string');
      expect(String(lastArg)).toMatch(/HTTP 404/);
    });
    expect(result.current).toBeNull();
  });

  it('keeps the prior detail when a follow-up fetch fails (no clear)', async () => {
    let n = 0;
    server.use(
      http.get('/api/history/:name', ({ params }) => {
        n++;
        if (n === 1) {
          return HttpResponse.json(makeDetail(String(params.name)));
        }
        return HttpResponse.json({ error: 'bad' }, { status: 500 });
      }),
    );
    const args = makeArgs({ selected: 'w1' });
    const { result, rerender } = renderHook(
      ({ a }: { a: Args }) => useHistoryWorkerDetail(a),
      { initialProps: { a: args } },
    );
    await waitFor(() => {
      expect(result.current?.name).toBe('w1');
    });
    rerender({ a: { ...args, selected: 'w2' } });
    await waitFor(() => {
      const calls = (args.setError as ReturnType<typeof vi.fn>).mock.calls;
      const lastArg = calls.length ? calls[calls.length - 1]?.[0] : undefined;
      expect(typeof lastArg).toBe('string');
    });
    expect(result.current?.name).toBe('w1');
  });
});
