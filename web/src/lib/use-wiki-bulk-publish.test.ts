import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useWikiBulkPublish } from './use-wiki-bulk-publish';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(
  overrides: Partial<Parameters<typeof useWikiBulkPublish>[0]> = {},
): Parameters<typeof useWikiBulkPublish>[0] {
  return {
    runSearch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function okResponse(extra: Record<string, unknown> = {}) {
  return { written: [], skipped: [], wikiRoot: '/w', ...extra };
}

describe('useWikiBulkPublish', () => {
  it('starts idle: all flags false, message null', () => {
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    expect(result.current.bulkBusy).toBe(false);
    expect(result.current.bulkMsg).toBeNull();
    expect(result.current.bulkFailed).toBe(false);
    expect(result.current.bulkGitCommit).toBe(false);
    expect(result.current.bulkGitPush).toBe(false);
  });

  it('toggleBulkGitCommit(true) sets commit without touching push', () => {
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    act(() => result.current.toggleBulkGitCommit(true));
    expect(result.current.bulkGitCommit).toBe(true);
    expect(result.current.bulkGitPush).toBe(false);
  });

  it('toggleBulkGitCommit(false) cascades push off (the coupling invariant)', () => {
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    act(() => result.current.toggleBulkGitPush(true));
    expect(result.current.bulkGitCommit).toBe(true);
    expect(result.current.bulkGitPush).toBe(true);
    act(() => result.current.toggleBulkGitCommit(false));
    expect(result.current.bulkGitCommit).toBe(false);
    expect(result.current.bulkGitPush).toBe(false);
  });

  it('toggleBulkGitPush(true) cascades commit on (cannot push without committing)', () => {
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    act(() => result.current.toggleBulkGitPush(true));
    expect(result.current.bulkGitPush).toBe(true);
    expect(result.current.bulkGitCommit).toBe(true);
  });

  it('toggleBulkGitPush(false) leaves commit alone', () => {
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    act(() => result.current.toggleBulkGitCommit(true));
    act(() => result.current.toggleBulkGitPush(true));
    act(() => result.current.toggleBulkGitPush(false));
    expect(result.current.bulkGitCommit).toBe(true);
    expect(result.current.bulkGitPush).toBe(false);
  });

  it('aborts before any fetch when window.confirm is denied', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/wiki/publish-all', () => {
        calls++;
        return HttpResponse.json(okResponse());
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiBulkPublish(args));
    await act(async () => {
      await result.current.handleBulkPublish();
    });
    expect(calls).toBe(0);
    expect(result.current.bulkBusy).toBe(false);
    expect(result.current.bulkMsg).toBeNull();
    expect(args.runSearch).not.toHaveBeenCalled();
  });

  it('happy path: POSTs { gitCommit, gitPush } to /api/wiki/publish-all, re-runs search, surfaces success message', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: { gitCommit?: boolean; gitPush?: boolean } | null = null;
    server.use(
      http.post('/api/wiki/publish-all', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(
          okResponse({ written: ['a.md', 'b.md'], skipped: ['c.md'] }),
        );
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiBulkPublish(args));
    act(() => result.current.toggleBulkGitPush(true));
    await act(async () => {
      await result.current.handleBulkPublish();
    });
    expect(body).toEqual({ gitCommit: true, gitPush: true });
    expect(args.runSearch).toHaveBeenCalledTimes(1);
    expect(result.current.bulkFailed).toBe(false);
    expect(result.current.bulkMsg).toBeTruthy();
    expect(result.current.bulkMsg).toContain('2');
    expect(result.current.bulkMsg).toContain('1');
  });

  it('default toggles produce { gitCommit:false, gitPush:false } on the wire', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let body: { gitCommit?: boolean; gitPush?: boolean } | null = null;
    server.use(
      http.post('/api/wiki/publish-all', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json(okResponse());
      }),
    );
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    await act(async () => {
      await result.current.handleBulkPublish();
    });
    expect(body).toEqual({ gitCommit: false, gitPush: false });
  });

  it('appends git sha suffix to the success message when daemon reports a commit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/wiki/publish-all', () =>
        HttpResponse.json(
          okResponse({
            written: ['a.md'],
            git: { committed: true, sha: 'abcdef1234567890', pushed: true },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    await act(async () => {
      await result.current.handleBulkPublish();
    });
    // 7-char short sha is the documented format from the hook.
    expect(result.current.bulkMsg).toContain('abcdef1');
  });

  it('surfaces bulkFailed=true with a non-empty message on server error and does NOT re-run search', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.post('/api/wiki/publish-all', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useWikiBulkPublish(args));
    await act(async () => {
      await result.current.handleBulkPublish();
    });
    expect(result.current.bulkFailed).toBe(true);
    expect(result.current.bulkMsg).toBeTruthy();
    expect(args.runSearch).not.toHaveBeenCalled();
    expect(result.current.bulkBusy).toBe(false);
  });

  it('flips bulkBusy=true during the in-flight POST and back to false after release (busy slot)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/wiki/publish-all', async () => {
        await gate;
        return HttpResponse.json(okResponse());
      }),
    );
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleBulkPublish();
      await Promise.resolve();
    });
    expect(result.current.bulkBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.bulkBusy).toBe(false);
  });

  it('a parallel handleBulkPublish issued while the first is gated still fires a second POST (no internal guard)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/wiki/publish-all', async () => {
        calls++;
        await gate;
        return HttpResponse.json(okResponse());
      }),
    );
    const { result } = renderHook(() => useWikiBulkPublish(makeArgs()));
    let first: Promise<void> | null = null;
    let second: Promise<void> | null = null;
    await act(async () => {
      first = result.current.handleBulkPublish();
      await Promise.resolve();
    });
    expect(result.current.bulkBusy).toBe(true);
    expect(calls).toBe(1);
    await act(async () => {
      second = result.current.handleBulkPublish();
      await Promise.resolve();
    });
    expect(calls).toBe(2);
    release();
    await act(async () => {
      await first;
      await second;
    });
    expect(result.current.bulkBusy).toBe(false);
  });
});
