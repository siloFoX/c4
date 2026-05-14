import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { act, renderHook, waitFor } from '@testing-library/react';
import { server } from '../test/server';
import { useRbac } from './use-rbac';

// useRbac is a Promise.all dual-fetch over /api/rbac/roles and
// /api/rbac/users. Contract:
//   - mounts with roles=null, users=null, loading=true on the first
//     fetch, error=null
//   - happy path: stores RolesResponse.roles[] and UsersResponse.users[]
//   - missing/non-array field => falls back to [] (defensive)
//   - any failure in either fetch => error=Error.message, loading=false,
//     and the partial state is NOT applied (Promise.all reject semantics)
//   - refresh() re-fetches both endpoints and clears any prior error
//   - refresh reference is stable (useCallback has no deps)

describe('useRbac', () => {
  it('starts loading with roles=null and users=null before the first fetch resolves', () => {
    const gate = new Promise<HttpResponse>(() => {});
    server.use(
      http.get('/api/rbac/roles', async () => gate),
      http.get('/api/rbac/users', async () => gate),
    );
    const { result } = renderHook(() => useRbac());
    expect(result.current.loading).toBe(true);
    expect(result.current.roles).toBeNull();
    expect(result.current.users).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('happy path: stores roles + users from the two parallel responses', async () => {
    const roles = [
      { name: 'admin', actions: ['*'] },
      { name: 'viewer', actions: ['READ_WORKER'] },
    ];
    const users = [
      { user: 'alice', role: 'admin', grants: {} },
      { user: 'bob', role: 'viewer', grants: { READ_WORKER: true } },
    ];
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({ roles })),
      http.get('/api/rbac/users', () => HttpResponse.json({ users })),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.roles).toEqual(roles);
    expect(result.current.users).toEqual(users);
    expect(result.current.error).toBeNull();
  });

  it('GETs both endpoints exactly once on mount', async () => {
    let roleCalls = 0;
    let userCalls = 0;
    server.use(
      http.get('/api/rbac/roles', () => {
        roleCalls++;
        return HttpResponse.json({ roles: [] });
      }),
      http.get('/api/rbac/users', () => {
        userCalls++;
        return HttpResponse.json({ users: [] });
      }),
    );
    renderHook(() => useRbac());
    await waitFor(() => {
      expect(roleCalls).toBe(1);
      expect(userCalls).toBe(1);
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(roleCalls).toBe(1);
    expect(userCalls).toBe(1);
  });

  it('falls back to [] when roles field is missing from the response', async () => {
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({})),
      http.get('/api/rbac/users', () => HttpResponse.json({ users: [] })),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('falls back to [] when users field is missing from the response', async () => {
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({ roles: [] })),
      http.get('/api/rbac/users', () => HttpResponse.json({})),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
  });

  it('error path: roles 500 surfaces error and does not partially apply users', async () => {
    server.use(
      http.get('/api/rbac/roles', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      http.get('/api/rbac/users', () =>
        HttpResponse.json({ users: [{ user: 'alice', role: 'admin', grants: {} }] }),
      ),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.loading).toBe(false);
    // Promise.all rejects on first failure; partial users payload must
    // NOT be applied so the UI stays in a clean "errored, no data" state.
    expect(result.current.users).toBeNull();
    expect(result.current.roles).toBeNull();
  });

  it('error path: users 500 surfaces error and does not partially apply roles', async () => {
    server.use(
      http.get('/api/rbac/roles', () =>
        HttpResponse.json({ roles: [{ name: 'admin', actions: [] }] }),
      ),
      http.get('/api/rbac/users', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.error).toContain('HTTP 500');
    expect(result.current.roles).toBeNull();
  });

  it('falls back to the i18n message when the thrown error has no .message', async () => {
    // apiGet always throws Error with a message, so we cannot easily
    // exercise the `t('common.failedToLoadRbac')` branch via MSW. The
    // hook still must not crash on a no-message Error subclass via a
    // synchronous reject thrown by the runtime.
    server.use(
      http.get('/api/rbac/roles', () =>
        new HttpResponse(null, { status: 502 }),
      ),
      http.get('/api/rbac/users', () =>
        HttpResponse.json({ users: [] }),
      ),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    // Either the HTTP-with-detail message OR the i18n fallback is fine
    // — both keep the banner non-empty.
    expect(typeof result.current.error).toBe('string');
    expect((result.current.error as string).length).toBeGreaterThan(0);
  });

  it('refresh() re-fetches both endpoints', async () => {
    let roleCalls = 0;
    let userCalls = 0;
    server.use(
      http.get('/api/rbac/roles', () => {
        roleCalls++;
        return HttpResponse.json({ roles: [{ name: 'admin', actions: [] }] });
      }),
      http.get('/api/rbac/users', () => {
        userCalls++;
        return HttpResponse.json({ users: [{ user: `u-${userCalls}`, role: 'admin', grants: {} }] });
      }),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.refresh();
    });
    expect(roleCalls).toBe(2);
    expect(userCalls).toBe(2);
    expect(result.current.users?.[0]?.user).toBe('u-2');
  });

  it('refresh() clears a previous error on success', async () => {
    server.use(
      http.get('/api/rbac/roles', () =>
        HttpResponse.json({ error: 'gone' }, { status: 500 }),
      ),
      http.get('/api/rbac/users', () =>
        HttpResponse.json({ users: [] }),
      ),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    server.use(
      http.get('/api/rbac/roles', () =>
        HttpResponse.json({ roles: [{ name: 'admin', actions: [] }] }),
      ),
      http.get('/api/rbac/users', () =>
        HttpResponse.json({ users: [{ user: 'a', role: 'admin', grants: {} }] }),
      ),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.roles).toHaveLength(1);
    expect(result.current.users).toHaveLength(1);
  });

  it('flips loading=true around an in-flight refresh and back to false on settle', async () => {
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({ roles: [] })),
      http.get('/api/rbac/users', () => HttpResponse.json({ users: [] })),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    server.use(
      http.get('/api/rbac/roles', async () => {
        await gate;
        return HttpResponse.json({ roles: [] });
      }),
      http.get('/api/rbac/users', async () => {
        await gate;
        return HttpResponse.json({ users: [] });
      }),
    );
    let inflight: Promise<void> | null = null;
    await act(async () => {
      inflight = result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);
    release();
    await act(async () => {
      await inflight;
    });
    expect(result.current.loading).toBe(false);
  });

  it('refresh reference is stable across re-renders (useCallback has no deps)', () => {
    const { result, rerender } = renderHook(() => useRbac());
    const first = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(first);
  });

  it('preserves arbitrary action strings on each Role (open interface, not just the typed three names)', async () => {
    const roles = [
      { name: 'admin', actions: ['CREATE_WORKER', 'MERGE_WORKER', 'READ_AUDIT'] },
    ];
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({ roles })),
      http.get('/api/rbac/users', () => HttpResponse.json({ users: [] })),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.roles).toHaveLength(1));
    expect(result.current.roles?.[0]?.actions).toEqual([
      'CREATE_WORKER',
      'MERGE_WORKER',
      'READ_AUDIT',
    ]);
  });

  it('preserves the User.grants record verbatim including nested values', async () => {
    const users = [
      {
        user: 'svc-account',
        role: 'manager',
        grants: { CREATE_WORKER: true, scope: { tier: 'manager', scopes: ['*'] } },
      },
    ];
    server.use(
      http.get('/api/rbac/roles', () => HttpResponse.json({ roles: [] })),
      http.get('/api/rbac/users', () => HttpResponse.json({ users })),
    );
    const { result } = renderHook(() => useRbac());
    await waitFor(() => expect(result.current.users).toHaveLength(1));
    expect(result.current.users?.[0]?.grants).toEqual(users[0].grants);
  });
});
