import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useSessionsList } from './use-sessions-list';
import type { SessionSummary, AttachedSession } from '../components/SessionsView';

type Args = Parameters<typeof useSessionsList>[0];

function makeArgs(overrides: Partial<Args> = {}): Args {
  return {
    getSelection: vi.fn(() => null),
    onAutoSelect: vi.fn(),
    ...overrides,
  };
}

function makeSession(id: string): SessionSummary {
  return {
    projectDir: null,
    projectPath: null,
    sessionId: id,
    path: `/p/${id}`,
    updatedAt: null,
    size: 0,
    turnCount: 0,
    lastAssistantSnippet: '',
  };
}

function makeAttached(name: string): AttachedSession {
  return {
    name,
    jsonlPath: `/p/${name}.jsonl`,
    sessionId: null,
    projectPath: null,
    createdAt: null,
    lastOffset: 0,
  };
}

const okSessions = (ids: string[] = []) =>
  http.get('/api/sessions', () =>
    HttpResponse.json({
      rootDir: '/r',
      sessions: ids.map(makeSession),
      groups: [],
      total: ids.length,
    }),
  );

const okAttached = (rows: AttachedSession[] = []) =>
  http.get('/api/attach/list', () =>
    HttpResponse.json({ sessions: rows, total: rows.length }),
  );

describe('useSessionsList', () => {
  it('starts in the loading slot with data null, attached [], no errors before either fetch settles', async () => {
    let releaseSessions: () => void = () => {};
    const gate = new Promise<void>((r) => {
      releaseSessions = r;
    });
    server.use(
      http.get('/api/sessions', async () => {
        await gate;
        return HttpResponse.json({ rootDir: '/r', sessions: [], groups: [], total: 0 });
      }),
      okAttached(),
    );
    try {
      const { result } = renderHook(() => useSessionsList(makeArgs()));
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.attached).toEqual([]);
      expect(result.current.error).toBeNull();
      expect(result.current.attachError).toBeNull();
    } finally {
      releaseSessions();
    }
  });

  it('auto-selects the first session when getSelection() returns null on mount', async () => {
    server.use(okSessions(['s1', 's2']), okAttached());
    const args = makeArgs({ getSelection: vi.fn(() => null) });
    renderHook(() => useSessionsList(args));
    await waitFor(() => {
      expect(args.onAutoSelect).toHaveBeenCalledWith({ kind: 'session', id: 's1' });
    });
  });

  it('emits onAutoSelect(null) when getSelection() returns null AND the sessions list is empty', async () => {
    server.use(okSessions([]), okAttached());
    const args = makeArgs({ getSelection: vi.fn(() => null) });
    renderHook(() => useSessionsList(args));
    await waitFor(() => {
      expect(args.onAutoSelect).toHaveBeenCalledWith(null);
    });
  });

  it('skips onAutoSelect when getSelection() already returns a Selection', async () => {
    server.use(okSessions(['s1']), okAttached());
    const args = makeArgs({
      getSelection: vi.fn(() => ({ kind: 'session' as const, id: 'pre' })),
    });
    const { result } = renderHook(() => useSessionsList(args));
    await waitFor(() => {
      expect(result.current.data?.sessions[0]?.sessionId).toBe('s1');
    });
    expect(args.onAutoSelect).not.toHaveBeenCalled();
  });

  it('surfaces error and leaves data null when /api/sessions returns non-OK', async () => {
    server.use(
      http.get('/api/sessions', () =>
        HttpResponse.json({ error: 'down' }, { status: 500 }),
      ),
      okAttached(),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
  });

  it('clears error on the next successful refreshSessions() call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ error: 'down' }, { status: 500 });
        }
        return HttpResponse.json({ rootDir: '/r', sessions: [], groups: [], total: 0 });
      }),
      okAttached(),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    await act(async () => {
      await result.current.refreshSessions();
    });
    expect(result.current.error).toBeNull();
  });

  it('populates attached from /api/attach/list happy path', async () => {
    server.use(okSessions([]), okAttached([makeAttached('a')]));
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.attached).toHaveLength(1);
    });
    expect(result.current.attached[0]?.name).toBe('a');
    expect(result.current.attachError).toBeNull();
  });

  it('defaults attached to [] when response.sessions is not an array (Array.isArray guard)', async () => {
    server.use(
      okSessions([]),
      http.get('/api/attach/list', () =>
        HttpResponse.json({ sessions: null as unknown as AttachedSession[], total: 0 }),
      ),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.attached).toEqual([]);
    expect(result.current.attachError).toBeNull();
  });

  it('surfaces attachError on /api/attach/list failure (independent of sessions error)', async () => {
    server.use(
      okSessions([]),
      http.get('/api/attach/list', () =>
        HttpResponse.json({ error: 'attach-down' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.attachError).toBeTruthy();
    });
    expect(result.current.attached).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes setAttachError so the parent can set or clear it', () => {
    server.use(okSessions([]), okAttached());
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    act(() => result.current.setAttachError('manual'));
    expect(result.current.attachError).toBe('manual');
    act(() => result.current.setAttachError(null));
    expect(result.current.attachError).toBeNull();
  });

  it('refreshSessions() is re-invocable and updates data on each call', async () => {
    let calls = 0;
    server.use(
      http.get('/api/sessions', () => {
        calls += 1;
        return HttpResponse.json({ rootDir: '/r', sessions: [], groups: [], total: calls });
      }),
      okAttached(),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.data?.total).toBe(1);
    });
    await act(async () => {
      await result.current.refreshSessions();
    });
    expect(result.current.data?.total).toBe(2);
  });

  it('refreshAttached() is re-invocable and updates the attached list on each call', async () => {
    let count = 0;
    server.use(
      okSessions([]),
      http.get('/api/attach/list', () => {
        count += 1;
        const sessions = count === 1 ? [] : [makeAttached('b')];
        return HttpResponse.json({ sessions, total: sessions.length });
      }),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    await waitFor(() => {
      expect(result.current.attached).toEqual([]);
    });
    await act(async () => {
      await result.current.refreshAttached();
    });
    expect(result.current.attached).toHaveLength(1);
    expect(result.current.attached[0]?.name).toBe('b');
  });

  it('flips loading=false only after the /api/sessions promise settles (release-gate)', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/sessions', async () => {
        await gate;
        return HttpResponse.json({ rootDir: '/r', sessions: [], groups: [], total: 0 });
      }),
      okAttached(),
    );
    const { result } = renderHook(() => useSessionsList(makeArgs()));
    expect(result.current.loading).toBe(true);
    release();
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
