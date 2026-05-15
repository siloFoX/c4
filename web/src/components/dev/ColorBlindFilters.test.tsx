import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ColorBlindFilters, {
  COLOR_BLIND_MATRICES,
  type ColorBlindType,
} from './ColorBlindFilters';

// (v1.11.247, TODO 11.229) The colour-blindness simulation
// filters are referenced by CSS classes (`.cb-protanopia` etc.)
// via `filter: url(#cb-*)`. Those URLs are stable contracts -- if
// the id changes the CSS rules in web/src/index.css silently lose
// their effect. The tests below pin the id triple and the matrix
// content so a future refactor cannot silently break the
// DesignSystem audit surface.

describe('<ColorBlindFilters>', () => {
  it('renders three named filters with the canonical cb-* ids', () => {
    const { container } = render(<ColorBlindFilters />);
    const ids = Array.from(container.querySelectorAll('filter')).map((f) => f.id);
    expect(ids).toEqual(['cb-protanopia', 'cb-deuteranopia', 'cb-tritanopia']);
  });

  it('mounts an aria-hidden zero-sized SVG so it does not steal layout space', () => {
    const { container } = render(<ColorBlindFilters />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    const style = (svg as SVGElement).getAttribute('style') ?? '';
    expect(style).toMatch(/position:\s*absolute/);
    expect(style).toMatch(/width:\s*0/);
    expect(style).toMatch(/height:\s*0/);
  });

  it('feColorMatrix carries the canonical Machado values', () => {
    const { container } = render(<ColorBlindFilters />);
    const matrices = Array.from(container.querySelectorAll('feColorMatrix'));
    expect(matrices.length).toBe(3);
    const [p, d, t] = matrices;
    expect(p?.getAttribute('values')).toBe(COLOR_BLIND_MATRICES.protanopia);
    expect(d?.getAttribute('values')).toBe(COLOR_BLIND_MATRICES.deuteranopia);
    expect(t?.getAttribute('values')).toBe(COLOR_BLIND_MATRICES.tritanopia);
  });

  it('honours a custom idPrefix so multiple mounts can coexist', () => {
    const { container } = render(<ColorBlindFilters idPrefix="audit" />);
    const ids = Array.from(container.querySelectorAll('filter')).map((f) => f.id);
    expect(ids).toEqual(['audit-protanopia', 'audit-deuteranopia', 'audit-tritanopia']);
  });
});

describe('COLOR_BLIND_MATRICES', () => {
  it('exposes the three named dichromacies', () => {
    const keys = Object.keys(COLOR_BLIND_MATRICES).sort() as ColorBlindType[];
    expect(keys).toEqual(['deuteranopia', 'protanopia', 'tritanopia']);
  });

  it('each matrix string has 20 numbers (a 4x5 colour matrix)', () => {
    for (const key of Object.keys(COLOR_BLIND_MATRICES) as ColorBlindType[]) {
      const numbers = COLOR_BLIND_MATRICES[key].split(/\s+/).filter(Boolean);
      expect(numbers.length, `${key} matrix should have 20 entries`).toBe(20);
      for (const n of numbers) {
        expect(Number.isFinite(Number(n)), `${key} entry "${n}" parses as a finite number`).toBe(true);
      }
    }
  });
});
