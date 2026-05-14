import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  BINDING_IDS,
  DEFAULT_BINDINGS,
  EVENT_NAME,
  STORAGE_KEY,
  getBinding,
  getBindings,
  parseCombo,
  resetBindings,
  setBinding,
  useBindings,
} from './keyboard-bindings';

describe('keyboard-bindings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('getBinding returns default when no override is stored', () => {
    expect(getBinding('commandPalette')).toBe(
      DEFAULT_BINDINGS.commandPalette,
    );
    expect(getBinding('help')).toBe(DEFAULT_BINDINGS.help);
  });

  it('setBinding persists override into localStorage', () => {
    setBinding('commandPalette', 'ctrl+shift+p');
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || '{}',
    );
    expect(stored.commandPalette).toBe('ctrl+shift+p');
    expect(getBinding('commandPalette')).toBe('ctrl+shift+p');
  });

  it('setBinding dispatches the keyboard-bindings-changed CustomEvent', () => {
    let detail: { bindings?: Record<string, string> } | null = null;
    const listener = (e: Event) => {
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener(EVENT_NAME, listener as EventListener);
    setBinding('toggleTheme', 'shift+t');
    window.removeEventListener(EVENT_NAME, listener as EventListener);
    expect(detail).not.toBeNull();
    expect(detail!.bindings!['toggleTheme']).toBe('shift+t');
  });

  it('useBindings reflects setBinding updates via the event', () => {
    const { result } = renderHook(() => useBindings());
    expect(result.current.commandPalette).toBe(
      DEFAULT_BINDINGS.commandPalette,
    );
    act(() => {
      setBinding('commandPalette', 'alt+p');
    });
    expect(result.current.commandPalette).toBe('alt+p');
  });

  it('resetBindings clears overrides and broadcasts defaults', () => {
    setBinding('focusSearch', 'mod+f');
    expect(getBinding('focusSearch')).toBe('mod+f');
    let seenAfterReset: Record<string, string> | null = null;
    const listener = (e: Event) => {
      seenAfterReset = (e as CustomEvent).detail.bindings;
    };
    window.addEventListener(EVENT_NAME, listener as EventListener);
    resetBindings();
    window.removeEventListener(EVENT_NAME, listener as EventListener);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getBinding('focusSearch')).toBe(DEFAULT_BINDINGS.focusSearch);
    expect(seenAfterReset).not.toBeNull();
    expect(seenAfterReset!['focusSearch']).toBe(DEFAULT_BINDINGS.focusSearch);
  });

  it('malformed JSON in localStorage falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const map = getBindings();
    for (const id of BINDING_IDS) {
      expect(map[id]).toBe(DEFAULT_BINDINGS[id]);
    }
  });

  it('non-object stored payload falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['oops']));
    expect(getBinding('commandPalette')).toBe(
      DEFAULT_BINDINGS.commandPalette,
    );
  });

  it('parseCombo normalises modifier order and aliases', () => {
    expect(parseCombo('Ctrl+Shift+P')).toBe('ctrl+shift+p');
    expect(parseCombo('Shift+Ctrl+P')).toBe('ctrl+shift+p');
    expect(parseCombo('Cmd+K')).toBe('mod+k');
    expect(parseCombo('Meta+K')).toBe('mod+k');
    expect(parseCombo('?')).toBe('?');
    expect(parseCombo('g h')).toBe('g h');
    expect(parseCombo('')).toBe('');
  });

  it('setBinding with default value or empty string removes the override', () => {
    setBinding('commandPalette', 'ctrl+shift+p');
    expect(getBinding('commandPalette')).toBe('ctrl+shift+p');
    setBinding('commandPalette', DEFAULT_BINDINGS.commandPalette);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{}');
    expect(getBinding('commandPalette')).toBe(
      DEFAULT_BINDINGS.commandPalette,
    );
    setBinding('help', 'shift+/');
    setBinding('help', '');
    expect(getBinding('help')).toBe(DEFAULT_BINDINGS.help);
  });
});
