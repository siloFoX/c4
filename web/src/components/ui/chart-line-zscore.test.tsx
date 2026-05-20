import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineZscore,
  DEFAULT_CHART_LINE_ZSCORE_HEIGHT,
  DEFAULT_CHART_LINE_ZSCORE_PADDING,
  DEFAULT_CHART_LINE_ZSCORE_PALETTE,
  DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL,
  DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO,
  DEFAULT_CHART_LINE_ZSCORE_TICK_COUNT,
  DEFAULT_CHART_LINE_ZSCORE_WINDOW,
  DEFAULT_CHART_LINE_ZSCORE_WIDTH,
  classifyLineZscoreBand,
  computeLineZscoreLayout,
  computeRollingZScores,
  describeLineZscoreChart,
  getLineZscoreDefaultColor,
  getLineZscoreFinitePoints,
  normaliseLineZscoreReferenceLevel,
  normaliseLineZscoreSubHeightRatio,
  normaliseLineZscoreWindow,
  runLineZscore,
  type ChartLineZscoreSeries,
} from './chart-line-zscore';

afterEach(() => {
  cleanup();
});

const RAMP = [1, 2, 3, 4, 5];
const CONSTANT = [5, 5, 5, 5];
// Nine zeros then a 50. With window 10 the final z-score is exactly 3.
const SPIKE_BEYOND = [0, 0, 0, 0, 0, 0, 0, 0, 0, 50];
// sqrt(3/2) -- the constant z-score of a linear ramp with a full
// 3-wide window.
const RAMP_Z = Math.sqrt(1.5);

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-zscore defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_ZSCORE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZSCORE_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZSCORE_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZSCORE_TICK_COUNT).toBeGreaterThan(0);
  });
  it('window >= 2 and reference level positive', () => {
    expect(DEFAULT_CHART_LINE_ZSCORE_WINDOW).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL).toBeGreaterThan(0);
  });
  it('sub height ratio in (0, 1)', () => {
    expect(DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO).toBeLessThan(1);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_ZSCORE_PALETTE.length).toBe(10);
  });
});

describe('getLineZscoreDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_ZSCORE_PALETTE.length;
    expect(getLineZscoreDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[0],
    );
    expect(getLineZscoreDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[0],
    );
    expect(getLineZscoreDefaultColor(len + 6)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[6],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineZscoreDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[0],
    );
    expect(getLineZscoreDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_PALETTE[0],
    );
  });
});

describe('getLineZscoreFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineZscoreFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineZscoreFinitePoints(null)).toEqual([]);
    expect(getLineZscoreFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineZscoreWindow', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineZscoreWindow(NaN)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_WINDOW,
    );
  });
  it('clamps to minimum 2', () => {
    expect(normaliseLineZscoreWindow(0)).toBe(2);
    expect(normaliseLineZscoreWindow(1)).toBe(2);
    expect(normaliseLineZscoreWindow(-5)).toBe(2);
  });
  it('floors fractional values', () => {
    expect(normaliseLineZscoreWindow(7.8)).toBe(7);
  });
  it('passes valid values', () => {
    expect(normaliseLineZscoreWindow(30)).toBe(30);
  });
});

describe('normaliseLineZscoreReferenceLevel', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineZscoreReferenceLevel(NaN)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_REFERENCE_LEVEL,
    );
  });
  it('clamps negative to 0', () => {
    expect(normaliseLineZscoreReferenceLevel(-3)).toBe(0);
  });
  it('passes valid values', () => {
    expect(normaliseLineZscoreReferenceLevel(2.5)).toBe(2.5);
    expect(normaliseLineZscoreReferenceLevel(0)).toBe(0);
  });
});

describe('normaliseLineZscoreSubHeightRatio', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineZscoreSubHeightRatio(NaN)).toBe(
      DEFAULT_CHART_LINE_ZSCORE_SUB_HEIGHT_RATIO,
    );
  });
  it('clamps to [0.1, 0.9]', () => {
    expect(normaliseLineZscoreSubHeightRatio(0)).toBe(0.1);
    expect(normaliseLineZscoreSubHeightRatio(1)).toBe(0.9);
  });
  it('passes valid values', () => {
    expect(normaliseLineZscoreSubHeightRatio(0.5)).toBe(0.5);
  });
});

describe('classifyLineZscoreBand', () => {
  it('beyond when |z| exceeds the reference level', () => {
    expect(classifyLineZscoreBand(3, 2)).toBe('beyond');
    expect(classifyLineZscoreBand(-3, 2)).toBe('beyond');
  });
  it('within when |z| <= the reference level (strict)', () => {
    expect(classifyLineZscoreBand(1, 2)).toBe('within');
    expect(classifyLineZscoreBand(2, 2)).toBe('within');
    expect(classifyLineZscoreBand(-2, 2)).toBe('within');
  });
  it('non-finite -> within', () => {
    expect(classifyLineZscoreBand(NaN, 2)).toBe('within');
    expect(classifyLineZscoreBand(3, NaN)).toBe('within');
  });
});

describe('computeRollingZScores', () => {
  it('empty / null -> []', () => {
    expect(computeRollingZScores([], 3)).toEqual([]);
    expect(computeRollingZScores(null, 3)).toEqual([]);
  });
  it('single point -> mean = value, std 0, z 0', () => {
    const r = computeRollingZScores([7], 3);
    expect(r.length).toBe(1);
    expect(r[0]!.mean).toBe(7);
    expect(r[0]!.std).toBe(0);
    expect(r[0]!.z).toBe(0);
    expect(r[0]!.windowSize).toBe(1);
  });
  it('constant series -> std 0 and z 0 throughout', () => {
    const r = computeRollingZScores(CONSTANT, 3);
    for (const s of r) {
      expect(s.std).toBeCloseTo(0, 10);
      expect(s.z).toBeCloseTo(0, 10);
    }
  });
  it('window expands until it reaches the full length', () => {
    const r = computeRollingZScores(RAMP, 3);
    expect(r.map((s) => s.windowSize)).toEqual([1, 2, 3, 3, 3]);
  });
  it('linear ramp: full-window z-score is the constant sqrt(3/2)', () => {
    // window [a, a+d, a+2d]: mean a+d, std d*sqrt(2/3),
    // z of the last point = d / (d*sqrt(2/3)) = sqrt(3/2)
    const r = computeRollingZScores(RAMP, 3);
    expect(r[2]!.z).toBeCloseTo(RAMP_Z, 8);
    expect(r[3]!.z).toBeCloseTo(RAMP_Z, 8);
    expect(r[4]!.z).toBeCloseTo(RAMP_Z, 8);
  });
  it('two-point window z-score is +/- 1', () => {
    // window [1, 2]: mean 1.5, std 0.5, z of point 2 = 0.5/0.5 = 1
    const r = computeRollingZScores(RAMP, 3);
    expect(r[1]!.z).toBeCloseTo(1, 10);
  });
  it('SPIKE_BEYOND: verified mean 5, std 15, z 3 at the spike', () => {
    // window of 10: nine 0s and a 50 -> mean 5,
    // variance (9*25 + 45^2)/10 = 2250/10 = 225, std 15, z 45/15 = 3
    const r = computeRollingZScores(SPIKE_BEYOND, 10);
    expect(r[9]!.mean).toBeCloseTo(5, 8);
    expect(r[9]!.std).toBeCloseTo(15, 8);
    expect(r[9]!.z).toBeCloseTo(3, 8);
  });
  it('drops non-finite values (output matches finite length)', () => {
    const r = computeRollingZScores([5, NaN, 5, Infinity, 5], 3);
    expect(r.length).toBe(3);
  });
});

describe('runLineZscore', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineZscore(null);
    expect(r.samples).toEqual([]);
    expect(r.totalSamples).toBe(0);
    expect(r.beyondCount).toBe(0);
  });
  it('per-sample z-score matches the rolling computation', () => {
    const r = runLineZscore(toPoints(RAMP), { window: 3 });
    expect(r.samples[4]!.z).toBeCloseTo(RAMP_Z, 8);
  });
  it('classifies points beyond the reference level', () => {
    const r = runLineZscore(toPoints(SPIKE_BEYOND), {
      window: 10,
      referenceLevel: 2,
    });
    // z = 3 at the spike, > reference 2 -> beyond
    expect(r.samples[9]!.band).toBe('beyond');
    expect(r.beyondCount).toBe(1);
  });
  it('z-score exactly at the reference level stays within', () => {
    // SPIKE with window 5 gives z = sqrt(4) = 2 exactly; ref 2 -> within
    const r = runLineZscore(toPoints([0, 0, 0, 0, 10]), {
      window: 5,
      referenceLevel: 2,
    });
    expect(r.samples[4]!.z).toBeCloseTo(2, 8);
    expect(r.samples[4]!.band).toBe('within');
    expect(r.beyondCount).toBe(0);
  });
  it('constant series stays within the band', () => {
    const r = runLineZscore(toPoints(CONSTANT), { window: 3 });
    expect(r.beyondCount).toBe(0);
    for (const s of r.samples) {
      expect(s.band).toBe('within');
    }
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineZscore([
      { x: 3, y: 4 },
      { x: NaN, y: 0 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3]);
  });
  it('tracks maxAbsZ and finalZ', () => {
    const r = runLineZscore(toPoints(SPIKE_BEYOND), { window: 10 });
    expect(r.maxAbsZ).toBeCloseTo(3, 8);
    expect(r.finalZ).toBeCloseTo(3, 8);
  });
  it('exposes window and referenceLevel', () => {
    const r = runLineZscore(toPoints(RAMP), {
      window: 7,
      referenceLevel: 2.5,
    });
    expect(r.window).toBe(7);
    expect(r.referenceLevel).toBe(2.5);
  });
  it('records the trailing window size per sample', () => {
    const r = runLineZscore(toPoints(RAMP), { window: 3 });
    expect(r.samples.map((s) => s.windowSize)).toEqual([1, 2, 3, 3, 3]);
  });
});

describe('computeLineZscoreLayout', () => {
  const series: ChartLineZscoreSeries[] = [
    { id: 'a', label: 'A', data: toPoints(SPIKE_BEYOND), window: 10 },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineZscoreLayout({
      series: [],
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 30,
      height: 30,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineZscoreLayout({
      series,
      hiddenSeries: ['a'],
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds main and sub panels stacked vertically', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.mainPanel.height).toBeGreaterThan(0);
    expect(layout.subPanel.height).toBeGreaterThan(0);
    expect(layout.subPanel.y).toBeGreaterThan(layout.mainPanel.y);
  });

  it('builds raw + zscore paths', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.rawPath).toContain('M ');
    expect(s.zscorePath).toContain('M ');
  });

  it('exposes window, reference level, maxAbsZ and beyond count', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
      referenceLevel: 2,
    });
    const s = layout.series[0]!;
    expect(s.window).toBe(10);
    expect(s.referenceLevel).toBe(2);
    expect(s.maxAbsZ).toBeCloseTo(3, 6);
    expect(s.beyondCount).toBe(1);
  });

  it('sub panel y range is symmetric around zero', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.subYMin).toBeCloseTo(-layout.subYMax, 8);
  });

  it('per-series window override beats chart-level', () => {
    const layout = computeLineZscoreLayout({
      series: [
        { id: 'a', label: 'A', data: toPoints(SPIKE_BEYOND), window: 5 },
      ],
      width: 500,
      height: 360,
      padding: 30,
      window: 10,
    });
    expect(layout.series[0]!.window).toBe(5);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineZscoreSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CONSTANT) },
    ];
    const layout = computeLineZscoreLayout({
      series: multi,
      hiddenSeries: ['b'],
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.series[0]!.id).toBe('a');
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineZscoreLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
      xMin: -5,
      xMax: 50,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineZscoreSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CONSTANT) },
    ];
    const layout = computeLineZscoreLayout({
      series: multi,
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(SPIKE_BEYOND.length + CONSTANT.length);
  });
});

describe('describeLineZscoreChart', () => {
  it('no data -> No data', () => {
    expect(describeLineZscoreChart(null)).toBe('No data');
    expect(describeLineZscoreChart([])).toBe('No data');
  });
  it('summary mentions rolling z-score, window and beyond count', () => {
    const s = describeLineZscoreChart([
      { id: 'a', label: 'A', data: toPoints(SPIKE_BEYOND), window: 10 },
    ]);
    expect(s).toContain('rolling z-score');
    expect(s).toContain('window');
    expect(s).toContain('beyond');
  });
  it('handles hidden filter', () => {
    const s = describeLineZscoreChart(
      [{ id: 'a', label: 'A', data: toPoints(RAMP) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineZscore> render', () => {
  const series: ChartLineZscoreSeries[] = [
    { id: 'a', label: 'Series A', data: toPoints(SPIKE_BEYOND), window: 10 },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineZscore series={[]} />);
    const root = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineZscore series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-zscore-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders the continuous z-score path with data-kind=zscore', () => {
    render(<ChartLineZscore series={series} />);
    const z = document.querySelector(
      '[data-section="chart-line-zscore-zscore-path"]',
    );
    expect(z).not.toBeNull();
    expect(z!.getAttribute('data-kind')).toBe('zscore');
  });

  it('renders the sub-panel zero line', () => {
    render(<ChartLineZscore series={series} />);
    expect(
      document.querySelector('[data-section="chart-line-zscore-zero-line"]'),
    ).not.toBeNull();
  });

  it('hides the zero line when showZeroLine=false', () => {
    render(<ChartLineZscore series={series} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zscore-zero-line"]'),
    ).toBeNull();
  });

  it('renders reference guide lines (upper + lower) and hides via prop', () => {
    const { rerender } = render(<ChartLineZscore series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-reference-line"][data-side="upper"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-reference-line"][data-side="lower"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineZscore series={series} showReferenceLines={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-reference-line"]',
      ),
    ).toBeNull();
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineZscore series={series} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zscore-raw-path"]'),
    ).toBeNull();
  });

  it('hides zscore path when showZscore=false', () => {
    render(<ChartLineZscore series={series} showZscore={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-zscore-path"]',
      ),
    ).toBeNull();
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineZscore series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zscore-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineZscore series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-zscore-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows window + reference + max z', () => {
    render(<ChartLineZscore series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-zscore-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-zscore-badge-window"]')
        ?.textContent?.startsWith('W='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-zscore-badge-reference"]')
        ?.textContent?.startsWith('ref='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-zscore-badge-max-z"]')
        ?.textContent?.startsWith('maxZ='),
    ).toBe(true);
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineZscore series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zscore-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineZscore series={series} />);
    const root = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-zscore-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-zscore-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('rolling z-score');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineZscore series={series} />);
    const root = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(Number(root!.getAttribute('data-window'))).toBe(10);
    expect(Number(root!.getAttribute('data-max-abs-z'))).toBeCloseTo(3, 5);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineZscore series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-zscore-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-window'))).toBe(10);
    expect(Number(grp!.getAttribute('data-series-max-abs-z'))).toBeCloseTo(
      3,
      5,
    );
    expect(Number(grp!.getAttribute('data-series-beyond-count'))).toBe(1);
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip appears on dot hover with raw + mean + std + z-score rows', () => {
    render(<ChartLineZscore series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-zscore-dot"]',
    );
    const dot = dots[9]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-zscore-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-tooltip-mean"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-tooltip-std"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-tooltip-zscore"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-zscore-tooltip-band"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-zscore-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineZscore series={series} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-zscore-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-zscore-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineZscore
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-zscore-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows window + max z stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineZscore
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-zscore-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('W=');
    expect(stats!.textContent).toContain('maxZ');
    const btn = document.querySelector(
      '[data-section="chart-line-zscore-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineZscore series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-zscore-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineZscore series={series} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineZscore series={series} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineZscore ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-zscore',
    );
  });

  it('has displayName', () => {
    expect(ChartLineZscore.displayName).toBe('ChartLineZscore');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineZscore series={series} ariaLabel="Custom zscore label" />,
    );
    const root = document.querySelector('[data-section="chart-line-zscore"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom zscore label');
    const svg = document.querySelector(
      '[data-section="chart-line-zscore-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom zscore label');
  });

  it('xLabel, yLabel and subLabel render axis text', () => {
    render(
      <ChartLineZscore
        series={series}
        xLabel="time"
        yLabel="value"
        subLabel="standardized"
      />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-zscore-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-zscore-y-label',
    );
    expect(
      screen.getByText('standardized').getAttribute('data-section'),
    ).toBe('chart-line-zscore-sub-label');
  });

  it('dot exposes z-score and band data attributes', () => {
    render(<ChartLineZscore series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-zscore-dot"]',
    );
    const spikeDot = dots[9]!;
    expect(Number(spikeDot.getAttribute('data-zscore'))).toBeCloseTo(3, 5);
    expect(spikeDot.getAttribute('data-band')).toBe('beyond');
  });
});
