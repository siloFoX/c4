import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useMeetingContribute } from './use-meeting-contribute';

describe('useMeetingContribute', () => {
  it('starts with blank form, idle banner state', () => {
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    expect(result.current.specialist).toBe('');
    expect(result.current.text).toBe('');
    expect(result.current.vote).toBe('');
    expect(result.current.reason).toBe('');
    expect(result.current.busy).toBe(false);
    expect(result.current.msg).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it('exposes setters for all four form fields', () => {
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('hello');
      result.current.setVote('accept');
      result.current.setReason('looks good');
    });
    expect(result.current.specialist).toBe('s1');
    expect(result.current.text).toBe('hello');
    expect(result.current.vote).toBe('accept');
    expect(result.current.reason).toBe('looks good');
  });

  it('resets the entire form when meetingId changes (cross-selection guard)', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMeetingContribute({ meetingId: id }),
      { initialProps: { id: 'm1' } },
    );
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('half');
      result.current.setVote('object');
      result.current.setReason('half-typed');
    });
    rerender({ id: 'm2' });
    expect(result.current.specialist).toBe('');
    expect(result.current.text).toBe('');
    expect(result.current.vote).toBe('');
    expect(result.current.reason).toBe('');
  });

  it('handleContribute: rejects with failed=true when specialist or text is blank (no fetch)', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/:id/contribute', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleContribute();
    });
    expect(calls).toBe(0);
    expect(result.current.failed).toBe(true);
  });

  it('handleContribute: POSTs the trimmed payload with optional vote + reason', async () => {
    let body: { specialistId?: string; text?: string; vote?: string; reason?: string } | null = null;
    let path = '';
    server.use(
      http.post('/api/meetings/:id/contribute', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('  s1  ');
      result.current.setText('  body text  ');
      result.current.setVote('accept');
      result.current.setReason('  ok  ');
    });
    await act(async () => {
      await result.current.handleContribute();
    });
    expect(path).toBe('/api/meetings/m1/contribute');
    expect(body).toEqual({
      specialistId: 's1',
      text: 'body text',
      vote: 'accept',
      reason: 'ok',
    });
  });

  it('handleContribute: omits vote / reason when blank', async () => {
    let body: { vote?: string; reason?: string } | null = null;
    server.use(
      http.post('/api/meetings/:id/contribute', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('body');
    });
    await act(async () => {
      await result.current.handleContribute();
    });
    expect(body?.vote).toBeUndefined();
    expect(body?.reason).toBeUndefined();
  });

  it('handleContribute: clears text / vote / reason on success but keeps specialist (next turn convenience)', async () => {
    server.use(
      http.post('/api/meetings/:id/contribute', () => HttpResponse.json({ ok: true })),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('body');
      result.current.setVote('accept');
      result.current.setReason('ok');
    });
    await act(async () => {
      await result.current.handleContribute();
    });
    expect(result.current.specialist).toBe('s1');
    expect(result.current.text).toBe('');
    expect(result.current.vote).toBe('');
    expect(result.current.reason).toBe('');
    expect(result.current.failed).toBe(false);
  });

  it('handleContribute: failed=true on server error', async () => {
    server.use(
      http.post('/api/meetings/:id/contribute', () =>
        HttpResponse.json({ error: 'wrong stage' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('body');
    });
    await act(async () => {
      await result.current.handleContribute();
    });
    expect(result.current.failed).toBe(true);
  });

  it('handleVoteOnly: rejects with failed=true when specialist is blank', async () => {
    let calls = 0;
    server.use(
      http.post('/api/meetings/:id/vote', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    await act(async () => {
      await result.current.handleVoteOnly('accept');
    });
    expect(calls).toBe(0);
    expect(result.current.failed).toBe(true);
  });

  it('handleVoteOnly: POSTs to /vote with { specialistId, vote, reason? }', async () => {
    let body: { specialistId?: string; vote?: string; reason?: string } | null = null;
    let path = '';
    server.use(
      http.post('/api/meetings/:id/vote', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() => useMeetingContribute({ meetingId: 'm1' }));
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setReason('  veto reason  ');
    });
    await act(async () => {
      await result.current.handleVoteOnly('object');
    });
    expect(path).toBe('/api/meetings/m1/vote');
    expect(body).toEqual({
      specialistId: 's1',
      vote: 'object',
      reason: 'veto reason',
    });
    // Reason cleared after success.
    expect(result.current.reason).toBe('');
  });

  it('URL-encodes the meeting id in both endpoints', async () => {
    const paths = new Set<string>();
    server.use(
      http.post('/api/meetings/:id/contribute', ({ request }) => {
        paths.add(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }),
      http.post('/api/meetings/:id/vote', ({ request }) => {
        paths.add(new URL(request.url).pathname);
        return HttpResponse.json({ ok: true });
      }),
    );
    const { result } = renderHook(() =>
      useMeetingContribute({ meetingId: 'a/b c' }),
    );
    act(() => {
      result.current.setSpecialist('s1');
      result.current.setText('body');
    });
    await act(async () => {
      await result.current.handleContribute();
    });
    await act(async () => {
      await result.current.handleVoteOnly('accept');
    });
    expect(paths.size).toBe(2);
    for (const p of paths) expect(p).toContain('a%2Fb%20c');
  });
});
