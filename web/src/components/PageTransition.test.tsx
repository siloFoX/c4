import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import PageTransition from './PageTransition';

// (v1.11.175) jsdom does not implement matchMedia, so each test that
// cares about prefers-reduced-motion stubs it explicitly. Tests that
// drive the animation timeline rely on vi.useFakeTimers + the
// requestAnimationFrame polyfill that vi installs alongside fake
// timers (advanceTimersByTime steps both rAF + setTimeout).

function installMatchMedia(reducedMotion: boolean) {
  const impl = (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(impl),
  });
}

describe('PageTransition', () => {
  beforeEach(() => {
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders children', () => {
    const { getByText } = render(
      <PageTransition routeKey="/a">
        <div>Page A</div>
      </PageTransition>,
    );
    expect(getByText('Page A')).toBeInTheDocument();
  });

  it('renders both old and new content during a routeKey change', () => {
    vi.useFakeTimers();
    const { rerender, container, getByText } = render(
      <PageTransition routeKey="/a" duration={200}>
        <div>Page A</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition routeKey="/b" duration={200}>
        <div>Page B</div>
      </PageTransition>,
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(getByText('Page A')).toBeInTheDocument();
    expect(getByText('Page B')).toBeInTheDocument();
    expect(
      container.querySelector('[data-page-transition-layer="outgoing"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-page-transition-layer="incoming"]'),
    ).not.toBeNull();
  });

  it('drops the outgoing layer after `duration` ms', () => {
    vi.useFakeTimers();
    const { rerender, container, queryByText, getByText } = render(
      <PageTransition routeKey="/a" duration={200}>
        <div>Page A</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition routeKey="/b" duration={200}>
        <div>Page B</div>
      </PageTransition>,
    );
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(queryByText('Page A')).toBeNull();
    expect(getByText('Page B')).toBeInTheDocument();
    expect(
      container.querySelector('[data-page-transition-layer="outgoing"]'),
    ).toBeNull();
  });

  it('prefers-reduced-motion swaps content with no transient overlap', () => {
    installMatchMedia(true);
    vi.useFakeTimers();
    const { rerender, container, queryByText, getByText } = render(
      <PageTransition routeKey="/a" duration={200}>
        <div>Page A</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition routeKey="/b" duration={200}>
        <div>Page B</div>
      </PageTransition>,
    );
    expect(queryByText('Page A')).toBeNull();
    expect(getByText('Page B')).toBeInTheDocument();
    expect(
      container.querySelector('[data-transitioning="false"]'),
    ).not.toBeNull();
  });

  it('forwardRef exposes the outer container', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <PageTransition routeKey="/a" ref={ref}>
        <div>Page A</div>
      </PageTransition>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes aria-live=polite on the container', () => {
    const { container } = render(
      <PageTransition routeKey="/a">
        <div>Page A</div>
      </PageTransition>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('merges className onto the container', () => {
    const { container } = render(
      <PageTransition routeKey="/a" className="custom-class">
        <div>Page A</div>
      </PageTransition>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('custom-class');
    expect(root.className).toContain('relative');
  });

  it('direction="vertical" applies the vertical transform class', () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <PageTransition routeKey="/a" direction="vertical" duration={200}>
        <div>Page A</div>
      </PageTransition>,
    );
    rerender(
      <PageTransition routeKey="/b" direction="vertical" duration={200}>
        <div>Page B</div>
      </PageTransition>,
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute('data-direction')).toBe('vertical');
    const outgoing = container.querySelector(
      '[data-page-transition-layer="outgoing"]',
    );
    expect(outgoing?.className ?? '').toMatch(/-translate-y-2|translate-y-/);
  });
});
