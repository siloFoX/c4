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

export interface SeparatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  orientation?: SeparatorOrientation;
  weight?: SeparatorWeight;
  label?: ReactNode;
  decorative?: boolean;
}

const WEIGHT_H: Record<SeparatorWeight, string> = {
  thin: 'border-t',
  thick: 'border-t-2',
};

const WEIGHT_V: Record<SeparatorWeight, string> = {
  thin: 'border-l',
  thick: 'border-l-2',
};

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  {
    orientation = 'horizontal',
    weight = 'thin',
    label,
    decorative = true,
    className,
    ...rest
  },
  ref,
) {
  const role = decorative ? 'none' : 'separator';
  const ariaOrientation = decorative ? undefined : orientation;

  if (orientation === 'vertical') {
    return (
      <div
        ref={ref}
        role={role}
        aria-orientation={ariaOrientation}
        className={cn('self-stretch', WEIGHT_V[weight], 'border-border', className)}
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
        className={cn('flex w-full items-center gap-3', className)}
        {...rest}
      >
        <span className={cn('flex-1', WEIGHT_H[weight], 'border-border')} aria-hidden="true" />
        <span data-slot="label" className="shrink-0 text-xs text-muted-foreground">
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
      className={cn('w-full', WEIGHT_H[weight], 'border-border', className)}
      {...rest}
    />
  );
});

Separator.displayName = 'Separator';
