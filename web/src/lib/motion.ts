// motion.ts -- canonical motion utilities bundle.
//
// (v1.11.323, TODO 11.305) This module is the single
// import surface for everything an animating component
// needs: the reduced-motion preference hook, the
// Tailwind class shortcuts for the canonical animation
// library, the conditional class picker that respects
// the user's preference, and a one-liner hook that
// fuses the two together.
//
// ## Canonical pattern
//
// Three usage shapes are supported, listed in order
// from most concise to most flexible:
//
//   1. `useMotionClass(key, fallback?)` -- the
//      preferred form for new component code. Returns
//      the right Tailwind class string for the current
//      `prefers-reduced-motion` state in one call:
//      ```tsx
//      const enterClass = useMotionClass('fadeIn');
//      return <div className={enterClass}>...</div>;
//      ```
//      Internally calls `useReducedMotion()` plus
//      `motionClass()` so the call site stays a
//      one-liner.
//
//   2. `motionClass(key, reducedMotion, fallback?)` --
//      stateless picker for callers that already
//      have the reducedMotion bool from somewhere
//      else (e.g. props, a parent context, or a
//      manually-tracked state). Returns the Tailwind
//      class for the key when motion is allowed, or
//      the fallback (default `''`) when reduced.
//
//   3. `motion[key]` -- raw Tailwind class strings.
//      Reach for these only when you need to compose
//      with other classes inline (e.g. inside
//      `motion-safe:...` modifier groups), and accept
//      that you are responsible for honouring the
//      reduced-motion contract.
//
// `useReducedMotion()` is re-exported from
// `hooks/use-reduced-motion` so component code that
// only needs the preference (not a class) does not
// have to learn a second import path.

import { useReducedMotion } from '../hooks/use-reduced-motion';

// Re-export so consumers can import everything from
// `lib/motion` in one line.
export { useReducedMotion } from '../hooks/use-reduced-motion';

// (v1.11.253, TODO 11.235) Tailwind-class shortcuts for
// the canonical animation library (used by Dialog +
// Popover + every surface that wants a one-liner). The
// duration values below align with the central motion
// scale in `web/src/styles/motion.css` /
// `web/src/lib/motion-tokens.ts`:
//   duration-150 -> --motion-duration-fast
//   duration-200 -> --motion-duration-normal
//   duration-100 -> ~--motion-duration-instant
//                   (Tailwind has no 80ms class; 100ms
//                   reads as the same beat without
//                   registering as a separate step).
// Inline-style callers (Toast) reach for the tokens
// directly so their numbers stay in lockstep across
// this layer.
export const motion = {
  fadeIn: 'animate-in fade-in duration-200',
  fadeOut: 'animate-out fade-out duration-150',
  slideInRight: 'animate-in slide-in-from-right duration-200',
  slideOutRight: 'animate-out slide-out-to-right duration-150',
  slideInLeft: 'animate-in slide-in-from-left duration-200',
  slideOutLeft: 'animate-out slide-out-to-left duration-150',
  scaleIn: 'animate-in zoom-in-95 duration-150',
  scaleOut: 'animate-out zoom-out-95 duration-100',
} as const;

export type MotionKey = keyof typeof motion;

// Stateless picker. Returns the Tailwind class string
// for the given motion key when motion is allowed, or
// the fallback when reduced. Callers that have the
// `reducedMotion` bool from somewhere other than the
// `useReducedMotion` hook (e.g. a prop drilled in, a
// parent context, server-side rendering with a known
// preference) should use this directly.
export function motionClass(
  key: MotionKey,
  reducedMotion: boolean,
  fallback?: string,
): string {
  if (reducedMotion) return fallback ?? '';
  return motion[key];
}

// (v1.11.323, TODO 11.305) Hook-friendly one-liner.
// Returns the canonical Tailwind class string for the
// current `prefers-reduced-motion` state in one call.
//
// Equivalent to:
// ```tsx
// const reduced = useReducedMotion();
// const cls = motionClass(key, reduced, fallback);
// ```
//
// Reach for this form in new component code so the
// reduced-motion gate stays a single point of
// responsibility per call site.
export function useMotionClass(
  key: MotionKey,
  fallback?: string,
): string {
  const reducedMotion = useReducedMotion();
  return motionClass(key, reducedMotion, fallback);
}
