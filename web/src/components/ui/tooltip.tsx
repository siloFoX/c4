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
  delayMs?: number;
  children: ReactElement;
  // When set, forces the tooltip to stay open (for testing / onboarding).
  open?: boolean;
  className?: string;
}

// Minimal accessible tooltip. Fires on hover + focus, dismisses on blur
// + mouseleave + Escape. Uses aria-describedby so screen readers announce
// the label. No portal; the tooltip is rendered as a sibling absolutely
// positioned around the trigger, so callers must ensure the wrapper span
// sits inside a relative / non-static ancestor when using left/right.

export function Tooltip({
  label,
  placement = 'top',
  delayMs = 120,
  children,
  open,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState<boolean>(Boolean(open));
  const timer = useRef<number | null>(null);
  const id = useId();

  useEffect(() => {
    if (open !== undefined) setVisible(open);
  }, [open]);

  const show = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, hide]);

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

  const trigger = isValidElement<{
    'aria-describedby'?: string;
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
  }>(children)
    ? cloneElement(children, {
        'aria-describedby': visible ? id : undefined,
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
    <span className="relative inline-flex" data-tooltip-root>
      {trigger}
      <span
        role="tooltip"
        id={id}
        data-visible={visible}
        className={cn(
          'pointer-events-none absolute z-50 whitespace-pre-line rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md transition-opacity',
          pos,
          visible ? 'opacity-100' : 'opacity-0',
          className,
        )}
        style={{ maxWidth: 260 }}
      >
        {label}
      </span>
    </span>
  );
}

Tooltip.displayName = 'Tooltip';
