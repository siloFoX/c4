import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartBullet,
  DEFAULT_CHART_BULLET_HEIGHT,
  DEFAULT_CHART_BULLET_MEASURE_COLOR,
  DEFAULT_CHART_BULLET_MEASURE_THICKNESS,
  DEFAULT_CHART_BULLET_RANGE_COLORS,
  DEFAULT_CHART_BULLET_TARGET_COLOR,
  DEFAULT_CHART_BULLET_TICK_COUNT,
  DEFAULT_CHART_BULLET_WIDTH,
  getBulletMax,
  getBulletRatio,
  getBulletTicks,
  getDefaultBulletRanges,
  sortBulletRangesAscending,
} from './chart-bullet';
import type { ChartBulletRange } from './chart-bullet';

describe('chart-bullet pure helpers', () => {
  describe('getBulletMax', () => {
    it('returns the override when positive + finite', () => {
      expect(getBulletMax(20, 30, undefined, 100)).toBe(100);
    });

    it('falls back when override is non-positive', () => {
      expect(getBulletMax(20, 30, undefined, 0)).toBe(30);
      expect(getBulletMax(20, 30, undefined, -5)).toBe(30);
    });

    it('picks the largest of value / target / range max', () => {
      const ranges: ChartBulletRange[] = [
        { max: 50 },
        { max: 80 },
      ];
      expect(getBulletMax(20, 30, ranges)).toBe(80);
    });

    it('returns 1 when no positive numbers are present', () => {
      expect(getBulletMax(0, undefined, [])).toBe(1);
      expect(
        getBulletMax(Number.NaN, undefined, undefined),
      ).toBe(1);
    });

    it('uses value when target is missing', () => {
      expect(getBulletMax(42)).toBe(42);
    });

    it('handles negative value -> falls back to 1', () => {
      expect(getBulletMax(-10)).toBe(1);
    });
  });

  describe('getDefaultBulletRanges', () => {
    it('returns 3 tiers at 33/66/100 of max', () => {
      const r = getDefaultBulletRanges(100);
      expect(r.length).toBe(3);
      expect(r[0]?.max).toBeCloseTo(33.333, 2);
      expect(r[1]?.max).toBeCloseTo(66.667, 2);
      expect(r[2]?.max).toBe(100);
    });

    it('emits labelled bands', () => {
      const r = getDefaultBulletRanges(100);
      expect(r[0]?.label).toBe('Low');
      expect(r[1]?.label).toBe('Medium');
      expect(r[2]?.label).toBe('High');
    });

    it('returns [] when max is <= 0 or non-finite', () => {
      expect(getDefaultBulletRanges(0)).toEqual([]);
      expect(getDefaultBulletRanges(-1)).toEqual([]);
      expect(getDefaultBulletRanges(Number.NaN)).toEqual([]);
    });

    it('uses the default colour palette', () => {
      const r = getDefaultBulletRanges(100);
      expect(r[0]?.color).toBe(
        DEFAULT_CHART_BULLET_RANGE_COLORS[0],
      );
      expect(r[2]?.color).toBe(
        DEFAULT_CHART_BULLET_RANGE_COLORS[2],
      );
    });
  });

  describe('getBulletRatio', () => {
    it('linearly maps value into [0, 1]', () => {
      expect(getBulletRatio(0, 100)).toBe(0);
      expect(getBulletRatio(50, 100)).toBe(0.5);
      expect(getBulletRatio(100, 100)).toBe(1);
    });

    it('clamps over-max to 1', () => {
      expect(getBulletRatio(250, 100)).toBe(1);
    });

    it('clamps under-zero to 0', () => {
      expect(getBulletRatio(-10, 100)).toBe(0);
    });

    it('returns 0 for non-finite value', () => {
      expect(getBulletRatio(Number.NaN, 100)).toBe(0);
    });

    it('returns 0 when max <= 0 or non-finite', () => {
      expect(getBulletRatio(50, 0)).toBe(0);
      expect(getBulletRatio(50, Number.NaN)).toBe(0);
    });
  });

  describe('getBulletTicks', () => {
    it('emits the requested count of evenly-spaced ticks', () => {
      const ticks = getBulletTicks(100, 5);
      expect(ticks).toEqual([0, 25, 50, 75, 100]);
    });

    it('defaults to 5 ticks', () => {
      const ticks = getBulletTicks(100);
      expect(ticks.length).toBe(DEFAULT_CHART_BULLET_TICK_COUNT);
    });

    it('falls back to [0] when max <= 0', () => {
      expect(getBulletTicks(0)).toEqual([0]);
      expect(getBulletTicks(-1)).toEqual([0]);
    });

    it('clamps minimum count to 2', () => {
      const ticks = getBulletTicks(100, 1);
      expect(ticks.length).toBe(2);
      expect(ticks).toEqual([0, 100]);
    });
  });

  describe('sortBulletRangesAscending', () => {
    it('sorts ranges ascending by max', () => {
      const r: ChartBulletRange[] = [
        { max: 80 },
        { max: 30 },
        { max: 50 },
      ];
      const sorted = sortBulletRangesAscending(r);
      expect(sorted.map((x) => x.max)).toEqual([30, 50, 80]);
    });

    it('does not mutate the input', () => {
      const r: ChartBulletRange[] = [{ max: 80 }, { max: 30 }];
      sortBulletRangesAscending(r);
      expect(r.map((x) => x.max)).toEqual([80, 30]);
    });

    it('handles empty input', () => {
      expect(sortBulletRangesAscending([])).toEqual([]);
    });
  });

  it('exports default constants', () => {
    expect(DEFAULT_CHART_BULLET_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BULLET_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BULLET_MEASURE_COLOR).toBe('#1f2937');
    expect(DEFAULT_CHART_BULLET_TARGET_COLOR).toBe('#ef4444');
    expect(DEFAULT_CHART_BULLET_TICK_COUNT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BULLET_MEASURE_THICKNESS).toBeGreaterThan(0);
    expect(DEFAULT_CHART_BULLET_RANGE_COLORS.length).toBe(3);
  });
});

describe('<ChartBullet />', () => {
  it('renders a progressbar with aria fields', () => {
    render(<ChartBullet value={60} target={75} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute('aria-valuenow')).toBe('60');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe(
      '60 of 75 target',
    );
  });

  it('omits target from aria-valuetext when target is undefined', () => {
    render(<ChartBullet value={42} max={100} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toBe('42');
  });

  it('uses label as the default aria-label', () => {
    render(<ChartBullet value={10} label="Revenue" />);
    expect(
      screen.getByRole('progressbar', { name: 'Revenue' }),
    ).toBeInTheDocument();
  });

  it('uses an explicit ariaLabel when supplied', () => {
    render(
      <ChartBullet
        value={10}
        label="Revenue"
        ariaLabel="Quarterly revenue chart"
      />,
    );
    expect(
      screen.getByRole('progressbar', {
        name: 'Quarterly revenue chart',
      }),
    ).toBeInTheDocument();
  });

  it('falls back to "Bullet chart" when no label is set', () => {
    render(<ChartBullet value={10} />);
    expect(
      screen.getByRole('progressbar', { name: 'Bullet chart' }),
    ).toBeInTheDocument();
  });

  it('renders the label and sub-label in the header', () => {
    const { container } = render(
      <ChartBullet
        value={60}
        label="Revenue"
        subLabel="Q1 2026"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-bullet-label"]',
      )?.textContent,
    ).toBe('Revenue');
    expect(
      container.querySelector(
        '[data-section="chart-bullet-sublabel"]',
      )?.textContent,
    ).toBe('Q1 2026');
  });

  it('renders the formatted value next to the label', () => {
    const { container } = render(
      <ChartBullet
        value={60}
        target={75}
        label="Revenue"
        formatValue={(v) => `$${v}k`}
      />,
    );
    const valueNode = container.querySelector(
      '[data-section="chart-bullet-value"]',
    );
    expect(valueNode?.textContent).toContain('$60k');
    expect(valueNode?.textContent).toContain('$75k');
  });

  it('renders the measure bar', () => {
    const { container } = render(
      <ChartBullet value={50} max={100} />,
    );
    const measure = container.querySelector(
      '[data-section="chart-bullet-measure"]',
    );
    expect(measure).not.toBeNull();
    expect(measure?.getAttribute('data-value')).toBe('50');
    expect(measure?.getAttribute('data-ratio')).toBe('0.5000');
  });

  it('renders a target marker when target is provided', () => {
    const { container } = render(
      <ChartBullet value={50} target={80} max={100} />,
    );
    const t = container.querySelector(
      '[data-section="chart-bullet-target"]',
    );
    expect(t).not.toBeNull();
    expect(t?.getAttribute('data-target')).toBe('80');
    expect(t?.getAttribute('data-target-ratio')).toBe('0.8000');
  });

  it('omits the target marker when target is undefined', () => {
    const { container } = render(
      <ChartBullet value={50} max={100} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-bullet-target"]',
      ),
    ).toBeNull();
  });

  it('renders 3 default qualitative ranges', () => {
    const { container } = render(
      <ChartBullet value={50} max={100} />,
    );
    const r = container.querySelectorAll(
      '[data-section="chart-bullet-range"]',
    );
    expect(r.length).toBe(3);
  });

  it('honours custom ranges', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        max={100}
        ranges={[
          { max: 40, label: 'A' },
          { max: 70, label: 'B' },
        ]}
      />,
    );
    const r = container.querySelectorAll(
      '[data-section="chart-bullet-range"]',
    );
    expect(r.length).toBe(2);
    const labels = Array.from(r)
      .map((node) => node.getAttribute('data-range-label'))
      .sort();
    expect(labels).toEqual(['A', 'B']);
  });

  it('renders axis ticks by default', () => {
    const { container } = render(
      <ChartBullet value={50} max={100} tickCount={5} />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-bullet-tick"]',
    );
    expect(ticks.length).toBe(5);
    expect(ticks[0]?.textContent).toBe('0');
    expect(ticks[ticks.length - 1]?.textContent).toBe('100');
  });

  it('suppresses ticks when showAxisTicks=false', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        max={100}
        showAxisTicks={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-bullet-tick"]'),
    ).toBeNull();
  });

  it('formats ticks via formatValue', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        max={100}
        formatValue={(v) => `${v}%`}
      />,
    );
    const ticks = container.querySelectorAll(
      '[data-section="chart-bullet-tick"]',
    );
    expect(ticks[0]?.textContent).toBe('0%');
    expect(ticks[ticks.length - 1]?.textContent).toBe('100%');
  });

  it('mirrors data-orientation horizontal by default', () => {
    const { container } = render(
      <ChartBullet value={50} max={100} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-bullet"]')
        ?.getAttribute('data-orientation'),
    ).toBe('horizontal');
  });

  it('mirrors data-orientation vertical when configured', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        max={100}
        orientation="vertical"
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-bullet"]')
        ?.getAttribute('data-orientation'),
    ).toBe('vertical');
  });

  it('mirrors animate flag on the root', () => {
    const { container, rerender } = render(
      <ChartBullet value={50} max={100} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-bullet"]')
        ?.getAttribute('data-animate'),
    ).toBe('true');
    rerender(
      <ChartBullet value={50} max={100} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-bullet"]')
        ?.getAttribute('data-animate'),
    ).toBe('false');
  });

  it('exposes data-value / data-target / data-max / data-ratio', () => {
    const { container } = render(
      <ChartBullet value={60} target={80} max={100} />,
    );
    const root = container.querySelector(
      '[data-section="chart-bullet"]',
    );
    expect(root?.getAttribute('data-value')).toBe('60');
    expect(root?.getAttribute('data-target')).toBe('80');
    expect(root?.getAttribute('data-max')).toBe('100');
    expect(root?.getAttribute('data-ratio')).toBe('0.6000');
  });

  it('mirrors SVG size from width / height props', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        max={100}
        width={600}
        height={80}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-bullet-svg"]',
    );
    expect(svg?.getAttribute('width')).toBe('600');
    expect(svg?.getAttribute('height')).toBe('80');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 600 80');
  });

  it('uses custom measureColor + targetColor', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        target={80}
        max={100}
        measureColor="#0ea5e9"
        targetColor="#f59e0b"
      />,
    );
    const measure = container.querySelector(
      '[data-section="chart-bullet-measure"]',
    );
    const tgt = container.querySelector(
      '[data-section="chart-bullet-target"]',
    );
    expect(measure?.getAttribute('fill')).toBe('#0ea5e9');
    expect(tgt?.getAttribute('stroke')).toBe('#f59e0b');
  });

  it('clamps measure ratio when value > max', () => {
    const { container } = render(
      <ChartBullet value={200} max={100} />,
    );
    const measure = container.querySelector(
      '[data-section="chart-bullet-measure"]',
    );
    expect(measure?.getAttribute('data-ratio')).toBe('1.0000');
  });

  it('forwards ref to the root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartBullet ref={ref} value={50} max={100} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-bullet',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartBullet.displayName).toBe('ChartBullet');
  });

  it('renders without a label header when label + subLabel are missing', () => {
    const { container } = render(
      <ChartBullet value={10} max={100} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-bullet-header"]',
      ),
    ).toBeNull();
  });

  it('omits target text in header when target is undefined', () => {
    const { container } = render(
      <ChartBullet value={10} max={100} label="L" />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-bullet-target-text"]',
      ),
    ).toBeNull();
  });

  it('renders vertical layout without crashing', () => {
    const { container } = render(
      <ChartBullet
        value={50}
        target={75}
        max={100}
        orientation="vertical"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-bullet-measure"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-bullet-target"]',
      ),
    ).not.toBeNull();
  });
});
