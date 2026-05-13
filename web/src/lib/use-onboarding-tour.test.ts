import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  TOUR_EVENT_START,
  TOUR_STORAGE_KEY,
  type Step,
} from '../components/OnboardingTour';
import { useOnboardingTour } from './use-onboarding-tour';

// useOnboardingTour drives the 4-step popover state machine extracted
// from OnboardingTour.tsx. Tests cover: idle/initial slots, every
// setter/callback (finish/goPrev/goNext), the localStorage-driven
// auto-open vs. seen branch, the forceOpen sync effect (including
// re-flipping back to closed), the TOUR_EVENT_START listener that
// replays the tour from step 0, the Escape-key dismiss handler
// (active only while open + uses the seen flag), the markSeen
// side effect, the step/isFirst/isLast view-model derivation, the
// goPrev/goNext bounds (clamp at 0 / steps.length - 1), and the
// listener-cleanup on unmount.

const STEPS: Step[] = [
  { titleKey: 't.s1', bodyKey: 't.s1.body' },
  { titleKey: 't.s2', bodyKey: 't.s2.body' },
  { titleKey: 't.s3', bodyKey: 't.s3.body' },
  { titleKey: 't.s4', bodyKey: 't.s4.body' },
];

function dispatchTourStart(): void {
  window.dispatchEvent(new Event(TOUR_EVENT_START));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useOnboardingTour', () => {
  it('auto-opens on a cold start (no seen flag) at step 0', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: undefined, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(true);
    expect(result.current.index).toBe(0);
    expect(result.current.step).toBe(STEPS[0]);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.isLast).toBe(false);
    expect(result.current.total).toBe(STEPS.length);
  });

  it('stays closed when the seen flag is set in localStorage', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: undefined, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(false);
  });

  it('respects an explicit forceOpen=true even when the seen flag is set', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(true);
  });

  it('respects an explicit forceOpen=false even on a cold start', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: false, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(false);
  });

  it('syncs to forceOpen flips and resets the index to 0 on the open transition', () => {
    const { result, rerender } = renderHook(
      ({ force }: { force: boolean | undefined }) =>
        useOnboardingTour({ forceOpen: force, onClose: undefined, steps: STEPS }),
      { initialProps: { force: undefined as boolean | undefined } },
    );
    // Cold start -> open at index 0.
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.index).toBe(2);
    rerender({ force: false });
    expect(result.current.open).toBe(false);
    rerender({ force: true });
    expect(result.current.open).toBe(true);
    expect(result.current.index).toBe(0);
  });

  it('TOUR_EVENT_START re-opens the tour from step 0 after it has been marked seen', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: undefined, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(false);
    act(() => dispatchTourStart());
    expect(result.current.open).toBe(true);
    expect(result.current.index).toBe(0);
    expect(result.current.step).toBe(STEPS[0]);
  });

  it('TOUR_EVENT_START rewinds index to 0 even when the tour is already open', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.index).toBe(2);
    act(() => dispatchTourStart());
    expect(result.current.open).toBe(true);
    expect(result.current.index).toBe(0);
  });

  it('removes the TOUR_EVENT_START listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useOnboardingTour({ forceOpen: undefined, onClose: undefined, steps: STEPS }),
    );
    unmount();
    const removed = removeSpy.mock.calls.some(
      ([type]) => type === TOUR_EVENT_START,
    );
    expect(removed).toBe(true);
  });

  it('goNext advances the step and updates isFirst/isLast derivation', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    act(() => result.current.goNext());
    expect(result.current.index).toBe(1);
    expect(result.current.step).toBe(STEPS[1]);
    expect(result.current.isFirst).toBe(false);
    expect(result.current.isLast).toBe(false);
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.index).toBe(3);
    expect(result.current.isLast).toBe(true);
  });

  it('goNext clamps at steps.length - 1 (does not overflow)', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    for (let i = 0; i < 10; i++) {
      act(() => result.current.goNext());
    }
    expect(result.current.index).toBe(STEPS.length - 1);
    expect(result.current.isLast).toBe(true);
  });

  it('goPrev rewinds the step and clamps at 0', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.index).toBe(2);
    act(() => result.current.goPrev());
    expect(result.current.index).toBe(1);
    for (let i = 0; i < 10; i++) {
      act(() => result.current.goPrev());
    }
    expect(result.current.index).toBe(0);
    expect(result.current.isFirst).toBe(true);
  });

  it('finish("done") marks-seen, closes the tour, resets index, and invokes onClose', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose, steps: STEPS }),
    );
    act(() => result.current.goNext());
    act(() => result.current.finish('done'));
    expect(result.current.open).toBe(false);
    expect(result.current.index).toBe(0);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('seen');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('finish("skip") marks-seen and closes (same persistence as done)', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose, steps: STEPS }),
    );
    act(() => result.current.finish('skip'));
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('seen');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('finish tolerates an undefined onClose (no throw)', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    expect(() => act(() => result.current.finish('done'))).not.toThrow();
    expect(result.current.open).toBe(false);
  });

  it('Escape key fires finish("skip") while the tour is open (closes + marks-seen)', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose, steps: STEPS }),
    );
    expect(result.current.open).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('seen');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('non-Escape keys do not close the tour', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    });
    expect(result.current.open).toBe(true);
  });

  it('Escape is ignored when the tour is closed (the listener is not bound)', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: undefined, onClose, steps: STEPS }),
    );
    expect(result.current.open).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('seen');
  });

  it('removes the keydown listener when the tour closes (transition from open->closed)', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.open).toBe(true);
    act(() => result.current.finish('done'));
    const removed = removeSpy.mock.calls.some(([type]) => type === 'keydown');
    expect(removed).toBe(true);
  });

  it('step memo follows the index ("step" tracks STEPS[index])', () => {
    const { result } = renderHook(() =>
      useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
    );
    expect(result.current.step).toBe(STEPS[0]);
    act(() => result.current.goNext());
    expect(result.current.step).toBe(STEPS[1]);
    act(() => result.current.goNext());
    expect(result.current.step).toBe(STEPS[2]);
    act(() => result.current.goPrev());
    expect(result.current.step).toBe(STEPS[1]);
  });

  it('total reflects the supplied steps array length and updates on prop change', () => {
    const { result, rerender } = renderHook(
      ({ steps }: { steps: readonly Step[] }) =>
        useOnboardingTour({ forceOpen: true, onClose: undefined, steps }),
      { initialProps: { steps: STEPS as readonly Step[] } },
    );
    expect(result.current.total).toBe(4);
    rerender({ steps: STEPS.slice(0, 2) });
    expect(result.current.total).toBe(2);
  });

  it('survives a localStorage.getItem throw (private mode) by treating the tour as unseen', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('private mode');
      });
    try {
      const { result } = renderHook(() =>
        useOnboardingTour({ forceOpen: undefined, onClose: undefined, steps: STEPS }),
      );
      // shouldAutoOpen returns false on throw, so open stays false.
      expect(result.current.open).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('survives a localStorage.setItem throw in markSeen (no rethrow on finish)', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    try {
      const { result } = renderHook(() =>
        useOnboardingTour({ forceOpen: true, onClose: undefined, steps: STEPS }),
      );
      expect(() => act(() => result.current.finish('done'))).not.toThrow();
      expect(result.current.open).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
