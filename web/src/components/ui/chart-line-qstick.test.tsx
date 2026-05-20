import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineQstick,
  computeLineQstick,
  computeLineQstickSpread,
  computeLineQstickLayout,
  getLineQstickFinitePoints,
  normalizeLineQstickPeriod,
  runLineQstick,
  describeLineQstickChart,
  type ChartLineQstickPoint,
} from './chart-line-qstick';

afterEach(() => cleanup());

// The Qstick is the simple moving average of the per-bar
// close-minus-open spread. There are no transcendentals, so the
// whole pipeline is exact. The fixture (period 4) is hand-tuned
// so every spread and every moving average divides cleanly.
//   spread = value - open
//   spread  [6, -2, -8, -4, 10, -6,  2, -12,  8,  4]
//   qstick  [.,  .,  ., -2, -1, -2, 0.5, -1.5, -2, 0.5]
const QSTICK_DATA: ChartLineQstickPoint[] = [
  { x: 0, value: 106, open: 100 },
  { x: 1, value: 100, open: 102 },
  { x: 2, value: 93, open: 101 },
  { x: 3, value: 95, open: 99 },
  { x: 4, value: 113, open: 103 },
  { x: 5, value: 99, open: 105 },
  { x: 6, value: 106, open: 104 },
  { x: 7, value: 96, open: 108 },
  { x: 8, value: 114, open: 106 },
  { x: 9, value: 114, open: 110 },
];

const QSTICK_VALUES = QSTICK_DATA.map((p) => p.value);
const QSTICK_OPENS = QSTICK_DATA.map((p) => p.open);
const EXPECTED_SPREAD = [6, -2, -8, -4, 10, -6, 2, -12, 8, 4];
const EXPECTED_QSTICK = [null, null, null, -2, -1, -2, 0.5, -1.5, -2, 0.5];

describe('getLineQstickFinitePoints', () => {
  it('keeps only points with finite x, value and open', () => {
    const points = getLineQstickFinitePoints([
      { x: 0, value: 5, open: 4 },
      { x: NaN, value: 5, open: 4 },
      { x: 1, value: Infinity, open: 4 },
      { x: 2, value: 9, open: NaN },
      { x: 3, value: 9, open: 8 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 3]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineQstickFinitePoints(null)).toEqual([]);
    expect(getLineQstickFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineQstickPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineQstickPeriod(10.9, 10)).toBe(10);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineQstickPeriod(0, 10)).toBe(10);
    expect(normalizeLineQstickPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineQstickPeriod(-5, 10)).toBe(10);
  });
});

describe('computeLineQstickSpread', () => {
  it('computes the per-bar close minus open spread', () => {
    expect(computeLineQstickSpread(QSTICK_VALUES, QSTICK_OPENS)).toEqual(
      EXPECTED_SPREAD,
    );
  });

  it('reports a zero spread for a doji bar', () => {
    expect(computeLineQstickSpread([5, 7, 9], [5, 7, 9])).toEqual([0, 0, 0]);
  });

  it('produces one spread per bar', () => {
    expect(computeLineQstickSpread(QSTICK_VALUES, QSTICK_OPENS)).toHaveLength(
      10,
    );
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineQstickSpread(null, [1])).toEqual([]);
    expect(computeLineQstickSpread([1], null)).toEqual([]);
  });
});

describe('computeLineQstick', () => {
  it('computes the moving average of the spread', () => {
    expect(computeLineQstick(QSTICK_VALUES, QSTICK_OPENS, 4)).toEqual(
      EXPECTED_QSTICK,
    );
  });

  it('is null through the warm-up window', () => {
    expect(
      computeLineQstick(QSTICK_VALUES, QSTICK_OPENS, 4).slice(0, 3),
    ).toEqual([null, null, null]);
  });

  it('holds a constant spread at that value', () => {
    expect(
      computeLineQstick([13, 13, 13, 13], [10, 10, 10, 10], 2),
    ).toEqual([null, 3, 3, 3]);
  });

  it('is zero for a series of doji bars', () => {
    expect(computeLineQstick([5, 5, 5, 5], [5, 5, 5, 5], 2)).toEqual([
      null,
      0,
      0,
      0,
    ]);
  });

  it('returns an all-null array for a series shorter than the period', () => {
    expect(computeLineQstick([106, 100], [100, 102], 5)).toEqual([
      null,
      null,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineQstick(null, [1], 2)).toEqual([]);
  });
});

describe('runLineQstick', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the period onto the run', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).period).toBe(4);
  });

  it('exposes the qstick series', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).qstick).toHaveLength(10);
  });

  it('computes the exact qstick series', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).qstick).toEqual(
      EXPECTED_QSTICK,
    );
  });

  it('exposes the per-bar spread on each sample', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    expect(run.samples.map((s) => s.spread)).toEqual(EXPECTED_SPREAD);
  });

  it('leaves the qstick null until the window is full', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    expect(run.samples.slice(0, 3).every((s) => s.qstick === null)).toBe(
      true,
    );
    expect(typeof run.samples[3]!.qstick).toBe('number');
  });

  it('classifies each sample by the sign of the qstick', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    for (const s of run.samples) {
      if (s.qstick === null || s.qstick === 0) {
        expect(s.sentiment).toBe('neutral');
      } else {
        expect(s.sentiment).toBe(s.qstick > 0 ? 'bullish' : 'bearish');
      }
    }
  });

  it('counts the bullish and bearish bars consistently', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    expect(run.bullishCount).toBe(2);
    expect(run.bearishCount).toBe(5);
    expect(run.bullishCount).toBe(
      run.qstick.filter((v) => v !== null && v > 0).length,
    );
    expect(run.bearishCount).toBe(
      run.qstick.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final qstick reading', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).qstickFinal).toBe(0.5);
  });

  it('reports the min and max qstick readings', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    expect(run.qstickMin).toBe(-2);
    expect(run.qstickMax).toBe(0.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineQstick([{ x: 0, value: 5, open: 4 }], { period: 4 });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineQstick([], { period: 4 }).ok).toBe(false);
    expect(runLineQstick(null, { period: 4 }).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...QSTICK_DATA].reverse();
    const run = runLineQstick(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(runLineQstick(QSTICK_DATA, { period: 4 }).samples).toHaveLength(
      10,
    );
  });

  it('defaults to a period of 10', () => {
    expect(runLineQstick(QSTICK_DATA).period).toBe(10);
  });
});

describe('computeLineQstickLayout', () => {
  const base = {
    data: QSTICK_DATA,
    period: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the qstick panel', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.qstickPanel.height).toBeGreaterThan(0);
    expect(layout.qstickPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and qstick paths', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.qstickPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined qstick', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.qstickMarkers).toHaveLength(7);
  });

  it('places the zero line inside the qstick panel', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.qstickPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.qstickPanel.y + layout.qstickPanel.height,
    );
  });

  it('centres the qstick panel y-domain on zero', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.qstickYMin).toBe(-layout.qstickYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineQstickLayout(base);
    expect(layout.period).toBe(4);
    expect(layout.qstickFinal).toBe(0.5);
    expect(layout.totalPoints).toBe(10);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineQstickLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.qstickPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineQstickLayout({
      ...base,
      data: [{ x: 0, value: 5, open: 4 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineQstickChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineQstickChart(QSTICK_DATA, { period: 4 });
    expect(text).toContain('Qstick');
    expect(text).toContain('close minus the open');
    expect(text).toContain('moving average');
    expect(text).toContain('buying pressure');
  });

  it('reports the bullish and bearish counts', () => {
    const run = runLineQstick(QSTICK_DATA, { period: 4 });
    const text = describeLineQstickChart(QSTICK_DATA, { period: 4 });
    expect(text).toContain(`bullish on ${run.bullishCount}`);
    expect(text).toContain(`bearish on ${run.bearishCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineQstickChart([])).toBe('No data');
    expect(describeLineQstickChart(null)).toBe('No data');
  });
});

describe('<ChartLineQstick />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-qstick-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Qstick');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-qstick"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-bullish-count')).toBe('2');
    expect(root!.getAttribute('data-bearish-count')).toBe('5');
    expect(root!.getAttribute('data-total-points')).toBe('10');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and qstick lines', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-qstick-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-qstick-qstick-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-qstick-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one qstick marker per defined value', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-qstick-marker"]'),
    ).toHaveLength(7);
  });

  it('classifies each marker with a sentiment attribute', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-qstick-marker"]',
    );
    for (const m of markers) {
      expect(['bullish', 'bearish', 'neutral']).toContain(
        m.getAttribute('data-sentiment'),
      );
    }
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-qstick-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-qstick-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-price-path"]'),
    ).toBeNull();
  });

  it('hides the qstick line and markers when showQstick is false', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} showQstick={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-qstick-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-qstick-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the qstick line via the hidden set', () => {
    const { container } = render(
      <ChartLineQstick
        data={QSTICK_DATA}
        period={4}
        hiddenSeries={['qstick']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-qstick-line"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineQstick
        data={QSTICK_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-qstick-legend-item"][data-series-id="qstick"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'qstick', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-qstick-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineQstick data={[{ x: 0, value: 5, open: 4 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-qstick"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-qstick-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} period={4} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-qstick-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineQstick ref={ref} data={QSTICK_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-qstick',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineQstick.displayName).toBe('ChartLineQstick');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineQstick data={QSTICK_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-qstick"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
