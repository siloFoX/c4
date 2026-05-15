import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/15 text-warning',
        info: 'border-transparent bg-info/15 text-info',
        error: 'border-transparent bg-destructive text-destructive-foreground',
        neutral: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * (v1.11.247, TODO 11.229) Optional leading icon. Renders inside
   * the badge before the text content. Use this when colour alone
   * carries meaning (a colourblind operator cannot distinguish
   * success-green from neutral-grey, so an icon is the secondary
   * signal). Passing `false` explicitly opts out of the auto-icon
   * even on signal-bearing variants.
   */
  icon?: ReactNode | false;
}

// (v1.10.779) Hoisted from WorkflowRunsPanel + HistoryDetailPane
// where each redeclared this alias inline.
export type BadgeVariant = NonNullable<BadgeProps['variant']>;

// (v1.11.247, TODO 11.229) Default icon per signal-bearing
// variant. Consumers can override with an explicit `icon` prop, or
// opt out entirely with `icon={false}`. The four signal variants
// (success / warning / info / error) plus `destructive` (which
// shares the error palette) get an icon by default; neutral
// surfaces stay icon-less so the existing default / secondary /
// outline / neutral usages keep their byte-for-byte appearance.
const SIGNAL_ICON: Partial<Record<NonNullable<BadgeVariant>, ReactNode>> = {
  success: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
  warning: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
  info: <Info className="h-3 w-3" aria-hidden="true" />,
  error: <XCircle className="h-3 w-3" aria-hidden="true" />,
  destructive: <XCircle className="h-3 w-3" aria-hidden="true" />,
};

export function Badge({
  className,
  variant,
  icon,
  children,
  ...props
}: BadgeProps) {
  // `icon === false` -> caller opts out of the auto-icon.
  // `icon === undefined` -> fall back to the per-variant default.
  // any other ReactNode -> render verbatim.
  const resolvedIcon: ReactNode | null =
    icon === false
      ? null
      : icon !== undefined
        ? icon
        : variant
          ? SIGNAL_ICON[variant] ?? null
          : null;
  return (
    <span
      className={cn(badgeVariants({ variant }), resolvedIcon && 'gap-1', className)}
      {...props}
    >
      {resolvedIcon}
      {children}
    </span>
  );
}
