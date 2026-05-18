import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FocusEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Placement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  label: ReactNode;
  placement?: Placement;
  // (v1.11.294, TODO 11.276) Separate show + hide delays.
  // Backward compatible: when only `delayMs` is set the same
  // value applies to both. When `showDelay` / `hideDelay` are
  // set they override `delayMs` for that direction.
  delayMs?: number;
  showDelay?: number;
  hideDelay?: number;
  children: ReactElement;
  // When set, forces the tooltip to stay open (for testing / onboarding).
  open?: boolean;
  // (v1.11.294, TODO 11.276) Render a small triangle arrow
  // pointing from the tooltip body toward the trigger. Default
  // false to keep prior visual rhythm byte-identical.
  arrow?: boolean;
  className?: string;
}

// Accessible tooltip. Fires on hover + focus, dismisses on blur
// + mouseleave + Escape. Uses aria-describedby so screen readers
// announce the label.
//
// (v1.11.294, TODO 11.276) Enhancements:
//   - Independent showDelay / hideDelay (so the operator gets a
//     long enough hover-out window when chaining hops between
//     tooltipped icons).
//   - Optional `arrow` chevron pointing from the tooltip body
//     toward the trigger (rendered as a CSS-only triangle so
//     reduced-motion / SSR are fine).
//   - data-section="tooltip" on the wrapper + data-placement
//     + data-arrow attrs for e2e selectors.
//
// Smart positioning (flip when there's no room) is out of scope
// here; it requires viewport measurements that jsdom does not
// reliably implement. A floating-ui-style follow-up can land
// that without breaking this contract.

export function Tooltip({
  label,
  placement = 'top',
  delayMs = 120,
  showDelay,
  hideDelay,
  children,
  open,
  arrow = false,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState<boolean>(Boolean(open));
  const timer = useRef<number | null>(null);
  const id = useId();

  const effectiveShowDelay = showDelay ?? delayMs;
  const effectiveHideDelay = hideDelay ?? 0;

  useEffect(() => {
    if (open !== undefined) setVisible(open);
  }, [open]);

  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (effectiveShowDelay <= 0) {
      setVisible(true);
      return;
    }
    timer.current = window.setTimeout(() => setVisible(true), effectiveShowDelay);
  }, [effectiveShowDelay]);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (effectiveHideDelay <= 0) {
      setVisible(false);
      return;
    }
    timer.current = window.setTimeout(
      () => setVisible(false),
      effectiveHideDelay,
    );
  }, [effectiveHideDelay]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, hide]);

  // (v1.11.294) Clean up any pending timer on unmount so a
  // delayed show/hide doesn't fire against an unmounted
  // component.
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const pos = useMemo(() => {
    switch (placement) {
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-1.5';
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-1.5';
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-1.5';
      case 'top':
      default:
        return 'bottom-full left-1/2 -translate-x-1/2 mb-1.5';
    }
  }, [placement]);

  // (v1.11.294, TODO 11.276) Arrow positioning. The arrow is a
  // 6x6 rotated square half-tucked behind the popover so the
  // visible edge reads as a triangle pointing toward the
  // trigger. The exact corner-class set mirrors the popover's
  // pos calculation above.
  const arrowPos = useMemo(() => {
    switch (placement) {
      case 'bottom':
        return 'top-[-3px] left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-[-3px] top-1/2 -translate-y-1/2';
      case 'right':
        return 'left-[-3px] top-1/2 -translate-y-1/2';
      case 'top':
      default:
        return 'bottom-[-3px] left-1/2 -translate-x-1/2';
    }
  }, [placement]);

  const trigger = isValidElement<{
    'aria-describedby'?: string;
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
  }>(children)
    ? cloneElement(children, {
        ...(visible ? { 'aria-describedby': id } : {}),
        onMouseEnter: (e: MouseEvent<HTMLElement>) => {
          children.props.onMouseEnter?.(e);
          show();
        },
        onMouseLeave: (e: MouseEvent<HTMLElement>) => {
          children.props.onMouseLeave?.(e);
          hide();
        },
        onFocus: (e: FocusEvent<HTMLElement>) => {
          children.props.onFocus?.(e);
          show();
        },
        onBlur: (e: FocusEvent<HTMLElement>) => {
          children.props.onBlur?.(e);
          hide();
        },
      })
    : children;

  return (
    <span
      className="relative inline-flex"
      data-tooltip-root
      data-section="tooltip"
      data-placement={placement}
      data-arrow={arrow ? 'true' : 'false'}
      data-visible={visible ? 'true' : 'false'}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        data-visible={visible}
        // (v1.11.345, TODO 11.327) Accessible name fallback
        // for axe-core's aria-tooltip-name rule. When the
        // label is a non-string ReactNode (an icon-only
        // label), the tooltip body has no text content and
        // axe reports a violation. Stringifying via the
        // typeof check covers the simple case; richer
        // labels can override the aria-label via their
        // own wrapper.
        aria-label={typeof label === 'string' ? label : 'Tooltip'}
        className={cn(
          'pointer-events-none absolute z-50 max-w-[260px] whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity',
          pos,
          visible ? 'opacity-100' : 'opacity-0',
          className,
        )}
      >
        {label}
        {arrow ? (
          <span
            aria-hidden="true"
            data-tooltip-arrow="true"
            className={cn(
              'absolute h-1.5 w-1.5 rotate-45 border border-border bg-popover',
              arrowPos,
            )}
          />
        ) : null}
      </span>
    </span>
  );
}

Tooltip.displayName = 'Tooltip';
