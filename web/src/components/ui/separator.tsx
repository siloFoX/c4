import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.165) Separator primitive. A single divider element so the app
// stops sprinkling ad-hoc <hr> tags or container-mounted border-t /
// border-b utilities for what is conceptually a section break.
//
// - orientation 'horizontal' renders a full-width line; 'vertical'
//   renders a self-stretching vertical rule (parent must be flex /
//   grid-row to give it height).
// - weight 'thin' = 1px, 'thick' = 2px.
// - label (horizontal only) centers a small node on top of the line
//   using a flex row with two flex-1 line segments on either side.
// - decorative=true (default) emits role=none so AT skip the divider;
//   decorative=false emits role=separator + aria-orientation for
//   semantic section breaks.

export type SeparatorOrientation = 'horizontal' | 'vertical';
export type SeparatorWeight = 'thin' | 'thick';
// (v1.11.399, TODO 11.381) Spacing scale around the rule.
// `none` (default) keeps the legacy 11.165 layout byte-for-
// byte (no margin); `sm` / `md` / `lg` add cross-axis margin
// so callers can skip wrapping the separator in a `<div
// className="my-X">`.
//
//   - horizontal: applies `my-N` (top/bottom margin)
//   - vertical: applies `mx-N` (left/right margin)
//
// The label variant inherits the same `my-N` because the
// outer container is the one that carries the rule edges.
export type SeparatorSpacing = 'none' | 'sm' | 'md' | 'lg';

export interface SeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  orientation?: SeparatorOrientation;
  weight?: SeparatorWeight;
  label?: ReactNode;
  decorative?: boolean;
  // (v1.11.399, TODO 11.381) Cross-axis margin scale.
  // Default `none` keeps legacy byte-identical render.
  spacing?: SeparatorSpacing;
}

const WEIGHT_H: Record<SeparatorWeight, string> = {
  thin: 'border-t',
  thick: 'border-t-2',
};

const WEIGHT_V: Record<SeparatorWeight, string> = {
  thin: 'border-l',
  thick: 'border-l-2',
};

const SPACING_H: Record<SeparatorSpacing, string> = {
  none: '',
  sm: 'my-1',
  md: 'my-2',
  lg: 'my-4',
};

const SPACING_V: Record<SeparatorSpacing, string> = {
  none: '',
  sm: 'mx-1',
  md: 'mx-2',
  lg: 'mx-4',
};

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  {
    orientation = 'horizontal',
    weight = 'thin',
    label,
    decorative = true,
    spacing = 'none',
    className,
    ...rest
  },
  ref,
) {
  const role = decorative ? 'none' : 'separator';
  const ariaOrientation = decorative ? undefined : orientation;
  // (v1.11.399, TODO 11.381) data-section root attr +
  // spacing data hook so downstream tests + CSS can branch
  // without parsing class lists.
  const sharedAttrs = {
    'data-section': 'separator',
    'data-orientation': orientation,
    'data-weight': weight,
    'data-spacing': spacing,
  } as const;

  if (orientation === 'vertical') {
    return (
      <div
        ref={ref}
        role={role}
        aria-orientation={ariaOrientation}
        {...sharedAttrs}
        className={cn(
          'self-stretch',
          WEIGHT_V[weight],
          SPACING_V[spacing],
          'border-border',
          className,
        )}
        {...rest}
      />
    );
  }

  if (label !== undefined && label !== null) {
    return (
      <div
        ref={ref}
        role={role}
        aria-orientation={ariaOrientation}
        {...sharedAttrs}
        data-section-with-label="true"
        className={cn(
          'flex w-full items-center gap-3',
          SPACING_H[spacing],
          className,
        )}
        {...rest}
      >
        <span className={cn('flex-1', WEIGHT_H[weight], 'border-border')} aria-hidden="true" />
        <span
          data-slot="label"
          data-section="separator-label"
          className="shrink-0 text-xs text-muted-foreground"
        >
          {label}
        </span>
        <span className={cn('flex-1', WEIGHT_H[weight], 'border-border')} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role={role}
      aria-orientation={ariaOrientation}
      {...sharedAttrs}
      className={cn(
        'w-full',
        WEIGHT_H[weight],
        SPACING_H[spacing],
        'border-border',
        className,
      )}
      {...rest}
    />
  );
});

Separator.displayName = 'Separator';
