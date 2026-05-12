import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToggleResetOnChange } from './use-toggle-reset-on-change';

describe('useToggleResetOnChange', () => {
  it('starts closed with open=false regardless of the initial key', () => {
    const { result } = renderHook(() => useToggleResetOnChange('a'));
    expect(result.current.open).toBe(false);
    expect(typeof result.current.toggle).toBe('function');
    expect(typeof result.current.setOpen).toBe('function');
  });

  it('toggle flips open false -> true -> false', () => {
    const { result } = renderHook(() => useToggleResetOnChange('a'));
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it('setOpen accepts a literal next value', () => {
    const { result } = renderHook(() => useToggleResetOnChange('a'));
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it('setOpen accepts an updater function based on the previous value', () => {
    const { result } = renderHook(() => useToggleResetOnChange('a'));
    act(() => result.current.setOpen((v) => !v));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen((v) => !v));
    expect(result.current.open).toBe(false);
  });

  it('auto-resets open to false when the watched key changes', () => {
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useToggleResetOnChange(k),
      { initialProps: { k: 'a' } },
    );
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    rerender({ k: 'b' });
    expect(result.current.open).toBe(false);
  });

  it('keeps open unchanged when the watched key re-renders with the same value', () => {
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useToggleResetOnChange(k),
      { initialProps: { k: 'same' } },
    );
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    rerender({ k: 'same' });
    expect(result.current.open).toBe(true);
  });

  it('keeps the toggle callback reference stable across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ k }: { k: string }) => useToggleResetOnChange(k),
      { initialProps: { k: 'a' } },
    );
    const firstToggle = result.current.toggle;
    rerender({ k: 'a' });
    expect(result.current.toggle).toBe(firstToggle);
    rerender({ k: 'b' });
    expect(result.current.toggle).toBe(firstToggle);
  });

  it('treats reference-typed keys by identity, not deep equality', () => {
    const a = { id: 1 };
    const b = { id: 1 };
    const { result, rerender } = renderHook(
      ({ k }: { k: { id: number } }) => useToggleResetOnChange(k),
      { initialProps: { k: a } },
    );
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    rerender({ k: b });
    expect(result.current.open).toBe(false);
  });
});
