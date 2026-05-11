import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingPeerRetro } from './use-meeting-peer-retro';

describe('useMeetingPeerRetro', () => {
  it('starts idle: not busy, no msg, not failed, brain=mock', () => {
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    expect(result.current.busy).toBe(false);
    expect(result.current.msg).toBeNull();
    expect(result.current.failed).toBe(false);
    expect(result.current.brain).toBe('mock');
  });

  it('exposes setBrain to flip the brain selection', () => {
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    act(() => result.current.setBrain('claude'));
    expect(result.current.brain).toBe('claude');
  });

  it('POSTs /api/meetings/<id>/peer-retro with { brain, apply: true }', async () => {
    let body: { brain?: string; apply?: boolean } | null = null;
    let path = '';
    server.use(
      http.post('/api/meetings/:id/peer-retro', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({
          peer: { raters: ['a', 'b'], ratees: ['c'], raw: [{ rater: 'a', ratee: 'c', rating: 4 }] },
          applied: { c: { score: 4 } },
        });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    act(() => result.current.setBrain('claude'));
    await act(async () => {
      await result.current.handlePeerRetro();
    });
    expect(path).toBe('/api/meetings/m1/peer-retro');
    expect(body).toEqual({ brain: 'claude', apply: true });
    expect(result.current.failed).toBe(false);
    expect(result.current.msg).toBeTruthy();
  });

  it('URL-encodes the meeting id in the peer-retro path', async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/peer-retro', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          peer: { raters: [], ratees: [], raw: [] },
          applied: null,
        });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'a/b c' }),
    );
    await act(async () => {
      await result.current.handlePeerRetro();
    });
    expect(path).toContain('a%2Fb%20c');
  });

  it('handles a payload without `applied` (null) without throwing', async () => {
    server.use(
      http.post('/api/meetings/:id/peer-retro', () =>
        HttpResponse.json({
          peer: { raters: ['a'], ratees: ['b'], raw: [{ rater: 'a', ratee: 'b', rating: 3 }] },
          applied: null,
        }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.handlePeerRetro();
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.msg).toBeTruthy();
  });

  it('handles a payload without `peer` (defensive defaults to 0 counts)', async () => {
    server.use(
      http.post('/api/meetings/:id/peer-retro', () =>
        HttpResponse.json({}),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.handlePeerRetro();
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.msg).toBeTruthy();
  });

  it('marks failed=true on server error and surfaces the error message', async () => {
    server.use(
      http.post('/api/meetings/:id/peer-retro', () =>
        HttpResponse.json({ error: 'no raters' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.handlePeerRetro();
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
      http.post('/api/meetings/:id/peer-retro', async () => {
        await gate;
        return HttpResponse.json({
          peer: { raters: [], ratees: [], raw: [] },
          applied: null,
        });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingPeerRetro({ meetingId: 'm1' }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handlePeerRetro();
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
