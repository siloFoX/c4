import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineBandwidth,
  computeLineBandwidth,
  computeLineBandwidthBasis,
  computeLineBandwidthStdDev,
  computeLineBandwidthLayout,
  getLineBandwidthFinitePoints,
  normalizeLineBandwidthPeriod,
  normalizeLineBandwidthMultiplier,
  runLineBandwidth,
  describeLineBandwidthChart,
  type ChartLineBandwidthPoint,
} from './chart-line-bandwidth';

afterEach(() => cleanup());

// With period 2 the basis is the two-bar midpoint and the standard
// deviation is exactly half the bar-to-bar move, so the Bollinger
// Bandwidth (upper - lower) / basis lands on clean numbers:
//   [5,15]  -> basis 10, stddev 5, band [0,20],  bandwidth 2
//   [15,9]  -> basis 12, stddev 3, band [6,18],  bandwidth 1
//   [9,27]  -> basis 18, stddev 9, band [0,36],  bandwidth 2
//   [27,45] -> basis 36, stddev 9, band [18,54], bandwidth 1
const BANDWIDTH_DATA: ChartLineBandwidthPoint[] = [
  { x: 0, value: 5 },
  { x: 1, value: 15 },
  { x: 2, value: 9 },
  { x: 3, value: 27 },
  { x: 4, value: 45 },
];

describe('getLineBandwidthFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineBandwidthFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineBandwidthFinitePoints(null)).toEqual([]);
    expect(getLineBandwidthFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineBandwidthPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineBandwidthPeriod(20.8, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineBandwidthPeriod(0, 20)).toBe(20);
    expect(normalizeLineBandwidthPeriod(NaN, 20)).toBe(20);
    expect(normalizeLineBandwidthPeriod(-3, 20)).toBe(20);
  });
});

describe('normalizeLineBandwidthMultiplier', () => {
  it('keeps a positive finite multiplier', () => {
    expect(normalizeLineBandwidthMultiplier(2.5, 2)).toBe(2.5);
  });

  it('falls back for a zero, negative or non-finite multiplier', () => {
    expect(normalizeLineBandwidthMultiplier(0, 2)).toBe(2);
    expect(normalizeLineBandwidthMultiplier(-1, 2)).toBe(2);
    expect(normalizeLineBandwidthMultiplier(NaN, 2)).toBe(2);
  });
});

describe('computeLineBandwidthBasis', () => {
  const values = BANDWIDTH_DATA.map((p) => p.value);

  it('takes the period-bar simple moving average', () => {
    expect(computeLineBandwidthBasis(values, 2)).toEqual([
      null, 10, 12, 18, 36,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    expect(computeLineBandwidthBasis(values, 2)[0]).toBeNull();
  });

  it('holds a flat series at its constant', () => {
    expect(computeLineBandwidthBasis([5, 5, 5, 5], 2)).toEqual([
      null, 5, 5, 5,
    ]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineBandwidthBasis([8], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineBandwidthBasis(null, 2)).toEqual([]);
  });
});

describe('computeLineBandwidthStdDev', () => {
  const values = BANDWIDTH_DATA.map((p) => p.value);

  it('takes the rolling population standard deviation', () => {
    expect(computeLineBandwidthStdDev(values, 2)).toEqual([
      null, 5, 3, 9, 9,
    ]);
  });

  it('reports zero for a flat series', () => {
    expect(computeLineBandwidthStdDev([5, 5, 5, 5], 2)).toEqual([
      null, 0, 0, 0,
    ]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineBandwidthStdDev([8], 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineBandwidthStdDev(null, 2)).toEqual([]);
  });
});

describe('computeLineBandwidth', () => {
  const values = BANDWIDTH_DATA.map((p) => p.value);

  it('takes the band width as a fraction of the middle line', () => {
    expect(computeLineBandwidth(values, 2, 2)).toEqual([null, 2, 1, 2, 1]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    expect(computeLineBandwidth(values, 2, 2)[0]).toBeNull();
  });

  it('reports zero bandwidth for a flat series', () => {
    expect(computeLineBandwidth([5, 5, 5, 5], 2, 2)).toEqual([
      null, 0, 0, 0,
    ]);
  });

  it('returns all null when shorter than the period', () => {
    expect(computeLineBandwidth([8], 2, 2)).toEqual([null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineBandwidth(null, 2, 2)).toEqual([]);
  });
});

describe('runLineBandwidth', () => {
  it('reports ok for a sufficient series', () => {
    expect(
      runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 }).ok,
    ).toBe(true);
  });

  it('carries the period and multiplier onto the run', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.period).toBe(2);
    expect(run.multiplier).toBe(2);
  });

  it('exposes the basis, stddev and bandwidth series', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.basis).toEqual([null, 10, 12, 18, 36]);
    expect(run.stddev).toEqual([null, 5, 3, 9, 9]);
    expect(run.bandwidth).toEqual([null, 2, 1, 2, 1]);
  });

  it('takes the bandwidth as the band width over the basis', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    for (const s of run.samples) {
      if (s.basis === null || s.stddev === null || s.bandwidth === null) {
        continue;
      }
      const upper = s.basis + run.multiplier * s.stddev;
      const lower = s.basis - run.multiplier * s.stddev;
      expect(s.bandwidth).toBe((upper - lower) / s.basis);
    }
  });

  it('reports the mean bandwidth', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.bandwidthMean).toBe(1.5);
  });

  it('classifies each sample wide or narrow versus the mean', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.samples[0]!.widthClass).toBe('mid');
    expect(run.samples[1]!.widthClass).toBe('wide');
    expect(run.samples[2]!.widthClass).toBe('narrow');
    expect(run.samples[3]!.widthClass).toBe('wide');
  });

  it('counts the wide and narrow bars', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.wideCount).toBe(2);
    expect(run.narrowCount).toBe(2);
  });

  it('reports the final, min and max bandwidth readings', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    expect(run.bandwidthFinal).toBe(1);
    expect(run.bandwidthMin).toBe(1);
    expect(run.bandwidthMax).toBe(2);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineBandwidth([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineBandwidth([]).ok).toBe(false);
    expect(runLineBandwidth(null).ok).toBe(false);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...BANDWIDTH_DATA].reverse();
    const run = runLineBandwidth(shuffled, { period: 2, multiplier: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.bandwidth).toEqual([null, 2, 1, 2, 1]);
  });

  it('produces one sample per series point', () => {
    expect(
      runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 }).samples,
    ).toHaveLength(5);
  });

  it('defaults to period 20 and multiplier 2', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA);
    expect(run.period).toBe(20);
    expect(run.multiplier).toBe(2);
  });
});

describe('computeLineBandwidthLayout', () => {
  const base = {
    data: BANDWIDTH_DATA,
    period: 2,
    multiplier: 2,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('stacks the price panel above the bandwidth panel', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.bandwidthPanel.height).toBeGreaterThan(0);
    expect(layout.bandwidthPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds non-empty price and bandwidth paths', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.bandwidthPath.startsWith('M')).toBe(true);
  });

  it('emits a price dot per bar and a marker per defined bandwidth', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.priceDots).toHaveLength(5);
    expect(layout.bandwidthMarkers).toHaveLength(4);
  });

  it('anchors the bandwidth panel y domain at zero', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.bandwidthYMin).toBe(0);
    expect(layout.bandwidthYMax).toBe(2);
  });

  it('places the mean line inside the bandwidth panel', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.meanInRange).toBe(true);
    expect(layout.meanY).toBeGreaterThanOrEqual(layout.bandwidthPanel.y);
    expect(layout.meanY).toBeLessThanOrEqual(
      layout.bandwidthPanel.y + layout.bandwidthPanel.height,
    );
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineBandwidthLayout(base);
    expect(layout.period).toBe(2);
    expect(layout.wideCount).toBe(2);
    expect(layout.bandwidthFinal).toBe(1);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineBandwidthLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.bandwidthPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineBandwidthLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineBandwidthChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineBandwidthChart(BANDWIDTH_DATA, {
      period: 2,
      multiplier: 2,
    });
    expect(text).toContain('Bollinger Bandwidth');
    expect(text).toContain('middle line');
    expect(text).toContain('squeeze');
    expect(text).toContain('expansion');
  });

  it('reports the wide and narrow counts', () => {
    const run = runLineBandwidth(BANDWIDTH_DATA, { period: 2, multiplier: 2 });
    const text = describeLineBandwidthChart(BANDWIDTH_DATA, {
      period: 2,
      multiplier: 2,
    });
    expect(text).toContain(
      `on ${run.wideCount} bars and narrow on ${run.narrowCount}`,
    );
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineBandwidthChart([])).toBe('No data');
    expect(describeLineBandwidthChart(null)).toBe('No data');
  });
});

describe('<ChartLineBandwidth />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bandwidth-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Bollinger Bandwidth');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bandwidth"]',
    );
    expect(root!.getAttribute('data-period')).toBe('2');
    expect(root!.getAttribute('data-multiplier')).toBe('2');
    expect(root!.getAttribute('data-wide-count')).toBe('2');
    expect(root!.getAttribute('data-narrow-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and bandwidth lines', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bandwidth-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bandwidth-price-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-bandwidth-bandwidth-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bandwidth-panel-label"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one marker per defined bandwidth value', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bandwidth-marker"]',
      ),
    ).toHaveLength(4);
  });

  it('renders the mean line', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bandwidth-mean-line"]'),
    ).not.toBeNull();
  });

  it('renders a two-item legend', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bandwidth-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('renders the config badge with the period and multiplier', () => {
    const { container } = render(
      <ChartLineBandwidth data={BANDWIDTH_DATA} period={2} multiplier={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-bandwidth-badge-config"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        hiddenSeries={['price']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bandwidth-price-path"]',
      ),
    ).toBeNull();
  });

  it('hides the bandwidth line and markers when showBandwidth is false', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        showBandwidth={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bandwidth-bandwidth-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bandwidth-marker"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the bandwidth line via the hidden set', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        hiddenSeries={['bandwidth']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bandwidth-bandwidth-line"]',
      ),
    ).toBeNull();
  });

  it('hides the mean line when showMeanLine is false', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        showMeanLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bandwidth-mean-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-bandwidth-legend-item"][data-series-id="bandwidth"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'bandwidth', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        showDots
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-bandwidth-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineBandwidth data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bandwidth"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-bandwidth-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bandwidth-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineBandwidth
        ref={ref}
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-bandwidth',
    );
  });

  it('has a stable displayName', () => {
    expect(ChartLineBandwidth.displayName).toBe('ChartLineBandwidth');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineBandwidth
        data={BANDWIDTH_DATA}
        period={2}
        multiplier={2}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bandwidth"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
