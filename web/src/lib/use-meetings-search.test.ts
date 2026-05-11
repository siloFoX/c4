import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingsSearch } from './use-meetings-search';

type Args = Parameters<typeof useMeetingsSearch>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    query: '',
    status: '',
    track: '',
    since: '',
    until: '',
    meetings: [],
    ...overrides,
  };
}

function makeSummary(id: string, overrides: Partial<Args['meetings'][number]> = {}) {
  return {
    id,
    status: 'pending' as const,
    track: 'standard',
    title: `Title ${id}`,
    currentStage: null,
    currentRound: 0,
    createdAt: '2026-05-11T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    snippet: '',
    ...overrides,
  } as Args['meetings'][number];
}

const EMPTY_SEARCH = {
  count: 0,
  query: '',
  offset: 0,
  total: 0,
  facets: { status: [], track: [] },
  results: [],
};

describe('useMeetingsSearch', () => {
  it('returns null result + not-searching when the query is empty', () => {
    const { result } = renderHook(() => useMeetingsSearch(makeArgs({ query: '' })));
    expect(result.current.searchResults).toBeNull();
    expect(result.current.searchFacets).toBeNull();
    expect(result.current.searchTotal).toBeNull();
    expect(result.current.searchError).toBeNull();
    expect(result.current.searching).toBe(false);
  });

  it('treats whitespace-only query the same as empty', () => {
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: '   ' })),
    );
    expect(result.current.searchResults).toBeNull();
  });

  it('fetches /api/meetings/search after the 250ms debounce with q+limit+facet+total', async () => {
    let qs = '';
    server.use(
      http.get('/api/meetings/search', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json(EMPTY_SEARCH);
      }),
    );
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'auth' })),
    );
    await waitFor(
      () => {
        expect(result.current.searchResults).not.toBeNull();
      },
      { timeout: 1500 },
    );
    expect(qs).toContain('q=auth');
    expect(qs).toContain('limit=50');
    expect(qs).toContain('facet=status%2Ctrack');
    expect(qs).toContain('total=1');
  });

  it('forwards optional status / track / since / until (with date suffix) when set', async () => {
    let qs = '';
    server.use(
      http.get('/api/meetings/search', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json(EMPTY_SEARCH);
      }),
    );
    renderHook(() =>
      useMeetingsSearch(
        makeArgs({
          query: 'x',
          status: 'completed',
          track: 'standard',
          since: '2026-05-01',
          until: '2026-05-11',
        }),
      ),
    );
    await waitFor(
      () => {
        expect(qs).toContain('status=completed');
        expect(qs).toContain('track=standard');
        expect(qs).toContain('since=2026-05-01T00');
        expect(qs).toContain('until=2026-05-11T00');
      },
      { timeout: 1500 },
    );
  });

  it('omits status / track / since / until when blank', async () => {
    let qs = '';
    server.use(
      http.get('/api/meetings/search', ({ request }) => {
        qs = new URL(request.url).search;
        return HttpResponse.json(EMPTY_SEARCH);
      }),
    );
    renderHook(() => useMeetingsSearch(makeArgs({ query: 'x' })));
    await waitFor(
      () => {
        expect(qs).toContain('q=x');
      },
      { timeout: 1500 },
    );
    expect(qs).not.toContain('status=');
    expect(qs).not.toContain('track=');
    expect(qs).not.toContain('since=');
    expect(qs).not.toContain('until=');
  });

  it('merges each result with the matching summary from `meetings` (preserves track/title, overrides snippet)', async () => {
    server.use(
      http.get('/api/meetings/search', () =>
        HttpResponse.json({
          count: 1,
          query: 'a',
          offset: 0,
          total: 1,
          facets: { status: [], track: [] },
          results: [
            {
              id: 'm1',
              status: 'pending',
              createdAt: '2026-05-11T00:00:00.000Z',
              updatedAt: '2026-05-11T00:00:00.000Z',
              snippet: 'highlighted <<a>>',
              rank: 1,
            },
          ],
        }),
      ),
    );
    const list = [
      makeSummary('m1', { track: 'full', title: 'Real Title' }),
    ];
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'a', meetings: list })),
    );
    await waitFor(
      () => {
        expect(result.current.searchResults).toHaveLength(1);
      },
      { timeout: 1500 },
    );
    const row = result.current.searchResults![0]!;
    expect(row.id).toBe('m1');
    expect(row.track).toBe('full');
    expect(row.title).toBe('Real Title');
    expect(row.snippet).toBe('highlighted <<a>>');
  });

  it('falls back to limited fields (track="?", title=id) for results not in the current `meetings` page', async () => {
    server.use(
      http.get('/api/meetings/search', () =>
        HttpResponse.json({
          count: 1,
          query: 'b',
          offset: 0,
          total: 1,
          facets: { status: [], track: [] },
          results: [
            {
              id: 'unknown-1',
              status: 'completed',
              createdAt: '2026-05-10T12:00:00.000Z',
              updatedAt: '2026-05-10T12:00:00.000Z',
              snippet: 'snippet text',
              rank: 1,
            },
          ],
        }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'b', meetings: [] })),
    );
    await waitFor(
      () => {
        expect(result.current.searchResults).toHaveLength(1);
      },
      { timeout: 1500 },
    );
    const row = result.current.searchResults![0]!;
    expect(row.id).toBe('unknown-1');
    expect(row.track).toBe('?');
    expect(row.title).toBe('unknown-1');
    expect(row.status).toBe('completed');
    expect(row.snippet).toBe('snippet text');
  });

  it('parses facets + total from the response', async () => {
    server.use(
      http.get('/api/meetings/search', () =>
        HttpResponse.json({
          count: 0,
          query: 'a',
          offset: 0,
          total: 42,
          facets: {
            status: [{ value: 'pending', count: 30 }],
            track: [{ value: 'standard', count: 15 }],
          },
          results: [],
        }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'a' })),
    );
    await waitFor(
      () => {
        expect(result.current.searchTotal).toBe(42);
      },
      { timeout: 1500 },
    );
    expect(result.current.searchFacets).toEqual({
      status: [{ value: 'pending', count: 30 }],
      track: [{ value: 'standard', count: 15 }],
    });
  });

  it('treats missing total as null (not 0) so the parent can hide the count', async () => {
    server.use(
      http.get('/api/meetings/search', () =>
        HttpResponse.json({
          count: 0,
          query: 'a',
          offset: 0,
          // no `total` field
          results: [],
        }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'a' })),
    );
    await waitFor(
      () => {
        expect(result.current.searchResults).not.toBeNull();
      },
      { timeout: 1500 },
    );
    expect(result.current.searchTotal).toBeNull();
  });

  it('surfaces the error message and returns an empty result list on server failure', async () => {
    server.use(
      http.get('/api/meetings/search', () =>
        HttpResponse.json({ error: 'bad query' }, { status: 400 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingsSearch(makeArgs({ query: 'x' })),
    );
    await waitFor(
      () => {
        expect(result.current.searchError).toBeTruthy();
      },
      { timeout: 1500 },
    );
    expect(result.current.searchResults).toEqual([]);
  });

  it('clears the cancelled debounce when query flips back to empty before it fires', async () => {
    let calls = 0;
    server.use(
      http.get('/api/meetings/search', () => {
        calls++;
        return HttpResponse.json(EMPTY_SEARCH);
      }),
    );
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useMeetingsSearch(makeArgs({ query: q })),
      { initialProps: { q: 'first' } },
    );
    rerender({ q: '' });
    // Wait past the 250ms debounce — neither query should have fired since
    // empty-query branch wins.
    await new Promise((r) => setTimeout(r, 400));
    expect(calls).toBe(0);
    expect(result.current.searchResults).toBeNull();
  });
});
