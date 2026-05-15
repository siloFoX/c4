import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SearchEmpty,
  SessionsEmpty,
  ILLUSTRATION_SIZE_TOKENS,
  resolveIllustrationSize,
} from './index';

// (v1.11.233, patch 11.215) Test suite for the two new component-
// scope empty-state illustrations introduced in this release plus
// the shared size-token resolver. Existing v1.11.84 illustration
// tests live in illustrations.test.tsx and continue to pass.

const NEW = [
  ['SearchEmpty', SearchEmpty],
  ['SessionsEmpty', SessionsEmpty],
] as const;

describe('new illustrations (v1.11.233)', () => {
  it.each(NEW)('%s renders an svg with the shared 240x180 viewBox', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 240 180');
  });

  it.each(NEW)('%s defaults to md (96) when size prop is omitted', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('96');
    expect(svg?.getAttribute('height')).toBe('96');
  });

  it.each(NEW)("%s resolves size='sm' to width/height=64", (_name, Comp) => {
    const { container } = render(<Comp size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('height')).toBe('64');
  });

  it.each(NEW)("%s resolves size='lg' to width/height=128", (_name, Comp) => {
    const { container } = render(<Comp size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('128');
    expect(svg?.getAttribute('height')).toBe('128');
  });

  it.each(NEW)('%s still accepts a numeric size for backwards compat', (_name, Comp) => {
    const { container } = render(<Comp size={120} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('120');
    expect(svg?.getAttribute('height')).toBe('120');
  });

  it.each(NEW)('%s is decorative (aria-hidden) by default', (_name, Comp) => {
    const { container } = render(<Comp />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it.each(NEW)('%s forwards className to the root svg', (_name, Comp) => {
    const { container } = render(<Comp className="text-muted-foreground" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('text-muted-foreground')).toBe(true);
  });

  it.each(NEW)('%s flips to role="img" with aria-label when aria-hidden=false', (_name, Comp) => {
    const { container } = render(<Comp aria-hidden={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
  });

  it('SearchEmpty includes a magnifying-glass circle and a stack of list rows', () => {
    const { container } = render(<SearchEmpty />);
    expect(container.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(3);
  });

  it('SessionsEmpty includes three stacked terminal cards and a no-connection slash', () => {
    const { container } = render(<SessionsEmpty />);
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(3);
    const dashed = Array.from(container.querySelectorAll('svg line')).filter((el) =>
      el.getAttribute('stroke-dasharray'),
    );
    expect(dashed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('illustration size tokens', () => {
  it('exposes sm/md/lg as 64/96/128', () => {
    expect(ILLUSTRATION_SIZE_TOKENS).toEqual({ sm: 64, md: 96, lg: 128 });
  });

  it('resolveIllustrationSize returns the token value for named sizes', () => {
    expect(resolveIllustrationSize('sm', 160)).toBe(64);
    expect(resolveIllustrationSize('md', 160)).toBe(96);
    expect(resolveIllustrationSize('lg', 160)).toBe(128);
  });

  it('resolveIllustrationSize passes through numeric values verbatim', () => {
    expect(resolveIllustrationSize(72, 160)).toBe(72);
  });

  it('resolveIllustrationSize falls back when size is undefined', () => {
    expect(resolveIllustrationSize(undefined, 160)).toBe(160);
    expect(resolveIllustrationSize(undefined, 96)).toBe(96);
  });
});
