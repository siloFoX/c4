import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StickyFilterBar } from './sticky-filter-bar';

// (v1.11.261, TODO 11.243) StickyFilterBar unit coverage. The
// production behaviour is driven by IntersectionObserver, which
// jsdom does not provide. The tests stub it so each case can fire
// observer callbacks deterministically.

interface ObserverEntry {
  isIntersecting: boolean;
}

type ObserverCallback = (entries: ObserverEntry[]) => void;

let observerCallbacks: ObserverCallback[];
let lastObserverInit: IntersectionObserverInit | undefined;

beforeEach(() => {
  observerCallbacks = [];
  lastObserverInit = undefined;
  // Mock IntersectionObserver. Each construction stores its
  // callback so the test body can fire it.
  class MockIO {
    constructor(
      callback: ObserverCallback,
      init?: IntersectionObserverInit,
    ) {
      observerCallbacks.push(callback);
      lastObserverInit = init;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
  }
  (globalThis as unknown as { IntersectionObserver: typeof MockIO }).IntersectionObserver = MockIO;
});

afterEach(() => {
  // Restore the prior global state so a sibling test file isn't
  // surprised by our shim.
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  vi.restoreAllMocks();
});

function fireIntersect(isIntersecting: boolean) {
  act(() => {
    for (const cb of observerCallbacks) cb([{ isIntersecting }]);
  });
}

describe('<StickyFilterBar>', () => {
  it('renders the children verbatim', () => {
    render(
      <StickyFilterBar>
        <span data-testid="payload">hello</span>
      </StickyFilterBar>,
    );
    expect(screen.getByTestId('payload')).toBeInTheDocument();
  });

  it('renders a zero-height sentinel above the sticky wrapper', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    const sentinel = screen.getByTestId('sticky-filter-bar-sentinel');
    expect(sentinel).toBeInTheDocument();
    expect(sentinel).toHaveClass('h-0');
    expect(sentinel.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the wrapper with data-section="sticky-filter-bar"', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    expect(
      document.querySelector('[data-section="sticky-filter-bar"]'),
    ).not.toBeNull();
  });

  it('starts with data-pinned="false" before any intersection fires', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = document.querySelector('[data-section="sticky-filter-bar"]')!;
    expect(bar.getAttribute('data-pinned')).toBe('false');
  });

  it('flips data-pinned to "true" when the sentinel reports not-intersecting', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    fireIntersect(false);
    const bar = document.querySelector('[data-section="sticky-filter-bar"]')!;
    expect(bar.getAttribute('data-pinned')).toBe('true');
  });

  it('flips data-pinned back to "false" when the sentinel returns into view', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    fireIntersect(false);
    fireIntersect(true);
    const bar = document.querySelector('[data-section="sticky-filter-bar"]')!;
    expect(bar.getAttribute('data-pinned')).toBe('false');
  });

  it('applies shadow-md only while pinned (back to shadow-none when un-pinned)', () => {
    render(
      <StickyFilterBar>
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = document.querySelector('[data-section="sticky-filter-bar"]')!;
    expect(bar.className).toContain('shadow-none');
    expect(bar.className).not.toContain('shadow-md');
    fireIntersect(false);
    expect(bar.className).toContain('shadow-md');
    fireIntersect(true);
    expect(bar.className).toContain('shadow-none');
  });

  it('passes a number topOffset through to the style.top as px', () => {
    render(
      <StickyFilterBar topOffset={48}>
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = document.querySelector(
      '[data-section="sticky-filter-bar"]',
    ) as HTMLElement;
    expect(bar.style.top).toBe('48px');
  });

  it('passes a string topOffset through verbatim (e.g. CSS calc / var)', () => {
    render(
      <StickyFilterBar topOffset="var(--app-header-h)">
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = document.querySelector(
      '[data-section="sticky-filter-bar"]',
    ) as HTMLElement;
    expect(bar.style.top).toBe('var(--app-header-h)');
  });

  it('respects a custom zIndex prop', () => {
    render(
      <StickyFilterBar zIndex={42}>
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = document.querySelector(
      '[data-section="sticky-filter-bar"]',
    ) as HTMLElement;
    expect(bar.style.zIndex).toBe('42');
  });

  it('wires the IntersectionObserver rootMargin from topOffset (negative top offset)', () => {
    render(
      <StickyFilterBar topOffset={64}>
        <span>x</span>
      </StickyFilterBar>,
    );
    expect(lastObserverInit?.rootMargin).toBe('-64px 0px 0px 0px');
  });

  it('forwards arbitrary HTML attributes (data-testid, aria-label, className)', () => {
    render(
      <StickyFilterBar
        className="custom-class"
        data-testid="my-filter-bar"
        aria-label="Filters"
      >
        <span>x</span>
      </StickyFilterBar>,
    );
    const bar = screen.getByTestId('my-filter-bar');
    expect(bar.getAttribute('aria-label')).toBe('Filters');
    expect(bar.className).toContain('custom-class');
    expect(bar.className).toContain('sticky');
  });

  it('survives an environment without IntersectionObserver (SSR-safe path)', () => {
    delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    expect(() =>
      render(
        <StickyFilterBar>
          <span data-testid="payload-fallback">x</span>
        </StickyFilterBar>,
      ),
    ).not.toThrow();
    // In the fallback path the bar still renders, just never flips
    // to data-pinned="true".
    expect(screen.getByTestId('payload-fallback')).toBeInTheDocument();
    const bar = document.querySelector('[data-section="sticky-filter-bar"]')!;
    expect(bar.getAttribute('data-pinned')).toBe('false');
  });
});
