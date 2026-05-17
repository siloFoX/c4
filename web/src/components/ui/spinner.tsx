import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.310, TODO 11.292) Canonical UI Spinner primitive.
//
// Fresh companion to the existing `web/src/components/Spinner.tsx`
// (which keeps driving the loading-motion-integration suite).
// The new ui/spinner.tsx is a leaner contract focused on the
// surfaces the dispatch named (Button loading state, page
// transition loader, modal save in-progress):
//
//   - CSS-only ring + arc, no JS animation loop.
//   - 4 sizes (xs / sm / md / lg) for the xs-to-lg densities
//     across nav rows, inline buttons, page-level loaders.
//   - 2 tones (neutral / accent) keyed to the canonical
//     palette tokens.
//   - Respects `prefers-reduced-motion: reduce` -- the spin
//     animation drops AND the surface falls back to a static
//     text label so SR users (and motion-sensitive operators)
//     still see "Loading...".
//
// The ring is a CSS border (top-transparent + sides matching
// the tone) rotated via Tailwind's `animate-spin`, so a future
// theme migration just retunes the per-tone border tokens.

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerTone = 'neutral' | 'accent';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  // SR-friendly text. Also rendered as the visible fallback
  // when prefers-reduced-motion is reduce. Default "Loading".
  label?: string;
  // When true, hides the visual ring AND surfaces the label
  // as the visible affordance. Use for fully-text loaders
  // (e.g., "Saving..."). Default false.
  textOnly?: boolean;
  className?: string;
}

const SIZE_RING: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-6 w-6 border-[3px]',
};

const SIZE_LABEL: Record<SpinnerSize, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

// (v1.11.310) Per-tone border palette. The top border stays
// transparent (so the rotated ring reads as a partial arc);
// the other three borders use the tone token. The wrapper's
// `color: currentColor` is inherited from the parent so the
// label text follows the same hue.
const TONE_RING: Record<SpinnerTone, string> = {
  neutral: 'border-muted-foreground/40 border-t-transparent',
  accent: 'border-primary border-t-transparent',
};

const TONE_LABEL: Record<SpinnerTone, string> = {
  neutral: 'text-muted-foreground',
  accent: 'text-primary',
};

export function Spinner({
  size = 'md',
  tone = 'neutral',
  label = 'Loading',
  textOnly = false,
  className,
  ...rest
}: SpinnerProps) {
  const reducedMotion = useReducedMotion();

  // (v1.11.310) The text-only path AND the reduced-motion
  // path both surface the label verbatim. Reduced motion
  // operators see the same affordance as text-only callers
  // -- no surprise animation, no surprise spin.
  const renderAsText = textOnly || reducedMotion;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      data-section="spinner"
      data-size={size}
      data-tone={tone}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-render={renderAsText ? 'text' : 'ring'}
      className={cn(
        'inline-flex items-center gap-1.5',
        TONE_LABEL[tone],
        className,
      )}
      {...rest}
    >
      {renderAsText ? (
        <span
          data-section="spinner-text"
          className={cn('font-medium', SIZE_LABEL[size])}
        >
          {label}
        </span>
      ) : (
        <span
          aria-hidden="true"
          data-section="spinner-ring"
          className={cn(
            'inline-block rounded-full animate-spin',
            SIZE_RING[size],
            TONE_RING[tone],
          )}
        />
      )}
    </span>
  );
}

Spinner.displayName = 'Spinner';
