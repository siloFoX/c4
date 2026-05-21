import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSpecialK,
  getLineSpecialKFinitePoints,
  normalizeLineSpecialKComponents,
  normalizeLineSpecialKSignal,
  computeLineSpecialKRoc,
  computeLineSpecialKComponent,
  computeLineSpecialK,
  computeLineSpecialKSignal,
  runLineSpecialK,
  computeLineSpecialKLayout,
  describeLineSpecialKChart,
  DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
  DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL,
  type ChartLineSpecialKPoint,
} from './chart-line-special-k';

afterEach(() => cleanup());

// Ten leading 100s give every rate-of-change a base close of
// exactly 100, so ROC = close - 100 -- which keeps the whole
// Special K pipeline on exact integers (the signal halves to a
// dyadic). The price then steps to 112, 124, 106, 88.
const SK_CLOSES = [
  100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 112, 124, 106, 88,
];
const SK_DATA: ChartLineSpecialKPoint[] = SK_CLOSES.map((value, x) => ({
  x,
  value,
}));
const COMPONENTS = [
  { roc: 4, sma: 2, weight: 1 },
  { roc: 5, sma: 2, weight: 2 },
  { roc: 6, sma: 3, weight: 3 },
];
const OPTS = { components: COMPONENTS, signalPeriod: 2 };

const COMPONENT_A_EXPECTED = [
  null, null, null, null, null, 0, 0, 0, 0, 0, 6, 18, 15, -3,
];
const SK_EXPECTED = [
  null, null, null, null, null, null, null, null, 0, 0, 30, 90, 87, 9,
];
const SIGNAL_EXPECTED = [
  null, null, null, null, null, null, null, null, null, 0, 15, 60, 88.5, 48,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'none',
  'flat',
  'bull',
  'bull',
  'bear',
  'bear',
];

describe('normalizeLineSpecialKComponents', () => {
  it('keeps a valid component table', () => {
    expect(
      normalizeLineSpecialKComponents(
        COMPONENTS,
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toEqual(COMPONENTS);
  });
  it('falls back for a non-array input', () => {
    expect(
      normalizeLineSpecialKComponents(
        null,
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toHaveLength(DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS.length);
  });
  it('falls back for an empty table', () => {
    expect(
      normalizeLineSpecialKComponents(
        [],
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toHaveLength(DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS.length);
  });
  it('floors fractional lookbacks', () => {
    expect(
      normalizeLineSpecialKComponents(
        [{ roc: 4.7, sma: 2.9, weight: 1 }],
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toEqual([{ roc: 4, sma: 2, weight: 1 }]);
  });
  it('drops an entry with a sub-1 lookback', () => {
    expect(
      normalizeLineSpecialKComponents(
        [
          { roc: 4, sma: 2, weight: 1 },
          { roc: 0, sma: 2, weight: 1 },
        ],
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toEqual([{ roc: 4, sma: 2, weight: 1 }]);
  });
  it('falls back when every entry is invalid', () => {
    expect(
      normalizeLineSpecialKComponents(
        [{ roc: 0, sma: 0, weight: 1 }],
        DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
      ),
    ).toHaveLength(DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS.length);
  });
});

describe('normalizeLineSpecialKSignal', () => {
  it('keeps a valid integer signal period', () => {
    expect(normalizeLineSpecialKSignal(2, 99)).toBe(2);
  });
  it('accepts a signal period of 1', () => {
    expect(normalizeLineSpecialKSignal(1, 99)).toBe(1);
  });
  it('floors a fractional signal period', () => {
    expect(normalizeLineSpecialKSignal(3.7, 99)).toBe(3);
  });
  it('rejects a zero signal period', () => {
    expect(normalizeLineSpecialKSignal(0, 99)).toBe(99);
  });
  it('rejects a non-finite signal period', () => {
    expect(normalizeLineSpecialKSignal(Number.NaN, 99)).toBe(99);
  });
});

describe('getLineSpecialKFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineSpecialKPoint[];
    expect(getLineSpecialKFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineSpecialKFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineSpecialKFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLineSpecialKPoint[];
    expect(getLineSpecialKFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineSpecialKRoc', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSpecialKRoc(null, 4)).toEqual([]);
  });
  it('is all null before the lookback is reachable', () => {
    expect(computeLineSpecialKRoc([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('is the percentage change over the lookback', () => {
    expect(computeLineSpecialKRoc([100, 100, 100, 100, 112, 124], 4)).toEqual(
      [null, null, null, null, 12, 24],
    );
  });
  it('divides cleanly for a percentage gain', () => {
    expect(computeLineSpecialKRoc([50, 50, 75], 2)).toEqual([
      null,
      null,
      50,
    ]);
  });
  it('yields null when the base close is zero', () => {
    expect(computeLineSpecialKRoc([0, 0, 5, 10], 2)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineSpecialKRoc(SK_CLOSES, 4)).toHaveLength(
      SK_CLOSES.length,
    );
  });
});

describe('computeLineSpecialKComponent', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSpecialKComponent(null, 4, 2)).toEqual([]);
  });
  it('is null until both windows are full', () => {
    expect(
      computeLineSpecialKComponent(SK_CLOSES, 4, 2).slice(0, 5),
    ).toEqual([null, null, null, null, null]);
  });
  it('smooths the rate of change for the fixture component', () => {
    expect(computeLineSpecialKComponent(SK_CLOSES, 4, 2)).toEqual(
      COMPONENT_A_EXPECTED,
    );
  });
  it('matches the input length', () => {
    expect(computeLineSpecialKComponent(SK_CLOSES, 4, 2)).toHaveLength(
      SK_CLOSES.length,
    );
  });
});

describe('computeLineSpecialK', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSpecialK(null, COMPONENTS)).toEqual([]);
  });
  it('sums the weighted components into an exact series', () => {
    expect(computeLineSpecialK(SK_CLOSES, COMPONENTS)).toEqual(SK_EXPECTED);
  });
  it('is null until every component has cleared its warm-up', () => {
    expect(computeLineSpecialK(SK_CLOSES, COMPONENTS).slice(0, 8)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
  it('is all null when the data is shorter than the lookbacks', () => {
    const sk = computeLineSpecialK(
      SK_CLOSES,
      DEFAULT_CHART_LINE_SPECIAL_K_COMPONENTS,
    );
    expect(sk.every((v) => v === null)).toBe(true);
  });
  it('matches the input length', () => {
    expect(computeLineSpecialK(SK_CLOSES, COMPONENTS)).toHaveLength(
      SK_CLOSES.length,
    );
  });
});

describe('computeLineSpecialKSignal', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSpecialKSignal(null, COMPONENTS, 2)).toEqual([]);
  });
  it('is the simple moving average of the Special K', () => {
    expect(computeLineSpecialKSignal(SK_CLOSES, COMPONENTS, 2)).toEqual(
      SIGNAL_EXPECTED,
    );
  });
  it('lags the Special K by the signal period', () => {
    expect(
      computeLineSpecialKSignal(SK_CLOSES, COMPONENTS, 2).slice(0, 9),
    ).toEqual([null, null, null, null, null, null, null, null, null]);
  });
  it('matches the input length', () => {
    expect(computeLineSpecialKSignal(SK_CLOSES, COMPONENTS, 2)).toHaveLength(
      SK_CLOSES.length,
    );
  });
});

describe('runLineSpecialK', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLineSpecialK([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineSpecialK(SK_DATA, OPTS).ok).toBe(true);
  });
  it('carries the resolved components and signal period', () => {
    const run = runLineSpecialK(SK_DATA, OPTS);
    expect(run.components).toEqual(COMPONENTS);
    expect(run.signalPeriod).toBe(2);
  });
  it('uses the twelve-component default table', () => {
    const run = runLineSpecialK(SK_DATA);
    expect(run.components).toHaveLength(12);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_SPECIAL_K_SIGNAL);
  });
  it('exposes the exact Special K series', () => {
    expect(runLineSpecialK(SK_DATA, OPTS).specialK).toEqual(SK_EXPECTED);
  });
  it('exposes the exact signal series', () => {
    expect(runLineSpecialK(SK_DATA, OPTS).signal).toEqual(SIGNAL_EXPECTED);
  });
  it('classifies each bar against the signal line', () => {
    const run = runLineSpecialK(SK_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });
  it('returns one sample per point', () => {
    expect(runLineSpecialK(SK_DATA, OPTS).samples).toHaveLength(
      SK_DATA.length,
    );
  });
  it('counts the bull, bear and flat bars', () => {
    const run = runLineSpecialK(SK_DATA, OPTS);
    expect(run.bullCount).toBe(2);
    expect(run.bearCount).toBe(2);
    expect(run.flatCount).toBe(1);
  });
  it('reports the final Special K and signal readings', () => {
    const run = runLineSpecialK(SK_DATA, OPTS);
    expect(run.specialKFinal).toBe(9);
    expect(run.signalFinal).toBe(48);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...SK_DATA].reverse();
    const run = runLineSpecialK(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineSpecialKLayout', () => {
  const base = {
    data: SK_DATA,
    components: COMPONENTS,
    signalPeriod: 2,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLineSpecialKLayout({ ...base, data: [{ x: 0, value: 1 }] }).ok,
    ).toBe(false);
  });
  it('is ok for a usable series', () => {
    expect(computeLineSpecialKLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the Special K panel', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.specialKPanel.y);
  });
  it('builds the price, Special K and signal paths', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.specialKPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the Special K y-domain', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.specialKYMin).toBeLessThanOrEqual(0);
    expect(layout.specialKYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per classified bar', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.markers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(SK_CLOSES.length);
  });
  it('reports the component count and total points', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.componentCount).toBe(3);
    expect(layout.totalPoints).toBe(SK_CLOSES.length);
  });
  it('carries the final readings', () => {
    const layout = computeLineSpecialKLayout(base);
    expect(layout.specialKFinal).toBe(9);
    expect(layout.signalFinal).toBe(48);
  });
});

describe('describeLineSpecialKChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineSpecialKChart([])).toBe('No data');
  });
  it('names the Special K', () => {
    expect(describeLineSpecialKChart(SK_DATA, OPTS)).toContain('Special K');
  });
  it('explains the weighted rate-of-change sum across lookbacks', () => {
    const desc = describeLineSpecialKChart(SK_DATA, OPTS);
    expect(desc).toContain('weighted');
    expect(desc).toContain('rate-of-change');
    expect(desc).toContain('lookback');
  });
  it('reports the zone counts', () => {
    expect(describeLineSpecialKChart(SK_DATA, OPTS)).toContain(
      'bullish on 2 bars',
    );
  });
});

describe('ChartLineSpecialK', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} ariaLabel="SK demo" />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('SK demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineSpecialK data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-special-k"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-special-k"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the component count and signal period', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-special-k"]',
    );
    expect(root?.getAttribute('data-component-count')).toBe('3');
    expect(root?.getAttribute('data-signal-period')).toBe('2');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-special-k-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the Special K and signal lines', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-special-k-special-k-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-special-k-signal-line"]',
      ),
    ).toBeTruthy();
  });
  it('renders one marker per classified bar', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-special-k-marker"]',
    );
    expect(markers).toHaveLength(5);
  });
  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-special-k-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the component count in the config badge', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-special-k-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3c');
  });
  it('toggles the signal off when its legend item is clicked', () => {
    const { container } = render(
      <ChartLineSpecialK data={SK_DATA} {...OPTS} />,
    );
    const signalItem = container.querySelector(
      '[data-section="chart-line-special-k-legend-item"][data-series-id="signal"]',
    ) as HTMLElement;
    fireEvent.click(signalItem);
    expect(
      container.querySelector(
        '[data-section="chart-line-special-k-signal-line"]',
      ),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineSpecialK
        data={SK_DATA}
        {...OPTS}
        hiddenSeries={new Set(['special-k'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-special-k-special-k-line"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSpecialK ref={ref} data={SK_DATA} {...OPTS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
