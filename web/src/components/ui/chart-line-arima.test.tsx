import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineArima,
  DEFAULT_CHART_LINE_ARIMA_HEIGHT,
  DEFAULT_CHART_LINE_ARIMA_PADDING,
  DEFAULT_CHART_LINE_ARIMA_PALETTE,
  DEFAULT_CHART_LINE_ARIMA_TICK_COUNT,
  DEFAULT_CHART_LINE_ARIMA_WIDTH,
  classifyLineArimaResidualSign,
  computeLineArimaLayout,
  describeLineArimaChart,
  fitLineArimaAR1,
  forecastLineArimaNext,
  getLineArimaDefaultColor,
  getLineArimaFinitePoints,
  predictLineArimaOneStep,
  runLineArima,
  type ChartLineArimaSeries,
} from './chart-line-arima';

afterEach(() => {
  cleanup();
});

describe('chart-line-arima defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_ARIMA_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ARIMA_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ARIMA_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ARIMA_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_ARIMA_PALETTE.length).toBe(10);
  });
});

describe('getLineArimaDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_ARIMA_PALETTE.length;
    expect(getLineArimaDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ARIMA_PALETTE[0],
    );
    expect(getLineArimaDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_ARIMA_PALETTE[0],
    );
    expect(getLineArimaDefaultColor(len + 2)).toBe(
      DEFAULT_CHART_LINE_ARIMA_PALETTE[2],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineArimaDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_ARIMA_PALETTE[0],
    );
    expect(getLineArimaDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_ARIMA_PALETTE[0],
    );
  });
});

describe('getLineArimaFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineArimaFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineArimaFinitePoints(null)).toEqual([]);
    expect(getLineArimaFinitePoints(undefined)).toEqual([]);
  });
});

describe('classifyLineArimaResidualSign', () => {
  it('positive / negative / zero', () => {
    expect(classifyLineArimaResidualSign(1)).toBe('positive');
    expect(classifyLineArimaResidualSign(-1)).toBe('negative');
    expect(classifyLineArimaResidualSign(0)).toBe('zero');
  });
  it('null and non-finite -> zero', () => {
    expect(classifyLineArimaResidualSign(null)).toBe('zero');
    expect(classifyLineArimaResidualSign(NaN)).toBe('zero');
    expect(classifyLineArimaResidualSign(Infinity)).toBe('zero');
  });
});

describe('fitLineArimaAR1', () => {
  it('empty / null input -> phi 0, intercept 0', () => {
    expect(fitLineArimaAR1(null)).toEqual({
      phi: 0,
      intercept: 0,
      mean: 0,
      stationary: true,
    });
    expect(fitLineArimaAR1([])).toEqual({
      phi: 0,
      intercept: 0,
      mean: 0,
      stationary: true,
    });
  });
  it('single value -> phi 0, intercept = mean', () => {
    const fit = fitLineArimaAR1([7]);
    expect(fit.phi).toBe(0);
    expect(fit.intercept).toBe(7);
    expect(fit.mean).toBe(7);
  });
  it('constant series -> phi 0, intercept = mean', () => {
    const fit = fitLineArimaAR1([5, 5, 5, 5, 5]);
    expect(fit.phi).toBeCloseTo(0, 10);
    expect(fit.intercept).toBeCloseTo(5, 10);
    expect(fit.mean).toBeCloseTo(5, 10);
    expect(fit.stationary).toBe(true);
  });
  it('linear series [1..5] -> phi exactly 1, intercept exactly 1', () => {
    // Conditional OLS regressing y_t on y_{t-1}:
    //   predictor = [1,2,3,4], response = [2,3,4,5]
    //   xbar = 2.5, ybar = 3.5, Sxx = 5, Sxy = 5
    //   phi = 1, c = 3.5 - 1*2.5 = 1
    const fit = fitLineArimaAR1([1, 2, 3, 4, 5]);
    expect(fit.phi).toBeCloseTo(1, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    // phi = 1 -> not stationary (AR(1) requires |phi| < 1)
    expect(fit.stationary).toBe(false);
  });
  it('geometric decay y_t = 0.5*y_{t-1} -> phi exactly 0.5, intercept exactly 0', () => {
    // y = [10, 5, 2.5, 1.25, 0.625]. Each response = 0.5 * predictor,
    // so OLS recovers phi = 0.5 and c = 0 exactly.
    const fit = fitLineArimaAR1([10, 5, 2.5, 1.25, 0.625]);
    expect(fit.phi).toBeCloseTo(0.5, 10);
    expect(fit.intercept).toBeCloseTo(0, 10);
    expect(fit.stationary).toBe(true);
  });
  it('marks |phi| >= 1 as non-stationary', () => {
    // An explosive series y_t = 2*y_{t-1}: phi = 2.
    const fit = fitLineArimaAR1([1, 2, 4, 8, 16]);
    expect(fit.phi).toBeCloseTo(2, 8);
    expect(fit.stationary).toBe(false);
  });
  it('skips non-finite values when fitting', () => {
    const fit = fitLineArimaAR1([1, 2, 3, 4, 5]);
    const fitWithNaN = fitLineArimaAR1([1, 2, NaN, 3, 4, 5]);
    // NaN dropped -> same finite sequence [1,2,3,4,5]
    expect(fitWithNaN.phi).toBeCloseTo(fit.phi, 10);
    expect(fitWithNaN.intercept).toBeCloseTo(fit.intercept, 10);
  });
});

describe('predictLineArimaOneStep', () => {
  it('empty input -> empty', () => {
    expect(predictLineArimaOneStep([], { phi: 0.5, intercept: 1 })).toEqual([]);
    expect(
      predictLineArimaOneStep(null, { phi: 0.5, intercept: 1 }),
    ).toEqual([]);
  });
  it('index 0 prediction is null (no prior value)', () => {
    const out = predictLineArimaOneStep([1, 2, 3], {
      phi: 0.5,
      intercept: 1,
    });
    expect(out[0]).toBeNull();
  });
  it('predicts c + phi * y_{t-1}', () => {
    const out = predictLineArimaOneStep([10, 20, 30], {
      phi: 0.5,
      intercept: 2,
    });
    expect(out[1]).toBeCloseTo(2 + 0.5 * 10, 10);
    expect(out[2]).toBeCloseTo(2 + 0.5 * 20, 10);
  });
  it('linear series reproduced exactly with phi=1, c=1', () => {
    const out = predictLineArimaOneStep([1, 2, 3, 4, 5], {
      phi: 1,
      intercept: 1,
    });
    expect(out[1]).toBeCloseTo(2, 10);
    expect(out[2]).toBeCloseTo(3, 10);
    expect(out[3]).toBeCloseTo(4, 10);
    expect(out[4]).toBeCloseTo(5, 10);
  });
  it('non-finite prior value yields null prediction', () => {
    const out = predictLineArimaOneStep([1, NaN, 3], {
      phi: 0.5,
      intercept: 1,
    });
    expect(out[2]).toBeNull();
  });
});

describe('forecastLineArimaNext', () => {
  it('empty input -> null', () => {
    expect(forecastLineArimaNext([], { phi: 0.5, intercept: 1 })).toBeNull();
    expect(
      forecastLineArimaNext(null, { phi: 0.5, intercept: 1 }),
    ).toBeNull();
  });
  it('forecasts c + phi * last value', () => {
    expect(
      forecastLineArimaNext([1, 2, 3, 4, 5], { phi: 1, intercept: 1 }),
    ).toBeCloseTo(6, 10);
    expect(
      forecastLineArimaNext([10, 5, 2.5], { phi: 0.5, intercept: 0 }),
    ).toBeCloseTo(1.25, 10);
  });
  it('non-finite last value -> null', () => {
    expect(
      forecastLineArimaNext([1, 2, NaN], { phi: 0.5, intercept: 1 }),
    ).toBeNull();
  });
});

describe('runLineArima', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineArima(null);
    expect(r.samples).toEqual([]);
    expect(r.phi).toBe(0);
    expect(r.forecast).toBeNull();
  });
  it('linear series: predictions exact, residuals zero, RMSE zero', () => {
    const data = [1, 2, 3, 4, 5].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    expect(r.phi).toBeCloseTo(1, 8);
    expect(r.intercept).toBeCloseTo(1, 8);
    expect(r.rmse).toBeCloseTo(0, 8);
    expect(r.samples[0]!.predicted).toBeNull();
    for (let i = 1; i < r.samples.length; i += 1) {
      expect(r.samples[i]!.predicted!).toBeCloseTo(r.samples[i]!.raw, 8);
      expect(r.samples[i]!.residual!).toBeCloseTo(0, 8);
    }
  });
  it('constant series: predictions = constant, residuals zero', () => {
    const data = [9, 9, 9, 9, 9, 9].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    expect(r.phi).toBeCloseTo(0, 8);
    expect(r.intercept).toBeCloseTo(9, 8);
    for (let i = 1; i < r.samples.length; i += 1) {
      expect(r.samples[i]!.predicted!).toBeCloseTo(9, 8);
    }
    expect(r.rmse).toBeCloseTo(0, 8);
  });
  it('geometric series: recovers phi=0.5, predictions exact', () => {
    const data = [10, 5, 2.5, 1.25, 0.625].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    expect(r.phi).toBeCloseTo(0.5, 8);
    expect(r.intercept).toBeCloseTo(0, 8);
    expect(r.rmse).toBeCloseTo(0, 8);
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineArima([
      { x: 4, y: 5 },
      { x: NaN, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 0, y: 1 },
      { x: 3, y: 4 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3, 4]);
  });
  it('computes the one-step forecast beyond the last point', () => {
    const data = [1, 2, 3, 4, 5].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    expect(r.forecast).not.toBeNull();
    // phi=1, c=1 -> forecast = 1 + 1*5 = 6 at x = 5
    expect(r.forecast!.value).toBeCloseTo(6, 8);
    expect(r.forecast!.x).toBeCloseTo(5, 8);
  });
  it('tracks predicted valid count (N - 1 for finite series)', () => {
    const data = [1, 2, 3, 4, 5, 6].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    expect(r.predictedValidCount).toBe(5);
  });
  it('counts residual signs', () => {
    const data = [1, 5, 2, 8, 3, 9].map((y, i) => ({ x: i, y }));
    const r = runLineArima(data);
    const total =
      r.positiveResidualCount +
      r.negativeResidualCount +
      r.zeroResidualCount;
    expect(total).toBe(r.samples.length);
  });
  it('reports stationary flag', () => {
    const stationaryData = [10, 5, 2.5, 1.25, 0.625].map((y, i) => ({
      x: i,
      y,
    }));
    expect(runLineArima(stationaryData).stationary).toBe(true);
    const explosiveData = [1, 2, 4, 8, 16].map((y, i) => ({ x: i, y }));
    expect(runLineArima(explosiveData).stationary).toBe(false);
  });
});

describe('computeLineArimaLayout', () => {
  const series: ChartLineArimaSeries[] = [
    {
      id: 'a',
      label: 'A',
      data: [1, 3, 2, 5, 4, 6, 5, 8].map((y, i) => ({ x: i, y })),
    },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineArimaLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineArimaLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineArimaLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw + predicted paths', () => {
    const layout = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series[0]!.rawPath).toContain('M ');
    expect(layout.series[0]!.predictedPath).toContain('M ');
  });

  it('exposes phi, intercept, rmse, stationary on layout series', () => {
    const layout = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(typeof s.phi).toBe('number');
    expect(typeof s.intercept).toBe('number');
    expect(typeof s.rmseResidual).toBe('number');
    expect(typeof s.stationary).toBe('boolean');
  });

  it('produces a forecast point with projected coordinates', () => {
    const layout = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.forecast).not.toBeNull();
    expect(s.forecastPx).not.toBeNull();
    expect(s.forecastPy).not.toBeNull();
  });

  it('extendForForecast=false keeps forecast out of x range', () => {
    const withForecast = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      extendForForecast: true,
    });
    const withoutForecast = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      extendForForecast: false,
    });
    // Extending for the forecast pushes xMax further right.
    expect(withForecast.xMax).toBeGreaterThan(withoutForecast.xMax);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineArimaSeries[] = [
      ...series,
      {
        id: 'b',
        label: 'B',
        data: [2, 4, 6, 8].map((y, i) => ({ x: i, y })),
      },
    ];
    const layout = computeLineArimaLayout({
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
    const layout = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -10,
      xMax: 50,
      yMin: -20,
      yMax: 20,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-20);
    expect(layout.yMax).toBe(20);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineArimaSeries[] = [
      ...series,
      {
        id: 'b',
        label: 'B',
        data: [2, 4, 6].map((y, i) => ({ x: i, y })),
      },
    ];
    const layout = computeLineArimaLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(11);
  });

  it('residual segments only include points with prediction', () => {
    const layout = computeLineArimaLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    // index 0 has no prediction -> not in residual segments
    expect(s.residualSegments.every((seg) => seg.index >= 1)).toBe(true);
  });
});

describe('describeLineArimaChart', () => {
  it('no data -> No data', () => {
    expect(describeLineArimaChart(null)).toBe('No data');
    expect(describeLineArimaChart([])).toBe('No data');
  });
  it('summary mentions AR(1), phi, and stationarity', () => {
    const s = describeLineArimaChart([
      {
        id: 'a',
        label: 'A',
        data: [1, 2, 3, 4, 5].map((y, i) => ({ x: i, y })),
      },
    ]);
    expect(s).toContain('ARIMA(1,0,0)');
    expect(s).toContain('AR(1)');
    expect(s).toContain('phi');
    expect(s).toMatch(/stationary|non-stationary/);
  });
  it('handles hidden filter', () => {
    const s = describeLineArimaChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [1, 2, 3].map((y, i) => ({ x: i, y })),
        },
      ],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineArima> render', () => {
  const series: ChartLineArimaSeries[] = [
    {
      id: 'a',
      label: 'Series A',
      data: [1, 3, 2, 5, 4, 6, 5, 8, 7, 9].map((y, i) => ({ x: i, y })),
    },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineArima series={[]} />);
    const root = document.querySelector('[data-section="chart-line-arima"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineArima series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-arima-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders predicted path with data-kind=predicted', () => {
    render(<ChartLineArima series={series} />);
    const predicted = document.querySelector(
      '[data-section="chart-line-arima-predicted-path"]',
    );
    expect(predicted).not.toBeNull();
    expect(predicted!.getAttribute('data-kind')).toBe('predicted');
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineArima series={series} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-arima-raw-path"]'),
    ).toBeNull();
  });

  it('renders forecast segment + dot by default', () => {
    render(<ChartLineArima series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-forecast-segment"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-arima-forecast-dot"]'),
    ).not.toBeNull();
  });

  it('hides forecast when showForecast=false', () => {
    render(<ChartLineArima series={series} showForecast={false} />);
    expect(
      document.querySelector('[data-section="chart-line-arima-forecast"]'),
    ).toBeNull();
  });

  it('omits residual sticks by default and shows via prop', () => {
    const { rerender } = render(<ChartLineArima series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-residual-stick"]',
      ),
    ).toBeNull();
    rerender(<ChartLineArima series={series} showResidualSticks={true} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-arima-residual-stick"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineArima series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-arima-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineArima series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-arima-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows phi + intercept + rmse + stationary', () => {
    render(<ChartLineArima series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-arima-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-arima-badge-phi"]')
        ?.textContent?.startsWith('phi='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-arima-badge-intercept"]')
        ?.textContent?.startsWith('c='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-arima-badge-rmse"]')
        ?.textContent?.startsWith('rmse='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-badge-stationary"]',
      )?.textContent,
    ).toMatch(/^(stationary|non-stationary)$/);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineArima series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-arima-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineArima series={series} />);
    const root = document.querySelector('[data-section="chart-line-arima"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-arima-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-arima-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('ARIMA(1,0,0)');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineArima series={series} />);
    const root = document.querySelector('[data-section="chart-line-arima"]');
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(root!.getAttribute('data-phi')).not.toBeNull();
    expect(root!.getAttribute('data-intercept')).not.toBeNull();
    expect(root!.getAttribute('data-rmse')).not.toBeNull();
    expect(root!.getAttribute('data-stationary')).toMatch(/^(true|false)$/);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineArima series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-arima-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(grp!.getAttribute('data-series-phi')).not.toBeNull();
    expect(grp!.getAttribute('data-series-intercept')).not.toBeNull();
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBeGreaterThan(0);
    expect(
      Number(grp!.getAttribute('data-series-predicted-valid-count')),
    ).toBeGreaterThan(0);
    expect(grp!.getAttribute('data-series-stationary')).toMatch(
      /^(true|false)$/,
    );
  });

  it('tooltip appears on dot hover with raw + predicted + residual + config rows', () => {
    render(<ChartLineArima series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-arima-dot"]',
    );
    // hover a dot that has a prediction (index >= 1)
    const dot = dots[2]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-arima-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-tooltip-predicted"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-tooltip-residual"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-arima-tooltip-config"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-arima-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineArima series={series} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-arima-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-arima-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineArima
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-arima-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
    expect(captured!.pointIndex).toBeGreaterThanOrEqual(0);
  });

  it('legend shows phi + rmse stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineArima
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-arima-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('phi=');
    expect(stats!.textContent).toContain('rmse');
    const btn = document.querySelector(
      '[data-section="chart-line-arima-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineArima series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-arima-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineArima series={series} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-arima"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineArima series={series} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-arima"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineArima ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-arima',
    );
  });

  it('has displayName', () => {
    expect(ChartLineArima.displayName).toBe('ChartLineArima');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineArima series={series} ariaLabel="Custom AR1 label" />,
    );
    const root = document.querySelector('[data-section="chart-line-arima"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom AR1 label');
    const svg = document.querySelector(
      '[data-section="chart-line-arima-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom AR1 label');
  });

  it('xLabel and yLabel render axis text', () => {
    render(<ChartLineArima series={series} xLabel="time" yLabel="value" />);
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-arima-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-arima-y-label',
    );
  });

  it('linear input renders zero-RMSE config badge', () => {
    const linear: ChartLineArimaSeries[] = [
      {
        id: 'lin',
        label: 'Linear',
        data: [1, 2, 3, 4, 5, 6, 7, 8].map((y, i) => ({ x: i, y })),
      },
    ];
    render(<ChartLineArima series={linear} />);
    const rmse = document.querySelector(
      '[data-section="chart-line-arima-badge-rmse"]',
    );
    // RMSE is 0.000 for a perfectly linear AR(1) fit (phi=1, c=1).
    expect(rmse!.textContent).toBe('rmse=0.000');
  });
});
