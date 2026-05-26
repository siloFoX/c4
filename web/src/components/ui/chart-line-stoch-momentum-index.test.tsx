import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_STOCH_MOMENTUM_INDEX_EPSILON,
  ChartLineStochMomentumIndex,
  DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD,
  DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1,
  DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2,
  DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD,
  classifyLineStochMomentumIndexZone,
  computeLineStochMomentumIndex,
  computeLineStochMomentumIndexEma,
  computeLineStochMomentumIndexLayout,
  computeLineStochMomentumIndexLegs,
  describeLineStochMomentumIndexChart,
  getLineStochMomentumIndexFinitePoints,
  normalizeLineStochMomentumIndexPeriod,
  normalizeLineStochMomentumIndexSmooth,
  normalizeLineStochMomentumIndexThreshold,
  runLineStochMomentumIndex,
  type ChartLineStochMomentumIndexPoint,
} from './chart-line-stoch-momentum-index';

// Constant bars: H = L = C = 5 -> halfRange = 0 -> SMI null.
const CONST_FLAT: ChartLineStochMomentumIndexPoint[] = Array.from(
  { length: 15 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// Centered fixture: H = 10, L = 0, C = 5 at every bar. distance = 0,
// halfRange = 5. SMI = 0 / 5 = 0 bit-exact (zero arithmetic).
const CENTERED: ChartLineStochMomentumIndexPoint[] = Array.from(
  { length: 15 },
  (_, i) => ({ x: i, high: 10, low: 0, close: 5 }),
);

// All-high fixture: high keeps rising, low stays anchored, close at
// the high. distance = halfRange at every bar -> SMI = 100 bit-exact.
const ALL_HIGH: ChartLineStochMomentumIndexPoint[] = Array.from(
  { length: 15 },
  (_, i) => ({ x: i, high: 10 + i, low: 0, close: 10 + i }),
);

// All-low fixture: low keeps falling, high stays anchored, close at
// the low. distance = -halfRange at every bar -> SMI = -100 bit-exact.
const ALL_LOW: ChartLineStochMomentumIndexPoint[] = Array.from(
  { length: 15 },
  (_, i) => ({ x: i, high: 10, low: 0 - i, close: 0 - i }),
);

// A modestly varied wave for layout / component tests.
const WAVE: ChartLineStochMomentumIndexPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const v = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: v + 2, low: v - 2, close: v };
  },
);

const OPTS = {
  period: 5,
  smooth1: 3,
  smooth2: 3,
  threshold: 40,
} as const;

describe('getLineStochMomentumIndexFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineStochMomentumIndexFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineStochMomentumIndexFinitePoints(
        'nope' as unknown as ChartLineStochMomentumIndexPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite OHLC or high < low', () => {
    const points: ChartLineStochMomentumIndexPoint[] = [
      { x: 0, high: 12, low: 8, close: 10 },
      { x: Number.NaN, high: 12, low: 8, close: 10 },
      { x: 1, high: Number.NaN, low: 8, close: 10 },
      { x: 2, high: 12, low: Number.NaN, close: 10 },
      { x: 3, high: 12, low: 8, close: Number.NaN },
      { x: 4, high: 5, low: 10, close: 7 },
      { x: 5, high: 12, low: 8, close: 10 },
    ];
    const out = getLineStochMomentumIndexFinitePoints(points);
    expect(out.map((p) => p.x)).toEqual([0, 5]);
  });

  it('preserves input order', () => {
    const finite = getLineStochMomentumIndexFinitePoints(
      WAVE.slice().reverse(),
    );
    expect(finite.map((p) => p.x)).toEqual(
      [...WAVE].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineStochMomentumIndexPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineStochMomentumIndexPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineStochMomentumIndexPeriod(14.9, 10)).toBe(14);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineStochMomentumIndexPeriod(0, 10)).toBe(10);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineStochMomentumIndexPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineStochMomentumIndexSmooth', () => {
  it('keeps a valid integer smoothing length', () => {
    expect(normalizeLineStochMomentumIndexSmooth(5, 3)).toBe(5);
  });

  it('falls back for sub-1', () => {
    expect(normalizeLineStochMomentumIndexSmooth(0, 3)).toBe(3);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineStochMomentumIndexSmooth(Number.NaN, 3)).toBe(3);
  });
});

describe('normalizeLineStochMomentumIndexThreshold', () => {
  it('keeps a threshold in (0, 100]', () => {
    expect(normalizeLineStochMomentumIndexThreshold(50, 40)).toBe(50);
  });

  it('falls back for zero', () => {
    expect(normalizeLineStochMomentumIndexThreshold(0, 40)).toBe(40);
  });

  it('falls back above 100', () => {
    expect(normalizeLineStochMomentumIndexThreshold(150, 40)).toBe(40);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineStochMomentumIndexThreshold(Number.NaN, 40)).toBe(40);
  });
});

describe('computeLineStochMomentumIndexEma', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineStochMomentumIndexEma(null as unknown as number[], 3),
    ).toEqual([]);
  });

  it('seeds at the first defined value and stays constant on a constant input', () => {
    const out = computeLineStochMomentumIndexEma([5, 5, 5, 5, 5], 3);
    for (const v of out) expect(v).toBe(5);
  });

  it('keeps a zero series at zero (bit-exact via zero arithmetic)', () => {
    const out = computeLineStochMomentumIndexEma([0, 0, 0, 0, 0], 3);
    for (const v of out) expect(v).toBe(0);
  });

  it('propagates null through the output', () => {
    const out = computeLineStochMomentumIndexEma([null, null, 1, 2, 3], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBe(1);
  });
});

describe('computeLineStochMomentumIndexLegs', () => {
  it('returns empty legs for non-array or empty input', () => {
    expect(computeLineStochMomentumIndexLegs(null, 5)).toEqual({
      distance: [],
      halfRange: [],
    });
    expect(computeLineStochMomentumIndexLegs([], 5)).toEqual({
      distance: [],
      halfRange: [],
    });
  });

  it('leaves the warm-up bars null on both legs', () => {
    const { distance, halfRange } = computeLineStochMomentumIndexLegs(
      CENTERED,
      5,
    );
    for (let i = 0; i < 4; i += 1) {
      expect(distance[i]).toBeNull();
      expect(halfRange[i]).toBeNull();
    }
  });

  it('CENTERED fixture: distance is zero and halfRange is 5 at every defined bar (bit-exact)', () => {
    const { distance, halfRange } = computeLineStochMomentumIndexLegs(
      CENTERED,
      5,
    );
    for (let i = 4; i < distance.length; i += 1) {
      expect(distance[i]).toBe(0);
      expect(halfRange[i]).toBe(5);
    }
  });

  it('CONST_FLAT fixture: distance is zero and halfRange is zero at every defined bar', () => {
    const { distance, halfRange } = computeLineStochMomentumIndexLegs(
      CONST_FLAT,
      5,
    );
    for (let i = 4; i < distance.length; i += 1) {
      expect(distance[i]).toBe(0);
      expect(halfRange[i]).toBe(0);
    }
  });
});

describe('computeLineStochMomentumIndex', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLineStochMomentumIndex(null, 5, 3, 3)).toEqual([]);
    expect(computeLineStochMomentumIndex([], 5, 3, 3)).toEqual([]);
  });

  it('the constant series leaves every bar null (zero halfRange)', () => {
    const out = computeLineStochMomentumIndex(CONST_FLAT, 5, 3, 3);
    for (const v of out) expect(v).toBeNull();
  });

  it('the CENTERED fixture pins to 0 at every defined bar (bit-exact)', () => {
    const out = computeLineStochMomentumIndex(CENTERED, 5, 3, 3);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('the ALL-HIGH fixture pins to 100 at every defined bar (bit-exact, distance == halfRange)', () => {
    const out = computeLineStochMomentumIndex(ALL_HIGH, 5, 3, 3);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('the ALL-LOW fixture pins to -100 at every defined bar (bit-exact, distance == -halfRange)', () => {
    const out = computeLineStochMomentumIndex(ALL_LOW, 5, 3, 3);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(-100);
  });

  it('every defined value lies inside [-100, 100] for a varied wave', () => {
    const out = computeLineStochMomentumIndex(WAVE, 5, 3, 3);
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('exposes a small smoothed-halfRange epsilon', () => {
    expect(CHART_LINE_STOCH_MOMENTUM_INDEX_EPSILON).toBeGreaterThan(0);
    expect(CHART_LINE_STOCH_MOMENTUM_INDEX_EPSILON).toBeLessThan(1e-6);
  });
});

describe('classifyLineStochMomentumIndexZone', () => {
  it('null -> none', () => {
    expect(classifyLineStochMomentumIndexZone(null, 40)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineStochMomentumIndexZone(Number.NaN, 40)).toBe('none');
  });

  it('at-or-above the threshold -> overbought', () => {
    expect(classifyLineStochMomentumIndexZone(45, 40)).toBe('overbought');
    expect(classifyLineStochMomentumIndexZone(40, 40)).toBe('overbought');
  });

  it('at-or-below the negative threshold -> oversold', () => {
    expect(classifyLineStochMomentumIndexZone(-45, 40)).toBe('oversold');
    expect(classifyLineStochMomentumIndexZone(-40, 40)).toBe('oversold');
  });

  it('inside the band -> neutral', () => {
    expect(classifyLineStochMomentumIndexZone(0, 40)).toBe('neutral');
    expect(classifyLineStochMomentumIndexZone(30, 40)).toBe('neutral');
    expect(classifyLineStochMomentumIndexZone(-30, 40)).toBe('neutral');
  });
});

describe('runLineStochMomentumIndex', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      runLineStochMomentumIndex(
        [{ x: 0, high: 10, low: 0, close: 5 }],
        OPTS,
      ).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineStochMomentumIndex([]).ok).toBe(false);
    expect(runLineStochMomentumIndex(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineStochMomentumIndex(WAVE, OPTS).ok).toBe(true);
  });

  it('uses the default period and smoothings', () => {
    const run = runLineStochMomentumIndex(WAVE);
    expect(run.period).toBe(DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD);
    expect(run.smooth1).toBe(DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1);
    expect(run.smooth2).toBe(DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2);
    expect(run.threshold).toBe(
      DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineStochMomentumIndex(WAVE, OPTS);
    expect(run.period).toBe(5);
    expect(run.smooth1).toBe(3);
    expect(run.smooth2).toBe(3);
    expect(run.threshold).toBe(40);
  });

  it('the CENTERED fixture counts as fully neutral (SMI = 0 < 40)', () => {
    const run = runLineStochMomentumIndex(CENTERED, OPTS);
    expect(run.neutralCount).toBe(CENTERED.length - 4);
    expect(run.overboughtCount).toBe(0);
    expect(run.oversoldCount).toBe(0);
  });

  it('the ALL-HIGH fixture counts as fully overbought (SMI = 100 >= 40)', () => {
    const run = runLineStochMomentumIndex(ALL_HIGH, OPTS);
    expect(run.overboughtCount).toBe(ALL_HIGH.length - 4);
    expect(run.oversoldCount).toBe(0);
  });

  it('the ALL-LOW fixture counts as fully oversold (SMI = -100 <= -40)', () => {
    const run = runLineStochMomentumIndex(ALL_LOW, OPTS);
    expect(run.oversoldCount).toBe(ALL_LOW.length - 4);
    expect(run.overboughtCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineStochMomentumIndex(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.overboughtCount + run.oversoldCount + run.neutralCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineStochMomentumIndex(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...WAVE].sort(() => -1);
    const run = runLineStochMomentumIndex(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final SMI reading', () => {
    expect(runLineStochMomentumIndex(CENTERED, OPTS).smiFinal).toBe(0);
    expect(runLineStochMomentumIndex(ALL_HIGH, OPTS).smiFinal).toBe(100);
    expect(runLineStochMomentumIndex(ALL_LOW, OPTS).smiFinal).toBe(-100);
  });
});

describe('computeLineStochMomentumIndexLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineStochMomentumIndexLayout({
        data: [{ x: 0, high: 10, low: 0, close: 5 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineStochMomentumIndexLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineStochMomentumIndexLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('stacks the price panel above the smi panel', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.smiPanelTop);
  });

  it('builds non-empty price and smi paths', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.smiPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.priceDots).toHaveLength(WAVE.length);
  });

  it('emits one marker per defined-SMI bar', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    const defined = layout.run.samples.filter((s) => s.smi !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('the upper threshold sits above the lower threshold on the y axis', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.upperThresholdY).toBeLessThan(layout.lowerThresholdY);
  });

  it('the zero line sits inside the smi panel', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.smiPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.smiPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineStochMomentumIndexLayout({
      data: WAVE,
      ...OPTS,
    });
    expect(layout.run.period).toBe(5);
  });
});

describe('describeLineStochMomentumIndexChart', () => {
  it('names the indicator', () => {
    expect(describeLineStochMomentumIndexChart(WAVE, OPTS)).toContain(
      'Stochastic Momentum Index',
    );
  });

  it('mentions the close-to-midpoint distance', () => {
    expect(describeLineStochMomentumIndexChart(WAVE, OPTS)).toContain(
      'midpoint',
    );
  });

  it('mentions the period and smoothings', () => {
    expect(describeLineStochMomentumIndexChart(WAVE, OPTS)).toContain(
      'period 5',
    );
    expect(describeLineStochMomentumIndexChart(WAVE, OPTS)).toContain(
      'smoothing 3/3',
    );
  });

  it('mentions the [-100, 100] bound', () => {
    expect(describeLineStochMomentumIndexChart(WAVE, OPTS)).toContain(
      '[-100, 100]',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineStochMomentumIndexChart([])).toBe('No data');
    expect(describeLineStochMomentumIndexChart(null)).toBe('No data');
  });
});

describe('<ChartLineStochMomentumIndex />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineStochMomentumIndex data={WAVE} period={5} />);
    expect(
      screen.getByRole('region', {
        name: /Stochastic Momentum Index chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-momentum-index-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic Momentum Index');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={[]} period={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-momentum-index-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors period, smoothings and threshold on the root', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex
        data={WAVE}
        period={5}
        smooth1={3}
        smooth2={3}
        threshold={40}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-stoch-momentum-index"]',
    );
    expect(root?.getAttribute('data-period')).toBe('5');
    expect(root?.getAttribute('data-smooth1')).toBe('3');
    expect(root?.getAttribute('data-smooth2')).toBe('3');
    expect(root?.getAttribute('data-threshold')).toBe('40');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the close line and the SMI line', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-momentum-index-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-momentum-index-smi-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the zero line and both threshold lines by default', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-momentum-index-zero-line"]',
      ),
    ).toBeInTheDocument();
    const lines = container.querySelectorAll(
      '[data-section="chart-line-stoch-momentum-index-threshold-line"]',
    );
    expect(lines).toHaveLength(2);
  });

  it('renders markers for the defined-SMI bars', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-momentum-index-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-momentum-index-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['overbought', 'oversold', 'neutral']).toContain(zone);
    }
  });

  it('flags overbought markers on the ALL-HIGH fixture', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={ALL_HIGH} period={5} threshold={40} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-momentum-index-marker"][data-zone="overbought"]',
    );
    expect(markers.length).toBe(ALL_HIGH.length - 4);
  });

  it('flags oversold markers on the ALL-LOW fixture', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={ALL_LOW} period={5} threshold={40} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-momentum-index-marker"][data-zone="oversold"]',
    );
    expect(markers.length).toBe(ALL_LOW.length - 4);
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex
        data={WAVE}
        period={5}
        smooth1={3}
        smooth2={3}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-momentum-index-badge-config"]',
    );
    expect(badge?.textContent).toContain('SMI 5/3/3');
  });

  it('hides the SMI line via the legend toggle', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex data={WAVE} period={5} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-stoch-momentum-index-legend-item"][data-series-id="smi"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-stoch-momentum-index-smi-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines via showThresholdLines=false', () => {
    const { container } = render(
      <ChartLineStochMomentumIndex
        data={WAVE}
        period={5}
        showThresholdLines={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stoch-momentum-index-threshold-line"]',
      ),
    ).toHaveLength(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineStochMomentumIndex
        data={WAVE}
        period={5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-momentum-index-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochMomentumIndex ref={ref} data={WAVE} period={5} />);
    expect(ref.current).not.toBeNull();
  });
});
