import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineQQPlot,
  DEFAULT_CHART_LINE_QQPLOT_HEIGHT,
  DEFAULT_CHART_LINE_QQPLOT_PADDING,
  DEFAULT_CHART_LINE_QQPLOT_WIDTH,
  computeLineQQPlotLayout,
  computeLineQQPlotStats,
  describeLineQQPlotChart,
  getLineQQPlotFinitePoints,
  normalInverseCDF,
  runLineQQPlot,
  type ChartLineQQPlotPoint,
} from './chart-line-qqplot';

afterEach(() => {
  cleanup();
});

// symmetric sample: mean 0, sample variance 10/4 = 2.5
const QQ_DATA: ChartLineQQPlotPoint[] = [
  { x: 0, value: -2 },
  { x: 1, value: -1 },
  { x: 2, value: 0 },
  { x: 3, value: 1 },
  { x: 4, value: 2 },
];

describe('chart-line-qqplot defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_QQPLOT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_QQPLOT_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_QQPLOT_PADDING).toBeGreaterThan(0);
  });
});

describe('getLineQQPlotFinitePoints', () => {
  it('drops points with non-finite x or value', () => {
    const r = getLineQQPlotFinitePoints([
      { x: 0, value: 0 },
      { x: NaN, value: 1 },
      { x: 1, value: Infinity },
      { x: 2, value: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineQQPlotFinitePoints(null)).toEqual([]);
  });
});

describe('normalInverseCDF', () => {
  it('is exactly 0 at p=0.5', () => {
    expect(normalInverseCDF(0.5)).toBe(0);
  });
  it('matches known quantiles', () => {
    expect(normalInverseCDF(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalInverseCDF(0.025)).toBeCloseTo(-1.959964, 4);
    expect(normalInverseCDF(0.1)).toBeCloseTo(-1.281552, 4);
    expect(normalInverseCDF(0.9)).toBeCloseTo(1.281552, 4);
  });
  it('is antisymmetric about p=0.5', () => {
    expect(normalInverseCDF(0.3)).toBeCloseTo(-normalInverseCDF(0.7), 6);
  });
  it('returns infinities at the boundary', () => {
    expect(normalInverseCDF(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(normalInverseCDF(1)).toBe(Number.POSITIVE_INFINITY);
  });
  it('out-of-range / non-finite p -> NaN', () => {
    expect(Number.isNaN(normalInverseCDF(1.5))).toBe(true);
    expect(Number.isNaN(normalInverseCDF(-0.5))).toBe(true);
    expect(Number.isNaN(normalInverseCDF(NaN))).toBe(true);
  });
});

describe('computeLineQQPlotStats', () => {
  it('computes mean, variance and sample stddev', () => {
    const s = computeLineQQPlotStats([-2, -1, 0, 1, 2]);
    expect(s.mean).toBe(0);
    expect(s.variance).toBeCloseTo(2.5, 10); // 10 / (5-1)
    expect(s.stddev).toBeCloseTo(Math.sqrt(2.5), 10);
    expect(s.count).toBe(5);
  });
  it('empty -> count 0', () => {
    expect(computeLineQQPlotStats([]).count).toBe(0);
  });
  it('a single value has a zero stddev', () => {
    const s = computeLineQQPlotStats([7]);
    expect(s.mean).toBe(7);
    expect(s.stddev).toBe(0);
    expect(s.count).toBe(1);
  });
  it('drops non-finite values', () => {
    const s = computeLineQQPlotStats([1, NaN, 2, Infinity, 3]);
    expect(s.count).toBe(3);
    expect(s.mean).toBe(2);
  });
});

describe('runLineQQPlot', () => {
  it('empty -> ok=false', () => {
    expect(runLineQQPlot([]).ok).toBe(false);
  });
  it('a single point -> ok=false (needs 2 for a distribution)', () => {
    expect(runLineQQPlot([{ x: 0, value: 5 }]).ok).toBe(false);
  });
  it('uses (rank - 0.5) / n plotting positions', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.quantiles.map((q) => q.p)).toEqual([
      0.1, 0.3, 0.5, 0.7, 0.9,
    ]);
  });
  it('the median quantile maps to theoretical 0', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.quantiles[2]!.theoretical).toBe(0);
    expect(r.quantiles[2]!.sample).toBe(0);
  });
  it('sample quantiles are the sorted values', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.quantiles.map((q) => q.sample)).toEqual([-2, -1, 0, 1, 2]);
  });
  it('reports mean and sample stddev', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.mean).toBe(0);
    expect(r.stddev).toBeCloseTo(Math.sqrt(2.5), 10);
  });
  it('the reference line is mean + stddev * z', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.referenceIntercept).toBe(r.mean);
    expect(r.referenceSlope).toBe(r.stddev);
  });
  it('a near-linear sample yields a high Q-Q correlation', () => {
    const r = runLineQQPlot(QQ_DATA);
    expect(r.correlation).toBeGreaterThan(0.99);
  });
  it('sorts the series by x', () => {
    const r = runLineQQPlot([
      { x: 2, value: 1 },
      { x: 0, value: 3 },
      { x: 1, value: 2 },
    ]);
    expect(r.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });
});

describe('computeLineQQPlotLayout', () => {
  const base = { width: 600, height: 240, padding: 30 };

  it('empty data -> ok=false', () => {
    expect(computeLineQQPlotLayout({ data: [], ...base }).ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    expect(
      computeLineQQPlotLayout({
        data: QQ_DATA,
        width: 20,
        height: 20,
        padding: 30,
      }).ok,
    ).toBe(false);
  });

  it('splits the canvas into a series panel and a qq panel', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.ok).toBe(true);
    expect(layout.seriesPanel.width).toBeGreaterThan(0);
    expect(layout.qqPanel.width).toBeGreaterThan(0);
    expect(layout.qqPanel.x).toBeGreaterThan(layout.seriesPanel.x);
  });

  it('builds the series line path', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.linePath).toContain('M ');
    expect(layout.linePath).toContain(' L ');
  });

  it('projects series dots and qq dots', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.seriesDots.length).toBe(5);
    expect(layout.qqDots.length).toBe(5);
  });

  it('builds the normal reference line path', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.referencePath).toContain('M ');
    expect(layout.referencePath).toContain(' L ');
  });

  it('the median quantile has a zero residual from the reference', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.qqDots[2]!.residual).toBeCloseTo(0, 10);
  });

  it('clamps an extreme line-panel ratio', () => {
    const layout = computeLineQQPlotLayout({
      data: QQ_DATA,
      ...base,
      linePanelRatio: 5,
    });
    expect(layout.ok).toBe(true);
    expect(layout.qqPanel.width).toBeGreaterThan(0);
  });

  it('exposes the distribution stats', () => {
    const layout = computeLineQQPlotLayout({ data: QQ_DATA, ...base });
    expect(layout.count).toBe(5);
    expect(layout.mean).toBe(0);
    expect(layout.correlation).toBeGreaterThan(0.99);
  });
});

describe('describeLineQQPlotChart', () => {
  it('no data -> No data', () => {
    expect(describeLineQQPlotChart([])).toBe('No data');
    expect(describeLineQQPlotChart(null)).toBe('No data');
  });
  it('summary mentions Q-Q + normal + correlation', () => {
    const s = describeLineQQPlotChart(QQ_DATA);
    expect(s).toContain('Q-Q');
    expect(s).toContain('normal');
    expect(s).toContain('correlation');
  });
});

describe('<ChartLineQQPlot> render', () => {
  it('renders empty state with no data', () => {
    render(<ChartLineQQPlot data={[]} />);
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot"]')!
        .getAttribute('data-empty'),
    ).toBe('true');
  });

  it('renders the series line path', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-qqplot-line-path"]'),
    ).not.toBeNull();
  });

  it('renders series dots and hides them via prop', () => {
    const { rerender } = render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-qqplot-series-dot"]',
      ).length,
    ).toBe(5);
    rerender(<ChartLineQQPlot data={QQ_DATA} showSeriesDots={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-series-dot"]',
      ),
    ).toBeNull();
  });

  it('renders one qq dot per quantile', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-qqplot-qq-dot"]')
        .length,
    ).toBe(5);
  });

  it('renders the reference line and hides it via prop', () => {
    const { rerender } = render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-reference-line"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineQQPlot data={QQ_DATA} showReferenceLine={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-reference-line"]',
      ),
    ).toBeNull();
  });

  it('renders a label for each panel', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-panel-label"][data-panel="series"]',
      )?.textContent,
    ).toBe('Series');
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-panel-label"][data-panel="qq"]',
      )?.textContent,
    ).toBe('Q-Q vs Normal');
  });

  it('config badge shows the correlation and sample count', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-badge-count"]',
      )?.textContent,
    ).toBe('n=5');
    expect(
      document
        .querySelector(
          '[data-section="chart-line-qqplot-badge-correlation"]',
        )
        ?.textContent?.startsWith('r='),
    ).toBe(true);
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(<ChartLineQQPlot data={QQ_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-qqplot-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot"]')!
        .getAttribute('role'),
    ).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-aria-desc"]',
      )!.textContent,
    ).toContain('Q-Q');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    const root = document.querySelector('[data-section="chart-line-qqplot"]');
    expect(root!.getAttribute('data-count')).toBe('5');
    expect(Number(root!.getAttribute('data-mean'))).toBe(0);
    expect(Number(root!.getAttribute('data-stddev'))).toBeCloseTo(
      Math.sqrt(2.5),
      3,
    );
  });

  it('qq dot exposes rank / theoretical / sample attributes', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-qqplot-qq-dot"]',
    );
    expect(dots[2]!.getAttribute('data-rank')).toBe('3');
    expect(Number(dots[2]!.getAttribute('data-theoretical'))).toBe(0);
    expect(Number(dots[2]!.getAttribute('data-sample'))).toBe(0);
  });

  it('tooltip on a series dot shows x + value', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    const dot = document.querySelector(
      '[data-section="chart-line-qqplot-series-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    const tip = document.querySelector(
      '[data-section="chart-line-qqplot-tooltip"]',
    );
    expect(tip!.getAttribute('data-tooltip-kind')).toBe('series');
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-tooltip-value"]',
      )?.textContent,
    ).toBe('value: -2');
  });

  it('tooltip on a qq dot shows rank + theoretical + sample + residual', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-qqplot-qq-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-tooltip-rank"]',
      )?.textContent,
    ).toBe('Quantile 3');
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-tooltip-residual"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-qqplot-tooltip"]'),
    ).toBeNull();
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineQQPlot data={QQ_DATA} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-qqplot-qq-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-qqplot-tooltip"]'),
    ).toBeNull();
  });

  it('onSampleClick fires with the series-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineQQPlot
        data={QQ_DATA}
        onSampleClick={({ point }) => {
          captured = point.index;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-qqplot-series-dot"]',
    );
    fireEvent.click(dots[1]!);
    expect(captured).toBe(1);
  });

  it('onQuantileClick fires with the qq-dot payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineQQPlot
        data={QQ_DATA}
        onQuantileClick={({ quantile }) => {
          captured = quantile.rank;
        }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-qqplot-qq-dot"]',
    );
    fireEvent.click(dots[4]!);
    expect(captured).toBe(5);
  });

  it('footer reports the stats and the reference line, and hides via prop', () => {
    const { rerender } = render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-footer-stats"]',
      )?.textContent,
    ).toContain('n=5');
    expect(
      document.querySelector(
        '[data-section="chart-line-qqplot-footer-reference"]',
      )?.textContent,
    ).toContain('reference');
    rerender(<ChartLineQQPlot data={QQ_DATA} showFooter={false} />);
    expect(
      document.querySelector('[data-section="chart-line-qqplot-footer"]'),
    ).toBeNull();
  });

  it('renders ticks for both panels', () => {
    render(<ChartLineQQPlot data={QQ_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-qqplot-tick"][data-panel="series"]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-qqplot-tick"][data-panel="qq"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineQQPlot data={QQ_DATA} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-qqplot"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineQQPlot data={QQ_DATA} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineQQPlot ref={ref} data={QQ_DATA} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-qqplot',
    );
  });

  it('has displayName', () => {
    expect(ChartLineQQPlot.displayName).toBe('ChartLineQQPlot');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineQQPlot data={QQ_DATA} ariaLabel="Normality check" />);
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot"]')!
        .getAttribute('aria-label'),
    ).toBe('Normality check');
    expect(
      document
        .querySelector('[data-section="chart-line-qqplot-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Normality check');
  });
});
