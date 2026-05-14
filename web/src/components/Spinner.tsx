import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

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

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-6 w-6',
};

export default function Spinner({
  size = 'md',
  label = 'Loading',
  className,
  ...rest
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('inline-flex items-center justify-center', className)}
      {...rest}
    >
      <svg
        aria-hidden="true"
        data-spinner-ring=""
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        className={cn('animate-spin', SIZE_CLASS[size])}
      >
        <circle cx="12" cy="12" r="10" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
