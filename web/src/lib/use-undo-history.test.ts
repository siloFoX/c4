// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  UNDO_HISTORY_DEFAULT_MAX,
  useUndoHistory,
} from './use-undo-history';

afterEach(() => {
  cleanup();
});

describe('useUndoHistory', () => {
  it('exposes the initial state with empty past / future', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    expect(result.current.state).toBe('a');
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('exports the canonical default maxHistory constant', () => {
    expect(UNDO_HISTORY_DEFAULT_MAX).toBe(100);
  });

  // (v1.11.355, TODO 11.337) `set` pushes onto past and
  // clears the future.
  it('set pushes the previous present onto past and clears future', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    expect(result.current.state).toBe('b');
    expect(result.current.past).toEqual(['a']);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('set accepts a reducer (prev) => next', () => {
    const { result } = renderHook(() => useUndoHistory(0));
    act(() => {
      result.current.set((n) => n + 1);
    });
    act(() => {
      result.current.set((n) => n + 1);
    });
    expect(result.current.state).toBe(2);
    expect(result.current.past).toEqual([0, 1]);
  });

  it('set is a no-op when next === present (Object.is)', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('a');
    });
    expect(result.current.past).toEqual([]);
  });

  // (v1.11.355, TODO 11.337) Undo / redo flow.
  it('undo moves the latest past entry into present and pushes the old present onto future', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.set('c');
    });
    expect(result.current.state).toBe('c');
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe('b');
    expect(result.current.past).toEqual(['a']);
    expect(result.current.future).toEqual(['c']);
    expect(result.current.canRedo).toBe(true);
  });

  it('undo is a no-op when there is nothing to undo', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe('a');
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([]);
  });

  it('redo restores the latest undone state', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });
    expect(result.current.state).toBe('b');
    expect(result.current.past).toEqual(['a']);
    expect(result.current.future).toEqual([]);
  });

  it('redo is a no-op when there is nothing to redo', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.redo();
    });
    expect(result.current.future).toEqual([]);
  });

  // (v1.11.355, TODO 11.337) A new set() after an undo
  // clears the future (canonical undo/redo semantics).
  it('a new set() clears the future stack', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.set('c');
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.future).toEqual(['c']);
    act(() => {
      result.current.set('d');
    });
    expect(result.current.future).toEqual([]);
    expect(result.current.past).toEqual(['a', 'b']);
  });

  // (v1.11.355, TODO 11.337) maxHistory cap.
  it('drops oldest past entries when the maxHistory cap is exceeded', () => {
    const { result } = renderHook(() =>
      useUndoHistory(0, { maxHistory: 3 }),
    );
    act(() => {
      result.current.set(1);
    });
    act(() => {
      result.current.set(2);
    });
    act(() => {
      result.current.set(3);
    });
    act(() => {
      result.current.set(4);
    });
    expect(result.current.state).toBe(4);
    // past should hold 3 entries (1, 2, 3) -- 0 dropped.
    expect(result.current.past).toEqual([1, 2, 3]);
  });

  // (v1.11.355, TODO 11.337) reset wipes both stacks.
  it('reset replaces state and clears past + future', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.set('c');
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.reset('fresh');
    });
    expect(result.current.state).toBe('fresh');
    expect(result.current.past).toEqual([]);
    expect(result.current.future).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  // (v1.11.355, TODO 11.337) Keyboard shortcuts default
  // off.
  it('does NOT intercept Cmd+Z when shortcuts is unset', () => {
    const { result } = renderHook(() => useUndoHistory('a'));
    act(() => {
      result.current.set('b');
    });
    // Fire the shortcut on document.
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('b');
  });

  it('intercepts Cmd+Z and triggers undo when shortcuts is true', () => {
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    expect(result.current.state).toBe('b');
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('a');
  });

  it('intercepts Cmd+Shift+Z and triggers redo when shortcuts is true', () => {
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.state).toBe('a');
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('b');
  });

  it('intercepts Cmd+Y (Windows alt-redo) and triggers redo', () => {
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    act(() => {
      result.current.undo();
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'y',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('b');
  });

  it('intercepts Meta+Z (mac Cmd+Z) and triggers undo', () => {
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('a');
  });

  // (v1.11.355, TODO 11.337) Text-entry skip: when the
  // event target is an input / textarea / contenteditable
  // the listener must NOT intercept.
  it('skips Cmd+Z when the keydown target is an <input>', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      input.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('b');
    input.remove();
  });

  it('skips Cmd+Z when the keydown target is a <textarea>', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const { result } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      ta.dispatchEvent(ev);
    });
    expect(result.current.state).toBe('b');
    ta.remove();
  });

  // (v1.11.355, TODO 11.337) Cleanup: the listener is
  // removed on unmount.
  it('removes the keydown listener on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useUndoHistory('a', { shortcuts: true }),
    );
    act(() => {
      result.current.set('b');
    });
    expect(result.current.state).toBe('b');
    unmount();
    // After unmount, dispatching Cmd+Z should not throw
    // and should not affect any state (the hook is
    // gone). Test passes if no error.
    const ev = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  });
});
