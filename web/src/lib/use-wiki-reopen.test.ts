import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useWikiReopen } from './use-wiki-reopen';
import type { ReadResponse } from '../components/WikiView';

function makeArgs(
  overrides: Partial<Parameters<typeof useWikiReopen>[0]> = {},
): Parameters<typeof useWikiReopen>[0] {
  return {
    setPage: vi.fn(),
    runSearch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

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

const REOPEN_RESPONSE = {
  meeting: { id: 'm-99', status: 'pending' },
  contextSeeds: [{ path: 'related-a' }, { path: 'related-b' }],
  originalUpdated: true,
};

describe('useWikiReopen', () => {
  it('starts idle: not busy, no message, not failed', () => {
    const { result } = renderHook(() => useWikiReopen(makeArgs()));
    expect(result.current.reopenBusy).toBe(false);
    expect(result.current.reopenMsg).toBeNull();
    expect(result.current.reopenFailed).toBe(false);
    expect(typeof result.current.handleReopen).toBe('function');
  });

  it('short-circuits without any side-effect when relPath is empty', async () => {
    let calls = 0;
    server.use(
      http.post('/api/wiki/reopen', () => {
        calls++;
        return HttpResponse.json(REOPEN_RESPONSE);
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen('');
    });
    expect(calls).toBe(0);
    expect(args.setPage).not.toHaveBeenCalled();
    expect(args.runSearch).not.toHaveBeenCalled();
    expect(result.current.reopenBusy).toBe(false);
  });

  it('happy path: POSTs /api/wiki/reopen + /api/wiki/read with { path }, calls setPage(fresh), runSearch, and surfaces a success message', async () => {
    const reopenBodies: Array<{ path?: string }> = [];
    const readBodies: Array<{ path?: string }> = [];
    const fresh = makePage('decisions/auth.md', { body: 'flipped frontmatter' });
    server.use(
      http.post('/api/wiki/reopen', async ({ request }) => {
        reopenBodies.push((await request.json()) as { path?: string });
        return HttpResponse.json(REOPEN_RESPONSE);
      }),
      http.post('/api/wiki/read', async ({ request }) => {
        readBodies.push((await request.json()) as { path?: string });
        return HttpResponse.json(fresh);
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen('decisions/auth.md');
    });
    expect(reopenBodies).toEqual([{ path: 'decisions/auth.md' }]);
    expect(readBodies).toEqual([{ path: 'decisions/auth.md' }]);
    expect(args.setPage).toHaveBeenCalledTimes(1);
    expect(args.setPage).toHaveBeenCalledWith(fresh);
    expect(args.runSearch).toHaveBeenCalledTimes(1);
    expect(result.current.reopenFailed).toBe(false);
    expect(result.current.reopenMsg).toBeTruthy();
    // i18n: "wiki.reopen.success" interpolates the new meeting id + seed count.
    expect(result.current.reopenMsg).toContain('m-99');
    expect(result.current.reopenMsg).toContain('2');
  });

  it('forwards a path containing special characters verbatim in the body (JSON body, no encoding required)', async () => {
    const weird = 'subdir with space/x&y.md';
    let body: { path?: string } | null = null;
    server.use(
      http.post('/api/wiki/reopen', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(REOPEN_RESPONSE);
      }),
      http.post('/api/wiki/read', () => HttpResponse.json(makePage(weird))),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen(weird);
    });
    expect(body).toEqual({ path: weird });
  });

  it('marks reopenFailed=true on /api/wiki/reopen server error and never calls setPage or runSearch', async () => {
    server.use(
      http.post('/api/wiki/reopen', () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen('missing.md');
    });
    expect(result.current.reopenFailed).toBe(true);
    expect(result.current.reopenMsg).toBeTruthy();
    expect(args.setPage).not.toHaveBeenCalled();
    expect(args.runSearch).not.toHaveBeenCalled();
    expect(result.current.reopenBusy).toBe(false);
  });

  it('marks reopenFailed=true when the follow-up /api/wiki/read fails after a successful reopen', async () => {
    server.use(
      http.post('/api/wiki/reopen', () => HttpResponse.json(REOPEN_RESPONSE)),
      http.post('/api/wiki/read', () =>
        HttpResponse.json({ error: 'read failed' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen('decisions/auth.md');
    });
    expect(result.current.reopenFailed).toBe(true);
    expect(result.current.reopenMsg).toBeTruthy();
    // The /reopen path itself succeeded, but the catch overrides the
    // success message with a failure message — setPage/runSearch never
    // execute because the await throws.
    expect(args.setPage).not.toHaveBeenCalled();
    expect(args.runSearch).not.toHaveBeenCalled();
  });

  it('flips reopenBusy=true during the in-flight reopen and back to false after release (busy slot)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/wiki/reopen', async () => {
        await gate;
        return HttpResponse.json(REOPEN_RESPONSE);
      }),
      http.post('/api/wiki/read', () =>
        HttpResponse.json(makePage('decisions/auth.md')),
      ),
    );
    const { result } = renderHook(() => useWikiReopen(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleReopen('decisions/auth.md');
      await Promise.resolve();
    });
    expect(result.current.reopenBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.reopenBusy).toBe(false);
  });

  it('a parallel handleReopen issued while the first is gated still fires a second reopen POST (no internal guard)', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/wiki/reopen', async () => {
        calls++;
        await gate;
        return HttpResponse.json(REOPEN_RESPONSE);
      }),
      http.post('/api/wiki/read', () =>
        HttpResponse.json(makePage('decisions/auth.md')),
      ),
    );
    const { result } = renderHook(() => useWikiReopen(makeArgs()));
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleReopen('decisions/auth.md');
      await Promise.resolve();
    });
    expect(calls).toBe(1);
    expect(result.current.reopenBusy).toBe(true);
    await act(async () => {
      second = result.current.handleReopen('decisions/auth.md');
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.reopenBusy).toBe(false);
  });

  it('clears stale failure state on a fresh successful run', async () => {
    server.use(
      http.post('/api/wiki/reopen', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiReopen(args));
    await act(async () => {
      await result.current.handleReopen('p1');
    });
    expect(result.current.reopenFailed).toBe(true);
    server.use(
      http.post('/api/wiki/reopen', () => HttpResponse.json(REOPEN_RESPONSE)),
      http.post('/api/wiki/read', () => HttpResponse.json(makePage('p1'))),
    );
    await act(async () => {
      await result.current.handleReopen('p1');
    });
    expect(result.current.reopenFailed).toBe(false);
    expect(args.setPage).toHaveBeenCalledTimes(1);
    expect(args.runSearch).toHaveBeenCalledTimes(1);
  });
});
