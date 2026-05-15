import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboardWithError } from '../lib/clipboard';

export interface CopyResult {
  ok: boolean;
  error: Error | null;
}

export interface UseCopyToClipboardResult {
  copy: (text: string) => Promise<CopyResult>;
  copied: boolean;
  error: Error | null;
}

const DEFAULT_RESET_MS = 1500;

// (v1.11.251, TODO 11.233) The imperative write path was lifted
// to `lib/clipboard.ts` so non-hook callers (class components,
// utility code) can share the same Clipboard-API + textarea
// fallback. This hook stays as the React-side state surface --
// it owns the `copied` pulse + the error mirror.
export function useCopyToClipboard(
  resetMs: number = DEFAULT_RESET_MS,
): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const copy = useCallback(
    async (text: string): Promise<CopyResult> => {
      clearTimer();
      const result = await copyTextToClipboardWithError(text);
      if (!result.ok) {
        setCopied(false);
        setError(result.error);
        return { ok: false, error: result.error };
      }
      setError(null);
      setCopied(true);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, resetMs);
      return { ok: true, error: null };
    },
    [clearTimer, resetMs],
  );

  return { copy, copied, error };
}
