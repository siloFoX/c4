import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type NotificationBannerVariant = 'info' | 'warn' | 'critical';

export interface NotificationBannerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
  variant?: NotificationBannerVariant;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  sticky?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<NotificationBannerVariant, string> = {
  info: 'bg-info/10 border-info text-info-foreground',
  warn: 'bg-warning/10 border-warning text-warning-foreground',
  critical: 'bg-destructive/10 border-destructive text-destructive-foreground',
};

const DEFAULT_ICONS: Record<NotificationBannerVariant, ReactNode> = {
  info: <Info className="h-5 w-5" aria-hidden="true" />,
  warn: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
  critical: <AlertOctagon className="h-5 w-5" aria-hidden="true" />,
};

export const NotificationBanner = forwardRef<HTMLDivElement, NotificationBannerProps>(
  function NotificationBanner(
    {
      variant = 'info',
      title,
      description,
      icon,
      action,
      onDismiss,
      dismissLabel = 'Dismiss',
      sticky = true,
      className,
      ...rest
    },
    ref,
  ) {
    const role = variant === 'critical' ? 'alert' : 'status';
    const ariaLive = role === 'alert' ? 'assertive' : 'polite';
    const resolvedIcon = icon ?? DEFAULT_ICONS[variant];
    return (
      <div
        ref={ref}
        role={role}
        aria-live={ariaLive}
        className={cn(
          'flex w-full items-start gap-3 border-b px-4 py-3 text-sm shadow-sm',
          VARIANT_CLASSES[variant],
          sticky && 'sticky top-0 z-40',
          className,
        )}
        {...rest}
      >
        {resolvedIcon ? (
          <div className="mt-0.5 shrink-0" aria-hidden="true">
            {resolvedIcon}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title ? <p className="font-semibold leading-tight">{title}</p> : null}
          {description ? <div className="leading-relaxed">{description}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  },
);
