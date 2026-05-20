import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineLsma,
  computeLineLsma,
  computeLineLsmaSlope,
  computeLineLsmaLayout,
  getLineLsmaFinitePoints,
  normalizeLineLsmaPeriod,
  runLineLsma,
  describeLineLsmaChart,
  type ChartLineLsmaPoint,
} from './chart-line-lsma';

afterEach(() => cleanup());

// With period 3 each LSMA value is the endpoint of a least-squares
// line fitted over the last three prices, read at the newest bar.
// For a window [y0, y1, y2] with relative x = 0,1,2 the endpoint is
// mean + slope, where slope = (y2 - y0) / 2:
//   W@2 = [2,4,6]  -> mean 4,  slope 2,  lsma 6   (linear -> on)
//   W@3 = [4,6,14] -> mean 8,  slope 5,  lsma 13  (concave up -> above)
//   W@4 = [6,14,10]-> mean 10, slope 2,  lsma 12  (concave down -> below)
//   W@5 = [14,10,12]-> mean 12, slope -1, lsma 11 (concave up -> above)
//   lsma  = [null, null, 6, 13, 12, 11]
//   slope = [null, null, 2, 5,  2,  -1]
const LSMA_DATA: ChartLineLsmaPoint[] = [
  { x: 0, value: 2 },
  { x: 1, value: 4 },
  { x: 2, value: 6 },
  { x: 3, value: 14 },
  { x: 4, value: 10 },
  { x: 5, value: 12 },
];

// A perfectly linear ramp y = 1 + 2x. A regression line fitted over
// any window of a straight series IS that series, so its endpoint
// reproduces the price exactly from index period-1 onward.
const RAMP: number[] = [1, 3, 5, 7, 9, 11];

describe('getLineLsmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineLsmaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineLsmaFinitePoints(null)).toEqual([]);
    expect(getLineLsmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineLsmaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineLsmaPeriod(25.8, 25)).toBe(25);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineLsmaPeriod(0, 25)).toBe(25);
    expect(normalizeLineLsmaPeriod(NaN, 25)).toBe(25);
    expect(normalizeLineLsmaPeriod(-3, 25)).toBe(25);
  });
});

describe('computeLineLsma', () => {
  const values = LSMA_DATA.map((p) => p.value);

  it('traces the endpoint of the rolling least-squares regression', () => {
    expect(computeLineLsma(values, 3)).toEqual([null, null, 6, 13, 12, 11]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const lsma = computeLineLsma(values, 3);
    expect(lsma[0]).toBeNull();
    expect(lsma[1]).toBeNull();
    expect(lsma[2]).not.toBeNull();
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineLsma([3, 7, 9], 1)).toEqual([3, 7, 9]);
  });

  it('reads the latest value for a period of two (two points fix a line)', () => {
    expect(computeLineLsma(values, 2)).toEqual([null, 4, 6, 14, 10, 12]);
  });

  it('reproduces a perfectly linear series from index period-1', () => {
    expect(computeLineLsma(RAMP, 4)).toEqual([null, null, null, 7, 9, 11]);
  });

  it('holds a flat series exactly at its constant', () => {
    expect(computeLineLsma([5, 5, 5, 5], 3)).toEqual([null, null, 5, 5]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineLsma([4, 8], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineLsma(null, 3)).toEqual([]);
  });
});

describe('computeLineLsmaSlope', () => {
  const values = LSMA_DATA.map((p) => p.value);

  it('exposes the regression slope per window', () => {
    expect(computeLineLsmaSlope(values, 3)).toEqual([null, null, 2, 5, 2, -1]);
  });

  it('reads a flat slope of zero for a constant series', () => {
    expect(computeLineLsmaSlope([5, 5, 5, 5], 3)).toEqual([null, null, 0, 0]);
  });

  it('reads a constant slope for a perfectly linear series', () => {
    expect(computeLineLsmaSlope(RAMP, 4)).toEqual([null, null, null, 2, 2, 2]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const slope = computeLineLsmaSlope(values, 3);
    expect(slope[0]).toBeNull();
    expect(slope[2]).toBe(2);
  });

  it('reads a zero slope for a period of one', () => {
    expect(computeLineLsmaSlope([3, 7, 9], 1)).toEqual([0, 0, 0]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineLsmaSlope(null, 3)).toEqual([]);
  });
});

describe('runLineLsma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineLsma(LSMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineLsma(LSMA_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the LSMA series', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.lsma).toEqual([null, null, 6, 13, 12, 11]);
  });

  it('exposes the regression slope series', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.slope).toEqual([null, null, 2, 5, 2, -1]);
  });

  it('reports the final, min and max LSMA readings', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.lsmaFinal).toBe(11);
    expect(run.lsmaMin).toBe(6);
    expect(run.lsmaMax).toBe(13);
  });

  it('reports the final slope reading', () => {
    expect(runLineLsma(LSMA_DATA, { period: 3 }).slopeFinal).toBe(-1);
  });

  it('classifies each sample by price position versus the LSMA', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.samples[2]!.position).toBe('on');
    expect(run.samples[3]!.position).toBe('above');
    expect(run.samples[4]!.position).toBe('below');
    expect(run.samples[5]!.position).toBe('above');
  });

  it('counts bars above and below the LSMA', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(1);
  });

  it('leaves warm-up samples with a null LSMA and slope', () => {
    const run = runLineLsma(LSMA_DATA, { period: 3 });
    expect(run.samples[0]!.lsma).toBeNull();
    expect(run.samples[0]!.slope).toBeNull();
    expect(run.samples[2]!.lsma).toBe(6);
    expect(run.samples[2]!.slope).toBe(2);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...LSMA_DATA].reverse();
    const run = runLineLsma(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(run.lsma).toEqual([null, null, 6, 13, 12, 11]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineLsma([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineLsma([]).ok).toBe(false);
    expect(runLineLsma(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineLsma(LSMA_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('defaults to period 25 and reads no LSMA for a short series', () => {
    const run = runLineLsma(LSMA_DATA);
    expect(run.period).toBe(25);
    expect(run.lsma.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.lsmaFinal)).toBe(true);
  });
});

describe('computeLineLsmaLayout', () => {
  const base = {
    data: LSMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineLsmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(6);
  });

  it('builds non-empty price and LSMA paths', () => {
    const layout = computeLineLsmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.lsmaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the LSMA is defined', () => {
    const layout = computeLineLsmaLayout(base);
    expect(layout.lsmaMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(6);
  });

  it('spans a y domain covering both the price and the LSMA', () => {
    const layout = computeLineLsmaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(2);
    expect(layout.yMax).toBeGreaterThanOrEqual(14);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineLsmaLayout(base);
    expect(layout.lsmaFinal).toBe(11);
    expect(layout.slopeFinal).toBe(-1);
    expect(layout.aboveCount).toBe(2);
    expect(layout.period).toBe(3);
  });

  it('keeps the LSMA markers inside the panel', () => {
    const layout = computeLineLsmaLayout(base);
    for (const m of layout.lsmaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineLsmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.lsmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineLsmaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineLsmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineLsmaChart(LSMA_DATA, { period: 3 });
    expect(text).toContain('Least Squares Moving Average');
    expect(text).toContain('LSMA');
    expect(text).toContain('regression');
    expect(text).toContain('endpoint');
    expect(text).toContain('slope');
  });

  it('reports the above and below counts', () => {
    const text = describeLineLsmaChart(LSMA_DATA, { period: 3 });
    expect(text).toContain('above the LSMA on 2');
    expect(text).toContain('below on 1');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineLsmaChart([])).toBe('No data');
    expect(describeLineLsmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineLsma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-lsma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Least Squares Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-lsma"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-lsma-final')).toBe('11');
    expect(root!.getAttribute('data-slope-final')).toBe('-1');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('6');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and LSMA lines', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-lsma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-lsma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-lsma-lsma-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined LSMA value', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-lsma-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-lsma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineLsma data={LSMA_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-lsma-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-lsma-price-path"]'),
    ).toBeNull();
  });

  it('hides the LSMA line and markers when showLsma is false', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} showLsma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-lsma-lsma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-lsma-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the LSMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} hiddenSeries={['lsma']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-lsma-lsma-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineLsma
        data={LSMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-lsma-legend-item"][data-series-id="lsma"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'lsma', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-lsma-dot"]'),
    ).toHaveLength(6);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineLsma data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-lsma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-lsma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-lsma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineLsma ref={ref} data={LSMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-lsma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineLsma.displayName).toBe('ChartLineLsma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineLsma data={LSMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-lsma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
