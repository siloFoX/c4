import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { Button, IconButton } from './ui';
import { cn } from '../lib/cn';
import { dispatchEvent } from '../lib/dispatch-event';
import { t, useLocale } from '../lib/i18n';

// (v1.11.85) Rewrite with Tailwind motion-safe transitions. The
// tour now highlights each step's target via a box-shadow ring
// over a backdrop-blurred overlay, fades the popover between
// steps with a 200ms ease-out transition, and persists the
// "user actively skipped" decision under a dedicated
// 'c4.tour.skipped' key so analytics can distinguish skip from
// done. The legacy TOUR_STORAGE_KEY 'seen' marker is preserved
// for backward compatibility with the (now-unused, but still
// tested) useOnboardingTour hook in lib/.

export const TOUR_STORAGE_KEY = 'c4.onboardingTour.v1';
export const TOUR_SKIP_KEY = 'c4.tour.skipped';
export const TOUR_EVENT_START = 'c4:tour-start';

interface OnboardingTourProps {
  // When true, renders regardless of whether the user has already seen
  // the tour (used when replaying from Settings or via the ? menu).
  forceOpen?: boolean;
  onClose?: () => void;
}

export interface Step {
  titleKey: string;
  bodyKey: string;
  // Optional CSS selector for the element the spotlight ring frames.
  // When the selector resolves, the tour adds data-tour-active="true"
  // on the target for the duration of that step (cleanup on advance /
  // dismiss). When the selector misses, the popover still renders but
  // no ring is drawn.
  targetSelector?: string;
}

const STEPS: Step[] = [
  {
    titleKey: 'tour.step1.title',
    bodyKey: 'tour.step1.body',
    targetSelector: '[data-tour-step="tabs"]',
  },
  {
    titleKey: 'tour.step2.title',
    bodyKey: 'tour.step2.body',
    targetSelector: '[data-tour-step="sidebar"]',
  },
  {
    titleKey: 'tour.step3.title',
    bodyKey: 'tour.step3.body',
    targetSelector: '[data-tour-step="banner"]',
  },
  {
    titleKey: 'tour.step4.title',
    bodyKey: 'tour.step4.body',
    targetSelector: '[data-tour-step="help"]',
  },
];

function shouldAutoOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(TOUR_SKIP_KEY) === 'true') return false;
    if (window.localStorage.getItem(TOUR_STORAGE_KEY) === 'seen') return false;
    return true;
  } catch {
    // Private mode / locked storage — fail closed so we don't flash the
    // popover on an environment where we cannot persist the dismissal.
    return false;
  }
}

function markSkipped(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOUR_SKIP_KEY, 'true');
  } catch {
    // ignore
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

export function startOnboardingTour(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
    window.localStorage.removeItem(TOUR_SKIP_KEY);
  } catch {
    // ignore
  }
  dispatchEvent(TOUR_EVENT_START);
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// 8.33: dismissable 4-step popover tour. Fires once per browser
// (TOUR_SKIP_KEY for skip / TOUR_STORAGE_KEY for done). Manager
// can re-trigger it through the help menu or the exported
// startOnboardingTour() helper.

export function OnboardingTour({ forceOpen, onClose }: OnboardingTourProps) {
  useLocale();

  const [open, setOpen] = useState<boolean>(() => forceOpen ?? shouldAutoOpen());
  const [index, setIndex] = useState<number>(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  // forceOpen sync — when the parent flips it explicitly, mirror the value
  // and rewind to step 0 on the open transition so the replay always starts
  // at the welcome step.
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

  const step = useMemo(() => STEPS[index], [index]);
  const total = STEPS.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const finish = useCallback(
    (reason: 'done' | 'skip') => {
      if (reason === 'skip') markSkipped();
      else markSeen();
      setOpen(false);
      setIndex(0);
      onClose?.();
    },
    [onClose],
  );

  // Escape dismisses (treated as a skip — the user is opting out, not
  // completing the flow).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skip');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  // Resolve the active step's target element. While that step is on
  // screen, mark the target with data-tour-active="true" and snapshot
  // its rect so the spotlight ring can position itself. Cleanup runs
  // on index change / dismount / dismiss.
  useEffect(() => {
    if (!open || !step?.targetSelector) {
      setRect(null);
      return;
    }
    if (typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>(step.targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    el.setAttribute('data-tour-active', 'true');
    return () => {
      el.removeAttribute('data-tour-active');
    };
  }, [open, index, step?.targetSelector]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);

  if (!open || !step) return null;

  const stepId = String(index + 1);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center',
        'bg-background/40 motion-safe:backdrop-blur-sm',
        'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.step1.title')}
      data-tour-overlay
      data-tour-step={stepId}
    >
      {rect && (
        <div
          aria-hidden="true"
          data-tour-spotlight
          data-tour-step={stepId}
          className={cn(
            'pointer-events-none absolute rounded-md',
            'ring-2 ring-primary ring-offset-2 ring-offset-background',
            'shadow-[0_0_0_4px_hsl(var(--primary)/0.35)]',
            'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          )}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
      <div
        key={index}
        data-tour-popover
        data-tour-step={stepId}
        className={cn(
          'relative w-full max-w-md rounded-lg border border-primary/30 bg-card p-4 shadow-xl',
          'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2',
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {`${index + 1} / ${total}`}
            </span>
          </div>
          <IconButton
            aria-label={t('common.dismiss')}
            onClick={() => finish('skip')}
            icon={<X className="h-4 w-4" />}
          />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {t(step.titleKey)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(step.bodyKey)}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => finish('skip')}
          >
            {t('common.skip')}
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goPrev}
              >
                {t('common.back')}
              </Button>
            )}
            {!isLast ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={goNext}
              >
                {t('common.next')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => finish('done')}
              >
                {t('common.done')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

OnboardingTour.displayName = 'OnboardingTour';
