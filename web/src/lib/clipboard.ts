// (v1.11.251, TODO 11.233) Imperative copy-to-clipboard helper.
//
// Extracted out of `hooks/use-copy-to-clipboard.ts` so non-hook
// callers (class components like ErrorBoundary, or one-shot
// utility code) can drive the same write path -- with the same
// browser-Clipboard-API-then-textarea-fallback behaviour the
// hook offers -- without grabbing onto React state plumbing.
//
// The function returns the structured result so the hook can
// surface the original `writeText` rejection (a "permission
// denied" error reads better in the UI than a generic
// "Clipboard API unavailable"). The convenience wrapper
// `copyTextToClipboard()` returns the boolean for callers that
// do not care about the error reason.

export interface CopyClipboardResult {
  ok: boolean;
  error: Error | null;
}

export async function copyTextToClipboardWithError(
  text: string,
): Promise<CopyClipboardResult> {
  const hasClipboard =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function';
  if (hasClipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, error: null };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Try the fallback before reporting the writeText failure;
      // a sandboxed iframe rejects writeText but may still allow
      // execCommand('copy') -- if the fallback succeeds the
      // operator does not care about the API rejection.
      if (fallbackCopy(text)) return { ok: true, error: null };
      return { ok: false, error: err };
    }
  }
  if (fallbackCopy(text)) return { ok: true, error: null };
  return { ok: false, error: new Error('Clipboard API unavailable') };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  return (await copyTextToClipboardWithError(text)).ok;
}

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
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}
