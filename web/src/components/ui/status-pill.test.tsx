import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StatusPill, type StatusPillStatus } from './status-pill';

// Module-level matchMedia stub so useReducedMotion() reads a
// predictable value per test. Default: motion is NOT reduced.
let reduceMotion = false;

beforeEach(() => {
  reduceMotion = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduceMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<StatusPill>', () => {
  it('renders the default label for the given status', () => {
    render(<StatusPill status="online" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('renders a custom label override', () => {
    render(<StatusPill status="busy" label="Running task" />);
    expect(screen.getByText('Running task')).toBeInTheDocument();
    expect(screen.queryByText('Busy')).toBeNull();
  });

  it('tags the root with role=status and a "Status: <label>" aria-label', () => {
    render(<StatusPill status="idle" />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('aria-label')).toBe('Status: Idle');
  });

  it('caller-provided aria-label wins over the default', () => {
    render(<StatusPill status="online" aria-label="Worker is up" />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('aria-label')).toBe('Worker is up');
  });

  it('exposes data-section + data-status on the root', () => {
    const { container } = render(<StatusPill status="error" />);
    const pill = container.querySelector('[data-section="status-pill"]');
    expect(pill).not.toBeNull();
    expect(pill!.getAttribute('data-status')).toBe('error');
  });

  it('exposes the size on data-size', () => {
    const { container } = render(<StatusPill status="online" size="sm" />);
    const pill = container.querySelector('[data-section="status-pill"]');
    expect(pill!.getAttribute('data-size')).toBe('sm');
  });

  it('size="sm" maps to the smaller height/padding tokens', () => {
    render(<StatusPill status="online" size="sm" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('h-5');
    expect(pill.className).toContain('text-[10px]');
  });

  it('default size (md) maps to the larger height/padding tokens', () => {
    render(<StatusPill status="online" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('h-6');
    expect(pill.className).toContain('text-xs');
  });

  it('online status applies the success color trio', () => {
    render(<StatusPill status="online" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('bg-success/10');
    expect(pill.className).toContain('text-success');
    expect(pill.className).toContain('border-success/40');
  });

  it('busy status applies the warning color trio', () => {
    render(<StatusPill status="busy" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('bg-warning/10');
    expect(pill.className).toContain('text-warning');
  });

  it('error status applies the destructive color trio', () => {
    render(<StatusPill status="error" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('bg-destructive/10');
    expect(pill.className).toContain('text-destructive');
  });

  it('idle status uses the muted neutral palette', () => {
    render(<StatusPill status="idle" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('bg-muted');
    expect(pill.className).toContain('text-muted-foreground');
  });

  it('offline status uses the card neutral palette', () => {
    render(<StatusPill status="offline" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('bg-card');
    expect(pill.className).toContain('text-muted-foreground');
  });

  it('renders the default per-status icon (svg)', () => {
    const { container } = render(<StatusPill status="online" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('accepts a custom icon override', () => {
    render(
      <StatusPill
        status="online"
        icon={<span data-testid="custom-glyph">!</span>}
      />,
    );
    expect(screen.getByTestId('custom-glyph')).toBeInTheDocument();
  });

  it('icon={null} suppresses the icon entirely', () => {
    const { container } = render(
      <StatusPill status="online" icon={null} />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('pulse flips data-pulse to "true" for an active state (online)', () => {
    render(<StatusPill status="online" pulse />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('data-pulse')).toBe('true');
  });

  it('pulse flips data-pulse to "true" for the busy state', () => {
    render(<StatusPill status="busy" pulse />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('data-pulse')).toBe('true');
  });

  it('pulse is ignored for an inactive state (idle)', () => {
    render(<StatusPill status="idle" pulse />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('data-pulse')).toBe('false');
  });

  it('pulse is ignored for offline / error states', () => {
    const { rerender } = render(<StatusPill status="offline" pulse />);
    expect(screen.getByRole('status').getAttribute('data-pulse')).toBe('false');
    rerender(<StatusPill status="error" pulse />);
    expect(screen.getByRole('status').getAttribute('data-pulse')).toBe('false');
  });

  it('pulse is suppressed when prefers-reduced-motion is enabled', () => {
    reduceMotion = true;
    render(<StatusPill status="online" pulse />);
    const pill = screen.getByRole('status');
    expect(pill.getAttribute('data-pulse')).toBe('false');
  });

  it('renders the pulse halo (data-status-pill-pulse) when active', () => {
    const { container } = render(<StatusPill status="online" pulse />);
    expect(
      container.querySelector('[data-status-pill-pulse="true"]'),
    ).not.toBeNull();
  });

  it('does NOT render the pulse halo when pulse is off', () => {
    const { container } = render(<StatusPill status="online" />);
    expect(
      container.querySelector('[data-status-pill-pulse="true"]'),
    ).toBeNull();
  });

  it('busy + pulse + no-reduced-motion adds animate-spin to the loader glyph', () => {
    const { container } = render(<StatusPill status="busy" pulse />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').toContain('animate-spin');
  });

  it('busy + pulse + reduced-motion does NOT spin the loader glyph', () => {
    reduceMotion = true;
    const { container } = render(<StatusPill status="busy" pulse />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain('animate-spin');
  });

  it('label={null} suppresses the label and falls back to default aria-name', () => {
    render(<StatusPill status="online" label={null} />);
    expect(screen.queryByText('Online')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'Status: Online',
    );
  });

  it('all 5 status keys render without throwing', () => {
    const all: StatusPillStatus[] = ['online', 'busy', 'idle', 'offline', 'error'];
    all.forEach((s) => {
      const { unmount } = render(<StatusPill status={s} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    });
  });

  it('merges caller className with the built-in pill classes', () => {
    render(<StatusPill status="online" className="custom-pill" />);
    const pill = screen.getByRole('status');
    expect(pill.className).toContain('custom-pill');
    expect(pill.className).toContain('rounded-full');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<StatusPill status="online" data-testid="my-pill" />);
    expect(screen.getByTestId('my-pill')).toBeInTheDocument();
  });

  it('forwards a ref to the span root', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<StatusPill status="online" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
