// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { useOptimisticMutation } from './use-optimistic-mutation';

// (v1.11.354, TODO 11.336) The hook orchestrates an
// optimistic state flip + async commit + rollback. Each
// branch (success / fail / kept-optimistic / projection
// reducer / projection value) gets a dedicated test.
//
// Tests compose `useState` + the hook inside a single
// renderHook host so the state-setter contract matches
// the production adoption shape.

afterEach(() => {
  vi.useRealTimers();
});

interface Row {
  id: string;
  status: 'todo' | 'doing' | 'done';
}

function makeRow(id: string, status: Row['status'] = 'todo'): Row {
  return { id, status };
}

function harness<TState>(initial: TState) {
  return renderHook(() => {
    const [state, setState] = useState<TState>(initial);
    const mutation = useOptimisticMutation<TState>({ state, setState });
    return { state, setState, ...mutation };
  });
}

describe('useOptimisticMutation', () => {
  it('returns pending=false and error=null on initial mount', () => {
    const { result } = harness<Row[]>([]);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // (v1.11.354, TODO 11.336) Optimistic projection
  // applied + commit succeeds -> state stays as the
  // optimistic value when commit returns void.
  it('applies the optimistic projection synchronously and keeps it on success (commit returns void)', async () => {
    const rows = [makeRow('a'), makeRow('b')];
    const { result } = harness<Row[]>(rows);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev.map((r) => (r.id === 'a' ? { ...r, status: 'doing' } : r)),
        async () => {
          // Commit succeeds without returning a value.
        },
      );
    });
    expect(result.current.state).toEqual([
      makeRow('a', 'doing'),
      makeRow('b'),
    ]);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // (v1.11.354, TODO 11.336) Commit returns an
  // authoritative value -> state is replaced with that
  // value.
  it('replaces state with the commit result when commit resolves to a value', async () => {
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev.map((r) => ({ ...r, status: 'doing' as const })),
        async () => [makeRow('a', 'done'), makeRow('b', 'todo')],
      );
    });
    expect(result.current.state).toEqual([
      makeRow('a', 'done'),
      makeRow('b'),
    ]);
  });

  // (v1.11.354, TODO 11.336) Commit rejects -> state
  // rolls back to the snapshot, error is recorded.
  it('rolls back to the snapshot when commit rejects, and records the error', async () => {
    const initial = [makeRow('a'), makeRow('b')];
    const { result } = harness<Row[]>(initial);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev.filter((r) => r.id !== 'a'),
        async () => {
          throw new Error('boom');
        },
      );
    });
    expect(result.current.state).toEqual(initial);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.pending).toBe(false);
  });

  // (v1.11.354, TODO 11.336) keepOptimisticOnError opt-out.
  it('keeps the optimistic state on error when keepOptimisticOnError is true', async () => {
    const { result } = harness<Row[]>([makeRow('a'), makeRow('b')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev.filter((r) => r.id !== 'a'),
        async () => {
          throw new Error('still-pending');
        },
        { keepOptimisticOnError: true },
      );
    });
    expect(result.current.state).toEqual([makeRow('b')]);
    expect(result.current.error?.message).toBe('still-pending');
  });

  // (v1.11.354, TODO 11.336) Project value shape (not a
  // function).
  it('accepts a project VALUE (not a function) as the optimistic state', async () => {
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        [makeRow('a', 'done'), makeRow('z')],
        async () => undefined,
      );
    });
    expect(result.current.state).toEqual([
      makeRow('a', 'done'),
      makeRow('z'),
    ]);
  });

  // (v1.11.354, TODO 11.336) onSuccess / onError callbacks.
  it('invokes onSuccess with the resolved commit value', async () => {
    const onSuccess = vi.fn();
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev,
        async () => [makeRow('a', 'done')],
        { onSuccess },
      );
    });
    expect(onSuccess).toHaveBeenCalledWith([makeRow('a', 'done')]);
  });

  it('invokes onError with the rejected error and no resolution', async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev,
        async () => {
          throw new Error('nope');
        },
        { onError, onSuccess },
      );
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error)?.message).toBe('nope');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // (v1.11.354, TODO 11.336) pending flips true during
  // commit and back to false when the promise settles.
  it('flips pending true during the commit and false when it settles', async () => {
    let resolveCommit: ((v: void) => void) | null = null;
    const commit = () =>
      new Promise<void>((resolve) => {
        resolveCommit = resolve;
      });
    const { result } = harness<Row[]>([makeRow('a')]);
    let mutatePromise: Promise<void> | null = null;
    act(() => {
      mutatePromise = result.current.mutate(
        (prev) => prev,
        commit,
      );
    });
    // After mutate returns synchronously, pending=true
    // but the commit is still in-flight.
    expect(result.current.pending).toBe(true);
    await act(async () => {
      resolveCommit?.();
      await mutatePromise;
    });
    expect(result.current.pending).toBe(false);
  });

  // (v1.11.354, TODO 11.336) Reset clears the error /
  // pending state.
  it('reset clears the error and pending flags', async () => {
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev,
        async () => {
          throw new Error('boom');
        },
      );
    });
    expect(result.current.error).not.toBeNull();
    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  // (v1.11.354, TODO 11.336) Non-Error throws are
  // coerced into Error instances.
  it('coerces non-Error throws into Error instances', async () => {
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => prev,
        async () => {
          // eslint-disable-next-line no-throw-literal
          throw 'string error';
        },
      );
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
  });

  // (v1.11.354, TODO 11.336) Sequential mutates: the
  // second mutate sees the state that the first one
  // produced.
  it('the second mutate sees the state produced by the first mutate', async () => {
    const { result } = harness<Row[]>([makeRow('a')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => [...prev, makeRow('b')],
        async () => undefined,
      );
    });
    expect(result.current.state).toEqual([makeRow('a'), makeRow('b')]);
    await act(async () => {
      await result.current.mutate(
        (prev) => [...prev, makeRow('c')],
        async () => undefined,
      );
    });
    expect(result.current.state).toEqual([
      makeRow('a'),
      makeRow('b'),
      makeRow('c'),
    ]);
  });
});
