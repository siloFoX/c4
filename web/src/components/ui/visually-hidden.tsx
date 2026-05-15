import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.241, TODO 11.223) Visually-hidden primitive matching the
// ARPS a11y contract. Renders a <span> that is removed from the
// visual layout but remains in the accessibility tree so screen
// readers announce its children. Use it for accessible names on
// icon-only controls, off-screen labels for compound widgets, and
// any other place where the visible UI omits a label that assistive
// technology still needs.
//
// Why a primitive instead of inline `className="sr-only"`:
//   - Single class-merge path: caller-provided `className` flows
//     through `cn()` so the Tailwind `sr-only` rule wins over any
//     accidental override.
//   - Lints/grep target one symbol instead of a string literal.
//   - Future-proofs the project for a CSS-class swap (e.g. moving
//     off Tailwind core) without touching every call site.
//
// Implementation note: Tailwind's `sr-only` utility already emits
// the canonical "visually hidden but reachable" rule set
// (position absolute, width/height 1px, clip-path inset, etc.).
// No extra styling is needed in this file -- the primitive is a
// thin convention layer, not a re-implementation of the rule.

export type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement>;

export const VisuallyHidden = forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn('sr-only', className)}
        {...props}
      />
    );
  },
);
VisuallyHidden.displayName = 'VisuallyHidden';
