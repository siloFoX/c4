import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineStochastic,
  DEFAULT_CHART_LINE_STOCHASTIC_HEIGHT,
  DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT_COLOR,
  DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD_COLOR,
  DEFAULT_CHART_LINE_STOCHASTIC_PADDING,
  DEFAULT_CHART_LINE_STOCHASTIC_WIDTH,
  computeLineStochasticD,
  computeLineStochasticK,
  computeLineStochasticLayout,
  describeLineStochasticChart,
  getLineStochasticFinitePoints,
  normalizeLineStochasticPeriod,
  runLineStochastic,
  type ChartLineStochasticPoint,
} from './chart-line-stochastic';

afterEach(() => {
  cleanup();
});

// %K visits 100 / 0 / 0 / 100 -> both overbought and oversold readings
const STOCH_DATA: ChartLineStochasticPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 5 },
  { x: 4, value: 2 },
  { x: 5, value: 25 },
];
const SMALL = { period: 3, dPeriod: 2 };

describe('chart-line-stochastic defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_STOCHASTIC_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STOCHASTIC_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_STOCHASTIC_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineStochasticFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineStochasticFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineStochasticFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineStochasticPeriod', () => {
  it('keeps a positive integer', () => {
    expect(normalizeLineStochasticPeriod(14, 14)).toBe(14);
  });
  it('a sub-1 period falls back', () => {
    expect(normalizeLineStochasticPeriod(0, 14)).toBe(14);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineStochasticPeriod(3.7, 14)).toBe(3);
  });
  it('a non-finite period falls back', () => {
    expect(normalizeLineStochasticPeriod(NaN, 14)).toBe(14);
  });
});

describe('computeLineStochasticK', () => {
  it('is null until the window is full', () => {
    expect(computeLineStochasticK([10, 20], 3)).toEqual([null, null]);
  });
  it('empty input -> []', () => {
    expect(computeLineStochasticK([], 3)).toEqual([]);
  });
  it('measures the value position in the trailing range', () => {
    expect(computeLineStochasticK([10, 20, 30, 5, 2, 25], 3)).toEqual([
      null,
      null,
      100,
      0,
      0,
      100,
    ]);
  });
  it('a flat window reads 50', () => {
    expect(computeLineStochasticK([5, 5, 5, 5], 3)).toEqual([
      null,
      null,
      50,
      50,
    ]);
  });
  it('the middle of the range reads 50', () => {
    // window [10,30,20]: value 20 is the midpoint of 10..30
    expect(computeLineStochasticK([10, 30, 20], 3)[2]).toBe(50);
  });
});

describe('computeLineStochasticD', () => {
  it('is the SMA of %K over the d-period', () => {
    expect(
      computeLineStochasticD([null, null, 100, 0, 0, 100], 2),
    ).toEqual([null, null, null, 50, 0, 50]);
  });
  it('a d-period of 1 echoes %K', () => {
    expect(computeLineStochasticD([null, 50, 100], 1)).toEqual([
      null,
      50,
      100,
    ]);
  });
  it('is null where the %K window has a gap', () => {
    expect(computeLineStochasticD([null, null, 80], 2)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('empty input -> []', () => {
    expect(computeLineStochasticD([], 2)).toEqual([]);
  });
});

describe('runLineStochastic', () => {
  it('empty -> ok=false', () => {
    expect(runLineStochastic([]).ok).toBe(false);
  });
  it('a single point -> ok=false', () => {
    expect(runLineStochastic([{ x: 0, value: 1 }]).ok).toBe(false);
  });
  it('resolves the default periods and thresholds', () => {
    const r = runLineStochastic(STOCH_DATA);
    expect(r.period).toBe(14);
    expect(r.dPeriod).toBe(3);
    expect(r.overbought).toBe(80);
    expect(r.oversold).toBe(20);
  });
  it('computes the %K and %D series', () => {
    const r = runLineStochastic(STOCH_DATA, SMALL);
    expect(r.k).toEqual([null, null, 100, 0, 0, 100]);
    expect(r.d).toEqual([null, null, null, 50, 0, 50]);
  });
  it('classifies each sample into a zone from %K', () => {
    const r = runLineStochastic(STOCH_DATA, SMALL);
    expect(r.samples.map((s) => s.zone)).toEqual([
      null,
      null,
      'overbought',
      'oversold',
      'oversold',
      'overbought',
    ]);
  });
  it('counts the overbought and oversold readings', () => {
    const r = runLineStochastic(STOCH_DATA, SMALL);
    expect(r.overboughtCount).toBe(2);
    expect(r.oversoldCount).toBe(2);
  });
  it('honours custom thresholds', () => {
    const r = runLineStochastic(STOCH_DATA, {
      ...SMALL,
      overbought: 90,
      oversold: 10,
    });
    expect(r.overbought).toBe(90);
    expect(r.oversold).toBe(10);
  });
  it('sorts the series by x', () => {
    const r = runLineStochastic(
      [
        { x: 2, value: 4 },
        { x: 0, value: 0 },
        { x: 1, value: 8 },
      ],
      SMALL,
    );
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
});

describe('computeLineStochasticLayout', () => {
  const base = { width: 500, height: 320, padding: 30, ...SMALL };

  it('empty data -> ok=false', () => {
    expect(computeLineStochasticLayout({ data: [], ...base }).ok).toBe(
      false,
    );
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineStochasticLayout({
        data: STOCH_DATA,
        width: 20,
        height: 20,
        padding: 30,
        ...SMALL,
      }).ok,
    ).toBe(false);
  });

  it('stacks a price panel above a stochastic panel', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    expect(layout.ok).toBe(true);
    expect(layout.pricePanel.height).toBeGreaterThan(0);
    expect(layout.stochPanel.height).toBeGreaterThan(0);
    expect(layout.stochPanel.y).toBeGreaterThan(layout.pricePanel.y);
  });

  it('builds the price, %K and %D paths', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    expect(layout.pricePath).toContain('M ');
    expect(layout.kPath).toContain('M ');
    expect(layout.dPath).toContain('M ');
  });

  it('projects a %K marker per defined reading', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    // %K is defined from index 2 onward -> 4 markers
    expect(layout.kMarkers.length).toBe(4);
  });

  it('the stochastic y axis spans 0 to 100', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    expect(layout.stochYTicks[0]!.value).toBe(0);
    expect(
      layout.stochYTicks[layout.stochYTicks.length - 1]!.value,
    ).toBe(100);
  });

  it('builds the overbought and oversold zone rects', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    expect(layout.overboughtRect.height).toBeGreaterThan(0);
    expect(layout.oversoldRect.height).toBeGreaterThan(0);
  });

  it('exposes the zone counts and periods', () => {
    const layout = computeLineStochasticLayout({
      data: STOCH_DATA,
      ...base,
    });
    expect(layout.overboughtCount).toBe(2);
    expect(layout.oversoldCount).toBe(2);
    expect(layout.period).toBe(3);
    expect(layout.totalPoints).toBe(6);
  });
});

describe('describeLineStochasticChart', () => {
  it('no data -> No data', () => {
    expect(describeLineStochasticChart([])).toBe('No data');
    expect(describeLineStochasticChart(null)).toBe('No data');
  });
  it('summary mentions stochastic + percent-K + percent-D', () => {
    const s = describeLineStochasticChart(STOCH_DATA, SMALL);
    expect(s).toContain('stochastic');
    expect(s).toContain('percent-K');
    expect(s).toContain('percent-D');
  });
});

describe('<ChartLineStochastic> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineStochastic data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the price line path', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the %K and %D lines, hidden via props', () => {
    const { rerender } = render(
      <ChartLineStochastic data={STOCH_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-k-line"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-d-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        showK={false}
        showD={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-k-line"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-d-line"]',
      ),
    ).toBeNull();
  });

  it('renders a %K marker per defined reading', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-stochastic-k-marker"]',
      ).length,
    ).toBe(4);
  });

  it('colours %K markers by zone', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-stochastic-k-marker"][data-zone="overbought"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_STOCHASTIC_OVERBOUGHT_COLOR);
    expect(
      document
        .querySelector(
          '[data-section="chart-line-stochastic-k-marker"][data-zone="oversold"]',
        )!
        .getAttribute('fill'),
    ).toBe(DEFAULT_CHART_LINE_STOCHASTIC_OVERSOLD_COLOR);
  });

  it('renders the overbought and oversold zones, hidden via prop', () => {
    const { rerender } = render(
      <ChartLineStochastic data={STOCH_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-overbought-zone"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-oversold-zone"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        showZones={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-overbought-zone"]',
      ),
    ).toBeNull();
  });

  it('renders the threshold lines', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-threshold-line"][data-kind="overbought"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-threshold-line"][data-kind="oversold"]',
      ),
    ).not.toBeNull();
  });

  it('renders a label for each panel', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-panel-label"][data-panel="price"]',
      )?.textContent,
    ).toBe('Price');
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-panel-label"][data-panel="stoch"]',
      )?.textContent,
    ).toBe('Stochastic');
  });

  it('price dots are off by default and shown via prop', () => {
    const { rerender } = render(
      <ChartLineStochastic data={STOCH_DATA} {...SMALL} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-stochastic-dot"]'),
    ).toBeNull();
    rerender(<ChartLineStochastic data={STOCH_DATA} {...SMALL} showDots />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-stochastic-dot"]',
      ).length,
    ).toBe(6);
  });

  it('config badge shows the periods and thresholds', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-badge-period"]',
      )?.textContent,
    ).toBe('k=3 d=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-badge-zones"]',
      )?.textContent,
    ).toBe('ob=80 os=20');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-badge"]',
      ),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-aria-desc"]',
      )!.textContent,
    ).toContain('stochastic');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    const root = document.querySelector(
      '[data-section="chart-line-stochastic"]',
    );
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-d-period')).toBe('2');
    expect(root!.getAttribute('data-overbought-count')).toBe('2');
    expect(root!.getAttribute('data-oversold-count')).toBe('2');
    expect(root!.getAttribute('data-total-points')).toBe('6');
  });

  it('%K marker exposes the k and zone attributes', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-stochastic-k-marker"]',
    );
    expect(markers[0]!.getAttribute('data-zone')).toBe('overbought');
    expect(Number(markers[0]!.getAttribute('data-k'))).toBe(100);
  });

  it('tooltip on a %K marker shows price + K + D + zone', () => {
    render(<ChartLineStochastic data={STOCH_DATA} {...SMALL} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-stochastic-k-marker"]',
    );
    // marker index 1 is the period at index 3 (K 0, D 50, oversold)
    fireEvent.mouseEnter(markers[1]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-tooltip-k"]',
      )?.textContent,
    ).toBe('K: 0');
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-tooltip-d"]',
      )?.textContent,
    ).toBe('D: 50');
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-tooltip-zone"]',
      )?.textContent,
    ).toBe('oversold');
    fireEvent.mouseLeave(markers[1]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        showTooltip={false}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-stochastic-k-marker"]',
    );
    fireEvent.mouseEnter(marker!);
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires from a %K marker', () => {
    let captured: number | null = null;
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        onPointClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const markers = document.querySelectorAll(
      '[data-section="chart-line-stochastic-k-marker"]',
    );
    fireEvent.click(markers[0]!);
    expect(captured).toBe(2);
  });

  it('legend has four toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-stochastic-legend-item"]',
    );
    expect(items.length).toBe(4);
    fireEvent.click(items[2]!); // %D
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('d')).toBe(true);
  });

  it('the legend toggle hides the %K line', () => {
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        hiddenSeries={['k']}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-k-line"]',
      ),
    ).toBeNull();
  });

  it('omits the legend when showLegend=false', () => {
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-stochastic-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineStochastic data={STOCH_DATA} {...SMALL} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-stochastic"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(
      <ChartLineStochastic data={STOCH_DATA} {...SMALL} animate={false} />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochastic ref={ref} data={STOCH_DATA} {...SMALL} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-stochastic',
    );
  });

  it('has displayName', () => {
    expect(ChartLineStochastic.displayName).toBe('ChartLineStochastic');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineStochastic
        data={STOCH_DATA}
        {...SMALL}
        ariaLabel="Stoch view"
      />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic"]')!
        .getAttribute('aria-label'),
    ).toBe('Stoch view');
    expect(
      document
        .querySelector('[data-section="chart-line-stochastic-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Stoch view');
  });
});
