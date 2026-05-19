import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  GAUGE_END_ANGLE_DEG,
  GAUGE_START_ANGLE_DEG,
  GAUGE_SWEEP_DEG,
  Gauge,
  clampGaugeValue,
  describeArc,
  findThresholdColor,
  valueToFraction,
} from './gauge';

afterEach(() => {
  cleanup();
});

describe('clampGaugeValue', () => {
  it('clamps below min', () => {
    expect(clampGaugeValue(-10, 0, 100)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clampGaugeValue(150, 0, 100)).toBe(100);
  });
  it('passes through in-range', () => {
    expect(clampGaugeValue(50, 0, 100)).toBe(50);
  });
  it('non-finite -> min', () => {
    expect(clampGaugeValue(Number.NaN, 0, 100)).toBe(0);
    expect(clampGaugeValue(Number.POSITIVE_INFINITY, 0, 100)).toBe(100);
  });
  it('zero-range falls back to min', () => {
    expect(clampGaugeValue(5, 10, 10)).toBe(10);
    expect(clampGaugeValue(5, 10, 5)).toBe(10);
  });
});

describe('valueToFraction', () => {
  it('returns 0 at min', () => {
    expect(valueToFraction(0, 0, 100)).toBe(0);
  });
  it('returns 1 at max', () => {
    expect(valueToFraction(100, 0, 100)).toBe(1);
  });
  it('returns 0.5 at midpoint', () => {
    expect(valueToFraction(50, 0, 100)).toBe(0.5);
  });
  it('returns 0 when range collapses', () => {
    expect(valueToFraction(5, 10, 10)).toBe(0);
  });
  it('clamps in-out-of-range to bounds', () => {
    expect(valueToFraction(-50, 0, 100)).toBe(0);
    expect(valueToFraction(200, 0, 100)).toBe(1);
  });
});

describe('findThresholdColor', () => {
  it('returns null for undefined / empty thresholds', () => {
    expect(findThresholdColor(50, undefined)).toBeUndefined();
    expect(findThresholdColor(50, [])).toBeUndefined();
  });
  it('returns the matching threshold color', () => {
    const ts = [
      { from: 0, to: 50, color: 'green' },
      { from: 50, to: 80, color: 'orange' },
      { from: 80, to: 100, color: 'red' },
    ];
    expect(findThresholdColor(70, ts)).toBe('orange');
    expect(findThresholdColor(90, ts)).toBe('red');
  });
  it('uses fallback when no threshold matches', () => {
    const ts = [{ from: 0, to: 50, color: 'green' }];
    expect(findThresholdColor(75, ts, 'gray')).toBe('gray');
  });
});

describe('describeArc', () => {
  it('returns empty string when end <= start', () => {
    expect(describeArc(50, 50, 40, 90, 90)).toBe('');
    expect(describeArc(50, 50, 40, 180, 90)).toBe('');
  });

  it('uses largeArc=0 for sweep <= 180', () => {
    const d = describeArc(50, 50, 40, 0, 90);
    expect(d).toMatch(/A 40\.000 40\.000 0 0 1/);
  });

  it('uses largeArc=1 for sweep > 180', () => {
    const d = describeArc(50, 50, 40, 0, 270);
    expect(d).toMatch(/A 40\.000 40\.000 0 1 1/);
  });

  it('exposes gauge angle constants', () => {
    expect(GAUGE_START_ANGLE_DEG).toBe(135);
    expect(GAUGE_END_ANGLE_DEG).toBe(405);
    expect(GAUGE_SWEEP_DEG).toBe(270);
  });
});

describe('Gauge component', () => {
  it('renders role=progressbar with default aria-label', () => {
    render(<Gauge value={50} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Gauge',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<Gauge value={50} ariaLabel="CPU usage" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'CPU usage',
    );
  });

  it('aria-valuemin / aria-valuemax / aria-valuenow reflect the props', () => {
    render(<Gauge value={75} min={0} max={200} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '200');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });

  it('clamps the displayed value to [min, max]', () => {
    render(<Gauge value={-10} min={0} max={100} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('renders the value text by default', () => {
    render(<Gauge value={42} />);
    expect(
      screen.getByText('42', { selector: '[data-section="gauge-value"]' }),
    ).toBeInTheDocument();
  });

  it('hides the value text when showValue=false', () => {
    const { container } = render(<Gauge value={42} showValue={false} />);
    expect(
      container.querySelector('[data-section="gauge-value"]'),
    ).toBeNull();
  });

  it('formatValue prop replaces the rendered value', () => {
    render(
      <Gauge
        value={42}
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(
      screen.getByText('42%', {
        selector: '[data-section="gauge-value"]',
      }),
    ).toBeInTheDocument();
  });

  it('aria-valuetext mirrors the formatted value when string', () => {
    render(
      <Gauge value={42} formatValue={() => 'High'} />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      'High',
    );
  });

  it('exposes data-value + data-fraction', () => {
    const { container } = render(<Gauge value={25} min={0} max={100} />);
    const root = container.querySelector('[data-section="gauge"]');
    expect(root).toHaveAttribute('data-value', '25');
    expect(root).toHaveAttribute('data-fraction', '0.25');
  });

  it('renders an svg with track + progress paths', () => {
    const { container } = render(<Gauge value={50} />);
    expect(
      container.querySelector('[data-section="gauge-track"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="gauge-progress"]'),
    ).toBeInTheDocument();
  });

  it('thresholds render as separate band paths', () => {
    const { container } = render(
      <Gauge
        value={50}
        thresholds={[
          { from: 0, to: 30, color: 'green' },
          { from: 30, to: 70, color: 'orange' },
          { from: 70, to: 100, color: 'red' },
        ]}
      />,
    );
    const bands = container.querySelectorAll(
      '[data-section="gauge-threshold"]',
    );
    expect(bands).toHaveLength(3);
    expect(bands[0]).toHaveAttribute('data-threshold-from', '0');
    expect(bands[2]).toHaveAttribute('data-threshold-to', '100');
  });

  it('progress color picks the matched threshold color', () => {
    const { container } = render(
      <Gauge
        value={85}
        thresholds={[
          { from: 0, to: 50, color: 'green' },
          { from: 50, to: 80, color: 'orange' },
          { from: 80, to: 100, color: 'red' },
        ]}
      />,
    );
    const progress = container.querySelector(
      '[data-section="gauge-progress"]',
    );
    expect(progress).toHaveAttribute('data-progress-color', 'red');
  });

  it('progress color falls back to progressColor prop when no threshold matches', () => {
    const { container } = render(
      <Gauge
        value={120}
        max={200}
        thresholds={[{ from: 0, to: 50, color: 'green' }]}
        progressColor="purple"
      />,
    );
    const progress = container.querySelector(
      '[data-section="gauge-progress"]',
    );
    expect(progress).toHaveAttribute('data-progress-color', 'purple');
  });

  it('size prop sets width and height inline', () => {
    const { container } = render(<Gauge value={50} size={200} />);
    const root = container.querySelector(
      '[data-section="gauge"]',
    ) as HTMLElement;
    expect(root.style.width).toBe('200px');
    expect(root.style.height).toBe('200px');
  });

  it('falls back when max <= min (zero range)', () => {
    render(<Gauge value={5} min={10} max={5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemin',
      '10',
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '110',
    );
  });

  it('exposes a stable displayName', () => {
    expect(Gauge.displayName).toBe('Gauge');
  });

  it('forwards refs to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Gauge ref={ref} value={50} />);
    expect(ref.current?.getAttribute('role')).toBe('progressbar');
  });
});
