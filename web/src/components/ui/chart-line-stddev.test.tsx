import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineStdDev,
  computeLineStdDev,
  computeLineStdDevBasis,
  computeLineStdDevLayout,
  getLineStdDevFinitePoints,
  normalizeLineStdDevPeriod,
  normalizeLineStdDevMultiplier,
  runLineStdDev,
  describeLineStdDevChart,
  type ChartLineStdDevPoint,
} from './chart-line-stddev';

afterEach(() => cleanup());

// With period 2 the basis is the two-bar midpoint and the rolling
// standard deviation is exactly half the absolute bar-to-bar move,
// so every value lands on a clean number:
//   [10,14] -> basis 12,   stddev 2
//   [14,11] -> basis 12.5, stddev 1.5
//   [11,17] -> basis 14,   stddev 3
//   [17,12] -> basis 14.5, stddev 2.5
// With multiplier 2 the bands sit two deviations out.
const STDDEV_DATA: ChartLineStdDevPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 11 },
  { x: 3, value: 17 },
  { x: 4, value: 12 },
];

describe('getLineStdDevFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineStdDevFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineStdDevFinitePoints(null)).toEqual([]);
    expect(getLineStdDevFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineStdDevPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineStdDevPeriod(20.8, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineStdDevPeriod(0, 20)).toBe(20);
    expect(normalizeLineStdDevPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineStdDevPeriod(-3, 20)).toBe(20);
  });
});

describe('normalizeLineStdDevMultiplier', () => {
  it('keeps a positive finite multiplier', () => {
    expect(normalizeLineStdDevMultiplier(2.5, 2)).toBe(2.5);
  });

  it('falls back for a zero, negative or non-finite multiplier', () => {
    expect(normalizeLineStdDevMultiplier(0, 2)).toBe(2);
    expect(normalizeLineStdDevMultiplier(-1, 2)).toBe(2);
    expect(normalizeLineStdDevMultiplier(NaN, 2)).toBe(2);
  });
});

describe('computeLineStdDevBasis', () => {
  const values = STDDEV_DATA.map((p) => p.value);

  it('takes the period-bar simple moving average', () => {
    expect(computeLineStdDevBasis(values, 2)).toEqual([
      null, 12, 12.5, 14, 14.5,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    expect(computeLineStdDevBasis(values, 2)[0]).toBeNull();
  });

  it('holds a flat series at its constant', () => {
    expect(computeLineStdDevBasis([5, 5, 5, 5], 2)).toEqual([
      null, 5, 5, 5,
    ]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineStdDevBasis([8], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStdDevBasis(null, 2)).toEqual([]);
  });
});

describe('computeLineStdDev', () => {
  const values = STDDEV_DATA.map((p) => p.value);

  it('takes the rolling population standard deviation', () => {
    expect(computeLineStdDev(values, 2)).toEqual([null, 2, 1.5, 3, 2.5]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    expect(computeLineStdDev(values, 2)[0]).toBeNull();
  });

  it('reports zero for a flat series', () => {
    expect(computeLineStdDev([5, 5, 5, 5], 2)).toEqual([null, 0, 0, 0]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineStdDev([8], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineStdDev(null, 2)).toEqual([]);
  });
});

describe('runLineStdDev', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 }).ok).toBe(
      true,
    );
  });

  it('carries the period and multiplier onto the run', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.period).toBe(2);
    expect(run.multiplier).toBe(2);
  });

  it('exposes the basis and standard deviation series', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.basis).toEqual([null, 12, 12.5, 14, 14.5]);
    expect(run.stddev).toEqual([null, 2, 1.5, 3, 2.5]);
  });

  it('exposes the upper and lower band series', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.upper).toEqual([null, 16, 15.5, 20, 19.5]);
    expect(run.lower).toEqual([null, 8, 9.5, 8, 9.5]);
  });

  it('places the bands a multiplier of deviations from the basis', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    for (const s of run.samples) {
      if (s.basis === null || s.stddev === null) continue;
      expect(s.upper).toBe(s.basis + run.multiplier * s.stddev);
      expect(s.lower).toBe(s.basis - run.multiplier * s.stddev);
    }
  });

  it('classifies each sample by price position versus the basis', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('above');
    expect(run.samples[2]!.position).toBe('below');
    expect(run.samples[3]!.position).toBe('above');
  });

  it('counts bars above and below the basis', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(2);
  });

  it('reports the final basis and band readings', () => {
    const run = runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 });
    expect(run.basisFinal).toBe(14.5);
    expect(run.upperFinal).toBe(19.5);
    expect(run.lowerFinal).toBe(9.5);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineStdDev([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineStdDev([]).ok).toBe(false);
    expect(runLineStdDev(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...STDDEV_DATA].reverse();
    const run = runLineStdDev(shuffled, { period: 2, multiplier: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.basis).toEqual([null, 12, 12.5, 14, 14.5]);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineStdDev(STDDEV_DATA, { period: 2, multiplier: 2 }).samples,
    ).toHaveLength(5);
  });

  it('defaults to period 20 and multiplier 2', () => {
    const run = runLineStdDev(STDDEV_DATA);
    expect(run.period).toBe(20);
    expect(run.multiplier).toBe(2);
  });
});

describe('computeLineStdDevLayout', () => {
  const base = {
    data: STDDEV_DATA,
    period: 2,
    multiplier: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price, basis and band paths', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.basisPath.startsWith('M')).toBe(true);
    expect(layout.upperPath.startsWith('M')).toBe(true);
    expect(layout.lowerPath.startsWith('M')).toBe(true);
  });

  it('closes the band area path', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.bandAreaPath.startsWith('M')).toBe(true);
    expect(layout.bandAreaPath.endsWith('Z')).toBe(true);
  });

  it('emits a price dot per bar and a marker per defined basis', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.basisMarkers).toHaveLength(4);
  });

  it('spans a y domain covering the price and the bands', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(8);
    expect(layout.yMax).toBeGreaterThanOrEqual(20);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineStdDevLayout(base);
    expect(layout.basisFinal).toBe(14.5);
    expect(layout.aboveCount).toBe(2);
    expect(layout.period).toBe(2);
  });

  it('keeps the basis markers inside the panel', () => {
    const layout = computeLineStdDevLayout(base);
    for (const m of layout.basisMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineStdDevLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.basisPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineStdDevLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineStdDevChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineStdDevChart(STDDEV_DATA, {
      period: 2,
      multiplier: 2,
    });
    expect(text).toContain('standard deviation');
    expect(text).toContain('band');
    expect(text).toContain('moving average');
    expect(text).toContain('basis');
    expect(text).toContain('volatile');
  });

  it('reports the above and below counts', () => {
    const text = describeLineStdDevChart(STDDEV_DATA, {
      period: 2,
      multiplier: 2,
    });
    expect(text).toContain('above the basis on 2');
    expect(text).toContain('below on 2');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineStdDevChart([])).toBe('No data');
    expect(describeLineStdDevChart(null)).toBe('No data');
  });
});

describe('<ChartLineStdDev />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stddev-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('standard deviation');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    const root = container.querySelector('[data-section="chart-line-stddev"]');
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-multiplier')).toBe('2');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price, basis and band lines', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-basis-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-upper-line"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-lower-line"]'),
    ).not.toBeNull();
  });

  it('renders the band area', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-band-area"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined basis value', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-stddev-marker"]'),
    ).toHaveLength(4);
  });

  it('renders a three-item legend', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stddev-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period and multiplier', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stddev-badge-config"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-price-path"]'),
    ).toBeNull();
  });

  it('hides the basis line and markers when showBasis is false', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        showBasis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-basis-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-stddev-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the bands when showBands is false', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        showBands={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-upper-line"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-lower-line"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-stddev-band-area"]'),
    ).toBeNull();
  });

  it('hides the bands via the hidden set', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        hiddenSeries={['band']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-upper-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-stddev-legend-item"][data-series-id="band"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'band', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineStdDev data={STDDEV_DATA} period={2} multiplier={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-stddev-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineStdDev data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-stddev"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-stddev-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stddev-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineStdDev ref={ref} data={STDDEV_DATA} period={2} multiplier={2} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-stddev');
  });

  it('has a stable displayName', () => {
    expect(ChartLineStdDev.displayName).toBe('ChartLineStdDev');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineStdDev
        data={STDDEV_DATA}
        period={2}
        multiplier={2}
        animate={false}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-stddev"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
