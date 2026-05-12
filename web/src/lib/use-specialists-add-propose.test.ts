import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSpecialistsAddPropose } from './use-specialists-add-propose';

afterEach(() => {
  vi.restoreAllMocks();
});

type Args = Parameters<typeof useSpecialistsAddPropose>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    onAdded: vi.fn(),
    ...overrides,
  };
}

describe('useSpecialistsAddPropose', () => {
  it('starts idle: empty json, no errors, no busy slots, not rejected', () => {
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    expect(result.current.json).toBe('');
    expect(result.current.addBusy).toBe(false);
    expect(result.current.addError).toBeNull();
    expect(result.current.proposeBusy).toBe(false);
    expect(result.current.proposeMsg).toBeNull();
    expect(result.current.proposeRejected).toBe(false);
  });

  it('setJson drives the json slot end-to-end', () => {
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setJson('{"id":"x"}'));
    expect(result.current.json).toBe('{"id":"x"}');
    act(() => result.current.setJson(''));
    expect(result.current.json).toBe('');
  });

  it('setAddError lets the parent clear stale errors without re-running a handler', () => {
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setAddError('explosion'));
    expect(result.current.addError).toBe('explosion');
    act(() => result.current.setAddError(null));
    expect(result.current.addError).toBeNull();
  });

  it('handleAdd: invalid JSON sets addError and never invokes fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/specialists', () => {
        calls++;
        return HttpResponse.json({ ok: true, specialist: { id: 's1' } });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{ not actually json'));
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(calls).toBe(0);
    expect(result.current.addError).toBeTruthy();
    expect(args.onAdded).not.toHaveBeenCalled();
    expect(result.current.addBusy).toBe(false);
    expect(result.current.json).toBe('{ not actually json');
  });

  it('handleAdd: POSTs the parsed JSON to /api/specialists, clears form, fires onAdded(id)', async () => {
    let body: unknown = null;
    let path = '';
    server.use(
      http.post('/api/specialists', async ({ request }) => {
        body = await request.json();
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true, specialist: { id: 's42' } });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{"name":"alice","skills":["x"]}'));
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(path).toBe('/api/specialists');
    expect(body).toEqual({ name: 'alice', skills: ['x'] });
    expect(args.onAdded).toHaveBeenCalledWith('s42');
    expect(result.current.json).toBe('');
    expect(result.current.addBusy).toBe(false);
    expect(result.current.addError).toBeNull();
  });

  it('handleAdd: missing specialist in response leaves form intact and skips onAdded', async () => {
    server.use(
      http.post('/api/specialists', () =>
        HttpResponse.json({ ok: true }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{"id":"x"}'));
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(args.onAdded).not.toHaveBeenCalled();
    expect(result.current.json).toBe('{"id":"x"}');
    expect(result.current.addBusy).toBe(false);
  });

  it('handleAdd: 400 server error sets addError, keeps json, skips onAdded', async () => {
    server.use(
      http.post('/api/specialists', () =>
        HttpResponse.json({ error: 'dup' }, { status: 400 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{"id":"x"}'));
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(result.current.addError).toBeTruthy();
    expect(args.onAdded).not.toHaveBeenCalled();
    expect(result.current.json).toBe('{"id":"x"}');
    expect(result.current.addBusy).toBe(false);
  });

  it('handleAdd: addBusy=true while request is in-flight (release-gate)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.post('/api/specialists', async () => {
        await gate;
        return HttpResponse.json({ ok: true, specialist: { id: 's1' } });
      }),
    );
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setJson('{}'));
    let inflight: Promise<void> | undefined;
    act(() => {
      inflight = result.current.handleAdd();
    });
    await waitFor(() => expect(result.current.addBusy).toBe(true));
    release();
    await act(async () => {
      await inflight!;
    });
    expect(result.current.addBusy).toBe(false);
  });

  it('handlePropose: invalid JSON sets addError and skips fetch', async () => {
    let calls = 0;
    server.use(
      http.post('/api/specialists/propose', () => {
        calls++;
        return HttpResponse.json({
          candidateId: 'c1',
          meetingId: 'm1',
          decision: { accepted: true, accepts: [], objects: [], reason: null },
          added: true,
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setJson('{ not actually json'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(calls).toBe(0);
    expect(result.current.addError).toBeTruthy();
    expect(result.current.proposeBusy).toBe(false);
    expect(result.current.proposeMsg).toBeNull();
  });

  it('handlePropose: accepted branch POSTs { candidate, brain:"mock" } to /api/specialists/propose, clears json, fires onAdded(candidateId)', async () => {
    let body: { candidate?: unknown; brain?: string } | null = null;
    let path = '';
    server.use(
      http.post('/api/specialists/propose', async ({ request }) => {
        body = (await request.json()) as typeof body;
        path = new URL(request.url).pathname;
        return HttpResponse.json({
          candidateId: 'cand-7',
          meetingId: 'meet-1',
          decision: {
            accepted: true,
            accepts: ['a', 'b'],
            objects: [],
            reason: null,
          },
          added: true,
        });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{"name":"x"}'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(path).toBe('/api/specialists/propose');
    expect(body).toEqual({ candidate: { name: 'x' }, brain: 'mock' });
    expect(args.onAdded).toHaveBeenCalledWith('cand-7');
    expect(result.current.json).toBe('');
    expect(result.current.proposeMsg).toBeTruthy();
    expect(result.current.proposeRejected).toBe(false);
    expect(result.current.proposeBusy).toBe(false);
    expect(result.current.addError).toBeNull();
  });

  it('handlePropose: rejected branch sets proposeRejected, keeps json, skips onAdded', async () => {
    server.use(
      http.post('/api/specialists/propose', () =>
        HttpResponse.json({
          candidateId: 'cand-2',
          meetingId: 'meet-3',
          decision: {
            accepted: false,
            accepts: [],
            objects: [],
            reason: 'too vague',
          },
          added: false,
        }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{"a":1}'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(args.onAdded).not.toHaveBeenCalled();
    expect(result.current.json).toBe('{"a":1}');
    expect(result.current.proposeMsg).toBeTruthy();
    expect(result.current.proposeRejected).toBe(true);
    expect(result.current.proposeBusy).toBe(false);
  });

  it('handlePropose: resets proposeMsg + proposeRejected before each call', async () => {
    let n = 0;
    server.use(
      http.post('/api/specialists/propose', () => {
        n++;
        if (n === 1) {
          return HttpResponse.json({
            candidateId: 'a',
            meetingId: 'm1',
            decision: { accepted: false, accepts: [], objects: [], reason: 'no' },
            added: false,
          });
        }
        return HttpResponse.json({
          candidateId: 'b',
          meetingId: 'm2',
          decision: { accepted: true, accepts: ['x'], objects: [], reason: null },
          added: true,
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setJson('{}'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(result.current.proposeRejected).toBe(true);
    act(() => result.current.setJson('{}'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(result.current.proposeRejected).toBe(false);
  });

  it('handlePropose: 500 server error surfaces via addError, leaves proposeMsg null, skips onAdded', async () => {
    server.use(
      http.post('/api/specialists/propose', () =>
        HttpResponse.json({ error: 'crash' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSpecialistsAddPropose(args));
    act(() => result.current.setJson('{}'));
    await act(async () => {
      await result.current.handlePropose();
    });
    expect(result.current.addError).toBeTruthy();
    expect(args.onAdded).not.toHaveBeenCalled();
    expect(result.current.proposeBusy).toBe(false);
    expect(result.current.proposeMsg).toBeNull();
  });

  it('handlePropose: proposeBusy=true while request is in-flight (release-gate)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    server.use(
      http.post('/api/specialists/propose', async () => {
        await gate;
        return HttpResponse.json({
          candidateId: 'a',
          meetingId: 'm',
          decision: { accepted: true, accepts: [], objects: [], reason: null },
          added: true,
        });
      }),
    );
    const { result } = renderHook(() => useSpecialistsAddPropose(makeArgs()));
    act(() => result.current.setJson('{}'));
    let inflight: Promise<void> | undefined;
    act(() => {
      inflight = result.current.handlePropose();
    });
    await waitFor(() => expect(result.current.proposeBusy).toBe(true));
    release();
    await act(async () => {
      await inflight!;
    });
    expect(result.current.proposeBusy).toBe(false);
  });
});
