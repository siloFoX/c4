import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useDrawerKeyboard } from './use-drawer-keyboard';

afterEach(() => {
  vi.restoreAllMocks();
});

function dispatchKey(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
}

interface RenderArgs {
  open: boolean;
  onClose: () => void;
  element?: HTMLElement | null;
}

function renderDrawer(initial: RenderArgs) {
  return renderHook(
    ({ open, onClose, element }: RenderArgs) => {
      const ref = useRef<HTMLElement | null>(element ?? null);
      useDrawerKeyboard({ open, onClose, focusRef: ref });
      return ref;
    },
    { initialProps: initial },
  );
}

describe('useDrawerKeyboard', () => {
  it('does NOT register a keydown listener when open=false', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderDrawer({ open: false, onClose: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(0);
  });

  it('registers a keydown listener when open=true', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderDrawer({ open: true, onClose: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('keeps only one keydown listener across rerenders when args are stable', () => {
    const onClose = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderDrawer({ open: true, onClose });
    rerender({ open: true, onClose });
    rerender({ open: true, onClose });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('invokes onClose on Escape', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Escape keys', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    dispatchKey('Enter');
    dispatchKey('Tab');
    dispatchKey('ArrowDown');
    dispatchKey(' ');
    dispatchKey('a');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT invoke onClose on Escape when open=false (listener absent)', () => {
    const onClose = vi.fn();
    renderDrawer({ open: false, onClose });
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('schedules a focus on the ref via requestAnimationFrame when open=true', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const el = document.createElement('button');
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    try {
      renderDrawer({ open: true, onClose: vi.fn(), element: el });
      expect(raf).toHaveBeenCalledTimes(1);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      el.remove();
    }
  });

  it('does not throw when the focusRef is null (no element mounted yet)', async () => {
    expect(() => renderDrawer({ open: true, onClose: vi.fn(), element: null })).not.toThrow();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  });

  it('does not schedule an rAF when open=false', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    renderDrawer({ open: false, onClose: vi.fn() });
    expect(raf).not.toHaveBeenCalled();
  });

  it('cancels the pending rAF on unmount before it fires', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const el = document.createElement('button');
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    try {
      const { unmount } = renderDrawer({ open: true, onClose: vi.fn(), element: el });
      unmount();
      expect(cancel).toHaveBeenCalledTimes(1);
      // focus must not be called after unmount cancels the rAF
      expect(focus).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it('removes the keydown listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderDrawer({ open: true, onClose: vi.fn() });
    unmount();
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('detaches the listener when transitioning open=true -> false', () => {
    const onClose = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderDrawer({ open: true, onClose });
    rerender({ open: false, onClose });
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reattaches the listener when transitioning open=false -> true', () => {
    const onClose = vi.fn();
    const { rerender } = renderDrawer({ open: false, onClose });
    rerender({ open: true, onClose });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses the latest onClose closure after rerender', () => {
    let onClose = vi.fn();
    const { rerender } = renderDrawer({ open: true, onClose });
    const next = vi.fn();
    onClose = next;
    rerender({ open: true, onClose: next });
    dispatchKey('Escape');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fires onClose on Escape even with modifier keys held (no modifier guard on this hook)', () => {
    // Drawer Esc is intentionally unconditional - modifier combos still close.
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not focus when the ref points to an element whose focus() is unavailable (null ref guard)', async () => {
    // Sanity: open with element=undefined means ref.current=null after render.
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    // No throw, no callback - drawer just opens without a focus target.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(onClose).not.toHaveBeenCalled();
  });
});
