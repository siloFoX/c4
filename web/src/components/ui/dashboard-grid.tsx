import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type DashboardGridGap = 'sm' | 'md' | 'lg';
export type SpanValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 'full';

export interface DashboardGridProps extends HTMLAttributes<HTMLDivElement> {
  gap?: DashboardGridGap;
  children?: ReactNode;
}

function gapClass(gap: DashboardGridGap): string {
  switch (gap) {
    case 'sm':
      return 'gap-2';
    case 'lg':
      return 'gap-6';
    case 'md':
    default:
      return 'gap-4';
  }
}

function baseSpan(span: SpanValue): string {
  switch (span) {
    case 1: return 'col-span-1';
    case 2: return 'col-span-2';
    case 3: return 'col-span-3';
    case 4: return 'col-span-4';
    case 5: return 'col-span-5';
    case 6: return 'col-span-6';
    case 7: return 'col-span-7';
    case 8: return 'col-span-8';
    case 9: return 'col-span-9';
    case 10: return 'col-span-10';
    case 11: return 'col-span-11';
    case 12: return 'col-span-12';
    case 'full':
    default:
      return 'col-span-full';
  }
}

function smSpanClass(span: SpanValue): string {
  switch (span) {
    case 1: return 'sm:col-span-1';
    case 2: return 'sm:col-span-2';
    case 3: return 'sm:col-span-3';
    case 4: return 'sm:col-span-4';
    case 5: return 'sm:col-span-5';
    case 6: return 'sm:col-span-6';
    case 7: return 'sm:col-span-7';
    case 8: return 'sm:col-span-8';
    case 9: return 'sm:col-span-9';
    case 10: return 'sm:col-span-10';
    case 11: return 'sm:col-span-11';
    case 12: return 'sm:col-span-12';
    case 'full':
    default:
      return 'sm:col-span-full';
  }
}

function mdSpanClass(span: SpanValue): string {
  switch (span) {
    case 1: return 'md:col-span-1';
    case 2: return 'md:col-span-2';
    case 3: return 'md:col-span-3';
    case 4: return 'md:col-span-4';
    case 5: return 'md:col-span-5';
    case 6: return 'md:col-span-6';
    case 7: return 'md:col-span-7';
    case 8: return 'md:col-span-8';
    case 9: return 'md:col-span-9';
    case 10: return 'md:col-span-10';
    case 11: return 'md:col-span-11';
    case 12: return 'md:col-span-12';
    case 'full':
    default:
      return 'md:col-span-full';
  }
}

function lgSpanClass(span: SpanValue): string {
  switch (span) {
    case 1: return 'lg:col-span-1';
    case 2: return 'lg:col-span-2';
    case 3: return 'lg:col-span-3';
    case 4: return 'lg:col-span-4';
    case 5: return 'lg:col-span-5';
    case 6: return 'lg:col-span-6';
    case 7: return 'lg:col-span-7';
    case 8: return 'lg:col-span-8';
    case 9: return 'lg:col-span-9';
    case 10: return 'lg:col-span-10';
    case 11: return 'lg:col-span-11';
    case 12: return 'lg:col-span-12';
    case 'full':
    default:
      return 'lg:col-span-full';
  }
}

export interface DashboardGridItemProps extends HTMLAttributes<HTMLDivElement> {
  span?: SpanValue;
  smSpan?: SpanValue;
  mdSpan?: SpanValue;
  lgSpan?: SpanValue;
  children?: ReactNode;
}

export const DashboardGridItem = forwardRef<HTMLDivElement, DashboardGridItemProps>(
  ({ span = 'full', smSpan, mdSpan, lgSpan, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        baseSpan(span),
        smSpan !== undefined && smSpanClass(smSpan),
        mdSpan !== undefined && mdSpanClass(mdSpan),
        lgSpan !== undefined && lgSpanClass(lgSpan),
        className,
      )}
      {...rest}
    />
  ),
);
DashboardGridItem.displayName = 'DashboardGridItem';

type DashboardGridComponent = React.ForwardRefExoticComponent<
  DashboardGridProps & React.RefAttributes<HTMLDivElement>
> & { Item: typeof DashboardGridItem };

const DashboardGridBase = forwardRef<HTMLDivElement, DashboardGridProps>(
  ({ gap = 'md', className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('grid grid-cols-12', gapClass(gap), className)}
      {...rest}
    />
  ),
);
DashboardGridBase.displayName = 'DashboardGrid';

export const DashboardGrid = DashboardGridBase as DashboardGridComponent;
DashboardGrid.Item = DashboardGridItem;
