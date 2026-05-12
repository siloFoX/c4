import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useHistorySummary } from './use-history-summary';

type Args = Parameters<typeof useHistorySummary>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    query: '',
    statusFilter: '',
    sinceDay: '',
    untilDay: '',
    setError: vi.fn(),
    ...overrides,
  };
}

function makeWorker(name: string) {
  return {
    name,
    taskCount: 1,
    firstTaskAt: '2026-05-10T00:00:00.000Z',
    lastTaskAt: '2026-05-11T00:00:00.000Z',
    lastTask: 'do thing',
    lastStatus: 'idle',
    branches: [`c4/${name}`],
    alive: true,
    liveStatus: 'idle',
  };
}

describe('useHistorySummary', () => {
  it('starts with an empty summary array', () => {
    server.use(
      http.get('/api/history', () =>
        HttpResponse.json({ records: [], workers: [], total: 0 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useHistorySummary(args));
    expect(result.current.summary).toEqual([]);
    expect(typeof result.current.refresh).toBe('function');
  });

  it('fetches /api/history on mount with no query string when all filters are blank', async () => {
    let calledUrl = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        calledUrl = request.url;
        return HttpResponse.json({
          records: [],
          workers: [makeWorker('w1')],
          total: 1,
        });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(result.current.summary).toHaveLength(1);
    });
    expect(new URL(calledUrl).search).toBe('');
    expect(result.current.summary[0]?.name).toBe('w1');
    expect(args.setError).toHaveBeenLastCalledWith(null);
  });

  it('forwards query as ?q= when set', async () => {
    let qs = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const args = makeArgs({ query: 'auth' });
    renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(qs).toContain('q=auth');
    });
  });

  it('forwards statusFilter as ?status= when set', async () => {
    let qs = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const args = makeArgs({ statusFilter: 'completed' });
    renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(qs).toContain('status=completed');
    });
  });

  it('widens sinceDay to a full-UTC-day start and untilDay to day end', async () => {
    let qs = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const args = makeArgs({
      sinceDay: '2026-05-01',
      untilDay: '2026-05-11',
    });
    renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(qs).toContain('since=2026-05-01T00');
    });
    expect(qs).toContain('until=2026-05-11T23');
    expect(qs).toContain('59');
  });

  it('omits q / status / since / until keys when blank', async () => {
    let qs = '';
    server.use(
      http.get('/api/history', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const args = makeArgs();
    renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(qs).toBe('');
    });
    expect(qs).not.toContain('q=');
    expect(qs).not.toContain('status=');
    expect(qs).not.toContain('since=');
    expect(qs).not.toContain('until=');
  });

  it('falls back to [] when the response workers field is not an array', async () => {
    server.use(
      http.get('/api/history', () =>
        HttpResponse.json({ records: [], workers: null, total: 0 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(args.setError).toHaveBeenCalledWith(null);
    });
    expect(result.current.summary).toEqual([]);
  });

  it('surfaces the error message via setError on a non-ok response', async () => {
    server.use(
      http.get('/api/history', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      const calls = (args.setError as ReturnType<typeof vi.fn>).mock.calls;
      const lastArg = calls.length ? calls[calls.length - 1]?.[0] : undefined;
      expect(typeof lastArg).toBe('string');
      expect(String(lastArg)).toMatch(/HTTP 500/);
    });
  });

  it('refetches when query flips and clears setError on the new success', async () => {
    const seenQs: string[] = [];
    server.use(
      http.get('/api/history', ({ request }) => {
        seenQs.push(new URL(request.url).search);
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const args = makeArgs({ query: 'first' });
    const { rerender } = renderHook(({ a }: { a: Args }) => useHistorySummary(a), {
      initialProps: { a: args },
    });
    await waitFor(() => {
      expect(seenQs.some((s) => s.includes('q=first'))).toBe(true);
    });
    rerender({ a: { ...args, query: 'second' } });
    await waitFor(() => {
      expect(seenQs.some((s) => s.includes('q=second'))).toBe(true);
    });
  });

  it('refetches when statusFilter / sinceDay / untilDay change', async () => {
    const seenQs: string[] = [];
    server.use(
      http.get('/api/history', ({ request }) => {
        seenQs.push(new URL(request.url).search);
        return HttpResponse.json({ records: [], workers: [], total: 0 });
      }),
    );
    const initial = makeArgs();
    const { rerender } = renderHook(
      ({ a }: { a: Args }) => useHistorySummary(a),
      { initialProps: { a: initial } },
    );
    await waitFor(() => {
      expect(seenQs.length).toBeGreaterThanOrEqual(1);
    });
    rerender({ a: { ...initial, statusFilter: 'pending' } });
    await waitFor(() => {
      expect(seenQs.some((s) => s.includes('status=pending'))).toBe(true);
    });
    rerender({
      a: { ...initial, statusFilter: 'pending', sinceDay: '2026-05-01' },
    });
    await waitFor(() => {
      expect(seenQs.some((s) => s.includes('since=2026-05-01T00'))).toBe(true);
    });
    rerender({
      a: {
        ...initial,
        statusFilter: 'pending',
        sinceDay: '2026-05-01',
        untilDay: '2026-05-11',
      },
    });
    await waitFor(() => {
      expect(seenQs.some((s) => s.includes('until=2026-05-11T23'))).toBe(true);
    });
  });

  it('exposes refresh() so the parent can manually re-fetch', async () => {
    let count = 0;
    server.use(
      http.get('/api/history', () => {
        count++;
        return HttpResponse.json({
          records: [],
          workers: [makeWorker(`w${count}`)],
          total: count,
        });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useHistorySummary(args));
    await waitFor(() => {
      expect(result.current.summary[0]?.name).toBe('w1');
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.summary[0]?.name).toBe('w2');
  });
});
