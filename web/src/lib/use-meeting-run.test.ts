import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingRun } from './use-meeting-run';

describe('useMeetingRun', () => {
  it('starts idle: not busy, no error, brain=mock', () => {
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.brain).toBe('mock');
  });

  it('exposes setBrain to flip the brain selection', () => {
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    act(() => result.current.setBrain('claude'));
    expect(result.current.brain).toBe('claude');
    act(() => result.current.setBrain('mock'));
    expect(result.current.brain).toBe('mock');
  });

  it('POSTs /api/meetings/<id>/run with the current brain + autoFinalize', async () => {
    let capturedBody: unknown = null;
    let capturedPath = '';
    server.use(
      http.post('/api/meetings/:id/run', async ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    act(() => result.current.setBrain('claude'));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(capturedPath).toBe('/api/meetings/m1/run');
    expect(capturedBody).toEqual({ brain: 'claude', autoFinalize: true });
  });

  it('URL-encodes the meeting id in the run path', async () => {
    let capturedPath = '';
    server.use(
      http.post('/api/meetings/:id/run', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingRun({ meetingId: 'a/b c' }),
    );
    await act(async () => {
      await result.current.handleRun();
    });
    expect(capturedPath).toContain('a%2Fb%20c');
  });

  it('surfaces a string error on server failure', async () => {
    server.use(
      http.post('/api/meetings/:id/run', () =>
        HttpResponse.json({ error: 'already running' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.busy).toBe(false);
  });

  it('flips busy=true during the in-flight request and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/meetings/:id/run', async () => {
        await gate;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleRun();
      await Promise.resolve();
    });
    expect(result.current.busy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBe(false);
  });

  it('clears prior error on a fresh successful run', async () => {
    server.use(
      http.post('/api/meetings/:id/run', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingRun({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.error).toBeTruthy();

    server.use(
      http.post('/api/meetings/:id/run', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    await act(async () => {
      await result.current.handleRun();
    });
    expect(result.current.error).toBeNull();
  });
});
