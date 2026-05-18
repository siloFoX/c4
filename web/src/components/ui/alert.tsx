import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error' | 'neutral';

// (v1.11.398, TODO 11.380) Size scale. Default `md` matches
// the legacy 11.149 padding + text rhythm byte-for-byte.
// `sm` is a dense inline banner for sidebars / tooltips;
// `lg` is a hero strip for page-header status callouts.
export type AlertSize = 'sm' | 'md' | 'lg';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'role'> {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  // (v1.11.398, TODO 11.380) Icon resolution:
  //   - `undefined` (default): use the per-variant auto-icon
  //     (Info / CheckCircle2 / AlertTriangle / XCircle for
  //     info / success / warning / error). `neutral` stays
  //     icon-less so the existing icon-less neutral usage is
  //     byte-identical.
  //   - `false`: opt out of the auto-icon entirely.
  //   - any ReactNode: render verbatim (legacy contract).
  icon?: ReactNode | false;
  action?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  role?: 'status' | 'alert';
  size?: AlertSize;
  className?: string;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-primary/10 text-primary border-primary/40',
  success: 'bg-success/10 text-success border-success/40',
  warning: 'bg-warning/10 text-warning border-warning/40',
  error: 'bg-destructive/10 text-destructive border-destructive/40',
  neutral: 'bg-muted text-muted-foreground border-border',
};

// (v1.11.398, TODO 11.380) Per-size dimensions. md is the
// legacy 11.149 layout byte-for-byte (`p-3 text-sm gap-3`).
const SIZE_CLASSES: Record<AlertSize, string> = {
  sm: 'p-2 text-xs gap-2',
  md: 'p-3 text-sm gap-3',
  lg: 'p-4 text-base gap-4',
};

// (v1.11.398, TODO 11.380) Per-variant auto-icon. Matches
// the Badge (11.229) icon ladder so the two primitives feel
// cohesive when a row pairs them. Neutral stays icon-less so
// the existing icon-less neutral usage is byte-identical.
const VARIANT_AUTO_ICON: Partial<Record<AlertVariant, ReactNode>> = {
  info: <Info className="h-4 w-4" aria-hidden="true" />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  error: <XCircle className="h-4 w-4" aria-hidden="true" />,
};

const DISMISS_SIZE: Record<AlertSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-7 w-7',
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
  size = 'md',
  className,
  ...rest
}: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' ? 'alert' : 'status');
  const ariaLive = resolvedRole === 'alert' ? 'assertive' : 'polite';
  // (v1.11.398, TODO 11.380) Icon resolution precedence:
  //   - explicit `icon={false}` -> null (opt-out).
  //   - explicit ReactNode -> render verbatim.
  //   - default -> per-variant auto-icon (info/success/
  //     warning/error). neutral has no auto-icon.
  const resolvedIcon: ReactNode | null =
    icon === false
      ? null
      : icon !== undefined
        ? icon
        : VARIANT_AUTO_ICON[variant] ?? null;
  return (
    <div
      role={resolvedRole}
      aria-live={ariaLive}
      data-section="alert"
      data-variant={variant}
      data-size={size}
      className={cn(
        'flex items-start rounded-md border',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {resolvedIcon ? (
        <div className="mt-0.5 shrink-0" data-section="alert-icon" aria-hidden="true">
          {resolvedIcon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? (
          <p data-section="alert-title" className="font-semibold leading-tight">
            {title}
          </p>
        ) : null}
        {children ? (
          <div data-section="alert-description" className="leading-relaxed">
            {children}
          </div>
        ) : null}
        {action ? (
          <div data-section="alert-action" className="mt-2 flex flex-wrap gap-2">
            {action}
          </div>
        ) : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          data-section="alert-dismiss"
          className={cn(
            'ml-2 inline-flex shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            DISMISS_SIZE[size],
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
