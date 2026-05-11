import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToggle } from './use-toggle';

describe('useToggle', () => {
  it('defaults to false when no initial value is provided', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current[0]).toBe(false);
  });

  it('honors a literal initial value', () => {
    const { result } = renderHook(() => useToggle(true));
    expect(result.current[0]).toBe(true);
  });

  it('honors a lazy initializer (called once across re-renders)', () => {
    let calls = 0;
    const { result, rerender } = renderHook(() =>
      useToggle(() => {
        calls++;
        return true;
      }),
    );
    expect(result.current[0]).toBe(true);
    rerender();
    expect(calls).toBe(1);
  });

  it('flips the value via toggle', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
  });

  it('exposes the raw setter for explicit set(true) / set(false)', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => result.current[2](true));
    expect(result.current[0]).toBe(true);
    act(() => result.current[2](false));
    expect(result.current[0]).toBe(false);
  });

  it('keeps the toggle reference stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useToggle());
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
