import { describe, it, expect } from 'vitest';
import {
  LOADING_MOTION,
  getLoadingMotionClass,
  getLoadingMotionStyle,
} from './loading-motion';

describe('LOADING_MOTION contract', () => {
  it('exposes a skeleton spec and a spinner spec', () => {
    expect(Object.keys(LOADING_MOTION).sort()).toEqual(['skeleton', 'spinner']);
  });

  it('pins skeleton to 1800ms ease-standard (cubic-bezier)', () => {
    expect(LOADING_MOTION.skeleton.durationMs).toBe(1800);
    expect(LOADING_MOTION.skeleton.easing).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('pins spinner to 1200ms linear', () => {
    expect(LOADING_MOTION.spinner.durationMs).toBe(1200);
    expect(LOADING_MOTION.spinner.easing).toBe('linear');
  });

  it('keeps the skeleton period a clean 3:2 ratio over the spinner period', () => {
    // Documented harmony: the shimmer feels slow + deliberate
    // while the spinner completes 1.5 rotations per pulse. Locking
    // the ratio in a test means a future tweak has to update this
    // line, which forces the author to re-check the rationale.
    const skeleton = LOADING_MOTION.skeleton.durationMs;
    const spinner = LOADING_MOTION.spinner.durationMs;
    expect(skeleton / spinner).toBe(1.5);
  });

  it('uses durations that are clean multiples of 200ms', () => {
    expect(LOADING_MOTION.skeleton.durationMs % 200).toBe(0);
    expect(LOADING_MOTION.spinner.durationMs % 200).toBe(0);
  });
});

describe('getLoadingMotionStyle', () => {
  it('returns matching duration + easing CSS for skeleton when motion is allowed', () => {
    const style = getLoadingMotionStyle('skeleton', false);
    expect(style.animationDuration).toBe('1800ms');
    expect(style.animationTimingFunction).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('returns matching duration + easing CSS for spinner when motion is allowed', () => {
    const style = getLoadingMotionStyle('spinner', false);
    expect(style.animationDuration).toBe('1200ms');
    expect(style.animationTimingFunction).toBe('linear');
  });

  it('returns an empty object when reduced-motion is preferred', () => {
    expect(getLoadingMotionStyle('skeleton', true)).toEqual({});
    expect(getLoadingMotionStyle('spinner', true)).toEqual({});
  });
});

describe('getLoadingMotionClass', () => {
  it('returns the Tailwind animation utility for each kind when motion is allowed', () => {
    expect(getLoadingMotionClass('skeleton', false)).toBe('animate-pulse');
    expect(getLoadingMotionClass('spinner', false)).toBe('animate-spin');
  });

  it('returns the empty string when reduced-motion is preferred', () => {
    expect(getLoadingMotionClass('skeleton', true)).toBe('');
    expect(getLoadingMotionClass('spinner', true)).toBe('');
  });
});
