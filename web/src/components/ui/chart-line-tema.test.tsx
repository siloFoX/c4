import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineTema,
  computeLineTema,
  computeLineTemaEma,
  computeLineTemaLayout,
  getLineTemaFinitePoints,
  normalizeLineTemaPeriod,
  runLineTema,
  describeLineTemaChart,
  type ChartLineTemaPoint,
} from './chart-line-tema';

afterEach(() => cleanup());

// A perfect linear ramp. With period 3 the EMA multiplier is exactly
// 2/(3+1) = 0.5, and every window sum divides cleanly so the whole
// three-stage pipeline stays bit-exact:
//   ema1 = [.,., 6, 9, 12, 15, 18, 21, 24, 27]
//   ema2 = [.,.,.,., 9, 12, 15, 18, 21, 24]
//   ema3 = [.,.,.,.,.,., 12, 15, 18, 21]
//   tema = 3*ema1 - 3*ema2 + ema3 = [.,.,.,.,.,., 21, 24, 27, 30]
// The TEMA reproduces the ramp value exactly from index 6 onward --
// a linear input has its lag fully cancelled.
const TEMA_DATA: ChartLineTemaPoint[] = [
  { x: 0, value: 3 },
  { x: 1, value: 6 },
  { x: 2, value: 9 },
  { x: 3, value: 12 },
  { x: 4, value: 15 },
  { x: 5, value: 18 },
  { x: 6, value: 21 },
  { x: 7, value: 24 },
  { x: 8, value: 27 },
  { x: 9, value: 30 },
];

describe('getLineTemaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineTemaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineTemaFinitePoints(null)).toEqual([]);
    expect(getLineTemaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTemaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTemaPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineTemaPeriod(0, 14)).toBe(14);
    expect(normalizeLineTemaPeriod(NaN, 14)).toBe(14);
    expect(normalizeLineTemaPeriod(-5, 14)).toBe(14);
  });
});

describe('computeLineTemaEma', () => {
  it('seeds with the simple mean then folds in later values', () => {
    expect(computeLineTemaEma([3, 6, 9, 12], 3)).toEqual([null, null, 6, 9]);
  });

  it('places the period-length mean as the seed', () => {
    const ema = computeLineTemaEma([3, 6, 9, 12], 3);
    expect(ema[2]).toBe(6);
  });

  it('reproduces the series for a period of one', () => {
    expect(computeLineTemaEma([5, 7, 9], 1)).toEqual([5, 7, 9]);
  });

  it('skips leading null placeholders before seeding', () => {
    expect(computeLineTemaEma([null, null, 6, 9, 12], 3)).toEqual([
      null,
      null,
      null,
      null,
      9,
    ]);
  });

  it('returns all null when fewer defined values than the period', () => {
    expect(computeLineTemaEma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineTemaEma(null, 3)).toEqual([]);
  });
});

describe('computeLineTema', () => {
  const values = TEMA_DATA.map((p) => p.value);

  it('exposes the first EMA series', () => {
    const { ema1 } = computeLineTema(values, 3);
    expect(ema1).toEqual([null, null, 6, 9, 12, 15, 18, 21, 24, 27]);
  });

  it('exposes the EMA of the EMA series', () => {
    const { ema2 } = computeLineTema(values, 3);
    expect(ema2).toEqual([null, null, null, null, 9, 12, 15, 18, 21, 24]);
  });

  it('exposes the triple-nested EMA series', () => {
    const { ema3 } = computeLineTema(values, 3);
    expect(ema3).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      12,
      15,
      18,
      21,
    ]);
  });

  it('takes the TEMA as 3 * EMA1 - 3 * EMA2 + EMA3', () => {
    const { tema } = computeLineTema(values, 3);
    expect(tema).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      21,
      24,
      27,
      30,
    ]);
  });

  it('reproduces a linear ramp with no lag', () => {
    const { tema } = computeLineTema(values, 3);
    expect(tema[6]).toBe(values[6]);
    expect(tema[9]).toBe(values[9]);
  });

  it('leaves the bars before 3*period-3 as a null warm-up', () => {
    const { tema } = computeLineTema(values, 3);
    expect(tema[5]).toBeNull();
    expect(tema[6]).not.toBeNull();
  });

  it('reads a flat TEMA equal to the constant of a flat series', () => {
    const { tema } = computeLineTema([7, 7, 7, 7, 7, 7, 7, 7], 3);
    expect(tema[6]).toBe(7);
    expect(tema[7]).toBe(7);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineTema(null, 3)).toEqual({
      ema1: [],
      ema2: [],
      ema3: [],
      tema: [],
    });
  });
});

describe('runLineTema', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineTema(TEMA_DATA, { period: 3 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineTema(TEMA_DATA, { period: 3 }).period).toBe(3);
  });

  it('exposes the ema1, ema2, ema3 and tema series', () => {
    const run = runLineTema(TEMA_DATA, { period: 3 });
    expect(run.ema1).toEqual([null, null, 6, 9, 12, 15, 18, 21, 24, 27]);
    expect(run.ema2).toEqual([null, null, null, null, 9, 12, 15, 18, 21, 24]);
    expect(run.ema3[6]).toBe(12);
    expect(run.tema[9]).toBe(30);
  });

  it('reports the final, min and max TEMA readings', () => {
    const run = runLineTema(TEMA_DATA, { period: 3 });
    expect(run.temaFinal).toBe(30);
    expect(run.temaMin).toBe(21);
    expect(run.temaMax).toBe(30);
  });

  it('leaves the price sitting on the TEMA for a linear ramp', () => {
    const run = runLineTema(TEMA_DATA, { period: 3 });
    expect(run.samples[6]!.position).toBe('on');
    expect(run.samples[9]!.position).toBe('on');
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('counts bars above and below the TEMA for an oscillating series', () => {
    const wave: ChartLineTemaPoint[] = [
      10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20, 10, 20,
    ].map((value, i) => ({ x: i, value }));
    const run = runLineTema(wave, { period: 3 });
    expect(run.aboveCount).toBeGreaterThan(0);
    expect(run.belowCount).toBeGreaterThan(0);
  });

  it('leaves warm-up samples with a null TEMA', () => {
    const run = runLineTema(TEMA_DATA, { period: 3 });
    expect(run.samples[0]!.tema).toBeNull();
    expect(run.samples[6]!.tema).toBe(21);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...TEMA_DATA].reverse();
    const run = runLineTema(shuffled, { period: 3 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(run.tema[9]).toBe(30);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineTema([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineTema([]).ok).toBe(false);
    expect(runLineTema(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineTema(TEMA_DATA, { period: 3 }).samples).toHaveLength(10);
  });

  it('defaults to period 14 and reads no TEMA for a short series', () => {
    const run = runLineTema(TEMA_DATA);
    expect(run.period).toBe(14);
    expect(run.tema.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.temaFinal)).toBe(true);
  });
});

describe('computeLineTemaLayout', () => {
  const base = {
    data: TEMA_DATA,
    period: 3,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineTemaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('builds non-empty price and TEMA paths', () => {
    const layout = computeLineTemaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.temaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the TEMA is defined', () => {
    const layout = computeLineTemaLayout(base);
    expect(layout.temaMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(10);
  });

  it('spans a y domain covering both the price and the TEMA', () => {
    const layout = computeLineTemaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(3);
    expect(layout.yMax).toBeGreaterThanOrEqual(30);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineTemaLayout(base);
    expect(layout.temaFinal).toBe(30);
    expect(layout.period).toBe(3);
  });

  it('keeps the TEMA markers inside the panel', () => {
    const layout = computeLineTemaLayout(base);
    for (const m of layout.temaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineTemaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.temaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineTemaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineTemaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineTemaChart(TEMA_DATA, { period: 3 });
    expect(text).toContain('Triple Exponential Moving Average');
    expect(text).toContain('TEMA');
    expect(text).toContain('lag');
    expect(text).toContain('exponential moving average');
    expect(text).toContain('3 * EMA');
  });

  it('reports the above and below counts', () => {
    const text = describeLineTemaChart(TEMA_DATA, { period: 3 });
    expect(text).toContain('above the TEMA on 0');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineTemaChart([])).toBe('No data');
    expect(describeLineTemaChart(null)).toBe('No data');
  });
});

describe('<ChartLineTema />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const desc = container.querySelector(
      '[data-section="chart-line-tema-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Triple Exponential Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const root = container.querySelector('[data-section="chart-line-tema"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-tema-final')).toBe('30');
    expect(root!.getAttribute('data-above-count')).toBe('0');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and TEMA lines', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    expect(
      container.querySelector('[data-section="chart-line-tema-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-tema-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-tema-tema-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined TEMA value', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tema-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-tema-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineTema data={TEMA_DATA} period={3} />);
    const badge = container.querySelector(
      '[data-section="chart-line-tema-badge-period"]',
    );
    expect(badge!.textContent).toContain('3');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-price-path"]'),
    ).toBeNull();
  });

  it('hides the TEMA line and markers when showTema is false', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} showTema={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-tema-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-tema-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the TEMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} hiddenSeries={['tema']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-tema-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineTema
        data={TEMA_DATA}
        period={3}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-tema-legend-item"][data-series-id="tema"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'tema', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-tema-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineTema data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-tema"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-tema-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTema ref={ref} data={TEMA_DATA} period={3} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-tema');
  });

  it('has a stable displayName', () => {
    expect(ChartLineTema.displayName).toBe('ChartLineTema');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineTema data={TEMA_DATA} period={3} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-tema"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
