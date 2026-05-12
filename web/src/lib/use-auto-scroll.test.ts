import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import { AUTOSCROLL_THRESHOLD_PX, useAutoScroll } from './use-auto-scroll';

function makeScrollEl(scrollHeight: number, clientHeight = 0): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
  el.scrollTop = 0;
  return el;
}

function makeRef(el: HTMLDivElement | null): RefObject<HTMLDivElement | null> {
  return { current: el } as RefObject<HTMLDivElement | null>;
}

describe('useAutoScroll', () => {
  it('exports AUTOSCROLL_THRESHOLD_PX = 24', () => {
    expect(AUTOSCROLL_THRESHOLD_PX).toBe(24);
  });

  it('initial autoScroll is true', () => {
    const ref = makeRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    expect(result.current.autoScroll).toBe(true);
  });

  it('scrolls to bottom on mount when ref is set and autoScroll is true', () => {
    const el = makeScrollEl(1000);
    const ref = makeRef(el);
    renderHook(() => useAutoScroll({ scrollRef: ref, bumpKey: 0 }));
    expect(el.scrollTop).toBe(1000);
  });

  it('re-scrolls to bottom when bumpKey changes', () => {
    const el = makeScrollEl(800);
    const ref = makeRef(el);
    const { rerender } = renderHook(
      ({ k }) => useAutoScroll({ scrollRef: ref, bumpKey: k }),
      { initialProps: { k: 0 } },
    );
    el.scrollTop = 0;
    rerender({ k: 1 });
    expect(el.scrollTop).toBe(800);
    el.scrollTop = 0;
    rerender({ k: 2 });
    expect(el.scrollTop).toBe(800);
  });

  it('does not scroll on bumpKey change while autoScroll is false', () => {
    const el = makeScrollEl(500);
    const ref = makeRef(el);
    const { result, rerender } = renderHook(
      ({ k }) => useAutoScroll({ scrollRef: ref, bumpKey: k }),
      { initialProps: { k: 0 } },
    );
    act(() => result.current.setAutoScroll(false));
    el.scrollTop = 123;
    rerender({ k: 1 });
    expect(el.scrollTop).toBe(123);
  });

  it('setAutoScroll flips the exposed state', () => {
    const ref = makeRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    act(() => result.current.setAutoScroll(false));
    expect(result.current.autoScroll).toBe(false);
    act(() => result.current.setAutoScroll(true));
    expect(result.current.autoScroll).toBe(true);
  });

  it('jumpToBottom scrolls to bottom and re-arms autoScroll', () => {
    const el = makeScrollEl(2000);
    const ref = makeRef(el);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    act(() => result.current.setAutoScroll(false));
    el.scrollTop = 0;
    act(() => result.current.jumpToBottom());
    expect(el.scrollTop).toBe(2000);
    expect(result.current.autoScroll).toBe(true);
  });

  it('jumpToBottom is a no-op when scrollRef.current is null (does not re-arm autoScroll either)', () => {
    const ref = makeRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    act(() => result.current.setAutoScroll(false));
    expect(() => act(() => result.current.jumpToBottom())).not.toThrow();
    expect(result.current.autoScroll).toBe(false);
  });

  it('isAtBottom returns true when within AUTOSCROLL_THRESHOLD_PX of the bottom', () => {
    const el = makeScrollEl(1000, 200);
    const ref = makeRef(el);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    el.scrollTop = 800 - AUTOSCROLL_THRESHOLD_PX;
    expect(result.current.isAtBottom()).toBe(true);
    el.scrollTop = 1000;
    expect(result.current.isAtBottom()).toBe(true);
  });

  it('isAtBottom returns false when farther than AUTOSCROLL_THRESHOLD_PX from the bottom', () => {
    const el = makeScrollEl(1000, 200);
    const ref = makeRef(el);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    el.scrollTop = 0;
    expect(result.current.isAtBottom()).toBe(false);
    el.scrollTop = 800 - AUTOSCROLL_THRESHOLD_PX - 1;
    expect(result.current.isAtBottom()).toBe(false);
  });

  it('isAtBottom returns false when scrollRef.current is null', () => {
    const ref = makeRef(null);
    const { result } = renderHook(() =>
      useAutoScroll({ scrollRef: ref, bumpKey: 0 }),
    );
    expect(result.current.isAtBottom()).toBe(false);
  });
});
