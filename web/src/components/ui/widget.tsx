import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Tooltip } from './tooltip';
import { VisuallyHidden } from './visually-hidden';
import { cn } from '../../lib/cn';
import { formatRelativeTime } from '../../lib/format';

// (v1.11.256, TODO 11.238) Dashboard widget shell. A small,
// composable card with three named slots:
//   header   -- title, optional leading icon, optional refresh
//               button, optional "updated <relative>" stamp.
//   body     -- the actual content (chart / metric / list).
//   footer   -- a thin row for hints / secondary actions /
//               last-error chip.
//
// Why a primitive, not just <Card>:
//   Card already gives the surface; consumers were re-spelling
//   the same "title + refresh + updatedAt" header at the top of
//   every dashboard tile (Uptime daemon-process card,
//   Autonomous digest card, Health hero metrics). This file
//   bottles that pattern so the header chrome stays consistent.
//
// API styles -- both work, pick whichever reads better at the
// call site:
//
//   (1) compound -- you compose the slots yourself:
//       <Widget>
//         <Widget.Header title="Daemon" updatedAt={iso} onRefresh={refresh} />
//         <Widget.Body>...</Widget.Body>
//         <Widget.Footer>...</Widget.Footer>
//       </Widget>
//
//   (2) flat -- you pass the slots as props:
//       <Widget
//         title="Daemon"
//         updatedAt={iso}
//         onRefresh={refresh}
//         footer={<span>...</span>}
//       >
//         body content
//       </Widget>
//
// The flat shape forwards into the compound shape so the
// rendered DOM is byte-identical either way; tests that
// query for `data-widget-header` / `-body` / `-footer` work
// against both styles.

export interface WidgetProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  icon?: ReactNode;
  updatedAt?: string | number | null;
  /** Suffix for the relative-time stamp. Defaults to 'updated'. */
  updatedLabel?: string;
  /** Fired when the refresh button is clicked. */
  onRefresh?: () => void;
  /** When true, dims the refresh button and prevents firing. */
  loading?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export interface WidgetSlotProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export interface WidgetHeaderProps extends WidgetSlotProps {
  title?: ReactNode;
  icon?: ReactNode;
  updatedAt?: string | number | null;
  updatedLabel?: string;
  onRefresh?: () => void;
  loading?: boolean;
}

function formatUpdated(
  updatedAt: string | number | null | undefined,
  label: string,
): string | null {
  if (updatedAt === null || updatedAt === undefined) return null;
  const stamp = formatRelativeTime(updatedAt);
  if (!stamp) return null;
  return `${label} ${stamp}`;
}

const WidgetHeader = forwardRef<HTMLDivElement, WidgetHeaderProps>(
  (
    {
      className,
      title,
      icon,
      updatedAt,
      updatedLabel = 'updated',
      onRefresh,
      loading,
      children,
      ...rest
    },
    ref,
  ) => {
    const stamp = formatUpdated(updatedAt, updatedLabel);
    return (
      <div
        ref={ref}
        data-widget-header=""
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/10 px-3 py-2',
          className,
        )}
        {...rest}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          {icon ? (
            <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
              {icon}
            </span>
          ) : null}
          {title !== undefined ? <span className="truncate">{title}</span> : null}
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stamp ? (
            <span
              data-widget-updated=""
              className="text-[11px] text-muted-foreground"
            >
              {stamp}
            </span>
          ) : null}
          {onRefresh ? (
            <Tooltip label="Refresh">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                data-widget-refresh=""
                aria-label="Refresh widget"
              >
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    loading && 'animate-spin',
                  )}
                />
                <VisuallyHidden>Refresh</VisuallyHidden>
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    );
  },
);
WidgetHeader.displayName = 'Widget.Header';

const WidgetBody = forwardRef<HTMLDivElement, WidgetSlotProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-widget-body=""
      className={cn('p-3 text-sm', className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
WidgetBody.displayName = 'Widget.Body';

const WidgetFooter = forwardRef<HTMLDivElement, WidgetSlotProps>(
  ({ className, children, ...rest }, ref) => (
    <div
      ref={ref}
      data-widget-footer=""
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/5 px-3 py-2 text-[11px] text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
WidgetFooter.displayName = 'Widget.Footer';

interface WidgetBase {
  (props: WidgetProps): JSX.Element;
  displayName: string;
}

interface WidgetCompound extends WidgetBase {
  Header: typeof WidgetHeader;
  Body: typeof WidgetBody;
  Footer: typeof WidgetFooter;
}

function WidgetImpl({
  title,
  icon,
  updatedAt,
  updatedLabel,
  onRefresh,
  loading,
  footer,
  children,
  className,
  ...rest
}: WidgetProps): JSX.Element {
  // When a header-relevant prop is supplied, render the flat
  // header. Otherwise assume the consumer is composing slots
  // explicitly and just render the children inside the shell.
  const flatHeader =
    title !== undefined ||
    icon !== undefined ||
    updatedAt !== undefined ||
    onRefresh !== undefined ||
    loading !== undefined;
  return (
    <section
      data-widget=""
      data-widget-loading={loading ? '' : undefined}
      className={cn(
        'overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...rest}
    >
      {flatHeader ? (
        <WidgetHeader
          title={title}
          icon={icon}
          updatedAt={updatedAt}
          updatedLabel={updatedLabel}
          onRefresh={onRefresh}
          loading={loading}
        />
      ) : null}
      {flatHeader && (children !== undefined || footer !== undefined) ? (
        <WidgetBody>{children}</WidgetBody>
      ) : (
        children
      )}
      {footer !== undefined ? <WidgetFooter>{footer}</WidgetFooter> : null}
    </section>
  );
}
WidgetImpl.displayName = 'Widget';

export const Widget = WidgetImpl as WidgetCompound;
Widget.Header = WidgetHeader;
Widget.Body = WidgetBody;
Widget.Footer = WidgetFooter;
