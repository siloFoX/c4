import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEscapeToClose } from './use-escape-to-close';

afterEach(() => {
  vi.restoreAllMocks();
});

interface RenderArgs {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
}

function render(initial: RenderArgs) {
  return renderHook((args: RenderArgs) => useEscapeToClose(args), {
    initialProps: initial,
  });
}

function dispatchKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useEscapeToClose', () => {
  it('does NOT register a keydown listener when open=false', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render({ open: false, onClose: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(0);
  });

  it('registers exactly one keydown listener when open=true', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render({ open: true, onClose: vi.fn() });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('listener registration is idempotent across stable rerenders', () => {
    const onClose = vi.fn();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender } = render({ open: true, onClose });
    rerender({ open: true, onClose });
    rerender({ open: true, onClose });
    const keydowns = add.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault on Escape', () => {
    render({ open: true, onClose: vi.fn() });
    const event = dispatchKey('Escape');
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores non-Escape keys', () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    dispatchKey('Enter');
    dispatchKey('Tab');
    dispatchKey('ArrowUp');
    dispatchKey('ArrowDown');
    dispatchKey('ArrowLeft');
    dispatchKey('ArrowRight');
    dispatchKey(' ');
    dispatchKey('a');
    dispatchKey('Backspace');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose while busy=true', () => {
    const onClose = vi.fn();
    render({ open: true, onClose, busy: true });
    const event = dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
    // busy short-circuits BEFORE preventDefault, so the event stays unprevented
    expect(event.defaultPrevented).toBe(false);
  });

  it('resumes calling onClose when busy flips back to false', () => {
    const onClose = vi.fn();
    const { rerender } = render({ open: true, onClose, busy: true });
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
    rerender({ open: true, onClose, busy: false });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on Escape when open=false (listener absent)', () => {
    const onClose = vi.fn();
    render({ open: false, onClose });
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('detaches the listener on open=true -> open=false', () => {
    const onClose = vi.fn();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender } = render({ open: true, onClose });
    rerender({ open: false, onClose });
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reattaches the listener on open=false -> open=true', () => {
    const onClose = vi.fn();
    const { rerender } = render({ open: false, onClose });
    rerender({ open: true, onClose });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes the listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render({ open: true, onClose: vi.fn() });
    unmount();
    const keydowns = remove.mock.calls.filter((call) => call[0] === 'keydown');
    expect(keydowns).toHaveLength(1);
  });

  it('does not invoke onClose after unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render({ open: true, onClose });
    unmount();
    dispatchKey('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the latest onClose closure after rerender', () => {
    const first = vi.fn();
    const { rerender } = render({ open: true, onClose: first });
    const second = vi.fn();
    rerender({ open: true, onClose: second });
    dispatchKey('Escape');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('still fires on Escape with modifiers held (this hook has no modifier guard)', () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, cancelable: true }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('treats busy=undefined the same as busy=false', () => {
    const onClose = vi.fn();
    render({ open: true, onClose });
    dispatchKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
