import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLiveRef } from './use-live-ref';

describe('useLiveRef', () => {
  it('exposes the initial value on .current after mount', () => {
    const { result } = renderHook(() => useLiveRef('hello'));
    expect(result.current.current).toBe('hello');
  });

  it('mirrors the latest value into .current on every re-render', () => {
    const { result, rerender } = renderHook(({ v }) => useLiveRef(v), {
      initialProps: { v: 1 },
    });
    expect(result.current.current).toBe(1);
    rerender({ v: 2 });
    expect(result.current.current).toBe(2);
    rerender({ v: 99 });
    expect(result.current.current).toBe(99);
  });

  it('returns the same ref object across re-renders (stable identity)', () => {
    const { result, rerender } = renderHook(({ v }) => useLiveRef(v), {
      initialProps: { v: 'a' },
    });
    const first = result.current;
    rerender({ v: 'b' });
    expect(result.current).toBe(first);
    rerender({ v: 'c' });
    expect(result.current).toBe(first);
  });

  it('handles null and undefined values without losing identity', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string | null | undefined }) => useLiveRef(v),
      { initialProps: { v: 'x' as string | null | undefined } },
    );
    const ref = result.current;
    rerender({ v: null });
    expect(ref.current).toBeNull();
    rerender({ v: undefined });
    expect(ref.current).toBeUndefined();
    rerender({ v: 'back' });
    expect(ref.current).toBe('back');
    expect(result.current).toBe(ref);
  });

  it('tracks reference-typed values by latest identity, not by deep equality', () => {
    const a = { id: 1 };
    const b = { id: 1 };
    const { result, rerender } = renderHook(({ v }) => useLiveRef(v), {
      initialProps: { v: a },
    });
    expect(result.current.current).toBe(a);
    rerender({ v: b });
    expect(result.current.current).toBe(b);
    expect(result.current.current).not.toBe(a);
  });

  it('overwrites external .current writes on the next render', () => {
    const { result, rerender } = renderHook(({ v }) => useLiveRef(v), {
      initialProps: { v: 'first' },
    });
    result.current.current = 'tampered';
    expect(result.current.current).toBe('tampered');
    rerender({ v: 'second' });
    expect(result.current.current).toBe('second');
  });
});
