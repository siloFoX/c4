import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingStateAction } from './use-meeting-state-action';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMeetingStateAction', () => {
  it('starts idle: busy=null, error=null', () => {
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    expect(result.current.busy).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('POSTs /api/meetings/<id>/<action> for the requested action', async () => {
    let capturedPath = '';
    server.use(
      http.post('/api/meetings/:id/:action', ({ params }) => {
        capturedPath = `/api/meetings/${params.id}/${params.action}`;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.fire('start');
    });
    expect(capturedPath).toBe('/api/meetings/m1/start');
    expect(result.current.error).toBeNull();
  });

  it('URL-encodes the meeting id when building the path', async () => {
    let capturedPath = '';
    server.use(
      http.post('/api/meetings/:id/:action', ({ request }) => {
        // Use the raw request URL — MSW decodes :id when populating
        // `params`, so we'd lose the %2F / %20 evidence otherwise.
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'a/b c' }),
    );
    await act(async () => {
      await result.current.fire('advance');
    });
    // '/' → %2F, ' ' → %20 — proves the hook ran encodeURIComponent.
    expect(capturedPath).toContain('a%2Fb%20c');
  });

  it('skips the POST when confirm prompt is rejected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    let calls = 0;
    server.use(
      http.post('/api/meetings/:id/:action', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.fire('abort', 'really?');
    });
    expect(calls).toBe(0);
    expect(result.current.busy).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('proceeds with POST when confirm prompt is accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let calls = 0;
    server.use(
      http.post('/api/meetings/:id/:action', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.fire('escalate', 'sure?');
    });
    expect(calls).toBe(1);
  });

  it('surfaces a string error on server failure', async () => {
    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json({ error: 'bad state' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.fire('next-round');
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.busy).toBeNull();
  });

  it('flips busy=<action> during the in-flight request and back to null on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/meetings/:id/:action', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.fire('start');
      await Promise.resolve();
    });
    expect(result.current.busy).toBe('start');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBeNull();
  });

  it('clears prior error on a fresh successful run', async () => {
    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() =>
      useMeetingStateAction({ meetingId: 'm1' }),
    );
    await act(async () => {
      await result.current.fire('start');
    });
    expect(result.current.error).toBeTruthy();

    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    await act(async () => {
      await result.current.fire('start');
    });
    expect(result.current.error).toBeNull();
  });
});
