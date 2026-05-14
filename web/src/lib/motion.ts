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
