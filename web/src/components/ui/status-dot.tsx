import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type StatusDotVariant =
  | 'online'
  | 'busy'
  | 'away'
  | 'offline'
  | 'unknown';

export type StatusDotSize = 'sm' | 'md' | 'lg';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusDotVariant;
  size?: StatusDotSize;
  pulse?: boolean;
  label?: ReactNode;
}

const COLOR_BY_VARIANT: Record<StatusDotVariant, string> = {
  online: 'bg-green-500',
  busy: 'bg-yellow-500',
  away: 'bg-orange-500',
  offline: 'bg-muted-foreground',
  unknown: 'bg-muted',
};

const SIZE_PX: Record<StatusDotSize, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

export function StatusDot({
  variant = 'unknown',
  size = 'md',
  pulse = false,
  label,
  className,
  ...props
}: StatusDotProps) {
  const dotColor = COLOR_BY_VARIANT[variant];
  const dotSize = SIZE_PX[size];
  const ariaLabel =
    props['aria-label'] ?? (label == null ? `Status: ${variant}` : undefined);

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        className,
      )}
      {...props}
    >
      <span className="relative inline-flex">
        {pulse ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inline-flex rounded-full opacity-75 animate-ping',
              dotSize,
              dotColor,
            )}
          />
        ) : null}
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex rounded-full',
            dotSize,
            dotColor,
          )}
        />
      </span>
      {label != null ? <span>{label}</span> : null}
    </span>
  );
}
