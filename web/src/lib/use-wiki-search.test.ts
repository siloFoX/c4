import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWikiSearch } from './use-wiki-search';

function emptyResponse() {
  return { wikiRoot: '/w', query: '', type: 'any', total: 0, hits: [] };
}

describe('useWikiSearch', () => {
  it('exposes idle defaults after the initial mount-fetch settles', async () => {
    server.use(
      http.get('/api/wiki/search', () => HttpResponse.json(emptyResponse())),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => {
      expect(result.current.searching).toBe(false);
    });
    expect(result.current.query).toBe('');
    expect(result.current.type).toBe('any');
    expect(result.current.includeStale).toBe(false);
    expect(result.current.search).not.toBeNull();
    expect(result.current.searchError).toBeNull();
  });

  it('auto-fires an empty-query search on mount with type=any + limit=25 and no includeStale', async () => {
    const observed: string[] = [];
    server.use(
      http.get('/api/wiki/search', ({ request }) => {
        observed.push(new URL(request.url).search);
        return HttpResponse.json(emptyResponse());
      }),
    );
    renderHook(() => useWikiSearch());
    await waitFor(() => {
      expect(observed.length).toBeGreaterThanOrEqual(1);
    });
    const qs = observed[0]!;
    expect(qs).toContain('q=');
    expect(qs).toContain('type=any');
    expect(qs).toContain('limit=25');
    expect(qs).not.toContain('includeStale');
  });

  it('setQuery updates query and triggers a fresh fetch carrying the new q', async () => {
    const observed: string[] = [];
    server.use(
      http.get('/api/wiki/search', ({ request }) => {
        observed.push(new URL(request.url).search);
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(1));
    act(() => result.current.setQuery('auth'));
    expect(result.current.query).toBe('auth');
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2));
    expect(observed[observed.length - 1]).toContain('q=auth');
  });

  it('setType updates type and forwards it; setType("") omits the type key entirely', async () => {
    const observed: string[] = [];
    server.use(
      http.get('/api/wiki/search', ({ request }) => {
        observed.push(new URL(request.url).search);
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(1));
    act(() => result.current.setType('adr'));
    expect(result.current.type).toBe('adr');
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2));
    expect(observed[observed.length - 1]).toContain('type=adr');
    act(() => result.current.setType(''));
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(3));
    expect(observed[observed.length - 1]).not.toContain('type=');
  });

  it('setIncludeStale flips the flag and adds includeStale=1 only when true', async () => {
    const observed: string[] = [];
    server.use(
      http.get('/api/wiki/search', ({ request }) => {
        observed.push(new URL(request.url).search);
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(1));
    expect(observed[0]).not.toContain('includeStale');
    act(() => result.current.setIncludeStale(true));
    expect(result.current.includeStale).toBe(true);
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2));
    expect(observed[observed.length - 1]).toContain('includeStale=1');
    act(() => result.current.setIncludeStale(false));
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(3));
    expect(observed[observed.length - 1]).not.toContain('includeStale');
  });

  it('runSearch is invocable directly and produces another network call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/wiki/search', () => {
        calls++;
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await result.current.runSearch();
    });
    expect(calls).toBe(2);
  });

  it('URL-encodes the query via URLSearchParams (spaces + ampersand)', async () => {
    const observed: string[] = [];
    server.use(
      http.get('/api/wiki/search', ({ request }) => {
        observed.push(new URL(request.url).search);
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(1));
    act(() => result.current.setQuery('foo bar & baz'));
    await waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2));
    const qs = observed[observed.length - 1]!;
    expect(qs).toContain('q=foo+bar+%26+baz');
  });

  it('surfaces searchError and leaves search null on a non-ok response', async () => {
    server.use(
      http.get('/api/wiki/search', () =>
        HttpResponse.json({ error: 'bad' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => {
      expect(result.current.searchError).toBeTruthy();
    });
    expect(result.current.search).toBeNull();
    expect(result.current.searching).toBe(false);
  });

  it('clears a stale searchError when the next runSearch succeeds', async () => {
    server.use(
      http.get('/api/wiki/search', () =>
        HttpResponse.json({ error: 'bad' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(result.current.searchError).toBeTruthy());
    server.use(
      http.get('/api/wiki/search', () => HttpResponse.json(emptyResponse())),
    );
    await act(async () => {
      await result.current.runSearch();
    });
    expect(result.current.searchError).toBeNull();
    expect(result.current.search).not.toBeNull();
  });

  it('flips searching=true during the in-flight request and back to false after release (busy slot)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/wiki/search', async () => {
        await gate;
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => {
      expect(result.current.searching).toBe(true);
    });
    release();
    await waitFor(() => {
      expect(result.current.searching).toBe(false);
    });
    expect(result.current.search).not.toBeNull();
  });

  it('a manual runSearch issued while the first is still gated still produces a second network call', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/wiki/search', async () => {
        calls++;
        await gate;
        return HttpResponse.json(emptyResponse());
      }),
    );
    const { result } = renderHook(() => useWikiSearch());
    await waitFor(() => expect(calls).toBe(1));
    expect(result.current.searching).toBe(true);
    let inflight: Promise<void> | null = null;
    act(() => {
      inflight = result.current.runSearch();
    });
    await waitFor(() => expect(calls).toBe(2));
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.searching).toBe(false);
  });
});
