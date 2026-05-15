import { useEffect, useRef } from 'react';

// (v1.11.250, TODO 11.232) Multi-key sequence shortcuts.
//
// Gives the app a Vim-style chord vocabulary (gg = top, gh =
// home, gw = workers, ...) on top of the existing single-key +
// modifier-combo shortcuts. The hook listens on `window` for
// plain-letter keydowns, accumulates them in a buffer, and fires
// the matching handler when the buffer reaches a configured
// sequence prefix. Anything that does not match an in-flight
// prefix resets the buffer. The buffer also expires on a
// 1.5 s inactivity timer (configurable via `timeoutMs`) so the
// next "g" press starts fresh after the operator gives up
// mid-chord.
//
// Why not roll this into useKeyboardShortcuts?
//   - The single-key path fires on every keydown; sequences
//     need state across keystrokes. Threading the buffer into
//     the global registry would cross two concerns.
//   - Editor-style modal keymaps want a separate enable / focus
//     gate (the chord hijacks plain letters, so it must be off
//     while the cursor sits in a text input). Keeping it in its
//     own hook lets each consumer flip the gate per surface.
//
// Focus guard: the hook is a no-op while focus lives on an
// INPUT / TEXTAREA / SELECT / contentEditable element so an
// operator typing in the chat composer does not trigger a
// navigation chord every time the word "growth" hits two g's.
// Modifiers (ctrl / meta / alt) also disable the chord -- those
// combos are reserved for the explicit shortcuts.

export type ShortcutSequenceMap = Record<string, () => void>;

export interface UseShortcutSequenceOptions {
  /** Inactivity timeout in ms. Default 1500. */
  timeoutMs?: number;
  /** When false the hook attaches no listeners (handy for tests / gating). */
  enabled?: boolean;
}

const DEFAULT_TIMEOUT_MS = 1500;

function isTextEntrySurface(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useShortcutSequence(
  sequences: ShortcutSequenceMap,
  options: UseShortcutSequenceOptions = {},
): void {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, enabled = true } = options;
  const seqRef = useRef(sequences);
  seqRef.current = sequences;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    let buffer = '';
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const resetBuffer = () => {
      buffer = '';
      if (resetTimer !== null) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
    };

    const scheduleReset = () => {
      if (resetTimer !== null) clearTimeout(resetTimer);
      resetTimer = setTimeout(resetBuffer, timeoutMs);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Modifier combos are owned by the explicit shortcut
        // registry; drop any in-flight chord so a Ctrl+F mid-
        // sequence does not poison the next press.
        resetBuffer();
        return;
      }
      if (isTextEntrySurface(e.target)) {
        resetBuffer();
        return;
      }
      // Only single printable letters / digits participate in a
      // sequence. Function keys, arrows, etc. reset the buffer.
      if (e.key.length !== 1) {
        resetBuffer();
        return;
      }
      const next = buffer + e.key.toLowerCase();
      const handlers = seqRef.current;
      // Check exact match first; if found, fire and clear.
      const exact = handlers[next];
      if (exact) {
        e.preventDefault();
        resetBuffer();
        try {
          exact();
        } catch {
          // Swallow handler errors so a bad nav callback does
          // not corrupt the buffer state for the next chord.
        }
        return;
      }
      // Otherwise keep buffering only if `next` is still a
      // prefix of SOME registered sequence; reset otherwise so
      // we do not stale-buffer across unrelated keystrokes.
      const isPrefix = Object.keys(handlers).some(
        (key) => key.length > next.length && key.startsWith(next),
      );
      if (isPrefix) {
        buffer = next;
        scheduleReset();
      } else {
        // Treat the new key as a fresh chord head.
        const restart = e.key.toLowerCase();
        const restartIsPrefix = Object.keys(handlers).some(
          (key) => key.length > 1 && key.startsWith(restart),
        );
        if (restartIsPrefix) {
          buffer = restart;
          scheduleReset();
        } else {
          resetBuffer();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      resetBuffer();
    };
  }, [enabled, timeoutMs]);
}
