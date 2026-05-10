import { useCallback, useEffect, useState } from 'react';

// (v1.10.638) Reusable boolean toggle that auto-resets to false
// whenever the supplied `key` changes. Used by MeetingsView to
// close the contribute / fork forms on meeting selection
// change so half-typed input from meeting A doesn't leak to
// meeting B.
//
// (v1.10.758) Added `toggle` callback so callers can drop the
// inline `() => setOpen((v) => !v)` allocation at every render.

interface ResetOnChange {
  open: boolean;
  toggle: () => void;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
}

export function useToggleResetOnChange(key: unknown): ResetOnChange {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  useEffect(() => {
    setOpen(false);
  }, [key]);
  return { open, toggle, setOpen };
}
