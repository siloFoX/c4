import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useWikiPage } from './use-wiki-page';
import type { ReadResponse } from '../components/WikiView';

function makePage(path: string, overrides: Partial<ReadResponse> = {}): ReadResponse {
  return {
    path,
    absolutePath: `/wiki/${path}`,
    frontmatter: {},
    body: `body of ${path}`,
    raw: `--- raw ${path}`,
    ...overrides,
  };
}

describe('useWikiPage', () => {
  it('starts idle when selectedPath is null: page=null, pageError=null, no fetch fires', async () => {
    let calls = 0;
    server.use(
      http.post('/api/wiki/read', () => {
        calls++;
        return HttpResponse.json(makePage('x'));
      }),
    );
    const { result } = renderHook(() => useWikiPage(null));
    expect(result.current.page).toBeNull();
    expect(result.current.pageError).toBeNull();
    expect(typeof result.current.setPage).toBe('function');
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it('treats empty string as no-selection (no fetch fires)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/wiki/read', () => {
        calls++;
        return HttpResponse.json(makePage('x'));
      }),
    );
    const { result } = renderHook(() => useWikiPage(''));
    expect(result.current.page).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });

  it('POSTs /api/wiki/read with { path } and stores the response in page when selectedPath is set', async () => {
    let body: { path?: string } | null = null;
    server.use(
      http.post('/api/wiki/read', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(makePage('decisions/auth.md', { body: 'hello' }));
      }),
    );
    const { result } = renderHook(() => useWikiPage('decisions/auth.md'));
    await waitFor(() => {
      expect(result.current.page).not.toBeNull();
    });
    expect(body).toEqual({ path: 'decisions/auth.md' });
    expect(result.current.page!.path).toBe('decisions/auth.md');
    expect(result.current.page!.body).toBe('hello');
    expect(result.current.pageError).toBeNull();
  });

  it('forwards path verbatim in the body (path is in JSON body, no URL encoding required)', async () => {
    let body: { path?: string } | null = null;
    const weird = 'subdir with space/x&y.md';
    server.use(
      http.post('/api/wiki/read', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(makePage(weird));
      }),
    );
    const { result } = renderHook(() => useWikiPage(weird));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    expect(body).toEqual({ path: weird });
    expect(result.current.page!.path).toBe(weird);
  });

  it('setPage replaces the page locally (used by Reopen to flip frontmatter without a refetch)', async () => {
    server.use(
      http.post('/api/wiki/read', () => HttpResponse.json(makePage('p1'))),
    );
    const { result } = renderHook(() => useWikiPage('p1'));
    await waitFor(() => expect(result.current.page).not.toBeNull());
    act(() => result.current.setPage(makePage('p1', { body: 'patched' })));
    expect(result.current.page!.body).toBe('patched');
    act(() => result.current.setPage(null));
    expect(result.current.page).toBeNull();
  });

  it('surfaces pageError on a non-ok response and leaves page null', async () => {
    server.use(
      http.post('/api/wiki/read', () =>
        HttpResponse.json({ error: 'not found' }, { status: 404 }),
      ),
    );
    const { result } = renderHook(() => useWikiPage('missing.md'));
    await waitFor(() => {
      expect(result.current.pageError).toBeTruthy();
    });
    expect(result.current.page).toBeNull();
  });

  it('discards a stale in-flight response when selectedPath flips before the first resolves', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/wiki/read', async ({ request }) => {
        const body = (await request.json()) as { path: string };
        if (body.path === 'p1') {
          await gate;
          return HttpResponse.json(makePage('p1', { body: 'STALE' }));
        }
        return HttpResponse.json(makePage('p2', { body: 'FRESH' }));
      }),
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useWikiPage(p),
      { initialProps: { p: 'p1' as string | null } },
    );
    rerender({ p: 'p2' });
    await waitFor(() => {
      expect(result.current.page).not.toBeNull();
      expect(result.current.page!.path).toBe('p2');
    });
    release();
    await new Promise((r) => setTimeout(r, 30));
    // The stale p1 response would have called setPage('p1') if not for the
    // cancelled flag. Confirm we are still pinned to p2.
    expect(result.current.page!.path).toBe('p2');
    expect(result.current.page!.body).toBe('FRESH');
  });

  it('resets page to null when selectedPath flips back to null after a previous load', async () => {
    let calls = 0;
    server.use(
      http.post('/api/wiki/read', () => {
        calls++;
        return HttpResponse.json(makePage('p1'));
      }),
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useWikiPage(p),
      { initialProps: { p: 'p1' as string | null } },
    );
    await waitFor(() => expect(result.current.page).not.toBeNull());
    expect(calls).toBe(1);
    rerender({ p: null });
    await waitFor(() => {
      expect(result.current.page).toBeNull();
    });
    // The null-path branch must not fire another fetch.
    expect(calls).toBe(1);
  });

  it('clears the previous pageError on a successful follow-up load for a new path', async () => {
    server.use(
      http.post('/api/wiki/read', () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ p }: { p: string | null }) => useWikiPage(p),
      { initialProps: { p: 'missing.md' as string | null } },
    );
    await waitFor(() => expect(result.current.pageError).toBeTruthy());
    server.use(
      http.post('/api/wiki/read', () => HttpResponse.json(makePage('good.md'))),
    );
    rerender({ p: 'good.md' });
    await waitFor(() => {
      expect(result.current.page).not.toBeNull();
    });
    expect(result.current.pageError).toBeNull();
  });
});
