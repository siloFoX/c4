import { forwardRef, useId, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes, ReactNode, Ref } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

const TEXTAREA_BASE =
  'flex min-h-[44px] sm:min-h-0 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const AUTO_RESIZE_MAX_HEIGHT = '60vh';

// (v1.11.309, TODO 11.291) Variant token. `default` keeps the
// existing sans-serif text byte-for-byte. `mono` swaps the
// font to the system monospace stack for code-style editing
// (Templates body editor, Snapshot note, diff comments).
export type TextareaVariant = 'default' | 'mono';

const VARIANT_FONT: Record<TextareaVariant, string> = {
  default: '',
  mono: 'font-mono',
};

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  // (v1.11.309, TODO 11.291)
  variant?: TextareaVariant;
  // (v1.11.309, TODO 11.291) When true, render a `<current>/<maxLength>`
  // counter under the textarea. Only emits when `maxLength` is also
  // set (so the denominator is meaningful). Falls back to the current
  // length only if `maxLength` is unset AND `showCharCount` is true.
  showCharCount?: boolean;
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
      variant = 'default',
      showCharCount = false,
      maxLength,
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

    // (v1.11.309, TODO 11.291) Compute the displayed character
    // count from the controlled `value` (preferred) OR the
    // `defaultValue` (uncontrolled-start case) so the slot
    // reads sensibly on first paint.
    const charLength = (() => {
      if (typeof value === 'string') return value.length;
      if (typeof defaultValue === 'string') return defaultValue.length;
      return 0;
    })();
    const charOverflow =
      typeof maxLength === 'number' && charLength > maxLength;

    const hasSlots =
      label != null || hint != null || error != null || showCharCount;

    if (!hasSlots) {
      return (
        <textarea
          ref={mergeRefs(ref, innerRef)}
          id={id}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-describedby={ariaDescribedBy}
          data-section="textarea"
          data-variant={variant}
          className={cn(TEXTAREA_BASE, 'border-input', VARIANT_FONT[variant], className)}
          style={autoResizeStyle}
          {...props}
        />
      );
    }

    const taId = id ?? generatedId;
    const hintId = hint != null ? `${taId}-hint` : undefined;
    const errorId = error != null ? `${taId}-error` : undefined;
    const countId = showCharCount ? `${taId}-count` : undefined;
    const describedBy =
      [ariaDescribedBy, hintId, errorId, countId].filter(Boolean).join(' ') ||
      undefined;

    return (
      <div className="space-y-1.5" data-section="textarea-row">
        {label != null ? <Label htmlFor={taId}>{label}</Label> : null}
        <textarea
          ref={mergeRefs(ref, innerRef)}
          id={taId}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          maxLength={maxLength}
          aria-invalid={error != null ? true : undefined}
          aria-describedby={describedBy}
          data-section="textarea"
          data-variant={variant}
          data-error={error != null ? 'true' : 'false'}
          className={cn(
            TEXTAREA_BASE,
            error != null ? 'border-destructive' : 'border-input',
            VARIANT_FONT[variant],
            className,
          )}
          style={autoResizeStyle}
          {...props}
        />
        {hint != null ? (
          <p
            id={hintId}
            data-section="textarea-hint"
            className="text-xs text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p
            id={errorId}
            role="alert"
            data-section="textarea-error"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
        {showCharCount ? (
          <p
            id={countId}
            data-section="textarea-char-count"
            data-overflow={charOverflow ? 'true' : 'false'}
            className={cn(
              'text-right text-[11px]',
              charOverflow ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {typeof maxLength === 'number'
              ? `${charLength}/${maxLength}`
              : `${charLength}`}
          </p>
        ) : null}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
