import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineTsi,
  getLineTsiFinitePoints,
  normalizeLineTsiPeriod,
  computeLineTsiMomentum,
  computeLineTsiEma,
  computeLineTsi,
  runLineTsi,
  computeLineTsiLayout,
  describeLineTsiChart,
  DEFAULT_CHART_LINE_TSI_LONG_PERIOD,
  DEFAULT_CHART_LINE_TSI_SHORT_PERIOD,
  type ChartLineTsiPoint,
} from './chart-line-tsi';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,14,12,18,16,22], long 3, short 3
 * (so every EMA factor is k = 2/4 = 0.5).
 *   momentum    = [., 4, -2, 6, -2, 6]
 *   absMomentum = [., 4,  2, 6,  2, 6]
 * Double-smoothed momentum (EMA long then EMA short):
 *   ema1  = [., 4, 1,   3.5,  0.75,  3.375]
 *   ema2  = [., 4, 2.5, 3,    1.875, 2.625]
 * Double-smoothed absolute momentum:
 *   ema2abs = [., 4, 3.5, 4, 3.625, 4.125]
 * TSI = 100 * ema2 / ema2abs:
 *   tsi = [., 100, 71.4286, 75, 51.7241, 63.6364]
 */
const TSI_DATA: ChartLineTsiPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 12 },
  { x: 3, value: 18 },
  { x: 4, value: 16 },
  { x: 5, value: 22 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineTsiFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineTsiFinitePoints(TSI_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineTsiFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineTsiFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineTsiFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineTsiFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 14 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineTsiPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTsiPeriod(25, 13)).toBe(25);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineTsiPeriod(7.8, 13)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineTsiPeriod(0, 13)).toBe(13);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineTsiPeriod(NaN, 13)).toBe(13);
  });

  it('falls back for negative', () => {
    expect(normalizeLineTsiPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineTsiMomentum', () => {
  it('computes the per-period momentum', () => {
    expect(
      computeLineTsiMomentum([10, 14, 12, 18, 16, 22]).momentum,
    ).toEqual([null, 4, -2, 6, -2, 6]);
  });

  it('computes the absolute momentum', () => {
    expect(
      computeLineTsiMomentum([10, 14, 12, 18, 16, 22]).absMomentum,
    ).toEqual([null, 4, 2, 6, 2, 6]);
  });

  it('reads null at index 0 for both series', () => {
    const m = computeLineTsiMomentum([10, 14]);
    expect(m.momentum[0]).toBeNull();
    expect(m.absMomentum[0]).toBeNull();
  });

  it('keeps the absolute momentum non-negative', () => {
    const m = computeLineTsiMomentum([10, 14, 12, 18, 16, 22]);
    for (const v of m.absMomentum) {
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty arrays for a non-array', () => {
    expect(computeLineTsiMomentum(null).momentum).toEqual([]);
  });

  it('emits one entry per value', () => {
    expect(
      computeLineTsiMomentum([10, 14, 12, 18, 16, 22]).momentum,
    ).toHaveLength(6);
  });
});

describe('computeLineTsiEma', () => {
  it('double-smooths the momentum with the period-3 factor', () => {
    expect(computeLineTsiEma([null, 4, -2, 6, -2, 6], 3)).toEqual([
      null, 4, 1, 3.5, 0.75, 3.375,
    ]);
  });

  it('seeds at the first defined value', () => {
    expect(computeLineTsiEma([null, 10, 20, 30], 3)[1]).toBe(10);
  });

  it('seeds at index 0 for a series with no leading null', () => {
    expect(computeLineTsiEma([10, 20, 30], 3)).toEqual([10, 15, 22.5]);
  });

  it('returns all null when every entry is null', () => {
    expect(computeLineTsiEma([null, null], 3)).toEqual([null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineTsiEma(null, 3)).toEqual([]);
  });

  it('keeps the leading nulls null', () => {
    expect(computeLineTsiEma([null, 4, 8], 3)[0]).toBeNull();
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineTsiEma([2, 4], 0)).toHaveLength(2);
  });
});

describe('computeLineTsi', () => {
  it('computes a clean TSI where the ratio resolves exactly', () => {
    const tsi = computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3);
    expect(tsi[1]).toBe(100);
    expect(tsi[3]).toBe(75);
  });

  it('computes a mid-series TSI', () => {
    expect(
      computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3)[5]!,
    ).toBeCloseTo(63.6364, 3);
  });

  it('reads null TSI at index 0', () => {
    expect(computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3)[0]).toBeNull();
  });

  it('reads +100 for a strictly rising series', () => {
    expect(computeLineTsi([1, 2, 3, 4], 3, 3)).toEqual([
      null, 100, 100, 100,
    ]);
  });

  it('reads -100 for a strictly falling series', () => {
    expect(computeLineTsi([4, 3, 2, 1], 3, 3)).toEqual([
      null, -100, -100, -100,
    ]);
  });

  it('reads 0 for a flat series without dividing by zero', () => {
    expect(computeLineTsi([5, 5, 5, 5], 3, 3)).toEqual([
      null, 0, 0, 0,
    ]);
  });

  it('keeps every defined TSI within -100 and 100', () => {
    const tsi = computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3);
    for (const v of tsi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('returns empty for a non-array', () => {
    expect(computeLineTsi(null, 3, 3)).toEqual([]);
  });

  it('emits one TSI entry per value', () => {
    expect(computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3)).toHaveLength(6);
  });

  it('keeps TSI defined from index 1 onward', () => {
    const tsi = computeLineTsi([10, 14, 12, 18, 16, 22], 3, 3);
    expect(tsi[1]).not.toBeNull();
    expect(tsi[5]).not.toBeNull();
  });

  it('clamps a sub-1 long period to 1', () => {
    const tsi = computeLineTsi([10, 14, 12, 18], 0, 3);
    expect(tsi.some((v) => v !== null)).toBe(true);
  });
});

describe('runLineTsi', () => {
  it('marks ok for a valid series', () => {
    expect(
      runLineTsi(TSI_DATA, { longPeriod: 3, shortPeriod: 3, signalPeriod: 3 })
        .ok,
    ).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineTsi([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineTsi([]).ok).toBe(false);
  });

  it('computes the TSI series', () => {
    const run = runLineTsi(TSI_DATA, {
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
    });
    expect(run.tsi[1]).toBe(100);
    expect(run.tsi[5]!).toBeCloseTo(63.6364, 3);
  });

  it('computes the signal line', () => {
    const run = runLineTsi(TSI_DATA, {
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
    });
    expect(run.signal[1]).toBe(100);
    expect(run.signal[5]!).toBeCloseTo(64.8385, 3);
  });

  it('reports the final TSI and signal', () => {
    const run = runLineTsi(TSI_DATA, {
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
    });
    expect(run.tsiFinal).toBeCloseTo(63.6364, 3);
    expect(run.signalFinal).toBeCloseTo(64.8385, 3);
  });

  it('emits one sample per point', () => {
    expect(
      runLineTsi(TSI_DATA, { longPeriod: 3, shortPeriod: 3 }).samples,
    ).toHaveLength(6);
  });

  it('carries the TSI onto each sample', () => {
    const s = runLineTsi(TSI_DATA, {
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
    }).samples[3]!;
    expect(s.tsi).toBe(75);
  });

  it('reports the TSI range', () => {
    const run = runLineTsi(TSI_DATA, { longPeriod: 3, shortPeriod: 3 });
    expect(run.tsiMin!).toBeGreaterThanOrEqual(-100);
    expect(run.tsiMax!).toBeLessThanOrEqual(100);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineTsi(
      [
        { x: 5, value: 22 },
        { x: 0, value: 10 },
        { x: 3, value: 18 },
        { x: 1, value: 14 },
        { x: 4, value: 16 },
        { x: 2, value: 12 },
      ],
      { longPeriod: 3, shortPeriod: 3, signalPeriod: 3 },
    );
    expect(run.tsi[1]).toBe(100);
  });

  it('defaults the periods when unspecified', () => {
    const run = runLineTsi(TSI_DATA);
    expect(run.longPeriod).toBe(DEFAULT_CHART_LINE_TSI_LONG_PERIOD);
    expect(run.shortPeriod).toBe(DEFAULT_CHART_LINE_TSI_SHORT_PERIOD);
  });

  it('emits one TSI entry per sample', () => {
    expect(
      runLineTsi(TSI_DATA, { longPeriod: 3, shortPeriod: 3 }).tsi,
    ).toHaveLength(6);
  });
});

describe('computeLineTsiLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineTsiLayout({
        data: TSI_DATA,
        longPeriod: 3,
        shortPeriod: 3,
        signalPeriod: 3,
        ...LAYOUT_OPTS,
      }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineTsiLayout({
      data: [{ x: 0, value: 1 }],
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the TSI panel', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.tsiPanel.y);
  });

  it('reports the long, short and signal periods', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.longPeriod).toBe(3);
    expect(layout.shortPeriod).toBe(3);
    expect(layout.signalPeriod).toBe(3);
  });

  it('reports the final TSI and signal', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.tsiFinal).toBeCloseTo(63.6364, 3);
    expect(layout.signalFinal).toBeCloseTo(64.8385, 3);
  });

  it('reports the total point count', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the TSI is defined', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(5);
  });

  it('builds non-empty TSI and signal paths', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.tsiPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('builds a fixed -100 to 100 TSI y-axis', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.tsiYTicks[0]!.value).toBe(-100);
    expect(layout.tsiYTicks[layout.tsiYTicks.length - 1]!.value).toBe(100);
  });

  it('defaults the levels to +25 and -25', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overbought).toBe(25);
    expect(layout.oversold).toBe(-25);
  });

  it('places the overbought level above the oversold level', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('places the zero line inside the TSI panel', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.tsiPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.tsiPanel.y + layout.tsiPanel.height,
    );
  });

  it('keeps markers inside the TSI panel', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.tsiPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.tsiPanel.y + layout.tsiPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineTsiLayout({
      data: TSI_DATA,
      longPeriod: 3,
      shortPeriod: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTsiChart', () => {
  it('mentions the True Strength Index', () => {
    expect(
      describeLineTsiChart(TSI_DATA, { longPeriod: 3, shortPeriod: 3 }),
    ).toContain('True Strength Index');
  });

  it('mentions that it is double-smoothed', () => {
    expect(
      describeLineTsiChart(TSI_DATA, { longPeriod: 3, shortPeriod: 3 }),
    ).toContain('double-smooth');
  });

  it('mentions the momentum oscillator', () => {
    const text = describeLineTsiChart(TSI_DATA, {
      longPeriod: 3,
      shortPeriod: 3,
    });
    expect(text).toContain('momentum');
    expect(text).toContain('oscillator');
  });

  it('reports the long period', () => {
    expect(
      describeLineTsiChart(TSI_DATA, { longPeriod: 3, shortPeriod: 3 }),
    ).toContain('long 3');
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineTsiChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineTsi />', () => {
  it('renders the root region', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-tsi"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineTsi data={[{ x: 0, value: 1 }]} />);
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the long and short periods as data attributes', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.getAttribute('data-long-period')).toBe('3');
    expect(root?.getAttribute('data-short-period')).toBe('3');
  });

  it('renders an accessible description', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-tsi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('True Strength Index');
  });

  it('renders the value path', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-tsi-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the TSI line', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-tsi-tsi-line"]'),
    ).toBeTruthy();
  });

  it('renders the signal line', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-tsi-signal-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined TSI value', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-tsi-marker"]'),
    ).toHaveLength(5);
  });

  it('renders the zero line', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-tsi-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showZeroLine={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-tsi-zero-line"]'),
    ).toBeNull();
  });

  it('renders both level lines', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-tsi-level-line"]'),
    ).toHaveLength(2);
  });

  it('hides the level lines when showLevels is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showLevels={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-tsi-level-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-tsi-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('TSI');
  });

  it('renders the config badge with long and short periods', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsi-badge-long"]',
      )?.textContent,
    ).toBe('L=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-tsi-badge-short"]',
      )?.textContent,
    ).toBe('S=3');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-tsi-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-tsi-legend-item"]'),
    ).toHaveLength(3);
  });

  it('toggles the TSI series off via the legend', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const tsiItem = document.querySelector(
      '[data-section="chart-line-tsi-legend-item"][data-series-id="tsi"]',
    ) as HTMLElement;
    fireEvent.click(tsiItem);
    expect(
      document.querySelector('[data-section="chart-line-tsi-tsi-line"]'),
    ).toBeNull();
  });

  it('toggles the signal series off via the legend', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const signalItem = document.querySelector(
      '[data-section="chart-line-tsi-legend-item"][data-series-id="signal"]',
    ) as HTMLElement;
    fireEvent.click(signalItem);
    expect(
      document.querySelector('[data-section="chart-line-tsi-signal-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-tsi-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the TSI line when showTsi is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showTsi={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-tsi-tsi-line"]'),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showSignal={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-tsi-signal-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        showDots
      />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-tsi-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-tsi-marker"][data-point-index="1"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsi-tooltip-tsi"]',
      )?.textContent,
    ).toBe('tsi: 100');
    expect(
      document.querySelector(
        '[data-section="chart-line-tsi-tooltip-value"]',
      )?.textContent,
    ).toBe('value: 14');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-tsi-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-tsi-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-tsi-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-tsi-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        animate={false}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineTsi ref={ref} data={TSI_DATA} longPeriod={3} shortPeriod={3} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineTsi
        data={TSI_DATA}
        longPeriod={3}
        shortPeriod={3}
        className="custom-tsi"
      />,
    );
    const root = document.querySelector('[data-section="chart-line-tsi"]');
    expect(root?.className).toContain('custom-tsi');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the final TSI in the legend stats', () => {
    render(<ChartLineTsi data={TSI_DATA} longPeriod={3} shortPeriod={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-tsi-legend-stats"]',
      )?.textContent,
    ).toContain('final TSI');
  });
});
