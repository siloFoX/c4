import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { VisuallyHidden } from './ui/visually-hidden';
import {
  getLoadingMotionClass,
  getLoadingMotionStyle,
} from './ui/loading-motion';
import { useReducedMotion } from '../hooks/use-reduced-motion';

// (v1.11.135) Small inline loading indicator. An SVG ring (circle +
// arc) animated via Tailwind's `animate-spin`. Uses `stroke="currentColor"`
// so the spinner inherits the surrounding text color -- callers control
// the color through `text-*` classes on a parent or via `className`.
// The wrapper span carries `role=status` + `aria-live=polite` +
// `aria-label` (default 'Loading') and the SVG inside is `aria-hidden`
// so assistive tech announces a single status message. The same label
// is also rendered as `sr-only` text inside the wrapper as a
// screen-reader-friendly fallback for environments that prefer text
// content over aria-label.
//
// (v1.11.243, TODO 11.225) The rotation timing is now sourced from
// the shared loading-motion contract (ui/loading-motion.ts) so the
// spinner stays in visual lock-step with the Skeleton shimmer.
// When `prefers-reduced-motion: reduce` is active the
// `animate-spin` class is dropped entirely and the SVG renders as
// a static ring -- the role=status / aria-live wrapper still
// announces the loading state to assistive tech.

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerColor = 'primary' | 'muted' | 'inverse' | 'destructive';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  color?: SpinnerColor;
  label?: string;
  className?: string;
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-6 w-6',
};

const COLOR_CLASS: Record<SpinnerColor, string> = {
  primary: 'text-primary',
  muted: 'text-muted-foreground',
  inverse: 'text-primary-foreground',
  destructive: 'text-destructive',
};

export default function Spinner({
  size = 'md',
  color = 'primary',
  label = 'Loading',
  className,
  ...rest
}: SpinnerProps) {
  const reduced = useReducedMotion();
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center',
        COLOR_CLASS[color],
        className,
      )}
      {...rest}
    >
      <svg
        aria-hidden="true"
        data-spinner-ring=""
        data-motion-reduced={reduced ? '' : undefined}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className={cn(getLoadingMotionClass('spinner', reduced), SIZE_CLASS[size])}
        style={getLoadingMotionStyle('spinner', reduced)}
      >
        <circle cx="12" cy="12" r="10" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
