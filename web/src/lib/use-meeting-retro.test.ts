import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingRetro } from './use-meeting-retro';

describe('useMeetingRetro', () => {
  it('starts idle: busy=null, no result, no error', () => {
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    expect(result.current.busy).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('preview branch POSTs /api/meetings/<id>/retro and stores the result', async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/:action', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ deltas: { foo: 1 }, applied: false });
      }),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRetro(false);
    });
    expect(path).toBe('/api/meetings/m1/retro');
    expect(result.current.result).toEqual({ deltas: { foo: 1 }, applied: false });
    expect(result.current.busy).toBeNull();
  });

  it('finalize branch POSTs /api/meetings/<id>/finalize and stores the result', async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/:action', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ applied: true, note: 'shipped' });
      }),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRetro(true);
    });
    expect(path).toBe('/api/meetings/m1/finalize');
    expect(result.current.result).toEqual({ applied: true, note: 'shipped' });
  });

  it('falls back to a "no payload" result when the daemon returns nothing', async () => {
    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json(null),
      ),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRetro(false);
    });
    expect(result.current.result).toEqual({ note: 'no payload' });
  });

  it("URL-encodes the meeting id when building the path", async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/:action', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() =>
      useMeetingRetro({ meetingId: 'a/b c' }),
    );
    await act(async () => {
      await result.current.handleRetro(false);
    });
    expect(path).toContain('a%2Fb%20c');
  });

  it('flips busy="preview" while a preview request is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/meetings/:id/:action', async () => {
        await gate;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleRetro(false);
      await Promise.resolve();
    });
    expect(result.current.busy).toBe('preview');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBeNull();
  });

  it('flips busy="finalize" while a finalize request is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/meetings/:id/:action', async () => {
        await gate;
        return HttpResponse.json({});
      }),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleRetro(true);
      await Promise.resolve();
    });
    expect(result.current.busy).toBe('finalize');
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.busy).toBeNull();
  });

  it('surfaces an error string on server failure (preview)', async () => {
    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useMeetingRetro({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleRetro(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.result).toBeNull();
  });

  it('resets result + error when meetingId changes (cross-selection guard)', async () => {
    server.use(
      http.post('/api/meetings/:id/:action', () =>
        HttpResponse.json({ applied: true }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMeetingRetro({ meetingId: id }),
      { initialProps: { id: 'm1' } },
    );
    await act(async () => {
      await result.current.handleRetro(true);
    });
    expect(result.current.result).toEqual({ applied: true });
    rerender({ id: 'm2' });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
