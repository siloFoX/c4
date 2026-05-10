import { useCallback, useEffect, useRef, useState } from 'react';

// (v1.10.764) Shared infra for the "transient
// success / persistent failure" message strip used
// by handful of action hooks (export / rotate /
// publish / bulk publish / contribute / peer-retro).
//
// Shape:
//   - `msg`: current banner text, or null when blank.
//   - `failed`: true when the last set was a failure;
//     callers wire this to the destructive-tone class.
//   - `setSuccess(m, ms?)`: shows `m`, clears `failed`,
//     and auto-clears after `ms` (defaults to 4000).
//   - `setFailure(m)`: shows `m`, sets `failed`, and
//     does NOT auto-clear (operators need to read the
//     error before it disappears).
//   - `reset()`: clear immediately (used at the start
//     of a new action so a stale success banner
//     doesn't bleed into the next outcome).
//
// The hook owns a `setTimeout` ref so consecutive
// successes restart the timer rather than racing with
// a stale one. On unmount the timer is cleared so a
// fired timeout doesn't try to setState on a gone
// component.

interface AutoClearMessage {
  msg: string | null;
  failed: boolean;
  setSuccess: (msg: string, durationMs?: number) => void;
  setFailure: (msg: string) => void;
  reset: () => void;
}

export function useAutoClearMessage(defaultDurationMs: number = 4000): AutoClearMessage {
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setMsg(null);
    setFailed(false);
    clearTimer();
  }, [clearTimer]);

  const setSuccess = useCallback((m: string, durationMs?: number) => {
    setMsg(m);
    setFailed(false);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setMsg(null);
      timerRef.current = null;
    }, durationMs ?? defaultDurationMs);
  }, [clearTimer, defaultDurationMs]);

  const setFailure = useCallback((m: string) => {
    setMsg(m);
    setFailed(true);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { msg, failed, setSuccess, setFailure, reset };
}
