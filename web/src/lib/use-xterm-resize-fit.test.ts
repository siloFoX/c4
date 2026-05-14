import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { useXtermResizeFit } from './use-xterm-resize-fit';

// useXtermResizeFit wires three resize/visibility signals into the
// shared scheduleFit() that useXtermAutofit returns.
//   1. ResizeObserver on the container -> scheduleFit on size change
//   2. window resize listener -> scheduleFit so hidden tabs still re-fit
//      when the browser fires resize but ResizeObserver pauses
//   3. useLayoutEffect on `visible` -> synchronous scheduleFit when the
//      parent toggles visibility so the first paint shows the right size
//   Cleanup: ResizeObserver.disconnect, removeEventListener, AND clear
//   the pending fitTimerRef so an unmount mid-debounce does not leak.

interface ObserverInstance {
  observed: HTMLElement[];
  disconnected: boolean;
  trigger: () => void;
}

let observers: ObserverInstance[] = [];

class ResizeObserverStub {
  cb: () => void;
  inst: ObserverInstance;
  constructor(cb: () => void) {
    this.cb = cb;
    this.inst = {
      observed: [],
      disconnected: false,
      trigger: () => cb(),
    };
    observers.push(this.inst);
  }
  observe(el: HTMLElement): void {
    this.inst.observed.push(el);
  }
  disconnect(): void {
    this.inst.disconnected = true;
  }
}

function makeRefs(visibleEl: boolean) {
  const containerRef: MutableRefObject<HTMLElement | null> = {
    current: visibleEl ? document.createElement('div') : null,
  };
  const fitTimerRef: MutableRefObject<number | null> = { current: null };
  return { containerRef, fitTimerRef };
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useXtermResizeFit', () => {
  it('attaches a ResizeObserver to the container on mount', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observed).toContain(containerRef.current);
  });

  it('does not attach a ResizeObserver when containerRef is null', () => {
    const { fitTimerRef } = makeRefs(false);
    const containerRef: MutableRefObject<HTMLElement | null> = {
      current: null,
    };
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    expect(observers).toHaveLength(0);
  });

  it('does not crash when ResizeObserver is undefined (early return)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    expect(() => {
      renderHook(() =>
        useXtermResizeFit({
          containerRef,
          scheduleFit,
          visible: true,
          fitTimerRef,
        }),
      );
    }).not.toThrow();
  });

  it('invokes scheduleFit when the ResizeObserver callback fires', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    scheduleFit.mockClear();
    observers[0]?.trigger();
    expect(scheduleFit).toHaveBeenCalledTimes(1);
  });

  it('subscribes to window resize and forwards to scheduleFit', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    scheduleFit.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(scheduleFit).toHaveBeenCalledTimes(1);
  });

  it('invokes scheduleFit synchronously when visible flips true (useLayoutEffect)', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    expect(scheduleFit).toHaveBeenCalled();
  });

  it('does not invoke scheduleFit on the visibility effect when visible is false', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: false,
        fitTimerRef,
      }),
    );
    // visible=false should skip the layout-effect call. window resize +
    // ResizeObserver have not fired yet either.
    expect(scheduleFit).not.toHaveBeenCalled();
  });

  it('calls scheduleFit each time visible toggles true on re-render', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) =>
        useXtermResizeFit({
          containerRef,
          scheduleFit,
          visible,
          fitTimerRef,
        }),
      { initialProps: { visible: false } },
    );
    expect(scheduleFit).not.toHaveBeenCalled();
    rerender({ visible: true });
    expect(scheduleFit).toHaveBeenCalled();
  });

  it('disconnects the ResizeObserver on unmount', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    expect(observers[0]?.disconnected).toBe(false);
    unmount();
    expect(observers[0]?.disconnected).toBe(true);
  });

  it('removes the window resize listener on unmount', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    unmount();
    scheduleFit.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(scheduleFit).not.toHaveBeenCalled();
  });

  it('clears a pending fitTimerRef and nulls it on unmount', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    fitTimerRef.current = 42 as unknown as number;
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const scheduleFit = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    unmount();
    expect(clearSpy).toHaveBeenCalledWith(42);
    expect(fitTimerRef.current).toBeNull();
    clearSpy.mockRestore();
  });

  it('does not call clearTimeout on unmount when fitTimerRef is already null', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    fitTimerRef.current = null;
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const scheduleFit = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    unmount();
    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('swallows a ResizeObserver.disconnect throw on teardown (try/catch)', () => {
    class ThrowingRO {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
        observers.push({
          observed: [],
          disconnected: false,
          trigger: () => cb(),
        });
      }
      observe(): void {}
      disconnect(): void {
        throw new Error('teardown race');
      }
    }
    vi.stubGlobal('ResizeObserver', ThrowingRO);
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    const { unmount } = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    expect(() => unmount()).not.toThrow();
  });

  it('survives multiple window resize bursts without leaking listeners across remounts', () => {
    const { containerRef, fitTimerRef } = makeRefs(true);
    const scheduleFit = vi.fn();
    const first = renderHook(() =>
      useXtermResizeFit({
        containerRef,
        scheduleFit,
        visible: true,
        fitTimerRef,
      }),
    );
    first.unmount();
    scheduleFit.mockClear();
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(scheduleFit).not.toHaveBeenCalled();
  });
});
