import { useRef, type MutableRefObject } from 'react';

// (v1.10.741) Generic "live ref" — mirrors a state
// value into a ref every render so a closure that
// captures the ref can read the latest value
// without rebuilding the closure each render.
//
// Used by the parent page when an extracted hook
// needs to *read* the parent's selection state but
// shouldn't take a fresh callback dependency every
// time the selection changes (which would re-run
// the hook's internal effect loop).
//
// Pattern:
//   const [selected, setSelected] = useState(...);
//   const selectedRef = useLiveRef(selected);
//   useSomeHook({ getSelected: () => selectedRef.current });

export function useLiveRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
