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
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
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
  className,
}: PopoverProps) {
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
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, setOpen]);

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

  // Focus trap + initial focus + return focus.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = getFocusables(panel);
    const first = focusables[0];
    if (first) first.focus();
    else panel.focus();
    return () => {
      const trig = triggerRef.current;
      if (trig && typeof trig.focus === 'function') trig.focus();
      else if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusables(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const panel = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      tabIndex={-1}
      data-popover-placement={position.placement}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 90,
      }}
      className={cn(
        'min-w-[8rem] rounded-md border border-border bg-popover p-2 text-sm text-popover-foreground shadow-md outline-none',
        className,
      )}
    >
      {content}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {cloned}
      {panel}
    </>
  );
}

Popover.displayName = 'Popover';
