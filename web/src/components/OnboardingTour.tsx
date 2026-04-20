import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rocket, X } from 'lucide-react';
import { Button, IconButton } from './ui';
import { cn } from '../lib/cn';
import { t, useLocale } from '../lib/i18n';

export const TOUR_STORAGE_KEY = 'c4.onboardingTour.v1';
export const TOUR_EVENT_START = 'c4:tour-start';

interface OnboardingTourProps {
  // When true, renders regardless of whether the user has already seen
  // the tour (used when replaying from Settings or via the ? menu).
  forceOpen?: boolean;
  onClose?: () => void;
}

interface Step {
  titleKey: string;
  bodyKey: string;
}

const STEPS: Step[] = [
  { titleKey: 'tour.step1.title', bodyKey: 'tour.step1.body' },
  { titleKey: 'tour.step2.title', bodyKey: 'tour.step2.body' },
  { titleKey: 'tour.step3.title', bodyKey: 'tour.step3.body' },
  { titleKey: 'tour.step4.title', bodyKey: 'tour.step4.body' },
];

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

export function startOnboardingTour(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(TOUR_EVENT_START));
  } catch {
    // ignore
  }
}

// 8.33: dismissable 4-step popover tour. Fires once per browser
// (TOUR_STORAGE_KEY). Manager can re-trigger it through the help menu or
// the exported startOnboardingTour() helper.

export function OnboardingTour({ forceOpen, onClose }: OnboardingTourProps) {
  useLocale();
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

  const step = useMemo(() => STEPS[index], [index]);
  const isLast = index === STEPS.length - 1;
  const isFirst = index === 0;

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-background/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('tour.step1.title')}
      data-tour-overlay
    >
      <div
        className={cn(
          'w-full max-w-md rounded-lg border border-primary/30 bg-card p-4 shadow-xl',
        )}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {`${index + 1} / ${STEPS.length}`}
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
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                {t('common.back')}
              </Button>
            )}
            {!isLast ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}
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
