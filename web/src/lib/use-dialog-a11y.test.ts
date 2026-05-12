import { describe, it, expect, vi, afterEach } from 'vitest';
import { useRef } from 'react';
import { renderHook } from '@testing-library/react';
import { useDialogA11y } from './use-dialog-a11y';

afterEach(() => {
  vi.restoreAllMocks();
});

interface RenderArgs {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  element?: HTMLElement | null;
}

function render(initial: RenderArgs) {
  return renderHook(
    ({ open, busy, onCancel, element }: RenderArgs) => {
      const ref = useRef<HTMLElement | null>(element ?? null);
      useDialogA11y({ open, busy, onCancel, dialogRef: ref });
      return ref;
    },
    { initialProps: initial },
  );
}

function dispatchKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useDialogA11y', () => {
  it('does NOT register a keydown listener when open=false', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render({ open: false, busy: false, onCancel: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(0);
  });

  it('registers exactly one keydown listener when open=true', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render({ open: true, busy: false, onCancel: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('listener registration is idempotent across stable rerenders', () => {
    const onCancel = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender } = render({ open: true, busy: false, onCancel });
    rerender({ open: true, busy: false, onCancel });
    rerender({ open: true, busy: false, onCancel });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('invokes onCancel on Escape', () => {
    const onCancel = vi.fn();
    render({ open: true, busy: false, onCancel });
    dispatchKey('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls stopPropagation on Escape so a parent modal does not also close', () => {
    render({ open: true, busy: false, onCancel: vi.fn() });
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    window.dispatchEvent(event);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('does NOT stopPropagation for non-Escape keys', () => {
    render({ open: true, busy: false, onCancel: vi.fn() });
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    window.dispatchEvent(event);
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', () => {
    const onCancel = vi.fn();
    render({ open: true, busy: false, onCancel });
    dispatchKey('Enter');
    dispatchKey('Tab');
    dispatchKey('ArrowUp');
    dispatchKey(' ');
    dispatchKey('a');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does NOT invoke onCancel while busy=true (busy-gate)', () => {
    const onCancel = vi.fn();
    render({ open: true, busy: true, onCancel });
    dispatchKey('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does NOT stopPropagation while busy=true (busy-gate short-circuits)', () => {
    render({ open: true, busy: true, onCancel: vi.fn() });
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    window.dispatchEvent(event);
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('resumes cancelling when busy flips back to false', () => {
    const onCancel = vi.fn();
    const { rerender } = render({ open: true, busy: true, onCancel });
    dispatchKey('Escape');
    expect(onCancel).not.toHaveBeenCalled();
    rerender({ open: true, busy: false, onCancel });
    dispatchKey('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('focuses dialogRef.current when open=true', () => {
    const el = document.createElement('div');
    el.tabIndex = -1;
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    try {
      render({ open: true, busy: false, onCancel: vi.fn(), element: el });
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      el.remove();
    }
  });

  it('does NOT focus dialogRef when open=false (effect bails)', () => {
    const el = document.createElement('div');
    el.tabIndex = -1;
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    try {
      render({ open: false, busy: false, onCancel: vi.fn(), element: el });
      expect(focus).not.toHaveBeenCalled();
    } finally {
      el.remove();
    }
  });

  it('does not throw when dialogRef.current is null', () => {
    expect(() =>
      render({ open: true, busy: false, onCancel: vi.fn(), element: null }),
    ).not.toThrow();
  });

  it('restores focus to the previously active element on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    const restore = vi.spyOn(trigger, 'focus');
    try {
      const { unmount } = render({ open: true, busy: false, onCancel: vi.fn() });
      unmount();
      // Either the spy ran or activeElement returned to the trigger.
      expect(restore).toHaveBeenCalled();
    } finally {
      trigger.remove();
    }
  });

  it('restores focus to the previously active element on open=true -> false', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const restore = vi.spyOn(trigger, 'focus');
    try {
      const { rerender } = render({ open: true, busy: false, onCancel: vi.fn() });
      rerender({ open: false, busy: false, onCancel: vi.fn() });
      expect(restore).toHaveBeenCalled();
    } finally {
      trigger.remove();
    }
  });

  it('does not throw when there was no focused element to restore to', () => {
    // jsdom defaults activeElement to body - which has a no-op focus we can call.
    expect(() => {
      const { unmount } = render({ open: true, busy: false, onCancel: vi.fn() });
      unmount();
    }).not.toThrow();
  });

  it('removes the keydown listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render({ open: true, busy: false, onCancel: vi.fn() });
    unmount();
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('does not invoke onCancel after unmount', () => {
    const onCancel = vi.fn();
    const { unmount } = render({ open: true, busy: false, onCancel });
    unmount();
    dispatchKey('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('detaches the listener when transitioning open=true -> false', () => {
    const onCancel = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render({ open: true, busy: false, onCancel });
    rerender({ open: false, busy: false, onCancel });
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
    dispatchKey('Escape');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('uses the latest onCancel closure after rerender', () => {
    const first = vi.fn();
    const { rerender } = render({ open: true, busy: false, onCancel: first });
    const second = vi.fn();
    rerender({ open: true, busy: false, onCancel: second });
    dispatchKey('Escape');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('still cancels on Escape with modifier keys held (no modifier guard)', () => {
    const onCancel = vi.fn();
    render({ open: true, busy: false, onCancel });
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, cancelable: true }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
