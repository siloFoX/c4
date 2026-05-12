import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { useScrollIntoViewOnOpen } from './use-scroll-into-view-on-open';

// jsdom does not implement scrollIntoView; install a no-op on the
// prototype so vi.spyOn has something to wrap, then restore.
const originalScrollIntoView = (
  HTMLElement.prototype as { scrollIntoView?: HTMLElement['scrollIntoView'] }
).scrollIntoView;

let scrollSpy: MockInstance<(arg?: ScrollIntoViewOptions | boolean) => void>;
let rafSpy: MockInstance<(cb: FrameRequestCallback) => number>;
let cancelSpy: MockInstance<(id: number) => void>;
let lastRafCallback: FrameRequestCallback | null = null;
let rafIdSeq = 0;

beforeEach(() => {
  (
    HTMLElement.prototype as { scrollIntoView: HTMLElement['scrollIntoView'] }
  ).scrollIntoView = () => {};
  scrollSpy = vi
    .spyOn(HTMLElement.prototype, 'scrollIntoView')
    .mockImplementation(() => {});
  lastRafCallback = null;
  rafIdSeq = 0;
  rafSpy = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      lastRafCallback = cb;
      rafIdSeq += 1;
      return rafIdSeq;
    });
  cancelSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollIntoView === undefined) {
    delete (
      HTMLElement.prototype as { scrollIntoView?: HTMLElement['scrollIntoView'] }
    ).scrollIntoView;
  } else {
    (
      HTMLElement.prototype as { scrollIntoView: HTMLElement['scrollIntoView'] }
    ).scrollIntoView = originalScrollIntoView;
  }
});

function makeAttachedRef(): RefObject<HTMLElement | null> {
  const ref = createRef<HTMLElement | null>();
  const el = document.createElement('div');
  // RefObject<T>.current is writable in tests.
  (ref as { current: HTMLElement | null }).current = el;
  return ref;
}

function flushRaf(): void {
  if (lastRafCallback) lastRafCallback(performance.now());
}

describe('useScrollIntoViewOnOpen', () => {
  it('does not schedule a scroll when open is false on mount', () => {
    const ref = makeAttachedRef();
    renderHook(() => useScrollIntoViewOnOpen({ open: false, ref }));
    expect(rafSpy).not.toHaveBeenCalled();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('schedules a single rAF and calls scrollIntoView with block:start when mounted open', () => {
    const ref = makeAttachedRef();
    renderHook(() => useScrollIntoViewOnOpen({ open: true, ref }));
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).not.toHaveBeenCalled();
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    });
  });

  it('schedules a scroll when open flips false -> true', () => {
    const ref = makeAttachedRef();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useScrollIntoViewOnOpen({ open, ref }),
      { initialProps: { open: false } },
    );
    expect(rafSpy).not.toHaveBeenCalled();
    rerender({ open: true });
    expect(rafSpy).toHaveBeenCalledTimes(1);
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous frame and reschedules when key changes while open', () => {
    const ref = makeAttachedRef();
    const { rerender } = renderHook(
      ({ k }: { k: string }) =>
        useScrollIntoViewOnOpen({ open: true, ref, key: k }),
      { initialProps: { k: 'a' } },
    );
    expect(rafSpy).toHaveBeenCalledTimes(1);
    const firstFrameId = rafIdSeq;
    rerender({ k: 'b' });
    expect(cancelSpy).toHaveBeenCalledWith(firstFrameId);
    expect(rafSpy).toHaveBeenCalledTimes(2);
    flushRaf();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending frame when open flips true -> false without calling scroll', () => {
    const ref = makeAttachedRef();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useScrollIntoViewOnOpen({ open, ref }),
      { initialProps: { open: true } },
    );
    expect(rafSpy).toHaveBeenCalledTimes(1);
    const frameId = rafIdSeq;
    rerender({ open: false });
    expect(cancelSpy).toHaveBeenCalledWith(frameId);
    // Do not flush the pending callback -- the cleanup ran first.
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('cancels the pending frame on unmount', () => {
    const ref = makeAttachedRef();
    const { unmount } = renderHook(() =>
      useScrollIntoViewOnOpen({ open: true, ref }),
    );
    expect(rafSpy).toHaveBeenCalledTimes(1);
    const frameId = rafIdSeq;
    unmount();
    expect(cancelSpy).toHaveBeenCalledWith(frameId);
  });

  it('does not throw when ref.current is null at flush time', () => {
    const ref = createRef<HTMLElement | null>();
    renderHook(() => useScrollIntoViewOnOpen({ open: true, ref }));
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(() => flushRaf()).not.toThrow();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when the open value re-renders without changing', () => {
    const ref = makeAttachedRef();
    const { rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useScrollIntoViewOnOpen({ open, ref }),
      { initialProps: { open: true } },
    );
    expect(rafSpy).toHaveBeenCalledTimes(1);
    flushRaf();
    rerender({ open: true });
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });
});
