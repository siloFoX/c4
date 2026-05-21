import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineSineWeighted,
  classifyLineSineWeightedZone,
  computeLineSineWeighted,
  computeLineSineWeightedLayout,
  computeLineSineWeightedWeights,
  describeLineSineWeightedChart,
  getLineSineWeightedFinitePoints,
  normalizeLineSineWeightedPeriod,
  runLineSineWeighted,
  type ChartLineSineWeightedPoint,
} from './chart-line-sine-weighted';

/**
 * Fixture: a 6-bar close series read with period 2. The two sine weights
 * for a 2-slot window are sin(pi/3) and sin(2*pi/3) -- both sqrt(3)/2, so
 * they are equal and the SWMA collapses to the simple 2-bar average
 * (v[i-1] + v[i]) / 2. The values never have an equal consecutive pair, so
 * every defined bar is unambiguously above or below.
 */
const SINE_DATA: ChartLineSineWeightedPoint[] = [
  { x: 1, value: 10 },
  { x: 2, value: 20 },
  { x: 3, value: 14 },
  { x: 4, value: 30 },
  { x: 5, value: 22 },
  { x: 6, value: 40 },
];
const SINE_VALUES = SINE_DATA.map((p) => p.value);
const OPTS = { period: 2 };

// (v[i-1] + v[i]) / 2 for the period-2 SWMA.
const SWMA2_EXPECTED = [null, 15, 17, 22, 26, 31];
const ZONE_EXPECTED = ['none', 'below', 'above', 'below', 'above', 'below'];

describe('getLineSineWeightedFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineSineWeightedFinitePoints([
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
    expect(getLineSineWeightedFinitePoints(null)).toEqual([]);
    expect(getLineSineWeightedFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineSineWeightedFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineSineWeightedFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineSineWeightedPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineSineWeightedPeriod(20, 14)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineSineWeightedPeriod(8.9, 14)).toBe(8);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineSineWeightedPeriod(0, 14)).toBe(14);
    expect(normalizeLineSineWeightedPeriod(-5, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineSineWeightedPeriod(Number.NaN, 14)).toBe(14);
    expect(normalizeLineSineWeightedPeriod('x', 14)).toBe(14);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineSineWeightedPeriod(1, 14)).toBe(1);
  });
});

describe('computeLineSineWeightedWeights', () => {
  it('returns one weight per slot', () => {
    expect(computeLineSineWeightedWeights(5)).toHaveLength(5);
  });

  it('is a single unit weight for period one', () => {
    expect(computeLineSineWeightedWeights(1)).toEqual([1]);
  });

  it('makes every weight positive', () => {
    for (const w of computeLineSineWeightedWeights(7)) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('is symmetric about the centre of the window', () => {
    const weights = computeLineSineWeightedWeights(5);
    expect(weights[0]!).toBeCloseTo(weights[4]!, 12);
    expect(weights[1]!).toBeCloseTo(weights[3]!, 12);
  });

  it('peaks at the middle of the window', () => {
    const weights = computeLineSineWeightedWeights(5);
    expect(weights[2]!).toBeGreaterThan(weights[1]!);
    expect(weights[1]!).toBeGreaterThan(weights[0]!);
  });

  it('gives the centre slot of an odd window a unit weight', () => {
    // period 3: middle weight is sin(2*pi/4) = sin(pi/2) = 1.
    expect(computeLineSineWeightedWeights(3)[1]!).toBeCloseTo(1, 12);
  });

  it('gives a period-2 window two equal weights', () => {
    const weights = computeLineSineWeightedWeights(2);
    expect(weights[0]!).toBeCloseTo(weights[1]!, 12);
  });
});

describe('computeLineSineWeighted', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSineWeighted(null, 2)).toEqual([]);
  });

  it('is the identity for period one', () => {
    expect(computeLineSineWeighted([5, 10, 15], 1)).toEqual([5, 10, 15]);
  });

  it('matches the input length', () => {
    expect(computeLineSineWeighted(SINE_VALUES, 2)).toHaveLength(
      SINE_VALUES.length,
    );
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineSineWeighted(SINE_VALUES, 2)[0]).toBeNull();
  });

  it('collapses to the simple two-bar average for period two', () => {
    const swma = computeLineSineWeighted(SINE_VALUES, 2);
    expect(swma[1]!).toBeCloseTo(15, 10);
    expect(swma[2]!).toBeCloseTo(17, 10);
    expect(swma[5]!).toBeCloseTo(31, 10);
  });

  it('is all null when the period exceeds the series length', () => {
    expect(computeLineSineWeighted([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('keeps a constant series at its constant level', () => {
    const swma = computeLineSineWeighted([7, 7, 7, 7, 7], 3);
    expect(swma[2]!).toBeCloseTo(7, 10);
    expect(swma[4]!).toBeCloseTo(7, 10);
  });

  it('yields null for a window with a non-finite value', () => {
    const swma = computeLineSineWeighted([10, Number.NaN, 30, 40], 2);
    expect(swma[1]).toBeNull();
    expect(swma[2]).toBeNull();
    expect(swma[3]!).toBeCloseTo(35, 10);
  });

  it('defines one value per full window', () => {
    const swma = computeLineSineWeighted(SINE_VALUES, 2);
    expect(swma.filter((v) => v !== null)).toHaveLength(
      SINE_VALUES.length - 1,
    );
  });
});

describe('classifyLineSineWeightedZone', () => {
  it('is above when the SWMA exceeds the price', () => {
    expect(classifyLineSineWeightedZone(25, 20)).toBe('above');
  });

  it('is below when the SWMA is under the price', () => {
    expect(classifyLineSineWeightedZone(15, 20)).toBe('below');
  });

  it('is equal when the SWMA matches the price', () => {
    expect(classifyLineSineWeightedZone(20, 20)).toBe('equal');
  });

  it('is none for a null SWMA', () => {
    expect(classifyLineSineWeightedZone(null, 20)).toBe('none');
  });

  it('is none for a non-finite SWMA', () => {
    expect(classifyLineSineWeightedZone(Number.NaN, 20)).toBe('none');
  });
});

describe('runLineSineWeighted', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineSineWeighted([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default period', () => {
    expect(runLineSineWeighted(SINE_DATA).period).toBe(14);
  });

  it('honours a custom period', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).period).toBe(2);
  });

  it('carries one weight per window slot', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).weights).toHaveLength(2);
  });

  it('keeps the warm-up SWMA null', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).swma[0]).toBeNull();
  });

  it('collapses to the two-bar average for period two', () => {
    const run = runLineSineWeighted(SINE_DATA, OPTS);
    for (let i = 1; i < SWMA2_EXPECTED.length; i += 1) {
      expect(run.swma[i]!).toBeCloseTo(SWMA2_EXPECTED[i] as number, 10);
    }
  });

  it('classifies the zone of every bar', () => {
    const run = runLineSineWeighted(SINE_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineSineWeighted(SINE_DATA, OPTS);
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(0);
  });

  it('reports the final SWMA', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).swmaFinal!).toBeCloseTo(
      31,
      10,
    );
  });

  it('emits one sample per point', () => {
    expect(runLineSineWeighted(SINE_DATA, OPTS).samples).toHaveLength(
      SINE_DATA.length,
    );
  });

  it('sorts the input by x', () => {
    const shuffled = [...SINE_DATA].reverse();
    const run = runLineSineWeighted(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(SINE_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineSineWeighted([], OPTS).ok).toBe(false);
    expect(runLineSineWeighted(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineSineWeightedLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineSineWeightedLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineSineWeightedLayout({
      data: SINE_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(
      computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS }).ok,
    ).toBe(true);
  });

  it('builds the price and SWMA paths', () => {
    const layout = computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.swmaPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(SINE_DATA.length);
  });

  it('emits one marker per bar with a defined SWMA', () => {
    const layout = computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(SINE_DATA.length - 1);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineSineWeightedLayout({ data: SINE_DATA, ...OPTS });
    expect(layout.run.period).toBe(2);
  });
});

describe('describeLineSineWeightedChart', () => {
  it('names the indicator', () => {
    expect(describeLineSineWeightedChart(SINE_DATA, OPTS)).toContain(
      'Sine Weighted Moving Average',
    );
  });

  it('mentions the half sine window weighting', () => {
    const text = describeLineSineWeightedChart(SINE_DATA, OPTS);
    expect(text).toContain('half sine');
    expect(text).toContain('window');
  });

  it('reports the zone counts', () => {
    const text = describeLineSineWeightedChart(SINE_DATA, OPTS);
    expect(text).toContain('above the price on 2');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineSineWeightedChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineSineWeighted component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineSineWeighted data={SINE_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-sine-weighted-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Sine Weighted Moving Average');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineSineWeighted data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-sine-weighted-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sine-weighted"]',
    );
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-above-count')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('6');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineSineWeighted data={SINE_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and SWMA lines', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sine-weighted-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-sine-weighted-swma-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar with a defined SWMA', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-sine-weighted-marker"]',
    );
    expect(markers).toHaveLength(SINE_DATA.length - 1);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const markers = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-sine-weighted-marker"]',
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
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-sine-weighted-badge-config"]',
    );
    expect(badge?.textContent).toBe('SWMA 2');
  });

  it('hides the SWMA line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-sine-weighted-legend-item"][data-series-id="swma"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector(
        '[data-section="chart-line-sine-weighted-swma-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the SWMA line when showSwma is false', () => {
    const { container } = render(
      <ChartLineSineWeighted data={SINE_DATA} {...OPTS} showSwma={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sine-weighted-swma-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLineSineWeighted
        data={SINE_DATA}
        {...OPTS}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sine-weighted-price-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSineWeighted
        data={SINE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-sine-weighted-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSineWeighted ref={ref} data={SINE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-sine-weighted',
    );
  });
});
