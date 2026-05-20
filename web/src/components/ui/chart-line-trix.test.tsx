import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineTrix,
  getLineTrixFinitePoints,
  normalizeLineTrixPeriod,
  computeLineTrixEma,
  computeLineTrix,
  computeLineTrixSignal,
  runLineTrix,
  computeLineTrixLayout,
  describeLineTrixChart,
  DEFAULT_CHART_LINE_TRIX_PERIOD,
  DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
  type ChartLineTrixPoint,
} from './chart-line-trix';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,20,30,40,50,30,10], period 3,
 * signalPeriod 3. With period 3 the EMA factor k = 2/4 = 0.5, so
 * each EMA value is the average of the value and the prior EMA:
 *
 *   ema1 = [10, 15,   22.5,  31.25,  40.625,  35.3125,   22.65625  ]
 *   ema2 = [10, 12.5, 17.5,  24.375, 32.5,    33.90625,  28.28125  ]
 *   ema3 = [10, 11.25,14.375,19.375, 25.9375, 29.921875, 29.1015625]
 *
 * TRIX = 100 * (ema3[i] - ema3[i-1]) / ema3[i-1]:
 *   trix = [., 12.5, 27.7778, 34.7826, 33.8710, 15.3614, -2.7416]
 *
 * The triple-smoothed line peaks then turns down, so TRIX crosses
 * from positive into negative at the final bar. trixFinal ~ -2.7416.
 */
const TRIX_DATA: ChartLineTrixPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 40 },
  { x: 4, value: 50 },
  { x: 5, value: 30 },
  { x: 6, value: 10 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineTrixFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineTrixFinitePoints(TRIX_DATA)).toHaveLength(7);
  });

  it('returns empty for null input', () => {
    expect(getLineTrixFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineTrixFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineTrixFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineTrixFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 20 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineTrixPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTrixPeriod(15, 9)).toBe(15);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineTrixPeriod(7.8, 9)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineTrixPeriod(0, 9)).toBe(9);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineTrixPeriod(NaN, 9)).toBe(9);
  });

  it('falls back for negative', () => {
    expect(normalizeLineTrixPeriod(-3, 8)).toBe(8);
  });
});

describe('computeLineTrixEma', () => {
  it('computes the EMA with the period-3 smoothing factor', () => {
    expect(computeLineTrixEma([10, 20, 30, 40, 50, 30, 10], 3)).toEqual([
      10, 15, 22.5, 31.25, 40.625, 35.3125, 22.65625,
    ]);
  });

  it('seeds the EMA with the first value', () => {
    expect(computeLineTrixEma([10, 20, 30], 3)[0]).toBe(10);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineTrixEma(null, 3)).toEqual([]);
  });

  it('returns empty for an empty series', () => {
    expect(computeLineTrixEma([], 3)).toEqual([]);
  });

  it('returns a single value for a one-element series', () => {
    expect(computeLineTrixEma([7], 3)).toEqual([7]);
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineTrixEma([10, 20], 0)).toHaveLength(2);
  });
});

describe('computeLineTrix', () => {
  it('computes the first triple-smoothed EMA', () => {
    expect(computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).ema1).toEqual([
      10, 15, 22.5, 31.25, 40.625, 35.3125, 22.65625,
    ]);
  });

  it('computes the third triple-smoothed EMA', () => {
    expect(computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).ema3).toEqual([
      10, 11.25, 14.375, 19.375, 25.9375, 29.921875, 29.1015625,
    ]);
  });

  it('reads null TRIX at index 0', () => {
    expect(computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix[0]).toBeNull();
  });

  it('computes the first TRIX as a percentage rate of change', () => {
    expect(computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix[1]).toBe(
      12.5,
    );
  });

  it('computes a mid-series TRIX', () => {
    expect(
      computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix[3]!,
    ).toBeCloseTo(34.7826, 3);
  });

  it('lets TRIX cross below zero when the trend turns down', () => {
    const trix = computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix;
    expect(trix[6]!).toBeCloseTo(-2.7416, 3);
    expect(trix[6]!).toBeLessThan(0);
  });

  it('reads TRIX 0 for a flat series', () => {
    expect(computeLineTrix([5, 5, 5, 5], 3).trix).toEqual([
      null, 0, 0, 0,
    ]);
  });

  it('reads TRIX 0 for an all-zero series without dividing by zero', () => {
    expect(computeLineTrix([0, 0, 0, 0], 3).trix).toEqual([
      null, 0, 0, 0,
    ]);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineTrix(null, 3).trix).toEqual([]);
  });

  it('emits one TRIX entry per value', () => {
    expect(computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix).toHaveLength(
      7,
    );
  });

  it('keeps TRIX defined from index 1 onward', () => {
    const trix = computeLineTrix([10, 20, 30, 40, 50, 30, 10], 3).trix;
    expect(trix[1]).not.toBeNull();
    expect(trix[6]).not.toBeNull();
  });
});

describe('computeLineTrixSignal', () => {
  it('computes an EMA of the TRIX series', () => {
    expect(computeLineTrixSignal([null, 10, 20, 30], 3)).toEqual([
      null, 10, 15, 22.5,
    ]);
  });

  it('seeds the signal at the first defined TRIX value', () => {
    expect(computeLineTrixSignal([null, 10, 20, 30], 3)[1]).toBe(10);
  });

  it('returns all null when every TRIX entry is null', () => {
    expect(computeLineTrixSignal([null, null], 3)).toEqual([null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineTrixSignal(null, 3)).toEqual([]);
  });

  it('keeps the signal null where TRIX is null', () => {
    expect(computeLineTrixSignal([null, 10, 20, 30], 3)[0]).toBeNull();
  });
});

describe('runLineTrix', () => {
  it('marks ok for a valid series', () => {
    expect(runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 }).ok).toBe(
      true,
    );
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineTrix([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineTrix([]).ok).toBe(false);
  });

  it('computes the TRIX series', () => {
    const run = runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 });
    expect(run.trix[1]).toBe(12.5);
    expect(run.trix[6]!).toBeCloseTo(-2.7416, 3);
  });

  it('computes the signal line', () => {
    const run = runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 });
    expect(run.signal[1]).toBe(12.5);
    expect(run.signal[6]!).toBeCloseTo(10.136, 3);
  });

  it('reports the final TRIX and signal', () => {
    const run = runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 });
    expect(run.trixFinal).toBeCloseTo(-2.7416, 3);
    expect(run.signalFinal).toBeCloseTo(10.136, 3);
  });

  it('emits one sample per point', () => {
    expect(
      runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 }).samples,
    ).toHaveLength(7);
  });

  it('carries the TRIX metrics onto each sample', () => {
    const s = runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 })
      .samples[1]!;
    expect(s.ema3).toBe(11.25);
    expect(s.trix).toBe(12.5);
  });

  it('reports the TRIX range across TRIX and signal', () => {
    const run = runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 });
    expect(run.trixMin!).toBeLessThan(0);
    expect(run.trixMax!).toBeGreaterThan(30);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineTrix(
      [
        { x: 6, value: 10 },
        { x: 0, value: 10 },
        { x: 3, value: 40 },
        { x: 1, value: 20 },
        { x: 5, value: 30 },
        { x: 2, value: 30 },
        { x: 4, value: 50 },
      ],
      { period: 3, signalPeriod: 3 },
    );
    expect(run.trix[1]).toBe(12.5);
  });

  it('defaults the period and signal period when unspecified', () => {
    const run = runLineTrix(TRIX_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_TRIX_PERIOD);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD);
  });

  it('emits one TRIX entry per sample', () => {
    expect(
      runLineTrix(TRIX_DATA, { period: 3, signalPeriod: 3 }).trix,
    ).toHaveLength(7);
  });
});

describe('computeLineTrixLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineTrixLayout({
        data: TRIX_DATA,
        period: 3,
        signalPeriod: 3,
        ...LAYOUT_OPTS,
      }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineTrixLayout({
      data: [{ x: 0, value: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the TRIX panel', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.trixPanel.y);
  });

  it('reports the period and signal period', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
    expect(layout.signalPeriod).toBe(3);
  });

  it('reports the final TRIX and signal', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.trixFinal).toBeCloseTo(-2.7416, 3);
    expect(layout.signalFinal).toBeCloseTo(10.136, 3);
  });

  it('reports the total point count', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(7);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(7);
  });

  it('emits a marker only where the TRIX is defined', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(6);
  });

  it('builds non-empty TRIX and signal paths', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.trixPath.startsWith('M')).toBe(true);
    expect(layout.signalPath.startsWith('M')).toBe(true);
  });

  it('sets the symmetric y-bound to the largest TRIX magnitude', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.trixYBound).toBeCloseTo(34.7826, 2);
  });

  it('places the zero line inside the TRIX panel', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.trixPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.trixPanel.y + layout.trixPanel.height,
    );
  });

  it('keeps markers inside the TRIX panel', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      signalPeriod: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.trixPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.trixPanel.y + layout.trixPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineTrixLayout({
      data: TRIX_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrixChart', () => {
  it('mentions TRIX', () => {
    expect(describeLineTrixChart(TRIX_DATA, { period: 3 })).toContain('TRIX');
  });

  it('mentions the triple-smoothed EMA', () => {
    const text = describeLineTrixChart(TRIX_DATA, { period: 3 });
    expect(text).toContain('triple-smoothed');
    expect(text).toContain('EMA');
  });

  it('mentions the oscillator panel', () => {
    expect(describeLineTrixChart(TRIX_DATA, { period: 3 })).toContain(
      'oscillator',
    );
  });

  it('reports the period', () => {
    expect(describeLineTrixChart(TRIX_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineTrixChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineTrix />', () => {
  it('renders the root region', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-trix"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineTrix data={[{ x: 0, value: 1 }]} period={3} />);
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period and signal period as data attributes', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.getAttribute('data-period')).toBe('3');
    expect(root?.getAttribute('data-signal-period')).toBe('3');
  });

  it('renders an accessible description', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-trix-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TRIX');
  });

  it('renders the value path', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-trix-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the TRIX line', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-trix-trix-line"]'),
    ).toBeTruthy();
  });

  it('renders the signal line', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-trix-signal-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined TRIX value', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-trix-marker"]'),
    ).toHaveLength(6);
  });

  it('renders the zero line', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector('[data-section="chart-line-trix-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        showZeroLine={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-trix-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-trix-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('TRIX');
  });

  it('renders the config badge with period and signal period', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-trix-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-trix-badge-signal"]',
      )?.textContent,
    ).toBe('s=3');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-trix-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-trix-legend-item"]'),
    ).toHaveLength(3);
  });

  it('toggles the TRIX series off via the legend', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const trixItem = document.querySelector(
      '[data-section="chart-line-trix-legend-item"][data-series-id="trix"]',
    ) as HTMLElement;
    fireEvent.click(trixItem);
    expect(
      document.querySelector('[data-section="chart-line-trix-trix-line"]'),
    ).toBeNull();
  });

  it('toggles the signal series off via the legend', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const signalItem = document.querySelector(
      '[data-section="chart-line-trix-legend-item"][data-series-id="signal"]',
    ) as HTMLElement;
    fireEvent.click(signalItem);
    expect(
      document.querySelector('[data-section="chart-line-trix-signal-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-trix-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the TRIX line when showTrix is false', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        showTrix={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-trix-trix-line"]'),
    ).toBeNull();
  });

  it('hides the signal line when showSignal is false', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        showSignal={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-trix-signal-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(
      <ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} showDots />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-trix-dot"]'),
    ).toHaveLength(7);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-trix-marker"]',
    );
    const m1 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '1',
    ) as Element;
    fireEvent.mouseEnter(m1);
    expect(
      document.querySelector(
        '[data-section="chart-line-trix-tooltip-trix"]',
      )?.textContent,
    ).toBe('trix: 12.50');
    expect(
      document.querySelector(
        '[data-section="chart-line-trix-tooltip-ema3"]',
      )?.textContent,
    ).toBe('ema3: 11.25');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-trix-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-trix-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-trix-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-trix-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        animate={false}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineTrix ref={ref} data={TRIX_DATA} period={3} signalPeriod={3} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineTrix
        data={TRIX_DATA}
        period={3}
        signalPeriod={3}
        className="custom-trix"
      />,
    );
    const root = document.querySelector('[data-section="chart-line-trix"]');
    expect(root?.className).toContain('custom-trix');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the final TRIX in the legend stats', () => {
    render(<ChartLineTrix data={TRIX_DATA} period={3} signalPeriod={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-trix-legend-stats"]',
      )?.textContent,
    ).toContain('final TRIX');
  });
});
