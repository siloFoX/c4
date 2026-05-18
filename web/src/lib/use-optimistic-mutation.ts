import { useCallback, useRef, useState } from 'react';

// (v1.11.354, TODO 11.336) Optimistic-mutation hook.
//
// Many pages in c4 follow the same save flow:
//
//   1. Snapshot the current state.
//   2. Apply an optimistic projection so the UI updates
//      instantly.
//   3. Fire a server call (POST / PUT / DELETE).
//   4. On success, optionally replace the optimistic
//      state with the authoritative server response.
//   5. On error, roll back to the snapshot and record
//      the error.
//
// The pattern is identical across Queue (drag-reorder +
// status flip), Profiles (rename), Templates (save +
// activate), Snapshots (create), Notifications (clear).
// Re-implementing it per page leads to subtle bugs
// (forgotten finally block, mis-typed rollback, stale
// state captured by a closure). This hook standardises
// the contract.
//
// Adoption pattern:
//
//   const [rows, setRows] = useState<Row[] | null>(null);
//   const { mutate, pending, error } = useOptimisticMutation({
//     state: rows,
//     setState: setRows,
//   });
//
//   await mutate(
//     (prev) => prev.map((r) => r.id === id ? { ...r, status } : r),
//     async () => {
//       const data = await apiPost('/api/...', { ... });
//       return data.rows;  // optional authoritative replacement
//     },
//   );
//
// The first argument (`project`) accepts either a new
// state value OR a reducer function `(prev) => next`.
// The second argument (`commit`) returns either `void`
// (the optimistic state stays) or a `Promise<TState>`
// (the authoritative response replaces it).

export interface UseOptimisticMutationOpts<TState> {
  state: TState;
  setState: (next: TState) => void;
}

export interface MutateOptions<TState> {
  // Fired AFTER the commit resolves successfully. The
  // resolved value (when defined) is the
  // authoritative-state replacement.
  onSuccess?: (resolved: TState | void) => void;
  // Fired AFTER the commit rejects. The error is the
  // unchanged thrown value (not wrapped).
  onError?: (error: Error) => void;
  // When true, do NOT roll back on failure -- callers
  // that prefer "optimistic-wins-on-error" can opt out
  // of the rollback while still surfacing the error.
  // Default false.
  keepOptimisticOnError?: boolean;
}

export type Projection<TState> =
  | TState
  | ((prev: TState) => TState);

export interface UseOptimisticMutationReturn<TState> {
  mutate: (
    project: Projection<TState>,
    commit: () => Promise<TState | void>,
    options?: MutateOptions<TState>,
  ) => Promise<void>;
  pending: boolean;
  error: Error | null;
  reset: () => void;
}

function applyProjection<TState>(
  prev: TState,
  project: Projection<TState>,
): TState {
  if (typeof project === 'function') {
    return (project as (p: TState) => TState)(prev);
  }
  return project;
}

export function useOptimisticMutation<TState>(
  opts: UseOptimisticMutationOpts<TState>,
): UseOptimisticMutationReturn<TState> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest props via refs so the mutate
  // closure stays stable across renders. setState is
  // expected to be referentially stable
  // (useState's setter is) but state changes every
  // render and would otherwise stale-close.
  const stateRef = useRef<TState>(opts.state);
  stateRef.current = opts.state;
  const setStateRef = useRef(opts.setState);
  setStateRef.current = opts.setState;

  const mutate = useCallback(
    async (
      project: Projection<TState>,
      commit: () => Promise<TState | void>,
      options: MutateOptions<TState> = {},
    ): Promise<void> => {
      const snapshot = stateRef.current;
      const optimistic = applyProjection(snapshot, project);
      // Apply optimistic state synchronously so the
      // UI reflects the change immediately. setState
      // updates the ref via the live render's
      // effect, but we set it eagerly here too so the
      // ref reads consistent values in subsequent
      // mutate calls before React flushes.
      setStateRef.current(optimistic);
      stateRef.current = optimistic;

      setPending(true);
      setError(null);
      try {
        const resolved = await commit();
        if (resolved !== undefined) {
          setStateRef.current(resolved);
          stateRef.current = resolved;
        }
        if (options.onSuccess) options.onSuccess(resolved);
      } catch (raw) {
        const err = raw instanceof Error ? raw : new Error(String(raw));
        if (!options.keepOptimisticOnError) {
          setStateRef.current(snapshot);
          stateRef.current = snapshot;
        }
        setError(err);
        if (options.onError) options.onError(err);
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setPending(false);
  }, []);

  return { mutate, pending, error, reset };
}
