import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineErrorBars,
  DEFAULT_CHART_LINE_ERROR_BARS_HEIGHT,
  DEFAULT_CHART_LINE_ERROR_BARS_PADDING,
  DEFAULT_CHART_LINE_ERROR_BARS_PALETTE,
  DEFAULT_CHART_LINE_ERROR_BARS_TICK_COUNT,
  DEFAULT_CHART_LINE_ERROR_BARS_WIDTH,
  computeLineErrorBarsLayout,
  describeLineErrorBarsChart,
  getLineErrorBarsDefaultColor,
  getLineErrorBarsFinitePoints,
  resolveLineErrorBarsBounds,
  runLineErrorBars,
  type ChartLineErrorBarsPoint,
  type ChartLineErrorBarsSeries,
} from './chart-line-error-bars';

afterEach(() => {
  cleanup();
});

// Symmetric errors via the `error` field.
const SYMMETRIC: ChartLineErrorBarsPoint[] = [
  { x: 0, y: 10, error: 2 },
  { x: 1, y: 12, error: 3 },
  { x: 2, y: 8, error: 1 },
];
// Asymmetric errors via errorLow / errorHigh.
const ASYMMETRIC: ChartLineErrorBarsPoint[] = [
  { x: 0, y: 10, errorLow: 1, errorHigh: 3 },
  { x: 1, y: 5, errorLow: 2, errorHigh: 4 },
];
// Some points carry error, some do not.
const MIXED: ChartLineErrorBarsPoint[] = [
  { x: 0, y: 10, error: 2 },
  { x: 1, y: 12 },
  { x: 2, y: 8, error: 1 },
];

describe('chart-line-error-bars defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_ERROR_BARS_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ERROR_BARS_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ERROR_BARS_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ERROR_BARS_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_ERROR_BARS_PALETTE.length).toBe(10);
  });
});

describe('getLineErrorBarsDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_ERROR_BARS_PALETTE.length;
    expect(getLineErrorBarsDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0],
    );
    expect(getLineErrorBarsDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0],
    );
    expect(getLineErrorBarsDefaultColor(len + 4)).toBe(
      DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[4],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineErrorBarsDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0],
    );
    expect(getLineErrorBarsDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0],
    );
  });
});

describe('getLineErrorBarsFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const r = getLineErrorBarsFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineErrorBarsFinitePoints(null)).toEqual([]);
    expect(getLineErrorBarsFinitePoints(undefined)).toEqual([]);
  });
});

describe('resolveLineErrorBarsBounds', () => {
  it('symmetric error fills both sides', () => {
    expect(resolveLineErrorBarsBounds({ x: 0, y: 0, error: 2 })).toEqual({
      errorLow: 2,
      errorHigh: 2,
    });
  });
  it('explicit errorLow / errorHigh used directly', () => {
    expect(
      resolveLineErrorBarsBounds({
        x: 0,
        y: 0,
        errorLow: 1,
        errorHigh: 3,
      }),
    ).toEqual({ errorLow: 1, errorHigh: 3 });
  });
  it('an explicit side wins; the other falls back to symmetric error', () => {
    expect(
      resolveLineErrorBarsBounds({ x: 0, y: 0, error: 2, errorHigh: 5 }),
    ).toEqual({ errorLow: 2, errorHigh: 5 });
  });
  it('no error fields -> zero on both sides', () => {
    expect(resolveLineErrorBarsBounds({ x: 0, y: 0 })).toEqual({
      errorLow: 0,
      errorHigh: 0,
    });
  });
  it('negative error magnitudes are clamped to 0', () => {
    expect(resolveLineErrorBarsBounds({ x: 0, y: 0, error: -2 })).toEqual({
      errorLow: 0,
      errorHigh: 0,
    });
    expect(
      resolveLineErrorBarsBounds({ x: 0, y: 0, errorLow: -1, errorHigh: 3 }),
    ).toEqual({ errorLow: 0, errorHigh: 3 });
  });
  it('null point -> zero bounds', () => {
    expect(resolveLineErrorBarsBounds(null)).toEqual({
      errorLow: 0,
      errorHigh: 0,
    });
  });
});

describe('runLineErrorBars', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineErrorBars(null);
    expect(r.samples).toEqual([]);
    expect(r.totalSamples).toBe(0);
    expect(r.errorPointCount).toBe(0);
  });
  it('symmetric series: upper/lower straddle y by the error', () => {
    const r = runLineErrorBars(SYMMETRIC);
    expect(r.samples[0]!.upper).toBe(12);
    expect(r.samples[0]!.lower).toBe(8);
    expect(r.samples[1]!.upper).toBe(15);
    expect(r.samples[1]!.lower).toBe(9);
    for (const s of r.samples) {
      expect(s.symmetric).toBe(true);
      expect(s.hasError).toBe(true);
    }
  });
  it('asymmetric series: upper/lower use the two distinct magnitudes', () => {
    const r = runLineErrorBars(ASYMMETRIC);
    expect(r.samples[0]!.upper).toBe(13); // 10 + 3
    expect(r.samples[0]!.lower).toBe(9); // 10 - 1
    expect(r.samples[0]!.symmetric).toBe(false);
  });
  it('counts the points that carry error bars', () => {
    // MIXED: point 1 has no error -> only 2 of 3 carry bars
    const r = runLineErrorBars(MIXED);
    expect(r.errorPointCount).toBe(2);
    expect(r.samples[1]!.hasError).toBe(false);
  });
  it('mean error is the average half-extent', () => {
    // SYMMETRIC half-extents = error = [2, 3, 1] -> mean 2
    expect(runLineErrorBars(SYMMETRIC).meanError).toBeCloseTo(2, 10);
  });
  it('max error is the largest single-side magnitude', () => {
    expect(runLineErrorBars(SYMMETRIC).maxError).toBe(3);
    expect(runLineErrorBars(ASYMMETRIC).maxError).toBe(4);
  });
  it('sorts ascending and drops non-finite x/y', () => {
    const r = runLineErrorBars([
      { x: 3, y: 4, error: 1 },
      { x: NaN, y: 0, error: 1 },
      { x: 1, y: 2, error: 1 },
      { x: 0, y: 1, error: 1 },
      { x: 2, y: 3, error: 1 },
    ]);
    expect(r.samples.map((s) => s.x)).toEqual([0, 1, 2, 3]);
  });
});

describe('computeLineErrorBarsLayout', () => {
  const series: ChartLineErrorBarsSeries[] = [
    { id: 'a', label: 'A', data: SYMMETRIC },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineErrorBarsLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineErrorBarsLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineErrorBarsLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds the line path and per-point error bounds', () => {
    const layout = computeLineErrorBarsLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    const s = layout.series[0]!;
    expect(s.linePath).toContain('M ');
    expect(s.points.length).toBe(3);
    expect(s.points[0]!.upperPy).not.toBeNull();
    expect(s.points[0]!.lowerPy).not.toBeNull();
  });

  it('the y range covers the error-bar extents, not just y', () => {
    // SYMMETRIC: uppers up to 15, lowers down to 7
    const layout = computeLineErrorBarsLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.yMin).toBeLessThanOrEqual(7);
    expect(layout.yMax).toBeGreaterThanOrEqual(15);
  });

  it('exposes per-series error statistics', () => {
    const layout = computeLineErrorBarsLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.errorPointCount).toBe(3);
    expect(s.meanError).toBeCloseTo(2, 10);
    expect(s.maxError).toBe(3);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineErrorBarsSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: ASYMMETRIC },
    ];
    const layout = computeLineErrorBarsLayout({
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
    const layout = computeLineErrorBarsLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 99,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(99);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineErrorBarsSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: ASYMMETRIC },
    ];
    const layout = computeLineErrorBarsLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(SYMMETRIC.length + ASYMMETRIC.length);
  });

  it('points carry the hasError flag', () => {
    const layout = computeLineErrorBarsLayout({
      series: [{ id: 'm', label: 'M', data: MIXED }],
      width: 400,
      height: 200,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts[0]!.hasError).toBe(true);
    expect(pts[1]!.hasError).toBe(false);
    expect(pts[2]!.hasError).toBe(true);
  });
});

describe('describeLineErrorBarsChart', () => {
  it('no data -> No data', () => {
    expect(describeLineErrorBarsChart(null)).toBe('No data');
    expect(describeLineErrorBarsChart([])).toBe('No data');
  });
  it('summary mentions discrete per-point error bars and the count', () => {
    const s = describeLineErrorBarsChart([
      { id: 'a', label: 'A', data: SYMMETRIC },
    ]);
    expect(s).toContain('discrete per-point error bars');
    expect(s).toContain('carry error bars');
    expect(s).toContain('mean error');
  });
  it('handles hidden filter', () => {
    const s = describeLineErrorBarsChart(
      [{ id: 'a', label: 'A', data: SYMMETRIC }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineErrorBars> render', () => {
  const series: ChartLineErrorBarsSeries[] = [
    { id: 'a', label: 'Series A', data: SYMMETRIC },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineErrorBars series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders the line path with data-kind=line', () => {
    render(<ChartLineErrorBars series={series} />);
    const line = document.querySelector(
      '[data-section="chart-line-error-bars-line-path"]',
    );
    expect(line).not.toBeNull();
    expect(line!.getAttribute('data-kind')).toBe('line');
  });

  it('hides the line when showLine=false', () => {
    render(<ChartLineErrorBars series={series} showLine={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-line-path"]',
      ),
    ).toBeNull();
  });

  it('renders one discrete error bar per point that carries error', () => {
    render(<ChartLineErrorBars series={series} />);
    const bars = document.querySelectorAll(
      '[data-section="chart-line-error-bars-error-bar"]',
    );
    expect(bars.length).toBe(3);
  });

  it('each error bar has a stem and two caps', () => {
    render(<ChartLineErrorBars series={series} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-error-bars-error-bar-stem"]',
      ).length,
    ).toBe(3);
    const caps = document.querySelectorAll(
      '[data-section="chart-line-error-bars-error-bar-cap"]',
    );
    expect(caps.length).toBe(6);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-error-bar-cap"][data-edge="upper"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-error-bar-cap"][data-edge="lower"]',
      ),
    ).not.toBeNull();
  });

  it('only points that carry error get a bar', () => {
    render(
      <ChartLineErrorBars
        series={[{ id: 'm', label: 'M', data: MIXED }]}
      />,
    );
    // MIXED has 3 points, only 2 carry error
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-error-bars-error-bar"]',
      ).length,
    ).toBe(2);
  });

  it('hides error bars when showErrorBars=false', () => {
    render(<ChartLineErrorBars series={series} showErrorBars={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-error-bar"]',
      ),
    ).toBeNull();
  });

  it('renders dots by default and hides them via showDots=false', () => {
    const { rerender } = render(<ChartLineErrorBars series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-error-bars-dot"]')
        .length,
    ).toBe(3);
    rerender(<ChartLineErrorBars series={series} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-error-bars-dot"]')
        .length,
    ).toBe(0);
  });

  it('error bar carries the symmetric flag', () => {
    render(
      <ChartLineErrorBars
        series={[{ id: 'asym', label: 'Asym', data: ASYMMETRIC }]}
      />,
    );
    const bar = document.querySelector(
      '[data-section="chart-line-error-bars-error-bar"]',
    );
    expect(bar!.getAttribute('data-symmetric')).toBe('false');
  });

  it('config badge shows mean, max and bar count', () => {
    render(<ChartLineErrorBars series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-error-bars-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-error-bars-badge-mean"]')
        ?.textContent?.startsWith('mean='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-error-bars-badge-max"]')
        ?.textContent?.startsWith('max='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-badge-points"]',
      )?.textContent,
    ).toBe('bars=3');
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineErrorBars series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-error-bars-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineErrorBars series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-error-bars-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-error-bars-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('error bars');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineErrorBars series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBe(3);
    expect(root!.getAttribute('data-total-error-points')).toBe('3');
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineErrorBars series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-error-bars-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(
      Number(grp!.getAttribute('data-series-error-point-count')),
    ).toBe(3);
    expect(
      Number(grp!.getAttribute('data-series-mean-error')),
    ).toBeCloseTo(2, 5);
    expect(Number(grp!.getAttribute('data-series-max-error'))).toBe(3);
  });

  it('dot exposes error-low / error-high / has-error attributes', () => {
    render(
      <ChartLineErrorBars
        series={[{ id: 'asym', label: 'Asym', data: ASYMMETRIC }]}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-error-bars-dot"]',
    );
    expect(Number(dot!.getAttribute('data-error-low'))).toBe(1);
    expect(Number(dot!.getAttribute('data-error-high'))).toBe(3);
    expect(dot!.getAttribute('data-has-error')).toBe('true');
  });

  it('tooltip appears on dot hover with x + y + error + range rows', () => {
    render(<ChartLineErrorBars series={series} />);
    const dot = document.querySelector(
      '[data-section="chart-line-error-bars-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip-y"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip-error"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip-range"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(<ChartLineErrorBars series={series} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-error-bars-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-error-bars-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineErrorBars
        series={series}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-error-bars-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows the bar count + mean error and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineErrorBars
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-error-bars-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('bars');
    expect(stats!.textContent).toContain('mean');
    const btn = document.querySelector(
      '[data-section="chart-line-error-bars-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineErrorBars series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-error-bars-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineErrorBars series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineErrorBars series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineErrorBars ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-error-bars',
    );
  });

  it('has displayName', () => {
    expect(ChartLineErrorBars.displayName).toBe('ChartLineErrorBars');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineErrorBars series={series} ariaLabel="Custom error bars" />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-error-bars"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom error bars');
    const svg = document.querySelector(
      '[data-section="chart-line-error-bars-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom error bars');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineErrorBars series={series} xLabel="time" yLabel="value" />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-error-bars-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-error-bars-y-label',
    );
  });
});
