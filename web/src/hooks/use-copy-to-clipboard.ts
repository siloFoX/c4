import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCopyToClipboardResult {
  copy: (text: string) => Promise<void>;
  copied: boolean;
  error: Error | null;
}

const DEFAULT_RESET_MS = 1500;

function fallbackCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  try {
    ta.select();
    const ok = document.execCommand('copy');
    return ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

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
    async (text: string): Promise<void> => {
      clearTimer();
      const hasClipboard =
        typeof navigator !== 'undefined' &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function';
      try {
        if (hasClipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          const ok = fallbackCopy(text);
          if (!ok) throw new Error('Clipboard API unavailable');
        }
        setError(null);
        setCopied(true);
        timerRef.current = setTimeout(() => {
          setCopied(false);
          timerRef.current = null;
        }, resetMs);
      } catch (e) {
        setCopied(false);
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [clearTimer, resetMs],
  );

  return { copy, copied, error };
}
