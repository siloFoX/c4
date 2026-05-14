import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.178) HeroCard. Large featured info card used as a top-of-page
// welcome / onboarding surface. Renders an optional icon badge, a bold
// title, an optional description, and a horizontal CTA row. A subtle
// tone-driven gradient sits behind the content via an absolutely
// positioned overlay; the wrapper is relative + overflow-hidden so the
// gradient stays inside the rounded border.

export type HeroCardTone = 'primary' | 'success' | 'info' | 'muted';
export type HeroCardSize = 'sm' | 'md' | 'lg';

export interface HeroCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  cta?: ReactNode;
  secondaryCta?: ReactNode;
  tone?: HeroCardTone;
  size?: HeroCardSize;
  className?: string;
}

const TONE_GRADIENT: Record<HeroCardTone, string> = {
  primary: 'from-primary/20 via-primary/5 to-transparent',
  success: 'from-success/20 via-success/5 to-transparent',
  info: 'from-info/20 via-info/5 to-transparent',
  muted: 'from-muted/50 via-muted/10 to-transparent',
};

const TONE_BADGE: Record<HeroCardTone, string> = {
  primary: 'bg-primary/10 text-primary ring-primary/30',
  success: 'bg-success/10 text-success ring-success/30',
  info: 'bg-info/10 text-info ring-info/30',
  muted: 'bg-muted text-muted-foreground ring-border',
};

const SIZE_PAD: Record<HeroCardSize, string> = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const SIZE_BADGE: Record<HeroCardSize, string> = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
};

const SIZE_TITLE: Record<HeroCardSize, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
};

export const HeroCard = forwardRef<HTMLElement, HeroCardProps>(
  (
    {
      icon,
      title,
      description,
      cta,
      secondaryCta,
      tone = 'primary',
      size = 'md',
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <section
        ref={ref}
        data-hero-card
        data-tone={tone}
        data-size={size}
        className={cn(
          'relative overflow-hidden rounded-xl border border-border bg-card shadow-sm',
          SIZE_PAD[size],
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          data-hero-card-gradient
          className={cn(
            'pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br',
            TONE_GRADIENT[tone],
          )}
        />
        <div className="relative z-10 flex flex-col gap-3">
          {icon ? (
            <span
              data-hero-card-icon
              aria-hidden="true"
              className={cn(
                'flex shrink-0 items-center justify-center rounded-lg ring-1 backdrop-blur-sm',
                SIZE_BADGE[size],
                TONE_BADGE[tone],
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="flex flex-col gap-1">
            <h2
              data-hero-card-title
              className={cn(
                'font-semibold leading-tight text-foreground',
                SIZE_TITLE[size],
              )}
            >
              {title}
            </h2>
            {description ? (
              <p
                data-hero-card-description
                className="text-sm text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
          </div>
          {cta || secondaryCta ? (
            <div
              data-hero-card-cta-row
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              {cta}
              {secondaryCta}
            </div>
          ) : null}
        </div>
      </section>
    );
  },
);
HeroCard.displayName = 'HeroCard';
