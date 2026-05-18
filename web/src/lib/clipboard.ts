import { useCallback, useEffect, useRef } from 'react';

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
//
// (v1.11.365, TODO 11.347) Adds the Toast-feedback layer
// (`copyWithToast`) and the keyboard hook (`useCopyShortcut`)
// so adoption sites can opt into a consistent "Copy <label>"
// rhythm + Cmd+C/Ctrl+C behaviour without re-writing the
// success/failure plumbing.

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

// (v1.11.365, TODO 11.347) Toast-feedback wrapper.

export type CopyToastTone = 'success' | 'error' | 'info' | 'warning';

export type CopyShowToast = (
  message: string,
  tone: CopyToastTone,
) => unknown;

export interface CopyWithToastOptions {
  // Visible name suffix in the toast string. The success
  // toast reads "Copied <label>"; the failure toast reads
  // "Failed to copy <label>". When omitted, both fall back
  // to a generic "Copied" / "Failed to copy".
  label?: string;
  // The toast plumbing. Pass `useToast()`'s `showToast` here
  // -- both signatures (the legacy `(message, type)` shape
  // and the new generic shape) compose, so this works with
  // every existing `useToast`-based host.
  showToast?: CopyShowToast | null | undefined;
  // Override messages for callers that need a custom string
  // (e.g. "Copied 5 IDs", "Failed to copy: clipboard locked").
  // When set, these take precedence over the label-derived
  // defaults.
  successMessage?: string;
  errorMessage?: string;
  // Per-attempt callbacks. Fire AFTER the toast so callers can
  // chain into other UI (e.g. focus return, undo banner).
  onCopy?: (text: string) => void;
  onError?: (err: Error) => void;
}

export interface CopyWithToastResult extends CopyClipboardResult {
  // Convenience flag for callers that want to know whether a
  // toast was actually emitted (i.e. `showToast` was wired).
  toasted: boolean;
}

function defaultSuccessMessage(label: string | undefined): string {
  return label ? `Copied ${label}` : 'Copied';
}

function defaultErrorMessage(label: string | undefined): string {
  return label ? `Failed to copy ${label}` : 'Failed to copy';
}

export async function copyWithToast(
  text: string,
  options: CopyWithToastOptions = {},
): Promise<CopyWithToastResult> {
  const { label, showToast, onCopy, onError } = options;
  const result = await copyTextToClipboardWithError(text);
  let toasted = false;
  if (result.ok) {
    if (showToast) {
      showToast(
        options.successMessage ?? defaultSuccessMessage(label),
        'success',
      );
      toasted = true;
    }
    onCopy?.(text);
  } else {
    if (showToast) {
      showToast(
        options.errorMessage ?? defaultErrorMessage(label),
        'error',
      );
      toasted = true;
    }
    onError?.(result.error ?? new Error('Clipboard unavailable'));
  }
  return { ...result, toasted };
}

// ----- Keyboard shortcut hook -----------------------------------

// (v1.11.365, TODO 11.347) Cmd+C / Ctrl+C shortcut for a
// "selected row" surface. The host page passes the value the
// operator's selection should yield to the clipboard plus a
// toggle (`enabled`) that the parent flips when the row is in
// the selected state.
//
// The hook:
//   - Listens at `window` so it fires anywhere except inside an
//     input / textarea / contenteditable (the browser's native
//     Cmd+C handles those, the hook must not interfere).
//   - No-ops when the user is currently selecting text -- the
//     browser's native Cmd+C wins so the operator can copy a
//     sub-range without losing the row.
//   - Calls `event.preventDefault()` ONLY when it is about to
//     fire the copy. Other Cmd+C presses pass through.

const INTERACTIVE_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
]);

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (INTERACTIVE_TAGS.has(target.tagName)) return true;
  // contenteditable surfaces (rich-text editors, terminals).
  // Walk up from the target so a span inside a contenteditable
  // div still counts.
  let cursor: Element | null = target;
  while (cursor) {
    if (cursor instanceof HTMLElement && cursor.isContentEditable) {
      return true;
    }
    cursor = cursor.parentElement;
  }
  return false;
}

function hasActiveTextSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection?.();
  if (!sel) return false;
  const text = sel.toString();
  return text.length > 0;
}

export interface UseCopyShortcutOptions {
  // The text written to the clipboard on Cmd+C / Ctrl+C.
  value: string;
  // When false the hook is a no-op (useful when the row is not
  // selected, so the shortcut does not fire for every page).
  enabled?: boolean;
  // Optional label / showToast plumbing forwarded to
  // copyWithToast.
  label?: string;
  showToast?: CopyShowToast | null;
  // Optional post-copy callback (same shape as
  // CopyButton.onCopy).
  onCopy?: (text: string) => void;
  onError?: (err: Error) => void;
}

export function useCopyShortcut(options: UseCopyShortcutOptions): void {
  const {
    value,
    enabled = true,
    label,
    showToast,
    onCopy,
    onError,
  } = options;
  // Refs let the hook keep a stable window listener; the
  // listener reads the latest value through the ref each
  // keypress so updates do not require a re-bind.
  const valueRef = useRef(value);
  const labelRef = useRef(label);
  const showToastRef = useRef(showToast);
  const onCopyRef = useRef(onCopy);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    valueRef.current = value;
    labelRef.current = label;
    showToastRef.current = showToast;
    onCopyRef.current = onCopy;
    onErrorRef.current = onError;
  }, [value, label, showToast, onCopy, onError]);

  const handler = useCallback((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key !== 'c' && event.key !== 'C') return;
    if (event.shiftKey || event.altKey) return;
    if (isInteractiveTarget(event.target)) return;
    if (hasActiveTextSelection()) return;
    event.preventDefault();
    void copyWithToast(valueRef.current, {
      ...(labelRef.current !== undefined ? { label: labelRef.current } : {}),
      ...(showToastRef.current !== undefined
        ? { showToast: showToastRef.current }
        : {}),
      ...(onCopyRef.current !== undefined ? { onCopy: onCopyRef.current } : {}),
      ...(onErrorRef.current !== undefined
        ? { onError: onErrorRef.current }
        : {}),
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, handler]);
}
