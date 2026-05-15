import type { CSSProperties } from 'react';

// (v1.11.243, TODO 11.225) Shared loading-animation contract for
// the Skeleton shimmer + Spinner rotate primitives. Centralising
// the duration / easing in one module keeps the two indicators in
// visual lock-step and gives a single point to flip when the ARPS
// motion tokens (see arps-design-system-v1/tokens.css
// --duration-* / --ease-*) are wired into the bundle.
//
// Why these numbers
// -----------------
// - The Skeleton shimmer (Tailwind's `animate-pulse`) defaults to
//   `2s cubic-bezier(0.4, 0, 0.6, 1)`. That timing eases in *and*
//   out symmetrically, which makes long-running loading states
//   feel restless. We swap to `cubic-bezier(0.4, 0, 0.2, 1)` (the
//   ARPS standard easing -- ease-in, gentler ease-out) so the
//   shimmer settles between pulses.
// - The Spinner rotate (Tailwind's `animate-spin`) defaults to
//   `1s linear`. Linear is the right easing for continuous
//   rotation (any curve would visibly stutter), but `1s` is too
//   frantic for a status indicator that shares the screen with a
//   slow shimmer. We slow the spinner to `1200ms` so the spinner
//   period stays a clean 2:3 ratio with the 1800ms shimmer period:
//   the spinner completes 1.5 rotations per shimmer pulse, which
//   gives the two indicators a felt rhythm without locking them
//   into a stroboscopic 1:1.
// - Both numbers are multiples of 200ms (the smallest tweenable
//   unit on a 60Hz display) so they line up cleanly with the rest
//   of the ARPS motion scale (`--duration-fast: 160ms`,
//   `--duration-normal: 240ms`, `--duration-slow: 360ms`,
//   `--duration-deliberate: 600ms`).
//
// Reduced-motion contract
// -----------------------
// The two primitives gate the animation class via
// `useReducedMotion()` (see web/src/hooks/use-reduced-motion.ts).
// When the user prefers reduced motion the components drop the
// Tailwind animation utility entirely and render a static block
// (still keyed `role="status"` so assistive tech announces the
// loading state). The inline style override below is therefore a
// no-op for those users: with no animation running, the
// `animationDuration` / `animationTimingFunction` properties are
// inert.

export interface LoadingMotionSpec {
  readonly durationMs: number;
  readonly easing: string;
}

export interface LoadingMotionContract {
  readonly skeleton: LoadingMotionSpec;
  readonly spinner: LoadingMotionSpec;
}

export const LOADING_MOTION: LoadingMotionContract = {
  skeleton: {
    durationMs: 1800,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  spinner: {
    durationMs: 1200,
    easing: 'linear',
  },
};

export type LoadingMotionKind = keyof LoadingMotionContract;

const EMPTY_STYLE: CSSProperties = Object.freeze({});

// When `reduced` is true the returned style is empty (the calling
// component is responsible for dropping the animation class). When
// `reduced` is false the returned style overrides the Tailwind
// animation duration + easing so both primitives speak the same
// motion contract regardless of theme / install-side Tailwind
// config tweaks.
export function getLoadingMotionStyle(
  kind: LoadingMotionKind,
  reduced: boolean,
): CSSProperties {
  if (reduced) return EMPTY_STYLE;
  const spec = LOADING_MOTION[kind];
  return {
    animationDuration: `${spec.durationMs}ms`,
    animationTimingFunction: spec.easing,
  };
}

// Returns the Tailwind animation class for the kind, or an empty
// string when `reduced` is true so the caller can simply pass the
// result through `cn()`.
export function getLoadingMotionClass(
  kind: LoadingMotionKind,
  reduced: boolean,
): string {
  if (reduced) return '';
  return kind === 'skeleton' ? 'animate-pulse' : 'animate-spin';
}
