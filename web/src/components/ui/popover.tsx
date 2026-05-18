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
import type { MouseEvent, ReactElement, ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { getPortalRoot } from '../../lib/portal-root';
import { useFocusTrap } from '../../hooks/use-focus-trap';
import { motionClass } from '../../lib/motion';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right';
export type PopoverAlign = 'start' | 'center' | 'end';

export interface PopoverProps {
  trigger: ReactElement;
  content: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopoverPlacement;
  align?: PopoverAlign;
  offset?: number;
  closeOnClickOutside?: boolean;
  closeOnEsc?: boolean;
  // (v1.11.379, TODO 11.361) Render a small
  // arrow chevron pointing from the popover body
  // toward the trigger. Default false to keep
  // existing visuals byte-identical; opt in per
  // adopter (canonical pattern matches Tooltip's
  // arrow contract).
  arrow?: boolean;
  className?: string;
  // (v1.11.379, TODO 11.361) Test hook on the
  // outer panel.
  'data-testid'?: string;
}

function opposite(p: PopoverPlacement): PopoverPlacement {
  if (p === 'top') return 'bottom';
  if (p === 'bottom') return 'top';
  if (p === 'left') return 'right';
  return 'left';
}

interface ComputedPosition {
  top: number;
  left: number;
  placement: PopoverPlacement;
}

function computePosition(
  trigger: DOMRect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: PopoverPlacement,
  align: PopoverAlign,
  offset: number,
): ComputedPosition {
  const fits = (p: PopoverPlacement): boolean => {
    if (p === 'top') return trigger.top - offset - panel.height >= 0;
    if (p === 'bottom') return trigger.bottom + offset + panel.height <= viewport.height;
    if (p === 'left') return trigger.left - offset - panel.width >= 0;
    return trigger.right + offset + panel.width <= viewport.width;
  };
  const finalPlacement = fits(placement) ? placement : (fits(opposite(placement)) ? opposite(placement) : placement);

  let top = 0;
  let left = 0;
  if (finalPlacement === 'top' || finalPlacement === 'bottom') {
    top = finalPlacement === 'top'
      ? trigger.top - offset - panel.height
      : trigger.bottom + offset;
    if (align === 'start') left = trigger.left;
    else if (align === 'end') left = trigger.right - panel.width;
    else left = trigger.left + (trigger.width - panel.width) / 2;
  } else {
    left = finalPlacement === 'left'
      ? trigger.left - offset - panel.width
      : trigger.right + offset;
    if (align === 'start') top = trigger.top;
    else if (align === 'end') top = trigger.bottom - panel.height;
    else top = trigger.top + (trigger.height - panel.height) / 2;
  }
  return { top, left, placement: finalPlacement };
}

export function Popover({
  trigger,
  content,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom',
  align = 'center',
  offset = 6,
  closeOnClickOutside = true,
  closeOnEsc = true,
  arrow = false,
  className,
  'data-testid': testId,
}: PopoverProps) {
  const reducedMotion = useReducedMotion();
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(defaultOpen);
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen;

  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const [position, setPosition] = useState<ComputedPosition>({
    top: 0,
    left: 0,
    placement,
  });

  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    if (onOpenChange) onOpenChange(next);
  }, [isControlled, onOpenChange]);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current;
    const p = panelRef.current;
    if (!t || !p) return;
    const tr = t.getBoundingClientRect();
    const pr = { width: p.offsetWidth, height: p.offsetHeight };
    const vp = { width: window.innerWidth, height: window.innerHeight };
    setPosition(computePosition(tr, pr, vp, placement, align, offset));
  }, [open, placement, align, offset, content]);

  useEffect(() => {
    if (!open || !closeOnClickOutside) return;
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open, closeOnClickOutside, setOpen]);

  const handleEscape = useCallback(() => {
    if (closeOnEsc) setOpen(false);
  }, [closeOnEsc, setOpen]);

  useFocusTrap(panelRef, {
    active: open,
    onEscape: closeOnEsc ? handleEscape : undefined,
    restoreFocusOnUnmount: false,
  });

  // Return focus to the trigger when the panel closes (popover-specific:
  // hook restores to previouslyFocused, which is not always the trigger in
  // controlled mode).
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      const trig = triggerRef.current;
      if (trig && typeof trig.focus === 'function') trig.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  const triggerProps = trigger.props as {
    onClick?: (e: MouseEvent<HTMLElement>) => void;
    ref?: Ref<HTMLElement>;
  };

  const cloned = isValidElement(trigger)
    ? cloneElement(trigger, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node;
          const r = triggerProps.ref;
          if (typeof r === 'function') r(node);
          else if (r && typeof r === 'object') {
            (r as { current: HTMLElement | null }).current = node;
          }
        },
        onClick: (e: MouseEvent<HTMLElement>) => {
          triggerProps.onClick?.(e);
          toggle();
        },
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': panelId,
      } as Record<string, unknown>)
    : trigger;

  // (v1.11.379, TODO 11.361) Arrow positioning.
  // The arrow is a 6x6 rotated square half-tucked
  // behind the popover so the visible edge reads
  // as a triangle pointing toward the trigger.
  // Anchored to the inverse edge of the resolved
  // placement so the arrow always sits closest to
  // the trigger surface.
  const arrowClass = (() => {
    switch (position.placement) {
      case 'top':
        return 'bottom-[-3px] left-1/2 -translate-x-1/2';
      case 'bottom':
        return 'top-[-3px] left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-[-3px] top-1/2 -translate-y-1/2';
      case 'right':
      default:
        return 'left-[-3px] top-1/2 -translate-y-1/2';
    }
  })();

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      tabIndex={-1}
      data-popover-placement={position.placement}
      data-popover-arrow={arrow ? 'true' : 'false'}
      {...(testId ? { 'data-testid': testId } : {})}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 90,
      }}
      className={cn(
        'relative min-w-[8rem] rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-md outline-none',
        motionClass('fadeIn', reducedMotion),
        className,
      )}
    >
      {content}
      {arrow ? (
        <span
          aria-hidden="true"
          data-popover-arrow="true"
          className={cn(
            'absolute h-1.5 w-1.5 rotate-45 border border-border bg-popover',
            arrowClass,
          )}
        />
      ) : null}
    </div>,
    getPortalRoot('popover-root') ?? document.body,
  ) : null;

  return (
    <>
      {cloned}
      {panel}
    </>
  );
}

Popover.displayName = 'Popover';
