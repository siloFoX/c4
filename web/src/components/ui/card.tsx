import { forwardRef } from 'react';
import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
} from 'react';
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
  // (v1.11.311, TODO 11.293) Link mode. When `href` is set, the
  // Card renders as an `<a>` element (the canonical Linkable-Card
  // pattern). Interactive affordances (hover-lift, focus-visible
  // ring, active press) apply automatically; the caller does not
  // need to also set `interactive`. `target` + `rel` pass through
  // for external links.
  href?: string;
  target?: AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>['rel'];
  // (v1.11.311, TODO 11.293) Disabled state. When true:
  //   - The Card drops the interactive affordances (hover-lift,
  //     active-press, cursor-pointer) AND adds the standard
  //     `cursor-not-allowed opacity-60` styling.
  //   - onClick is suppressed at the wrapper level so disabled
  //     cards do not fire navigations / dispatch actions.
  //   - `aria-disabled="true"` is set so SR users hear the
  //     state. For link-mode cards (href set), the `href` is
  //     dropped (the anchor becomes a no-op) so the browser
  //     does not navigate on click either.
  disabled?: boolean;
}

const TONE_CLASSES: Record<Exclude<CardTone, 'default'>, string> = {
  success: 'bg-success/5 border-success/30',
  warning: 'bg-warning/5 border-warning/30',
  danger: 'bg-destructive/5 border-destructive/30',
};

// (v1.11.311, TODO 11.293) Interactive surface class. Hoisted
// out of the forwardRef body so the link-mode (<a>) branch can
// reach for the same affordance set.
const INTERACTIVE_CLASS =
  'cursor-pointer transition-all hover:shadow-md active:shadow-sm motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const DISABLED_CLASS = 'cursor-not-allowed opacity-60';

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      interactive,
      tone,
      href,
      target,
      rel,
      disabled = false,
      role,
      tabIndex,
      onClick,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    // Link-mode cards are interactive implicitly (the anchor
    // navigates on click). Authors can still flip `interactive`
    // off explicitly to drop the hover-lift, though that is
    // unusual -- a link card without affordance feedback reads
    // as a static page-header card.
    const isLink = href !== undefined;
    const isInteractive = !disabled && (interactive === true || isLink);
    const toneClass =
      tone && tone !== 'default' ? TONE_CLASSES[tone] : undefined;
    const baseSurface = toneClass
      ? 'rounded-xl border text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'
      : 'rounded-xl border border-border bg-card text-card-foreground shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200';

    // Suppress onClick at the wrapper level for disabled cards
    // so dispatched actions never fire. The original handler
    // is still forwarded into the DOM tree (parent rows may
    // delegate) -- callers can also gate at the source by
    // checking `disabled`.
    const handleClick = disabled
      ? undefined
      : onClick;

    const handleKeyDown = isInteractive
      ? (event: KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (
            (event.key === 'Enter' || event.key === ' ') &&
            handleClick
          ) {
            event.preventDefault();
            handleClick(event as unknown as MouseEvent<HTMLDivElement>);
          }
        }
      : onKeyDown;

    const dataAttrs = {
      'data-section': 'card',
      'data-interactive': isInteractive ? 'true' : 'false',
      'data-disabled': disabled ? 'true' : 'false',
      ...(isLink ? { 'data-mode': 'link' } : {}),
    };

    const sharedClassName = cn(
      baseSurface,
      toneClass,
      isInteractive && INTERACTIVE_CLASS,
      disabled && DISABLED_CLASS,
      className,
    );

    // (v1.11.311, TODO 11.293) Link-mode render -- swap the
    // wrapper element to <a>. Disabled link cards drop the
    // `href` so the browser does not navigate on click; the
    // anchor stays in the DOM (so parent-row layouts that
    // expect a single child node continue to work) but it
    // reads as inert.
    if (isLink) {
      const linkProps = props as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
      const anchorRef = ref as unknown as React.Ref<HTMLAnchorElement>;
      return (
        <a
          ref={anchorRef}
          {...(disabled ? {} : { href })}
          {...(target !== undefined ? { target } : {})}
          {...(rel !== undefined ? { rel } : {})}
          {...(disabled ? { 'aria-disabled': true } : {})}
          {...(role ? { role } : {})}
          {...(tabIndex !== undefined ? { tabIndex } : disabled ? { tabIndex: -1 } : {})}
          onClick={
            disabled
              ? (e) => e.preventDefault()
              : (linkProps.onClick as unknown as
                  | ((event: MouseEvent<HTMLAnchorElement>) => void)
                  | undefined)
          }
          onKeyDown={handleKeyDown as unknown as (
            event: KeyboardEvent<HTMLAnchorElement>,
          ) => void}
          className={sharedClassName}
          {...dataAttrs}
          {...(linkProps as Record<string, unknown>)}
        />
      );
    }

    return (
      <div
        ref={ref}
        role={isInteractive ? role ?? 'button' : role}
        tabIndex={
          isInteractive
            ? tabIndex ?? 0
            : disabled
              ? tabIndex ?? -1
              : tabIndex
        }
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={sharedClassName}
        {...dataAttrs}
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
