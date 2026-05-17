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
  // (v1.11.303, TODO 11.285) Soft warning state -- styled
  // less severely than `error` (warning palette instead of
  // destructive) AND does NOT flip `aria-invalid`. Use this
  // for "you can submit but here is a heads-up" messaging
  // (e.g., "Using the default value will overwrite previous
  // saves"). When BOTH `error` and `warning` are set,
  // `error` wins -- the more severe state surfaces.
  warning?: string;
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
  warning,
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
  const warningId = `${resolvedControlId}-warning`;
  // (v1.11.303, TODO 11.285) State precedence: error > warning >
  // ok. Used for the data-state attribute + the aria-describedby
  // message id selection.
  const state: 'ok' | 'warning' | 'error' = error
    ? 'error'
    : warning
      ? 'warning'
      : 'ok';

  const messageIds = [
    childExistingDescribedBy,
    state === 'error' ? errorId : undefined,
    state === 'warning' ? warningId : undefined,
    state === 'ok' && helperText ? helperId : undefined,
  ].filter(Boolean);
  const ariaDescribedBy = messageIds.length > 0 ? messageIds.join(' ') : undefined;

  // Warning is intentionally NOT aria-invalid -- the field is
  // still submittable. Only `error` flips invalid.
  const ariaInvalid = state === 'error' ? true : childExistingInvalid;

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
      data-section="form-field"
      data-layout={layout}
      data-state={state}
    >
      <label
        htmlFor={resolvedControlId}
        data-section="form-field-label"
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
            data-section="form-field-required"
            className="ml-0.5 text-destructive"
          >
            *
          </span>
        ) : null}
      </label>
      <div className={cn(horizontal && 'flex-1')}>
        {child}
        {state === 'error' ? (
          <p
            id={errorId}
            role="alert"
            data-section="form-field-error"
            className="mt-1 text-sm text-destructive"
          >
            {error}
          </p>
        ) : state === 'warning' ? (
          <p
            id={warningId}
            // (v1.11.303) Warning uses role=status so SR users
            // hear the message but submit-time validation is
            // unaffected (no role=alert).
            role="status"
            data-section="form-field-warning"
            className="mt-1 text-sm text-warning"
          >
            {warning}
          </p>
        ) : helperText ? (
          <p
            id={helperId}
            data-section="form-field-helper"
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
