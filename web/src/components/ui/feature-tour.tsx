import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';

// (v1.11.444, TODO 11.426) FeatureTour primitive.
//
// Multi-step product tour. Each step targets an existing DOM
// element by CSS selector; the primitive paints a translucent
// mask everywhere except the anchor, anchors a tooltip panel
// next to it, and exposes Prev / Next / Skip / Finish controls.
// Dismissal is persisted to `localStorage` under a tour id so
// users do not see the same tour twice.
//
// Reference: /root/c4/arps-design-system-v1/.

export type FeatureTourPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'auto';

export interface FeatureTourStep {
  id: string;
  target: string;
  title: ReactNode;
  description?: ReactNode;
  placement?: FeatureTourPlacement;
}

export interface FeatureTourLabels {
  prev?: string;
  next?: string;
  skip?: string;
  finish?: string;
  closeAria?: string;
}

export interface FeatureTourProps {
  tourId: string;
  steps: FeatureTourStep[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  stepIndex?: number;
  defaultStepIndex?: number;
  onStepChange?: (index: number) => void;
  onComplete?: () => void;
  onSkip?: () => void;
  storageKey?: string;
  showMask?: boolean;
  closeOnEscape?: boolean;
  showProgress?: boolean;
  panelOffset?: number;
  labels?: FeatureTourLabels;
  className?: string;
  panelClassName?: string;
  containerId?: string;
  ariaLabel?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_FEATURE_TOUR_STORAGE_PREFIX = 'c4:feature-tour:';
export const DEFAULT_FEATURE_TOUR_PLACEMENT: FeatureTourPlacement =
  'bottom';
export const DEFAULT_FEATURE_TOUR_PANEL_WIDTH = 320;
export const DEFAULT_FEATURE_TOUR_PANEL_OFFSET = 12;

export interface FeatureTourLabelsResolved {
  prev: string;
  next: string;
  skip: string;
  finish: string;
  closeAria: string;
}

export function getTourStorageKey(
  tourId: string,
  override?: string,
): string {
  if (override) return override;
  return `${DEFAULT_FEATURE_TOUR_STORAGE_PREFIX}${tourId}`;
}

export function isTourDismissed(
  tourId: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(getTourStorageKey(tourId, override)) ===
      'dismissed';
  } catch {
    return false;
  }
}

export function markTourDismissed(
  tourId: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      getTourStorageKey(tourId, override),
      'dismissed',
    );
  } catch {
    // private mode / quota exceeded -> swallow
  }
}

export function clearTourDismissal(
  tourId: string,
  override?: string,
  storage: Storage | null | undefined = typeof window !== 'undefined'
    ? window.localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.removeItem(getTourStorageKey(tourId, override));
  } catch {
    // swallow
  }
}

export function clampStepIndex(
  index: number,
  total: number,
): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  if (index < 0) return 0;
  if (index > total - 1) return total - 1;
  return Math.floor(index);
}

export interface PanelRect {
  width: number;
  height: number;
}

export interface ViewportRect {
  width: number;
  height: number;
}

export interface PanelPosition {
  top: number;
  left: number;
  placement: Exclude<FeatureTourPlacement, 'auto'>;
}

export function resolveAutoPlacement(
  anchor: { top: number; left: number; width: number; height: number },
  panel: PanelRect,
  viewport: ViewportRect,
  offset: number = DEFAULT_FEATURE_TOUR_PANEL_OFFSET,
): Exclude<FeatureTourPlacement, 'auto'> {
  const fitsBottom =
    anchor.top + anchor.height + offset + panel.height <=
    viewport.height;
  if (fitsBottom) return 'bottom';
  const fitsTop = anchor.top - offset - panel.height >= 0;
  if (fitsTop) return 'top';
  const fitsRight =
    anchor.left + anchor.width + offset + panel.width <=
    viewport.width;
  if (fitsRight) return 'right';
  return 'left';
}

export function computeTourPanelPosition(
  anchor: { top: number; left: number; width: number; height: number },
  panel: PanelRect,
  placement: FeatureTourPlacement = DEFAULT_FEATURE_TOUR_PLACEMENT,
  viewport: ViewportRect = { width: 1280, height: 800 },
  offset: number = DEFAULT_FEATURE_TOUR_PANEL_OFFSET,
): PanelPosition {
  const resolved =
    placement === 'auto'
      ? resolveAutoPlacement(anchor, panel, viewport, offset)
      : placement;
  let top = 0;
  let left = 0;
  switch (resolved) {
    case 'top':
      top = anchor.top - offset - panel.height;
      left = anchor.left + anchor.width / 2 - panel.width / 2;
      break;
    case 'bottom':
      top = anchor.top + anchor.height + offset;
      left = anchor.left + anchor.width / 2 - panel.width / 2;
      break;
    case 'left':
      top = anchor.top + anchor.height / 2 - panel.height / 2;
      left = anchor.left - offset - panel.width;
      break;
    case 'right':
      top = anchor.top + anchor.height / 2 - panel.height / 2;
      left = anchor.left + anchor.width + offset;
      break;
    default:
      break;
  }
  // Clamp into the viewport
  top = Math.max(0, Math.min(top, viewport.height - panel.height));
  left = Math.max(0, Math.min(left, viewport.width - panel.width));
  return { top, left, placement: resolved };
}

function resolveLabels(
  labels?: FeatureTourLabels,
): FeatureTourLabelsResolved {
  return {
    prev: labels?.prev ?? 'Previous',
    next: labels?.next ?? 'Next',
    skip: labels?.skip ?? 'Skip',
    finish: labels?.finish ?? 'Finish',
    closeAria: labels?.closeAria ?? 'Close tour',
  };
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const FeatureTour = forwardRef(function FeatureTour(
  {
    tourId,
    steps,
    open: openProp,
    defaultOpen = true,
    onOpenChange,
    stepIndex: stepIndexProp,
    defaultStepIndex = 0,
    onStepChange,
    onComplete,
    onSkip,
    storageKey,
    showMask = true,
    closeOnEscape = true,
    showProgress = true,
    panelOffset = DEFAULT_FEATURE_TOUR_PANEL_OFFSET,
    labels,
    className,
    panelClassName,
    containerId = 'app-portal-root',
    ariaLabel = 'Feature tour',
  }: FeatureTourProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const total = steps.length;
  const resolvedLabels = useMemo(() => resolveLabels(labels), [labels]);

  // Track whether the user previously dismissed this tour so
  // the primitive renders a no-op the next time around.
  const initiallyDismissed = useMemo(
    () => isTourDismissed(tourId, storageKey),
    [tourId, storageKey],
  );

  const isOpenControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState<boolean>(
    () => defaultOpen && !initiallyDismissed,
  );
  const effectiveOpen = isOpenControlled
    ? !!openProp
    : internalOpen;

  const isStepControlled = stepIndexProp !== undefined;
  const [internalStep, setInternalStep] = useState<number>(() =>
    clampStepIndex(defaultStepIndex, total),
  );
  const effectiveStep = clampStepIndex(
    isStepControlled ? (stepIndexProp ?? 0) : internalStep,
    total,
  );

  const onOpenChangeRef = useRef(onOpenChange);
  const onStepChangeRef = useRef(onStepChange);
  const onCompleteRef = useRef(onComplete);
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  }, [onStepChange]);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  const emitOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setInternalOpen(next);
      onOpenChangeRef.current?.(next);
    },
    [isOpenControlled],
  );

  const emitStep = useCallback(
    (next: number) => {
      const clamped = clampStepIndex(next, total);
      if (!isStepControlled) setInternalStep(clamped);
      onStepChangeRef.current?.(clamped);
    },
    [isStepControlled, total],
  );

  const close = useCallback(
    (reason: 'skip' | 'complete' | 'manual') => {
      if (reason !== 'manual') {
        markTourDismissed(tourId, storageKey);
      }
      emitOpen(false);
      if (reason === 'skip') onSkipRef.current?.();
      if (reason === 'complete') onCompleteRef.current?.();
    },
    [emitOpen, storageKey, tourId],
  );

  const next = useCallback(() => {
    if (effectiveStep >= total - 1) {
      close('complete');
      return;
    }
    emitStep(effectiveStep + 1);
  }, [close, effectiveStep, emitStep, total]);

  const prev = useCallback(() => {
    if (effectiveStep <= 0) return;
    emitStep(effectiveStep - 1);
  }, [effectiveStep, emitStep]);

  const skip = useCallback(() => {
    close('skip');
  }, [close]);

  // --- Anchor measurement -------------------------------
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<PanelRect>({
    width: DEFAULT_FEATURE_TOUR_PANEL_WIDTH,
    height: 160,
  });
  const panelMeasureRef = useRef<HTMLDivElement | null>(null);

  const activeStep = steps[effectiveStep];

  useEffect(() => {
    if (!effectiveOpen || !activeStep) return undefined;
    const measure = () => {
      const el = document.querySelector(activeStep.target);
      if (el instanceof HTMLElement) {
        setAnchorRect(el.getBoundingClientRect());
      } else {
        setAnchorRect(null);
      }
      if (panelMeasureRef.current) {
        const pr = panelMeasureRef.current.getBoundingClientRect();
        setPanelRect({
          width: pr.width || DEFAULT_FEATURE_TOUR_PANEL_WIDTH,
          height: pr.height || 160,
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [activeStep, effectiveOpen]);

  // --- Keyboard -----------------------------------------
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        if (!closeOnEscape) return;
        event.preventDefault();
        skip();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
      }
    },
    [closeOnEscape, next, prev, skip],
  );

  // --- Portal target ------------------------------------
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(
    null,
  );
  useEffect(() => {
    if (!effectiveOpen) {
      setPortalTarget(null);
      return undefined;
    }
    setPortalTarget(getPortalRoot(containerId));
    return undefined;
  }, [containerId, effectiveOpen]);

  if (!effectiveOpen || !activeStep || !portalTarget) return null;

  const isFirst = effectiveStep === 0;
  const isLast = effectiveStep === total - 1;

  const viewport: ViewportRect = {
    width: window.innerWidth || 1280,
    height: window.innerHeight || 800,
  };

  const position = anchorRect
    ? computeTourPanelPosition(
        {
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        panelRect,
        activeStep.placement ?? DEFAULT_FEATURE_TOUR_PLACEMENT,
        viewport,
        panelOffset,
      )
    : {
        top: viewport.height / 2 - panelRect.height / 2,
        left: viewport.width / 2 - panelRect.width / 2,
        placement: 'bottom' as const,
      };

  return createPortal(
    <div
      ref={ref}
      data-section="feature-tour"
      data-tour-id={tourId}
      data-step-index={effectiveStep}
      data-step-id={activeStep.id}
      data-step-count={total}
      data-anchor-found={anchorRect ? 'true' : 'false'}
      data-placement={position.placement}
      onKeyDown={onKeyDown}
      className={cn('fixed inset-0 z-50', className)}
    >
      {showMask ? (
        <div
          aria-hidden="true"
          data-section="feature-tour-mask"
          onClick={() => close('manual')}
          className="absolute inset-0 bg-black/60"
        />
      ) : null}
      {anchorRect ? (
        <div
          aria-hidden="true"
          data-section="feature-tour-spotlight"
          className="pointer-events-none absolute rounded-md ring-4 ring-primary/80 ring-offset-2 ring-offset-transparent"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: anchorRect.width,
            height: anchorRect.height,
          }}
        />
      ) : null}
      <div
        ref={panelMeasureRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={`feature-tour-title-${activeStep.id}`}
        data-section="feature-tour-panel"
        tabIndex={-1}
        style={{
          top: position.top,
          left: position.left,
          width: DEFAULT_FEATURE_TOUR_PANEL_WIDTH,
        }}
        className={cn(
          'absolute flex flex-col gap-2 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-xl',
          panelClassName,
        )}
      >
        <div
          data-section="feature-tour-header"
          className="flex items-start justify-between gap-2"
        >
          <h2
            id={`feature-tour-title-${activeStep.id}`}
            data-section="feature-tour-title"
            className="text-sm font-semibold"
          >
            {activeStep.title}
          </h2>
          <button
            type="button"
            data-section="feature-tour-close"
            aria-label={resolvedLabels.closeAria}
            onClick={() => close('manual')}
            className="-mr-1 -mt-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {activeStep.description !== undefined ? (
          <p
            data-section="feature-tour-description"
            className="text-sm text-muted-foreground"
          >
            {activeStep.description}
          </p>
        ) : null}
        {showProgress ? (
          <div
            data-section="feature-tour-progress"
            className="text-xs text-muted-foreground"
          >
            {effectiveStep + 1} / {total}
          </div>
        ) : null}
        <div
          data-section="feature-tour-actions"
          className="mt-2 flex items-center justify-between gap-2"
        >
          <button
            type="button"
            data-section="feature-tour-skip"
            onClick={skip}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {resolvedLabels.skip}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-section="feature-tour-prev"
              onClick={prev}
              disabled={isFirst}
              className="rounded px-2 py-1 text-xs text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resolvedLabels.prev}
            </button>
            <button
              type="button"
              data-section="feature-tour-next"
              onClick={next}
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? resolvedLabels.finish : resolvedLabels.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget,
  );
});

FeatureTour.displayName = 'FeatureTour';
