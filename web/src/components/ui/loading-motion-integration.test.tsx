import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Spinner from '../Spinner';
import { Skeleton, TextLine, Rect, Circle, AvatarShape } from './skeleton';
import { LOADING_MOTION } from './loading-motion';

// (v1.11.243, TODO 11.225) Cross-cutting reduced-motion regression
// suite. Confirms that the Spinner + every Skeleton shape variant
// honours `prefers-reduced-motion: reduce` by dropping the
// Tailwind animation utility (`animate-pulse` / `animate-spin`)
// and emitting the `data-motion-reduced` attribute. Also asserts
// that the unified loading-motion contract drives both
// `animation-duration` and `animation-timing-function` inline
// style overrides when motion is allowed.

const originalMatchMedia = window.matchMedia;

function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduce : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

describe('loading-motion integration: Spinner', () => {
  it('emits animate-spin + the spinner duration/easing inline style when motion is allowed', () => {
    installMatchMedia(false);
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
    expect((svg as SVGElement).style.animationDuration).toBe(
      `${LOADING_MOTION.spinner.durationMs}ms`,
    );
    expect((svg as SVGElement).style.animationTimingFunction).toBe(
      LOADING_MOTION.spinner.easing,
    );
    expect(svg?.hasAttribute('data-motion-reduced')).toBe(false);
  });

  it('drops animate-spin + the inline override and flags data-motion-reduced when reduce is preferred', () => {
    installMatchMedia(true);
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('animate-spin')).toBe(false);
    expect((svg as SVGElement).style.animationDuration).toBe('');
    expect((svg as SVGElement).style.animationTimingFunction).toBe('');
    expect(svg?.getAttribute('data-motion-reduced')).toBe('');
  });
});

describe('loading-motion integration: Skeleton', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  it('Skeleton (rect variant) emits animate-pulse + the skeleton duration/easing inline style', () => {
    const { container } = render(<Skeleton data-testid="sk" />);
    const node = container.querySelector('[data-testid="sk"]') as HTMLElement;
    expect(node.classList.contains('animate-pulse')).toBe(true);
    expect(node.style.animationDuration).toBe(
      `${LOADING_MOTION.skeleton.durationMs}ms`,
    );
    expect(node.style.animationTimingFunction).toBe(
      LOADING_MOTION.skeleton.easing,
    );
  });

  it('Skeleton (multi-line text variant) emits the contract on every line', () => {
    const { container } = render(<Skeleton variant="text" lines={3} />);
    const lines = container.querySelectorAll('[data-skeleton-line]');
    expect(lines.length).toBe(3);
    for (const line of Array.from(lines)) {
      expect(line.classList.contains('animate-pulse')).toBe(true);
      expect((line as HTMLElement).style.animationDuration).toBe('1800ms');
    }
  });

  it('Skeleton (page variant) emits the contract on header + body lines', () => {
    const { container } = render(<Skeleton variant="page" />);
    const lines = container.querySelectorAll('[data-skeleton-page]');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of Array.from(lines)) {
      expect(line.classList.contains('animate-pulse')).toBe(true);
      expect((line as HTMLElement).style.animationDuration).toBe('1800ms');
    }
  });

  it('TextLine / Rect / Circle / AvatarShape each respect the shared contract', () => {
    const { container } = render(
      <div>
        <TextLine data-testid="tl" />
        <Rect data-testid="rect" />
        <Circle data-testid="circle" />
        <AvatarShape data-testid="avatar" />
      </div>,
    );
    for (const testid of ['tl', 'rect', 'circle', 'avatar']) {
      const node = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
      expect(node.classList.contains('animate-pulse')).toBe(true);
      expect(node.style.animationDuration).toBe('1800ms');
      expect(node.style.animationTimingFunction).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
    }
  });

  it('drops animate-pulse + the inline override and flags data-motion-reduced when reduce is preferred', () => {
    installMatchMedia(true);
    const { container } = render(<Skeleton data-testid="sk" />);
    const node = container.querySelector('[data-testid="sk"]') as HTMLElement;
    expect(node.classList.contains('animate-pulse')).toBe(false);
    expect(node.style.animationDuration).toBe('');
    expect(node.style.animationTimingFunction).toBe('');
    expect(node.getAttribute('data-motion-reduced')).toBe('');
  });

  it('reduce flag drops the animation across every shape sub-component too', () => {
    installMatchMedia(true);
    const { container } = render(
      <div>
        <TextLine data-testid="tl" />
        <Rect data-testid="rect" />
        <Circle data-testid="circle" />
        <AvatarShape data-testid="avatar" />
      </div>,
    );
    for (const testid of ['tl', 'rect', 'circle', 'avatar']) {
      const node = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement;
      expect(node.classList.contains('animate-pulse')).toBe(false);
      expect(node.style.animationDuration).toBe('');
      expect(node.getAttribute('data-motion-reduced')).toBe('');
    }
  });
});
