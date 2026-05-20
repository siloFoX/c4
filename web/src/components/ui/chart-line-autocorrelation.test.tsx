import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineAutocorrelation,
  DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z,
  DEFAULT_CHART_LINE_AUTOCORRELATION_HEIGHT,
  DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG,
  DEFAULT_CHART_LINE_AUTOCORRELATION_PADDING,
  DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE,
  DEFAULT_CHART_LINE_AUTOCORRELATION_TICK_COUNT,
  DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO,
  DEFAULT_CHART_LINE_AUTOCORRELATION_WIDTH,
  classifyLineAutocorrelationSignificance,
  computeLineAutocorrelationConfidenceBound,
  computeLineAutocorrelationFunction,
  computeLineAutocorrelationLayout,
  computeLineAutocorrelationMean,
  describeLineAutocorrelationChart,
  findLineAutocorrelationDominantLag,
  getLineAutocorrelationDefaultColor,
  getLineAutocorrelationFinitePoints,
  normaliseLineAutocorrelationConfidenceZ,
  normaliseLineAutocorrelationMaxLag,
  normaliseLineAutocorrelationPanelRatio,
  runLineAutocorrelation,
  type ChartLineAutocorrelationSeries,
} from './chart-line-autocorrelation';

afterEach(() => {
  cleanup();
});

describe('chart-line-autocorrelation defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_TICK_COUNT).toBeGreaterThan(0);
  });
  it('time panel ratio in (0, 1)', () => {
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO).toBeLessThan(1);
  });
  it('default confidence z is 1.96 (95% CI)', () => {
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z).toBeCloseTo(1.96, 5);
  });
  it('default max lag is positive', () => {
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE.length).toBe(10);
  });
});

describe('getLineAutocorrelationDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE.length;
    expect(getLineAutocorrelationDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0],
    );
    expect(getLineAutocorrelationDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0],
    );
    expect(getLineAutocorrelationDefaultColor(len + 1)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[1],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineAutocorrelationDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0],
    );
    expect(getLineAutocorrelationDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_PALETTE[0],
    );
  });
});

describe('getLineAutocorrelationFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineAutocorrelationFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineAutocorrelationFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineAutocorrelationMaxLag', () => {
  it('defaults for non-finite', () => {
    expect(normaliseLineAutocorrelationMaxLag(NaN)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_MAX_LAG,
    );
  });
  it('floors fractional values', () => {
    expect(normaliseLineAutocorrelationMaxLag(7.9)).toBe(7);
  });
  it('clamps to non-negative', () => {
    expect(normaliseLineAutocorrelationMaxLag(-5)).toBe(0);
  });
  it('caps at N - 1 when sample count is provided', () => {
    expect(normaliseLineAutocorrelationMaxLag(100, 5)).toBe(4);
    expect(normaliseLineAutocorrelationMaxLag(3, 100)).toBe(3);
  });
});

describe('normaliseLineAutocorrelationConfidenceZ', () => {
  it('defaults for non-finite', () => {
    expect(normaliseLineAutocorrelationConfidenceZ(NaN)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_CONFIDENCE_Z,
    );
  });
  it('clamps negative to zero', () => {
    expect(normaliseLineAutocorrelationConfidenceZ(-1)).toBe(0);
  });
  it('passes valid values', () => {
    expect(normaliseLineAutocorrelationConfidenceZ(2.58)).toBeCloseTo(2.58, 5);
  });
});

describe('normaliseLineAutocorrelationPanelRatio', () => {
  it('defaults for non-finite', () => {
    expect(normaliseLineAutocorrelationPanelRatio(NaN)).toBe(
      DEFAULT_CHART_LINE_AUTOCORRELATION_TIME_PANEL_RATIO,
    );
  });
  it('clamps to (0, 1)', () => {
    expect(normaliseLineAutocorrelationPanelRatio(0)).toBe(0.1);
    expect(normaliseLineAutocorrelationPanelRatio(-1)).toBe(0.1);
    expect(normaliseLineAutocorrelationPanelRatio(1)).toBe(0.9);
    expect(normaliseLineAutocorrelationPanelRatio(2)).toBe(0.9);
  });
  it('passes valid values', () => {
    expect(normaliseLineAutocorrelationPanelRatio(0.5)).toBe(0.5);
  });
});

describe('computeLineAutocorrelationMean', () => {
  it('empty returns 0', () => {
    expect(computeLineAutocorrelationMean([])).toBe(0);
    expect(computeLineAutocorrelationMean(null)).toBe(0);
  });
  it('mean of [1,2,3,4,5] = 3', () => {
    expect(computeLineAutocorrelationMean([1, 2, 3, 4, 5])).toBe(3);
  });
  it('skips non-finite values', () => {
    expect(computeLineAutocorrelationMean([1, NaN, 3])).toBe(2);
  });
});

describe('computeLineAutocorrelationFunction', () => {
  it('empty returns empty', () => {
    expect(computeLineAutocorrelationFunction([], 5)).toEqual([]);
    expect(computeLineAutocorrelationFunction(null, 5)).toEqual([]);
  });
  it('ACF(0) is always 1 for a non-constant series', () => {
    const acf = computeLineAutocorrelationFunction([1, 2, 3, 4, 5], 3);
    expect(acf[0]).toBeCloseTo(1, 10);
  });
  it('ACF for constant series: 1 at lag 0, 0 elsewhere', () => {
    const acf = computeLineAutocorrelationFunction([5, 5, 5, 5, 5], 3);
    expect(acf[0]).toBeCloseTo(1, 10);
    expect(acf[1]).toBeCloseTo(0, 10);
    expect(acf[2]).toBeCloseTo(0, 10);
    expect(acf[3]).toBeCloseTo(0, 10);
  });
  it('ACF for a perfect sine wave is approximately cosine of lag', () => {
    // For a sampled sine wave at lag k, the biased ACF approximates
    // cos(2*pi*k/period) * (N - k) / N. With N=40 and period=10:
    const N = 40;
    const period = 10;
    const data = Array.from({ length: N }, (_, i) =>
      Math.sin((2 * Math.PI * i) / period),
    );
    const acf = computeLineAutocorrelationFunction(data, 20);
    // Lag = period -> ACF should be high positive (close to (N - period) / N).
    expect(acf[period]!).toBeGreaterThan(0.5);
    // Lag = period/2 -> ACF should be near minimum (negative).
    expect(acf[period / 2]!).toBeLessThan(-0.3);
  });
  it('returns maxLag + 1 entries when N is large enough', () => {
    const acf = computeLineAutocorrelationFunction([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(acf.length).toBe(6);
  });
  it('caps maxLag at N - 1', () => {
    const acf = computeLineAutocorrelationFunction([1, 2, 3], 100);
    expect(acf.length).toBe(3);
  });
  it('linear input has positive ACF at lag 1', () => {
    const acf = computeLineAutocorrelationFunction(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      5,
    );
    expect(acf[1]!).toBeGreaterThan(0);
  });
  it('all values in [-1, 1] for typical inputs', () => {
    const data = Array.from({ length: 30 }, (_, i) =>
      Math.sin(i) + Math.random() * 0.1,
    );
    const acf = computeLineAutocorrelationFunction(data, 10);
    for (const v of acf) {
      expect(v).toBeLessThanOrEqual(1.0001);
      expect(v).toBeGreaterThanOrEqual(-1.0001);
    }
  });
});

describe('computeLineAutocorrelationConfidenceBound', () => {
  it('returns 1.96 / sqrt(N) by default', () => {
    expect(computeLineAutocorrelationConfidenceBound(100)).toBeCloseTo(
      1.96 / Math.sqrt(100),
      6,
    );
  });
  it('accepts custom z', () => {
    expect(computeLineAutocorrelationConfidenceBound(100, 2.58)).toBeCloseTo(
      2.58 / Math.sqrt(100),
      6,
    );
  });
  it('returns 0 for non-positive N', () => {
    expect(computeLineAutocorrelationConfidenceBound(0)).toBe(0);
    expect(computeLineAutocorrelationConfidenceBound(-5)).toBe(0);
  });
  it('verified canonical value 1.96 / sqrt(50) = 0.2771...', () => {
    expect(computeLineAutocorrelationConfidenceBound(50)).toBeCloseTo(
      0.27718585,
      5,
    );
  });
});

describe('classifyLineAutocorrelationSignificance', () => {
  it('positive-significant when value > bound', () => {
    expect(classifyLineAutocorrelationSignificance(0.5, 0.2)).toBe(
      'positive-significant',
    );
  });
  it('negative-significant when value < -bound', () => {
    expect(classifyLineAutocorrelationSignificance(-0.5, 0.2)).toBe(
      'negative-significant',
    );
  });
  it('insignificant when |value| <= bound', () => {
    expect(classifyLineAutocorrelationSignificance(0.1, 0.2)).toBe(
      'insignificant',
    );
    expect(classifyLineAutocorrelationSignificance(-0.1, 0.2)).toBe(
      'insignificant',
    );
  });
  it('null / non-finite -> insignificant', () => {
    expect(classifyLineAutocorrelationSignificance(null, 0.2)).toBe(
      'insignificant',
    );
    expect(classifyLineAutocorrelationSignificance(NaN, 0.2)).toBe(
      'insignificant',
    );
  });
  it('bound 0 -> insignificant', () => {
    expect(classifyLineAutocorrelationSignificance(0.5, 0)).toBe(
      'insignificant',
    );
  });
});

describe('findLineAutocorrelationDominantLag', () => {
  it('empty / single returns lag 0', () => {
    expect(findLineAutocorrelationDominantLag([])).toEqual({ lag: 0, value: 0 });
    expect(findLineAutocorrelationDominantLag([1])).toEqual({ lag: 0, value: 0 });
  });
  it('picks the largest |ACF| at lag >= 1', () => {
    const acf = [1, 0.2, 0.7, -0.9, 0.5];
    expect(findLineAutocorrelationDominantLag(acf)).toEqual({
      lag: 3,
      value: -0.9,
    });
  });
  it('returns positive value if the largest is positive', () => {
    const acf = [1, 0.8, -0.3, 0.1];
    expect(findLineAutocorrelationDominantLag(acf)).toEqual({
      lag: 1,
      value: 0.8,
    });
  });
  it('skips non-finite values', () => {
    const acf = [1, NaN, 0.5];
    expect(findLineAutocorrelationDominantLag(acf)).toEqual({
      lag: 2,
      value: 0.5,
    });
  });
});

describe('runLineAutocorrelation', () => {
  it('null input -> all zero/empty', () => {
    const r = runLineAutocorrelation(null);
    expect(r.samples).toEqual([]);
    expect(r.acf).toEqual([]);
    expect(r.lags).toEqual([]);
    expect(r.totalSamples).toBe(0);
    expect(r.dominantLag).toBe(0);
  });
  it('returns ACF(0) = 1 for any non-empty input', () => {
    const r = runLineAutocorrelation(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 3 },
      ],
      { maxLag: 2 },
    );
    expect(r.acf[0]).toBeCloseTo(1, 10);
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineAutocorrelation([
      { x: 3, y: 4 },
      { x: NaN, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([1, 2, 3]);
  });
  it('computes mean correctly', () => {
    const r = runLineAutocorrelation([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
    expect(r.mean).toBeCloseTo(2, 10);
  });
  it('detects periodic structure for a sine wave', () => {
    const N = 60;
    const period = 12;
    const data = Array.from({ length: N }, (_, i) => ({
      x: i,
      y: Math.sin((2 * Math.PI * i) / period),
    }));
    const r = runLineAutocorrelation(data, { maxLag: 30 });
    // The biased ACF estimator picks the lag with the largest |ACF|.
    // For a sine wave with period P, ACF(k) ~ cos(2*pi*k/P) * (N-k)/N
    // so the peaks of |ACF| are at multiples of P/2 (alternating sign).
    // The first |ACF| peak that wins under the biased weighting is at
    // P/2 (first negative trough), since the (N-k)/N factor reduces
    // ACF magnitude at higher lags.
    expect([period / 2 - 1, period / 2, period / 2 + 1, period - 1, period, period + 1]).toContain(
      r.dominantLag,
    );
    expect(Math.abs(r.dominantValue)).toBeGreaterThan(0.5);
  });
  it('reports confidence bound = 1.96 / sqrt(N) by default', () => {
    const r = runLineAutocorrelation(
      Array.from({ length: 50 }, (_, i) => ({ x: i, y: i })),
      { maxLag: 5 },
    );
    expect(r.confidenceBound).toBeCloseTo(1.96 / Math.sqrt(50), 6);
  });
  it('counts significant lags', () => {
    const N = 60;
    const data = Array.from({ length: N }, (_, i) => ({
      x: i,
      y: Math.sin((2 * Math.PI * i) / 12),
    }));
    const r = runLineAutocorrelation(data, { maxLag: 25 });
    expect(r.significantCount).toBeGreaterThan(0);
  });
  it('lags array carries significance per entry', () => {
    const r = runLineAutocorrelation(
      Array.from({ length: 30 }, (_, i) => ({ x: i, y: i % 2 })),
      { maxLag: 5 },
    );
    expect(r.lags[0]!.significance).toBe('insignificant'); // lag 0 always
    expect(r.lags.length).toBe(6);
  });
});

describe('computeLineAutocorrelationLayout', () => {
  const series: ChartLineAutocorrelationSeries[] = [
    {
      id: 'a',
      label: 'A',
      data: Array.from({ length: 30 }, (_, i) => ({
        x: i,
        y: Math.sin((2 * Math.PI * i) / 6),
      })),
    },
  ];

  it('empty series returns empty', () => {
    const layout = computeLineAutocorrelationLayout({
      series: [],
      width: 600,
      height: 200,
      padding: 30,
    });
    expect(layout.series.length).toBe(0);
  });

  it('degenerate canvas returns empty', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 50,
      height: 200,
      padding: 30,
    });
    expect(layout.series.length).toBe(0);
  });

  it('all hidden returns empty', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      hiddenSeries: ['a'],
      width: 600,
      height: 200,
      padding: 30,
    });
    expect(layout.series.length).toBe(0);
  });

  it('builds time + acf panels side by side', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
    });
    expect(layout.timePanel.width).toBeGreaterThan(0);
    expect(layout.acfPanel.width).toBeGreaterThan(0);
    expect(layout.acfPanel.x).toBeGreaterThan(layout.timePanel.x);
  });

  it('series carries time path + lag positions', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
      maxLag: 15,
    });
    expect(layout.series[0]!.timePath).toContain('M ');
    expect(layout.series[0]!.lags.length).toBe(16);
    expect(layout.series[0]!.lags[0]!.value).toBeCloseTo(1, 10);
  });

  it('exposes dominant lag and confidence bound', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
      maxLag: 12,
    });
    expect(layout.series[0]!.dominantLag).toBeGreaterThanOrEqual(1);
    expect(layout.series[0]!.confidenceBound).toBeGreaterThan(0);
  });

  it('per-series maxLag override beats chart-level', () => {
    const layout = computeLineAutocorrelationLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: series[0]!.data,
          maxLag: 5,
        },
      ],
      width: 600,
      height: 200,
      padding: 30,
      maxLag: 20,
    });
    expect(layout.series[0]!.effectiveLag).toBe(5);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
      xMin: -10,
      xMax: 100,
      yMin: -5,
      yMax: 5,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(100);
    expect(layout.yMin).toBe(-5);
    expect(layout.yMax).toBe(5);
  });

  it('marks dominant lag in lag layout', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
      maxLag: 15,
    });
    const dominantLagId = layout.series[0]!.dominantLag;
    const dominantLag = layout.series[0]!.lags.find(
      (l) => l.lag === dominantLagId,
    );
    expect(dominantLag?.isDominant).toBe(true);
    // Non-dominant lags are not marked dominant
    const nonDominant = layout.series[0]!.lags.find(
      (l) => l.lag !== dominantLagId && l.lag > 0,
    );
    expect(nonDominant?.isDominant).toBe(false);
  });

  it('ACF y axis ticks are -1, -0.5, 0, 0.5, 1', () => {
    const layout = computeLineAutocorrelationLayout({
      series,
      width: 600,
      height: 200,
      padding: 30,
    });
    expect(layout.acfYTicks).toEqual([-1, -0.5, 0, 0.5, 1]);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineAutocorrelationSeries[] = [
      ...series,
      {
        id: 'b',
        label: 'B',
        data: [
          { x: 0, y: 1 },
          { x: 1, y: 2 },
        ],
      },
    ];
    const layout = computeLineAutocorrelationLayout({
      series: multi,
      width: 600,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(32);
  });
});

describe('describeLineAutocorrelationChart', () => {
  it('no data returns No data', () => {
    expect(describeLineAutocorrelationChart(null)).toBe('No data');
    expect(describeLineAutocorrelationChart([])).toBe('No data');
  });
  it('summary mentions dominant lag and significant count', () => {
    const s = describeLineAutocorrelationChart([
      {
        id: 'a',
        label: 'A',
        data: Array.from({ length: 30 }, (_, i) => ({
          x: i,
          y: Math.sin((2 * Math.PI * i) / 6),
        })),
      },
    ]);
    expect(s).toContain('autocorrelation function');
    expect(s).toContain('dominant lag');
    expect(s).toContain('significant lags');
  });
  it('handles hidden filter', () => {
    const s = describeLineAutocorrelationChart(
      [
        {
          id: 'a',
          label: 'A',
          data: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineAutocorrelation> render', () => {
  const series: ChartLineAutocorrelationSeries[] = [
    {
      id: 'a',
      label: 'Series A',
      data: Array.from({ length: 30 }, (_, i) => ({
        x: i,
        y: Math.sin((2 * Math.PI * i) / 6),
      })),
    },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineAutocorrelation series={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-autocorrelation"]',
    );
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders time path with data-kind=time', () => {
    render(<ChartLineAutocorrelation series={series} />);
    const path = document.querySelector(
      '[data-section="chart-line-autocorrelation-time-path"]',
    );
    expect(path).not.toBeNull();
    expect(path!.getAttribute('data-kind')).toBe('time');
  });

  it('renders one lag stick per lag', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={10} />);
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-autocorrelation-lag-stick"]',
    );
    // Lags 0..10 -> 11 sticks per series
    expect(sticks.length).toBe(11);
  });

  it('renders lag dots that include lag 0 with value ~1', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={5} />);
    const lag0 = document.querySelector(
      '[data-section="chart-line-autocorrelation-lag-dot"][data-lag="0"]',
    );
    expect(lag0).not.toBeNull();
    expect(Number(lag0!.getAttribute('data-acf'))).toBeCloseTo(1, 5);
  });

  it('marks dominant lag with is-dominant=true', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={15} />);
    const dominant = document.querySelector(
      '[data-section="chart-line-autocorrelation-lag-dot"][data-is-dominant="true"]',
    );
    expect(dominant).not.toBeNull();
    expect(Number(dominant!.getAttribute('data-lag'))).toBeGreaterThanOrEqual(1);
  });

  it('renders confidence band by default and hides via prop', () => {
    const { rerender } = render(
      <ChartLineAutocorrelation series={series} maxLag={10} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-confidence-band"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineAutocorrelation
        series={series}
        maxLag={10}
        showConfidenceBand={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-confidence-band"]',
      ),
    ).toBeNull();
  });

  it('config badge shows max lag + dominant lag + CI + significant count', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={10} />);
    const badge = document.querySelector(
      '[data-section="chart-line-autocorrelation-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-badge-max-lag"]',
      )?.textContent?.startsWith('max='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-badge-dominant-lag"]',
      )?.textContent?.startsWith('dom k='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-badge-confidence-bound"]',
      )?.textContent?.startsWith('CI='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-badge-significant-count"]',
      )?.textContent?.startsWith('sig='),
    ).toBe(true);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(
      <ChartLineAutocorrelation
        series={series}
        showConfigBadge={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-badge"]',
      ),
    ).toBeNull();
  });

  it('shows dominant marker by default and hides via prop', () => {
    const { rerender } = render(
      <ChartLineAutocorrelation series={series} maxLag={10} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-dominant-marker"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineAutocorrelation
        series={series}
        maxLag={10}
        showDominantMarker={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-dominant-marker"]',
      ),
    ).toBeNull();
  });

  it('renders time dots when showDots=true', () => {
    const { rerender } = render(<ChartLineAutocorrelation series={series} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-autocorrelation-time-dot"]',
      ).length,
    ).toBe(0);
    rerender(<ChartLineAutocorrelation series={series} showDots={true} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-autocorrelation-time-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineAutocorrelation series={series} />);
    const root = document.querySelector(
      '[data-section="chart-line-autocorrelation"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-autocorrelation-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-autocorrelation-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('autocorrelation');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={15} />);
    const root = document.querySelector(
      '[data-section="chart-line-autocorrelation"]',
    );
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(Number(root!.getAttribute('data-max-lag'))).toBe(15);
    expect(Number(root!.getAttribute('data-confidence-bound'))).toBeGreaterThan(0);
    expect(
      Number(root!.getAttribute('data-dominant-lag')),
    ).toBeGreaterThanOrEqual(1);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={10} />);
    const grp = document.querySelector(
      '[data-section="chart-line-autocorrelation-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-max-lag'))).toBe(10);
    expect(
      Number(grp!.getAttribute('data-series-confidence-bound')),
    ).toBeGreaterThan(0);
    expect(
      Number(grp!.getAttribute('data-series-total-samples')),
    ).toBeGreaterThan(0);
  });

  it('lag tooltip appears on hover and shows acf + significance', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={10} />);
    const dot = document.querySelector(
      '[data-section="chart-line-autocorrelation-lag-dot"][data-lag="1"]',
    );
    expect(dot).not.toBeNull();
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip"][data-tooltip-kind="lag"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip-lag"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip-acf"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip-significance"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip"]',
      ),
    ).toBeNull();
  });

  it('time tooltip appears on time dot hover with x + y', () => {
    render(
      <ChartLineAutocorrelation
        series={series}
        maxLag={5}
        showDots={true}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-autocorrelation-time-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip"][data-tooltip-kind="time"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip-x"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip-y"]',
      ),
    ).not.toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineAutocorrelation
        series={series}
        showTooltip={false}
        maxLag={5}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-autocorrelation-lag-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires for time dots', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineAutocorrelation
        series={series}
        showDots={true}
        maxLag={5}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-autocorrelation-time-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('onLagClick fires for lag dots', () => {
    let captured: { seriesId: string; lag: number } | null = null;
    render(
      <ChartLineAutocorrelation
        series={series}
        maxLag={5}
        onLagClick={({ series: s, lag: l }) => {
          captured = { seriesId: s.id, lag: l.lag };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-autocorrelation-lag-dot"][data-lag="2"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
    expect(captured!.lag).toBe(2);
  });

  it('legend shows dominant lag + acf + significant count', () => {
    render(<ChartLineAutocorrelation series={series} maxLag={12} />);
    const stats = document.querySelector(
      '[data-section="chart-line-autocorrelation-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('dom k=');
    expect(stats!.textContent).toContain('ACF');
    expect(stats!.textContent).toContain('sig');
  });

  it('legend toggles series uncontrolled', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineAutocorrelation
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const btn = document.querySelector(
      '[data-section="chart-line-autocorrelation-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(
      <ChartLineAutocorrelation series={series} showLegend={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-autocorrelation-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineAutocorrelation series={series} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-autocorrelation"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineAutocorrelation series={series} animate={false} />);
    const root2 = document.querySelector(
      '[data-section="chart-line-autocorrelation"]',
    );
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAutocorrelation ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-autocorrelation',
    );
  });

  it('has displayName', () => {
    expect(ChartLineAutocorrelation.displayName).toBe(
      'ChartLineAutocorrelation',
    );
  });

  it('xLabel, yLabel, lagLabel, acfLabel render', () => {
    render(
      <ChartLineAutocorrelation
        series={series}
        xLabel="time"
        yLabel="value"
        lagLabel="lag"
        acfLabel="autocorr"
      />,
    );
    expect(
      screen.getByText('time').getAttribute('data-section'),
    ).toBe('chart-line-autocorrelation-x-label');
    expect(
      screen.getByText('value').getAttribute('data-section'),
    ).toBe('chart-line-autocorrelation-y-label');
    expect(
      screen.getByText('lag').getAttribute('data-section'),
    ).toBe('chart-line-autocorrelation-lag-label');
    expect(
      screen.getByText('autocorr').getAttribute('data-section'),
    ).toBe('chart-line-autocorrelation-acf-label');
  });
});
