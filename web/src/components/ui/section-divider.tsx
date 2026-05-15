import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.269, TODO 11.251) SectionDivider -- horizontal rule with
// an optional label / icon. Three label placements:
//   - 'center' (default): line on both sides of the label
//   - 'left': label flush left, line fills the trailing space
//   - 'right': label flush right, line fills the leading space
// Without a `label` (or with `variant="line"`) the primitive
// renders a plain hairline rule -- equivalent to the existing
// `Separator` primitive but with the same data attributes the
// labeled variants expose so downstream call sites can selector
// on the section break regardless of whether a label is present.
//
// Reference: /root/c4/arps-design-system-v1/ "section divider"
// pattern.
//
// Why a separate primitive from the existing `Separator`:
//   - `Separator` is a single visual line (orientation +
//     weight), no label slot. Adding a label there would force
//     every existing caller to opt in via a new prop.
//   - `SectionDivider` is the labeled cousin. Both share the
//     same hairline class so the visual rhythm matches.

export type SectionDividerVariant = 'line' | 'label-left' | 'label-center' | 'label-right';
export type SectionDividerSpacing = 'sm' | 'md' | 'lg';

export interface SectionDividerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  label?: ReactNode;
  icon?: ReactNode;
  variant?: SectionDividerVariant;
  // Vertical breathing room around the divider. Defaults to 'md'
  // (my-3). Use 'sm' for tight separator groups inside dropdowns
  // and 'lg' for top-level section breaks on a long page.
  spacing?: SectionDividerSpacing;
  className?: string;
}

const SPACING_CLASSES: Record<SectionDividerSpacing, string> = {
  sm: 'my-1',
  md: 'my-3',
  lg: 'my-6',
};

export const SectionDivider = forwardRef<HTMLDivElement, SectionDividerProps>(
  function SectionDivider(
    {
      label,
      icon,
      variant,
      spacing = 'md',
      className,
      ...rest
    },
    ref,
  ) {
    // Resolve the variant. Explicit `variant="line"` always wins.
    // If a label or icon is passed and no variant is set, default
    // to `label-center`. Pure-line callers get `'line'` when both
    // label + icon are missing.
    const resolved: SectionDividerVariant =
      variant !== undefined
        ? variant
        : label || icon
          ? 'label-center'
          : 'line';
    const hasContent = resolved !== 'line' && (label !== undefined || icon !== undefined);
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="horizontal"
        data-section="section-divider"
        data-variant={resolved}
        {...rest}
        className={cn(
          'flex w-full items-center gap-2',
          SPACING_CLASSES[spacing],
          className,
        )}
      >
        {/* Leading rule. Hidden on label-left variant (the label
            sits flush against the left edge there). */}
        {resolved !== 'label-left' ? (
          <span
            aria-hidden="true"
            data-section-divider-line="leading"
            className="h-px flex-1 bg-border"
          />
        ) : null}
        {hasContent ? (
          <span
            data-section-divider-content
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {icon ? (
              <span aria-hidden="true" data-section-divider-icon>
                {icon}
              </span>
            ) : null}
            {label !== undefined ? (
              <span data-section-divider-label>{label}</span>
            ) : null}
          </span>
        ) : null}
        {/* Trailing rule. Hidden on label-right variant. */}
        {resolved !== 'label-right' ? (
          <span
            aria-hidden="true"
            data-section-divider-line="trailing"
            className="h-px flex-1 bg-border"
          />
        ) : null}
      </div>
    );
  },
);

SectionDivider.displayName = 'SectionDivider';
