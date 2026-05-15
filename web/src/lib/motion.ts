// (v1.11.253, TODO 11.235) Tailwind-class shortcuts for the
// canonical animation library (used by Dialog + Popover + every
// surface that wants a one-liner). The duration values below
// align with the central motion scale in
// `web/src/styles/motion.css` / `web/src/lib/motion-tokens.ts`:
//   duration-150 -> --motion-duration-fast
//   duration-200 -> --motion-duration-normal
//   duration-100 -> ~--motion-duration-instant (Tailwind has no
//                   80ms class; 100ms reads as the same beat
//                   without registering as a separate step).
// Inline-style callers (Toast) reach for the tokens directly so
// their numbers stay in lockstep across this layer.
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

export function motionClass(
  key: MotionKey,
  reducedMotion: boolean,
  fallback?: string,
): string {
  if (reducedMotion) return fallback ?? '';
  return motion[key];
}
