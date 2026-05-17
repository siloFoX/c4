import { AlertTriangle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.314, TODO 11.296) Reportable error-state surface.
// Adds three affordances on top of the existing
// title+description+retry layout:
//   - `icon` slot -- replaces the default AlertTriangle glyph
//     with a caller-supplied illustration (e.g., an
//     ErrorIllustration SVG from the components/illustrations
//     module).
//   - `reportLink` -- secondary "Report this" link rendered
//     below the retry button. Mirrors the EmptyState
//     `helpLink` styling so the visual hierarchy is
//     consistent across both state surfaces.
//   - `showDetails` -- when true AND `error` is an Error
//     instance with a `.stack` field, the surface mounts a
//     `<details>` disclosure with the formatted stack trace.
//     The legacy single-line `error.message` rendering is
//     preserved for the non-disclosure default.

export interface ErrorStateReportLink {
  label: string;
  href: string;
}

export interface ErrorStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  description?: string | ReactNode;
  error?: Error | string;
  onRetry?: () => void;
  retryLabel?: string;
  // (v1.11.314, TODO 11.296)
  icon?: ReactNode;
  reportLink?: ErrorStateReportLink;
  // (v1.11.314, TODO 11.296) Render the error stack inside a
  // collapsible <details> element instead of the inline
  // message text. Falls back to inline rendering when the
  // error has no usable stack.
  showDetails?: boolean;
  className?: string;
}

function errorText(error: Error | string | undefined): string | null {
  if (error === undefined) return null;
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function errorStack(error: Error | string | undefined): string | null {
  if (!error) return null;
  if (typeof error === 'string') return null;
  if (typeof error.stack === 'string' && error.stack.length > 0) {
    return error.stack;
  }
  return null;
}

export function ErrorState({
  title,
  description,
  error,
  onRetry,
  retryLabel = 'Retry',
  icon,
  reportLink,
  showDetails = false,
  className,
  ...rest
}: ErrorStateProps) {
  const message = errorText(error);
  const stack = showDetails ? errorStack(error) : null;
  const isExternalReport =
    reportLink !== undefined && reportLink.href.startsWith('http');
  return (
    <div
      role="alert"
      data-section="error-state"
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-border bg-card p-6 text-center',
        className,
      )}
      {...rest}
    >
      <div data-section="error-state-icon" aria-hidden="true">
        {icon ?? (
          <AlertTriangle className="h-6 w-6 text-destructive" />
        )}
      </div>
      <div data-section="error-state-text" className="flex flex-col gap-1">
        <span
          data-section="error-state-title"
          className="text-sm font-semibold text-destructive"
        >
          {title}
        </span>
        {description ? (
          <span
            data-section="error-state-description"
            className="text-sm text-muted-foreground"
          >
            {description}
          </span>
        ) : null}
        {/* (v1.11.314) When showDetails + stack is set, the
            inline message is suppressed in favour of the
            details disclosure below so we do not double-print
            the same content. */}
        {message && !stack ? (
          <span
            data-section="error-state-message"
            className="break-words font-mono text-xs text-muted-foreground"
          >
            {message}
          </span>
        ) : null}
      </div>
      {stack ? (
        <details
          data-section="error-state-details"
          className="w-full max-w-full text-left"
        >
          <summary
            data-section="error-state-details-summary"
            className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Stack trace
          </summary>
          <pre
            data-section="error-state-stack"
            className="mt-2 max-h-60 overflow-auto rounded border border-border bg-muted/30 p-2 text-left font-mono text-[11px] leading-snug text-muted-foreground"
          >
            {stack}
          </pre>
        </details>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-section="error-state-retry"
          className="inline-flex h-8 min-h-[44px] sm:min-h-0 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95"
        >
          {retryLabel}
        </button>
      ) : null}
      {reportLink ? (
        <a
          href={reportLink.href}
          target={isExternalReport ? '_blank' : undefined}
          rel={isExternalReport ? 'noreferrer noopener' : undefined}
          data-section="error-state-report-link"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        >
          {reportLink.label}
        </a>
      ) : null}
    </div>
  );
}

ErrorState.displayName = 'ErrorState';
