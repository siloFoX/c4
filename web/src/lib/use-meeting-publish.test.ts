import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingPublish } from './use-meeting-publish';

describe('useMeetingPublish', () => {
  it('starts idle: not busy, no msg, not failed, gitCommit=false, gitPush=false', () => {
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    expect(result.current.busy).toBe(false);
    expect(result.current.msg).toBeNull();
    expect(result.current.failed).toBe(false);
    expect(result.current.gitCommit).toBe(false);
    expect(result.current.gitPush).toBe(false);
  });

  it('toggleGitCommit(false) cascades gitPush off (push without commit is undefined)', () => {
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    act(() => result.current.toggleGitCommit(true));
    act(() => result.current.toggleGitPush(true));
    expect(result.current.gitPush).toBe(true);
    act(() => result.current.toggleGitCommit(false));
    expect(result.current.gitCommit).toBe(false);
    expect(result.current.gitPush).toBe(false);
  });

  it('toggleGitPush(true) cascades gitCommit on (push needs a commit)', () => {
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    expect(result.current.gitCommit).toBe(false);
    act(() => result.current.toggleGitPush(true));
    expect(result.current.gitCommit).toBe(true);
    expect(result.current.gitPush).toBe(true);
  });

  it('POSTs /api/meetings/<id>/publish with { includeRetro, apply, gitCommit, gitPush }', async () => {
    let body: { includeRetro?: boolean; apply?: boolean; gitCommit?: boolean; gitPush?: boolean } | null = null;
    let path = '';
    server.use(
      http.post('/api/meetings/:id/publish', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({
          ok: true, written: ['a.md', 'b.md'], wikiRoot: '/wiki',
        });
      }),
    );
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    act(() => result.current.toggleGitPush(true));  // also flips gitCommit on
    await act(async () => {
      await result.current.handlePublish();
    });
    expect(path).toBe('/api/meetings/m1/publish');
    expect(body).toEqual({
      includeRetro: true,
      apply: true,
      gitCommit: true,
      gitPush: true,
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.msg).toBeTruthy();
  });

  it('URL-encodes the meeting id', async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/publish', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true, written: [], wikiRoot: '/wiki' });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPublish({ meetingId: 'a/b c' }),
    );
    await act(async () => {
      await result.current.handlePublish();
    });
    expect(path).toContain('a%2Fb%20c');
  });

  it('appends the trimmed git sha to the success message when committed', async () => {
    server.use(
      http.post('/api/meetings/:id/publish', () =>
        HttpResponse.json({
          ok: true,
          written: ['a.md'],
          wikiRoot: '/wiki',
          git: { committed: true, sha: 'abc1234567890def' },
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handlePublish();
    });
    // SHA is sliced to first 7 chars by the hook.
    expect(result.current.msg).toContain('abc1234');
  });

  it('handles a missing-sha committed payload via fallback string', async () => {
    server.use(
      http.post('/api/meetings/:id/publish', () =>
        HttpResponse.json({
          ok: true,
          written: ['a.md'],
          wikiRoot: '/wiki',
          git: { committed: true },  // sha missing
        }),
      ),
    );
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handlePublish();
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.msg).toBeTruthy();
  });

  it('marks failed=true on server error', async () => {
    server.use(
      http.post('/api/meetings/:id/publish', () =>
        HttpResponse.json({ error: 'wiki conflict' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handlePublish();
    });
    expect(result.current.failed).toBe(true);
    expect(result.current.msg).toBeTruthy();
    expect(result.current.busy).toBe(false);
  });

  it('flips busy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/meetings/:id/publish', async () => {
        await gate;
        return HttpResponse.json({ ok: true, written: [], wikiRoot: '/wiki' });
      }),
    );
    const { result } = renderHook(() => useMeetingPublish({ meetingId: 'm1' }));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handlePublish();
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });
});
