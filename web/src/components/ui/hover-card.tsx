import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '../../lib/portal-root';
import { cn } from '../../lib/cn';

// (v1.11.403, TODO 11.385) HoverCard -- rich popover that
// opens on pointer hover, NOT on focus (the focus-vs-hover
// distinction is important: HoverCard is for "preview on
// mouse pause" while Tooltip / Popover handle focus + click
// triggers respectively).
//
// Behaviour:
//   - Trigger fires mouseenter -> open after `openDelay`
//     (default 300ms). Mouseleave -> close after
//     `closeDelay` (default 200ms).
//   - Hovering the CARD itself keeps it open (the timer
//     starts on leave of both trigger AND card).
//   - Touch devices: long-press / touchstart fallback
//     mirrors mouseenter so a tap-and-hold reveals the card.
//   - Keyboard: ESC closes; the trigger does NOT focus-open
//     the card by design (use `<Popover>` for focus-trigger
//     surfaces).
//   - Smart anchor positioning: flips to the opposite side
//     when the panel would overflow the viewport, matches
//     the existing `<Popover>` placement contract.
//   - Portal rendering: panel mounts under the
//     `hover-card-root` portal (auto-created on first use)
//     so the card escapes parent overflow / transform
//     containers.

export type HoverCardPlacement = 'top' | 'bottom' | 'left' | 'right';
export type HoverCardAlign = 'start' | 'center' | 'end';

export interface HoverCardProps {
  /** Trigger element. Must accept a ref + standard mouse handlers. */
  trigger: ReactElement;
  /** Card body. Rendered inside the portal panel. */
  content: ReactNode;
  /**
   * Controlled open state. When omitted, the component
   * tracks the state internally.
   */
  open?: boolean;
  /** Initial open state in uncontrolled mode. Default false. */
  defaultOpen?: boolean;
  /** Fires every time the open state changes. */
  onOpenChange?: (open: boolean) => void;
  /** Preferred placement. Auto-flips when out of viewport. */
  placement?: HoverCardPlacement;
  /** Cross-axis alignment. Default center. */
  align?: HoverCardAlign;
  /** Pixel gap between trigger and panel. Default 8. */
  offset?: number;
  /**
   * Delay before opening after the user pauses on the
   * trigger. Default 300ms. Set to 0 for immediate.
   */
  openDelay?: number;
  /**
   * Delay before closing after the user leaves both
   * the trigger AND the panel. Default 200ms. Set to 0
   * to close synchronously.
   */
  closeDelay?: number;
  /** Test hook on the panel. */
  'data-testid'?: string;
  className?: string;
}

function opposite(p: HoverCardPlacement): HoverCardPlacement {
  if (p === 'top') return 'bottom';
  if (p === 'bottom') return 'top';
  if (p === 'left') return 'right';
  return 'left';
}

interface ComputedPosition {
  top: number;
  left: number;
  placement: HoverCardPlacement;
}

// (v1.11.403, TODO 11.385) Exported for tests + parallel
// primitives that want the same flip-on-overflow math.
export function computeHoverCardPosition(
  trigger: { top: number; left: number; right: number; bottom: number; width: number; height: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: HoverCardPlacement,
  align: HoverCardAlign,
  offset: number,
): ComputedPosition {
  const fits = (p: HoverCardPlacement): boolean => {
    if (p === 'top') return trigger.top - panel.height - offset >= 0;
    if (p === 'bottom') {
      return trigger.bottom + panel.height + offset <= viewport.height;
    }
    if (p === 'left') return trigger.left - panel.width - offset >= 0;
    return trigger.right + panel.width + offset <= viewport.width;
  };
  const finalPlacement = fits(placement)
    ? placement
    : fits(opposite(placement))
      ? opposite(placement)
      : placement;

  let top = 0;
  let left = 0;
  if (finalPlacement === 'top' || finalPlacement === 'bottom') {
    top = finalPlacement === 'top'
      ? trigger.top - panel.height - offset
      : trigger.bottom + offset;
    if (align === 'start') left = trigger.left;
    else if (align === 'end') left = trigger.right - panel.width;
    else left = trigger.left + trigger.width / 2 - panel.width / 2;
  } else {
    left = finalPlacement === 'left'
      ? trigger.left - panel.width - offset
      : trigger.right + offset;
    if (align === 'start') top = trigger.top;
    else if (align === 'end') top = trigger.bottom - panel.height;
    else top = trigger.top + trigger.height / 2 - panel.height / 2;
  }
  return { top, left, placement: finalPlacement };
}

export function HoverCard({
  trigger,
  content,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom',
  align = 'center',
  offset = 8,
  openDelay = 300,
  closeDelay = 200,
  'data-testid': testId,
  className,
}: HoverCardProps) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(defaultOpen);
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen;

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  // (v1.11.403, TODO 11.385) Two timers gate the open/close
  // delay. `openTimer` cancels if the user leaves before
  // the delay elapses; `closeTimer` cancels if the user
  // re-enters the trigger or the card before the delay
  // elapses.
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [position, setPosition] = useState<ComputedPosition>({
    top: 0,
    left: 0,
    placement,
  });

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) return;
    if (openDelay <= 0) {
      setOpen(true);
      return;
    }
    if (openTimerRef.current !== null) return;
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      setOpen(true);
    }, openDelay);
  }, [open, openDelay, setOpen]);

  const scheduleClose = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (!open) return;
    if (closeDelay <= 0) {
      setOpen(false);
      return;
    }
    if (closeTimerRef.current !== null) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, closeDelay);
  }, [open, closeDelay, setOpen]);

  // Clean up timers on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  // Position recompute on open + viewport / scroll changes.
  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    const p = panelRef.current;
    if (!t || !p) return;
    const recompute = (): void => {
      const tr = t.getBoundingClientRect();
      const pr = { width: p.offsetWidth, height: p.offsetHeight };
      const vp = { width: window.innerWidth, height: window.innerHeight };
      setPosition(
        computeHoverCardPosition(tr, pr, vp, placement, align, offset),
      );
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, placement, align, offset, content]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // (v1.11.403, TODO 11.385) Trigger handlers. The trigger
  // gets `aria-describedby` pointing at the panel so
  // assistive tech can pull the card content into the
  // trigger's accessible description. Note: we do NOT
  // wire `onFocus` -- HoverCard is hover-only by design.
  const onTriggerEnter = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      const props = (trigger.props ?? {}) as {
        onMouseEnter?: (e: ReactMouseEvent<HTMLElement>) => void;
      };
      props.onMouseEnter?.(e);
      scheduleOpen();
    },
    [trigger, scheduleOpen],
  );

  const onTriggerLeave = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      const props = (trigger.props ?? {}) as {
        onMouseLeave?: (e: ReactMouseEvent<HTMLElement>) => void;
      };
      props.onMouseLeave?.(e);
      scheduleClose();
    },
    [trigger, scheduleClose],
  );

  const onTriggerTouchStart = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      // Touch tap-and-hold opens (no concept of hover on touch).
      const props = (trigger.props ?? {}) as {
        onTouchStart?: (e: ReactMouseEvent<HTMLElement>) => void;
      };
      props.onTouchStart?.(e);
      scheduleOpen();
    },
    [trigger, scheduleOpen],
  );

  const onTriggerKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const props = (trigger.props ?? {}) as {
        onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
      };
      props.onKeyDown?.(e);
      // Escape on the trigger closes a stale-open card.
      if (e.key === 'Escape' && open) setOpen(false);
    },
    [trigger, open, setOpen],
  );

  // Suppress accidental focus-driven opens by NOT wiring
  // onFocus. Instead, we expose a noop here so the trigger
  // can still pass through caller-supplied onFocus.
  const onTriggerFocus = useCallback(
    (e: ReactFocusEvent<HTMLElement>) => {
      const props = (trigger.props ?? {}) as {
        onFocus?: (e: ReactFocusEvent<HTMLElement>) => void;
      };
      props.onFocus?.(e);
    },
    [trigger],
  );

  const triggerProps = (trigger.props ?? {}) as { ref?: unknown };
  const cloned = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          const r = triggerProps.ref;
          if (typeof r === 'function') (r as (n: HTMLElement | null) => void)(node);
          else if (r && typeof r === 'object') {
            (r as { current: HTMLElement | null }).current = node;
          }
        },
        onMouseEnter: onTriggerEnter,
        onMouseLeave: onTriggerLeave,
        onTouchStart: onTriggerTouchStart,
        onKeyDown: onTriggerKeyDown,
        onFocus: onTriggerFocus,
        'aria-describedby': open ? panelId : undefined,
        'data-hover-card-trigger': 'true',
        'data-hover-card-open': open ? 'true' : 'false',
      } as Record<string, unknown>)
    : trigger;

  const portalEl =
    typeof document !== 'undefined'
      ? getPortalRoot('hover-card-root') ?? document.body
      : null;

  // (v1.11.403, TODO 11.385) When the user moves the cursor
  // onto the panel, cancel any pending close. When they
  // leave the panel, schedule a close. The panel itself is
  // the "hover handoff" surface that keeps the card alive
  // while the user scans its contents.
  const onPanelEnter = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const onPanelLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  const panel =
    open && portalEl
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            data-section="hover-card-panel"
            data-hover-card-placement={position.placement}
            {...(testId ? { 'data-testid': testId } : {})}
            onMouseEnter={onPanelEnter}
            onMouseLeave={onPanelLeave}
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              zIndex: 50,
            }}
            className={cn(
              'min-w-[12rem] max-w-[20rem] rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md',
              className,
            )}
          >
            {content}
          </div>,
          portalEl,
        )
      : null;

  return (
    <>
      {cloned}
      {panel}
    </>
  );
}

HoverCard.displayName = 'HoverCard';
