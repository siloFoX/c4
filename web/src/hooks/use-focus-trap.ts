import { useEffect } from 'react';
import type { RefObject } from 'react';

export interface UseFocusTrapOptions {
  active?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  restoreFocusOnUnmount?: boolean;
  onEscape?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
  'summary:not(:disabled)',
  '[contenteditable=true]:not([disabled])',
].join(',');

function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}

export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T>,
  options?: UseFocusTrapOptions,
): void {
  const active = options?.active ?? true;
  const restoreFocusOnUnmount = options?.restoreFocusOnUnmount ?? true;
  const initialFocusRef = options?.initialFocusRef;
  const onEscape = options?.onEscape;

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const explicit = initialFocusRef?.current ?? null;
    if (explicit && typeof explicit.focus === 'function') {
      explicit.focus();
    } else {
      const focusables = getFocusables(container);
      if (focusables.length > 0) focusables[0].focus();
      else container.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = containerRef.current;
      if (!node) return;
      const focusables = getFocusables(node);
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (activeEl === first || !node.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (activeEl === last || !node.contains(activeEl)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (restoreFocusOnUnmount && previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, initialFocusRef, onEscape, restoreFocusOnUnmount]);
}
