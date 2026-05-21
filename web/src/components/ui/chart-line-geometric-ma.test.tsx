import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineGeometricMa,
  classifyLineGeometricMaZone,
  computeLineGeometricMa,
  computeLineGeometricMaLayout,
  describeLineGeometricMaChart,
  getLineGeometricMaFinitePoints,
  normalizeLineGeometricMaPeriod,
  runLineGeometricMa,
  type ChartLineGeometricMaPoint,
} from './chart-line-geometric-ma';

/**
 * Fixture: a 6-bar positive close series read with period 2. The period-2
 * geometric mean is sqrt(v[i-1] * v[i]); every consecutive product here is
 * a perfect square, so the GMA lands on an exact integer -- [.,6,6,10,10,14].
 * The values never have an equal consecutive pair, so every defined bar is
 * unambiguously above or below.
 */
const GEOMETRIC_DATA: ChartLineGeometricMaPoint[] = [
  { x: 1, value: 4 },
  { x: 2, value: 9 },
  { x: 3, value: 4 },
  { x: 4, value: 25 },
  { x: 5, value: 4 },
  { x: 6, value: 49 },
];
const GEOMETRIC_VALUES = GEOMETRIC_DATA.map((p) => p.value);
const OPTS = { period: 2 };

const GMA2_EXPECTED = [null, 6, 6, 10, 10, 14];
const ZONE_EXPECTED = ['none', 'below', 'above', 'below', 'above', 'below'];

describe('getLineGeometricMaFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineGeometricMaFinitePoints([
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
    expect(getLineGeometricMaFinitePoints(null)).toEqual([]);
    expect(getLineGeometricMaFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineGeometricMaFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineGeometricMaFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineGeometricMaPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineGeometricMaPeriod(20, 14)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineGeometricMaPeriod(8.9, 14)).toBe(8);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineGeometricMaPeriod(0, 14)).toBe(14);
    expect(normalizeLineGeometricMaPeriod(-5, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineGeometricMaPeriod(Number.NaN, 14)).toBe(14);
    expect(normalizeLineGeometricMaPeriod('x', 14)).toBe(14);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineGeometricMaPeriod(1, 14)).toBe(1);
  });
});

describe('computeLineGeometricMa', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineGeometricMa(null, 2)).toEqual([]);
  });

  it('is the identity for period one', () => {
    expect(computeLineGeometricMa([5, 10, 15], 1)).toEqual([5, 10, 15]);
  });

  it('matches the input length', () => {
    expect(computeLineGeometricMa(GEOMETRIC_VALUES, 2)).toHaveLength(
      GEOMETRIC_VALUES.length,
    );
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineGeometricMa(GEOMETRIC_VALUES, 2)[0]).toBeNull();
  });

  it('is the square root of the product for period two', () => {
    const gma = computeLineGeometricMa(GEOMETRIC_VALUES, 2);
    expect(gma[1]!).toBeCloseTo(6, 10);
    expect(gma[3]!).toBeCloseTo(10, 10);
    expect(gma[5]!).toBeCloseTo(14, 10);
  });

  it('is the middle term for a geometric progression', () => {
    // geometric mean of 1, 2, 4 is the cube root of 8 = 2.
    expect(computeLineGeometricMa([1, 2, 4], 3)[2]!).toBeCloseTo(2, 10);
  });

  it('keeps a constant series at its constant level', () => {
    const gma = computeLineGeometricMa([8, 8, 8, 8], 3);
    expect(gma[2]!).toBeCloseTo(8, 10);
    expect(gma[3]!).toBeCloseTo(8, 10);
  });

  it('never exceeds the arithmetic mean of the window', () => {
    const gma = computeLineGeometricMa(GEOMETRIC_VALUES, 2);
    for (let i = 1; i < GEOMETRIC_VALUES.length; i += 1) {
      const am = (GEOMETRIC_VALUES[i - 1]! + GEOMETRIC_VALUES[i]!) / 2;
      expect(gma[i]!).toBeLessThanOrEqual(am);
    }
  });

  it('is all null when the period exceeds the series length', () => {
    expect(computeLineGeometricMa([1, 2, 3], 5)).toEqual([null, null, null]);
  });

  it('yields null for a window with a negative value', () => {
    const gma = computeLineGeometricMa([10, -5, 20, 30], 2);
    expect(gma[1]).toBeNull();
    expect(gma[2]).toBeNull();
    expect(gma[3]).not.toBeNull();
  });

  it('yields null for a window with a zero value', () => {
    expect(computeLineGeometricMa([10, 0, 20], 2)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe('classifyLineGeometricMaZone', () => {
  it('is above when the GMA exceeds the price', () => {
    expect(classifyLineGeometricMaZone(25, 20)).toBe('above');
  });

  it('is below when the GMA is under the price', () => {
    expect(classifyLineGeometricMaZone(15, 20)).toBe('below');
  });

  it('is equal when the GMA matches the price', () => {
    expect(classifyLineGeometricMaZone(20, 20)).toBe('equal');
  });

  it('is none for a null GMA', () => {
    expect(classifyLineGeometricMaZone(null, 20)).toBe('none');
  });

  it('is none for a non-finite GMA', () => {
    expect(classifyLineGeometricMaZone(Number.NaN, 20)).toBe('none');
  });
});

describe('runLineGeometricMa', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineGeometricMa([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default period', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA).period).toBe(14);
  });

  it('honours a custom period', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA, OPTS).period).toBe(2);
  });

  it('keeps the warm-up GMA null', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA, OPTS).gma[0]).toBeNull();
  });

  it('is the square root of the product for period two', () => {
    const run = runLineGeometricMa(GEOMETRIC_DATA, OPTS);
    for (let i = 1; i < GMA2_EXPECTED.length; i += 1) {
      expect(run.gma[i]!).toBeCloseTo(GMA2_EXPECTED[i] as number, 10);
    }
  });

  it('classifies the zone of every bar', () => {
    const run = runLineGeometricMa(GEOMETRIC_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineGeometricMa(GEOMETRIC_DATA, OPTS);
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(0);
  });

  it('reports the final GMA', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA, OPTS).gmaFinal!).toBeCloseTo(
      14,
      10,
    );
  });

  it('emits one sample per point', () => {
    expect(runLineGeometricMa(GEOMETRIC_DATA, OPTS).samples).toHaveLength(
      GEOMETRIC_DATA.length,
    );
  });

  it('sorts the input by x', () => {
    const shuffled = [...GEOMETRIC_DATA].reverse();
    const run = runLineGeometricMa(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(
      GEOMETRIC_DATA.map((p) => p.x),
    );
  });

  it('is not ok for an empty series', () => {
    expect(runLineGeometricMa([], OPTS).ok).toBe(false);
    expect(runLineGeometricMa(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineGeometricMaLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineGeometricMaLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(
      computeLineGeometricMaLayout({ data: GEOMETRIC_DATA, ...OPTS }).ok,
    ).toBe(true);
  });

  it('builds the price and GMA paths', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.gmaPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(GEOMETRIC_DATA.length);
  });

  it('emits one marker per bar with a defined GMA', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
    });
    expect(layout.markers).toHaveLength(GEOMETRIC_DATA.length - 1);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
    });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineGeometricMaLayout({
      data: GEOMETRIC_DATA,
      ...OPTS,
    });
    expect(layout.run.period).toBe(2);
  });
});

describe('describeLineGeometricMaChart', () => {
  it('names the indicator', () => {
    expect(describeLineGeometricMaChart(GEOMETRIC_DATA, OPTS)).toContain(
      'Geometric Moving Average',
    );
  });

  it('mentions the geometric mean and positive prices', () => {
    const text = describeLineGeometricMaChart(GEOMETRIC_DATA, OPTS);
    expect(text).toContain('geometric mean');
    expect(text).toContain('positive');
  });

  it('reports the zone counts', () => {
    const text = describeLineGeometricMaChart(GEOMETRIC_DATA, OPTS);
    expect(text).toContain('above the price on 2');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineGeometricMaChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineGeometricMa component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-geometric-ma-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Geometric Moving Average');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(
      <ChartLineGeometricMa data={[]} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-geometric-ma-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-geometric-ma"]',
    );
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-above-count')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('6');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and GMA lines', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-geometric-ma-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-geometric-ma-gma-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar with a defined GMA', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-geometric-ma-marker"]',
    );
    expect(markers).toHaveLength(GEOMETRIC_DATA.length - 1);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const markers = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-geometric-ma-marker"]',
      ),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'below',
      'above',
      'below',
      'above',
      'below',
    ]);
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-geometric-ma-badge-config"]',
    );
    expect(badge?.textContent).toBe('GMA 2');
  });

  it('hides the GMA line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-geometric-ma-legend-item"][data-series-id="gma"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector(
        '[data-section="chart-line-geometric-ma-gma-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the GMA line when showGma is false', () => {
    const { container } = render(
      <ChartLineGeometricMa data={GEOMETRIC_DATA} {...OPTS} showGma={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-geometric-ma-gma-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLineGeometricMa
        data={GEOMETRIC_DATA}
        {...OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-geometric-ma-price-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineGeometricMa
        data={GEOMETRIC_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-geometric-ma-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineGeometricMa ref={ref} data={GEOMETRIC_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-geometric-ma',
    );
  });
});
