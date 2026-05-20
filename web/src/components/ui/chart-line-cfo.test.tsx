import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCfo,
  getLineCfoFinitePoints,
  normalizeLineCfoPeriod,
  computeLineCfoForecast,
  computeLineCfo,
  runLineCfo,
  computeLineCfoLayout,
  describeLineCfoChart,
  DEFAULT_CHART_LINE_CFO_PERIOD,
  type ChartLineCfoPoint,
} from './chart-line-cfo';

afterEach(() => cleanup());

// A perfectly linear price: the regression fits exactly, so the
// forecast equals the price and the CFO is exactly zero.
const CFO_LINEAR_CLOSES = [10, 20, 30, 40, 50, 60];

// All closes are powers of two, so each CFO ratio is dyadic; the
// hand-computed values are matched with toBeCloseTo.
const CFO_CLOSES = [
  64, 64, 64, 64, 128, 64, 128, 128, 64, 128, 64, 128, 64,
];
const CFO_DATA: ChartLineCfoPoint[] = CFO_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 4, threshold: 12 };

const CFO_EXPECTED = [
  null,
  null,
  null,
  0,
  15,
  -40,
  10,
  5,
  -50,
  20,
  -20,
  10,
  -20,
];
const ZONE_EXPECTED = [
  'none',
  'none',
  'none',
  'neutral',
  'above',
  'below',
  'neutral',
  'neutral',
  'below',
  'above',
  'below',
  'neutral',
  'below',
];

describe('getLineCfoFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineCfoPoint[];
    expect(getLineCfoFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineCfoFinitePoints(null)).toEqual([]);
    expect(getLineCfoFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineCfoPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineCfoPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for a sub-2, NaN or negative period', () => {
    expect(normalizeLineCfoPeriod(1, 14)).toBe(14);
    expect(normalizeLineCfoPeriod(-3, 14)).toBe(14);
    expect(normalizeLineCfoPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('computeLineCfoForecast', () => {
  it('forecasts the linear regression endpoint', () => {
    expect(computeLineCfoForecast(CFO_LINEAR_CLOSES, 4)).toEqual([
      null,
      null,
      null,
      40,
      50,
      60,
    ]);
  });

  it('equals the price for a perfectly linear series', () => {
    const forecast = computeLineCfoForecast(CFO_LINEAR_CLOSES, 4);
    for (let i = 3; i < CFO_LINEAR_CLOSES.length; i += 1) {
      expect(forecast[i]).toBe(CFO_LINEAR_CLOSES[i]);
    }
  });

  it('is null through the warm-up', () => {
    expect(computeLineCfoForecast(CFO_LINEAR_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('matches the hand-computed value for a non-linear window', () => {
    expect(computeLineCfoForecast(CFO_CLOSES, 4)[4]!).toBeCloseTo(108.8, 6);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineCfoForecast(null, 4)).toEqual([]);
  });
});

describe('computeLineCfo', () => {
  it('computes zero for a perfectly linear series', () => {
    expect(computeLineCfo(CFO_LINEAR_CLOSES, 4)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('is null through the warm-up', () => {
    expect(computeLineCfo(CFO_CLOSES, 4).slice(0, 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('matches the hand-computed percent gaps', () => {
    const cfo = computeLineCfo(CFO_CLOSES, 4);
    expect(cfo[3]).toBe(0);
    for (let i = 4; i < CFO_EXPECTED.length; i += 1) {
      expect(cfo[i]!).toBeCloseTo(CFO_EXPECTED[i] as number, 6);
    }
  });

  it('is positive when the price is above the forecast', () => {
    const forecast = computeLineCfoForecast(CFO_CLOSES, 4);
    const cfo = computeLineCfo(CFO_CLOSES, 4);
    expect(CFO_CLOSES[4]! > forecast[4]!).toBe(true);
    expect(cfo[4]! > 0).toBe(true);
  });

  it('is the percent gap between price and forecast', () => {
    const forecast = computeLineCfoForecast(CFO_CLOSES, 4);
    const cfo = computeLineCfo(CFO_CLOSES, 4);
    expect(cfo[5]).toBe(
      (100 * (CFO_CLOSES[5]! - forecast[5]!)) / CFO_CLOSES[5]!,
    );
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineCfo(null, 4)).toEqual([]);
  });
});

describe('runLineCfo', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineCfo(CFO_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and threshold', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(12);
  });

  it('exposes the forecast series', () => {
    expect(runLineCfo(CFO_DATA, OPTS).forecast).toHaveLength(CFO_DATA.length);
  });

  it('exposes the cfo series', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    expect(run.cfo).toHaveLength(CFO_DATA.length);
    expect(run.cfo[3]).toBe(0);
    expect(run.cfo[4]!).toBeCloseTo(15, 6);
  });

  it('emits one sample per point', () => {
    expect(runLineCfo(CFO_DATA, OPTS).samples).toHaveLength(CFO_DATA.length);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the above, below and neutral bars', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(4);
    expect(run.neutralCount).toBe(4);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    expect(run.aboveCount).toBe(
      run.samples.filter((s) => s.zone === 'above').length,
    );
    expect(run.belowCount).toBe(
      run.samples.filter((s) => s.zone === 'below').length,
    );
  });

  it('reports the final cfo reading', () => {
    expect(runLineCfo(CFO_DATA, OPTS).cfoFinal).toBeCloseTo(-20, 6);
  });

  it('carries the forecast, cfo and zone fields on each sample', () => {
    const run = runLineCfo(CFO_DATA, OPTS);
    const s = run.samples[4]!;
    expect(s.forecast!).toBeCloseTo(108.8, 6);
    expect(s.cfo!).toBeCloseTo(15, 6);
    expect(s.zone).toBe('above');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineCfo([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineCfo([], OPTS).ok).toBe(false);
    expect(runLineCfo(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      CFO_DATA[8]!,
      CFO_DATA[0]!,
      CFO_DATA[12]!,
      CFO_DATA[4]!,
    ];
    const run = runLineCfo(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 4, 8, 12]);
  });

  it('defaults to the period 14 configuration', () => {
    expect(runLineCfo(CFO_DATA).period).toBe(DEFAULT_CHART_LINE_CFO_PERIOD);
  });
});

describe('computeLineCfoLayout', () => {
  const layoutOptions = {
    data: CFO_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineCfoLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the cfo panel', () => {
    const layout = computeLineCfoLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.cfoPanel.y);
    expect(layout.cfoPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineCfoLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty forecast path', () => {
    expect(
      computeLineCfoLayout(layoutOptions).forecastPath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty cfo path', () => {
    expect(computeLineCfoLayout(layoutOptions).cfoPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLineCfoLayout(layoutOptions).priceDots).toHaveLength(
      CFO_DATA.length,
    );
  });

  it('emits one cfo marker per defined sample', () => {
    expect(computeLineCfoLayout(layoutOptions).cfoMarkers).toHaveLength(10);
  });

  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLineCfoLayout(layoutOptions);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('carries the run statistics', () => {
    const layout = computeLineCfoLayout(layoutOptions);
    expect(layout.aboveCount).toBe(2);
    expect(layout.belowCount).toBe(4);
    expect(layout.totalPoints).toBe(13);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineCfoLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineCfoLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineCfoChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineCfoChart(CFO_DATA, OPTS);
    expect(text).toContain('Chande Forecast Oscillator');
    expect(text).toContain('percent gap');
    expect(text).toContain('linear regression');
    expect(text).toContain('forecast');
  });

  it('reports the zone counts', () => {
    const text = describeLineCfoChart(CFO_DATA, OPTS);
    expect(text).toContain('above-trend on 2');
    expect(text).toContain('below-trend on 4');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineCfoChart([])).toBe('No data');
  });
});

describe('<ChartLineCfo />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-cfo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chande Forecast Oscillator');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-cfo"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-above-count')).toBe('2');
    expect(root?.getAttribute('data-below-count')).toBe('4');
    expect(root?.getAttribute('data-neutral-count')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe('13');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-cfo-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-cfo-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-cfo-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('CFO');
  });

  it('renders the forecast line', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-cfo-forecast-path"]'),
    ).not.toBeNull();
  });

  it('renders the cfo line', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-cfo-cfo-line"]'),
    ).not.toBeNull();
  });

  it('renders one cfo marker per defined sample', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cfo-marker"]'),
    ).toHaveLength(10);
  });

  it('renders the upper, zero and lower level lines', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cfo-level-line"]'),
    ).toHaveLength(3);
  });

  it('exposes the zone on each cfo marker', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-cfo-marker"][data-point-index="4"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('above');
  });

  it('renders the four-item legend', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-cfo-legend-item"]'),
    ).toHaveLength(4);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineCfo data={CFO_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-cfo-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-price-path"]'),
    ).toBeNull();
  });

  it('hides the forecast line when showForecast is false', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} showForecast={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-forecast-path"]'),
    ).toBeNull();
  });

  it('hides the cfo line and markers when showCfo is false', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} showCfo={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-cfo-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-cfo-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the cfo via the hidden set', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} hiddenSeries={['cfo']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-cfo-line"]'),
    ).toBeNull();
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineCfo
        data={CFO_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-cfo-legend-item"][data-series-id="forecast"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'forecast', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-cfo-dot"]'),
    ).toHaveLength(CFO_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineCfo data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-cfo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cfo-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCfo ref={ref} data={CFO_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-cfo');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineCfo.displayName).toBe('ChartLineCfo');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineCfo data={CFO_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-cfo"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
