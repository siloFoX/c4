// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_FOCUS_RING,
  FOCUS_RING_DEFAULT,
  FOCUS_RING_INSET,
  FOCUS_RING_SUBTLE,
} from './focus-ring';

describe('FOCUS_RING_DEFAULT', () => {
  it('matches the canonical 2px primary ring with offset background', () => {
    expect(FOCUS_RING_DEFAULT).toContain('focus-visible:outline-none');
    expect(FOCUS_RING_DEFAULT).toContain('focus-visible:ring-2');
    expect(FOCUS_RING_DEFAULT).toContain('focus-visible:ring-primary');
    expect(FOCUS_RING_DEFAULT).toContain('focus-visible:ring-offset-2');
    expect(FOCUS_RING_DEFAULT).toContain(
      'focus-visible:ring-offset-background',
    );
  });
});

describe('FOCUS_RING_INSET', () => {
  it('uses ring-inset (no ring-offset)', () => {
    expect(FOCUS_RING_INSET).toContain('focus-visible:ring-inset');
    expect(FOCUS_RING_INSET).not.toContain('focus-visible:ring-offset-2');
  });

  it('keeps 2px ring + primary color', () => {
    expect(FOCUS_RING_INSET).toContain('focus-visible:ring-2');
    expect(FOCUS_RING_INSET).toContain('focus-visible:ring-primary');
  });
});

describe('FOCUS_RING_SUBTLE', () => {
  it('uses 1px ring + half-opacity primary + 1px offset', () => {
    expect(FOCUS_RING_SUBTLE).toContain('focus-visible:ring-1');
    expect(FOCUS_RING_SUBTLE).toContain('focus-visible:ring-primary/50');
    expect(FOCUS_RING_SUBTLE).toContain('focus-visible:ring-offset-1');
  });
});

describe('APP_SHELL_FOCUS_RING alias', () => {
  it('is identical to FOCUS_RING_DEFAULT', () => {
    expect(APP_SHELL_FOCUS_RING).toBe(FOCUS_RING_DEFAULT);
  });
});
