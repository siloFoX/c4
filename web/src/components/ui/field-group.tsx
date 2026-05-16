import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.281, TODO 11.263) FieldGroup -- higher-level wrapper
// that groups related FormField (or raw control) children under
// a shared legend + description. Built so editor surfaces
// (Settings panels, Templates / Profiles editors) can lay out
// "Connection settings" / "Output format" / "Behaviour" blocks
// without re-inventing the spacing + heading + helper-text
// rhythm every time.
//
// Differences from <Fieldset>:
//   - Fieldset is the raw HTML wrapper + legend. FieldGroup
//     adds an opinionated layout: stack (single column with
//     consistent vertical gaps), or grid (2/3 columns for
//     dense settings forms).
//   - FieldGroup is "presentational" -- it does not own any
//     state, validate anything, or thread aria-* into its
//     children. It just slots them into a consistent shell so
//     adoption is one wrapper change rather than a hand-rolled
//     `<fieldset>` per call site.
//
// FieldGroup composes with FormField (one FormField per row /
// cell) but accepts any ReactNode children -- a raw control
// with its own label, a sub-FieldGroup for nested sections, or
// even a help banner. The shell stays the same.

export type FieldGroupLayout = 'stack' | 'grid';
export type FieldGroupColumns = 1 | 2 | 3;

export interface FieldGroupProps
  extends Omit<HTMLAttributes<HTMLFieldSetElement>, 'children' | 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  // 'stack' = vertical list (default); 'grid' = N-column dense form.
  layout?: FieldGroupLayout;
  // Only honoured when layout === 'grid'. Defaults to 2.
  columns?: FieldGroupColumns;
  // Disabled flag propagates to the native fieldset so all
  // form controls inside become disabled automatically.
  disabled?: boolean;
  // (v1.11.281) Optional right-aligned actions in the heading row
  // (e.g. an "Add row" or "Reset" button beside the title).
  // Rendered only when `title` is non-empty so a title-less
  // group does not show a floating button.
  headingActions?: ReactNode;
  className?: string;
  children: ReactNode;
}

const COLUMN_CLASS: Record<FieldGroupColumns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
};

export const FieldGroup = forwardRef<HTMLFieldSetElement, FieldGroupProps>(
  (
    {
      title,
      description,
      layout = 'stack',
      columns = 2,
      disabled = false,
      headingActions,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const bodyCls =
      layout === 'grid'
        ? cn('grid gap-3', COLUMN_CLASS[columns])
        : 'flex flex-col gap-3';

    return (
      <fieldset
        ref={ref}
        disabled={disabled || undefined}
        data-section="field-group"
        data-layout={layout}
        data-columns={layout === 'grid' ? columns : undefined}
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-4',
          disabled && 'opacity-60',
          className,
        )}
        {...rest}
      >
        {title || description || headingActions ? (
          <div
            className="flex flex-wrap items-start justify-between gap-2"
            data-section="field-group-header"
          >
            <div className="min-w-0 flex-1">
              {title ? (
                <legend
                  className="px-0 text-sm font-semibold text-foreground"
                  data-section="field-group-title"
                >
                  {title}
                </legend>
              ) : null}
              {description ? (
                <p
                  className="mt-0.5 text-xs text-muted-foreground"
                  data-section="field-group-description"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {title && headingActions ? (
              <div
                className="shrink-0"
                data-section="field-group-actions"
              >
                {headingActions}
              </div>
            ) : null}
          </div>
        ) : null}
        <div data-section="field-group-body" className={bodyCls}>
          {children}
        </div>
      </fieldset>
    );
  },
);
FieldGroup.displayName = 'FieldGroup';
