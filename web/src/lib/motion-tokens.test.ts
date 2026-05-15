import { describe, it, expect } from 'vitest';
import {
  MOTION_DURATIONS_MS,
  MOTION_DURATION_DELIBERATE_MS,
  MOTION_DURATION_FAST_MS,
  MOTION_DURATION_INSTANT_MS,
  MOTION_DURATION_NORMAL_MS,
  MOTION_DURATION_SLOW_MS,
  MOTION_EASE_EMPHASIZED,
  MOTION_EASE_IN,
  MOTION_EASE_OUT,
  MOTION_EASE_STANDARD,
  MOTION_EASINGS,
  MOTION_SPRING_SNAPPY,
  MOTION_SPRING_SOFT,
} from './motion-tokens';

describe('motion-tokens duration scale', () => {
  it('exposes the canonical 5-step duration scale (80/150/200/300/500)', () => {
    expect(MOTION_DURATION_INSTANT_MS).toBe(80);
    expect(MOTION_DURATION_FAST_MS).toBe(150);
    expect(MOTION_DURATION_NORMAL_MS).toBe(200);
    expect(MOTION_DURATION_SLOW_MS).toBe(300);
    expect(MOTION_DURATION_DELIBERATE_MS).toBe(500);
  });

  it('orders the durations monotonically', () => {
    const ladder = [
      MOTION_DURATION_INSTANT_MS,
      MOTION_DURATION_FAST_MS,
      MOTION_DURATION_NORMAL_MS,
      MOTION_DURATION_SLOW_MS,
      MOTION_DURATION_DELIBERATE_MS,
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]! > ladder[i - 1]!).toBe(true);
    }
  });

  it('record exposes the same 5 keys as the named exports', () => {
    expect(Object.keys(MOTION_DURATIONS_MS).sort()).toEqual([
      'deliberate',
      'fast',
      'instant',
      'normal',
      'slow',
    ]);
    expect(MOTION_DURATIONS_MS.instant).toBe(MOTION_DURATION_INSTANT_MS);
    expect(MOTION_DURATIONS_MS.fast).toBe(MOTION_DURATION_FAST_MS);
    expect(MOTION_DURATIONS_MS.normal).toBe(MOTION_DURATION_NORMAL_MS);
    expect(MOTION_DURATIONS_MS.slow).toBe(MOTION_DURATION_SLOW_MS);
    expect(MOTION_DURATIONS_MS.deliberate).toBe(MOTION_DURATION_DELIBERATE_MS);
  });
});

describe('motion-tokens easing scale', () => {
  it('exposes the four named cubic-bezier easings', () => {
    expect(MOTION_EASE_STANDARD).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    expect(MOTION_EASE_OUT).toBe('cubic-bezier(0, 0, 0.2, 1)');
    expect(MOTION_EASE_IN).toBe('cubic-bezier(0.4, 0, 1, 1)');
    expect(MOTION_EASE_EMPHASIZED).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('exposes the two spring presets with overshoot', () => {
    // Snappy: y4 > 1 confirms the overshoot beyond the final
    // value (a cubic-bezier with y4=1.05 spends ~5% beyond
    // before settling). Soft does the same with a 1.56 peak.
    expect(MOTION_SPRING_SNAPPY).toBe('cubic-bezier(0.2, 0.8, 0.2, 1.05)');
    expect(MOTION_SPRING_SOFT).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)');
  });

  it('record exposes 6 easing keys (4 standard + 2 spring)', () => {
    expect(Object.keys(MOTION_EASINGS).sort()).toEqual([
      'emphasized',
      'in',
      'out',
      'spring-snappy',
      'spring-soft',
      'standard',
    ]);
  });

  it('every easing entry is a non-empty cubic-bezier string', () => {
    for (const value of Object.values(MOTION_EASINGS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      expect(value.startsWith('cubic-bezier(')).toBe(true);
      expect(value.endsWith(')')).toBe(true);
    }
  });
});
