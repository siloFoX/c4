import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import type { RefObject } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useXtermThemeTracking } from './use-xterm-theme-tracking';

// useXtermThemeTracking watches `<html>`'s classList for the
// shadcn dark-mode flip and rebuilds the xterm theme each time it
// changes. It runs once on mount to apply the initial theme. The
// effect is keyed on workerName so a fresh terminal swap-in always
// re-applies the current theme. When termRef is null the hook
// no-ops (no MutationObserver attached).

function makeTerm(): {
  ref: RefObject<Terminal | null>;
  options: { theme: unknown };
} {
  const options: { theme: unknown } = { theme: null };
  const ref = createRef<Terminal>() as RefObject<Terminal | null>;
  // @ts-expect-error - mutate ref.current for the test stub.
  ref.current = { options } as unknown as Terminal;
  return { ref, options };
}

describe('useXtermThemeTracking', () => {
  let originalMO: typeof MutationObserver | undefined;
  let observeCalls: Array<{ target: Node; init: MutationObserverInit }>;
  let disconnectCount: number;
  let triggerMutation: () => void;

  beforeEach(() => {
    observeCalls = [];
    disconnectCount = 0;
    let cb: MutationCallback = () => {};
    triggerMutation = () => cb([], {} as MutationObserver);
    originalMO = globalThis.MutationObserver;
    class FakeMO {
      constructor(callback: MutationCallback) {
        cb = callback;
      }
      observe(target: Node, init: MutationObserverInit) {
        observeCalls.push({ target, init });
      }
      disconnect() {
        disconnectCount++;
      }
      takeRecords() {
        return [];
      }
    }
    // @ts-expect-error - assign fake.
    globalThis.MutationObserver = FakeMO;
  });

  afterEach(() => {
    if (originalMO) globalThis.MutationObserver = originalMO;
  });

  it('returns nothing (void hook)', () => {
    const { ref } = makeTerm();
    const { result } = renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(result.current).toBeUndefined();
  });

  it('applies the initial theme on mount (sets term.options.theme)', () => {
    const { ref, options } = makeTerm();
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(options.theme).not.toBeNull();
    expect(typeof options.theme).toBe('object');
  });

  it('observes document.documentElement with the class attribute filter', () => {
    const { ref } = makeTerm();
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(observeCalls).toHaveLength(1);
    expect(observeCalls[0]!.target).toBe(document.documentElement);
    expect(observeCalls[0]!.init).toEqual({
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  it('rebuilds the theme when the MutationObserver fires', () => {
    const { ref, options } = makeTerm();
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    const initial = options.theme;
    expect(initial).not.toBeNull();
    options.theme = null;
    triggerMutation();
    expect(options.theme).not.toBeNull();
  });

  it('no-ops when termRef.current is null (no observer attached)', () => {
    const ref = createRef<Terminal>() as RefObject<Terminal | null>;
    // ref.current stays null.
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(observeCalls).toHaveLength(0);
  });

  it('disconnects the observer on unmount', () => {
    const { ref } = makeTerm();
    const { unmount } = renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(disconnectCount).toBe(0);
    unmount();
    expect(disconnectCount).toBe(1);
  });

  it('re-applies the theme when workerName changes (effect re-runs)', () => {
    const { ref, options } = makeTerm();
    const { rerender } = renderHook(
      ({ name }: { name: string }) =>
        useXtermThemeTracking({ termRef: ref, workerName: name }),
      { initialProps: { name: 'one' } },
    );
    options.theme = null;
    rerender({ name: 'two' });
    expect(options.theme).not.toBeNull();
  });

  it('re-creates the observer when workerName changes (disconnect + new observe)', () => {
    const { ref } = makeTerm();
    const { rerender } = renderHook(
      ({ name }: { name: string }) =>
        useXtermThemeTracking({ termRef: ref, workerName: name }),
      { initialProps: { name: 'one' } },
    );
    expect(observeCalls).toHaveLength(1);
    rerender({ name: 'two' });
    expect(disconnectCount).toBe(1);
    expect(observeCalls).toHaveLength(2);
  });

  it('skips the observer wiring when MutationObserver is undefined (still applies initial theme)', () => {
    // @ts-expect-error - intentional removal for the branch test.
    delete globalThis.MutationObserver;
    const { ref, options } = makeTerm();
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    expect(options.theme).not.toBeNull();
  });

  it('produces a theme object with the expected shadcn-mapped keys', () => {
    const { ref, options } = makeTerm();
    renderHook(() =>
      useXtermThemeTracking({ termRef: ref, workerName: 'w1' }),
    );
    const theme = options.theme as Record<string, unknown>;
    expect(typeof theme).toBe('object');
    expect(theme).toHaveProperty('background');
    expect(theme).toHaveProperty('foreground');
    expect(theme).toHaveProperty('cursor');
    expect(theme).toHaveProperty('selectionBackground');
  });
});
