import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHelpOverlayTriggers } from './use-help-overlay-triggers';
import {
  HELP_EVENT_OPEN_DRAWER,
  HELP_EVENT_OPEN_SHORTCUTS,
} from '../components/HelpUIRoot';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeArgs(overrides: Partial<Parameters<typeof useHelpOverlayTriggers>[0]> = {}) {
  return {
    onOpenDrawer: vi.fn(),
    onOpenShortcuts: vi.fn(),
    ...overrides,
  };
}

// Dispatch from document.body with bubbles=true so the keydown listener on
// window still fires, but event.target is a real HTMLElement (BODY) rather
// than the Window object. The hook's typing-guard calls target.getAttribute
// which only exists on Element nodes.
function dispatchKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.body.dispatchEvent(event);
  return event;
}

describe('useHelpOverlayTriggers', () => {
  it('registers a keydown listener + two custom-event listeners on mount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderHook(() => useHelpOverlayTriggers(makeArgs()));
    const types = add.mock.calls.map((call) => call[0]);
    expect(types).toContain('keydown');
    expect(types).toContain(HELP_EVENT_OPEN_DRAWER);
    expect(types).toContain(HELP_EVENT_OPEN_SHORTCUTS);
  });

  it('keeps only one of each listener across rerenders when callbacks are stable', () => {
    const args = makeArgs();
    const add = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderHook(() => useHelpOverlayTriggers(args));
    rerender();
    rerender();
    const counts = add.mock.calls.reduce<Record<string, number>>((acc, call) => {
      const type = call[0] as string;
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts['keydown']).toBe(1);
    expect(counts[HELP_EVENT_OPEN_DRAWER]).toBe(1);
    expect(counts[HELP_EVENT_OPEN_SHORTCUTS]).toBe(1);
  });

  it('fires onOpenDrawer when the help-drawer-open custom event is dispatched', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('fires onOpenShortcuts when the shortcuts-open custom event is dispatched', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    expect(args.onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('opens the shortcuts modal on the bare "?" key', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('?');
    expect(args.onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('opens the shortcuts modal on Shift+/ (the un-shifted "?" surface on some layouts)', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('/', { shiftKey: true });
    expect(args.onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('does NOT open shortcuts on bare "/" without shift', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('/');
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('opens the help drawer on lowercase "h"', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('h');
    expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('opens the help drawer on uppercase "H" too', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('H');
    expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated keys', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('a');
    dispatchKey('Enter');
    dispatchKey('Escape');
    dispatchKey('ArrowLeft');
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('preventDefault is called on the "?" hotkey', () => {
    renderHook(() => useHelpOverlayTriggers(makeArgs()));
    const event = new KeyboardEvent('keydown', {
      key: '?',
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    document.body.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('preventDefault is NOT called on "h" (drawer hotkey is not a browser collision)', () => {
    renderHook(() => useHelpOverlayTriggers(makeArgs()));
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    document.body.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('ignores hotkeys while meta is held', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('?', { metaKey: true });
    dispatchKey('h', { metaKey: true });
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('ignores hotkeys while ctrl is held', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('?', { ctrlKey: true });
    dispatchKey('h', { ctrlKey: true });
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('ignores hotkeys while alt is held', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    dispatchKey('?', { altKey: true });
    dispatchKey('h', { altKey: true });
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
  });

  it('skips hotkeys when the event target is an <input>', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      const event = new KeyboardEvent('keydown', { key: 'h', bubbles: true });
      input.dispatchEvent(event);
      expect(args.onOpenDrawer).not.toHaveBeenCalled();
    } finally {
      input.remove();
    }
  });

  it('skips hotkeys when the event target is a <textarea>', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    try {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      expect(args.onOpenShortcuts).not.toHaveBeenCalled();
    } finally {
      ta.remove();
    }
  });

  it('skips hotkeys when the event target has contenteditable=true', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    const div = document.createElement('div');
    // jsdom does not derive isContentEditable from the contentEditable
    // attribute, so stub the IDL property directly for this assertion.
    Object.defineProperty(div, 'isContentEditable', {
      value: true,
      configurable: true,
    });
    document.body.appendChild(div);
    try {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      expect(args.onOpenDrawer).not.toHaveBeenCalled();
    } finally {
      div.remove();
    }
  });

  it('skips hotkeys when the event target carries role="textbox"', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    const div = document.createElement('div');
    div.setAttribute('role', 'textbox');
    document.body.appendChild(div);
    try {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      expect(args.onOpenDrawer).not.toHaveBeenCalled();
    } finally {
      div.remove();
    }
  });

  it('still fires when the event target is a plain non-input element', () => {
    const args = makeArgs();
    renderHook(() => useHelpOverlayTriggers(args));
    const div = document.createElement('div');
    document.body.appendChild(div);
    try {
      div.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
    } finally {
      div.remove();
    }
  });

  it('removes all three listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHelpOverlayTriggers(makeArgs()));
    unmount();
    const types = remove.mock.calls.map((call) => call[0]);
    expect(types).toContain('keydown');
    expect(types).toContain(HELP_EVENT_OPEN_DRAWER);
    expect(types).toContain(HELP_EVENT_OPEN_SHORTCUTS);
  });

  it('does not invoke callbacks after unmount', () => {
    const args = makeArgs();
    const { unmount } = renderHook(() => useHelpOverlayTriggers(args));
    unmount();
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_SHORTCUTS));
    dispatchKey('?');
    dispatchKey('h');
    expect(args.onOpenDrawer).not.toHaveBeenCalled();
    expect(args.onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('reattaches when callbacks change identity (latest closures win)', () => {
    let args = makeArgs();
    const { rerender } = renderHook((a: typeof args) => useHelpOverlayTriggers(a), {
      initialProps: args,
    });
    const next = makeArgs();
    args = next;
    rerender(next);
    window.dispatchEvent(new CustomEvent(HELP_EVENT_OPEN_DRAWER));
    dispatchKey('h');
    expect(next.onOpenDrawer).toHaveBeenCalledTimes(2);
  });
});
