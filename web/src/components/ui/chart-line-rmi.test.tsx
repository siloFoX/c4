import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRmi,
  getLineRmiFinitePoints,
  normalizeLineRmiPeriod,
  computeLineRmiChange,
  computeLineRmi,
  runLineRmi,
  computeLineRmiLayout,
  describeLineRmiChart,
  DEFAULT_CHART_LINE_RMI_PERIOD,
  DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD,
  type ChartLineRmiPoint,
} from './chart-line-rmi';

afterEach(() => cleanup());

const RMI_CLOSES = [
  40, 44, 48, 52, 56, 60, 48, 52, 40, 44, 48, 52, 40, 60,
];
const RMI_DATA: ChartLineRmiPoint[] = RMI_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = {
  period: 4,
  momentumPeriod: 2,
  overbought: 70,
  oversold: 30,
};

// Every 2-bar momentum change is +/- 8, so each 4-bar RMI window
// has gain+loss total 32 and RMI = 100 * gainSum / 32 lands on the
// exact dyadics {0, 25, 50, 75, 100}.
const CHANGE_EXPECTED = [
  null,
  null,
  8,
  8,
  8,
  8,
  -8,
  -8,
  -8,
  -8,
  8,
  8,
  -8,
  8,
];
const RMI_EXPECTED = [
  null,
  null,
  null,
  null,
  null,
  100,
  75,
  50,
  25,
  0,
  25,
  50,
  50,
  75,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'none',
  'none',
  'overbought',
  'overbought',
  'neutral',
  'oversold',
  'oversold',
  'oversold',
  'neutral',
  'neutral',
  'overbought',
];

describe('getLineRmiFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineRmiPoint[];
    expect(getLineRmiFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineRmiFinitePoints(null)).toEqual([]);
    expect(getLineRmiFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineRmiPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineRmiPeriod(20.7, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineRmiPeriod(0, 20)).toBe(20);
    expect(normalizeLineRmiPeriod(-5, 20)).toBe(20);
    expect(normalizeLineRmiPeriod(Number.NaN, 20)).toBe(20);
  });
});

describe('computeLineRmiChange', () => {
  it('computes the change against the close M bars ago', () => {
    expect(computeLineRmiChange(RMI_CLOSES, 2)).toEqual(CHANGE_EXPECTED);
  });

  it('is null through the momentum warm-up', () => {
    const change = computeLineRmiChange(RMI_CLOSES, 2);
    expect(change[0]).toBeNull();
    expect(change[1]).toBeNull();
  });

  it('uses the lookback distance', () => {
    expect(computeLineRmiChange([10, 20, 30, 40], 1)).toEqual([
      null,
      10,
      10,
      10,
    ]);
    expect(computeLineRmiChange([10, 20, 30, 40], 2)).toEqual([
      null,
      null,
      20,
      20,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineRmiChange(null, 2)).toEqual([]);
  });
});

describe('computeLineRmi', () => {
  it('computes the RMI across the momentum lookback', () => {
    expect(computeLineRmi(RMI_CLOSES, 4, 2)).toEqual(RMI_EXPECTED);
  });

  it('is null through the warm-up', () => {
    expect(computeLineRmi(RMI_CLOSES, 4, 2).slice(0, 5)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads 100 when every momentum change rises', () => {
    expect(computeLineRmi([2, 4, 6, 8, 10, 12], 2, 2)).toEqual([
      null,
      null,
      null,
      100,
      100,
      100,
    ]);
  });

  it('reads 0 when every momentum change falls', () => {
    expect(computeLineRmi([12, 10, 8, 6, 4, 2], 2, 2)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('reads 50 for a flat series', () => {
    expect(computeLineRmi([5, 5, 5, 5, 5, 5], 2, 2)).toEqual([
      null,
      null,
      null,
      50,
      50,
      50,
    ]);
  });

  it('changes with the momentum lookback', () => {
    expect(computeLineRmi(RMI_CLOSES, 4, 1)).not.toEqual(
      computeLineRmi(RMI_CLOSES, 4, 2),
    );
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineRmi(null, 4, 2)).toEqual([]);
  });
});

describe('runLineRmi', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineRmi(RMI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and momentum period', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.momentumPeriod).toBe(2);
  });

  it('carries the overbought and oversold levels', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    expect(run.overbought).toBe(70);
    expect(run.oversold).toBe(30);
  });

  it('exposes the rmi series', () => {
    expect(runLineRmi(RMI_DATA, OPTS).rmi).toEqual(RMI_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineRmi(RMI_DATA, OPTS).samples).toHaveLength(RMI_DATA.length);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the overbought, oversold and neutral bars', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    expect(run.overboughtCount).toBe(3);
    expect(run.oversoldCount).toBe(3);
    expect(run.neutralCount).toBe(3);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    expect(run.overboughtCount).toBe(
      run.samples.filter((s) => s.zone === 'overbought').length,
    );
    expect(run.oversoldCount).toBe(
      run.samples.filter((s) => s.zone === 'oversold').length,
    );
  });

  it('reports the final rmi reading', () => {
    expect(runLineRmi(RMI_DATA, OPTS).rmiFinal).toBe(75);
  });

  it('carries the rmi and zone fields on each sample', () => {
    const run = runLineRmi(RMI_DATA, OPTS);
    const s = run.samples[5]!;
    expect(s.rmi).toBe(100);
    expect(s.zone).toBe('overbought');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineRmi([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineRmi([], OPTS).ok).toBe(false);
    expect(runLineRmi(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      RMI_DATA[9]!,
      RMI_DATA[0]!,
      RMI_DATA[13]!,
      RMI_DATA[4]!,
    ];
    const run = runLineRmi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 4, 9, 13]);
  });

  it('defaults to the 20/5 configuration', () => {
    const run = runLineRmi(RMI_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_RMI_PERIOD);
    expect(run.momentumPeriod).toBe(DEFAULT_CHART_LINE_RMI_MOMENTUM_PERIOD);
  });
});

describe('computeLineRmiLayout', () => {
  const layoutOptions = {
    data: RMI_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineRmiLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the rmi panel', () => {
    const layout = computeLineRmiLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.rmiPanel.y);
    expect(layout.rmiPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineRmiLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty rmi path', () => {
    expect(computeLineRmiLayout(layoutOptions).rmiPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLineRmiLayout(layoutOptions).priceDots).toHaveLength(
      RMI_DATA.length,
    );
  });

  it('emits one rmi marker per defined sample', () => {
    expect(computeLineRmiLayout(layoutOptions).rmiMarkers).toHaveLength(9);
  });

  it('places the overbought and oversold lines inside the rmi panel', () => {
    const layout = computeLineRmiLayout(layoutOptions);
    for (const y of [layout.overboughtY, layout.oversoldY]) {
      expect(y).toBeGreaterThanOrEqual(layout.rmiPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.rmiPanel.y + layout.rmiPanel.height,
      );
    }
  });

  it('orders the overbought line above the oversold line', () => {
    const layout = computeLineRmiLayout(layoutOptions);
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('carries the run statistics', () => {
    const layout = computeLineRmiLayout(layoutOptions);
    expect(layout.rmiFinal).toBe(75);
    expect(layout.overboughtCount).toBe(3);
    expect(layout.oversoldCount).toBe(3);
    expect(layout.neutralCount).toBe(3);
    expect(layout.totalPoints).toBe(14);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineRmiLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineRmiLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineRmiChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineRmiChart(RMI_DATA, OPTS);
    expect(text).toContain('Relative Momentum Index');
    expect(text).toContain('RSI formula');
    expect(text).toContain('momentum');
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the zone counts', () => {
    const text = describeLineRmiChart(RMI_DATA, OPTS);
    expect(text).toContain('overbought on 3');
    expect(text).toContain('oversold on 3');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineRmiChart([])).toBe('No data');
  });
});

describe('<ChartLineRmi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-rmi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Relative Momentum Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-rmi"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-momentum-period')).toBe('2');
    expect(root?.getAttribute('data-overbought-count')).toBe('3');
    expect(root?.getAttribute('data-oversold-count')).toBe('3');
    expect(root?.getAttribute('data-neutral-count')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('14');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rmi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rmi-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-rmi-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('RMI');
  });

  it('renders the rmi line', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rmi-rmi-line"]'),
    ).not.toBeNull();
  });

  it('renders one rmi marker per defined sample', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-rmi-marker"]'),
    ).toHaveLength(9);
  });

  it('renders the overbought and oversold level lines', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-level-line"][data-level="overbought"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-rmi-level-line"][data-level="oversold"]',
      ),
    ).not.toBeNull();
  });

  it('exposes the zone on each rmi marker', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-rmi-marker"][data-point-index="5"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('overbought');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-rmi-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period and momentum', () => {
    const { container } = render(<ChartLineRmi data={RMI_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rmi-badge-config"]',
    );
    expect(badge?.textContent).toBe('4/2');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-price-path"]'),
    ).toBeNull();
  });

  it('hides the rmi line and markers when showRmi is false', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} showRmi={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-rmi-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-rmi-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-level-line"]'),
    ).toBeNull();
  });

  it('hides the rmi line via the hidden set', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} hiddenSeries={['rmi']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-rmi-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} hiddenSeries={['levels']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineRmi
        data={RMI_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-rmi-legend-item"][data-series-id="rmi"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'rmi', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-rmi-dot"]'),
    ).toHaveLength(RMI_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineRmi data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-rmi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRmi ref={ref} data={RMI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-rmi');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineRmi.displayName).toBe('ChartLineRmi');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineRmi data={RMI_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-rmi"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
