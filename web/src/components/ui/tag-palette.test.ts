import { describe, it, expect } from 'vitest';
import {
  TAG_PALETTE,
  type TagPaletteEntry,
  type TagPaletteId,
  getTagTone,
  pickTagTone,
} from './tag-palette';

describe('TAG_PALETTE', () => {
  it('exposes exactly 8 entries', () => {
    expect(TAG_PALETTE).toHaveLength(8);
  });

  it('declares the canonical id set in a stable order', () => {
    const ids = TAG_PALETTE.map((e) => e.id);
    expect(ids).toEqual([
      'brand',
      'success',
      'warning',
      'info',
      'danger',
      'accent',
      'magenta',
      'neutral',
    ]);
  });

  it('keeps every id unique', () => {
    const ids = TAG_PALETTE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('classifies the 5 signal hues as `status` and the 3 categorical hues as `accent`', () => {
    const byKind: Record<TagPaletteEntry['kind'], TagPaletteId[]> = {
      status: [],
      accent: [],
    };
    for (const e of TAG_PALETTE) byKind[e.kind].push(e.id);
    expect(byKind.status).toEqual(['brand', 'success', 'warning', 'info', 'danger']);
    expect(byKind.accent).toEqual(['accent', 'magenta', 'neutral']);
  });

  it('exposes the four surface variants for every entry', () => {
    for (const e of TAG_PALETTE) {
      expect(typeof e.subtle).toBe('string');
      expect(typeof e.solid).toBe('string');
      expect(typeof e.outline).toBe('string');
      expect(typeof e.dot).toBe('string');
      expect(e.subtle.length).toBeGreaterThan(0);
      expect(e.solid.length).toBeGreaterThan(0);
      expect(e.outline.length).toBeGreaterThan(0);
      expect(e.dot.length).toBeGreaterThan(0);
    }
  });

  it('routes every status entry through a shadcn / chart token (no ad-hoc Tailwind hue)', () => {
    // The audit goal of TODO 11.224: tag colours must not reach
    // for Tailwind's raw palette (`bg-green-500`, `bg-blue-500`,
    // ...). Every dot class should map to a named token.
    const allowed = new Set([
      'bg-primary',
      'bg-success',
      'bg-warning',
      'bg-info',
      'bg-destructive',
      'bg-chart-2',
      'bg-chart-5',
      'bg-muted-foreground',
    ]);
    for (const e of TAG_PALETTE) {
      expect(allowed.has(e.dot)).toBe(true);
    }
  });
});

describe('getTagTone', () => {
  it('returns the requested entry by id', () => {
    expect(getTagTone('success').id).toBe('success');
    expect(getTagTone('magenta').id).toBe('magenta');
  });

  it('returns the neutral entry for unknown ids', () => {
    expect(getTagTone('nope').id).toBe('neutral');
  });

  it('returns the neutral entry for null / undefined', () => {
    expect(getTagTone(null).id).toBe('neutral');
    expect(getTagTone(undefined).id).toBe('neutral');
  });
});

describe('pickTagTone', () => {
  it('is deterministic for the same seed', () => {
    const a = pickTagTone('reviewer');
    const b = pickTagTone('reviewer');
    expect(a.id).toBe(b.id);
  });

  it('produces different tones for at least two distinct seeds', () => {
    // We do not assert a specific mapping per seed (the hash is
    // an implementation detail), but the palette has 8 slots so
    // two seeds collide at most ~1/8 of the time. Sampling a
    // handful of common tag names is enough to cover the path.
    const samples = ['meeting', 'design', 'implement', 'review', 'audit', 'test', 'deploy', 'docs'];
    const ids = new Set(samples.map((s) => pickTagTone(s).id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('accepts numeric seeds', () => {
    expect(pickTagTone(42).id).toBe(pickTagTone('42').id);
  });

  it('falls back to neutral for the empty string', () => {
    expect(pickTagTone('').id).toBe('neutral');
  });
});
