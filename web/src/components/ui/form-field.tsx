import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement } from 'react';
import { cn } from '../../lib/cn';

export type FormFieldLayout = 'vertical' | 'horizontal';

export interface FormFieldProps {
  id?: string;
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  children: ReactElement;
  className?: string;
  layout?: FormFieldLayout;
}

type ChildProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
};

export function FormField({
  id: providedId,
  label,
  required = false,
  helperText,
  error,
  children,
  className,
  layout = 'vertical',
}: FormFieldProps) {
  const autoId = useId();
  const fieldId = providedId ?? autoId;

  const childExistingId = isValidElement(children)
    ? (children.props as ChildProps).id
    : undefined;
  const childExistingDescribedBy = isValidElement(children)
    ? (children.props as ChildProps)['aria-describedby']
    : undefined;
  const childExistingInvalid = isValidElement(children)
    ? (children.props as ChildProps)['aria-invalid']
    : undefined;

  const resolvedControlId = childExistingId ?? fieldId;
  const helperId = `${resolvedControlId}-helper`;
  const errorId = `${resolvedControlId}-error`;

  const messageIds = [
    childExistingDescribedBy,
    error ? errorId : undefined,
    !error && helperText ? helperId : undefined,
  ].filter(Boolean);
  const ariaDescribedBy = messageIds.length > 0 ? messageIds.join(' ') : undefined;

  const ariaInvalid = error ? true : childExistingInvalid;

  // Only inject id / aria-invalid into the child when it is a form control
  // (or a custom component that opts in by accepting those props). For
  // generic wrappers like `<div>`, inject only aria-describedby and assume
  // the real control inside already owns the id.
  const FORM_TAGS = new Set(['input', 'select', 'textarea']);
  const childTag =
    isValidElement(children) && typeof children.type === 'string'
      ? children.type
      : null;
  const isWrapperChild = childTag != null && !FORM_TAGS.has(childTag);

  const cloneProps: ChildProps = {};
  if (ariaDescribedBy !== undefined) {
    cloneProps['aria-describedby'] = ariaDescribedBy;
  }
  if (!isWrapperChild) {
    cloneProps.id = resolvedControlId;
    if (ariaInvalid !== undefined) {
      cloneProps['aria-invalid'] = ariaInvalid;
    }
  }
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<ChildProps>, cloneProps)
    : children;

  const horizontal = layout === 'horizontal';

  return (
    <div
      className={cn(
        horizontal
          ? 'flex flex-row items-start gap-3'
          : 'flex flex-col gap-1.5',
        className,
      )}
      data-layout={layout}
    >
      <label
        htmlFor={resolvedControlId}
        className={cn(
          'text-sm font-medium leading-none text-foreground',
          horizontal && 'w-[30%] shrink-0 pt-2',
        )}
      >
        {label}
        {required ? (
          <span
            aria-hidden="true"
            data-testid="form-field-required"
            className="ml-0.5 text-destructive"
          >
            *
          </span>
        ) : null}
      </label>
      <div className={cn(horizontal && 'flex-1')}>
        {child}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-sm text-destructive"
          >
            {error}
          </p>
        ) : helperText ? (
          <p
            id={helperId}
            className="mt-1 text-sm text-muted-foreground"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    </div>
  );
}

FormField.displayName = 'FormField';
