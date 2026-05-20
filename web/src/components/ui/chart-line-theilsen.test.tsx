import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineTheilSen,
  DEFAULT_CHART_LINE_THEILSEN_HEIGHT,
  DEFAULT_CHART_LINE_THEILSEN_PADDING,
  DEFAULT_CHART_LINE_THEILSEN_PALETTE,
  DEFAULT_CHART_LINE_THEILSEN_TICK_COUNT,
  DEFAULT_CHART_LINE_THEILSEN_WIDTH,
  computeLineTheilSenLayout,
  computeLineTheilSenMedian,
  computeOlsFit,
  computeTheilSenFit,
  computeTheilSenSlopes,
  describeLineTheilSenChart,
  getLineTheilSenDefaultColor,
  getLineTheilSenFinitePoints,
  runLineTheilSen,
  type ChartLineTheilSenPoint,
  type ChartLineTheilSenSeries,
} from './chart-line-theilsen';

afterEach(() => {
  cleanup();
});

// Perfectly collinear: y = 2x + 1.
const COLLINEAR: ChartLineTheilSenPoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 3 },
  { x: 2, y: 5 },
  { x: 3, y: 7 },
];
// y = x for four points, then one extreme outlier. Theil-Sen ignores
// it (slope 1); OLS is dragged to slope 20.2.
const OUTLIER: ChartLineTheilSenPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 3, y: 3 },
  { x: 4, y: 100 },
];

describe('chart-line-theilsen defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_THEILSEN_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THEILSEN_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THEILSEN_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_THEILSEN_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_THEILSEN_PALETTE.length).toBe(10);
  });
});

describe('getLineTheilSenDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_THEILSEN_PALETTE.length;
    expect(getLineTheilSenDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_THEILSEN_PALETTE[0],
    );
    expect(getLineTheilSenDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_THEILSEN_PALETTE[0],
    );
    expect(getLineTheilSenDefaultColor(len + 3)).toBe(
      DEFAULT_CHART_LINE_THEILSEN_PALETTE[3],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineTheilSenDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_THEILSEN_PALETTE[0],
    );
    expect(getLineTheilSenDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_THEILSEN_PALETTE[0],
    );
  });
});

describe('getLineTheilSenFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineTheilSenFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineTheilSenFinitePoints(null)).toEqual([]);
    expect(getLineTheilSenFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineTheilSenMedian', () => {
  it('empty / null -> NaN', () => {
    expect(Number.isNaN(computeLineTheilSenMedian([]))).toBe(true);
    expect(Number.isNaN(computeLineTheilSenMedian(null))).toBe(true);
  });
  it('odd length -> middle value', () => {
    expect(computeLineTheilSenMedian([1, 2, 3, 4, 5])).toBe(3);
  });
  it('even length -> average of the two middle values', () => {
    expect(computeLineTheilSenMedian([1, 2, 3, 4])).toBe(2.5);
  });
  it('sorts internally', () => {
    expect(computeLineTheilSenMedian([5, 1, 3, 2, 4])).toBe(3);
  });
  it('drops non-finite values', () => {
    expect(computeLineTheilSenMedian([1, NaN, 3])).toBe(2);
  });
});

describe('computeTheilSenSlopes', () => {
  it('collinear data: every pairwise slope equals the line slope', () => {
    const slopes = computeTheilSenSlopes(COLLINEAR);
    expect(slopes.length).toBe(6); // C(4,2)
    for (const s of slopes) {
      expect(s).toBeCloseTo(2, 10);
    }
  });
  it('skips pairs that share an x value', () => {
    const slopes = computeTheilSenSlopes([
      { x: 2, y: 1 },
      { x: 2, y: 5 },
      { x: 5, y: 9 },
    ]);
    // only the (2,*)-(5,9) pairs are valid -> 2 slopes, the (2,*)-(2,*)
    // pair is dropped
    expect(slopes.length).toBe(2);
  });
  it('fewer than 2 points -> []', () => {
    expect(computeTheilSenSlopes([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe('computeTheilSenFit', () => {
  it('fewer than 2 points -> ok=false', () => {
    expect(computeTheilSenFit([{ x: 0, y: 0 }]).ok).toBe(false);
    expect(computeTheilSenFit([]).ok).toBe(false);
  });
  it('all points share an x -> ok=false', () => {
    const fit = computeTheilSenFit([
      { x: 2, y: 1 },
      { x: 2, y: 5 },
      { x: 2, y: 9 },
    ]);
    expect(fit.ok).toBe(false);
  });
  it('collinear data: recovers the exact slope and intercept', () => {
    const fit = computeTheilSenFit(COLLINEAR);
    expect(fit.ok).toBe(true);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
  });
  it('robust: a single extreme outlier does not move the slope', () => {
    // OUTLIER pairwise slopes sorted: [1,1,1,1,1,1,25,33,49,97]
    // -> median is 1; the y=100 outlier is ignored
    const fit = computeTheilSenFit(OUTLIER);
    expect(fit.slope).toBeCloseTo(1, 10);
    expect(fit.intercept).toBeCloseTo(0, 10);
  });
  it('reports the pairwise-slope count and slope range', () => {
    const fit = computeTheilSenFit(OUTLIER);
    expect(fit.pairCount).toBe(10);
    expect(fit.slopeMin).toBeCloseTo(1, 10);
    expect(fit.slopeMax).toBeCloseTo(97, 10);
  });
});

describe('computeOlsFit', () => {
  it('fewer than 2 points -> ok=false', () => {
    expect(computeOlsFit([{ x: 0, y: 0 }]).ok).toBe(false);
  });
  it('all points share an x -> ok=false', () => {
    expect(
      computeOlsFit([
        { x: 2, y: 1 },
        { x: 2, y: 5 },
      ]).ok,
    ).toBe(false);
  });
  it('collinear data: recovers the exact slope and intercept', () => {
    const fit = computeOlsFit(COLLINEAR);
    expect(fit.ok).toBe(true);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
  });
  it('non-robust: a single outlier swings the OLS slope to 20.2', () => {
    // the y=100 outlier drags the least-squares line hard
    const fit = computeOlsFit(OUTLIER);
    expect(fit.slope).toBeCloseTo(20.2, 8);
    expect(fit.intercept).toBeCloseTo(-19.2, 8);
  });
  it('Theil-Sen and OLS diverge sharply on outlier data', () => {
    // the distinguishing property: slope 1 (robust) vs 20.2 (OLS)
    const ts = computeTheilSenFit(OUTLIER);
    const ols = computeOlsFit(OUTLIER);
    expect(ts.slope).toBeCloseTo(1, 8);
    expect(ols.slope).toBeCloseTo(20.2, 8);
    expect(Math.abs(ols.slope - ts.slope)).toBeGreaterThan(15);
  });
});

describe('runLineTheilSen', () => {
  it('empty -> not ok, no samples', () => {
    const r = runLineTheilSen([]);
    expect(r.samples).toEqual([]);
    expect(r.theilSen.ok).toBe(false);
    expect(r.ols.ok).toBe(false);
  });
  it('sorts samples ascending and reports the x range', () => {
    const r = runLineTheilSen([
      { x: 3, y: 7 },
      { x: 0, y: 1 },
      { x: 2, y: 5 },
      { x: 1, y: 3 },
    ]);
    expect(r.samples.map((p) => p.x)).toEqual([0, 1, 2, 3]);
    expect(r.xMin).toBe(0);
    expect(r.xMax).toBe(3);
  });
  it('exposes both the Theil-Sen and the OLS fit', () => {
    const r = runLineTheilSen(OUTLIER);
    expect(r.theilSen.slope).toBeCloseTo(1, 8);
    expect(r.ols.slope).toBeCloseTo(20.2, 8);
  });
});

describe('computeLineTheilSenLayout', () => {
  const series: ChartLineTheilSenSeries[] = [
    { id: 'a', label: 'A', data: OUTLIER },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineTheilSenLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineTheilSenLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineTheilSenLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds the raw path and the Theil-Sen trend endpoints', () => {
    const layout = computeLineTheilSenLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    const s = layout.series[0]!;
    expect(s.rawPath).toContain('M ');
    expect(s.trendStartPx).not.toBeNull();
    expect(s.trendStartPy).not.toBeNull();
    expect(s.trendEndPx).not.toBeNull();
    expect(s.trendEndPy).not.toBeNull();
  });

  it('exposes the Theil-Sen and OLS fits on the layout series', () => {
    const layout = computeLineTheilSenLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.fit.slope).toBeCloseTo(1, 8);
    expect(s.ols.slope).toBeCloseTo(20.2, 8);
  });

  it('OLS endpoints widen the y range only when includeOls is set', () => {
    const without = computeLineTheilSenLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      includeOls: false,
    });
    const withOls = computeLineTheilSenLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      includeOls: true,
    });
    // the OLS line dips to ~-19.2 at x=0; including it pushes yMin down
    expect(withOls.yMin).toBeLessThan(without.yMin);
  });

  it('a same-x series still renders the raw path but no trend', () => {
    const layout = computeLineTheilSenLayout({
      series: [
        {
          id: 'flat',
          label: 'Flat',
          data: [
            { x: 2, y: 1 },
            { x: 2, y: 5 },
            { x: 2, y: 9 },
          ],
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series[0]!.fit.ok).toBe(false);
    expect(layout.series[0]!.trendStartPx).toBeNull();
  });

  it('hidden series excluded', () => {
    const multi: ChartLineTheilSenSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: COLLINEAR },
    ];
    const layout = computeLineTheilSenLayout({
      series: multi,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.series[0]!.id).toBe('a');
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineTheilSenLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 200,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(200);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineTheilSenSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: COLLINEAR },
    ];
    const layout = computeLineTheilSenLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(OUTLIER.length + COLLINEAR.length);
  });
});

describe('describeLineTheilSenChart', () => {
  it('no data -> No data', () => {
    expect(describeLineTheilSenChart(null)).toBe('No data');
    expect(describeLineTheilSenChart([])).toBe('No data');
  });
  it('summary mentions Theil-Sen, the median of pairwise slopes and OLS', () => {
    const s = describeLineTheilSenChart([
      { id: 'a', label: 'A', data: OUTLIER },
    ]);
    expect(s).toContain('Theil-Sen');
    expect(s).toContain('pairwise slopes');
    expect(s).toContain('OLS slope');
  });
  it('handles hidden filter', () => {
    const s = describeLineTheilSenChart(
      [{ id: 'a', label: 'A', data: COLLINEAR }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineTheilSen> render', () => {
  const series: ChartLineTheilSenSeries[] = [
    { id: 'a', label: 'Series A', data: OUTLIER },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineTheilSen series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineTheilSen series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-theilsen-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders the Theil-Sen trend line with data-kind=theil-sen', () => {
    render(<ChartLineTheilSen series={series} />);
    const trend = document.querySelector(
      '[data-section="chart-line-theilsen-trend-line"]',
    );
    expect(trend).not.toBeNull();
    expect(trend!.getAttribute('data-kind')).toBe('theil-sen');
  });

  it('hides the trend line when showTrend=false', () => {
    render(<ChartLineTheilSen series={series} showTrend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-trend-line"]',
      ),
    ).toBeNull();
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineTheilSen series={series} showRaw={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-raw-path"]',
      ),
    ).toBeNull();
  });

  it('omits the OLS comparison line by default and shows it via prop', () => {
    const { rerender } = render(<ChartLineTheilSen series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-ols-line"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineTheilSen series={series} showOlsComparison={true} />,
    );
    const ols = document.querySelector(
      '[data-section="chart-line-theilsen-ols-line"]',
    );
    expect(ols).not.toBeNull();
    expect(ols!.getAttribute('data-kind')).toBe('ols');
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineTheilSen series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-theilsen-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineTheilSen series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-theilsen-dot"]')
        .length,
    ).toBe(5);
  });

  it('config badge shows slope, intercept and pair count', () => {
    render(<ChartLineTheilSen series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-theilsen-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-theilsen-badge-slope"]')
        ?.textContent?.startsWith('m='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-theilsen-badge-intercept"]')
        ?.textContent?.startsWith('b='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-badge-pairs"]',
      )?.textContent,
    ).toBe('n=10');
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineTheilSen series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-theilsen-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineTheilSen series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-theilsen-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-theilsen-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Theil-Sen');
  });

  it('root carries data-* attributes including the robust + OLS slopes', () => {
    render(<ChartLineTheilSen series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBe(5);
    expect(Number(root!.getAttribute('data-slope'))).toBeCloseTo(1, 5);
    expect(Number(root!.getAttribute('data-ols-slope'))).toBeCloseTo(
      20.2,
      5,
    );
    expect(root!.getAttribute('data-fit-ok')).toBe('true');
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineTheilSen series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-theilsen-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-slope'))).toBeCloseTo(1, 5);
    expect(Number(grp!.getAttribute('data-series-ols-slope'))).toBeCloseTo(
      20.2,
      5,
    );
    expect(Number(grp!.getAttribute('data-series-pair-count'))).toBe(10);
    expect(grp!.getAttribute('data-series-fit-ok')).toBe('true');
  });

  it('tooltip appears on dot hover with x + y + trend + residual rows', () => {
    render(<ChartLineTheilSen series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-theilsen-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-theilsen-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-tooltip-x"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-tooltip-y"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-tooltip-trend"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-theilsen-tooltip-residual"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dots[2]!);
    expect(
      document.querySelector('[data-section="chart-line-theilsen-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineTheilSen
        series={series}
        showDots={true}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-theilsen-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-theilsen-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineTheilSen
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-theilsen-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows the robust slope alongside the OLS slope', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineTheilSen
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-theilsen-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('m=');
    expect(stats!.textContent).toContain('OLS m=');
    const btn = document.querySelector(
      '[data-section="chart-line-theilsen-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineTheilSen series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-theilsen-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineTheilSen series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineTheilSen series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTheilSen ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-theilsen',
    );
  });

  it('has displayName', () => {
    expect(ChartLineTheilSen.displayName).toBe('ChartLineTheilSen');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineTheilSen series={series} ariaLabel="Custom Theil-Sen" />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-theilsen"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom Theil-Sen');
    const svg = document.querySelector(
      '[data-section="chart-line-theilsen-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom Theil-Sen');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineTheilSen series={series} xLabel="time" yLabel="value" />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-theilsen-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-theilsen-y-label',
    );
  });

  it('collinear input renders an exact slope-2 trend in the badge', () => {
    render(
      <ChartLineTheilSen
        series={[{ id: 'c', label: 'C', data: COLLINEAR }]}
      />,
    );
    const slope = document.querySelector(
      '[data-section="chart-line-theilsen-badge-slope"]',
    );
    expect(slope!.textContent).toBe('m=2.000');
  });
});
