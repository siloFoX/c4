import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { useXtermSearchHotkey } from './use-xterm-search-hotkey';

// useXtermSearchHotkey wires Ctrl+F / Cmd+F (open) and Escape
// (close-when-open) on the terminal container. The listener is
// scoped to the container so the chord does not hijack typing in
// the chat composer. preventDefault fires on the open chord so the
// browser's native find does not steal focus. The Escape-when-open
// branch is gated on the current searchOpen value, so the effect
// re-binds when that prop flips.

function makeContainer(): {
  ref: MutableRefObject<HTMLElement | null>;
  el: HTMLElement;
} {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const ref: MutableRefObject<HTMLElement | null> = { current: el };
  return { ref, el };
}

function keydown(
  el: HTMLElement,
  key: string,
  init: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(ev);
  return ev;
}

describe('useXtermSearchHotkey', () => {
  let scratch: HTMLElement[] = [];
  beforeEach(() => {
    scratch = [];
  });
  afterEach(() => {
    for (const el of scratch) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  it('returns nothing (void hook)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const { result } = renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen: vi.fn(),
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('fires setSearchOpen(true) on Ctrl+F when search is closed', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'f', { ctrlKey: true });
    expect(setSearchOpen).toHaveBeenCalledTimes(1);
    expect(setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('fires setSearchOpen(true) on Cmd+F (Mac convention via metaKey)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'f', { metaKey: true });
    expect(setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('is case-insensitive on the F key (uppercase F also opens)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'F', { ctrlKey: true });
    expect(setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('preventDefault is called on the Ctrl+F keydown', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen: vi.fn(),
      }),
    );
    const ev = keydown(el, 'f', { ctrlKey: true });
    expect(ev.defaultPrevented).toBe(true);
  });

  it('ignores plain F (no modifier)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'f');
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('ignores Ctrl+Shift+F (shift excluded from the open chord)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'f', { ctrlKey: true, shiftKey: true });
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('ignores Ctrl+Alt+F (alt excluded from the open chord)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'f', { ctrlKey: true, altKey: true });
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('fires setSearchOpen(false) on Escape when search is open', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: true,
        setSearchOpen,
      }),
    );
    keydown(el, 'Escape');
    expect(setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('ignores Escape when search is already closed', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    keydown(el, 'Escape');
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('no-ops when containerRef.current is null (no listener)', () => {
    const ref: MutableRefObject<HTMLElement | null> = { current: null };
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    // No container to attach to; nothing should fire.
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('does NOT fire on a keydown outside the container', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    const other = document.createElement('div');
    document.body.appendChild(other);
    scratch.push(other);
    keydown(other, 'f', { ctrlKey: true });
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount (no fire after teardown)', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermSearchHotkey({
        containerRef: ref,
        searchOpen: false,
        setSearchOpen,
      }),
    );
    unmount();
    keydown(el, 'f', { ctrlKey: true });
    expect(setSearchOpen).not.toHaveBeenCalled();
  });

  it('re-binds the listener when searchOpen flips so the Escape branch sees the fresh value', () => {
    const { ref, el } = makeContainer();
    scratch.push(el);
    const setSearchOpen = vi.fn();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useXtermSearchHotkey({
          containerRef: ref,
          searchOpen: open,
          setSearchOpen,
        }),
      { initialProps: { open: false } },
    );
    // Initial state: Escape is a no-op.
    keydown(el, 'Escape');
    expect(setSearchOpen).not.toHaveBeenCalled();
    // Flip to open; Escape now closes.
    rerender({ open: true });
    keydown(el, 'Escape');
    expect(setSearchOpen).toHaveBeenCalledWith(false);
  });
});
