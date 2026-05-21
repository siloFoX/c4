import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineTypical,
  computeLineTypical,
  computeLineTypicalLayout,
  describeLineTypicalChart,
  getLineTypicalFinitePoints,
  runLineTypical,
  type ChartLineTypicalPoint,
} from './chart-line-typical';

/**
 * Fixture: 8 OHLC bars chosen so every high + low + close is a multiple of
 * 3, making the Typical Price (high + low + close) / 3 an exact integer.
 * The close sits above, below and level with the Typical Price across the
 * series, so all three zones are exercised.
 */
const TYPICAL_DATA: ChartLineTypicalPoint[] = [
  { x: 1, high: 12, low: 6, close: 9 },
  { x: 2, high: 15, low: 9, close: 15 },
  { x: 3, high: 18, low: 12, close: 12 },
  { x: 4, high: 21, low: 15, close: 18 },
  { x: 5, high: 24, low: 12, close: 24 },
  { x: 6, high: 27, low: 15, close: 15 },
  { x: 7, high: 30, low: 21, close: 27 },
  { x: 8, high: 33, low: 18, close: 21 },
];

const TYPICAL_EXPECTED = [9, 13, 14, 18, 20, 19, 26, 24];
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

describe('getLineTypicalFinitePoints', () => {
  it('keeps only bars with finite x, high, low and close', () => {
    const out = getLineTypicalFinitePoints([
      { x: 1, high: 12, low: 6, close: 9 },
      { x: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 3, high: Number.POSITIVE_INFINITY, low: 5, close: 7 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
    expect(out).toEqual([
      { x: 1, high: 12, low: 6, close: 9 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineTypicalFinitePoints(null)).toEqual([]);
    expect(getLineTypicalFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineTypicalFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineTypicalFinitePoints([
      { x: 9, high: 5, low: 1, close: 3 },
      { x: 2, high: 6, low: 2, close: 4 },
      { x: 5, high: 7, low: 3, close: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('computeLineTypical', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineTypical(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineTypical([])).toEqual([]);
  });

  it('averages the high, low and close of each bar', () => {
    expect(computeLineTypical(TYPICAL_DATA)).toEqual(TYPICAL_EXPECTED);
  });

  it('matches the input length', () => {
    expect(computeLineTypical(TYPICAL_DATA)).toHaveLength(TYPICAL_DATA.length);
  });

  it('yields null for a bar with a non-finite field', () => {
    const out = computeLineTypical([
      { x: 1, high: 12, low: 6, close: 9 },
      { x: 2, high: Number.NaN, low: 6, close: 9 },
    ]);
    expect(out[0]).toBe(9);
    expect(out[1]).toBeNull();
  });

  it('equals the close when the bar high, low and close are all equal', () => {
    expect(
      computeLineTypical([{ x: 1, high: 10, low: 10, close: 10 }]),
    ).toEqual([10]);
  });
});

describe('runLineTypical', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(runLineTypical([{ x: 1, high: 12, low: 6, close: 9 }]).ok).toBe(
      false,
    );
  });

  it('is ok for the fixture', () => {
    expect(runLineTypical(TYPICAL_DATA).ok).toBe(true);
  });

  it('computes the exact Typical Price series', () => {
    expect(runLineTypical(TYPICAL_DATA).typical).toEqual(TYPICAL_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('emits one sample per bar', () => {
    expect(runLineTypical(TYPICAL_DATA).samples).toHaveLength(
      TYPICAL_DATA.length,
    );
  });

  it('carries the high, low and close on each sample', () => {
    const sample = runLineTypical(TYPICAL_DATA).samples[0]!;
    expect(sample.high).toBe(12);
    expect(sample.low).toBe(6);
    expect(sample.close).toBe(9);
    expect(sample.typical).toBe(9);
  });

  it('marks a bar above when the Typical Price exceeds the close', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.samples[2]!.zone).toBe('above');
    expect(run.samples[2]!.typical).toBeGreaterThan(run.samples[2]!.close);
  });

  it('marks a bar below when the Typical Price is under the close', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.samples[1]!.zone).toBe('below');
    expect(run.samples[1]!.typical).toBeLessThan(run.samples[1]!.close);
  });

  it('marks a bar equal when the Typical Price matches the close', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.samples[0]!.zone).toBe('equal');
    expect(run.samples[0]!.typical).toBe(run.samples[0]!.close);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(3);
    expect(run.equalCount).toBe(2);
    expect(run.aboveCount + run.belowCount + run.equalCount).toBe(
      run.samples.length,
    );
  });

  it('reports the final Typical Price and close', () => {
    const run = runLineTypical(TYPICAL_DATA);
    expect(run.typicalFinal).toBe(24);
    expect(run.closeFinal).toBe(21);
  });

  it('sorts the input by x', () => {
    const shuffled = [...TYPICAL_DATA].reverse();
    const run = runLineTypical(shuffled);
    expect(run.series.map((p) => p.x)).toEqual(TYPICAL_DATA.map((p) => p.x));
    expect(run.typical).toEqual(TYPICAL_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLineTypical([]).ok).toBe(false);
    expect(runLineTypical(null).ok).toBe(false);
  });
});

describe('computeLineTypicalLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineTypicalLayout({
      data: [{ x: 1, high: 12, low: 6, close: 9 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineTypicalLayout({
      data: TYPICAL_DATA,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineTypicalLayout({ data: TYPICAL_DATA }).ok).toBe(true);
  });

  it('builds the close and Typical Price paths', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    expect(layout.closePath.startsWith('M')).toBe(true);
    expect(layout.typicalPath.startsWith('M')).toBe(true);
  });

  it('emits one close dot per bar', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    expect(layout.closeDots).toHaveLength(TYPICAL_DATA.length);
  });

  it('emits one marker per bar with a defined Typical Price', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    expect(layout.markers).toHaveLength(TYPICAL_DATA.length);
  });

  it('spans the value domain over the close and Typical Price', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    expect(layout.valueMin).toBeLessThanOrEqual(9);
    expect(layout.valueMax).toBeGreaterThanOrEqual(27);
  });

  it('keeps every marker inside the panel', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    for (const marker of layout.markers) {
      expect(marker.cy).toBeGreaterThanOrEqual(layout.innerTop - 0.01);
      expect(marker.cy).toBeLessThanOrEqual(layout.innerBottom + 0.01);
    }
  });

  it('carries the run on the layout', () => {
    const layout = computeLineTypicalLayout({ data: TYPICAL_DATA });
    expect(layout.run.typicalFinal).toBe(24);
  });
});

describe('describeLineTypicalChart', () => {
  it('names the indicator', () => {
    expect(describeLineTypicalChart(TYPICAL_DATA)).toContain('Typical Price');
  });

  it('mentions the average of high, low and close', () => {
    const text = describeLineTypicalChart(TYPICAL_DATA);
    expect(text).toContain('average');
    expect(text).toContain('high');
    expect(text).toContain('low');
  });

  it('reports the zone counts', () => {
    const text = describeLineTypicalChart(TYPICAL_DATA);
    expect(text).toContain('above the close on 3');
    expect(text).toContain('below on 3');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineTypicalChart([])).toBe('No data');
  });
});

describe('ChartLineTypical component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineTypical data={TYPICAL_DATA} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const desc = container.querySelector(
      '[data-section="chart-line-typical-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Typical Price');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineTypical data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-typical-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run summary', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const root = container.querySelector('[data-section="chart-line-typical"]');
    expect(root?.getAttribute('data-total-points')).toBe('8');
    expect(root?.getAttribute('data-typical-final')).toBe('24');
    expect(root?.getAttribute('data-above-count')).toBe('3');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineTypical data={TYPICAL_DATA} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the close and Typical Price lines', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    expect(
      container.querySelector('[data-section="chart-line-typical-close-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-typical-typical-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-typical-marker"]',
    );
    expect(markers).toHaveLength(TYPICAL_DATA.length);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-typical-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual(
      ZONE_EXPECTED,
    );
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const badge = container.querySelector(
      '[data-section="chart-line-typical-badge-config"]',
    );
    expect(badge?.textContent).toBe('HLC/3');
  });

  it('hides the Typical Price line when its legend item is toggled', () => {
    const { container } = render(<ChartLineTypical data={TYPICAL_DATA} />);
    const button = container.querySelector(
      '[data-section="chart-line-typical-legend-item"][data-series-id="typical"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector(
        '[data-section="chart-line-typical-typical-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('hides the Typical Price line when showTypical is false', () => {
    const { container } = render(
      <ChartLineTypical data={TYPICAL_DATA} showTypical={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-typical-typical-path"]',
      ),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the close line', () => {
    const { container } = render(
      <ChartLineTypical data={TYPICAL_DATA} hiddenSeries={['close']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-typical-close-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineTypical data={TYPICAL_DATA} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-typical-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTypical ref={ref} data={TYPICAL_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-typical',
    );
  });
});
