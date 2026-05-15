import { forwardRef } from 'react';
import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react';
import { cn } from '../../lib/cn';

export type CardTone = 'default' | 'success' | 'warning' | 'danger';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // (v1.11.143) When true, the Card becomes a keyboard- and pointer-
  // reachable activate target: hover-lift, active-press, focus-visible
  // ring, plus role=button + tabIndex=0 and Enter/Space => onClick.
  // When omitted/false, Card renders byte-identically to the prior
  // static-container output (no class delta, no a11y attr injection).
  interactive?: boolean;
  // (v1.11.239) Surface tone: subdued background tint + matching
  // border using ARPS tokens. 'default' (or omitted) preserves the
  // prior bg-card / border-border surface byte-for-byte.
  tone?: CardTone;
}

const TONE_CLASSES: Record<Exclude<CardTone, 'default'>, string> = {
  success: 'bg-success/5 border-success/30',
  warning: 'bg-warning/5 border-warning/30',
  danger: 'bg-destructive/5 border-destructive/30',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      interactive,
      tone,
      role,
      tabIndex,
      onClick,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const isInteractive = interactive === true;
    const toneClass =
      tone && tone !== 'default' ? TONE_CLASSES[tone] : undefined;
    const baseSurface = toneClass
      ? 'rounded-xl border text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'
      : 'rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200';

    const handleKeyDown = isInteractive
      ? (event: KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if ((event.key === 'Enter' || event.key === ' ') && onClick) {
            event.preventDefault();
            onClick(event as unknown as MouseEvent<HTMLDivElement>);
          }
        }
      : onKeyDown;

    return (
      <div
        ref={ref}
        role={isInteractive ? role ?? 'button' : role}
        tabIndex={isInteractive ? tabIndex ?? 0 : tabIndex}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          baseSurface,
          toneClass,
          isInteractive &&
            'cursor-pointer transition-all hover:shadow-md active:shadow-sm motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col gap-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';
