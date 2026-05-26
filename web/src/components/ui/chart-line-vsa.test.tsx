import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineVsa,
  DEFAULT_CHART_LINE_VSA_PERIOD,
  DEFAULT_CHART_LINE_VSA_THRESHOLD,
  classifyLineVsaZone,
  computeLineVsa,
  computeLineVsaLayout,
  describeLineVsaChart,
  getLineVsaFinitePoints,
  normalizeLineVsaPeriod,
  normalizeLineVsaThreshold,
  runLineVsa,
  type ChartLineVsaPoint,
} from './chart-line-vsa';

const toBars = (
  spreads: number[],
  volumes: number[],
  midpoint = 100,
): ChartLineVsaPoint[] =>
  spreads.map((s, i) => ({
    x: i,
    high: midpoint + s / 2,
    low: midpoint - s / 2,
    volume: volumes[i] ?? 0,
  }));

// All-equal fixture: spread = 4, volume = 4 at every bar.
// spreadMean = 4, volMean = 4, effort = result = 1, VSA = 0 bit-exact.
const EQUAL_ALL: ChartLineVsaPoint[] = toBars(
  [4, 4, 4, 4, 4],
  [4, 4, 4, 4, 4],
);

// Ease-of-move worked anchor: spreads [2, 2, 2, 2, 12], volumes
// [4, 4, 4, 4, 4]. spreadMean = 4, volMean = 4. bar 4: spread 12 ->
// result 3, volume 4 -> effort 1; VSA = 1 - 3 = -2 bit-exact.
const ANCHOR_EASE: ChartLineVsaPoint[] = toBars(
  [2, 2, 2, 2, 12],
  [4, 4, 4, 4, 4],
);

// No-demand worked anchor: spreads constant 4, volumes [2, 2, 2, 2, 12].
// spreadMean = 4, volMean = 4. bar 4: effort 3, result 1; VSA = 2 bit-exact.
const ANCHOR_NO_DEMAND: ChartLineVsaPoint[] = toBars(
  [4, 4, 4, 4, 4],
  [2, 2, 2, 2, 12],
);

// A modestly divergent fixture for layout / component tests.
const MIXED: ChartLineVsaPoint[] = toBars(
  [3, 4, 3, 4, 6, 2, 4, 4, 3, 5, 4, 4, 4, 4, 3, 4],
  [10, 11, 9, 12, 8, 14, 10, 9, 11, 10, 12, 11, 13, 9, 10, 12],
);

const OPTS = { period: 5, threshold: 0.5 } as const;

describe('getLineVsaFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineVsaFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineVsaFinitePoints('nope' as unknown as ChartLineVsaPoint[]),
    ).toEqual([]);
  });

  it('drops non-finite x, high, low, volume, high < low, or negative volume', () => {
    const points: ChartLineVsaPoint[] = [
      { x: 0, high: 12, low: 10, volume: 100 },
      { x: Number.NaN, high: 12, low: 10, volume: 100 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 10, volume: 100 },
      { x: 2, high: 12, low: Number.NaN, volume: 100 },
      { x: 3, high: 12, low: 10, volume: Number.NaN },
      { x: 4, high: 5, low: 10, volume: 100 },
      { x: 5, high: 12, low: 10, volume: -1 },
      { x: 6, high: 12, low: 12, volume: 0 },
    ];
    const out = getLineVsaFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 6]);
  });

  it('preserves input order', () => {
    const finite = getLineVsaFinitePoints(EQUAL_ALL.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...EQUAL_ALL].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineVsaPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineVsaPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineVsaPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineVsaPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineVsaPeriod(Number.NaN, 14)).toBe(14);
  });

  it('falls back for a string', () => {
    expect(normalizeLineVsaPeriod('14' as unknown as number, 14)).toBe(14);
  });
});

describe('normalizeLineVsaThreshold', () => {
  it('keeps a positive threshold', () => {
    expect(normalizeLineVsaThreshold(0.8, 0.5)).toBe(0.8);
  });

  it('falls back for zero', () => {
    expect(normalizeLineVsaThreshold(0, 0.5)).toBe(0.5);
  });

  it('falls back for negative', () => {
    expect(normalizeLineVsaThreshold(-0.1, 0.5)).toBe(0.5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineVsaThreshold(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineVsa', () => {
  it('returns empty arrays for non-array or empty input', () => {
    expect(computeLineVsa(null, 5)).toEqual({
      effort: [],
      result: [],
      vsa: [],
    });
    expect(computeLineVsa([], 5)).toEqual({
      effort: [],
      result: [],
      vsa: [],
    });
  });

  it('matches input length on all three arrays', () => {
    const out = computeLineVsa(MIXED, 5);
    expect(out.effort).toHaveLength(MIXED.length);
    expect(out.result).toHaveLength(MIXED.length);
    expect(out.vsa).toHaveLength(MIXED.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineVsa(EQUAL_ALL, 5);
    for (let i = 0; i < 4; i += 1) {
      expect(out.effort[i]).toBeNull();
      expect(out.result[i]).toBeNull();
      expect(out.vsa[i]).toBeNull();
    }
  });

  it('the equal-all anchor: VSA = 0 bit-exact at every defined bar (effort = result = 1)', () => {
    const out = computeLineVsa(EQUAL_ALL, 5);
    expect(out.effort[4]).toBe(1);
    expect(out.result[4]).toBe(1);
    expect(out.vsa[4]).toBe(0);
  });

  it('the ease-of-move anchor: VSA = -2 bit-exact (spread 12 vs mean 4, volume mean ratio 1)', () => {
    const out = computeLineVsa(ANCHOR_EASE, 5);
    expect(out.effort[4]).toBe(1);
    expect(out.result[4]).toBe(3);
    expect(out.vsa[4]).toBe(-2);
  });

  it('the no-demand anchor: VSA = 2 bit-exact (volume 12 vs mean 4, spread mean ratio 1)', () => {
    const out = computeLineVsa(ANCHOR_NO_DEMAND, 5);
    expect(out.effort[4]).toBe(3);
    expect(out.result[4]).toBe(1);
    expect(out.vsa[4]).toBe(2);
  });

  it('zero mean spread (degenerate window) leaves the bar null', () => {
    const bars: ChartLineVsaPoint[] = [
      { x: 0, high: 5, low: 5, volume: 10 },
      { x: 1, high: 5, low: 5, volume: 10 },
      { x: 2, high: 5, low: 5, volume: 10 },
      { x: 3, high: 5, low: 5, volume: 10 },
      { x: 4, high: 5, low: 5, volume: 10 },
    ];
    const out = computeLineVsa(bars, 5);
    expect(out.vsa[4]).toBeNull();
  });

  it('zero mean volume (degenerate window) leaves the bar null', () => {
    const bars: ChartLineVsaPoint[] = [
      { x: 0, high: 6, low: 4, volume: 0 },
      { x: 1, high: 6, low: 4, volume: 0 },
      { x: 2, high: 6, low: 4, volume: 0 },
      { x: 3, high: 6, low: 4, volume: 0 },
      { x: 4, high: 6, low: 4, volume: 0 },
    ];
    const out = computeLineVsa(bars, 5);
    expect(out.vsa[4]).toBeNull();
  });

  it('every defined VSA is finite for a normal varied input', () => {
    const out = computeLineVsa(MIXED, 5);
    for (const v of out.vsa) {
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('the effort and result are non-negative for non-degenerate windows', () => {
    const out = computeLineVsa(MIXED, 5);
    for (let i = 0; i < out.effort.length; i += 1) {
      const e = out.effort[i];
      const r = out.result[i];
      if (e === null || r === null) continue;
      expect(e).toBeGreaterThanOrEqual(0);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('classifyLineVsaZone', () => {
  it('null -> none', () => {
    expect(classifyLineVsaZone(null, 0.5)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineVsaZone(Number.NaN, 0.5)).toBe('none');
  });

  it('above the threshold -> no-demand', () => {
    expect(classifyLineVsaZone(2, 0.5)).toBe('no-demand');
  });

  it('below the negative threshold -> ease-of-move', () => {
    expect(classifyLineVsaZone(-2, 0.5)).toBe('ease-of-move');
  });

  it('inside the band -> agreement', () => {
    expect(classifyLineVsaZone(0.3, 0.5)).toBe('agreement');
    expect(classifyLineVsaZone(-0.3, 0.5)).toBe('agreement');
    expect(classifyLineVsaZone(0, 0.5)).toBe('agreement');
  });

  it('exactly at the threshold -> agreement (strict less / strict greater)', () => {
    expect(classifyLineVsaZone(0.5, 0.5)).toBe('agreement');
    expect(classifyLineVsaZone(-0.5, 0.5)).toBe('agreement');
  });
});

describe('runLineVsa', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineVsa(
        [{ x: 0, high: 12, low: 10, volume: 100 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineVsa([]).ok).toBe(false);
    expect(runLineVsa(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineVsa(EQUAL_ALL, OPTS).ok).toBe(true);
  });

  it('uses the default period and threshold', () => {
    const run = runLineVsa(MIXED);
    expect(run.period).toBe(DEFAULT_CHART_LINE_VSA_PERIOD);
    expect(run.threshold).toBe(DEFAULT_CHART_LINE_VSA_THRESHOLD);
  });

  it('honours custom options', () => {
    const run = runLineVsa(MIXED, { period: 6, threshold: 1.5 });
    expect(run.period).toBe(6);
    expect(run.threshold).toBe(1.5);
  });

  it('the equal-all anchor counts as agreement at every defined bar', () => {
    const run = runLineVsa(EQUAL_ALL, OPTS);
    expect(run.agreementCount).toBe(1);
    expect(run.noDemandCount).toBe(0);
    expect(run.easeOfMoveCount).toBe(0);
  });

  it('the ease-of-move anchor classifies its last bar accordingly', () => {
    const run = runLineVsa(ANCHOR_EASE, OPTS);
    expect(run.samples[4]!.zone).toBe('ease-of-move');
    expect(run.samples[4]!.vsa).toBe(-2);
  });

  it('the no-demand anchor classifies its last bar accordingly', () => {
    const run = runLineVsa(ANCHOR_NO_DEMAND, OPTS);
    expect(run.samples[4]!.zone).toBe('no-demand');
    expect(run.samples[4]!.vsa).toBe(2);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineVsa(MIXED, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.agreementCount +
        run.noDemandCount +
        run.easeOfMoveCount +
        none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineVsa(MIXED, OPTS);
    expect(run.samples).toHaveLength(MIXED.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...MIXED].sort(() => -1);
    const run = runLineVsa(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final VSA value', () => {
    const run = runLineVsa(EQUAL_ALL, OPTS);
    expect(run.vsaFinal).toBe(0);
  });

  it('the midpoint of each sample equals (high + low) / 2', () => {
    const run = runLineVsa(MIXED, OPTS);
    for (const sample of run.samples) {
      expect(sample.midpoint).toBe((sample.high + sample.low) / 2);
    }
  });
});

describe('computeLineVsaLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineVsaLayout({
        data: [{ x: 0, high: 12, low: 10, volume: 100 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineVsaLayout({
        data: MIXED,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineVsaLayout({ data: MIXED, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the VSA panel', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.vsaPanelTop);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    expect(layout.priceDots).toHaveLength(MIXED.length);
  });

  it('emits one marker per defined-VSA bar', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    const defined = layout.run.samples.filter((s) => s.vsa !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('puts the zero line inside the VSA panel', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.vsaPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.vsaPanelBottom);
  });

  it('the upper threshold sits above the lower threshold on the y axis', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    expect(layout.upperThresholdY).toBeLessThan(layout.lowerThresholdY);
  });

  it('every marker lies inside the VSA panel', () => {
    const layout = computeLineVsaLayout({ data: MIXED, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.vsaPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.vsaPanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineVsaLayout({ data: EQUAL_ALL, ...OPTS });
    expect(layout.run.period).toBe(5);
    expect(layout.run.threshold).toBe(0.5);
  });
});

describe('describeLineVsaChart', () => {
  it('names the indicator', () => {
    expect(describeLineVsaChart(MIXED, OPTS)).toContain('Volume Spread Analysis');
  });

  it('mentions the effort and result decomposition', () => {
    expect(describeLineVsaChart(MIXED, OPTS)).toContain('effort');
    expect(describeLineVsaChart(MIXED, OPTS)).toContain('result');
  });

  it('mentions the no-demand interpretation', () => {
    expect(describeLineVsaChart(MIXED, OPTS)).toContain('no demand');
  });

  it('mentions the ease-of-move interpretation', () => {
    expect(describeLineVsaChart(MIXED, OPTS)).toContain('ease-of-move');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineVsaChart([])).toBe('No data');
    expect(describeLineVsaChart(null)).toBe('No data');
  });
});

describe('<ChartLineVsa />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineVsa data={MIXED} period={5} threshold={0.5} />);
    expect(
      screen.getByRole('region', {
        name: /Volume Spread Analysis chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vsa-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Volume Spread Analysis');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineVsa data={[]} period={5} threshold={0.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors period and threshold on the root', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const root = container.querySelector('[data-section="chart-line-vsa"]');
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-threshold')).toBe('0.5');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price and VSA lines', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-vsa-vsa-line"]'),
    ).toBeInTheDocument();
  });

  it('renders the zero line and both threshold lines by default', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vsa-zero-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-vsa-threshold-line"]',
      ).length,
    ).toBe(2);
  });

  it('renders markers for the defined-VSA bars', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vsa-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vsa-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['agreement', 'no-demand', 'ease-of-move']).toContain(zone);
    }
  });

  it('flags the no-demand marker on the no-demand anchor fixture', () => {
    const { container } = render(
      <ChartLineVsa data={ANCHOR_NO_DEMAND} period={5} threshold={0.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vsa-marker"][data-zone="no-demand"]',
    );
    expect(markers.length).toBe(1);
  });

  it('flags the ease-of-move marker on the ease-of-move anchor fixture', () => {
    const { container } = render(
      <ChartLineVsa data={ANCHOR_EASE} period={5} threshold={0.5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-vsa-marker"][data-zone="ease-of-move"]',
    );
    expect(markers.length).toBe(1);
  });

  it('renders the config badge with the period and threshold', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-vsa-badge-config"]',
    );
    expect(badge?.textContent).toContain('VSA 5/0.5');
  });

  it('hides the VSA line via the legend toggle', () => {
    const { container } = render(
      <ChartLineVsa data={MIXED} period={5} threshold={0.5} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-vsa-legend-item"][data-series-id="vsa"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-vsa-vsa-line"]'),
    ).toBeNull();
  });

  it('hides the threshold lines via showThresholdLines=false', () => {
    const { container } = render(
      <ChartLineVsa
        data={MIXED}
        period={5}
        threshold={0.5}
        showThresholdLines={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-vsa-threshold-line"]',
      ).length,
    ).toBe(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineVsa
        data={MIXED}
        period={5}
        threshold={0.5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-vsa-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineVsa ref={ref} data={MIXED} period={5} threshold={0.5} />);
    expect(ref.current).not.toBeNull();
  });
});
