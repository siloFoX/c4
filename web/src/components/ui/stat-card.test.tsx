import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { StatCard, getStatCardTrendDirection } from './stat-card';

describe('<StatCard>', () => {
  it('renders the label text', () => {
    render(<StatCard label="Active" value={3} noAnimation />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a numeric value (with noAnimation to skip the count-up)', () => {
    render(<StatCard label="Workers" value={42} noAnimation />);
    const node = screen.getByText('42');
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute('data-stat-value');
  });

  it('exposes the final value via data-stat-final regardless of animation phase', () => {
    render(<StatCard label="Total" value={99} noAnimation />);
    const valueNode = screen.getByText('99');
    expect(valueNode).toHaveAttribute('data-stat-final', '99');
  });

  it('renders string values as-is (no count-up)', () => {
    render(<StatCard label="Last seen" value="5m ago" />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('renders the hint when provided', () => {
    render(
      <StatCard label="Errors" value={0} hint="last 24h" noAnimation />,
    );
    expect(screen.getByText('last 24h')).toBeInTheDocument();
  });

  it('renders an icon slot when provided', () => {
    render(
      <StatCard
        label="Up"
        value={1}
        noAnimation
        icon={<svg data-testid="stat-icon" />}
      />,
    );
    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('shows the loading skeleton (role=status) and hides the value', () => {
    render(<StatCard label="Pending" value={5} loading />);
    expect(
      screen.getByRole('status', { name: 'Pending loading' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('applies the wrapper data-stat-card attribute', () => {
    const { container } = render(
      <StatCard label="x" value={1} noAnimation />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('data-stat-card');
  });

  it('merges caller className with the built-in wrapper classes', () => {
    const { container } = render(
      <StatCard label="x" value={1} noAnimation className="my-stat" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('my-stat');
    expect(wrapper).toHaveClass('rounded-xl');
    expect(wrapper).toHaveClass('border');
  });

  it('forwards a ref to the underlying <div>', () => {
    const ref = createRef<HTMLDivElement>();
    render(<StatCard ref={ref} label="x" value={1} noAnimation />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards arbitrary HTML attributes (data-* / aria-*) to the wrapper', () => {
    render(
      <StatCard
        label="x"
        value={1}
        noAnimation
        data-testid="card-1"
        aria-label="active workers"
      />,
    );
    const node = screen.getByTestId('card-1');
    expect(node).toHaveAttribute('aria-label', 'active workers');
  });

  it('exposes a stable displayName', () => {
    expect(StatCard.displayName).toBe('StatCard');
  });

  it('renders no trend element when the trend prop is omitted', () => {
    const { container } = render(
      <StatCard label="Foo" value={1} noAnimation />,
    );
    expect(container.querySelector('[data-stat-trend]')).toBeNull();
  });

  it('renders a positive trend with text-success and an up arrow', () => {
    const { container } = render(
      <StatCard label="Up" value={1} noAnimation trend={{ value: 12 }} />,
    );
    const node = container.querySelector('[data-stat-trend]') as HTMLElement;
    expect(node).not.toBeNull();
    expect(node).toHaveClass('text-success');
    const arrow = node.querySelector('[data-stat-trend-arrow]');
    expect(arrow?.textContent).toBe('▲');
    expect(node).toHaveTextContent('12%');
  });

  it('renders a negative trend with text-destructive and a down arrow', () => {
    const { container } = render(
      <StatCard label="Down" value={1} noAnimation trend={{ value: -7 }} />,
    );
    const node = container.querySelector('[data-stat-trend]') as HTMLElement;
    expect(node).toHaveClass('text-destructive');
    const arrow = node.querySelector('[data-stat-trend-arrow]');
    expect(arrow?.textContent).toBe('▼');
    expect(node).toHaveTextContent('7%');
  });

  it('renders a zero trend with text-muted-foreground', () => {
    const { container } = render(
      <StatCard label="Flat" value={1} noAnimation trend={{ value: 0 }} />,
    );
    const node = container.querySelector('[data-stat-trend]') as HTMLElement;
    expect(node).toHaveClass('text-muted-foreground');
    expect(node).toHaveTextContent('0%');
  });

  it('renders the trend.label when provided', () => {
    render(
      <StatCard
        label="Up"
        value={1}
        noAnimation
        trend={{ value: 5, label: 'vs last hour' }}
      />,
    );
    expect(screen.getByText('vs last hour')).toBeInTheDocument();
  });

  it('renders a sparkline svg with a polyline when sparkline data is provided', () => {
    const { container } = render(
      <StatCard
        label="Spark"
        value={1}
        noAnimation
        sparkline={[1, 4, 2, 8, 3]}
      />,
    );
    const svg = container.querySelector('svg.sparkline');
    expect(svg).not.toBeNull();
    const polyline = svg?.querySelector('polyline');
    expect(polyline).not.toBeNull();
    expect(polyline?.getAttribute('points') || '').toMatch(/\d/);
  });

  it('renders no sparkline svg when the sparkline prop is omitted', () => {
    const { container } = render(
      <StatCard label="NoSpark" value={1} noAnimation />,
    );
    expect(container.querySelector('svg.sparkline')).toBeNull();
  });

  it('renders no sparkline svg when the sparkline array is empty', () => {
    const { container } = render(
      <StatCard label="EmptySpark" value={1} noAnimation sparkline={[]} />,
    );
    expect(container.querySelector('svg.sparkline')).toBeNull();
  });

  // -- v1.11.424 (TODO 11.406) extensions ----------------------

  it('exposes data-section + data-tone + data-loading on the root', () => {
    const { container } = render(
      <StatCard
        label="Active"
        value={3}
        noAnimation
        tone="primary"
      />,
    );
    const root = container.querySelector('[data-section="stat-card"]');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-tone', 'primary');
    expect(root).toHaveAttribute('data-loading', 'false');
  });

  it('data-loading flips to "true" when loading', () => {
    const { container } = render(
      <StatCard label="L" value={3} noAnimation loading />,
    );
    expect(
      container.querySelector('[data-section="stat-card"]'),
    ).toHaveAttribute('data-loading', 'true');
  });

  it('comparison renders with default "vs." prefix', () => {
    render(
      <StatCard
        label="Now"
        value={120}
        noAnimation
        comparison={{ value: 100 }}
      />,
    );
    expect(screen.getByText('vs.')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('comparison honors a custom label', () => {
    render(
      <StatCard
        label="Now"
        value={120}
        noAnimation
        comparison={{ value: 100, label: 'target' }}
      />,
    );
    expect(screen.getByText('target')).toBeInTheDocument();
  });

  it('comparison block carries data-stat-comparison-value attr', () => {
    const { container } = render(
      <StatCard
        label="Now"
        value={120}
        noAnimation
        comparison={{ value: 'prev:100' }}
      />,
    );
    const cmp = container.querySelector(
      '[data-section="stat-card-comparison"]',
    );
    expect(cmp).toHaveAttribute(
      'data-stat-comparison-value',
      'prev:100',
    );
  });

  it('omits comparison when undefined', () => {
    const { container } = render(
      <StatCard label="Now" value={120} noAnimation />,
    );
    expect(
      container.querySelector('[data-section="stat-card-comparison"]'),
    ).toBeNull();
  });

  it('trend carries data-stat-trend-direction matching value sign', () => {
    const { container, rerender } = render(
      <StatCard label="T" value={1} noAnimation trend={{ value: 5 }} />,
    );
    expect(
      container.querySelector('[data-stat-trend]'),
    ).toHaveAttribute('data-stat-trend-direction', 'up');
    rerender(
      <StatCard label="T" value={1} noAnimation trend={{ value: -3 }} />,
    );
    expect(
      container.querySelector('[data-stat-trend]'),
    ).toHaveAttribute('data-stat-trend-direction', 'down');
    rerender(
      <StatCard label="T" value={1} noAnimation trend={{ value: 0 }} />,
    );
    expect(
      container.querySelector('[data-stat-trend]'),
    ).toHaveAttribute('data-stat-trend-direction', 'flat');
  });

  it('sparklineSlot replaces the built-in svg render', () => {
    const { container } = render(
      <StatCard
        label="Custom"
        value={1}
        noAnimation
        sparkline={[1, 2, 3]}
        sparklineSlot={<div data-testid="custom-spark" />}
      />,
    );
    expect(
      container.querySelector('[data-testid="custom-spark"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="stat-card-sparkline"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-section="stat-card-sparkline-slot"]',
      ),
    ).toBeInTheDocument();
  });

  it('sparklineSlot is used even when sparkline number[] is absent', () => {
    const { container } = render(
      <StatCard
        label="Only Slot"
        value={1}
        noAnimation
        sparklineSlot={<div data-testid="only-slot" />}
      />,
    );
    expect(
      container.querySelector('[data-testid="only-slot"]'),
    ).toBeInTheDocument();
  });

  it('exposes data-section on label / value / trend / sparkline', () => {
    const { container } = render(
      <StatCard
        label="L"
        value={1}
        noAnimation
        trend={{ value: 5 }}
        sparkline={[1, 2]}
      />,
    );
    expect(
      container.querySelector('[data-section="stat-card-label"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="stat-card-value"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="stat-card-trend"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="stat-card-sparkline"]'),
    ).toBeInTheDocument();
  });

  it('icon block carries data-section="stat-card-icon"', () => {
    const { container } = render(
      <StatCard
        label="X"
        value={1}
        noAnimation
        icon={<svg />}
      />,
    );
    expect(
      container.querySelector('[data-section="stat-card-icon"]'),
    ).toBeInTheDocument();
  });

  describe('getStatCardTrendDirection helper', () => {
    it('returns "up" for positive', () => {
      expect(getStatCardTrendDirection(5)).toBe('up');
      expect(getStatCardTrendDirection(0.01)).toBe('up');
    });
    it('returns "down" for negative', () => {
      expect(getStatCardTrendDirection(-5)).toBe('down');
    });
    it('returns "flat" for zero', () => {
      expect(getStatCardTrendDirection(0)).toBe('flat');
    });
    it('returns "flat" for NaN / Infinity', () => {
      expect(getStatCardTrendDirection(Number.NaN)).toBe('flat');
      expect(getStatCardTrendDirection(Number.POSITIVE_INFINITY)).toBe(
        'flat',
      );
    });
  });
});
