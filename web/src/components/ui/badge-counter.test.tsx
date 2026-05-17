import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeCounter } from './badge-counter';

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('<BadgeCounter>', () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing for count=0 by default (numeric variant)', () => {
    const { container } = render(<BadgeCounter count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the count for count > 0', () => {
    render(<BadgeCounter count={5} data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveTextContent('5');
  });

  it('renders count=0 when showZero is true', () => {
    render(<BadgeCounter count={0} showZero data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveTextContent('0');
  });

  it('renders "99+" when count > default max', () => {
    render(<BadgeCounter count={142} data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveTextContent('99+');
  });

  it('honours a custom max ceiling', () => {
    render(<BadgeCounter count={15} max={9} data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveTextContent('9+');
  });

  it('does NOT show overflow plus when count === max (boundary)', () => {
    render(<BadgeCounter count={99} data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveTextContent('99');
    expect(screen.getByTestId('bc')).not.toHaveTextContent('+');
  });

  it('sets data-overflow=true when overflowing, false otherwise', () => {
    const { rerender } = render(
      <BadgeCounter count={50} data-testid="bc" />,
    );
    expect(screen.getByTestId('bc').getAttribute('data-overflow')).toBe(
      'false',
    );
    rerender(<BadgeCounter count={100} data-testid="bc" />);
    expect(screen.getByTestId('bc').getAttribute('data-overflow')).toBe('true');
  });

  it('exposes data-section / data-variant / data-tone selectors', () => {
    render(<BadgeCounter count={3} tone="danger" data-testid="bc" />);
    const el = screen.getByTestId('bc');
    expect(el.getAttribute('data-section')).toBe('badge-counter');
    expect(el.getAttribute('data-variant')).toBe('numeric');
    expect(el.getAttribute('data-tone')).toBe('danger');
  });

  it('renders the dot variant with no text content', () => {
    render(
      <BadgeCounter
        count={4}
        variant="dot"
        tone="accent"
        data-testid="bc"
      />,
    );
    const el = screen.getByTestId('bc');
    expect(el.textContent).toBe('');
    expect(el.getAttribute('data-variant')).toBe('dot');
    expect(el.getAttribute('data-tone')).toBe('accent');
  });

  it('dot variant ALWAYS renders, even at count=0 with no showZero', () => {
    render(
      <BadgeCounter
        count={0}
        variant="dot"
        data-testid="bc"
      />,
    );
    expect(screen.getByTestId('bc')).toBeInTheDocument();
  });

  it('sets role="status" so SR announces the count change', () => {
    render(<BadgeCounter count={2} data-testid="bc" />);
    expect(screen.getByTestId('bc').getAttribute('role')).toBe('status');
  });

  it('defaults aria-label to the displayed count', () => {
    render(<BadgeCounter count={7} data-testid="bc" />);
    expect(screen.getByTestId('bc').getAttribute('aria-label')).toBe('7');
  });

  it('overrides aria-label with srLabel when set', () => {
    render(
      <BadgeCounter
        count={3}
        srLabel="3 unread notifications"
        data-testid="bc"
      />,
    );
    expect(screen.getByTestId('bc').getAttribute('aria-label')).toBe(
      '3 unread notifications',
    );
  });

  it('aria-label for overflow uses the displayed "X+" form', () => {
    render(<BadgeCounter count={250} data-testid="bc" />);
    expect(screen.getByTestId('bc').getAttribute('aria-label')).toBe('99+');
  });

  it('applies the pulse animation class when pulse=true and motion is allowed', () => {
    mockReducedMotion(false);
    render(<BadgeCounter count={1} pulse data-testid="bc" />);
    const el = screen.getByTestId('bc');
    expect(el).toHaveClass('animate-pulse');
    expect(el.getAttribute('data-pulse')).toBe('true');
  });

  it('skips the pulse animation when prefers-reduced-motion is reduce', () => {
    mockReducedMotion(true);
    render(<BadgeCounter count={1} pulse data-testid="bc" />);
    const el = screen.getByTestId('bc');
    expect(el).not.toHaveClass('animate-pulse');
    expect(el.getAttribute('data-pulse')).toBe('false');
  });

  it('applies the size class for "sm"', () => {
    render(<BadgeCounter count={1} size="sm" data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveClass('h-[14px]');
  });

  it('applies the size class for "lg"', () => {
    render(<BadgeCounter count={1} size="lg" data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveClass('h-[20px]');
  });

  it('applies the tone class for "danger"', () => {
    render(<BadgeCounter count={1} tone="danger" data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveClass('text-destructive');
  });

  it('applies the tone class for "success"', () => {
    render(<BadgeCounter count={1} tone="success" data-testid="bc" />);
    expect(screen.getByTestId('bc')).toHaveClass('text-success');
  });

  it('merges caller-supplied className onto the surface', () => {
    render(
      <BadgeCounter count={1} className="ml-2 my-extra" data-testid="bc" />,
    );
    expect(screen.getByTestId('bc')).toHaveClass('ml-2');
    expect(screen.getByTestId('bc')).toHaveClass('my-extra');
  });

  it('exposes a stable displayName for devtools', () => {
    expect(BadgeCounter.displayName).toBe('BadgeCounter');
  });

  it('numeric variant renders nothing when count is undefined and showZero is off', () => {
    const { container } = render(<BadgeCounter />);
    expect(container.firstChild).toBeNull();
  });

  it('forwards extra HTML attributes onto the surface', () => {
    render(<BadgeCounter count={1} id="my-badge" data-testid="bc" />);
    expect(screen.getByTestId('bc').getAttribute('id')).toBe('my-badge');
  });
});
