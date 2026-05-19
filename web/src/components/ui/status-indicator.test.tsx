import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  STATUS_INDICATOR_KIND_CLASS,
  StatusIndicator,
  getStatusIndicatorAriaLabel,
} from './status-indicator';

afterEach(() => {
  cleanup();
});

describe('STATUS_INDICATOR_KIND_CLASS', () => {
  it('declares all six kinds', () => {
    expect(Object.keys(STATUS_INDICATOR_KIND_CLASS).sort()).toEqual(
      ['error', 'info', 'neutral', 'pending', 'success', 'warning'],
    );
  });
});

describe('getStatusIndicatorAriaLabel', () => {
  it('returns ariaLabel when supplied', () => {
    expect(
      getStatusIndicatorAriaLabel('Online', 'success', 'whatever'),
    ).toBe('Online');
  });

  it('falls back to string label when no ariaLabel', () => {
    expect(
      getStatusIndicatorAriaLabel(undefined, 'success', 'Active'),
    ).toBe('Active');
  });

  it('trims whitespace check on label fallback', () => {
    // Empty / whitespace-only labels should NOT be picked.
    expect(
      getStatusIndicatorAriaLabel(undefined, 'success', '   '),
    ).toBe('Status: success');
  });

  it('falls back to kind word when label is not string or empty', () => {
    expect(
      getStatusIndicatorAriaLabel(undefined, 'warning', null),
    ).toBe('Status: warning');
  });
});

describe('StatusIndicator component', () => {
  it('renders role=status by default', () => {
    render(<StatusIndicator />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('aria-live="polite" + aria-atomic="true" by default', () => {
    render(<StatusIndicator />);
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root).toHaveAttribute('aria-atomic', 'true');
  });

  it('decorative=true drops the role + aria-live + aria-label', () => {
    const { container } = render(
      <StatusIndicator decorative />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    const root = container.querySelector(
      '[data-section="status-indicator"]',
    );
    expect(root).not.toHaveAttribute('aria-live');
    expect(root).not.toHaveAttribute('aria-label');
  });

  it('default ariaLabel falls back to "Status: <kind>"', () => {
    render(<StatusIndicator kind="success" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Status: success',
    );
  });

  it('string label becomes the aria-label fallback', () => {
    render(<StatusIndicator label="Online" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Online',
    );
  });

  it('explicit ariaLabel wins over label', () => {
    render(
      <StatusIndicator label="Online" ariaLabel="Currently online" />,
    );
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Currently online',
    );
  });

  it('renders the label slot when supplied', () => {
    render(<StatusIndicator label="Connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('omits the label slot when no label', () => {
    const { container } = render(<StatusIndicator />);
    expect(
      container.querySelector(
        '[data-section="status-indicator-label"]',
      ),
    ).toBeNull();
  });

  it('renders the dot by default', () => {
    const { container } = render(<StatusIndicator />);
    expect(
      container.querySelector(
        '[data-section="status-indicator-dot"]',
      ),
    ).toBeInTheDocument();
  });

  it('hideDot=true omits the dot', () => {
    const { container } = render(<StatusIndicator hideDot />);
    expect(
      container.querySelector(
        '[data-section="status-indicator-dot"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="status-indicator-dot-wrapper"]',
      ),
    ).toBeNull();
  });

  it('data-kind mirrors the kind prop', () => {
    const { rerender } = render(<StatusIndicator kind="success" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-kind',
      'success',
    );
    rerender(<StatusIndicator kind="error" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-kind',
      'error',
    );
  });

  it('data-size mirrors the size prop', () => {
    const { rerender } = render(<StatusIndicator size="sm" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-size',
      'sm',
    );
    rerender(<StatusIndicator size="lg" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-size',
      'lg',
    );
  });

  it('dot color class matches kind tokens', () => {
    const { container } = render(<StatusIndicator kind="success" />);
    const dot = container.querySelector(
      '[data-section="status-indicator-dot"]',
    );
    expect(dot?.className).toContain('bg-emerald-500');
  });

  it('label text color class matches kind tokens', () => {
    render(<StatusIndicator kind="warning" label="Heating" />);
    const label = screen.getByText('Heating');
    expect(label.className).toContain('text-amber-500');
  });

  it('dot size matches size variant', () => {
    const { container, rerender } = render(
      <StatusIndicator size="sm" />,
    );
    const dotSm = container.querySelector(
      '[data-section="status-indicator-dot"]',
    );
    expect(dotSm?.className).toContain('h-1.5');
    expect(dotSm?.className).toContain('w-1.5');

    rerender(<StatusIndicator size="lg" />);
    const dotLg = container.querySelector(
      '[data-section="status-indicator-dot"]',
    );
    expect(dotLg?.className).toContain('h-2.5');
    expect(dotLg?.className).toContain('w-2.5');
  });

  it('pulse=true renders the ping element', () => {
    const { container } = render(<StatusIndicator pulse />);
    expect(
      container.querySelector(
        '[data-section="status-indicator-pulse"]',
      ),
    ).toBeInTheDocument();
  });

  it('pulse=false omits the ping element', () => {
    const { container } = render(<StatusIndicator pulse={false} />);
    expect(
      container.querySelector(
        '[data-section="status-indicator-pulse"]',
      ),
    ).toBeNull();
  });

  it('pulse="subtle" lowers ping opacity', () => {
    const { container } = render(<StatusIndicator pulse="subtle" />);
    const ping = container.querySelector(
      '[data-section="status-indicator-pulse"]',
    );
    expect(ping?.className).toContain('opacity-30');
    expect(ping?.className).not.toContain('opacity-60');
  });

  it('pulse=true uses motion-safe ping animation', () => {
    const { container } = render(<StatusIndicator pulse />);
    const ping = container.querySelector(
      '[data-section="status-indicator-pulse"]',
    );
    expect(ping?.className).toContain('motion-safe:animate-ping');
  });

  it('data-pulse reflects the prop value', () => {
    const { rerender } = render(<StatusIndicator pulse />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-pulse',
      'true',
    );
    rerender(<StatusIndicator pulse={false} />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-pulse',
      'false',
    );
    rerender(<StatusIndicator pulse="subtle" />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-pulse',
      'subtle',
    );
  });

  it('data-decorative + data-hide-dot mirror props', () => {
    const { rerender } = render(<StatusIndicator />);
    let root = screen.queryByRole('status');
    expect(root).toHaveAttribute('data-decorative', 'false');
    expect(root).toHaveAttribute('data-hide-dot', 'false');
    rerender(<StatusIndicator decorative hideDot />);
    const { container } = render(<StatusIndicator decorative hideDot />);
    const decoratedRoot = container.querySelector(
      '[data-section="status-indicator"]',
    );
    expect(decoratedRoot).toHaveAttribute('data-decorative', 'true');
    expect(decoratedRoot).toHaveAttribute('data-hide-dot', 'true');
  });

  it('forwards extra HTML attributes to the root', () => {
    render(
      <StatusIndicator data-testid="custom" />,
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('honors className', () => {
    render(<StatusIndicator className="ml-2" />);
    expect(
      screen.getByRole('status').className,
    ).toContain('ml-2');
  });

  it('exposes a stable displayName', () => {
    expect(StatusIndicator.displayName).toBe('StatusIndicator');
  });

  it('forwards refs to the root span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<StatusIndicator ref={ref} />);
    expect(ref.current?.getAttribute('role')).toBe('status');
  });

  it('each kind has dot + ping + text class tokens', () => {
    for (const kind of Object.keys(STATUS_INDICATOR_KIND_CLASS)) {
      const cls = STATUS_INDICATOR_KIND_CLASS[
        kind as keyof typeof STATUS_INDICATOR_KIND_CLASS
      ];
      expect(typeof cls.dot).toBe('string');
      expect(cls.dot.length).toBeGreaterThan(0);
      expect(typeof cls.ping).toBe('string');
      expect(cls.ping.length).toBeGreaterThan(0);
      expect(typeof cls.text).toBe('string');
      expect(cls.text.length).toBeGreaterThan(0);
    }
  });
});
