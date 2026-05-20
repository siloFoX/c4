import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineHoltWinters,
  DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA,
  DEFAULT_CHART_LINE_HOLTWINTERS_BETA,
  DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON,
  DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA,
  DEFAULT_CHART_LINE_HOLTWINTERS_HEIGHT,
  DEFAULT_CHART_LINE_HOLTWINTERS_PADDING,
  DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE,
  DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH,
  DEFAULT_CHART_LINE_HOLTWINTERS_TICK_COUNT,
  DEFAULT_CHART_LINE_HOLTWINTERS_WIDTH,
  classifyLineHoltWintersResidualSign,
  computeLineHoltWintersLayout,
  describeLineHoltWintersChart,
  fitLineHoltWinters,
  forecastLineHoltWinters,
  getLineHoltWintersDefaultColor,
  getLineHoltWintersFinitePoints,
  normaliseLineHoltWintersForecastHorizon,
  normaliseLineHoltWintersSeasonLength,
  normaliseLineHoltWintersSmoothingFactor,
  runLineHoltWinters,
  type ChartLineHoltWintersSeries,
} from './chart-line-holtwinters';

afterEach(() => {
  cleanup();
});

// A purely seasonal series with no trend: period 4, repeats exactly.
const PERIODIC = [
  10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40,
];
const CONSTANT = [5, 5, 5, 5, 5, 5, 5, 5];

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-holtwinters defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_TICK_COUNT).toBeGreaterThan(0);
  });
  it('smoothing factors in [0, 1]', () => {
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_ALPHA).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_BETA).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_GAMMA).toBeGreaterThanOrEqual(0);
  });
  it('season length and forecast horizon positive', () => {
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH).toBeGreaterThanOrEqual(
      2,
    );
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE.length).toBe(10);
  });
});

describe('getLineHoltWintersDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE.length;
    expect(getLineHoltWintersDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0],
    );
    expect(getLineHoltWintersDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0],
    );
    expect(getLineHoltWintersDefaultColor(len + 3)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[3],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineHoltWintersDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0],
    );
    expect(getLineHoltWintersDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_PALETTE[0],
    );
  });
});

describe('getLineHoltWintersFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineHoltWintersFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineHoltWintersFinitePoints(null)).toEqual([]);
    expect(getLineHoltWintersFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineHoltWintersSmoothingFactor', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineHoltWintersSmoothingFactor(NaN, 0.4)).toBe(0.4);
    expect(normaliseLineHoltWintersSmoothingFactor(undefined, 0.7)).toBe(0.7);
  });
  it('clamps to [0, 1]', () => {
    expect(normaliseLineHoltWintersSmoothingFactor(-1, 0.5)).toBe(0);
    expect(normaliseLineHoltWintersSmoothingFactor(2, 0.5)).toBe(1);
  });
  it('passes valid values', () => {
    expect(normaliseLineHoltWintersSmoothingFactor(0.35, 0.5)).toBe(0.35);
    expect(normaliseLineHoltWintersSmoothingFactor(0, 0.5)).toBe(0);
    expect(normaliseLineHoltWintersSmoothingFactor(1, 0.5)).toBe(1);
  });
});

describe('normaliseLineHoltWintersSeasonLength', () => {
  it('falls back to default for non-finite', () => {
    expect(normaliseLineHoltWintersSeasonLength(NaN)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_SEASON_LENGTH,
    );
  });
  it('clamps to minimum 2', () => {
    expect(normaliseLineHoltWintersSeasonLength(0)).toBe(2);
    expect(normaliseLineHoltWintersSeasonLength(1)).toBe(2);
    expect(normaliseLineHoltWintersSeasonLength(-5)).toBe(2);
  });
  it('floors fractional values', () => {
    expect(normaliseLineHoltWintersSeasonLength(7.8)).toBe(7);
  });
  it('passes valid values', () => {
    expect(normaliseLineHoltWintersSeasonLength(12)).toBe(12);
  });
});

describe('normaliseLineHoltWintersForecastHorizon', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineHoltWintersForecastHorizon(NaN)).toBe(
      DEFAULT_CHART_LINE_HOLTWINTERS_FORECAST_HORIZON,
    );
  });
  it('clamps to non-negative', () => {
    expect(normaliseLineHoltWintersForecastHorizon(-3)).toBe(0);
  });
  it('caps very large horizons', () => {
    expect(normaliseLineHoltWintersForecastHorizon(99999)).toBe(366);
  });
  it('floors fractional values', () => {
    expect(normaliseLineHoltWintersForecastHorizon(6.9)).toBe(6);
  });
});

describe('classifyLineHoltWintersResidualSign', () => {
  it('positive / negative / zero', () => {
    expect(classifyLineHoltWintersResidualSign(1)).toBe('positive');
    expect(classifyLineHoltWintersResidualSign(-1)).toBe('negative');
    expect(classifyLineHoltWintersResidualSign(0)).toBe('zero');
  });
  it('null and non-finite -> zero', () => {
    expect(classifyLineHoltWintersResidualSign(null)).toBe('zero');
    expect(classifyLineHoltWintersResidualSign(NaN)).toBe('zero');
    expect(classifyLineHoltWintersResidualSign(Infinity)).toBe('zero');
  });
});

describe('fitLineHoltWinters', () => {
  it('empty / null -> ok=false', () => {
    expect(fitLineHoltWinters(null).ok).toBe(false);
    expect(fitLineHoltWinters([]).ok).toBe(false);
  });
  it('too few values (N < m+1) -> ok=false', () => {
    // m default 4 -> need at least 5 values
    expect(fitLineHoltWinters([1, 2, 3, 4]).ok).toBe(false);
    expect(fitLineHoltWinters([1, 2, 3, 4, 5]).ok).toBe(true);
  });
  it('initial level is the mean of the first season', () => {
    const fit = fitLineHoltWinters([2, 4, 6, 8, 10, 12, 14, 16], {
      seasonLength: 4,
    });
    // mean(2,4,6,8) = 5
    expect(fit.initialLevel).toBeCloseTo(5, 10);
  });
  it('initial seasonals sum to zero (additive)', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    const sum = fit.initialSeasonals.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 8);
  });
  it('initial seasonals for the periodic fixture are [-15,-5,5,15]', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    expect(fit.initialSeasonals[0]).toBeCloseTo(-15, 8);
    expect(fit.initialSeasonals[1]).toBeCloseTo(-5, 8);
    expect(fit.initialSeasonals[2]).toBeCloseTo(5, 8);
    expect(fit.initialSeasonals[3]).toBeCloseTo(15, 8);
  });
  it('initial trend is zero when fewer than two full seasons', () => {
    // 7 values, m = 4 -> N < 2m -> trend init 0
    const fit = fitLineHoltWinters([0, 1, 2, 3, 4, 5, 6], {
      seasonLength: 4,
    });
    expect(fit.initialTrend).toBeCloseTo(0, 10);
  });
  it('initial trend uses per-season slope when two full seasons exist', () => {
    // y = 0..7, m = 4, N = 8 = 2m. initialTrend = mean per-step slope:
    //   sum_{i=0..3} (y[4+i] - y[i]) / 4, all / 4
    //   = sum(4,4,4,4)/4 / 4 = 16/4/4 = 1
    const fit = fitLineHoltWinters([0, 1, 2, 3, 4, 5, 6, 7], {
      seasonLength: 4,
    });
    expect(fit.initialTrend).toBeCloseTo(1, 8);
  });
  it('first m fitted values are null', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    for (let i = 0; i < 4; i += 1) {
      expect(fit.fitted[i]).toBeNull();
    }
    expect(fit.fitted[4]).not.toBeNull();
  });
  it('periodic-no-trend series is fitted exactly', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    for (let t = 4; t < PERIODIC.length; t += 1) {
      expect(fit.fitted[t]!).toBeCloseTo(PERIODIC[t]!, 6);
    }
  });
  it('constant series is fitted exactly', () => {
    const fit = fitLineHoltWinters(CONSTANT, { seasonLength: 4 });
    for (let t = 4; t < CONSTANT.length; t += 1) {
      expect(fit.fitted[t]!).toBeCloseTo(5, 8);
    }
  });
  it('clamps the smoothing factors and season length', () => {
    const fit = fitLineHoltWinters(PERIODIC, {
      alpha: 5,
      beta: -1,
      gamma: 2,
      seasonLength: 1,
    });
    expect(fit.alpha).toBe(1);
    expect(fit.beta).toBe(0);
    expect(fit.gamma).toBe(1);
    expect(fit.seasonLength).toBe(2);
  });
  it('skips non-finite values when fitting', () => {
    const clean = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    const withNaN = fitLineHoltWinters(
      [10, 20, NaN, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40],
      { seasonLength: 4 },
    );
    // NaN dropped -> identical finite sequence
    expect(withNaN.initialLevel).toBeCloseTo(clean.initialLevel, 8);
  });
});

describe('forecastLineHoltWinters', () => {
  it('returns [] when the fit failed', () => {
    const fit = fitLineHoltWinters([1, 2, 3], { seasonLength: 4 });
    expect(forecastLineHoltWinters(fit, 4)).toEqual([]);
  });
  it('returns [] for horizon 0', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    expect(forecastLineHoltWinters(fit, 0)).toEqual([]);
  });
  it('periodic-no-trend series forecasts the continuing pattern', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    const forecast = forecastLineHoltWinters(fit, 4);
    // N = 12, m = 4. h=1 -> index 12 mod 4 = 0 -> seasonal 0 -> 10, etc.
    expect(forecast.length).toBe(4);
    expect(forecast[0]!).toBeCloseTo(10, 6);
    expect(forecast[1]!).toBeCloseTo(20, 6);
    expect(forecast[2]!).toBeCloseTo(30, 6);
    expect(forecast[3]!).toBeCloseTo(40, 6);
  });
  it('constant series forecasts the constant', () => {
    const fit = fitLineHoltWinters(CONSTANT, { seasonLength: 4 });
    const forecast = forecastLineHoltWinters(fit, 3);
    for (const v of forecast) {
      expect(v).toBeCloseTo(5, 6);
    }
  });
  it('honours the horizon length', () => {
    const fit = fitLineHoltWinters(PERIODIC, { seasonLength: 4 });
    expect(forecastLineHoltWinters(fit, 7).length).toBe(7);
  });
});

describe('runLineHoltWinters', () => {
  it('empty / null -> empty samples, ok=false', () => {
    const r = runLineHoltWinters(null);
    expect(r.samples).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.forecast).toEqual([]);
  });
  it('periodic-no-trend: fitted equals raw, RMSE ~ 0', () => {
    const r = runLineHoltWinters(toPoints(PERIODIC), { seasonLength: 4 });
    expect(r.ok).toBe(true);
    for (let i = 4; i < r.samples.length; i += 1) {
      expect(r.samples[i]!.fitted!).toBeCloseTo(r.samples[i]!.raw, 6);
    }
    expect(r.rmse).toBeCloseTo(0, 6);
  });
  it('constant series: fitted flat, RMSE ~ 0', () => {
    const r = runLineHoltWinters(toPoints(CONSTANT), { seasonLength: 4 });
    expect(r.rmse).toBeCloseTo(0, 6);
  });
  it('first m samples have null fitted', () => {
    const r = runLineHoltWinters(toPoints(PERIODIC), { seasonLength: 4 });
    for (let i = 0; i < 4; i += 1) {
      expect(r.samples[i]!.fitted).toBeNull();
    }
  });
  it('sorts ascending and drops non-finite', () => {
    const shuffled = [
      { x: 5, y: 20 },
      { x: NaN, y: 0 },
      { x: 1, y: 20 },
      { x: 0, y: 10 },
      { x: 3, y: 40 },
      { x: 2, y: 30 },
      { x: 4, y: 10 },
    ];
    const r = runLineHoltWinters(shuffled, { seasonLength: 4 });
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('produces a multi-step forecast with horizon points', () => {
    const r = runLineHoltWinters(toPoints(PERIODIC), {
      seasonLength: 4,
      forecastHorizon: 4,
    });
    expect(r.forecast.length).toBe(4);
    expect(r.forecast[0]!.horizon).toBe(1);
    expect(r.forecast[0]!.value).toBeCloseTo(10, 6);
    // forecast x continues the spacing (step 1, lastX 11 -> 12, 13, ...)
    expect(r.forecast[0]!.x).toBeCloseTo(12, 6);
    expect(r.forecast[3]!.x).toBeCloseTo(15, 6);
  });
  it('tracks fitted valid count (N - m)', () => {
    const r = runLineHoltWinters(toPoints(PERIODIC), { seasonLength: 4 });
    // 12 points, m = 4 -> 8 fitted values
    expect(r.fittedValidCount).toBe(8);
  });
  it('counts residual signs', () => {
    const r = runLineHoltWinters(
      toPoints([10, 20, 30, 40, 12, 18, 33, 38, 9, 22, 28, 41]),
      { seasonLength: 4 },
    );
    const total =
      r.positiveResidualCount +
      r.negativeResidualCount +
      r.zeroResidualCount;
    expect(total).toBe(r.samples.length);
  });
  it('exposes alpha, beta, gamma, seasonLength', () => {
    const r = runLineHoltWinters(toPoints(PERIODIC), {
      alpha: 0.6,
      beta: 0.2,
      gamma: 0.4,
      seasonLength: 4,
    });
    expect(r.alpha).toBe(0.6);
    expect(r.beta).toBe(0.2);
    expect(r.gamma).toBe(0.4);
    expect(r.seasonLength).toBe(4);
  });
});

describe('computeLineHoltWintersLayout', () => {
  const series: ChartLineHoltWintersSeries[] = [
    { id: 'a', label: 'A', data: toPoints(PERIODIC) },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineHoltWintersLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw + fitted paths', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series[0]!.rawPath).toContain('M ');
    expect(layout.series[0]!.fittedPath).toContain('M ');
  });

  it('exposes alpha, beta, gamma, season length, level, trend', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
    });
    const s = layout.series[0]!;
    expect(typeof s.alpha).toBe('number');
    expect(typeof s.beta).toBe('number');
    expect(typeof s.gamma).toBe('number');
    expect(s.seasonLength).toBe(4);
    expect(typeof s.level).toBe('number');
    expect(typeof s.trend).toBe('number');
    expect(s.ok).toBe(true);
  });

  it('produces forecast points with projected coordinates', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
      forecastHorizon: 4,
    });
    const s = layout.series[0]!;
    expect(s.forecastPoints.length).toBe(4);
    expect(s.forecastPath).toContain('M ');
    for (const f of s.forecastPoints) {
      expect(Number.isFinite(f.px)).toBe(true);
      expect(Number.isFinite(f.py)).toBe(true);
    }
  });

  it('forecastHorizon 0 yields no forecast points', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
      forecastHorizon: 0,
    });
    expect(layout.series[0]!.forecastPoints.length).toBe(0);
  });

  it('per-series seasonLength override beats chart-level', () => {
    const layout = computeLineHoltWintersLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(PERIODIC),
          seasonLength: 6,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
    });
    expect(layout.series[0]!.seasonLength).toBe(6);
  });

  it('per-series alpha override beats chart-level', () => {
    const layout = computeLineHoltWintersLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(PERIODIC),
          alpha: 0.9,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      alpha: 0.2,
    });
    expect(layout.series[0]!.alpha).toBe(0.9);
  });

  it('short series renders raw path but fit not ok', () => {
    const layout = computeLineHoltWintersLayout({
      series: [
        {
          id: 'short',
          label: 'Short',
          data: toPoints([1, 2, 3]),
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      seasonLength: 4,
    });
    expect(layout.ok).toBe(true);
    expect(layout.series[0]!.ok).toBe(false);
    expect(layout.series[0]!.rawPath).toContain('M ');
    expect(layout.series[0]!.fittedPath).toBe('');
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineHoltWintersLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -10,
      xMax: 100,
      yMin: -50,
      yMax: 80,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(100);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(80);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineHoltWintersSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CONSTANT) },
    ];
    const layout = computeLineHoltWintersLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(PERIODIC.length + CONSTANT.length);
  });
});

describe('describeLineHoltWintersChart', () => {
  it('no data -> No data', () => {
    expect(describeLineHoltWintersChart(null)).toBe('No data');
    expect(describeLineHoltWintersChart([])).toBe('No data');
  });
  it('summary mentions Holt-Winters and the smoothing factors', () => {
    const s = describeLineHoltWintersChart([
      { id: 'a', label: 'A', data: toPoints(PERIODIC) },
    ]);
    expect(s).toContain('Holt-Winters');
    expect(s).toContain('alpha');
    expect(s).toContain('beta');
    expect(s).toContain('gamma');
    expect(s).toContain('season');
  });
  it('handles hidden filter', () => {
    const s = describeLineHoltWintersChart(
      [{ id: 'a', label: 'A', data: toPoints(PERIODIC) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineHoltWinters> render', () => {
  const series: ChartLineHoltWintersSeries[] = [
    { id: 'a', label: 'Series A', data: toPoints(PERIODIC) },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineHoltWinters series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineHoltWinters series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-holtwinters-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders fitted path with data-kind=fitted', () => {
    render(<ChartLineHoltWinters series={series} />);
    const fitted = document.querySelector(
      '[data-section="chart-line-holtwinters-fitted-path"]',
    );
    expect(fitted).not.toBeNull();
    expect(fitted!.getAttribute('data-kind')).toBe('fitted');
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineHoltWinters series={series} showRaw={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-raw-path"]',
      ),
    ).toBeNull();
  });

  it('renders forecast path + dots by default', () => {
    render(<ChartLineHoltWinters series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-forecast-path"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-holtwinters-forecast-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('hides forecast when showForecast=false', () => {
    render(<ChartLineHoltWinters series={series} showForecast={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-forecast"]',
      ),
    ).toBeNull();
  });

  it('omits residual sticks by default and shows via prop', () => {
    const { rerender } = render(<ChartLineHoltWinters series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-residual-stick"]',
      ),
    ).toBeNull();
    rerender(
      <ChartLineHoltWinters series={series} showResidualSticks={true} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-holtwinters-residual-stick"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineHoltWinters series={series} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-holtwinters-dot"]',
      ).length,
    ).toBe(0);
    rerender(<ChartLineHoltWinters series={series} showDots={true} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-holtwinters-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows alpha + beta + gamma + season + rmse', () => {
    render(<ChartLineHoltWinters series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-holtwinters-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-holtwinters-badge-alpha"]')
        ?.textContent?.startsWith('a='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-holtwinters-badge-beta"]')
        ?.textContent?.startsWith('b='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-holtwinters-badge-gamma"]')
        ?.textContent?.startsWith('g='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-holtwinters-badge-season"]')
        ?.textContent?.startsWith('m='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-holtwinters-badge-rmse"]')
        ?.textContent?.startsWith('rmse='),
    ).toBe(true);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineHoltWinters series={series} showConfigBadge={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-badge"]',
      ),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineHoltWinters series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-holtwinters-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-holtwinters-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Holt-Winters');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineHoltWinters series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(root!.getAttribute('data-alpha')).not.toBeNull();
    expect(root!.getAttribute('data-beta')).not.toBeNull();
    expect(root!.getAttribute('data-gamma')).not.toBeNull();
    expect(Number(root!.getAttribute('data-season-length'))).toBe(4);
    expect(root!.getAttribute('data-fit-ok')).toBe('true');
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineHoltWinters series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-holtwinters-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(grp!.getAttribute('data-series-alpha')).not.toBeNull();
    expect(Number(grp!.getAttribute('data-series-season-length'))).toBe(4);
    expect(grp!.getAttribute('data-series-fit-ok')).toBe('true');
    expect(
      Number(grp!.getAttribute('data-series-fitted-valid-count')),
    ).toBeGreaterThan(0);
    expect(
      Number(grp!.getAttribute('data-series-forecast-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip appears on dot hover with raw + fitted + residual + config rows', () => {
    render(<ChartLineHoltWinters series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-holtwinters-dot"]',
    );
    // hover a dot with a fitted value (index >= season length 4)
    const dot = dots[6]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip-fitted"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip-residual"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip-config"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineHoltWinters
        series={series}
        showDots={true}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-holtwinters-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineHoltWinters
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-holtwinters-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows season + rmse stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineHoltWinters
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-holtwinters-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('m=');
    expect(stats!.textContent).toContain('rmse');
    const btn = document.querySelector(
      '[data-section="chart-line-holtwinters-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineHoltWinters series={series} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-holtwinters-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineHoltWinters series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineHoltWinters series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHoltWinters ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-holtwinters',
    );
  });

  it('has displayName', () => {
    expect(ChartLineHoltWinters.displayName).toBe('ChartLineHoltWinters');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineHoltWinters series={series} ariaLabel="Custom HW label" />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-holtwinters"]',
    );
    expect(root!.getAttribute('aria-label')).toBe('Custom HW label');
    const svg = document.querySelector(
      '[data-section="chart-line-holtwinters-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom HW label');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineHoltWinters series={series} xLabel="time" yLabel="value" />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-holtwinters-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-holtwinters-y-label',
    );
  });

  it('periodic-no-trend input renders zero-RMSE config badge', () => {
    render(<ChartLineHoltWinters series={series} />);
    const rmse = document.querySelector(
      '[data-section="chart-line-holtwinters-badge-rmse"]',
    );
    // RMSE rounds to 0.00 for a perfectly periodic Holt-Winters fit.
    expect(rmse!.textContent).toBe('rmse=0.00');
  });
});
