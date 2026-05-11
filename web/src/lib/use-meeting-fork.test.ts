import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingFork } from './use-meeting-fork';

function makeArgs(
  overrides: Partial<Parameters<typeof useMeetingFork>[0]> = {},
): Parameters<typeof useMeetingFork>[0] {
  return {
    meetingId: 'm1',
    onForked: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

const FORK_RESPONSE = {
  id: 'm2',
  status: 'ok',
  track: 'standard',
  title: 't',
  task: 'k',
};

describe('useMeetingFork', () => {
  it('starts with default state: mode=replan, blank fields, track=auto, not busy', () => {
    const { result } = renderHook(() => useMeetingFork(makeArgs()));
    expect(result.current.mode).toBe('replan');
    expect(result.current.task).toBe('');
    expect(result.current.title).toBe('');
    expect(result.current.track).toBe('auto');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('exposes setters for the four form fields', () => {
    const { result } = renderHook(() => useMeetingFork(makeArgs()));
    act(() => result.current.setMode('reuse'));
    expect(result.current.mode).toBe('reuse');
    act(() => result.current.setTask('new task'));
    expect(result.current.task).toBe('new task');
    act(() => result.current.setTitle('New Title'));
    expect(result.current.title).toBe('New Title');
    act(() => result.current.setTrack('standard'));
    expect(result.current.track).toBe('standard');
  });

  it('resets the entire form when meetingId changes (cross-selection leak guard)', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMeetingFork(makeArgs({ meetingId: id })),
      { initialProps: { id: 'm1' } },
    );
    act(() => {
      result.current.setMode('reuse');
      result.current.setTask('half-typed');
      result.current.setTitle('half-titled');
      result.current.setTrack('full');
    });
    expect(result.current.mode).toBe('reuse');
    expect(result.current.task).toBe('half-typed');
    rerender({ id: 'm2' });
    expect(result.current.mode).toBe('replan');
    expect(result.current.task).toBe('');
    expect(result.current.title).toBe('');
    expect(result.current.track).toBe('auto');
  });

  it('POSTs /api/meetings/<id>/fork with mode-only body when other fields are blank', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/meetings/:id/fork', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(FORK_RESPONSE);
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingFork(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(body).toEqual({ mode: 'replan' });
    expect(args.onForked).toHaveBeenCalledWith('m2');
    expect(args.onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards trimmed task + title + track when mode=replan and track !== auto', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/meetings/:id/fork', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(FORK_RESPONSE);
      }),
    );
    const { result } = renderHook(() => useMeetingFork(makeArgs()));
    act(() => {
      result.current.setMode('replan');
      result.current.setTask('  do new x  ');
      result.current.setTitle('  My Title  ');
      result.current.setTrack('full');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(body).toEqual({
      mode: 'replan',
      task: 'do new x',
      title: 'My Title',
      track: 'full',
    });
  });

  it('omits track even when set if mode=reuse', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/meetings/:id/fork', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(FORK_RESPONSE);
      }),
    );
    const { result } = renderHook(() => useMeetingFork(makeArgs()));
    act(() => {
      result.current.setMode('reuse');
      result.current.setTrack('standard');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(body).toEqual({ mode: 'reuse' });
  });

  it('URL-encodes the meeting id in the fork path', async () => {
    let path = '';
    server.use(
      http.post('/api/meetings/:id/fork', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(FORK_RESPONSE);
      }),
    );
    const { result } = renderHook(() =>
      useMeetingFork(makeArgs({ meetingId: 'a/b c' })),
    );
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(path).toContain('a%2Fb%20c');
  });

  it('surfaces error and does NOT call onForked / onClose on server failure', async () => {
    server.use(
      http.post('/api/meetings/:id/fork', () =>
        HttpResponse.json({ error: 'bad' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useMeetingFork(args));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.error).toBeTruthy();
    expect(args.onForked).not.toHaveBeenCalled();
    expect(args.onClose).not.toHaveBeenCalled();
  });

  it('flips busy=true during in-flight and back to false on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.post('/api/meetings/:id/fork', async () => {
        await gate;
        return HttpResponse.json(FORK_RESPONSE);
      }),
    );
    const { result } = renderHook(() => useMeetingFork(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleSubmit();
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
