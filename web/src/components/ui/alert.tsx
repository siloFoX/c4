import { X } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  role?: 'status' | 'alert';
  className?: string;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-primary/10 text-primary border-primary/40',
  success: 'bg-success/10 text-success border-success/40',
  warning: 'bg-warning/10 text-warning border-warning/40',
  error: 'bg-destructive/10 text-destructive border-destructive/40',
  neutral: 'bg-muted text-muted-foreground border-border',
};

export function Alert({
  variant = 'info',
  title,
  children,
  icon,
  action,
  dismissible = false,
  onDismiss,
  role,
  className,
  ...rest
}: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' ? 'alert' : 'status');
  const ariaLive = resolvedRole === 'alert' ? 'assertive' : 'polite';
  return (
    <div
      role={resolvedRole}
      aria-live={ariaLive}
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 text-sm',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <div className="mt-0.5 shrink-0" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-semibold leading-tight">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
