import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLinePascal,
  classifyLinePascalZone,
  computeLinePascal,
  computeLinePascalLayout,
  computeLinePascalWeights,
  describeLinePascalChart,
  getLinePascalFinitePoints,
  normalizeLinePascalPeriod,
  runLinePascal,
  type ChartLinePascalPoint,
} from './chart-line-pascal';

/**
 * Fixture: an 8-bar close series read with period 3. The period-3 binomial
 * weights are [1,2,1] and the normalizer is 2^2 = 4, so the PMA is
 * (v[i-2] + 2*v[i-1] + v[i]) / 4. Division by a power of two is exact, so
 * the whole PMA series is asserted with toEqual. The values are picked so
 * every weighted sum is a multiple of 4 -- integer PMA throughout.
 */
const PASCAL_DATA: ChartLinePascalPoint[] = [
  { x: 1, value: 16 },
  { x: 2, value: 16 },
  { x: 3, value: 16 },
  { x: 4, value: 32 },
  { x: 5, value: 8 },
  { x: 6, value: 24 },
  { x: 7, value: 40 },
  { x: 8, value: 8 },
];
const PASCAL_VALUES = PASCAL_DATA.map((p) => p.value);
const OPTS = { period: 3 };

const PMA_EXPECTED = [null, null, 16, 20, 22, 18, 24, 28];
const ZONE_EXPECTED = [
  'none',
  'none',
  'equal',
  'below',
  'above',
  'below',
  'below',
  'above',
];

describe('getLinePascalFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLinePascalFinitePoints([
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
    expect(getLinePascalFinitePoints(null)).toEqual([]);
    expect(getLinePascalFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLinePascalFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLinePascalFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLinePascalPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLinePascalPeriod(20, 5)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLinePascalPeriod(8.9, 5)).toBe(8);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLinePascalPeriod(0, 5)).toBe(5);
    expect(normalizeLinePascalPeriod(-4, 5)).toBe(5);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLinePascalPeriod(Number.NaN, 5)).toBe(5);
    expect(normalizeLinePascalPeriod('x', 5)).toBe(5);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLinePascalPeriod(1, 5)).toBe(1);
  });
});

describe('computeLinePascalWeights', () => {
  it('is a single unit weight for period one', () => {
    expect(computeLinePascalWeights(1)).toEqual([1]);
  });

  it('is row one of Pascal triangle for period two', () => {
    expect(computeLinePascalWeights(2)).toEqual([1, 1]);
  });

  it('is row two of Pascal triangle for period three', () => {
    expect(computeLinePascalWeights(3)).toEqual([1, 2, 1]);
  });

  it('is row three of Pascal triangle for period four', () => {
    expect(computeLinePascalWeights(4)).toEqual([1, 3, 3, 1]);
  });

  it('is row four of Pascal triangle for period five', () => {
    expect(computeLinePascalWeights(5)).toEqual([1, 4, 6, 4, 1]);
  });

  it('returns one weight per slot', () => {
    expect(computeLinePascalWeights(7)).toHaveLength(7);
  });

  it('is symmetric about the centre of the window', () => {
    const weights = computeLinePascalWeights(6);
    for (let k = 0; k < weights.length; k += 1) {
      expect(weights[k]).toBe(weights[weights.length - 1 - k]);
    }
  });

  it('sums to a power of two', () => {
    const weights = computeLinePascalWeights(5);
    const sum = weights.reduce((a, b) => a + b, 0);
    expect(sum).toBe(2 ** 4);
  });
});

describe('computeLinePascal', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLinePascal(null, 3)).toEqual([]);
  });

  it('is the identity for period one', () => {
    expect(computeLinePascal([5, 10, 15], 1)).toEqual([5, 10, 15]);
  });

  it('matches the input length', () => {
    expect(computeLinePascal(PASCAL_VALUES, 3)).toHaveLength(
      PASCAL_VALUES.length,
    );
  });

  it('keeps the warm-up window null', () => {
    const pma = computeLinePascal(PASCAL_VALUES, 3);
    expect(pma[0]).toBeNull();
    expect(pma[1]).toBeNull();
  });

  it('is the exact binomial weighted average for period three', () => {
    expect(computeLinePascal(PASCAL_VALUES, 3)).toEqual(PMA_EXPECTED);
  });

  it('divides by a power of two exactly, including dyadic fractions', () => {
    // (10 + 2*10 + 11) / 4 = 41 / 4 = 10.25 -- exact in binary.
    expect(computeLinePascal([10, 10, 11], 3)).toEqual([null, null, 10.25]);
  });

  it('keeps a constant series at its constant level', () => {
    expect(computeLinePascal([10, 10, 10, 10, 10], 3)).toEqual([
      null,
      null,
      10,
      10,
      10,
    ]);
  });

  it('is all null when the period exceeds the series length', () => {
    expect(computeLinePascal([1, 2, 3], 5)).toEqual([null, null, null]);
  });

  it('yields null for a window with a non-finite value', () => {
    const pma = computeLinePascal([16, Number.NaN, 16, 32], 3);
    expect(pma[2]).toBeNull();
    expect(pma[3]).toBeNull();
  });

  it('defines one value per full window', () => {
    const pma = computeLinePascal(PASCAL_VALUES, 3);
    expect(pma.filter((v) => v !== null)).toHaveLength(
      PASCAL_VALUES.length - 2,
    );
  });
});

describe('classifyLinePascalZone', () => {
  it('is above when the PMA exceeds the price', () => {
    expect(classifyLinePascalZone(25, 20)).toBe('above');
  });

  it('is below when the PMA is under the price', () => {
    expect(classifyLinePascalZone(15, 20)).toBe('below');
  });

  it('is equal when the PMA matches the price', () => {
    expect(classifyLinePascalZone(20, 20)).toBe('equal');
  });

  it('is none for a null PMA', () => {
    expect(classifyLinePascalZone(null, 20)).toBe('none');
  });

  it('is none for a non-finite PMA', () => {
    expect(classifyLinePascalZone(Number.NaN, 20)).toBe('none');
  });
});

describe('runLinePascal', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLinePascal([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default period', () => {
    expect(runLinePascal(PASCAL_DATA).period).toBe(5);
  });

  it('honours a custom period', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).period).toBe(3);
  });

  it('carries the binomial weights', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).weights).toEqual([1, 2, 1]);
  });

  it('keeps the warm-up PMA null', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).pma[0]).toBeNull();
  });

  it('computes the exact PMA series', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).pma).toEqual(PMA_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLinePascal(PASCAL_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLinePascal(PASCAL_DATA, OPTS);
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(1);
  });

  it('reports the final PMA', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).pmaFinal).toBe(28);
  });

  it('emits one sample per point', () => {
    expect(runLinePascal(PASCAL_DATA, OPTS).samples).toHaveLength(
      PASCAL_DATA.length,
    );
  });

  it('sorts the input by x', () => {
    const shuffled = [...PASCAL_DATA].reverse();
    const run = runLinePascal(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(PASCAL_DATA.map((p) => p.x));
    expect(run.pma).toEqual(PMA_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLinePascal([], OPTS).ok).toBe(false);
    expect(runLinePascal(null, OPTS).ok).toBe(false);
  });
});

describe('computeLinePascalLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLinePascalLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLinePascalLayout({
      data: PASCAL_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('builds the price and PMA paths', () => {
    const layout = computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.pmaPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(PASCAL_DATA.length);
  });

  it('emits one marker per bar with a defined PMA', () => {
    const layout = computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(PASCAL_DATA.length - 2);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLinePascalLayout({ data: PASCAL_DATA, ...OPTS });
    expect(layout.run.pmaFinal).toBe(28);
  });
});

describe('describeLinePascalChart', () => {
  it('names the indicator', () => {
    expect(describeLinePascalChart(PASCAL_DATA, OPTS)).toContain(
      'Pascal Triangle Moving Average',
    );
  });

  it('mentions the binomial coefficient weighting', () => {
    const text = describeLinePascalChart(PASCAL_DATA, OPTS);
    expect(text).toContain('binomial');
    expect(text).toContain('window');
  });

  it('reports the zone counts', () => {
    const text = describeLinePascalChart(PASCAL_DATA, OPTS);
    expect(text).toContain('above the price on 2');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLinePascalChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLinePascal component', () => {
  it('renders a labelled region', () => {
    render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pascal-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Pascal Triangle Moving Average');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLinePascal data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pascal-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-pascal"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-above-count')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('8');
  });

  it('renders an img-role svg', () => {
    render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and PMA lines', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-pascal-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-pascal-pma-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar with a defined PMA', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pascal-marker"]',
    );
    expect(markers).toHaveLength(PASCAL_DATA.length - 2);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-pascal-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'equal',
      'below',
      'above',
      'below',
      'below',
      'above',
    ]);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pascal-badge-config"]',
    );
    expect(badge?.textContent).toBe('PMA 3');
  });

  it('hides the PMA line when its legend item is toggled', () => {
    const { container } = render(<ChartLinePascal data={PASCAL_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-pascal-legend-item"][data-series-id="pma"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-pascal-pma-path"]'),
    ).not.toBeInTheDocument();
  });

  it('hides the PMA line when showPma is false', () => {
    const { container } = render(
      <ChartLinePascal data={PASCAL_DATA} {...OPTS} showPma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pascal-pma-path"]'),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLinePascal data={PASCAL_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pascal-price-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLinePascal data={PASCAL_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-pascal-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePascal ref={ref} data={PASCAL_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-pascal');
  });
});
