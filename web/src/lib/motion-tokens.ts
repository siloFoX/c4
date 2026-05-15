// (v1.11.253, TODO 11.235) JS-side mirror of `styles/motion.css`.
// JS callers (Toast's inline `style.transition`, setTimeout-driven
// state transitions, jest-fake-timer-friendly tests) need the
// number behind the CSS variable; this module re-exports the
// same scale so the two stay in lockstep. A future ARPS-tokens
// migration that flips the CSS values must also flip the
// constants here.

export const MOTION_DURATION_INSTANT_MS = 80;
export const MOTION_DURATION_FAST_MS = 150;
export const MOTION_DURATION_NORMAL_MS = 200;
export const MOTION_DURATION_SLOW_MS = 300;
export const MOTION_DURATION_DELIBERATE_MS = 500;

export const MOTION_EASE_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const MOTION_EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
export const MOTION_EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
export const MOTION_EASE_EMPHASIZED = 'cubic-bezier(0.2, 0, 0, 1)';

export const MOTION_SPRING_SNAPPY = 'cubic-bezier(0.2, 0.8, 0.2, 1.05)';
export const MOTION_SPRING_SOFT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

// Convenience record so a consumer can pick a key by string
// (e.g. configuration-driven motion). The order matches the
// CSS file -- keep them aligned when adding new entries.
export const MOTION_DURATIONS_MS = {
  instant: MOTION_DURATION_INSTANT_MS,
  fast: MOTION_DURATION_FAST_MS,
  normal: MOTION_DURATION_NORMAL_MS,
  slow: MOTION_DURATION_SLOW_MS,
  deliberate: MOTION_DURATION_DELIBERATE_MS,
} as const;

export const MOTION_EASINGS = {
  standard: MOTION_EASE_STANDARD,
  out: MOTION_EASE_OUT,
  in: MOTION_EASE_IN,
  emphasized: MOTION_EASE_EMPHASIZED,
  'spring-snappy': MOTION_SPRING_SNAPPY,
  'spring-soft': MOTION_SPRING_SOFT,
} as const;

export type MotionDurationKey = keyof typeof MOTION_DURATIONS_MS;
export type MotionEasingKey = keyof typeof MOTION_EASINGS;
