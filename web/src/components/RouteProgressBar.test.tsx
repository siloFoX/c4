import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteProgressBar, type RouteProgressHandle } from './RouteProgressBar';

type Listener = (e: MediaQueryListEvent) => void;

interface MockMQL {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: (type: 'change', l: Listener) => void;
  removeEventListener: (type: 'change', l: Listener) => void;
  addListener: (l: Listener) => void;
  removeListener: (l: Listener) => void;
  dispatchEvent: (e: Event) => boolean;
}

function installMatchMedia(reducedMotion: boolean) {
  const listeners = new Set<Listener>();
  const mql: MockMQL = {
    matches: reducedMotion,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_t, l) => {
      listeners.add(l);
    },
    removeEventListener: (_t, l) => {
      listeners.delete(l);
    },
    addListener: (l) => listeners.add(l),
    removeListener: (l) => listeners.delete(l),
    dispatchEvent: () => true,
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mql),
  });
}

function getFill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-testid="route-progress-bar-fill"]');
  if (!el) throw new Error('fill not found');
  return el as HTMLElement;
}

function scaleXFromTransform(transform: string): number {
  const match = /scaleX\(([^)]+)\)/.exec(transform);
  return match ? Number(match[1]) : NaN;
}

describe('RouteProgressBar', () => {
  beforeEach(() => {
    installMatchMedia(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders hidden by default with aria-hidden and zero progress', () => {
    const { container } = render(<RouteProgressBar />);
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('data-visible')).toBe('false');
    expect(root.className).toContain('opacity-0');
    expect(scaleXFromTransform(getFill(container).style.transform)).toBe(0);
  });

  it('imperative start() shows the bar and animates toward the trickle ceiling', () => {
    const ref = createRef<RouteProgressHandle>();
    const { container } = render(<RouteProgressBar ref={ref} />);
    act(() => {
      ref.current!.start();
    });
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    expect(root.getAttribute('data-visible')).toBe('true');
    expect(root.className).toContain('opacity-100');
    const initial = scaleXFromTransform(getFill(container).style.transform);
    expect(initial).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const after = scaleXFromTransform(getFill(container).style.transform);
    expect(after).toBeGreaterThan(initial);
    expect(after).toBeLessThanOrEqual(0.9);
  });

  it('imperative done() completes to 100% then hides after fade', () => {
    const ref = createRef<RouteProgressHandle>();
    const { container } = render(<RouteProgressBar ref={ref} />);
    act(() => {
      ref.current!.start();
    });
    act(() => {
      ref.current!.done();
    });
    expect(scaleXFromTransform(getFill(container).style.transform)).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    expect(root.getAttribute('data-visible')).toBe('false');
    expect(root.className).toContain('opacity-0');
  });

  it('routeKey change auto-triggers start->done cycle', () => {
    const { container, rerender } = render(<RouteProgressBar routeKey="a" />);
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    // first render with a routeKey should NOT trigger (no transition yet)
    expect(root.getAttribute('data-visible')).toBe('false');

    rerender(<RouteProgressBar routeKey="b" />);
    expect(root.getAttribute('data-visible')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(root.getAttribute('data-visible')).toBe('false');
  });

  it('respects prefers-reduced-motion: skips trickle, shows full then hides', () => {
    installMatchMedia(true);
    const ref = createRef<RouteProgressHandle>();
    const { container } = render(<RouteProgressBar ref={ref} />);
    act(() => {
      ref.current!.start();
    });
    expect(scaleXFromTransform(getFill(container).style.transform)).toBe(1);
    act(() => {
      ref.current!.done();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    expect(root.getAttribute('data-visible')).toBe('false');
  });

  it('color prop applies the right color class', () => {
    const { container, rerender } = render(<RouteProgressBar color="success" />);
    expect(getFill(container).className).toContain('bg-success');
    rerender(<RouteProgressBar color="info" />);
    expect(getFill(container).className).toContain('bg-info');
    rerender(<RouteProgressBar color="danger" />);
    expect(getFill(container).className).toContain('bg-destructive');
  });

  it('merges className onto the root element', () => {
    const { container } = render(<RouteProgressBar className="custom-marker" />);
    const root = container.querySelector('[data-testid="route-progress-bar"]') as HTMLElement;
    expect(root.className).toContain('custom-marker');
  });

  it('forwardRef exposes a handle with start() and done()', () => {
    const ref = createRef<RouteProgressHandle>();
    render(<RouteProgressBar ref={ref} />);
    expect(typeof ref.current?.start).toBe('function');
    expect(typeof ref.current?.done).toBe('function');
  });
});
