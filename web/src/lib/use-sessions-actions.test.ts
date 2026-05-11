import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { server } from '../test/server';
import { useSessionsActions } from './use-sessions-actions';
import type { Selection } from '../components/SessionsView';

type Args = Parameters<typeof useSessionsActions>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    setSelection: vi.fn(),
    setAttachError: vi.fn(),
    refreshSessions: vi.fn(async () => {}),
    refreshAttached: vi.fn(async () => {}),
    ...overrides,
  };
}

const ATTACH_OK = {
  name: 'wkr',
  sessionId: 'sess-1',
  projectPath: '/p',
  jsonlPath: '/p/conv.jsonl',
  turns: 0,
  tokens: { input: 0, output: 0 },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSessionsActions', () => {
  it('starts idle: both modals closed, not busy, no errors', () => {
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    expect(result.current.modalOpen).toBe(false);
    expect(result.current.modalBusy).toBe(false);
    expect(result.current.modalError).toBeNull();
    expect(result.current.newChatOpen).toBe(false);
    expect(result.current.newChatBusy).toBe(false);
    expect(result.current.newChatError).toBeNull();
  });

  it('setModalOpen / setModalError flip the attach-modal slots', () => {
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    act(() => result.current.setModalOpen(true));
    expect(result.current.modalOpen).toBe(true);
    act(() => result.current.setModalError('oops'));
    expect(result.current.modalError).toBe('oops');
    act(() => result.current.setModalError(null));
    expect(result.current.modalError).toBeNull();
  });

  it('setNewChatOpen / setNewChatError flip the new-chat-modal slots', () => {
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    act(() => result.current.setNewChatOpen(true));
    expect(result.current.newChatOpen).toBe(true);
    act(() => result.current.setNewChatError('boom'));
    expect(result.current.newChatError).toBe('boom');
  });

  it('handleAttachSubmit with a bare id (no slash, no .jsonl) sends { sessionId }', async () => {
    let body: Record<string, string> | null = null;
    server.use(
      http.post('/api/attach', async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleAttachSubmit('abc123', '');
    });
    expect(body).toEqual({ sessionId: 'abc123' });
  });

  it('handleAttachSubmit with a .jsonl filename sends { path }', async () => {
    let body: Record<string, string> | null = null;
    server.use(
      http.post('/api/attach', async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleAttachSubmit('conv.jsonl', '');
    });
    expect(body).toEqual({ path: 'conv.jsonl' });
  });

  it('handleAttachSubmit with a forward-slash path sends { path }', async () => {
    let body: Record<string, string> | null = null;
    server.use(
      http.post('/api/attach', async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleAttachSubmit('/p/q/r', '');
    });
    expect(body).toEqual({ path: '/p/q/r' });
  });

  it('handleAttachSubmit with a backslash path sends { path }', async () => {
    let body: Record<string, string> | null = null;
    server.use(
      http.post('/api/attach', async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleAttachSubmit('C:\\Users\\silof', '');
    });
    expect(body).toEqual({ path: 'C:\\Users\\silof' });
  });

  it('handleAttachSubmit forwards a non-empty name and skips it when empty', async () => {
    let body: Record<string, string> | null = null;
    server.use(
      http.post('/api/attach', async ({ request }) => {
        body = (await request.json()) as Record<string, string>;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleAttachSubmit('s1', 'my-name');
    });
    expect(body).toEqual({ sessionId: 's1', name: 'my-name' });
    await act(async () => {
      await result.current.handleAttachSubmit('s2', '');
    });
    expect(body).toEqual({ sessionId: 's2' });
  });

  it('handleAttachSubmit success closes modal, refreshes attached, and selects the new worker', async () => {
    server.use(
      http.post('/api/attach', () =>
        HttpResponse.json({ ...ATTACH_OK, name: 'newwkr' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    act(() => result.current.setModalOpen(true));
    await act(async () => {
      await result.current.handleAttachSubmit('s1', '');
    });
    expect(result.current.modalOpen).toBe(false);
    expect(args.refreshAttached).toHaveBeenCalledTimes(1);
    expect(args.setSelection).toHaveBeenCalledWith({
      kind: 'attached',
      name: 'newwkr',
    });
    expect(result.current.modalBusy).toBe(false);
    expect(result.current.modalError).toBeNull();
  });

  it('handleAttachSubmit does NOT update selection when response has no name', async () => {
    server.use(
      http.post('/api/attach', () =>
        HttpResponse.json({ ...ATTACH_OK, name: '' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    await act(async () => {
      await result.current.handleAttachSubmit('s1', '');
    });
    expect(args.setSelection).not.toHaveBeenCalled();
  });

  it('handleAttachSubmit on server failure surfaces modalError, keeps modal open, clears busy', async () => {
    server.use(
      http.post('/api/attach', () =>
        HttpResponse.json({ error: 'bad path' }, { status: 400 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    act(() => result.current.setModalOpen(true));
    await act(async () => {
      await result.current.handleAttachSubmit('s1', '');
    });
    expect(result.current.modalError).toBeTruthy();
    expect(result.current.modalOpen).toBe(true);
    expect(result.current.modalBusy).toBe(false);
    expect(args.setSelection).not.toHaveBeenCalled();
    expect(args.refreshAttached).not.toHaveBeenCalled();
  });

  it('handleAttachSubmit flips modalBusy=true during the in-flight POST and back on resolve', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/attach', async () => {
        await gate;
        return HttpResponse.json(ATTACH_OK);
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleAttachSubmit('s1', '');
      await Promise.resolve();
    });
    expect(result.current.modalBusy).toBe(true);
    expect(result.current.modalError).toBeNull();
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.modalBusy).toBe(false);
  });

  it('handleNewChatSubmit with default model + agent omits model and profile keys', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/task', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ name: 'w1' });
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleNewChatSubmit({
        prompt: 'do x',
        model: 'default',
        agent: 'generic',
      });
    });
    expect(body).toEqual({ task: 'do x', autoMode: false });
  });

  it('handleNewChatSubmit forwards model/profile when not the default', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/task', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ name: 'w2' });
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleNewChatSubmit({
        prompt: 'x',
        model: 'opus',
        agent: 'manager',
      });
    });
    expect(body).toEqual({
      task: 'x',
      autoMode: false,
      model: 'opus',
      profile: 'manager',
    });
  });

  it('handleNewChatSubmit success closes modal and refreshes both lists', async () => {
    server.use(
      http.post('/api/task', () => HttpResponse.json({ name: 'w3' })),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    act(() => result.current.setNewChatOpen(true));
    await act(async () => {
      await result.current.handleNewChatSubmit({
        prompt: 'x',
        model: 'default',
        agent: 'generic',
      });
    });
    expect(result.current.newChatOpen).toBe(false);
    expect(args.refreshSessions).toHaveBeenCalledTimes(1);
    expect(args.refreshAttached).toHaveBeenCalledTimes(1);
    expect(result.current.newChatBusy).toBe(false);
    expect(result.current.newChatError).toBeNull();
  });

  it('handleNewChatSubmit when response body carries error: surface error, keep modal open, no refresh', async () => {
    server.use(
      http.post('/api/task', () =>
        HttpResponse.json({ error: 'rate limited' }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    act(() => result.current.setNewChatOpen(true));
    await act(async () => {
      await result.current.handleNewChatSubmit({
        prompt: 'x',
        model: 'default',
        agent: 'generic',
      });
    });
    expect(result.current.newChatError).toBe('rate limited');
    expect(result.current.newChatOpen).toBe(true);
    expect(args.refreshSessions).not.toHaveBeenCalled();
    expect(args.refreshAttached).not.toHaveBeenCalled();
    expect(result.current.newChatBusy).toBe(false);
  });

  it('handleNewChatSubmit on server failure surfaces newChatError and clears busy', async () => {
    server.use(
      http.post('/api/task', () =>
        HttpResponse.json({ error: 'bad' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    await act(async () => {
      await result.current.handleNewChatSubmit({
        prompt: 'x',
        model: 'default',
        agent: 'generic',
      });
    });
    expect(result.current.newChatError).toBeTruthy();
    expect(result.current.newChatBusy).toBe(false);
  });

  it('handleNewChatSubmit flips newChatBusy=true during the in-flight POST', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('/api/task', async () => {
        await gate;
        return HttpResponse.json({ name: 'w' });
      }),
    );
    const { result } = renderHook(() => useSessionsActions(makeArgs()));
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.handleNewChatSubmit({
        prompt: 'p',
        model: 'default',
        agent: 'generic',
      });
      await Promise.resolve();
    });
    expect(result.current.newChatBusy).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.newChatBusy).toBe(false);
  });

  it('handleDetach DELETEs /api/attach/<name> with URL-encoded name', async () => {
    let capturedPath = '';
    server.use(
      http.delete('/api/attach/:name', ({ request }) => {
        capturedPath = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true });
      }),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    await act(async () => {
      await result.current.handleDetach('a/b c');
    });
    // '/' -> %2F, ' ' -> %20 proves encodeURIComponent ran
    expect(capturedPath).toBe('/api/attach/a%2Fb%20c');
    expect(args.refreshAttached).toHaveBeenCalledTimes(1);
  });

  it('handleDetach clears the selection when the currently-selected attached matches the detached name', async () => {
    server.use(
      http.delete('/api/attach/:name', () => HttpResponse.json({ ok: true })),
    );
    let selection: Selection | null = { kind: 'attached', name: 'doomed' };
    const setSelection: Args['setSelection'] = (next) => {
      selection = typeof next === 'function' ? next(selection) : next;
    };
    const args = makeArgs({ setSelection });
    const { result } = renderHook(() => useSessionsActions(args));
    await act(async () => {
      await result.current.handleDetach('doomed');
    });
    expect(selection).toBeNull();
  });

  it('handleDetach leaves a non-matching selection untouched', async () => {
    server.use(
      http.delete('/api/attach/:name', () => HttpResponse.json({ ok: true })),
    );
    const keep: Selection = { kind: 'attached', name: 'other' };
    let selection: Selection | null = keep;
    const setSelection: Args['setSelection'] = (next) => {
      selection = typeof next === 'function' ? next(selection) : next;
    };
    const { result } = renderHook(() =>
      useSessionsActions(makeArgs({ setSelection })),
    );
    await act(async () => {
      await result.current.handleDetach('doomed');
    });
    expect(selection).toBe(keep);
  });

  it('handleDetach leaves a session-kind selection untouched (different kind)', async () => {
    server.use(
      http.delete('/api/attach/:name', () => HttpResponse.json({ ok: true })),
    );
    const keep: Selection = { kind: 'session', id: 'doomed' };
    let selection: Selection | null = keep;
    const setSelection: Args['setSelection'] = (next) => {
      selection = typeof next === 'function' ? next(selection) : next;
    };
    const { result } = renderHook(() =>
      useSessionsActions(makeArgs({ setSelection })),
    );
    await act(async () => {
      await result.current.handleDetach('doomed');
    });
    // Same name but kind='session' — must NOT clear.
    expect(selection).toBe(keep);
  });

  it('handleDetach on server failure routes the error to setAttachError (not modalError)', async () => {
    server.use(
      http.delete('/api/attach/:name', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    );
    const args = makeArgs();
    const { result } = renderHook(() => useSessionsActions(args));
    await act(async () => {
      await result.current.handleDetach('w1');
    });
    expect(args.setAttachError).toHaveBeenCalledTimes(1);
    const firstArg = (args.setAttachError as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(firstArg).toBeTruthy();
    // Failure path must not refresh: we don't want a half-applied state.
    expect(args.refreshAttached).not.toHaveBeenCalled();
    // modalError is reserved for attach modal; detach must not touch it.
    expect(result.current.modalError).toBeNull();
  });
});
