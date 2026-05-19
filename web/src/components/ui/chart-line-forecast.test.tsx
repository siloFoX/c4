import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineForecast,
  DEFAULT_CHART_LINE_FORECAST_DASH,
  DEFAULT_CHART_LINE_FORECAST_HEIGHT,
  DEFAULT_CHART_LINE_FORECAST_PADDING,
  DEFAULT_CHART_LINE_FORECAST_PALETTE,
  DEFAULT_CHART_LINE_FORECAST_TICK_COUNT,
  DEFAULT_CHART_LINE_FORECAST_WIDTH,
  buildLineForecastBandPath,
  buildLineForecastPath,
  computeLineForecastLayout,
  describeLineForecastChart,
  getLineForecastDefaultColor,
  getLineForecastFinitePoints,
  isForecastPoint,
  splitLineForecastPoints,
  type ChartLineForecastPoint,
  type ChartLineForecastSeries,
} from './chart-line-forecast';

const historicalThenForecast: ChartLineForecastPoint[] = [
  { x: 0, y: 10 },
  { x: 1, y: 12 },
  { x: 2, y: 15 },
  { x: 3, y: 18 },
  { x: 4, y: 20, yLower: 17, yUpper: 23 },
  { x: 5, y: 22, yLower: 18, yUpper: 26 },
  { x: 6, y: 24, yLower: 19, yUpper: 29 },
];

const series: ChartLineForecastSeries = {
  id: 'a',
  label: 'Revenue',
  data: historicalThenForecast,
};

describe('DEFAULT_CHART_LINE_FORECAST_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_FORECAST_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FORECAST_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_FORECAST_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_FORECAST_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has a non-empty dash pattern', () => {
    expect(DEFAULT_CHART_LINE_FORECAST_DASH).toMatch(/\d/);
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_FORECAST_PALETTE).toHaveLength(10);
  });
});

describe('getLineForecastDefaultColor', () => {
  it('cycles through the palette by index', () => {
    expect(getLineForecastDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_FORECAST_PALETTE[0],
    );
    expect(getLineForecastDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_FORECAST_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineForecastDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_FORECAST_PALETTE[0],
    );
    expect(getLineForecastDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_FORECAST_PALETTE[0],
    );
  });
});

describe('getLineForecastFinitePoints', () => {
  it('drops non-finite samples', () => {
    expect(
      getLineForecastFinitePoints([
        { x: 0, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: Number.POSITIVE_INFINITY },
        { x: 5, y: 8 },
      ]),
    ).toEqual([
      { x: 0, y: 1 },
      { x: 5, y: 8 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineForecastFinitePoints(
        null as unknown as ReadonlyArray<ChartLineForecastPoint>,
      ),
    ).toEqual([]);
  });
});

describe('isForecastPoint', () => {
  it('returns true for x >= cutoff', () => {
    expect(isForecastPoint({ x: 5, y: 1 }, 4)).toBe(true);
    expect(isForecastPoint({ x: 4, y: 1 }, 4)).toBe(true);
  });

  it('returns false for x < cutoff', () => {
    expect(isForecastPoint({ x: 3, y: 1 }, 4)).toBe(false);
  });

  it('returns false on non-finite cutoff', () => {
    expect(isForecastPoint({ x: 5, y: 1 }, Number.NaN)).toBe(false);
  });

  it('returns false on non-finite point', () => {
    expect(
      isForecastPoint(
        { x: Number.NaN, y: 1 } as ChartLineForecastPoint,
        4,
      ),
    ).toBe(false);
  });
});

describe('splitLineForecastPoints', () => {
  it('returns empty when no input', () => {
    expect(splitLineForecastPoints(null, 0)).toEqual({
      historical: [],
      forecast: [],
      join: null,
    });
    expect(splitLineForecastPoints([], 0)).toEqual({
      historical: [],
      forecast: [],
      join: null,
    });
  });

  it('puts everything in historical when cutoff is non-finite', () => {
    const r = splitLineForecastPoints(historicalThenForecast, Number.NaN);
    expect(r.historical.length).toBe(historicalThenForecast.length);
    expect(r.forecast.length).toBe(0);
    expect(r.join).toBeNull();
  });

  it('splits at cutoff that lands inside a segment with synthetic join', () => {
    const r = splitLineForecastPoints(historicalThenForecast, 3.5);
    expect(r.historical.length).toBeGreaterThan(0);
    expect(r.forecast.length).toBeGreaterThan(0);
    expect(r.join).not.toBeNull();
    expect(r.join?.x).toBe(3.5);
    expect(r.join?.isJoin).toBe(true);
    // Join y interpolated between (3, 18) and (4, 20) -> 19.
    expect(r.join?.y).toBeCloseTo(19, 6);
    // Last of historical and first of forecast both reference the join.
    expect(r.historical[r.historical.length - 1]).toBe(r.join);
    expect(r.forecast[0]).toBe(r.join);
  });

  it('does not synthesise a join when cutoff exactly equals a sample x', () => {
    const r = splitLineForecastPoints(historicalThenForecast, 4);
    expect(r.join).toBeNull();
    expect(r.historical.length).toBe(4); // x in {0,1,2,3}
    expect(r.forecast.length).toBe(3); // x in {4,5,6}
  });

  it('emits all-historical when cutoff is after the last point', () => {
    const r = splitLineForecastPoints(historicalThenForecast, 100);
    expect(r.forecast.length).toBe(0);
    expect(r.historical.length).toBe(historicalThenForecast.length);
  });

  it('emits all-forecast when cutoff is at or before the first point', () => {
    const r = splitLineForecastPoints(historicalThenForecast, 0);
    expect(r.historical.length).toBe(0);
    expect(r.forecast.length).toBe(historicalThenForecast.length);
  });

  it('drops non-finite samples', () => {
    const messy: ChartLineForecastPoint[] = [
      { x: 0, y: 1 },
      { x: Number.NaN, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 4 },
    ];
    const r = splitLineForecastPoints(messy, 2.5);
    expect(r.historical.length).toBe(3); // 0, 2, join
    expect(r.forecast.length).toBe(2); // join, 3
  });

  it('interpolates yLower / yUpper for the join when both endpoints carry bounds', () => {
    const r = splitLineForecastPoints(historicalThenForecast, 4.5);
    expect(r.join).not.toBeNull();
    // Endpoints at x=4 (lower 17, upper 23) and x=5 (lower 18, upper 26).
    // t=0.5 -> lower 17.5, upper 24.5.
    expect(r.join?.yLower).toBeCloseTo(17.5, 6);
    expect(r.join?.yUpper).toBeCloseTo(24.5, 6);
  });
});

describe('buildLineForecastPath', () => {
  it('returns empty for empty input', () => {
    expect(buildLineForecastPath([])).toBe('');
  });

  it('returns M only for single point', () => {
    expect(buildLineForecastPath([{ px: 1, py: 2 }])).toMatch(/^M /);
  });

  it('builds M ... L ... for multiple points', () => {
    const d = buildLineForecastPath([
      { px: 0, py: 0 },
      { px: 1, py: 1 },
      { px: 2, py: 2 },
    ]);
    expect(d.split('L').length - 1).toBe(2);
  });

  it('skips non-finite px / py', () => {
    const d = buildLineForecastPath([
      { px: 0, py: 0 },
      { px: Number.NaN, py: 1 },
      { px: 2, py: 2 },
    ]);
    expect(d.split('L').length - 1).toBe(1);
  });
});

describe('buildLineForecastBandPath', () => {
  it('returns empty when fewer than 2 paired bounds', () => {
    expect(buildLineForecastBandPath([])).toBe('');
    expect(
      buildLineForecastBandPath([
        { px: 0, pyLower: 1, pyUpper: 2 },
      ]),
    ).toBe('');
  });

  it('builds a closed polygon walking upper then lower', () => {
    const d = buildLineForecastBandPath([
      { px: 0, pyLower: 5, pyUpper: 1 },
      { px: 10, pyLower: 8, pyUpper: 2 },
    ]);
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/Z$/);
  });

  it('skips points with missing bounds', () => {
    const d = buildLineForecastBandPath([
      { px: 0, pyLower: 5, pyUpper: 1 },
      { px: 5, pyLower: null, pyUpper: 2 },
      { px: 10, pyLower: 8, pyUpper: 2 },
    ]);
    // Should still produce a closed polygon from the 2 valid points.
    expect(d).toMatch(/^M /);
    expect(d).toMatch(/Z$/);
  });
});

describe('computeLineForecastLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineForecastLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds historical and forecast paths separately', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.historicalPath).toMatch(/^M /);
    expect(s.forecastPath).toMatch(/^M /);
    expect(s.historicalCount).toBe(4); // x in {0,1,2,3}
    expect(s.forecastCount).toBe(3); // x in {4,5,6}
  });

  it('builds a band path from yLower / yUpper bounds', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.bandPath).toMatch(/^M /);
    expect(layout.series[0]?.bandPath).toMatch(/Z$/);
  });

  it('honors showBand=false', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      showBand: false,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.bandPath).toBe('');
  });

  it('honors per-series forecastFrom override', () => {
    const layout = computeLineForecastLayout({
      series: [{ ...series, forecastFrom: 2 }],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series[0]?.forecastFrom).toBe(2);
    expect(layout.series[0]?.historicalCount).toBe(2);
    expect(layout.series[0]?.forecastCount).toBe(5);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineForecastLayout({
      series: [
        series,
        { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
      ],
      forecastFrom: 4,
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('expands x bounds to include the cutoff', () => {
    const layout = computeLineForecastLayout({
      series: [
        {
          id: 'x',
          label: 'X',
          data: [{ x: 0, y: 1 }, { x: 1, y: 2 }],
        },
      ],
      forecastFrom: 100,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xMax).toBeGreaterThanOrEqual(100);
  });

  it('records defaultForecastFromX as the cutoff pixel x', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.defaultForecastFromX).not.toBeNull();
    expect(layout.defaultForecastFromX).toBeGreaterThan(0);
  });

  it('returns null defaultForecastFromX when no chart-level cutoff', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.defaultForecastFromX).toBeNull();
  });

  it('per-point phase is correctly labelled', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
    });
    const pts = layout.series[0]!.points;
    expect(pts[0]?.phase).toBe('historical');
    expect(pts[3]?.phase).toBe('historical');
    expect(pts[4]?.phase).toBe('forecast');
    expect(pts[6]?.phase).toBe('forecast');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: 0,
      yMax: 50,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(50);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineForecastLayout({
      series: [series],
      forecastFrom: 4,
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineForecastChart', () => {
  it('returns "No data" when empty', () => {
    expect(describeLineForecastChart(null, 0)).toBe('No data');
    expect(describeLineForecastChart([], 0)).toBe('No data');
  });

  it('returns "No data" when all hidden', () => {
    expect(
      describeLineForecastChart([series], 4, new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises historical + forecast counts per series', () => {
    const text = describeLineForecastChart([series], 4);
    expect(text).toContain('1 series');
    expect(text).toContain('4 historical');
    expect(text).toContain('3 forecast');
    expect(text).toContain('cutoff x=4');
  });

  it('uses formatValue for the cutoff', () => {
    expect(
      describeLineForecastChart([series], 4, undefined, (n) => `D${n}`),
    ).toContain('D4');
  });
});

describe('<ChartLineForecast /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineForecast series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-forecast"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-historical"]',
      ),
    ).toHaveLength(0);
  });

  it('renders historical and forecast paths', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-historical"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-forecast"]',
      ),
    ).toHaveLength(1);
  });

  it('renders forecast path with a strokeDasharray attr', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const fp = container.querySelector(
      '[data-section="chart-line-forecast-forecast"]',
    );
    expect(fp?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('renders forecast confidence band when yLower / yUpper present', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-band"]',
      ),
    ).toHaveLength(1);
  });

  it('omits band when showBand=false', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        showBand={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-band"]',
      ),
    ).toHaveLength(0);
  });

  it('renders the cutoff line and label by default', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-cutoff-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-cutoff-label"]',
      )?.textContent,
    ).toMatch(/Forecast/);
  });

  it('omits cutoff line when showCutoff=false', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        showCutoff={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-cutoff-line"]',
      ),
    ).toBeNull();
  });

  it('omits cutoff label when showCutoffLabel=false', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        showCutoffLabel={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-cutoff-label"]',
      ),
    ).toBeNull();
  });

  it('uses custom forecastLabel', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        forecastLabel="Projection"
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-cutoff-label"]',
      )?.textContent,
    ).toMatch(/Projection/);
  });

  it('renders dots per finite point with per-phase data attribute', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const dots = container.querySelectorAll(
      '[data-section="chart-line-forecast-dot"]',
    );
    expect(dots).toHaveLength(7);
    const historical = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="0"]',
    );
    expect(historical?.getAttribute('data-phase')).toBe('historical');
    const forecast = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="4"]',
    );
    expect(forecast?.getAttribute('data-phase')).toBe('forecast');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        showDots={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineForecast series={[series]} forecastFrom={4} />);
    expect(
      screen.getByRole('region', {
        name: /line chart with forecast extension/i,
      }),
    ).toBeTruthy();
  });

  it('shows tooltip on dot hover with phase row', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="5"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-forecast-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-forecast-tooltip-phase"]',
      )?.textContent,
    ).toMatch(/forecast/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-tooltip"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        showTooltip={false}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-tooltip"]',
      ),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        onPointClick={onClick}
      />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-forecast-dot"][data-point-index="5"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.phase).toBe('forecast');
  });

  it('legend shows historical and forecast counts', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-forecast-legend-stats"]',
      )?.textContent,
    ).toMatch(/4 hist .* 3 fcst/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineForecast
        series={[
          series,
          { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] },
        ]}
        forecastFrom={4}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-forecast-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-historical"]',
      ).length +
        container.querySelectorAll(
          '[data-section="chart-line-forecast-forecast"]',
        ).length,
    ).toBe(1);
  });

  it('respects controlled hiddenSeries prop', () => {
    const { container } = render(
      <ChartLineForecast
        series={[series, { id: 'b', label: 'B', data: [{ x: 0, y: 5 }] }]}
        forecastFrom={4}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-forecast-legend-item"]',
      ).length,
    ).toBe(2);
    expect(
      container
        .querySelector(
          '[data-section="chart-line-forecast-legend-item"][data-series-id="b"]',
        )
        ?.getAttribute('data-series-hidden'),
    ).toBe('true');
  });

  it('exposes per-series counts via data attrs', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const group = container.querySelector(
      '[data-section="chart-line-forecast-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-historical-count')).toBe('4');
    expect(group?.getAttribute('data-series-forecast-count')).toBe('3');
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(
      <ChartLineForecast series={[series]} forecastFrom={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-forecast"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineForecast
        series={[series]}
        forecastFrom={4}
        animate={false}
      />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-forecast"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <ChartLineForecast
        ref={ref}
        series={[series]}
        forecastFrom={4}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-forecast',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineForecast.displayName).toBe('ChartLineForecast');
  });
});
