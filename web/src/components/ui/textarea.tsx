import { forwardRef, useId, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes, ReactNode, Ref } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

const TEXTAREA_CLASSES =
  'flex min-h-[44px] sm:min-h-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const AUTO_RESIZE_MAX_HEIGHT = '60vh';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as { current: T | null }).current = node;
    }
  };
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      label,
      hint,
      error,
      id,
      rows,
      value,
      defaultValue,
      style,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const autoResize = rows == null;

    useLayoutEffect(() => {
      if (!autoResize) return;
      const el = innerRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [autoResize, value, defaultValue]);

    const autoResizeStyle = autoResize
      ? { maxHeight: AUTO_RESIZE_MAX_HEIGHT, overflowY: 'auto' as const, ...style }
      : style;

    const hasSlots = label != null || hint != null || error != null;

    if (!hasSlots) {
      return (
        <textarea
          ref={mergeRefs(ref, innerRef)}
          id={id}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          aria-describedby={ariaDescribedBy}
          className={cn(TEXTAREA_CLASSES, className)}
          style={autoResizeStyle}
          {...props}
        />
      );
    }

    const taId = id ?? generatedId;
    const hintId = hint != null ? `${taId}-hint` : undefined;
    const errorId = error != null ? `${taId}-error` : undefined;
    const describedBy =
      [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label != null ? <Label htmlFor={taId}>{label}</Label> : null}
        <textarea
          ref={mergeRefs(ref, innerRef)}
          id={taId}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          aria-invalid={error != null ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            TEXTAREA_CLASSES,
            error != null && 'border-destructive',
            className,
          )}
          style={autoResizeStyle}
          {...props}
        />
        {hint != null ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
