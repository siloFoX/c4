import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineWeightedClose,
  computeLineWeightedClose,
  computeLineWeightedCloseLayout,
  describeLineWeightedCloseChart,
  getLineWeightedCloseFinitePoints,
  runLineWeightedClose,
  type ChartLineWeightedClosePoint,
} from './chart-line-weighted-close';

/**
 * Fixture: 8 OHLC bars with high, low and close all multiples of 4, so the
 * Weighted Close (high + low + 2 * close) / 4 is always an exact integer.
 * The close sits above, below and level with the Weighted Close across the
 * series, exercising all three zones.
 */
const WEIGHTED_CLOSE_DATA: ChartLineWeightedClosePoint[] = [
  { x: 1, high: 16, low: 8, close: 12 },
  { x: 2, high: 20, low: 12, close: 20 },
  { x: 3, high: 28, low: 12, close: 12 },
  { x: 4, high: 24, low: 16, close: 20 },
  { x: 5, high: 32, low: 24, close: 32 },
  { x: 6, high: 36, low: 16, close: 16 },
  { x: 7, high: 40, low: 32, close: 40 },
  { x: 8, high: 44, low: 20, close: 24 },
];

const WC_EXPECTED = [12, 18, 16, 20, 30, 21, 38, 28];
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

describe('getLineWeightedCloseFinitePoints', () => {
  it('keeps only bars with finite x, high, low and close', () => {
    const out = getLineWeightedCloseFinitePoints([
      { x: 1, high: 16, low: 8, close: 12 },
      { x: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 3, high: 12, low: Number.POSITIVE_INFINITY, close: 7 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
    expect(out).toEqual([
      { x: 1, high: 16, low: 8, close: 12 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineWeightedCloseFinitePoints(null)).toEqual([]);
    expect(getLineWeightedCloseFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineWeightedCloseFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineWeightedCloseFinitePoints([
      { x: 9, high: 5, low: 1, close: 3 },
      { x: 2, high: 6, low: 2, close: 4 },
      { x: 5, high: 7, low: 3, close: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('computeLineWeightedClose', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWeightedClose(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineWeightedClose([])).toEqual([]);
  });

  it('averages the high, low and a double-weighted close', () => {
    expect(computeLineWeightedClose(WEIGHTED_CLOSE_DATA)).toEqual(WC_EXPECTED);
  });

  it('matches the input length', () => {
    expect(computeLineWeightedClose(WEIGHTED_CLOSE_DATA)).toHaveLength(
      WEIGHTED_CLOSE_DATA.length,
    );
  });

  it('yields null for a bar with a non-finite field', () => {
    const out = computeLineWeightedClose([
      { x: 1, high: 16, low: 8, close: 12 },
      { x: 2, high: 16, low: 8, close: Number.NaN },
    ]);
    expect(out[0]).toBe(12);
    expect(out[1]).toBeNull();
  });

  it('weights the close more heavily than the high or low', () => {
    // close pulled high: a close at the high should pull the result up.
    const wc = computeLineWeightedClose([
      { x: 1, high: 20, low: 0, close: 20 },
    ]);
    // (20 + 0 + 2*20) / 4 = 15, above the (20+0)/2 = 10 midpoint.
    expect(wc[0]).toBe(15);
  });

  it('equals the close when the bar high, low and close are all equal', () => {
    expect(
      computeLineWeightedClose([{ x: 1, high: 10, low: 10, close: 10 }]),
    ).toEqual([10]);
  });
});

describe('runLineWeightedClose', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(
      runLineWeightedClose([{ x: 1, high: 16, low: 8, close: 12 }]).ok,
    ).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineWeightedClose(WEIGHTED_CLOSE_DATA).ok).toBe(true);
  });

  it('computes the exact Weighted Close series', () => {
    expect(runLineWeightedClose(WEIGHTED_CLOSE_DATA).weighted).toEqual(
      WC_EXPECTED,
    );
  });

  it('classifies the zone of every bar', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('emits one sample per bar', () => {
    expect(runLineWeightedClose(WEIGHTED_CLOSE_DATA).samples).toHaveLength(
      WEIGHTED_CLOSE_DATA.length,
    );
  });

  it('carries the high, low and close on each sample', () => {
    const sample = runLineWeightedClose(WEIGHTED_CLOSE_DATA).samples[0]!;
    expect(sample.high).toBe(16);
    expect(sample.low).toBe(8);
    expect(sample.close).toBe(12);
    expect(sample.weighted).toBe(12);
  });

  it('marks a bar above when the Weighted Close exceeds the close', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.samples[2]!.zone).toBe('above');
    expect(run.samples[2]!.weighted).toBeGreaterThan(run.samples[2]!.close);
  });

  it('marks a bar below when the Weighted Close is under the close', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.samples[1]!.zone).toBe('below');
    expect(run.samples[1]!.weighted).toBeLessThan(run.samples[1]!.close);
  });

  it('marks a bar equal when the Weighted Close matches the close', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.samples[0]!.zone).toBe('equal');
    expect(run.samples[0]!.weighted).toBe(run.samples[0]!.close);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(2);
    expect(run.aboveCount + run.belowCount + run.equalCount).toBe(
      run.samples.length,
    );
  });

  it('reports the final Weighted Close and close', () => {
    const run = runLineWeightedClose(WEIGHTED_CLOSE_DATA);
    expect(run.weightedFinal).toBe(28);
    expect(run.closeFinal).toBe(24);
  });

  it('sorts the input by x', () => {
    const shuffled = [...WEIGHTED_CLOSE_DATA].reverse();
    const run = runLineWeightedClose(shuffled);
    expect(run.series.map((p) => p.x)).toEqual(
      WEIGHTED_CLOSE_DATA.map((p) => p.x),
    );
    expect(run.weighted).toEqual(WC_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLineWeightedClose([]).ok).toBe(false);
    expect(runLineWeightedClose(null).ok).toBe(false);
  });
});

describe('computeLineWeightedCloseLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineWeightedCloseLayout({
      data: [{ x: 1, high: 16, low: 8, close: 12 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(
      computeLineWeightedCloseLayout({ data: WEIGHTED_CLOSE_DATA }).ok,
    ).toBe(true);
  });

  it('builds the close and Weighted Close paths', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    expect(layout.closePath.startsWith('M')).toBe(true);
    expect(layout.weightedPath.startsWith('M')).toBe(true);
  });

  it('emits one close dot per bar', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    expect(layout.closeDots).toHaveLength(WEIGHTED_CLOSE_DATA.length);
  });

  it('emits one marker per bar with a defined Weighted Close', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    expect(layout.markers).toHaveLength(WEIGHTED_CLOSE_DATA.length);
  });

  it('spans the value domain over the close and Weighted Close', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    expect(layout.valueMin).toBeLessThanOrEqual(12);
    expect(layout.valueMax).toBeGreaterThanOrEqual(40);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineWeightedCloseLayout({
      data: WEIGHTED_CLOSE_DATA,
    });
    expect(layout.run.weightedFinal).toBe(28);
  });
});

describe('describeLineWeightedCloseChart', () => {
  it('names the indicator', () => {
    expect(describeLineWeightedCloseChart(WEIGHTED_CLOSE_DATA)).toContain(
      'Weighted Close',
    );
  });

  it('mentions the average of high, low and a double-weighted close', () => {
    const text = describeLineWeightedCloseChart(WEIGHTED_CLOSE_DATA);
    expect(text).toContain('average');
    expect(text).toContain('double-weighted');
    expect(text).toContain('high');
  });

  it('reports the zone counts', () => {
    const text = describeLineWeightedCloseChart(WEIGHTED_CLOSE_DATA);
    expect(text).toContain('above the close on 3');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineWeightedCloseChart([])).toBe('No data');
  });
});

describe('ChartLineWeightedClose component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-weighted-close-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Weighted Close');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineWeightedClose data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-weighted-close"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('8');
    expect(root?.getAttribute('data-weighted-final')).toBe('28');
    expect(root?.getAttribute('data-above-count')).toBe('3');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the close and Weighted Close lines', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-close-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-weighted-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-weighted-close-marker"]',
    );
    expect(markers).toHaveLength(WEIGHTED_CLOSE_DATA.length);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const markers = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-weighted-close-marker"]',
      ),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual(
      ZONE_EXPECTED,
    );
  });

  it('shows the config badge', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-weighted-close-badge-config"]',
    );
    expect(badge?.textContent).toBe('HLCC/4');
  });

  it('hides the Weighted Close line when its legend item is toggled', () => {
    const { container } = render(
      <ChartLineWeightedClose data={WEIGHTED_CLOSE_DATA} />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-weighted-close-legend-item"][data-series-id="weighted"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-weighted-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the Weighted Close line when showWeighted is false', () => {
    const { container } = render(
      <ChartLineWeightedClose
        data={WEIGHTED_CLOSE_DATA}
        showWeighted={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-weighted-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the close line', () => {
    const { container } = render(
      <ChartLineWeightedClose
        data={WEIGHTED_CLOSE_DATA}
        hiddenSeries={['close']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-weighted-close-close-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineWeightedClose
        data={WEIGHTED_CLOSE_DATA}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-weighted-close-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWeightedClose ref={ref} data={WEIGHTED_CLOSE_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-weighted-close',
    );
  });
});
