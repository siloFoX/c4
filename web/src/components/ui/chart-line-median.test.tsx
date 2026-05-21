import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineMedian,
  computeLineMedian,
  computeLineMedianLayout,
  describeLineMedianChart,
  getLineMedianFinitePoints,
  runLineMedian,
  type ChartLineMedianPoint,
} from './chart-line-median';

/**
 * Fixture: 8 OHLC bars whose high and low share parity, so the Median Price
 * (high + low) / 2 is always an exact integer. The close sits above, below
 * and level with the Median Price across the series, exercising all three
 * zones.
 */
const MEDIAN_DATA: ChartLineMedianPoint[] = [
  { x: 1, high: 20, low: 10, close: 15 },
  { x: 2, high: 24, low: 16, close: 24 },
  { x: 3, high: 30, low: 14, close: 14 },
  { x: 4, high: 36, low: 24, close: 30 },
  { x: 5, high: 40, low: 28, close: 40 },
  { x: 6, high: 44, low: 20, close: 20 },
  { x: 7, high: 50, low: 38, close: 50 },
  { x: 8, high: 54, low: 30, close: 32 },
];

const MEDIAN_EXPECTED = [15, 20, 22, 30, 34, 32, 44, 42];
const ZONE_EXPECTED = [
  'equal',
  'below',
  'above',
  'equal',
  'below',
  'above',
  'below',
  'above',
];

describe('getLineMedianFinitePoints', () => {
  it('keeps only bars with finite x, high, low and close', () => {
    const out = getLineMedianFinitePoints([
      { x: 1, high: 20, low: 10, close: 15 },
      { x: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 3, high: 12, low: Number.POSITIVE_INFINITY, close: 7 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
    expect(out).toEqual([
      { x: 1, high: 20, low: 10, close: 15 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineMedianFinitePoints(null)).toEqual([]);
    expect(getLineMedianFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineMedianFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineMedianFinitePoints([
      { x: 9, high: 5, low: 1, close: 3 },
      { x: 2, high: 6, low: 2, close: 4 },
      { x: 5, high: 7, low: 3, close: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('computeLineMedian', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineMedian(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineMedian([])).toEqual([]);
  });

  it('is the midpoint of each bar high and low', () => {
    expect(computeLineMedian(MEDIAN_DATA)).toEqual(MEDIAN_EXPECTED);
  });

  it('matches the input length', () => {
    expect(computeLineMedian(MEDIAN_DATA)).toHaveLength(MEDIAN_DATA.length);
  });

  it('yields null for a bar with a non-finite high or low', () => {
    const out = computeLineMedian([
      { x: 1, high: 20, low: 10, close: 15 },
      { x: 2, high: Number.NaN, low: 10, close: 15 },
    ]);
    expect(out[0]).toBe(15);
    expect(out[1]).toBeNull();
  });

  it('ignores the close entirely', () => {
    // Same high and low, different close -> identical median.
    const out = computeLineMedian([
      { x: 1, high: 20, low: 10, close: 10 },
      { x: 2, high: 20, low: 10, close: 20 },
    ]);
    expect(out).toEqual([15, 15]);
  });

  it('equals the high and low when the bar high equals the low', () => {
    expect(
      computeLineMedian([{ x: 1, high: 10, low: 10, close: 4 }]),
    ).toEqual([10]);
  });
});

describe('runLineMedian', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineMedian([{ x: 1, high: 20, low: 10, close: 15 }]).ok).toBe(
      false,
    );
  });

  it('is ok for the fixture', () => {
    expect(runLineMedian(MEDIAN_DATA).ok).toBe(true);
  });

  it('computes the exact Median Price series', () => {
    expect(runLineMedian(MEDIAN_DATA).median).toEqual(MEDIAN_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('emits one sample per bar', () => {
    expect(runLineMedian(MEDIAN_DATA).samples).toHaveLength(MEDIAN_DATA.length);
  });

  it('carries the high, low and close on each sample', () => {
    const sample = runLineMedian(MEDIAN_DATA).samples[0]!;
    expect(sample.high).toBe(20);
    expect(sample.low).toBe(10);
    expect(sample.close).toBe(15);
    expect(sample.median).toBe(15);
  });

  it('marks a bar above when the Median Price exceeds the close', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.samples[2]!.zone).toBe('above');
    expect(run.samples[2]!.median).toBeGreaterThan(run.samples[2]!.close);
  });

  it('marks a bar below when the Median Price is under the close', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.samples[1]!.zone).toBe('below');
    expect(run.samples[1]!.median).toBeLessThan(run.samples[1]!.close);
  });

  it('marks a bar equal when the Median Price matches the close', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.samples[0]!.zone).toBe('equal');
    expect(run.samples[0]!.median).toBe(run.samples[0]!.close);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(2);
    expect(run.aboveCount + run.belowCount + run.equalCount).toBe(
      run.samples.length,
    );
  });

  it('reports the final Median Price and close', () => {
    const run = runLineMedian(MEDIAN_DATA);
    expect(run.medianFinal).toBe(42);
    expect(run.closeFinal).toBe(32);
  });

  it('sorts the input by x', () => {
    const shuffled = [...MEDIAN_DATA].reverse();
    const run = runLineMedian(shuffled);
    expect(run.series.map((p) => p.x)).toEqual(MEDIAN_DATA.map((p) => p.x));
    expect(run.median).toEqual(MEDIAN_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLineMedian([]).ok).toBe(false);
    expect(runLineMedian(null).ok).toBe(false);
  });
});

describe('computeLineMedianLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineMedianLayout({
      data: [{ x: 1, high: 20, low: 10, close: 15 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineMedianLayout({
      data: MEDIAN_DATA,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineMedianLayout({ data: MEDIAN_DATA }).ok).toBe(true);
  });

  it('builds the close and Median Price paths', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    expect(layout.closePath.startsWith('M')).toBe(true);
    expect(layout.medianPath.startsWith('M')).toBe(true);
  });

  it('emits one close dot per bar', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    expect(layout.closeDots).toHaveLength(MEDIAN_DATA.length);
  });

  it('emits one marker per bar with a defined Median Price', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    expect(layout.markers).toHaveLength(MEDIAN_DATA.length);
  });

  it('spans the value domain over the close and Median Price', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    expect(layout.valueMin).toBeLessThanOrEqual(14);
    expect(layout.valueMax).toBeGreaterThanOrEqual(50);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineMedianLayout({ data: MEDIAN_DATA });
    expect(layout.run.medianFinal).toBe(42);
  });
});

describe('describeLineMedianChart', () => {
  it('names the indicator', () => {
    expect(describeLineMedianChart(MEDIAN_DATA)).toContain('Median Price');
  });

  it('mentions the midpoint of the high and low', () => {
    const text = describeLineMedianChart(MEDIAN_DATA);
    expect(text).toContain('midpoint');
    expect(text).toContain('high');
    expect(text).toContain('low');
  });

  it('reports the zone counts', () => {
    const text = describeLineMedianChart(MEDIAN_DATA);
    expect(text).toContain('above the close on 3');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineMedianChart([])).toBe('No data');
  });
});

describe('ChartLineMedian component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineMedian data={MEDIAN_DATA} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-median-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Median Price');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineMedian data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-median-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const root = container.querySelector('[data-section="chart-line-median"]');
    expect(root?.getAttribute('data-total-points')).toBe('8');
    expect(root?.getAttribute('data-median-final')).toBe('42');
    expect(root?.getAttribute('data-above-count')).toBe('3');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineMedian data={MEDIAN_DATA} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the close and Median Price lines', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-median-close-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-median-median-path"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-median-marker"]',
    );
    expect(markers).toHaveLength(MEDIAN_DATA.length);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-median-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual(
      ZONE_EXPECTED,
    );
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-median-badge-config"]',
    );
    expect(badge?.textContent).toBe('HL/2');
  });

  it('hides the Median Price line when its legend item is toggled', () => {
    const { container } = render(<ChartLineMedian data={MEDIAN_DATA} />);
    const button = container.querySelector(
      '[data-section="chart-line-median-legend-item"][data-series-id="median"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-median-median-path"]'),
    ).not.toBeInTheDocument();
  });

  it('hides the Median Price line when showMedian is false', () => {
    const { container } = render(
      <ChartLineMedian data={MEDIAN_DATA} showMedian={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-median-median-path"]'),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the close line', () => {
    const { container } = render(
      <ChartLineMedian data={MEDIAN_DATA} hiddenSeries={['close']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-median-close-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineMedian data={MEDIAN_DATA} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-median-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMedian ref={ref} data={MEDIAN_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-median',
    );
  });
});
