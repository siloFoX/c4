import { useCallback, useState } from 'react';

// (v1.10.757) Generic boolean toggle slot — the
// idiomatic React `useState(false) + setX(v => !v)`
// pair becomes a single `useToggle(initial?)` call.
// Also exposes the raw setter so the caller can flip
// via `set(true) / set(false)` from contexts where
// the toggle alone isn't enough (e.g. a parent
// callback that wants a known state, or a
// useEffect resetting on a key change).
//
// Returns a 3-tuple, deliberately matching the
// shape of `useState` so existing callers can
// `const [x, toggleX, setX] = useToggle();` and
// keep the parent's set call sites unchanged.

type ToggleHandle = [
  value: boolean,
  toggle: () => void,
  set: React.Dispatch<React.SetStateAction<boolean>>,
];

export function useToggle(initial: boolean = false): ToggleHandle {
  const [value, set] = useState(initial);
  const toggle = useCallback(() => set((v) => !v), []);
  return [value, toggle, set];
}
