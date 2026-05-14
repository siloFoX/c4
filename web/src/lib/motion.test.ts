import { describe, expect, it } from 'vitest';
import { motion, motionClass } from './motion';

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
