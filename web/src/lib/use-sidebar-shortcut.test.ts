import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSidebarShortcut } from './use-sidebar-shortcut';

// useSidebarShortcut wires Ctrl+B / Cmd+B to a sidebar toggle. The
// listener no-ops while focus is on a text-entry surface so the
// chord does not hijack typing. The viewport-size hook
// (useViewportSize, v1.11.240) drives the desktop/mobile branch:
// width >= 768 fires onToggleCollapsed (desktop, persisted slot),
// width < 768 fires onToggleOpen (mobile, transient slot). The
// listener is added to the window and cleaned up on unmount.

function setViewport(width: number, height = 800): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

const DESKTOP_WIDTH = 1440;
const MOBILE_WIDTH = 400;

function dispatchCtrlB(opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'b',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(ev);
  return ev;
}

describe('useSidebarShortcut', () => {
  beforeEach(() => {
    setViewport(DESKTOP_WIDTH);
  });

  afterEach(() => {
    // jsdom's default innerWidth/innerHeight are restored automatically
    // when the test environment resets between files; nothing to clean
    // up here beyond the renderHook/cleanup the setup file performs.
  });

  it('renders without returning anything (void hook)', () => {
    const { result } = renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed: vi.fn(),
        onToggleOpen: vi.fn(),
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it('fires onToggleCollapsed on Ctrl+B at the desktop breakpoint', () => {
    setViewport(DESKTOP_WIDTH);
    const onToggleCollapsed = vi.fn();
    const onToggleOpen = vi.fn();
    renderHook(() => useSidebarShortcut({ onToggleCollapsed, onToggleOpen }));
    dispatchCtrlB();
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    expect(onToggleOpen).not.toHaveBeenCalled();
  });

  it('fires onToggleOpen on Ctrl+B at the mobile breakpoint', () => {
    setViewport(MOBILE_WIDTH);
    const onToggleCollapsed = vi.fn();
    const onToggleOpen = vi.fn();
    renderHook(() => useSidebarShortcut({ onToggleCollapsed, onToggleOpen }));
    dispatchCtrlB();
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
    expect(onToggleCollapsed).not.toHaveBeenCalled();
  });

  it('fires on Cmd+B (Mac convention) when ctrlKey is false but metaKey is true', () => {
    setViewport(DESKTOP_WIDTH);
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    dispatchCtrlB({ ctrlKey: false, metaKey: true });
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('is case-insensitive (uppercase B also fires)', () => {
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    dispatchCtrlB({ key: 'B' });
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('ignores plain B (no modifier)', () => {
    const onToggleCollapsed = vi.fn();
    const onToggleOpen = vi.fn();
    renderHook(() => useSidebarShortcut({ onToggleCollapsed, onToggleOpen }));
    dispatchCtrlB({ ctrlKey: false, metaKey: false });
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    expect(onToggleOpen).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys (Ctrl+A is a no-op)', () => {
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }),
    );
    expect(onToggleCollapsed).not.toHaveBeenCalled();
  });

  it('does NOT fire when focus is on an INPUT element', () => {
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does NOT fire when focus is on a TEXTAREA element', () => {
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('does NOT fire when focus is on a contentEditable element', () => {
    const onToggleCollapsed = vi.fn();
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    const div = document.createElement('div');
    document.body.appendChild(div);
    // jsdom does not implement HTMLElement.isContentEditable, so the
    // hook's `target.isContentEditable` check would see undefined.
    // Force the property to true here to verify the guard branch.
    Object.defineProperty(div, 'isContentEditable', {
      configurable: true,
      get: () => true,
    });
    div.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(onToggleCollapsed).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it('preventDefault is called on the Ctrl+B keydown when not on a text surface', () => {
    renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed: vi.fn(),
        onToggleOpen: vi.fn(),
      }),
    );
    const ev = dispatchCtrlB();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('removes the listener on unmount (no toggle after teardown)', () => {
    const onToggleCollapsed = vi.fn();
    const { unmount } = renderHook(() =>
      useSidebarShortcut({
        onToggleCollapsed,
        onToggleOpen: vi.fn(),
      }),
    );
    unmount();
    dispatchCtrlB();
    expect(onToggleCollapsed).not.toHaveBeenCalled();
  });

  it('reattaches the listener with the fresh callback when handlers change', () => {
    const firstHandler = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useSidebarShortcut({
          onToggleCollapsed: cb,
          onToggleOpen: vi.fn(),
        }),
      { initialProps: { cb: firstHandler } },
    );
    const secondHandler = vi.fn();
    rerender({ cb: secondHandler });
    dispatchCtrlB();
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
