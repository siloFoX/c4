import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineCoral,
  classifyLineCoralTrend,
  computeLineCoral,
  computeLineCoralCoefficients,
  computeLineCoralLayout,
  describeLineCoralChart,
  getLineCoralFinitePoints,
  normalizeLineCoralPeriod,
  runLineCoral,
  type ChartLineCoralPoint,
} from './chart-line-coral';

/**
 * Fixtures:
 * - cd 0.5 makes the Tillson coefficients exact dyadic values that sum to
 *   exactly 1, so the Coral of a constant series is that constant exactly.
 * - CORAL_DATA: a rise-then-fall close series for the run / component
 *   structural checks. Period 5 gives the pole alpha 0.5.
 */
const CORAL_DATA: ChartLineCoralPoint[] = [
  { x: 1, value: 10 },
  { x: 2, value: 20 },
  { x: 3, value: 35 },
  { x: 4, value: 55 },
  { x: 5, value: 80 },
  { x: 6, value: 110 },
  { x: 7, value: 90 },
  { x: 8, value: 70 },
  { x: 9, value: 52 },
  { x: 10, value: 38 },
  { x: 11, value: 28 },
  { x: 12, value: 22 },
];
const OPTS = { period: 5, cd: 0.5 };

const RISING = [10, 20, 30, 40, 50, 60, 70, 80];
const FALLING = [80, 70, 60, 50, 40, 30, 20, 10];

describe('getLineCoralFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineCoralFinitePoints([
      { x: 1, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 3, value: Number.POSITIVE_INFINITY },
      { x: 4, value: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, value: 10 },
      { x: 4, value: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineCoralFinitePoints(null)).toEqual([]);
    expect(getLineCoralFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineCoralFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineCoralFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineCoralPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineCoralPeriod(20, 21)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineCoralPeriod(9.8, 21)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineCoralPeriod(0, 21)).toBe(21);
    expect(normalizeLineCoralPeriod(-3, 21)).toBe(21);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineCoralPeriod(Number.NaN, 21)).toBe(21);
    expect(normalizeLineCoralPeriod('x', 21)).toBe(21);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineCoralPeriod(1, 21)).toBe(1);
  });
});

describe('computeLineCoralCoefficients', () => {
  it('computes the exact dyadic coefficients for cd one half', () => {
    expect(computeLineCoralCoefficients(0.5)).toEqual({
      c1: -0.125,
      c2: 1.125,
      c3: -3.375,
      c4: 3.375,
    });
  });

  it('makes the four coefficients sum to one', () => {
    const { c1, c2, c3, c4 } = computeLineCoralCoefficients(0.5);
    expect(c1 + c2 + c3 + c4).toBe(1);
  });

  it('makes c1 the negative cube of cd', () => {
    expect(computeLineCoralCoefficients(0.5).c1).toBe(-0.125);
  });

  it('falls back to the default cd for a non-finite input', () => {
    expect(computeLineCoralCoefficients(Number.NaN)).toEqual(
      computeLineCoralCoefficients(0.4),
    );
  });

  it('produces different coefficients for a different cd', () => {
    expect(computeLineCoralCoefficients(0.5)).not.toEqual(
      computeLineCoralCoefficients(0.2),
    );
  });

  it('keeps the sum at one for any cd', () => {
    const { c1, c2, c3, c4 } = computeLineCoralCoefficients(0.4);
    expect(c1 + c2 + c3 + c4).toBeCloseTo(1, 10);
  });
});

describe('computeLineCoral', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineCoral(null, 5, 0.5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineCoral([], 5, 0.5)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineCoral([10, 20, 30, 40], 5, 0.5)).toHaveLength(4);
  });

  it('holds a constant series at its constant level', () => {
    expect(computeLineCoral([8, 8, 8, 8, 8], 5, 0.5)).toEqual([
      8, 8, 8, 8, 8,
    ]);
  });

  it('returns the value itself for a single-bar input', () => {
    expect(computeLineCoral([8], 5, 0.5)).toEqual([8]);
  });

  it('rises across a strictly rising series', () => {
    const coral = computeLineCoral(RISING, 5, 0.5);
    expect(coral[coral.length - 1]!).toBeGreaterThan(coral[0]!);
  });

  it('falls across a strictly falling series', () => {
    const coral = computeLineCoral(FALLING, 5, 0.5);
    expect(coral[coral.length - 1]!).toBeLessThan(coral[0]!);
  });

  it('keeps every value finite for finite input', () => {
    for (const v of computeLineCoral(RISING, 5, 0.5)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('responds to the cd constant', () => {
    expect(computeLineCoral(RISING, 5, 0.5)).not.toEqual(
      computeLineCoral(RISING, 5, 0.2),
    );
  });

  it('keeps a two-value input the same length', () => {
    expect(computeLineCoral([10, 20], 5, 0.5)).toHaveLength(2);
  });
});

describe('classifyLineCoralTrend', () => {
  it('is up when the Coral rises', () => {
    expect(classifyLineCoralTrend(12, 10)).toBe('up');
  });

  it('is down when the Coral falls', () => {
    expect(classifyLineCoralTrend(8, 10)).toBe('down');
  });

  it('is flat when the Coral is unchanged', () => {
    expect(classifyLineCoralTrend(10, 10)).toBe('flat');
  });

  it('is none for a null previous value', () => {
    expect(classifyLineCoralTrend(10, null)).toBe('none');
  });

  it('is none for a null current value', () => {
    expect(classifyLineCoralTrend(null, 10)).toBe('none');
  });
});

describe('runLineCoral', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineCoral([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineCoral(CORAL_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default options', () => {
    const run = runLineCoral(CORAL_DATA);
    expect(run.period).toBe(21);
    expect(run.cd).toBe(0.4);
  });

  it('honours custom options', () => {
    const run = runLineCoral(CORAL_DATA, OPTS);
    expect(run.period).toBe(5);
    expect(run.cd).toBe(0.5);
  });

  it('holds the Coral at the constant level for a flat series', () => {
    const flat = [8, 8, 8, 8, 8].map((value, i) => ({ x: i, value }));
    const run = runLineCoral(flat, OPTS);
    expect(run.coral).toEqual([8, 8, 8, 8, 8]);
  });

  it('classifies a flat series as flat after the first bar', () => {
    const flat = [8, 8, 8, 8, 8].map((value, i) => ({ x: i, value }));
    const run = runLineCoral(flat, OPTS);
    expect(run.flatCount).toBe(4);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('rises through a rising series', () => {
    const rising = RISING.map((value, i) => ({ x: i, value }));
    const run = runLineCoral(rising, OPTS);
    expect(run.upCount).toBeGreaterThan(0);
    expect(run.downCount).toBe(0);
  });

  it('has self-consistent trend counts', () => {
    const run = runLineCoral(CORAL_DATA, OPTS);
    expect(run.upCount + run.downCount + run.flatCount).toBe(
      run.samples.length - 1,
    );
  });

  it('reports the final Coral value', () => {
    const run = runLineCoral(CORAL_DATA, OPTS);
    expect(Number.isFinite(run.coralFinal)).toBe(true);
  });

  it('emits one sample per point', () => {
    expect(runLineCoral(CORAL_DATA, OPTS).samples).toHaveLength(
      CORAL_DATA.length,
    );
  });

  it('sorts the input by x', () => {
    const shuffled = [...CORAL_DATA].reverse();
    const run = runLineCoral(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(CORAL_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineCoral([], OPTS).ok).toBe(false);
    expect(runLineCoral(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineCoralLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineCoralLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineCoralLayout({
      data: CORAL_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineCoralLayout({ data: CORAL_DATA, ...OPTS }).ok).toBe(true);
  });

  it('builds the price path', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(CORAL_DATA.length);
  });

  it('emits one Coral segment between each pair of bars', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    expect(layout.segments).toHaveLength(CORAL_DATA.length - 1);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(CORAL_DATA.length);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineCoralLayout({ data: CORAL_DATA, ...OPTS });
    expect(layout.run.period).toBe(5);
  });
});

describe('describeLineCoralChart', () => {
  it('names the indicator', () => {
    expect(describeLineCoralChart(CORAL_DATA, OPTS)).toContain('Coral Trend');
  });

  it('mentions the six-pole Tillson smoothing', () => {
    const text = describeLineCoralChart(CORAL_DATA, OPTS);
    expect(text).toContain('six-pole');
    expect(text).toContain('Tillson');
  });

  it('reports the trend counts', () => {
    const run = runLineCoral(CORAL_DATA, OPTS);
    const text = describeLineCoralChart(CORAL_DATA, OPTS);
    expect(text).toContain(`rises on ${run.upCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineCoralChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineCoral component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-coral-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Coral Trend');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineCoral data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-coral-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-coral"]');
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('12');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price line', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-coral-price-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one Coral segment between each pair of bars', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const segments = container.querySelectorAll(
      '[data-section="chart-line-coral-segment"]',
    );
    expect(segments).toHaveLength(CORAL_DATA.length - 1);
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-coral-marker"]',
    );
    expect(markers).toHaveLength(CORAL_DATA.length);
  });

  it('tags each marker with a valid trend', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-coral-marker"]'),
    );
    for (const marker of markers) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-trend'),
      );
    }
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-coral-badge-config"]',
    );
    expect(badge?.textContent).toBe('Coral 5');
  });

  it('hides the Coral segments when the legend item is toggled', () => {
    const { container } = render(<ChartLineCoral data={CORAL_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-coral-legend-item"][data-series-id="coral"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelectorAll('[data-section="chart-line-coral-segment"]'),
    ).toHaveLength(0);
  });

  it('hides the Coral when showCoral is false', () => {
    const { container } = render(
      <ChartLineCoral data={CORAL_DATA} {...OPTS} showCoral={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-coral-segment"]'),
    ).toHaveLength(0);
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineCoral data={CORAL_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-coral-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCoral ref={ref} data={CORAL_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-coral');
  });
});
