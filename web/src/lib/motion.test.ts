// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import {
  MOTION_STAGGER_MAX_MS,
  MOTION_STAGGER_STEP_MS,
  motion,
  motionClass,
  motionStaggerStyle,
  useMotionClass,
  useMotionStaggerStyle,
  useReducedMotion,
} from './motion';

describe('motion', () => {
  it('exposes the eight pre-baked motion presets', () => {
    const keys = Object.keys(motion).sort();
    expect(keys).toEqual([
      'fadeIn',
      'fadeOut',
      'scaleIn',
      'scaleOut',
      'slideInLeft',
      'slideInRight',
      'slideOutLeft',
      'slideOutRight',
    ]);
  });

  it('every "*In" preset uses animate-in and every "*Out" preset uses animate-out', () => {
    for (const [key, value] of Object.entries(motion)) {
      if (key.includes('Out')) {
        expect(value).toMatch(/\banimate-out\b/);
      } else {
        expect(value).toMatch(/\banimate-in\b/);
      }
    }
  });

  it('fadeIn / fadeOut carry the expected fade primitives', () => {
    expect(motion.fadeIn).toMatch(/fade-in/);
    expect(motion.fadeOut).toMatch(/fade-out/);
  });

  it('every preset carries a duration-* utility', () => {
    for (const value of Object.values(motion)) {
      expect(value).toMatch(/\bduration-\d+\b/);
    }
  });
});

describe('motionClass', () => {
  it('returns the animated class when reducedMotion is false', () => {
    expect(motionClass('fadeIn', false)).toBe(motion.fadeIn);
    expect(motionClass('scaleIn', false)).toBe(motion.scaleIn);
  });

  it('returns the fallback when reducedMotion is true', () => {
    expect(motionClass('fadeIn', true, 'opacity-100')).toBe('opacity-100');
  });

  it("returns '' when reducedMotion is true and no fallback is provided", () => {
    expect(motionClass('slideInRight', true)).toBe('');
  });

  it('ignores fallback when reducedMotion is false', () => {
    expect(motionClass('fadeIn', false, 'opacity-100')).toBe(motion.fadeIn);
  });
});

// (v1.11.323, TODO 11.305) New canonical bundle exports:
// `useReducedMotion` re-export + `useMotionClass` hook.

function setMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe('useReducedMotion (re-exported from lib/motion)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('returns false when prefers-reduced-motion does not match', () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when prefers-reduced-motion matches', () => {
    setMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });
});

describe('useMotionClass', () => {
  beforeEach(() => {
    setMatchMedia(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('returns the animated class when prefers-reduced-motion is OFF', () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useMotionClass('fadeIn'));
    expect(result.current).toBe(motion.fadeIn);
  });

  it('returns "" when prefers-reduced-motion is ON and no fallback', () => {
    setMatchMedia(true);
    const { result } = renderHook(() => useMotionClass('slideInRight'));
    expect(result.current).toBe('');
  });

  it('returns the fallback when prefers-reduced-motion is ON', () => {
    setMatchMedia(true);
    const { result } = renderHook(() =>
      useMotionClass('fadeIn', 'opacity-100'),
    );
    expect(result.current).toBe('opacity-100');
  });

  it('ignores the fallback when prefers-reduced-motion is OFF', () => {
    setMatchMedia(false);
    const { result } = renderHook(() =>
      useMotionClass('scaleIn', 'opacity-100'),
    );
    expect(result.current).toBe(motion.scaleIn);
  });

  it('matches the stateless motionClass output for every key', () => {
    setMatchMedia(false);
    for (const key of Object.keys(motion) as (keyof typeof motion)[]) {
      const { result } = renderHook(() => useMotionClass(key));
      expect(result.current).toBe(motionClass(key, false));
    }
  });
});

// (v1.11.348, TODO 11.330) Stagger helpers.

describe('motionStaggerStyle', () => {
  it('returns an empty object when reducedMotion is true', () => {
    expect(motionStaggerStyle(0, true)).toEqual({});
    expect(motionStaggerStyle(5, true)).toEqual({});
  });

  it('returns an empty object for index 0 (no delay on the first item)', () => {
    expect(motionStaggerStyle(0, false)).toEqual({});
  });

  it('returns a per-index animation-delay when reducedMotion is false', () => {
    const out = motionStaggerStyle(3, false);
    expect(out).toEqual({ animationDelay: `${3 * MOTION_STAGGER_STEP_MS}ms` });
  });

  it('honours a caller-supplied step value', () => {
    expect(motionStaggerStyle(2, false, 100)).toEqual({
      animationDelay: '200ms',
    });
  });

  it('clamps the delay to MOTION_STAGGER_MAX_MS', () => {
    const out = motionStaggerStyle(1000, false);
    expect(out).toEqual({ animationDelay: `${MOTION_STAGGER_MAX_MS}ms` });
  });

  it('returns an empty object for negative or NaN indexes (defensive)', () => {
    expect(motionStaggerStyle(-1, false)).toEqual({});
    expect(motionStaggerStyle(Number.NaN, false)).toEqual({});
    expect(motionStaggerStyle(Number.POSITIVE_INFINITY, false)).toEqual({});
  });
});

describe('useMotionStaggerStyle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('returns the staggered delay when prefers-reduced-motion is OFF', () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useMotionStaggerStyle(2));
    expect(result.current).toEqual({
      animationDelay: `${2 * MOTION_STAGGER_STEP_MS}ms`,
    });
  });

  it('returns an empty object when prefers-reduced-motion is ON', () => {
    setMatchMedia(true);
    const { result } = renderHook(() => useMotionStaggerStyle(3));
    expect(result.current).toEqual({});
  });

  it('honours a caller-supplied step', () => {
    setMatchMedia(false);
    const { result } = renderHook(() => useMotionStaggerStyle(1, 80));
    expect(result.current).toEqual({ animationDelay: '80ms' });
  });
});

