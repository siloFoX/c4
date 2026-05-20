import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineCmf,
  computeLineCmf,
  computeLineCmfMfm,
  computeLineCmfLayout,
  getLineCmfFinitePoints,
  normalizeLineCmfPeriod,
  runLineCmf,
  describeLineCmfChart,
  type ChartLineCmfPoint,
} from './chart-line-cmf';

afterEach(() => cleanup());

// Every bar has high 12, low 4 (range 8) so the multiplier is exact:
//   mfm = (2*close - high - low) / (high - low)
//   close 12 -> +1, close 4 -> -1, close 10 -> +0.5, close 6 -> -0.5
// Volumes in any three consecutive bars sum to 400.
const CMF_DATA: ChartLineCmfPoint[] = [
  { x: 0, high: 12, low: 4, close: 12, volume: 100 },
  { x: 1, high: 12, low: 4, close: 4, volume: 100 },
  { x: 2, high: 12, low: 4, close: 10, volume: 200 },
  { x: 3, high: 12, low: 4, close: 6, volume: 100 },
  { x: 4, high: 12, low: 4, close: 12, volume: 100 },
];

// Hand-verified with period 3:
//   mfm = [1, -1, 0.5, -0.5, 1]
//   mfv = mfm * volume = [100, -100, 100, -50, 100]
//   cmf[i] = sum(mfv window) / sum(volume window), defined from index 2
//     cmf[2] = (100 - 100 + 100) / 400 =  0.25
//     cmf[3] = (-100 + 100 - 50) / 400 = -0.125
//     cmf[4] = (100 - 50 + 100) / 400 =  0.375
//   cmf = [null, null, 0.25, -0.125, 0.375]

describe('getLineCmfFinitePoints', () => {
  it('keeps only points with finite x, high, low, close and volume', () => {
    const points = getLineCmfFinitePoints([
      { x: 0, high: 10, low: 4, close: 8, volume: 10 },
      { x: NaN, high: 10, low: 4, close: 8, volume: 10 },
      { x: 1, high: Infinity, low: 4, close: 8, volume: 10 },
      { x: 2, high: 10, low: NaN, close: 8, volume: 10 },
      { x: 3, high: 10, low: 4, close: Infinity, volume: 10 },
      { x: 4, high: 10, low: 4, close: 8, volume: NaN },
      { x: 5, high: 10, low: 4, close: 8, volume: 20 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 5]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineCmfFinitePoints(null)).toEqual([]);
    expect(getLineCmfFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCmfPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineCmfPeriod(3.9, 20)).toBe(3);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineCmfPeriod(0, 20)).toBe(20);
    expect(normalizeLineCmfPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineCmfPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineCmfMfm', () => {
  it('reads +1 when the close sits at the high', () => {
    expect(computeLineCmfMfm([10], [0], [10])).toEqual([1]);
  });

  it('reads -1 when the close sits at the low', () => {
    expect(computeLineCmfMfm([10], [0], [0])).toEqual([-1]);
  });

  it('reads 0 when the close sits at the midpoint', () => {
    expect(computeLineCmfMfm([10], [0], [5])).toEqual([0]);
  });

  it('reads a fractional multiplier between the extremes', () => {
    expect(computeLineCmfMfm([12, 12], [4, 4], [10, 6])).toEqual([0.5, -0.5]);
  });

  it('reads 0 for a zero-range bar', () => {
    expect(computeLineCmfMfm([7], [7], [7])).toEqual([0]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineCmfMfm(null, [0], [0])).toEqual([]);
  });
});

describe('computeLineCmf', () => {
  const highs = CMF_DATA.map((p) => p.high);
  const lows = CMF_DATA.map((p) => p.low);
  const closes = CMF_DATA.map((p) => p.close);
  const volumes = CMF_DATA.map((p) => p.volume);

  it('exposes the money flow multiplier series', () => {
    const { mfm } = computeLineCmf(highs, lows, closes, volumes, 3);
    expect(mfm).toEqual([1, -1, 0.5, -0.5, 1]);
  });

  it('scales the multiplier by volume into money flow volume', () => {
    const { mfv } = computeLineCmf(highs, lows, closes, volumes, 3);
    expect(mfv).toEqual([100, -100, 100, -50, 100]);
  });

  it('divides windowed money flow volume by windowed volume', () => {
    const { cmf } = computeLineCmf(highs, lows, closes, volumes, 3);
    expect(cmf).toEqual([null, null, 0.25, -0.125, 0.375]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const { cmf } = computeLineCmf(highs, lows, closes, volumes, 3);
    expect(cmf[0]).toBeNull();
    expect(cmf[1]).toBeNull();
    expect(cmf[2]).not.toBeNull();
  });

  it('stays within the -1 to +1 bound', () => {
    const { cmf } = computeLineCmf(highs, lows, closes, volumes, 3);
    for (const v of cmf) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reads +1 when every bar in the window closes at the high', () => {
    const { cmf } = computeLineCmf(
      [10, 10, 10],
      [0, 0, 0],
      [10, 10, 10],
      [5, 7, 3],
      3,
    );
    expect(cmf[2]).toBe(1);
  });

  it('reads -1 when every bar in the window closes at the low', () => {
    const { cmf } = computeLineCmf(
      [10, 10, 10],
      [0, 0, 0],
      [0, 0, 0],
      [5, 7, 3],
      3,
    );
    expect(cmf[2]).toBe(-1);
  });

  it('reads 0 for a window with no volume rather than dividing by zero', () => {
    const { cmf } = computeLineCmf(
      [10, 10, 10],
      [0, 0, 0],
      [10, 0, 5],
      [0, 0, 0],
      3,
    );
    expect(cmf[2]).toBe(0);
    expect(Number.isNaN(cmf[2])).toBe(false);
  });

  it('has no warm-up when the period is 1', () => {
    const { cmf } = computeLineCmf(highs, lows, closes, volumes, 1);
    expect(cmf[0]).not.toBeNull();
    expect(cmf[0]).toBe(1);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineCmf(null, lows, closes, volumes, 3)).toEqual({
      mfm: [],
      mfv: [],
      cmf: [],
    });
  });
});

describe('runLineCmf', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineCmf(CMF_DATA, { period: 3 }).ok).toBe(true);
  });

  it('exposes the multiplier, money flow volume and CMF series', () => {
    const run = runLineCmf(CMF_DATA, { period: 3 });
    expect(run.mfm).toEqual([1, -1, 0.5, -0.5, 1]);
    expect(run.mfv).toEqual([100, -100, 100, -50, 100]);
    expect(run.cmf).toEqual([null, null, 0.25, -0.125, 0.375]);
  });

  it('reports the final CMF reading', () => {
    expect(runLineCmf(CMF_DATA, { period: 3 }).cmfFinal).toBe(0.375);
  });

  it('counts buying and selling pressure periods', () => {
    const run = runLineCmf(CMF_DATA, { period: 3 });
    expect(run.buyingCount).toBe(2);
    expect(run.sellingCount).toBe(1);
  });

  it('classifies each sample by CMF sign', () => {
    const run = runLineCmf(CMF_DATA, { period: 3 });
    expect(run.samples[0]!.pressure).toBe('flat');
    expect(run.samples[1]!.pressure).toBe('flat');
    expect(run.samples[2]!.pressure).toBe('buying');
    expect(run.samples[3]!.pressure).toBe('selling');
    expect(run.samples[4]!.pressure).toBe('buying');
  });

  it('leaves warm-up samples with a null CMF', () => {
    const run = runLineCmf(CMF_DATA, { period: 3 });
    expect(run.samples[0]!.cmf).toBeNull();
    expect(run.samples[1]!.cmf).toBeNull();
    expect(run.samples[2]!.cmf).toBe(0.25);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...CMF_DATA].reverse();
    const run = runLineCmf(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.cmf).toEqual([null, null, 0.25, -0.125, 0.375]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineCmf([
      { x: 0, high: 10, low: 4, close: 8, volume: 1 },
    ]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineCmf([]).ok).toBe(false);
    expect(runLineCmf(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineCmf(CMF_DATA, { period: 3 }).samples).toHaveLength(5);
  });

  it('defaults to period 20 and reads no CMF for a short series', () => {
    const run = runLineCmf(CMF_DATA);
    expect(run.period).toBe(20);
    expect(run.cmf.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.cmfFinal)).toBe(true);
  });

  it('exposes the multiplier on every sample', () => {
    const run = runLineCmf(CMF_DATA, { period: 3 });
    expect(run.samples[2]!.mfm).toBe(0.5);
  });
});

describe('computeLineCmfLayout', () => {
  const base = {
    data: CMF_DATA,
    period: 3,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineCmfLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('stacks the price panel above the CMF panel', () => {
    const layout = computeLineCmfLayout(base);
    expect(layout.cmfPanel.y).toBeGreaterThan(layout.pricePanel.y);
    expect(layout.pricePanel.width).toBe(layout.cmfPanel.width);
  });

  it('builds non-empty price and CMF paths', () => {
    const layout = computeLineCmfLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.cmfPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the CMF is defined', () => {
    const layout = computeLineCmfLayout(base);
    expect(layout.markers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('uses a fixed -1 to +1 CMF y-axis', () => {
    const layout = computeLineCmfLayout(base);
    const values = layout.cmfYTicks.map((t) => t.value);
    expect(Math.min(...values)).toBe(-1);
    expect(Math.max(...values)).toBe(1);
  });

  it('places the zero line at the centre of the CMF panel', () => {
    const layout = computeLineCmfLayout(base);
    const mid = layout.cmfPanel.y + layout.cmfPanel.height / 2;
    expect(layout.zeroY).toBeCloseTo(mid, 6);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineCmfLayout(base);
    expect(layout.cmfFinal).toBe(0.375);
    expect(layout.buyingCount).toBe(2);
    expect(layout.sellingCount).toBe(1);
    expect(layout.period).toBe(3);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineCmfLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.cmfPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineCmfLayout({
      ...base,
      data: [{ x: 0, high: 10, low: 4, close: 8, volume: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCmfChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineCmfChart(CMF_DATA, { period: 3 });
    expect(text).toContain('Chaikin Money Flow');
    expect(text).toContain('CMF');
    expect(text).toContain('money flow multiplier');
    expect(text).toContain('volume-weighted average');
    expect(text).toContain('buying pressure');
    expect(text).toContain('selling pressure');
  });

  it('reports the buying and selling counts', () => {
    const text = describeLineCmfChart(CMF_DATA, { period: 3 });
    expect(text).toContain('2 buying');
    expect(text).toContain('1 selling');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineCmfChart([])).toBe('No data');
    expect(describeLineCmfChart(null)).toBe('No data');
  });
});

describe('<ChartLineCmf />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-cmf-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Chaikin Money Flow');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-cmf"]');
    expect(root!.getAttribute('data-cmf-final')).toBe('0.375');
    expect(root!.getAttribute('data-buying-count')).toBe('2');
    expect(root!.getAttribute('data-selling-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and CMF lines', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-cmf-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-cmf-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-cmf-cmf-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined CMF value', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-cmf-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('tags markers with their buying or selling pressure', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const buying = container.querySelector(
      '[data-section="chart-line-cmf-marker"][data-pressure="buying"]',
    );
    const selling = container.querySelector(
      '[data-section="chart-line-cmf-marker"][data-pressure="selling"]',
    );
    expect(buying).not.toBeNull();
    expect(selling).not.toBeNull();
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-cmf-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-cmf-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-cmf-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineCmf data={CMF_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cmf-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cmf-price-path"]'),
    ).toBeNull();
  });

  it('hides the CMF line and markers when showCmf is false', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} showCmf={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cmf-cmf-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-cmf-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cmf-zero-line"]'),
    ).toBeNull();
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-cmf-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineCmf data={[{ x: 0, high: 10, low: 4, close: 8, volume: 1 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-cmf"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-cmf-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cmf-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCmf ref={ref} data={CMF_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-cmf');
  });

  it('has a stable displayName', () => {
    expect(ChartLineCmf.displayName).toBe('ChartLineCmf');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineCmf data={CMF_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-cmf"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
