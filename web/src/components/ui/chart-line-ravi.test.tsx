import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineRavi,
  computeLineRavi,
  computeLineRaviSma,
  computeLineRaviLayout,
  getLineRaviFinitePoints,
  normalizeLineRaviPeriod,
  runLineRavi,
  describeLineRaviChart,
  type ChartLineRaviPoint,
} from './chart-line-ravi';

afterEach(() => cleanup());

// The RAVI is 100 * (fastMA - slowMA) / slowMA -- a ratio of
// simple moving averages, no transcendentals, so the whole
// pipeline is exact. The fixture (fast 2, slow 4) is a period-4
// periodic series [70,150,130,50]: every 4-window sums to 400,
// so the slow average is a constant 100 and every RAVI is exact.
const RAVI_DATA: ChartLineRaviPoint[] = [
  { x: 0, value: 70 },
  { x: 1, value: 150 },
  { x: 2, value: 130 },
  { x: 3, value: 50 },
  { x: 4, value: 70 },
  { x: 5, value: 150 },
  { x: 6, value: 130 },
  { x: 7, value: 50 },
  { x: 8, value: 70 },
  { x: 9, value: 150 },
];

const RAVI_CLOSES = RAVI_DATA.map((p) => p.value);
const EXPECTED_RAVI = [null, null, null, -10, -40, 10, 40, -10, -40, 10];

describe('getLineRaviFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineRaviFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineRaviFinitePoints(null)).toEqual([]);
    expect(getLineRaviFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRaviPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineRaviPeriod(7.9, 7)).toBe(7);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineRaviPeriod(0, 7)).toBe(7);
    expect(normalizeLineRaviPeriod(NaN, 7)).toBe(7);
    expect(normalizeLineRaviPeriod(-5, 7)).toBe(7);
  });
});

describe('computeLineRaviSma', () => {
  it('computes the simple moving average', () => {
    expect(computeLineRaviSma(RAVI_CLOSES, 4)).toEqual([
      null,
      null,
      null,
      100,
      100,
      100,
      100,
      100,
      100,
      100,
    ]);
  });

  it('computes a shorter moving average', () => {
    expect(computeLineRaviSma(RAVI_CLOSES, 2)).toEqual([
      null,
      110,
      140,
      90,
      60,
      110,
      140,
      90,
      60,
      110,
    ]);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineRaviSma(RAVI_CLOSES, 4)[2]).toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRaviSma(null, 4)).toEqual([]);
  });
});

describe('computeLineRavi', () => {
  it('computes the range action verification index', () => {
    expect(computeLineRavi(RAVI_CLOSES, 2, 4)).toEqual(EXPECTED_RAVI);
  });

  it('is null through the warm-up window', () => {
    expect(computeLineRavi(RAVI_CLOSES, 2, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('is zero when the fast and slow averages agree', () => {
    expect(computeLineRavi([50, 50, 50, 50, 50, 50], 2, 4)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('is null for a zero-priced slow window', () => {
    expect(computeLineRavi([0, 0, 0, 0, 0, 0], 2, 4)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('returns an all-null array for a series shorter than the slow period', () => {
    expect(computeLineRavi([70, 150, 130], 2, 5)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineRavi(null, 2, 4)).toEqual([]);
  });
});

describe('runLineRavi', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 }).ok).toBe(
      true,
    );
  });

  it('carries the fast and slow periods onto the run', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    expect(run.fastPeriod).toBe(2);
    expect(run.slowPeriod).toBe(4);
  });

  it('exposes the ravi series', () => {
    expect(
      runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 }).ravi,
    ).toHaveLength(10);
  });

  it('computes the exact ravi series', () => {
    expect(
      runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 }).ravi,
    ).toEqual(EXPECTED_RAVI);
  });

  it('leaves the ravi null until the slow window is full', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    expect(run.samples.slice(0, 3).every((s) => s.ravi === null)).toBe(true);
    expect(typeof run.samples[3]!.ravi).toBe('number');
  });

  it('classifies each sample by the sign of the ravi', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    for (const s of run.samples) {
      if (s.ravi === null || s.ravi === 0) {
        expect(s.sign).toBe('zero');
      } else {
        expect(s.sign).toBe(s.ravi > 0 ? 'positive' : 'negative');
      }
    }
  });

  it('counts the positive and negative bars consistently', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    expect(run.positiveCount).toBe(3);
    expect(run.negativeCount).toBe(4);
    expect(run.positiveCount).toBe(
      run.ravi.filter((v) => v !== null && v > 0).length,
    );
    expect(run.negativeCount).toBe(
      run.ravi.filter((v) => v !== null && v < 0).length,
    );
  });

  it('reports the final ravi reading', () => {
    expect(
      runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 }).raviFinal,
    ).toBe(10);
  });

  it('reports the min and max ravi readings', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    expect(run.raviMin).toBe(-40);
    expect(run.raviMax).toBe(40);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineRavi([{ x: 0, value: 5 }], {
      fastPeriod: 2,
      slowPeriod: 4,
    });
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineRavi([], { fastPeriod: 2, slowPeriod: 4 }).ok).toBe(false);
    expect(runLineRavi(null, { fastPeriod: 2, slowPeriod: 4 }).ok).toBe(
      false,
    );
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...RAVI_DATA].reverse();
    const run = runLineRavi(shuffled, { fastPeriod: 2, slowPeriod: 4 });
    expect(run.series.map((p) => p.x)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 }).samples,
    ).toHaveLength(10);
  });

  it('defaults to a fast period of 7 and a slow period of 65', () => {
    const run = runLineRavi(RAVI_DATA);
    expect(run.fastPeriod).toBe(7);
    expect(run.slowPeriod).toBe(65);
  });
});

describe('computeLineRaviLayout', () => {
  const base = {
    data: RAVI_DATA,
    fastPeriod: 2,
    slowPeriod: 4,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(10);
  });

  it('stacks the price panel above the ravi panel', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.raviPanel.height).toBeGreaterThan(0);
    expect(layout.raviPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and ravi paths', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.raviPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar and one marker per defined ravi', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.priceDots).toHaveLength(10);
    expect(layout.raviMarkers).toHaveLength(7);
  });

  it('places the zero line inside the ravi panel', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.raviPanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.raviPanel.y + layout.raviPanel.height,
    );
  });

  it('centres the ravi panel y-domain on zero', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.raviYMin).toBe(-layout.raviYMax);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineRaviLayout(base);
    expect(layout.fastPeriod).toBe(2);
    expect(layout.slowPeriod).toBe(4);
    expect(layout.raviFinal).toBe(10);
    expect(layout.totalPoints).toBe(10);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineRaviLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.raviPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineRaviLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineRaviChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineRaviChart(RAVI_DATA, {
      fastPeriod: 2,
      slowPeriod: 4,
    });
    expect(text).toContain('Range Action Verification Index');
    expect(text).toContain('fast');
    expect(text).toContain('slow');
    expect(text).toContain('moving average');
  });

  it('reports the positive and negative counts', () => {
    const run = runLineRavi(RAVI_DATA, { fastPeriod: 2, slowPeriod: 4 });
    const text = describeLineRaviChart(RAVI_DATA, {
      fastPeriod: 2,
      slowPeriod: 4,
    });
    expect(text).toContain(`positive on ${run.positiveCount}`);
    expect(text).toContain(`negative on ${run.negativeCount}`);
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineRaviChart([])).toBe('No data');
    expect(describeLineRaviChart(null)).toBe('No data');
  });
});

describe('<ChartLineRavi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ravi-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Range Action Verification Index');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    const root = container.querySelector('[data-section="chart-line-ravi"]');
    expect(root!.getAttribute('data-fast-period')).toBe('2');
    expect(root!.getAttribute('data-slow-period')).toBe('4');
    expect(root!.getAttribute('data-positive-count')).toBe('3');
    expect(root!.getAttribute('data-negative-count')).toBe('4');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and ravi lines', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ravi-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ravi-ravi-line"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ravi-panel-label"]'),
    ).toHaveLength(2);
  });

  it('renders one ravi marker per defined value', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ravi-marker"]'),
    ).toHaveLength(7);
  });

  it('classifies each marker with a sign attribute', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ravi-marker"]',
    );
    for (const m of markers) {
      expect(['positive', 'negative', 'zero']).toContain(
        m.getAttribute('data-sign'),
      );
    }
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ravi-legend-item"]'),
    ).toHaveLength(2);
  });

  it('renders the config badge with the fast and slow periods', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} fastPeriod={2} slowPeriod={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ravi-badge-config"]',
    );
    expect(badge!.textContent).toContain('2');
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-price-path"]'),
    ).toBeNull();
  });

  it('hides the ravi line and markers when showRavi is false', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        showRavi={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-ravi-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-ravi-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the ravi line via the hidden set', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        hiddenSeries={['ravi']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-ravi-line"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-zero-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-ravi-legend-item"][data-series-id="ravi"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'ravi', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ravi-dot"]'),
    ).toHaveLength(10);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineRavi data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-ravi"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-ravi-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRavi
        data={RAVI_DATA}
        fastPeriod={2}
        slowPeriod={4}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ravi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRavi ref={ref} data={RAVI_DATA} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-ravi');
  });

  it('has a stable displayName', () => {
    expect(ChartLineRavi.displayName).toBe('ChartLineRavi');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineRavi data={RAVI_DATA} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-ravi"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
