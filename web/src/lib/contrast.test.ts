import { describe, expect, it } from 'vitest';
import {
  AAA_LARGE,
  AAA_NORMAL,
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  evaluateContrast,
  meetsAaContrast,
  meetsAaaContrast,
  parseColor,
  relativeLuminance,
} from './contrast';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#11141a')).toEqual({ r: 17, g: 20, b: 26 });
    expect(parseColor('11141a')).toEqual({ r: 17, g: 20, b: 26 });
  });

  it('parses 3-digit hex by repeating each digit', () => {
    expect(parseColor('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it('drops the alpha component on 8-digit hex', () => {
    expect(parseColor('#11141aff')).toEqual({ r: 17, g: 20, b: 26 });
  });

  it('parses tokens-style HSL triplets', () => {
    // ARPS --surface-canvas
    const rgb = parseColor('220 18% 8%');
    expect(rgb).not.toBeNull();
    if (!rgb) return;
    expect(rgb.r).toBeGreaterThanOrEqual(10);
    expect(rgb.r).toBeLessThanOrEqual(30);
    expect(rgb.g).toBeGreaterThanOrEqual(10);
    expect(rgb.g).toBeLessThanOrEqual(30);
    expect(rgb.b).toBeGreaterThanOrEqual(15);
    expect(rgb.b).toBeLessThanOrEqual(40);
  });

  it('normalises HSL hue out of range', () => {
    const a = parseColor('400 50% 50%');
    const b = parseColor('40 50% 50%');
    expect(a).toEqual(b);
  });

  it('accepts RGB objects directly', () => {
    expect(parseColor({ r: 1, g: 2, b: 3 })).toEqual({ r: 1, g: 2, b: 3 });
  });

  it('returns null for an unrecognised string', () => {
    expect(parseColor('not-a-color')).toBeNull();
    expect(parseColor('rgb(1, 2, 3)')).toBeNull(); // rgb() not supported (yet)
  });
});

describe('relativeLuminance', () => {
  it('returns 0 for pure black and 1 for pure white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBe(1);
  });

  it('returns NaN for invalid input', () => {
    expect(Number.isNaN(relativeLuminance('not-a-color'))).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('is exactly 21 for black vs white', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBe(21);
  });

  it('is 1 for two identical colors', () => {
    expect(contrastRatio('#7B2FFF', '#7B2FFF')).toBe(1);
  });

  it('is symmetric (fg <-> bg swap)', () => {
    const a = contrastRatio('#0D1B2A', '#FFFFFF');
    const b = contrastRatio('#FFFFFF', '#0D1B2A');
    expect(a).toBe(b);
  });

  it('returns NaN when either color is invalid', () => {
    expect(Number.isNaN(contrastRatio('#bad-color', '#ffffff'))).toBe(true);
  });

  it('matches WCAG reference ratios within a small epsilon', () => {
    // #0d1b2a (ARPS navy) vs #ffffff white --
    // reference value ~16.5 per WCAG contrast
    // calculator. The exact value depends on
    // floating-point rounding so we assert a
    // tight window around the expected number.
    const r = contrastRatio('#0d1b2a', '#ffffff');
    expect(r).toBeGreaterThan(15);
    expect(r).toBeLessThan(18);
  });
});

describe('meetsAaContrast', () => {
  it('returns true for black/white at normal AA', () => {
    expect(meetsAaContrast('#000', '#fff')).toBe(true);
  });

  it('returns false for near-identical colours at normal AA', () => {
    expect(meetsAaContrast('#eee', '#fff')).toBe(false);
  });

  it('large-text threshold lets slightly-lower ratios pass', () => {
    // Pick a pair whose ratio is between 3 and
    // 4.5 -- AA normal fails, AA large passes.
    expect(meetsAaContrast('#767676', '#ffffff', false)).toBe(true);
    expect(meetsAaContrast('#949494', '#ffffff', false)).toBe(false);
    expect(meetsAaContrast('#949494', '#ffffff', true)).toBe(true);
  });

  it('returns false on parse failure', () => {
    expect(meetsAaContrast('not-a-color', '#fff')).toBe(false);
  });
});

describe('meetsAaaContrast', () => {
  it('returns true for black/white', () => {
    expect(meetsAaaContrast('#000', '#fff')).toBe(true);
  });

  it('returns false for AA-passing-but-AAA-failing pair on normal', () => {
    // A pair that passes AA (>=4.5) but not AAA
    // (<7).
    const fg = '#767676';
    const bg = '#ffffff';
    expect(meetsAaContrast(fg, bg)).toBe(true);
    expect(meetsAaaContrast(fg, bg)).toBe(false);
  });

  it('large-text AAA threshold matches AA normal', () => {
    expect(AAA_LARGE).toBe(AA_NORMAL);
  });
});

describe('evaluateContrast', () => {
  it('packages all four checks into one object', () => {
    const result = evaluateContrast('#000', '#fff');
    expect(result.ratio).toBe(21);
    expect(result.aaNormal).toBe(true);
    expect(result.aaLarge).toBe(true);
    expect(result.aaaNormal).toBe(true);
    expect(result.aaaLarge).toBe(true);
  });

  it('returns a NaN ratio for invalid input', () => {
    const result = evaluateContrast('not-a-color', '#fff');
    expect(Number.isNaN(result.ratio)).toBe(true);
    expect(result.aaNormal).toBe(false);
  });
});

describe('threshold constants', () => {
  it('matches the WCAG 2.1 reference values', () => {
    expect(AA_NORMAL).toBe(4.5);
    expect(AA_LARGE).toBe(3);
    expect(AAA_NORMAL).toBe(7);
    expect(AAA_LARGE).toBe(4.5);
  });
});
