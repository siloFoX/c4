import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useXtermFontSize } from './use-xterm-font-size';

// useXtermFontSize is a void hook that pushes the `fontSize` prop into
// `term.options.fontSize` whenever fontSize changes (or the term
// becomes available) and then calls `scheduleFit` so the autofit
// hook recomputes columns/rows. When the term ref is null the hook
// no-ops — neither the option assignment nor scheduleFit fire.

// Minimal Terminal shim. The hook only touches `term.options.fontSize`
// so we model it as a writable record.
function makeTerm(initial: number = 14): {
  ref: MutableRefObject<Terminal | null>;
  options: { fontSize: number };
} {
  const options = { fontSize: initial };
  const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
  ref.current = { options } as unknown as Terminal;
  return { ref, options };
}

describe('useXtermFontSize', () => {
  it('returns nothing (void hook)', () => {
    const { ref } = makeTerm();
    const { result } = renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 14, scheduleFit: vi.fn() }),
    );
    expect(result.current).toBeUndefined();
  });

  it('writes the initial fontSize into term.options.fontSize on mount', () => {
    const { ref, options } = makeTerm(10);
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 16, scheduleFit: vi.fn() }),
    );
    expect(options.fontSize).toBe(16);
  });

  it('calls scheduleFit on mount', () => {
    const { ref } = makeTerm();
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 14, scheduleFit }),
    );
    expect(scheduleFit).toHaveBeenCalledTimes(1);
  });

  it('no-ops when termRef.current is null (no scheduleFit call)', () => {
    const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
    ref.current = null;
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 14, scheduleFit }),
    );
    expect(scheduleFit).not.toHaveBeenCalled();
  });

  it('updates term.options.fontSize when the fontSize prop changes', () => {
    const { ref, options } = makeTerm(12);
    const { rerender } = renderHook(
      ({ size }: { size: number }) =>
        useXtermFontSize({
          termRef: ref,
          fontSize: size,
          scheduleFit: vi.fn(),
        }),
      { initialProps: { size: 12 } },
    );
    expect(options.fontSize).toBe(12);
    rerender({ size: 18 });
    expect(options.fontSize).toBe(18);
    rerender({ size: 9 });
    expect(options.fontSize).toBe(9);
  });

  it('calls scheduleFit again when fontSize changes', () => {
    const { ref } = makeTerm();
    const scheduleFit = vi.fn();
    const { rerender } = renderHook(
      ({ size }: { size: number }) =>
        useXtermFontSize({ termRef: ref, fontSize: size, scheduleFit }),
      { initialProps: { size: 14 } },
    );
    expect(scheduleFit).toHaveBeenCalledTimes(1);
    rerender({ size: 20 });
    expect(scheduleFit).toHaveBeenCalledTimes(2);
  });

  it('does not re-fire scheduleFit when fontSize stays the same (effect dep stable)', () => {
    const { ref } = makeTerm();
    const scheduleFit = vi.fn();
    const { rerender } = renderHook(
      ({ size }: { size: number }) =>
        useXtermFontSize({ termRef: ref, fontSize: size, scheduleFit }),
      { initialProps: { size: 14 } },
    );
    expect(scheduleFit).toHaveBeenCalledTimes(1);
    rerender({ size: 14 });
    expect(scheduleFit).toHaveBeenCalledTimes(1);
  });

  it('re-fires the effect when scheduleFit identity changes (callback dep)', () => {
    const { ref } = makeTerm();
    const firstFit = vi.fn();
    const { rerender } = renderHook(
      ({ fit }: { fit: () => void }) =>
        useXtermFontSize({ termRef: ref, fontSize: 14, scheduleFit: fit }),
      { initialProps: { fit: firstFit } },
    );
    expect(firstFit).toHaveBeenCalledTimes(1);
    const secondFit = vi.fn();
    rerender({ fit: secondFit });
    expect(secondFit).toHaveBeenCalledTimes(1);
  });

  it('handles a fontSize of 0 (no validation — passes through)', () => {
    const { ref, options } = makeTerm(14);
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 0, scheduleFit: vi.fn() }),
    );
    expect(options.fontSize).toBe(0);
  });

  it('handles a large fontSize (no validation — passes through)', () => {
    const { ref, options } = makeTerm(14);
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 999, scheduleFit: vi.fn() }),
    );
    expect(options.fontSize).toBe(999);
  });

  it('writes happens before scheduleFit (order matters for autofit math)', () => {
    const { ref, options } = makeTerm(12);
    const order: string[] = [];
    const scheduleFit = vi.fn(() => {
      order.push(`fit@${options.fontSize}`);
    });
    renderHook(() =>
      useXtermFontSize({ termRef: ref, fontSize: 22, scheduleFit }),
    );
    // scheduleFit should have observed the new fontSize already.
    expect(order).toEqual(['fit@22']);
  });

  it('null termRef on first mount then non-null on rerender starts honoring the prop', () => {
    const ref = createRef<Terminal>() as MutableRefObject<Terminal | null>;
    ref.current = null;
    const scheduleFit = vi.fn();
    const { rerender } = renderHook(
      ({ size }: { size: number }) =>
        useXtermFontSize({ termRef: ref, fontSize: size, scheduleFit }),
      { initialProps: { size: 14 } },
    );
    expect(scheduleFit).not.toHaveBeenCalled();
    const options = { fontSize: 0 };
    ref.current = { options } as unknown as Terminal;
    rerender({ size: 18 });
    expect(options.fontSize).toBe(18);
    expect(scheduleFit).toHaveBeenCalledTimes(1);
  });
});
