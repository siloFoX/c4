import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineDema,
  computeLineDema,
  computeLineDemaEma,
  computeLineDemaLayout,
  getLineDemaFinitePoints,
  normalizeLineDemaPeriod,
  runLineDema,
  describeLineDemaChart,
  type ChartLineDemaPoint,
} from './chart-line-dema';

afterEach(() => cleanup());

// A perfect linear ramp. With period 3 the EMA multiplier is exactly
// 2/(3+1) = 0.5, and every window sum is divisible so the whole
// pipeline stays bit-exact:
//   ema1 = [.,., 6, 9, 12, 15, 18]
//   ema2 = [.,.,.,., 9, 12, 15]
//   dema = 2*ema1 - ema2 = [.,.,.,., 15, 18, 21]
// The DEMA reproduces the ramp value exactly from index 4 onward --
// a linear input has its lag fully cancelled.
const DEMA_DATA: ChartLineDemaPoint[] = [
  { x: 0, value: 3 },
  { x: 1, value: 6 },
  { x: 2, value: 9 },
  { x: 3, value: 12 },
  { x: 4, value: 15 },
  { x: 5, value: 18 },
  { x: 6, value: 21 },
];

describe('getLineDemaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineDemaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineDemaFinitePoints(null)).toEqual([]);
    expect(getLineDemaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineDemaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineDemaPeriod(20.6, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineDemaPeriod(0, 20)).toBe(20);
    expect(normalizeLineDemaPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineDemaPeriod(-5, 20)).toBe(20);
  });
});

describe('computeLineDemaEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineDemaEma([3, 6, 9, 12], 3)).toEqual([null, null, 6, 9]);
  });

  it('places the period-length mean as the seed', () => {
    const ema = computeLineDemaEma([3, 6, 9, 12], 3);
    expect(ema[2]).toBe(6);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineDemaEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    expect(computeLineDemaEma([null, null, 6, 9, 12], 3)).toEqual([
      null,
      null,
      null,
      null,
      9,
    ]);
  });

  it('returns all null when fewer defined values than the period', () => {
    expect(computeLineDemaEma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineDemaEma(null, 3)).toEqual([]);
  });
});

describe('computeLineDema', () => {
  const values = DEMA_DATA.map((p) => p.value);

  it('exposes the first EMA series', () => {
    const { ema1 } = computeLineDema(values, 3);
    expect(ema1).toEqual([null, null, 6, 9, 12, 15, 18]);
  });

  it('exposes the EMA of the EMA series', () => {
    const { ema2 } = computeLineDema(values, 3);
    expect(ema2).toEqual([null, null, null, null, 9, 12, 15]);
  });

  it('takes the DEMA as 2 * EMA - EMA(EMA)', () => {
    const { dema } = computeLineDema(values, 3);
    expect(dema).toEqual([null, null, null, null, 15, 18, 21]);
  });

  it('reproduces a linear ramp with no lag', () => {
    const { dema } = computeLineDema(values, 3);
    expect(dema[4]).toBe(values[4]);
    expect(dema[5]).toBe(values[5]);
    expect(dema[6]).toBe(values[6]);
  });

  it('leaves the bars before 2*period-2 as a null warm-up', () => {
    const { dema } = computeLineDema(values, 3);
    expect(dema[3]).toBeNull();
    expect(dema[4]).not.toBeNull();
  });

  it('reads a flat DEMA equal to the constant of a flat series', () => {
    const { dema } = computeLineDema([5, 5, 5, 5, 5, 5, 5], 3);
    expect(dema).toEqual([null, null, null, null, 5, 5, 5]);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineDema(null, 3)).toEqual({
      ema1: [],
      ema2: [],
      dema: [],
    });
  });
});

describe('runLineDema', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineDema(DEMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineDema(DEMA_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the ema1, ema2 and dema series', () => {
    const run = runLineDema(DEMA_DATA, { period: 3 });
    expect(run.ema1).toEqual([null, null, 6, 9, 12, 15, 18]);
    expect(run.ema2).toEqual([null, null, null, null, 9, 12, 15]);
    expect(run.dema).toEqual([null, null, null, null, 15, 18, 21]);
  });

  it('reports the final, min and max DEMA readings', () => {
    const run = runLineDema(DEMA_DATA, { period: 3 });
    expect(run.demaFinal).toBe(21);
    expect(run.demaMin).toBe(15);
    expect(run.demaMax).toBe(21);
  });

  it('leaves the price sitting on the DEMA for a linear ramp', () => {
    const run = runLineDema(DEMA_DATA, { period: 3 });
    expect(run.samples[4]!.position).toBe('on');
    expect(run.samples[6]!.position).toBe('on');
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('counts bars above and below the DEMA for an oscillating series', () => {
    const wave: ChartLineDemaPoint[] = [10, 20, 10, 20, 10, 20, 10, 20, 10, 20].map(
      (value, i) => ({ x: i, value }),
    );
    const run = runLineDema(wave, { period: 3 });
    expect(run.aboveCount).toBeGreaterThan(0);
    expect(run.belowCount).toBeGreaterThan(0);
  });

  it('leaves warm-up samples with a null DEMA', () => {
    const run = runLineDema(DEMA_DATA, { period: 3 });
    expect(run.samples[0]!.dema).toBeNull();
    expect(run.samples[4]!.dema).toBe(15);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...DEMA_DATA].reverse();
    const run = runLineDema(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.dema).toEqual([null, null, null, null, 15, 18, 21]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineDema([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineDema([]).ok).toBe(false);
    expect(runLineDema(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineDema(DEMA_DATA, { period: 3 }).samples).toHaveLength(7);
  });

  it('defaults to period 20 and reads no DEMA for a short series', () => {
    const run = runLineDema(DEMA_DATA);
    expect(run.period).toBe(20);
    expect(run.dema.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.demaFinal)).toBe(true);
  });
});

describe('computeLineDemaLayout', () => {
  const base = {
    data: DEMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineDemaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and DEMA paths', () => {
    const layout = computeLineDemaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.demaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the DEMA is defined', () => {
    const layout = computeLineDemaLayout(base);
    expect(layout.demaMarkers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans a y domain covering both the price and the DEMA', () => {
    const layout = computeLineDemaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(3);
    expect(layout.yMax).toBeGreaterThanOrEqual(21);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineDemaLayout(base);
    expect(layout.demaFinal).toBe(21);
    expect(layout.period).toBe(3);
  });

  it('keeps the DEMA markers inside the panel', () => {
    const layout = computeLineDemaLayout(base);
    for (const m of layout.demaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineDemaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.demaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineDemaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineDemaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineDemaChart(DEMA_DATA, { period: 3 });
    expect(text).toContain('Double Exponential Moving Average');
    expect(text).toContain('DEMA');
    expect(text).toContain('lag');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('EMA(EMA)');
  });

  it('reports the above and below counts', () => {
    const text = describeLineDemaChart(DEMA_DATA, { period: 3 });
    expect(text).toContain('above the DEMA on 0');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineDemaChart([])).toBe('No data');
    expect(describeLineDemaChart(null)).toBe('No data');
  });
});

describe('<ChartLineDema />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-dema-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Double Exponential Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-dema"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-dema-final')).toBe('21');
    expect(root!.getAttribute('data-above-count')).toBe('0');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and DEMA lines', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-dema-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-dema-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-dema-dema-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined DEMA value', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-dema-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-dema-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineDema data={DEMA_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-dema-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-price-path"]'),
    ).toBeNull();
  });

  it('hides the DEMA line and markers when showDema is false', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} showDema={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-dema-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-dema-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the DEMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} hiddenSeries={['dema']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-dema-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineDema
        data={DEMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-dema-legend-item"][data-series-id="dema"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'dema', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-dema-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineDema data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-dema"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-dema-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDema ref={ref} data={DEMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-dema');
  });

  it('has a stable displayName', () => {
    expect(ChartLineDema.displayName).toBe('ChartLineDema');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineDema data={DEMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-dema"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
