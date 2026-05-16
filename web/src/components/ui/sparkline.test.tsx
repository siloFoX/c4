import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Sparkline, buildSparklinePoints } from './sparkline';

describe('buildSparklinePoints (pure helper)', () => {
  it('returns an empty string when data is empty', () => {
    expect(buildSparklinePoints([])).toBe('');
  });

  it('renders a single point as a horizontal mid-line', () => {
    expect(buildSparklinePoints([5], 100, 24)).toBe('0,12 100,12');
  });

  it('renders an ascending series as left-low / right-high points', () => {
    const points = buildSparklinePoints([0, 10], 100, 24);
    // First point: x=0, max(value=0) -> y at bottom (24); last:
    // x=100, max(value=10) -> y at top (0).
    expect(points).toBe('0.00,24.00 100.00,0.00');
  });

  it('scales the y-axis to the data range', () => {
    const points = buildSparklinePoints([10, 20, 30], 100, 24);
    // 10 -> y=24 (bottom), 20 -> y=12 (middle), 30 -> y=0 (top).
    expect(points).toBe('0.00,24.00 50.00,12.00 100.00,0.00');
  });

  it('handles a flat series (range=0) without dividing by zero', () => {
    const points = buildSparklinePoints([5, 5, 5], 100, 24);
    // Range=0 falls back to 1; values all hit y=24.
    expect(points).toBe('0.00,24.00 50.00,24.00 100.00,24.00');
  });

  it('respects custom width/height arguments', () => {
    const points = buildSparklinePoints([0, 1], 200, 50);
    expect(points).toBe('0.00,50.00 200.00,0.00');
  });
});

describe('<Sparkline>', () => {
  const series = [1, 3, 2, 5, 4];

  it('renders an SVG line when data is non-empty', () => {
    const { container } = render(<Sparkline data={series} />);
    expect(
      container.querySelector('[data-sparkline-line="true"]'),
    ).not.toBeNull();
  });

  it('renders an empty-state dashed line when data is empty', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(
      container.querySelector('[data-sparkline-empty="true"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-sparkline-line="true"]'),
    ).toBeNull();
  });

  it('exposes data-section + data-size + data-variant on the root', () => {
    const { container } = render(
      <Sparkline data={series} size="lg" variant="success" />,
    );
    const root = container.querySelector('[data-section="sparkline"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-size')).toBe('lg');
    expect(root!.getAttribute('data-variant')).toBe('success');
  });

  it('flags empty data via data-empty="true"', () => {
    const { container } = render(<Sparkline data={[]} />);
    const root = container.querySelector('[data-section="sparkline"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('omits the last-value label by default', () => {
    const { container } = render(<Sparkline data={series} />);
    expect(
      container.querySelector('[data-sparkline-last-value="true"]'),
    ).toBeNull();
  });

  it('renders the last-value label when showLastValue is on', () => {
    const { container } = render(
      <Sparkline data={series} showLastValue />,
    );
    const label = container.querySelector(
      '[data-sparkline-last-value="true"]',
    );
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('4');
  });

  it('runs the last value through lastValueFormatter when provided', () => {
    const { container } = render(
      <Sparkline
        data={[1, 2, 3.456]}
        showLastValue
        lastValueFormatter={(v) => `${v.toFixed(1)}k`}
      />,
    );
    const label = container.querySelector(
      '[data-sparkline-last-value="true"]',
    );
    expect(label!.textContent).toBe('3.5k');
  });

  it('hides the last-value label even when showLastValue is true if data is empty', () => {
    const { container } = render(
      <Sparkline data={[]} showLastValue />,
    );
    expect(
      container.querySelector('[data-sparkline-last-value="true"]'),
    ).toBeNull();
  });

  it('omits dot markers by default', () => {
    const { container } = render(<Sparkline data={series} />);
    expect(
      container.querySelectorAll('[data-sparkline-dot]'),
    ).toHaveLength(0);
  });

  it('renders one dot per sample when showDots is on', () => {
    const { container } = render(<Sparkline data={series} showDots />);
    expect(
      container.querySelectorAll('[data-sparkline-dot]'),
    ).toHaveLength(series.length);
  });

  it('marks the trailing dot with data-sparkline-dot="last"', () => {
    const { container } = render(<Sparkline data={series} showDots />);
    const dots = container.querySelectorAll('[data-sparkline-dot]');
    expect(dots[dots.length - 1]!.getAttribute('data-sparkline-dot')).toBe(
      'last',
    );
  });

  it('size="sm" applies the smaller height/width tokens', () => {
    const { container } = render(<Sparkline data={series} size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('h-3');
  });

  it('default size (md) applies the medium tokens', () => {
    const { container } = render(<Sparkline data={series} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('h-4');
  });

  it('size="lg" applies the larger tokens', () => {
    const { container } = render(<Sparkline data={series} size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('h-8');
  });

  it('explicit numeric width overrides the size preset', () => {
    const { container } = render(
      <Sparkline data={series} width={200} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.width).toBe('200px');
  });

  it('explicit string width passes through verbatim', () => {
    const { container } = render(
      <Sparkline data={series} width="100%" />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.width).toBe('100%');
  });

  it('variant="success" applies the success stroke colour token', () => {
    const { container } = render(
      <Sparkline data={series} variant="success" />,
    );
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('text-success');
  });

  it('variant="destructive" applies the destructive stroke colour token', () => {
    const { container } = render(
      <Sparkline data={series} variant="destructive" />,
    );
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('text-destructive');
  });

  it('variant="muted" applies the muted-foreground stroke colour token', () => {
    const { container } = render(
      <Sparkline data={series} variant="muted" />,
    );
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('class') ?? '').toContain('text-muted-foreground');
  });

  it('renders the role="img" wrapper with an aria-label', () => {
    render(<Sparkline data={series} />);
    const root = screen.getByRole('img');
    expect(root.getAttribute('aria-label')).toBe(
      'Trend: 5 samples, last 4',
    );
  });

  it('aria-label override wins over the default', () => {
    render(<Sparkline data={series} ariaLabel="Custom trend label" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Custom trend label',
    );
  });

  it('empty-state aria-label reads "Trend: no data"', () => {
    render(<Sparkline data={[]} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Trend: no data',
    );
  });

  it('viewBox is fixed at 100x24 so the polyline scales with the column', () => {
    const { container } = render(<Sparkline data={series} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 24');
  });

  it('merges caller className with the default classes', () => {
    const { container } = render(
      <Sparkline data={series} className="custom-spark" />,
    );
    const root = container.querySelector('[data-section="sparkline"]');
    expect(root!.className).toContain('custom-spark');
    expect(root!.className).toContain('inline-flex');
  });

  it('forwards arbitrary HTML attributes (data-testid)', () => {
    render(<Sparkline data={series} data-testid="my-spark" />);
    expect(screen.getByTestId('my-spark')).toBeInTheDocument();
  });

  it('forwards a ref to the span root', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Sparkline data={series} ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
