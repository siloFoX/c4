import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineGmma,
  computeLineGmma,
  computeLineGmmaEma,
  computeLineGmmaLayout,
  getLineGmmaFinitePoints,
  normalizeLineGmmaPeriods,
  runLineGmma,
  describeLineGmmaChart,
  type ChartLineGmmaPoint,
} from './chart-line-gmma';

afterEach(() => cleanup());

// An 18-point linear ramp (value[i] = 10 + 2i). The EMA of a ramp
// with step d settles exactly to value - d*(period-1)/2, so with
// step 2 every EMA-k equals value - (k-1):
//   short [1, 3] -> EMA = [value, value - 2]
//   long  [7, 15] -> EMA = [value - 6, value - 14]
// The short ribbon sits entirely above the long ribbon, so once all
// four EMAs are defined (from index 14) the state is bullish.
const RAMP = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40,
  42, 44];
const GMMA_DATA: ChartLineGmmaPoint[] = RAMP.map((value, i) => ({
  x: i,
  value,
}));
const SHORT = [1, 3];
const LONG = [7, 15];

describe('getLineGmmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineGmmaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineGmmaFinitePoints(null)).toEqual([]);
    expect(getLineGmmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineGmmaPeriods', () => {
  it('sorts, dedupes and floors the period list', () => {
    expect(normalizeLineGmmaPeriods([15, 3, 7, 3, 5.9], [2, 4])).toEqual([
      3, 5, 7, 15,
    ]);
  });

  it('drops non-finite, sub-1 and negative entries', () => {
    expect(normalizeLineGmmaPeriods([3, NaN, -1, 0, 8], [2, 4])).toEqual([
      3, 8,
    ]);
  });

  it('falls back when nothing valid remains', () => {
    expect(normalizeLineGmmaPeriods([NaN, -1, 0], [2, 4])).toEqual([2, 4]);
  });

  it('falls back for non-array input', () => {
    expect(normalizeLineGmmaPeriods(null, [2, 4])).toEqual([2, 4]);
  });
});

describe('computeLineGmmaEma', () => {
  it('reproduces the series for a period of one', () => {
    expect(computeLineGmmaEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineGmmaEma([10, 12, 14, 16], 3)).toEqual([
      null,
      null,
      12,
      14,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const ema = computeLineGmmaEma([10, 12, 14, 16], 3);
    expect(ema[1]).toBeNull();
    expect(ema[2]).not.toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineGmmaEma(null, 3)).toEqual([]);
  });
});

describe('computeLineGmma', () => {
  const values = GMMA_DATA.map((p) => p.value);

  it('returns one EMA series per short and long period', () => {
    const { short, long } = computeLineGmma(values, SHORT, LONG);
    expect(short).toHaveLength(2);
    expect(long).toHaveLength(2);
  });

  it('matches the single-EMA helper for each ribbon line', () => {
    const { short } = computeLineGmma(values, SHORT, LONG);
    expect(short[0]).toEqual(computeLineGmmaEma(values, 1));
    expect(short[1]).toEqual(computeLineGmmaEma(values, 3));
  });

  it('settles each EMA of the ramp to value minus its lag', () => {
    const { short, long } = computeLineGmma(values, SHORT, LONG);
    // EMA-1 = value, EMA-3 = value-2, EMA-7 = value-6, EMA-15 = value-14.
    expect(short[0]![14]).toBe(38);
    expect(short[1]![14]).toBe(36);
    expect(long[0]![14]).toBe(32);
    expect(long[1]![14]).toBe(24);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineGmma(null, SHORT, LONG)).toEqual({
      short: [],
      long: [],
    });
  });
});

describe('runLineGmma', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineGmma(GMMA_DATA, { shortPeriods: SHORT, longPeriods: LONG }).ok).toBe(
      true,
    );
  });

  it('carries the normalized period groups onto the run', () => {
    const run = runLineGmma(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.shortPeriods).toEqual([1, 3]);
    expect(run.longPeriods).toEqual([7, 15]);
  });

  it('exposes one EMA series per period in each group', () => {
    const run = runLineGmma(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.short).toHaveLength(2);
    expect(run.long).toHaveLength(2);
  });

  it('reads bullish when the short ribbon holds above the long ribbon', () => {
    const run = runLineGmma(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.samples[14]!.state).toBe('bullish');
    expect(run.samples[17]!.state).toBe('bullish');
    expect(run.bullishCount).toBe(4);
    expect(run.bearishCount).toBe(0);
  });

  it('reads bearish when the short ribbon holds below the long ribbon', () => {
    const down: ChartLineGmmaPoint[] = RAMP.map((value, i) => ({
      x: i,
      value: 54 - value,
    }));
    const run = runLineGmma(down, { shortPeriods: SHORT, longPeriods: LONG });
    expect(run.samples[14]!.state).toBe('bearish');
    expect(run.bearishCount).toBe(4);
    expect(run.bullishCount).toBe(0);
  });

  it('reads crossing when the ribbons coincide on a flat series', () => {
    const flat: ChartLineGmmaPoint[] = RAMP.map((_, i) => ({
      x: i,
      value: 20,
    }));
    const run = runLineGmma(flat, { shortPeriods: SHORT, longPeriods: LONG });
    expect(run.samples[14]!.state).toBe('crossing');
    expect(run.crossingCount).toBe(4);
  });

  it('reads forming while any ribbon EMA is still in warm-up', () => {
    const run = runLineGmma(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.samples[0]!.state).toBe('forming');
    expect(run.samples[13]!.state).toBe('forming');
  });

  it('exposes the short and long ribbon bands per sample', () => {
    const run = runLineGmma(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.samples[14]!.shortMin).toBe(36);
    expect(run.samples[14]!.shortMax).toBe(38);
    expect(run.samples[14]!.longMin).toBe(24);
    expect(run.samples[14]!.longMax).toBe(32);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...GMMA_DATA].reverse();
    const run = runLineGmma(shuffled, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(run.series.map((p) => p.x)).toEqual(
      Array.from({ length: 18 }, (_, i) => i),
    );
    expect(run.samples[14]!.state).toBe('bullish');
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineGmma([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineGmma([]).ok).toBe(false);
    expect(runLineGmma(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineGmma(GMMA_DATA, { shortPeriods: SHORT, longPeriods: LONG })
        .samples,
    ).toHaveLength(18);
  });

  it('defaults to the six short and six long Guppy periods', () => {
    const run = runLineGmma(GMMA_DATA);
    expect(run.shortPeriods).toEqual([3, 5, 8, 10, 12, 15]);
    expect(run.longPeriods).toEqual([30, 35, 40, 45, 50, 60]);
  });
});

describe('computeLineGmmaLayout', () => {
  const base = {
    data: GMMA_DATA,
    shortPeriods: SHORT,
    longPeriods: LONG,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(18);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('builds one ribbon line per period in each group', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.shortLines).toHaveLength(2);
    expect(layout.longLines).toHaveLength(2);
    expect(layout.shortLines[0]!.path.startsWith('M')).toBe(true);
    expect(layout.longLines[1]!.path.startsWith('M')).toBe(true);
  });

  it('tags each ribbon line with its period', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.shortLines.map((l) => l.period)).toEqual([1, 3]);
    expect(layout.longLines.map((l) => l.period)).toEqual([7, 15]);
  });

  it('produces one price dot per point', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.priceDots).toHaveLength(18);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineGmmaLayout(base);
    expect(layout.bullishCount).toBe(4);
    expect(layout.bearishCount).toBe(0);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineGmmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.pricePath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineGmmaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineGmmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineGmmaChart(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(text).toContain('Guppy Multiple Moving Average');
    expect(text).toContain('ribbon');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('bullish');
    expect(text).toContain('bearish');
  });

  it('reports the state counts', () => {
    const text = describeLineGmmaChart(GMMA_DATA, {
      shortPeriods: SHORT,
      longPeriods: LONG,
    });
    expect(text).toContain('4 bullish');
    expect(text).toContain('0 bearish');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineGmmaChart([])).toBe('No data');
    expect(describeLineGmmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineGmma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-gmma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Guppy Multiple Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    const root = container.querySelector('[data-section="chart-line-gmma"]');
    expect(root!.getAttribute('data-short-count')).toBe('2');
    expect(root!.getAttribute('data-long-count')).toBe('2');
    expect(root!.getAttribute('data-bullish-count')).toBe('4');
    expect(root!.getAttribute('data-bearish-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('18');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price line', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gmma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-gmma-price-path"]'),
    ).not.toBeNull();
  });

  it('renders one ribbon line per short and long period', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gmma-short-line"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('[data-section="chart-line-gmma-long-line"]'),
    ).toHaveLength(2);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-gmma-legend-item"]',
    );
    expect(items).toHaveLength(3);
  });

  it('renders the config badge with the group sizes', () => {
    const { container } = render(
      <ChartLineGmma data={GMMA_DATA} shortPeriods={SHORT} longPeriods={LONG} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-gmma-badge-groups"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gmma-price-path"]'),
    ).toBeNull();
  });

  it('hides the short ribbon when showShort is false', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        showShort={false}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gmma-short-line"]'),
    ).toHaveLength(0);
  });

  it('hides the long ribbon via the hidden set', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        hiddenSeries={['long']}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gmma-long-line"]'),
    ).toHaveLength(0);
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-gmma-legend-item"][data-series-id="short"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'short', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-gmma-dot"]'),
    ).toHaveLength(18);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineGmma data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-gmma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-gmma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-gmma-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineGmma
        ref={ref}
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-gmma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineGmma.displayName).toBe('ChartLineGmma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineGmma
        data={GMMA_DATA}
        shortPeriods={SHORT}
        longPeriods={LONG}
        animate={false}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-gmma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
