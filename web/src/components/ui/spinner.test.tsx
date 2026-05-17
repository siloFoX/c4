import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './spinner';

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('<Spinner>', () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders role="status" with the default aria-label="Loading"', () => {
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-label')).toBe('Loading');
  });

  it('renders the ring + animate-spin class by default', () => {
    render(<Spinner />);
    const ring = document.querySelector('[data-section="spinner-ring"]');
    expect(ring).not.toBeNull();
    expect(ring).toHaveClass('animate-spin');
  });

  it('renders the text fallback when textOnly=true', () => {
    render(<Spinner textOnly label="Saving..." />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toBeNull();
    const text = document.querySelector('[data-section="spinner-text"]');
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe('Saving...');
  });

  it('renders the text fallback under reduced motion', () => {
    mockReducedMotion(true);
    render(<Spinner label="Loading" />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="spinner-text"]'),
    ).not.toBeNull();
  });

  it('data-reduced-motion="false" when motion is allowed', () => {
    render(<Spinner />);
    expect(
      screen.getByRole('status').getAttribute('data-reduced-motion'),
    ).toBe('false');
  });

  it('data-reduced-motion="true" + data-render="text" under reduced motion', () => {
    mockReducedMotion(true);
    render(<Spinner />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('data-reduced-motion')).toBe('true');
    expect(node.getAttribute('data-render')).toBe('text');
  });

  it('data-render="ring" when motion is allowed + textOnly=false', () => {
    render(<Spinner />);
    expect(
      screen.getByRole('status').getAttribute('data-render'),
    ).toBe('ring');
  });

  it('default size="md" applies the h-5 w-5 ring dimensions', () => {
    render(<Spinner />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toHaveClass('h-5');
  });

  it('size="xs" applies the h-3 w-3 ring + text-[10px] label', () => {
    render(<Spinner size="xs" textOnly />);
    expect(
      document.querySelector('[data-section="spinner-text"]'),
    ).toHaveClass('text-[10px]');
  });

  it('size="lg" applies the h-6 w-6 ring + text-base label', () => {
    render(<Spinner size="lg" />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toHaveClass('h-6');
  });

  it('exposes data-size attr on the wrapper', () => {
    const { rerender } = render(<Spinner size="xs" />);
    expect(screen.getByRole('status').getAttribute('data-size')).toBe('xs');
    rerender(<Spinner size="lg" />);
    expect(screen.getByRole('status').getAttribute('data-size')).toBe('lg');
  });

  it('default tone="neutral" applies the muted-foreground border', () => {
    render(<Spinner />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toHaveClass('border-muted-foreground/40');
  });

  it('tone="accent" applies the primary border', () => {
    render(<Spinner tone="accent" />);
    expect(
      document.querySelector('[data-section="spinner-ring"]'),
    ).toHaveClass('border-primary');
  });

  it('exposes data-tone attr on the wrapper', () => {
    const { rerender } = render(<Spinner tone="neutral" />);
    expect(screen.getByRole('status').getAttribute('data-tone')).toBe(
      'neutral',
    );
    rerender(<Spinner tone="accent" />);
    expect(screen.getByRole('status').getAttribute('data-tone')).toBe(
      'accent',
    );
  });

  it('exposes data-section="spinner" on the wrapper', () => {
    render(<Spinner />);
    expect(
      screen.getByRole('status').getAttribute('data-section'),
    ).toBe('spinner');
  });

  it('uses the custom label via aria-label', () => {
    render(<Spinner label="Saving notes" />);
    expect(
      screen.getByRole('status').getAttribute('aria-label'),
    ).toBe('Saving notes');
  });

  it('merges caller className onto the wrapper', () => {
    render(<Spinner className="my-extra" />);
    expect(screen.getByRole('status')).toHaveClass('my-extra');
  });

  it('forwards extra HTML attributes onto the wrapper', () => {
    render(<Spinner data-testid="s" id="my-spinner" />);
    expect(screen.getByTestId('s').getAttribute('id')).toBe('my-spinner');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(Spinner.displayName).toBe('Spinner');
  });

  it('does not throw when SSR-style document is unavailable on first render', () => {
    // jsdom defines window.matchMedia; render path returns immediately.
    expect(() => render(<Spinner />)).not.toThrow();
  });
});
