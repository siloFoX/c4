import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Breadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { Button } from './button';
import { cn } from '../../lib/cn';

// (v1.11.267, TODO 11.249) PageHeader -- sticky page-level header
// primitive that composes the canonical 4-piece bar:
//
//   [back button]  Breadcrumbs                                [actions]
//                  Title
//                  Subtitle
//
// All four pieces are optional so a caller can wire just the
// breadcrumb trail (e.g. wrapped under an existing PageFrame title)
// or use it standalone as a full-page header replacement. Defaults
// to `sticky: true` so the header pins to the top of the nearest
// scroll container; pass `sticky={false}` to opt out.
//
// The Back button accepts either a `backHref` (anchor) or `onBack`
// (click handler). When both are passed `onBack` wins so callers
// can keep the anchor for noscript / mid-click semantics while
// overriding the in-page navigation.
//
// (v1.11.423, TODO 11.405) Responsive layout with mobile collapse.
// `collapseActionsOnMobile` (default true) breaks the actions row
// to a separate stacked block at the `sm` breakpoint and below;
// on `md+` actions sit to the right of the title-block as before.
// A new `size: 'sm' | 'md' | 'lg'` variant ramps the title +
// subtitle typography for hero / compact surfaces.
//
// Reference: /root/c4/arps-design-system-v1/ "Page header" pattern.

export type PageHeaderSize = 'sm' | 'md' | 'lg';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  // Back button. Either form (or both) is accepted. Passing
  // neither omits the back glyph entirely.
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  // Sticky positioning (defaults to true). Disable when the
  // header sits inside a non-scroll container or when it's
  // followed by a row of large illustrations that should scroll
  // independently.
  sticky?: boolean;
  // CSS `top` value while sticky. Defaults to `0`. Pass a number
  // (px) or any CSS length string when the parent owns a fixed
  // navbar above (e.g. `topOffset={48}` for the global 48-px
  // AppHeader).
  topOffset?: number | string;
  // Z-index while sticky. Defaults to 5 so a slide-in Drawer
  // (z-100) and any toast portal (z-50) still float above.
  zIndex?: number;
  // When true (default), the actions row collapses to a separate
  // stacked block at the `sm` breakpoint and below. Set to false
  // to keep the actions in the right-side flex container at all
  // breakpoints (e.g. when actions are guaranteed compact).
  collapseActionsOnMobile?: boolean;
  // Typography ramp. `md` (default) keeps the legacy text-lg /
  // md:text-xl title. `sm` is compact (text-base / md:text-lg);
  // `lg` is hero-sized (text-xl / md:text-2xl).
  size?: PageHeaderSize;
}

function formatTop(top: number | string): string {
  return typeof top === 'number' ? `${top}px` : top;
}

const TITLE_SIZE_CLASS: Record<PageHeaderSize, string> = {
  sm: 'text-base font-semibold text-foreground md:text-lg',
  md: 'text-lg font-semibold text-foreground md:text-xl',
  lg: 'text-xl font-semibold text-foreground md:text-2xl',
};

const SUBTITLE_SIZE_CLASS: Record<PageHeaderSize, string> = {
  sm: 'mt-0.5 text-[11px] text-muted-foreground',
  md: 'mt-0.5 text-xs text-muted-foreground',
  lg: 'mt-1 text-sm text-muted-foreground',
};

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(
  (
    {
      title,
      subtitle,
      breadcrumbs,
      actions,
      backHref,
      onBack,
      backLabel = 'Back',
      sticky = true,
      topOffset = 0,
      zIndex = 5,
      collapseActionsOnMobile = true,
      size = 'md',
      className,
      style,
      ...rest
    },
    ref,
  ) => {
    const showBack = onBack !== undefined || backHref !== undefined;
    const showBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
    return (
      <header
        ref={ref}
        data-section="page-header"
        data-size={size}
        data-collapse-actions={collapseActionsOnMobile ? 'true' : 'false'}
        {...rest}
        className={cn(
          'border-b border-border bg-card px-4 py-3 md:px-6 md:py-4',
          sticky && 'sticky',
          className,
        )}
        style={{
          ...(sticky
            ? { top: formatTop(topOffset), zIndex }
            : {}),
          ...(style ?? {}),
        }}
      >
        <div
          className={cn(
            'flex items-start gap-3',
            collapseActionsOnMobile && actions
              ? 'flex-col md:flex-row md:items-start'
              : '',
          )}
        >
          <div
            data-section="page-header-lead"
            className={cn(
              'flex min-w-0 flex-1 items-start gap-3',
              collapseActionsOnMobile && actions ? 'w-full' : '',
            )}
          >
            {showBack ? (
              onBack ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  aria-label={backLabel}
                  data-testid="page-header-back"
                  className="shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="sr-only">{backLabel}</span>
                </Button>
              ) : (
                <a
                  href={backHref}
                  aria-label={backLabel}
                  data-testid="page-header-back"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="sr-only">{backLabel}</span>
                </a>
              )
            ) : null}
            <div
              data-section="page-header-text"
              className="min-w-0 flex-1"
            >
              {showBreadcrumbs ? (
                <Breadcrumbs
                  items={breadcrumbs}
                  className="mb-1"
                  data-testid="page-header-breadcrumbs"
                />
              ) : null}
              {title ? (
                <h1
                  data-section="page-header-title"
                  className={TITLE_SIZE_CLASS[size]}
                >
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p
                  data-section="page-header-subtitle"
                  className={SUBTITLE_SIZE_CLASS[size]}
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          {actions ? (
            <div
              data-section="page-header-actions"
              data-testid="page-header-actions"
              className={cn(
                'flex flex-wrap items-center gap-2',
                collapseActionsOnMobile
                  ? 'mt-2 w-full md:mt-0 md:w-auto md:shrink-0 md:justify-end'
                  : 'shrink-0',
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </header>
    );
  },
);

PageHeader.displayName = 'PageHeader';
