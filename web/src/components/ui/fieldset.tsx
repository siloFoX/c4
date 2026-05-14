import { forwardRef, useCallback, useId, useState } from 'react';
import type { FieldsetHTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FieldsetProps
  extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> {
  legend?: ReactNode;
  description?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

// Semantic <fieldset>/<legend> wrapper for related form controls.
// When collapsible, the legend renders as a button that toggles
// children via the `hidden` attribute so form state is preserved.
export const Fieldset = forwardRef<HTMLFieldSetElement, FieldsetProps>(
  (
    {
      legend,
      description,
      collapsible = false,
      defaultOpen = true,
      open,
      onOpenChange,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const descriptionId = useId();
    const contentId = useId();

    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const isControlled = open !== undefined;
    const isOpen = collapsible ? (isControlled ? open! : uncontrolledOpen) : true;

    const toggle = useCallback(() => {
      const next = !isOpen;
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    }, [isOpen, isControlled, onOpenChange]);

    const legendNode = legend != null ? (
      collapsible ? (
        <legend className="mb-2 p-0">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={contentId}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none motion-reduce:transform-none',
                isOpen && 'rotate-90 motion-reduce:rotate-0',
              )}
              aria-hidden="true"
            />
            <span>{legend}</span>
          </button>
        </legend>
      ) : (
        <legend className="mb-2 px-0 text-sm font-medium text-foreground">
          {legend}
        </legend>
      )
    ) : null;

    return (
      <fieldset
        ref={ref}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'min-w-0 border-0 p-0',
          disabled && 'opacity-60',
          className,
        )}
        {...rest}
      >
        {legendNode}
        {description != null ? (
          <p id={descriptionId} className="mb-2 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div
          id={contentId}
          hidden={collapsible && !isOpen}
          aria-hidden={collapsible && !isOpen ? true : undefined}
          className="space-y-3"
        >
          {children}
        </div>
      </fieldset>
    );
  },
);
Fieldset.displayName = 'Fieldset';
