import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineLagPlot,
  DEFAULT_CHART_LINE_LAG_PLOT_HEIGHT,
  DEFAULT_CHART_LINE_LAG_PLOT_PADDING,
  DEFAULT_CHART_LINE_LAG_PLOT_WIDTH,
  computeLineLagPlotLayout,
  describeLineLagPlotChart,
  getLineLagPlotFinitePoints,
  normalizeLineLagPlotLag,
  runLineLagPlot,
  type ChartLineLagPlotPoint,
} from './chart-line-lag-plot';

afterEach(() => {
  cleanup();
});

// perfectly linear: lag-k pairs are exactly correlated (r = 1)
const LAG_DATA: ChartLineLagPlotPoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 2 },
  { x: 2, value: 4 },
  { x: 3, value: 6 },
  { x: 4, value: 8 },
  { x: 5, value: 10 },
];
// strictly alternating: lag-1 pairs are anti-correlated (r = -1)
const ALT_DATA: ChartLineLagPlotPoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 10 },
  { x: 2, value: 0 },
  { x: 3, value: 10 },
  { x: 4, value: 0 },
  { x: 5, value: 10 },
];

describe('chart-line-lag-plot defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_LAG_PLOT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_LAG_PLOT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_LAG_PLOT_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineLagPlotFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineLagPlotFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineLagPlotFinitePoints(null)).toEqual([]);
  });
});

describe('normalizeLineLagPlotLag', () => {
  it('keeps a positive integer lag', () => {
    expect(normalizeLineLagPlotLag(1)).toBe(1);
    expect(normalizeLineLagPlotLag(3)).toBe(3);
  });
  it('clamps a sub-1 lag up to 1', () => {
    expect(normalizeLineLagPlotLag(0)).toBe(1);
    expect(normalizeLineLagPlotLag(-2)).toBe(1);
  });
  it('floors a fractional lag', () => {
    expect(normalizeLineLagPlotLag(2.7)).toBe(2);
  });
  it('non-finite lag falls back to 1', () => {
    expect(normalizeLineLagPlotLag(NaN)).toBe(1);
  });
});

describe('runLineLagPlot', () => {
  it('empty -> ok=false', () => {
    expect(runLineLagPlot([]).ok).toBe(false);
  });
  it('pairs each value with the value k steps earlier', () => {
    const r = runLineLagPlot(LAG_DATA, 1);
    expect(r.pairCount).toBe(5);
    expect(r.pairs[0]!.t).toBe(1);
    expect(r.pairs[0]!.laggedValue).toBe(0);
    expect(r.pairs[0]!.currentValue).toBe(2);
  });
  it('a perfectly linear series has lag-1 correlation 1', () => {
    expect(runLineLagPlot(LAG_DATA, 1).correlation).toBeCloseTo(1, 10);
  });
  it('a strictly alternating series has lag-1 correlation -1', () => {
    expect(runLineLagPlot(ALT_DATA, 1).correlation).toBeCloseTo(-1, 10);
  });
  it('lag 2 produces n - 2 pairs', () => {
    const r = runLineLagPlot(LAG_DATA, 2);
    expect(r.pairCount).toBe(4);
    expect(r.pairs[0]!.laggedValue).toBe(0);
    expect(r.pairs[0]!.currentValue).toBe(4);
  });
  it('reports the value range', () => {
    const r = runLineLagPlot(LAG_DATA, 1);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(10);
  });
  it('a lag at or above the series length -> ok=false', () => {
    const r = runLineLagPlot(
      [
        { x: 0, value: 1 },
        { x: 1, value: 2 },
      ],
      5,
    );
    expect(r.pairCount).toBe(0);
    expect(r.ok).toBe(false);
  });
  it('defaults to lag 1', () => {
    expect(runLineLagPlot(LAG_DATA).lag).toBe(1);
  });
  it('sorts the series by x before pairing', () => {
    const r = runLineLagPlot(
      [
        { x: 2, value: 4 },
        { x: 0, value: 0 },
        { x: 1, value: 2 },
      ],
      1,
    );
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
    expect(r.pairs[0]!.laggedValue).toBe(0);
  });
  it('flags pairs above the identity diagonal', () => {
    const r = runLineLagPlot(LAG_DATA, 1);
    // every pair rises (current > lagged)
    expect(r.pairs.every((p) => p.aboveDiagonal)).toBe(true);
  });
});

describe('computeLineLagPlotLayout', () => {
  const base = { width: 600, height: 240, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineLagPlotLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineLagPlotLayout({
        data: LAG_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('splits the canvas into a series panel and a scatter panel', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.seriesPanel.width).toBeGreaterThan(0);
    expect(layout.scatterPanel.width).toBeGreaterThan(0);
    expect(layout.scatterPanel.x).toBeGreaterThan(layout.seriesPanel.x);
  });

  it('builds the series line path', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.linePath).toContain('M ');
    expect(layout.linePath).toContain(' L ');
  });

  it('projects series dots and scatter dots', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.seriesDots.length).toBe(6);
    expect(layout.scatterDots.length).toBe(5);
  });

  it('builds the y = x identity line path', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.identityPath).toContain('M ');
    expect(layout.identityPath).toContain(' L ');
  });

  it('the scatter panel shares one value domain for both axes', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.scatterMin).toBe(0);
    expect(layout.scatterMax).toBe(10);
  });

  it('exposes the lag, pair count and correlation', () => {
    const layout = computeLineLagPlotLayout({ data: LAG_DATA, ...base });
    expect(layout.lag).toBe(1);
    expect(layout.pairCount).toBe(5);
    expect(layout.correlation).toBeCloseTo(1, 10);
  });

  it('a larger lag reduces the scatter dot count', () => {
    const layout = computeLineLagPlotLayout({
      data: LAG_DATA,
      lag: 2,
      ...base,
    });
    expect(layout.scatterDots.length).toBe(4);
  });
});

describe('describeLineLagPlotChart', () => {
  it('no data -> No data', () => {
    expect(describeLineLagPlotChart([])).toBe('No data');
    expect(describeLineLagPlotChart(null)).toBe('No data');
  });
  it('summary mentions lag + scatter + autocorrelation', () => {
    const s = describeLineLagPlotChart(LAG_DATA);
    expect(s).toContain('lag');
    expect(s).toContain('scatter');
    expect(s).toContain('autocorrelation');
  });
});

describe('<ChartLineLagPlot> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineLagPlot data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the series line path', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-line-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders series dots and hides them via prop', () => {
    const { rerender } = render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-lag-plot-series-dot"]',
      ).length,
    ).toBe(6);
    rerender(<ChartLineLagPlot data={LAG_DATA} showSeriesDots={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-series-dot"]',
      ),
    ).toBeNull();
  });

  it('renders one scatter dot per lag pair', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-lag-plot-scatter-dot"]',
      ).length,
    ).toBe(5);
  });

  it('renders the identity line and hides it via prop', () => {
    const { rerender } = render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-identity-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineLagPlot data={LAG_DATA} showIdentityLine={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-identity-line"]',
      ),
    ).toBeNull();
  });

  it('renders a label for each panel including the lag', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-panel-label"][data-panel="series"]',
      )?.textContent,
    ).toBe('Series');
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-panel-label"][data-panel="scatter"]',
      )?.textContent,
    ).toBe('Lag-1 Scatter');
  });

  it('config badge shows the lag, correlation and pair count', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-badge-lag"]',
      )?.textContent,
    ).toBe('k=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-badge-count"]',
      )?.textContent,
    ).toBe('n=5');
    expect(
      document
        .querySelector(
          '[data-section="chart-line-lag-plot-badge-correlation"]',
        )
        ?.textContent?.startsWith('r='),
    ).toBe(true);
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(<ChartLineLagPlot data={LAG_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-lag-plot-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-aria-desc"]',
      )!.textContent,
    ).toContain('lag');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    const root = document.querySelector(
      '[data-section="chart-line-lag-plot"]',
    );
    expect(root!.getAttribute('data-lag')).toBe('1');
    expect(root!.getAttribute('data-pair-count')).toBe('5');
    expect(Number(root!.getAttribute('data-correlation'))).toBeCloseTo(
      1,
      6,
    );
  });

  it('scatter dot exposes lag-pair attributes', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    const dot = document.querySelector(
      '[data-section="chart-line-lag-plot-scatter-dot"]',
    );
    expect(dot!.getAttribute('data-t')).toBe('1');
    expect(Number(dot!.getAttribute('data-lagged-value'))).toBe(0);
    expect(Number(dot!.getAttribute('data-current-value'))).toBe(2);
    expect(dot!.getAttribute('data-above-diagonal')).toBe('true');
  });

  it('tooltip on a series dot shows x + value', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    const dot = document.querySelector(
      '[data-section="chart-line-lag-plot-series-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    const tip = document.querySelector(
      '[data-section="chart-line-lag-plot-tooltip"]',
    );
    expect(tip!.getAttribute('data-tooltip-kind')).toBe('series');
  });

  it('tooltip on a scatter dot shows lagged + current + delta', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    const dot = document.querySelector(
      '[data-section="chart-line-lag-plot-scatter-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-tooltip-pair"]',
      )?.textContent,
    ).toBe('Pair t=1');
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-tooltip-lagged"]',
      )?.textContent,
    ).toContain('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-tooltip-delta"]',
      )?.textContent,
    ).toContain('+2');
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector('[data-section="chart-line-lag-plot-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineLagPlot data={LAG_DATA} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-lag-plot-scatter-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-lag-plot-tooltip"]'),
    ).toBeNull();
  });

  it('onSampleClick fires with the series-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineLagPlot
        data={LAG_DATA}
        onSampleClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-lag-plot-series-dot"]',
    );
    fireEvent.click(dots[2]!);
    expect(captured).toBe(2);
  });

  it('onPairClick fires with the scatter-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineLagPlot
        data={LAG_DATA}
        onPairClick={({ pair }) => {
          captured = pair.t;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-lag-plot-scatter-dot"]',
    );
    fireEvent.click(dots[0]!);
    expect(captured).toBe(1);
  });

  it('footer reports the lag stats and hides via prop', () => {
    const { rerender } = render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-footer-stats"]',
      )?.textContent,
    ).toContain('lag=1');
    rerender(<ChartLineLagPlot data={LAG_DATA} showFooter={false} />);
    expect(
      document.querySelector('[data-section="chart-line-lag-plot-footer"]'),
    ).toBeNull();
  });

  it('a larger lag prop reduces the scatter dot count', () => {
    render(<ChartLineLagPlot data={LAG_DATA} lag={2} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-lag-plot-scatter-dot"]',
      ).length,
    ).toBe(4);
    expect(
      document.querySelector(
        '[data-section="chart-line-lag-plot-panel-label"][data-panel="scatter"]',
      )?.textContent,
    ).toBe('Lag-2 Scatter');
  });

  it('renders ticks for both panels', () => {
    render(<ChartLineLagPlot data={LAG_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-lag-plot-tick"][data-panel="series"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-lag-plot-tick"][data-panel="scatter"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineLagPlot data={LAG_DATA} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-lag-plot"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineLagPlot data={LAG_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineLagPlot ref={ref} data={LAG_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-lag-plot',
    );
  });

  it('has displayName', () => {
    expect(ChartLineLagPlot.displayName).toBe('ChartLineLagPlot');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineLagPlot data={LAG_DATA} ariaLabel="Serial dependence" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot"]')!
        .getAttribute('aria-label'),
    ).toBe('Serial dependence');
    expect(
      document
        .querySelector('[data-section="chart-line-lag-plot-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Serial dependence');
  });
});
