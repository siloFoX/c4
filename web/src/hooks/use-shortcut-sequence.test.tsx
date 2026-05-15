import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShortcutSequence } from './use-shortcut-sequence';

function fireKey(key: string, init: Partial<KeyboardEventInit> = {}) {
  // `cancelable: true` is required for preventDefault() to flip
  // defaultPrevented; jsdom defaults the flag to false.
  const ev = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(ev);
  return ev;
}

let originalFocused: HTMLElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  originalFocused = document.activeElement as HTMLElement | null;
});

afterEach(() => {
  // Drain any pending sequence timer before swapping back to real
  // timers so cleanup callbacks run on the right clock.
  vi.runAllTimers();
  vi.useRealTimers();
  originalFocused?.focus?.();
});

describe('useShortcutSequence', () => {
  it('fires the handler on an exact sequence match', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g');
    fireKey('g');
    expect(top).toHaveBeenCalledTimes(1);
  });

  it('distinguishes between multiple sequences sharing a prefix', () => {
    const top = vi.fn();
    const home = vi.fn();
    const workers = vi.fn();
    renderHook(() =>
      useShortcutSequence({ gg: top, gh: home, gw: workers }),
    );
    fireKey('g');
    fireKey('h');
    expect(home).toHaveBeenCalledTimes(1);
    expect(top).not.toHaveBeenCalled();
    expect(workers).not.toHaveBeenCalled();
  });

  it('resets the buffer on a non-prefix key', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g');
    fireKey('x'); // not a prefix of anything; resets
    fireKey('g'); // starts fresh, still not a full chord
    expect(top).not.toHaveBeenCalled();
  });

  it('does not fire after the 1500ms inactivity timeout elapses between presses', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g');
    vi.advanceTimersByTime(1600);
    fireKey('g');
    expect(top).not.toHaveBeenCalled();
  });

  it('a press inside the timeout window still completes the chord', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g');
    vi.advanceTimersByTime(1400);
    fireKey('g');
    expect(top).toHaveBeenCalledTimes(1);
  });

  it('honors a custom timeoutMs option', () => {
    const top = vi.fn();
    renderHook(() =>
      useShortcutSequence({ gg: top }, { timeoutMs: 300 }),
    );
    fireKey('g');
    vi.advanceTimersByTime(400);
    fireKey('g');
    expect(top).not.toHaveBeenCalled();
  });

  it('skips the chord while focus is on a text input', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireKey('g', { });
    // Re-dispatch on the input itself so the target check sees an INPUT.
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'g', bubbles: true }),
    );
    expect(top).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('skips when modifier keys are held (Ctrl / Meta / Alt own those combos)', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g', { ctrlKey: true });
    fireKey('g', { ctrlKey: true });
    expect(top).not.toHaveBeenCalled();
  });

  it('ignores non-printable keys (Arrow / Function) but does not crash', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('ArrowDown');
    fireKey('F2');
    fireKey('g');
    fireKey('g');
    expect(top).toHaveBeenCalledTimes(1);
  });

  it('preventDefault is invoked on the final keystroke of a matched chord', () => {
    const top = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top }));
    fireKey('g');
    const ev = fireKey('g');
    expect(ev.defaultPrevented).toBe(true);
    expect(top).toHaveBeenCalledTimes(1);
  });

  it('enabled=false is a hard no-op (no listener attached)', () => {
    const top = vi.fn();
    renderHook(() =>
      useShortcutSequence({ gg: top }, { enabled: false }),
    );
    fireKey('g');
    fireKey('g');
    expect(top).not.toHaveBeenCalled();
  });

  it('a swallowed handler error does not poison the next chord', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const ok = vi.fn();
    renderHook(() => useShortcutSequence({ gx: bad, gy: ok }));
    fireKey('g');
    fireKey('x'); // throws inside the handler; buffer should still clear
    fireKey('g');
    fireKey('y');
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('treats a fresh chord-head correctly when a non-prefix follows', () => {
    const top = vi.fn();
    const home = vi.fn();
    renderHook(() => useShortcutSequence({ gg: top, gh: home }));
    // x is not a prefix; the next g should restart the buffer.
    fireKey('x');
    fireKey('g');
    fireKey('h');
    expect(home).toHaveBeenCalledTimes(1);
  });
});
