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
//
// (v1.11.316, TODO 11.298) Enhancements:
//   - `as` polymorphic tag prop. Defaults to 'span' (inline
//     phrasing). Pass 'div' for block-level skip targets that
//     wrap multiple SR-only siblings.
//   - `focusable` -- when true the component swaps in the
//     Tailwind `focus:not-sr-only` modifier so the element
//     becomes visible when focused. Use this for skip-links
//     ("Skip to main content") that should be invisible until
//     a keyboard user tabs to them.
//   - `data-section="visually-hidden"` + `data-focusable`
//     selectors for e2e + theming.

export type VisuallyHiddenAs = 'span' | 'div';

export interface VisuallyHiddenProps
  extends HTMLAttributes<HTMLElement> {
  // (v1.11.316, TODO 11.298)
  as?: VisuallyHiddenAs;
  // (v1.11.316, TODO 11.298) Focusable-skip variant. When the
  // element receives keyboard focus, it becomes visible (the
  // Tailwind `focus:not-sr-only` modifier flips the
  // sr-only-only styling off). The unfocused state stays
  // hidden, matching the prior behaviour byte-for-byte.
  focusable?: boolean;
}

export const VisuallyHidden = forwardRef<HTMLElement, VisuallyHiddenProps>(
  ({ as = 'span', focusable = false, className, ...props }, ref) => {
    const merged = cn(
      'sr-only',
      focusable &&
        'focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-2 focus:py-1 focus:text-foreground focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
      className,
    );
    const dataAttrs = {
      'data-section': 'visually-hidden',
      'data-focusable': focusable ? 'true' : 'false',
    };
    if (as === 'div') {
      return (
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          className={merged}
          {...dataAttrs}
          {...(props as HTMLAttributes<HTMLDivElement>)}
        />
      );
    }
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={merged}
        {...dataAttrs}
        {...(props as HTMLAttributes<HTMLSpanElement>)}
      />
    );
  },
);
VisuallyHidden.displayName = 'VisuallyHidden';
