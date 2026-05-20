import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLinePgo,
  computeLinePgo,
  computeLinePgoAtr,
  computeLinePgoTrueRange,
  computeLinePgoLayout,
  getLinePgoFinitePoints,
  normalizeLinePgoPeriod,
  runLinePgo,
  describeLinePgoChart,
  type ChartLinePgoPoint,
} from './chart-line-pgo';

afterEach(() => cleanup());

// The PGO is (close - SMA(close)) / ATR -- a ratio of plain sums,
// no transcendentals, so the whole pipeline is exact. The fixture
// (period 2) is hand-tuned: every bar has a true range of exactly
// 4, so every ATR is 4 and every PGO divides cleanly by 4.
const PGO_DATA: ChartLinePgoPoint[] = [
  { x: 0, value: 10, high: 12, low: 8 },
  { x: 1, value: 12, high: 13, low: 9 },
  { x: 2, value: 16, high: 16, low: 12 },
  { x: 3, value: 14, high: 16, low: 12 },
  { x: 4, value: 16, high: 17, low: 13 },
  { x: 5, value: 20, high: 20, low: 16 },
  { x: 6, value: 18, high: 20, low: 16 },
  { x: 7, value: 22, high: 22, low: 18 },
];

const PGO_HIGHS = PGO_DATA.map((p) => p.high);
const PGO_LOWS = PGO_DATA.map((p) => p.low);
const PGO_CLOSES = PGO_DATA.map((p) => p.value);
const EXPECTED_PGO = [null, 0.25, 0.5, -0.25, 0.25, 0.5, -0.25, 0.5];

describe('getLinePgoFinitePoints', () => {
  it('keeps only points with finite x, value, high and low', () => {
    const points = getLinePgoFinitePoints([
      { x: 0, value: 5, high: 6, low: 4 },
      { x: NaN, value: 5, high: 6, low: 4 },
      { x: 1, value: Infinity, high: 6, low: 4 },
      { x: 2, value: 9, high: NaN, low: 4 },
      { x: 3, value: 9, high: 11, low: Infinity },
      { x: 4, value: 7, high: 8, low: 6 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 4]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLinePgoFinitePoints(null)).toEqual([]);
    expect(getLinePgoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLinePgoPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLinePgoPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLinePgoPeriod(1, 14)).toBe(14);
    expect(normalizeLinePgoPeriod(NaN, 14)).toBe(14);
    expect(normalizeLinePgoPeriod(-5, 14)).toBe(14);
  });
});

describe('computeLinePgoTrueRange', () => {
  it('computes the true range of each bar', () => {
    expect(
      computeLinePgoTrueRange(PGO_HIGHS, PGO_LOWS, PGO_CLOSES),
    ).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it('uses the bar range for the first bar', () => {
    expect(computeLinePgoTrueRange([20, 30], [10, 25], [15, 28])[0]).toBe(
      10,
    );
  });

  it('widens the true range to span a gap from the prior close', () => {
    expect(computeLinePgoTrueRange([20, 30], [10, 25], [15, 28])[1]).toBe(
      15,
    );
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePgoTrueRange(null, [1], [1])).toEqual([]);
  });
});

describe('computeLinePgoAtr', () => {
  it('averages the true range over the period', () => {
    expect(computeLinePgoAtr(PGO_HIGHS, PGO_LOWS, PGO_CLOSES, 2)).toEqual([
      null,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
    ]);
  });

  it('is null through the warm-up window', () => {
    expect(computeLinePgoAtr(PGO_HIGHS, PGO_LOWS, PGO_CLOSES, 2)[0]).toBeNull();
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLinePgoAtr([12, 13], [8, 9], [10, 12], 5)).toEqual([
      null,
      null,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePgoAtr(null, [1], [1], 2)).toEqual([]);
  });
});

describe('computeLinePgo', () => {
  it('computes the pretty good oscillator', () => {
    expect(computeLinePgo(PGO_HIGHS, PGO_LOWS, PGO_CLOSES, 2)).toEqual(
      EXPECTED_PGO,
    );
  });

  it('is null through the warm-up window', () => {
    expect(computeLinePgo(PGO_HIGHS, PGO_LOWS, PGO_CLOSES, 2)[0]).toBeNull();
  });

  it('is zero when the close sits on its moving average', () => {
    expect(
      computeLinePgo(
        [12, 12, 12, 12],
        [8, 8, 8, 8],
        [10, 10, 10, 10],
        2,
      ),
    ).toEqual([null, 0, 0, 0]);
  });

  it('is null for a perfectly flat market', () => {
    expect(
      computeLinePgo([5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5], 2),
    ).toEqual([null, null, null, null]);
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLinePgo([12, 13], [8, 9], [10, 12], 5)).toEqual([
      null,
      null,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLinePgo(null, [1], [1], 2)).toEqual([]);
  });
});

describe('runLinePgo', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).period).toBe(2);
  });

  it('exposes the pgo series', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).pgo).toHaveLength(8);
  });

  it('computes the exact pgo series', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).pgo).toEqual(EXPECTED_PGO);
  });

  it('leaves the pgo null until the window is full', () => {
    const run = runLinePgo(PGO_DATA, { period: 2 });
    expect(run.samples[0]!.pgo).toBeNull();
    expect(typeof run.samples[1]!.pgo).toBe('number');
  });

  it('classifies each sample by the sign of the pgo', () => {
    const run = runLinePgo(PGO_DATA, { period: 2 });
    for (const s of run.samples) {
      if (s.pgo === null || s.pgo === 0) {
        expect(s.sign).toBe('zero');
      } else {
        expect(s.sign).toBe(s.pgo > 0 ? 'positive' : 'negative');
      }
    }
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLinePgo(PGO_DATA, { period: 2 });
    expect(run.positiveCount).toBe(5);
    expect(run.negativeCount).toBe(2);
    expect(run.positiveCount).toBe(
      run.pgo.filter((v) => v !== null && v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.pgo.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final pgo reading', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).pgoFinal).toBe(0.5);
  });

  it('reports the min and max pgo readings', () => {
    const run = runLinePgo(PGO_DATA, { period: 2 });
    expect(run.pgoMin).toBe(-0.25);
    expect(run.pgoMax).toBe(0.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLinePgo([{ x: 0, value: 5, high: 6, low: 4 }], {
      period: 2,
    });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLinePgo([], { period: 2 }).ok).toBe(false);
    expect(runLinePgo(null, { period: 2 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...PGO_DATA].reverse();
    const run = runLinePgo(shuffled, { period: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('produces one sample per series point', () => {
    expect(runLinePgo(PGO_DATA, { period: 2 }).samples).toHaveLength(8);
  });

  it('defaults to a period of 14', () => {
    expect(runLinePgo(PGO_DATA).period).toBe(14);
  });
});

describe('computeLinePgoLayout', () => {
  const base = {
    data: PGO_DATA,
    period: 2,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('stacks the price panel above the pgo panel', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.pgoPanel.height).toBeGreaterThan(0);
    expect(layout.pgoPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and pgo paths', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.pgoPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined pgo', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.priceDots).toHaveLength(8);
    expect(layout.pgoMarkers).toHaveLength(7);
  });

  it('places the zero line inside the pgo panel', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.pgoPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.pgoPanel.y + layout.pgoPanel.height,
    );
  });

  it('centres the pgo panel y-domain on zero', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.pgoYMin).toBe(-layout.pgoYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLinePgoLayout(base);
    expect(layout.period).toBe(2);
    expect(layout.pgoFinal).toBe(0.5);
    expect(layout.totalPoints).toBe(8);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLinePgoLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pgoPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLinePgoLayout({
      ...base,
      data: [{ x: 0, value: 5, high: 6, low: 4 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLinePgoChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLinePgoChart(PGO_DATA, { period: 2 });
    expect(text).toContain('Pretty Good Oscillator');
    expect(text).toContain('moving average');
    expect(text).toContain('average true range');
  });

  it('reports the positive and negative counts', () => {
    const run = runLinePgo(PGO_DATA, { period: 2 });
    const text = describeLinePgoChart(PGO_DATA, { period: 2 });
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLinePgoChart([])).toBe('No data');
    expect(describeLinePgoChart(null)).toBe('No data');
  });
});

describe('<ChartLinePgo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    const desc = container.querySelector(
      '[data-section="chart-line-pgo-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Pretty Good Oscillator');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    const root = container.querySelector('[data-section="chart-line-pgo"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-positive-count')).toBe('5');
    expect(root!.getAttribute('data-negative-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and pgo lines', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    expect(
      container.querySelector('[data-section="chart-line-pgo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pgo-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-pgo-pgo-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pgo-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one pgo marker per defined value', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pgo-marker"]'),
    ).toHaveLength(7);
  });

  it('classifies each marker with a sign attribute', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-pgo-marker"]',
    );
    for (const m of markers) {
      expect(['positive', 'negative', 'zero']).toContain(
        m.getAttribute('data-sign'),
      );
    }
  });

  it('renders the zero line', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    expect(
      container.querySelector('[data-section="chart-line-pgo-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-pgo-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLinePgo data={PGO_DATA} period={2} />);
    const badge = container.querySelector(
      '[data-section="chart-line-pgo-badge-period"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pgo-price-path"]'),
    ).toBeNull();
  });

  it('hides the pgo line and markers when showPgo is false', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} showPgo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pgo-pgo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-pgo-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the pgo line via the hidden set', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} hiddenSeries={['pgo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pgo-pgo-line"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pgo-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLinePgo
        data={PGO_DATA}
        period={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-pgo-legend-item"][data-series-id="pgo"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'pgo', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-pgo-dot"]'),
    ).toHaveLength(8);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLinePgo data={[{ x: 0, value: 5, high: 6, low: 4 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-pgo"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-pgo-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} period={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-pgo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLinePgo ref={ref} data={PGO_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-pgo');
  });

  it('has a stable displayName', () => {
    expect(ChartLinePgo.displayName).toBe('ChartLinePgo');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLinePgo data={PGO_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-pgo"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
