import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TOUR_EVENT_START,
  TOUR_STORAGE_KEY,
  type Step,
} from '../components/OnboardingTour';

// (v1.10.713) Extracted from OnboardingTour. The tour
// state machine — open / index slots, the forceOpen
// sync effect, the TOUR_EVENT_START listener that
// replays the tour from step 0, the Escape-key
// dismiss handler (active only while the tour is
// open), the finish callback that marks-seen +
// resets, and the step / isFirst / isLast view-model
// derivation.

function shouldAutoOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) !== 'seen';
  } catch {
    return false;
  }
}

function markSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
  } catch {
    // ignore
  }
}

export interface OnboardingTourState {
  open: boolean;
  index: number;
  step: Step | undefined;
  isFirst: boolean;
  isLast: boolean;
  total: number;
  finish: (reason: 'done' | 'skip') => void;
  goPrev: () => void;
  goNext: () => void;
}

export function useOnboardingTour(args: {
  forceOpen: boolean | undefined;
  onClose: (() => void) | undefined;
  steps: readonly Step[];
}): OnboardingTourState {
  const { forceOpen, onClose, steps } = args;
  const [open, setOpen] = useState<boolean>(() => forceOpen ?? shouldAutoOpen());
  const [index, setIndex] = useState<number>(0);

  useEffect(() => {
    if (forceOpen !== undefined) {
      setOpen(forceOpen);
      if (forceOpen) setIndex(0);
    }
  }, [forceOpen]);

  useEffect(() => {
    const onStart = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT_START, onStart);
    return () => window.removeEventListener(TOUR_EVENT_START, onStart);
  }, []);

  const finish = useCallback(
    (reason: 'done' | 'skip') => {
      markSeen();
      setOpen(false);
      setIndex(0);
      onClose?.();
      if (reason === 'done' && typeof window !== 'undefined') {
        // no-op hook for analytics
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  const step = useMemo(() => steps[index], [steps, index]);
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }, [steps.length]);

  return { open, index, step, isFirst, isLast, total: steps.length, finish, goPrev, goNext };
}
