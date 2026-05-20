import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineTrima,
  computeLineTrima,
  computeLineTrimaSma,
  computeLineTrimaLayout,
  getLineTrimaFinitePoints,
  lineTrimaSubPeriods,
  normalizeLineTrimaPeriod,
  runLineTrima,
  describeLineTrimaChart,
  type ChartLineTrimaPoint,
} from './chart-line-trima';

afterEach(() => cleanup());

// With period 3 both simple-average sub-periods are 2, so the TRIMA
// is SMA(SMA(values, 2), 2) and stays bit-exact:
//   inner = SMA(values, 2) = [null, 6, 12, 12, 6, 6, 12]
//   trima = SMA(inner, 2)  = [null, null, 9, 12, 9, 6, 9]
// The price runs above the TRIMA on the spikes and below it in the
// troughs.
const TRIMA_DATA: ChartLineTrimaPoint[] = [
  { x: 0, value: 4 },
  { x: 1, value: 8 },
  { x: 2, value: 16 },
  { x: 3, value: 8 },
  { x: 4, value: 4 },
  { x: 5, value: 8 },
  { x: 6, value: 16 },
];

describe('getLineTrimaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineTrimaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineTrimaFinitePoints(null)).toEqual([]);
    expect(getLineTrimaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTrimaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTrimaPeriod(20.6, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineTrimaPeriod(0, 20)).toBe(20);
    expect(normalizeLineTrimaPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineTrimaPeriod(-5, 20)).toBe(20);
  });
});

describe('lineTrimaSubPeriods', () => {
  it('splits an odd period into two equal halves', () => {
    expect(lineTrimaSubPeriods(3)).toEqual({ first: 2, second: 2 });
    expect(lineTrimaSubPeriods(5)).toEqual({ first: 3, second: 3 });
  });

  it('splits an even period with the larger half first', () => {
    expect(lineTrimaSubPeriods(4)).toEqual({ first: 3, second: 2 });
    expect(lineTrimaSubPeriods(6)).toEqual({ first: 4, second: 3 });
  });

  it('keeps the two sub-periods summing to period + 1', () => {
    for (const p of [3, 4, 5, 6, 7, 12, 20]) {
      const { first, second } = lineTrimaSubPeriods(p);
      expect(first + second).toBe(p + 1);
    }
  });
});

describe('computeLineTrimaSma', () => {
  it('averages each trailing window of the period', () => {
    expect(computeLineTrimaSma([2, 4, 6, 8], 2)).toEqual([null, 3, 5, 7]);
  });

  it('leaves a window that contains a null undefined', () => {
    expect(computeLineTrimaSma([null, 2, 4, 6], 2)).toEqual([
      null,
      null,
      3,
      5,
    ]);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineTrimaSma([3, 5, 7], 1)).toEqual([3, 5, 7]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTrimaSma(null, 2)).toEqual([]);
  });
});

describe('computeLineTrima', () => {
  const values = TRIMA_DATA.map((p) => p.value);

  it('exposes the inner simple moving average', () => {
    const { inner } = computeLineTrima(values, 3);
    expect(inner).toEqual([null, 6, 12, 12, 6, 6, 12]);
  });

  it('takes the TRIMA as a simple average of the inner average', () => {
    const { trima } = computeLineTrima(values, 3);
    expect(trima).toEqual([null, null, 9, 12, 9, 6, 9]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const { trima } = computeLineTrima(values, 3);
    expect(trima[0]).toBeNull();
    expect(trima[1]).toBeNull();
    expect(trima[2]).not.toBeNull();
  });

  it('reads a flat TRIMA equal to the constant of a flat series', () => {
    const { trima } = computeLineTrima([5, 5, 5, 5, 5], 3);
    expect(trima).toEqual([null, null, 5, 5, 5]);
  });

  it('keeps the period-1 warm-up for an even period', () => {
    // period 4 -> sub-periods 3 and 2 -> defined from index 3.
    const { trima } = computeLineTrima(values, 4);
    expect(trima[2]).toBeNull();
    expect(trima[3]).not.toBeNull();
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineTrima(null, 3)).toEqual({ inner: [], trima: [] });
  });
});

describe('runLineTrima', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineTrima(TRIMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period and the two sub-periods onto the run', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.period).toBe(3);
    expect(run.firstPeriod).toBe(2);
    expect(run.secondPeriod).toBe(2);
  });

  it('exposes the inner and TRIMA series', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.inner).toEqual([null, 6, 12, 12, 6, 6, 12]);
    expect(run.trima).toEqual([null, null, 9, 12, 9, 6, 9]);
  });

  it('reports the final, min and max TRIMA readings', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.trimaFinal).toBe(9);
    expect(run.trimaMin).toBe(6);
    expect(run.trimaMax).toBe(12);
  });

  it('classifies each sample by price position versus the TRIMA', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.samples[1]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[3]!.position).toBe('below');
    expect(run.samples[4]!.position).toBe('below');
    expect(run.samples[5]!.position).toBe('above');
  });

  it('counts bars above and below the TRIMA', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(2);
  });

  it('leaves warm-up samples with a null TRIMA', () => {
    const run = runLineTrima(TRIMA_DATA, { period: 3 });
    expect(run.samples[0]!.trima).toBeNull();
    expect(run.samples[2]!.trima).toBe(9);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...TRIMA_DATA].reverse();
    const run = runLineTrima(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.trima).toEqual([null, null, 9, 12, 9, 6, 9]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineTrima([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineTrima([]).ok).toBe(false);
    expect(runLineTrima(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineTrima(TRIMA_DATA, { period: 3 }).samples).toHaveLength(7);
  });

  it('defaults to period 20 and reads no TRIMA for a short series', () => {
    const run = runLineTrima(TRIMA_DATA);
    expect(run.period).toBe(20);
    expect(run.trima.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.trimaFinal)).toBe(true);
  });
});

describe('computeLineTrimaLayout', () => {
  const base = {
    data: TRIMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineTrimaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and TRIMA paths', () => {
    const layout = computeLineTrimaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.trimaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the TRIMA is defined', () => {
    const layout = computeLineTrimaLayout(base);
    expect(layout.trimaMarkers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans a y domain covering both the price and the TRIMA', () => {
    const layout = computeLineTrimaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(4);
    expect(layout.yMax).toBeGreaterThanOrEqual(16);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineTrimaLayout(base);
    expect(layout.trimaFinal).toBe(9);
    expect(layout.firstPeriod).toBe(2);
    expect(layout.secondPeriod).toBe(2);
    expect(layout.period).toBe(3);
  });

  it('keeps the TRIMA markers inside the panel', () => {
    const layout = computeLineTrimaLayout(base);
    for (const m of layout.trimaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineTrimaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.trimaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineTrimaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTrimaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineTrimaChart(TRIMA_DATA, { period: 3 });
    expect(text).toContain('Triangular Moving Average');
    expect(text).toContain('TRIMA');
    expect(text).toContain('doubly-smoothed');
    expect(text).toContain('simple moving average');
    expect(text).toContain('triangle');
  });

  it('reports the above and below counts', () => {
    const text = describeLineTrimaChart(TRIMA_DATA, { period: 3 });
    expect(text).toContain('above the TRIMA on 3');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineTrimaChart([])).toBe('No data');
    expect(describeLineTrimaChart(null)).toBe('No data');
  });
});

describe('<ChartLineTrima />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trima-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Triangular Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const root = container.querySelector('[data-section="chart-line-trima"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-first-period')).toBe('2');
    expect(root!.getAttribute('data-second-period')).toBe('2');
    expect(root!.getAttribute('data-trima-final')).toBe('9');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and TRIMA lines', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trima-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-trima-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-trima-trima-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined TRIMA value', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-trima-marker"]',
    );
    expect(markers).toHaveLength(5);
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const items = container.querySelectorAll(
      '[data-section="chart-line-trima-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period and sub-periods', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} />,
    );
    const period = container.querySelector(
      '[data-section="chart-line-trima-badge-period"]',
    );
    const sma = container.querySelector(
      '[data-section="chart-line-trima-badge-sma"]',
    );
    expect(period!.textContent).toContain('3');
    expect(sma!.textContent).toContain('2/2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trima-price-path"]'),
    ).toBeNull();
  });

  it('hides the TRIMA line and markers when showTrima is false', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} showTrima={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trima-trima-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-trima-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the TRIMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} hiddenSeries={['trima']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trima-trima-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineTrima
        data={TRIMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-trima-legend-item"][data-series-id="trima"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'trima', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-trima-dot"]'),
    ).toHaveLength(7);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineTrima data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-trima"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-trima-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trima-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrima ref={ref} data={TRIMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-trima');
  });

  it('has a stable displayName', () => {
    expect(ChartLineTrima.displayName).toBe('ChartLineTrima');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineTrima data={TRIMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-trima"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
