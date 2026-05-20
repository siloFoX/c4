import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineMad,
  DEFAULT_CHART_LINE_MAD_HEIGHT,
  DEFAULT_CHART_LINE_MAD_MULTIPLIER,
  DEFAULT_CHART_LINE_MAD_PADDING,
  DEFAULT_CHART_LINE_MAD_PALETTE,
  DEFAULT_CHART_LINE_MAD_SCALE,
  DEFAULT_CHART_LINE_MAD_TICK_COUNT,
  DEFAULT_CHART_LINE_MAD_WIDTH,
  DEFAULT_CHART_LINE_MAD_WINDOW,
  classifyLineMadOutlier,
  computeLineMadDeviation,
  computeLineMadLayout,
  computeLineMadMedian,
  computeRollingMad,
  describeLineMadChart,
  getLineMadDefaultColor,
  getLineMadFinitePoints,
  normaliseLineMadMultiplier,
  normaliseLineMadScale,
  normaliseLineMadWindow,
  runLineMad,
  type ChartLineMadSeries,
} from './chart-line-mad';

afterEach(() => {
  cleanup();
});

const RAMP = [1, 2, 3, 4, 5];
const CONSTANT = [5, 5, 5, 5];
// Calm ramp then a large outlier; window 5 keeps the band non-degenerate
// (MAD = 1) yet the 50 still falls far outside it.
const OUTLIER_FIXTURE = [1, 2, 3, 4, 5, 50];

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-mad defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_MAD_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MAD_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MAD_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MAD_TICK_COUNT).toBeGreaterThan(0);
  });
  it('window >= 2, multiplier positive, scale is the 1.4826 constant', () => {
    expect(DEFAULT_CHART_LINE_MAD_WINDOW).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_CHART_LINE_MAD_MULTIPLIER).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_MAD_SCALE).toBeCloseTo(1.4826, 5);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_MAD_PALETTE.length).toBe(10);
  });
});

describe('getLineMadDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_MAD_PALETTE.length;
    expect(getLineMadDefaultColor(0)).toBe(DEFAULT_CHART_LINE_MAD_PALETTE[0]);
    expect(getLineMadDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_MAD_PALETTE[0],
    );
    expect(getLineMadDefaultColor(len + 7)).toBe(
      DEFAULT_CHART_LINE_MAD_PALETTE[7],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineMadDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_MAD_PALETTE[0],
    );
    expect(getLineMadDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_MAD_PALETTE[0],
    );
  });
});

describe('getLineMadFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineMadFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineMadFinitePoints(null)).toEqual([]);
    expect(getLineMadFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineMadWindow', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineMadWindow(NaN)).toBe(DEFAULT_CHART_LINE_MAD_WINDOW);
  });
  it('clamps to minimum 2', () => {
    expect(normaliseLineMadWindow(0)).toBe(2);
    expect(normaliseLineMadWindow(1)).toBe(2);
    expect(normaliseLineMadWindow(-5)).toBe(2);
  });
  it('floors fractional values', () => {
    expect(normaliseLineMadWindow(7.8)).toBe(7);
  });
  it('passes valid values', () => {
    expect(normaliseLineMadWindow(30)).toBe(30);
  });
});

describe('normaliseLineMadMultiplier', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineMadMultiplier(NaN)).toBe(
      DEFAULT_CHART_LINE_MAD_MULTIPLIER,
    );
  });
  it('clamps negative to 0', () => {
    expect(normaliseLineMadMultiplier(-2)).toBe(0);
  });
  it('passes valid values including 0', () => {
    expect(normaliseLineMadMultiplier(0)).toBe(0);
    expect(normaliseLineMadMultiplier(2.5)).toBe(2.5);
  });
});

describe('normaliseLineMadScale', () => {
  it('falls back for non-finite or non-positive', () => {
    expect(normaliseLineMadScale(NaN)).toBeCloseTo(1.4826, 5);
    expect(normaliseLineMadScale(0)).toBeCloseTo(1.4826, 5);
    expect(normaliseLineMadScale(-1)).toBeCloseTo(1.4826, 5);
  });
  it('passes valid positive values', () => {
    expect(normaliseLineMadScale(1)).toBe(1);
    expect(normaliseLineMadScale(2)).toBe(2);
  });
});

describe('computeLineMadMedian', () => {
  it('empty / null -> NaN', () => {
    expect(Number.isNaN(computeLineMadMedian([]))).toBe(true);
    expect(Number.isNaN(computeLineMadMedian(null))).toBe(true);
  });
  it('odd length -> middle value', () => {
    expect(computeLineMadMedian([1, 2, 3, 4, 5])).toBe(3);
  });
  it('even length -> average of the two middle values', () => {
    expect(computeLineMadMedian([1, 2, 3, 4])).toBe(2.5);
  });
  it('sorts internally', () => {
    expect(computeLineMadMedian([4, 2, 1, 3])).toBe(2.5);
  });
  it('drops non-finite values', () => {
    expect(computeLineMadMedian([1, NaN, 3])).toBe(2);
  });
});

describe('computeLineMadDeviation', () => {
  it('empty / null -> NaN', () => {
    expect(Number.isNaN(computeLineMadDeviation([]))).toBe(true);
    expect(Number.isNaN(computeLineMadDeviation(null))).toBe(true);
  });
  it('MAD of [1,2,3,4,5] = 1', () => {
    // median 3, abs devs [2,1,0,1,2], median of those = 1
    expect(computeLineMadDeviation([1, 2, 3, 4, 5])).toBe(1);
  });
  it('MAD of [1,2,3,4,5,6] = 1.5', () => {
    // median 3.5, abs devs [2.5,1.5,0.5,0.5,1.5,2.5], median = 1.5
    expect(computeLineMadDeviation([1, 2, 3, 4, 5, 6])).toBe(1.5);
  });
  it('is robust: a lone huge outlier does not inflate the MAD', () => {
    // median 3, abs devs [2,1,0,1,997], median = 1 -- unchanged from
    // [1,2,3,4,5] despite the 1000
    expect(computeLineMadDeviation([1, 2, 3, 4, 1000])).toBe(1);
  });
  it('constant series -> MAD 0', () => {
    expect(computeLineMadDeviation([5, 5, 5])).toBe(0);
  });
  it('accepts a pre-computed center median', () => {
    // abs devs from 0 = [1,2,3,4,5], median = 3
    expect(computeLineMadDeviation([1, 2, 3, 4, 5], 0)).toBe(3);
  });
});

describe('computeRollingMad', () => {
  it('empty / null -> []', () => {
    expect(computeRollingMad([], 3)).toEqual([]);
    expect(computeRollingMad(null, 3)).toEqual([]);
  });
  it('window expands until it reaches the full length', () => {
    const r = computeRollingMad(RAMP, 3);
    expect(r.map((s) => s.windowSize)).toEqual([1, 2, 3, 3, 3]);
  });
  it('rolling median and MAD verified on a ramp', () => {
    const r = computeRollingMad(RAMP, 3);
    // t=2 window [1,2,3]: median 2, MAD 1
    expect(r[2]!.median).toBe(2);
    expect(r[2]!.mad).toBe(1);
    // t=3 window [2,3,4]: median 3, MAD 1
    expect(r[3]!.median).toBe(3);
    expect(r[3]!.mad).toBe(1);
  });
  it('single-point window -> MAD 0', () => {
    const r = computeRollingMad(RAMP, 3);
    expect(r[0]!.median).toBe(1);
    expect(r[0]!.mad).toBe(0);
  });
  it('constant series -> MAD 0 throughout', () => {
    const r = computeRollingMad(CONSTANT, 3);
    for (const s of r) {
      expect(s.mad).toBe(0);
      expect(s.median).toBe(5);
    }
  });
  it('drops non-finite values (output matches finite length)', () => {
    const r = computeRollingMad([5, NaN, 5, Infinity, 5], 3);
    expect(r.length).toBe(3);
  });
});

describe('classifyLineMadOutlier', () => {
  it('above / below / within', () => {
    expect(classifyLineMadOutlier(10, 0, 5)).toBe('above');
    expect(classifyLineMadOutlier(-1, 0, 5)).toBe('below');
    expect(classifyLineMadOutlier(3, 0, 5)).toBe('within');
  });
  it('boundary values are within (strict comparison)', () => {
    expect(classifyLineMadOutlier(5, 0, 5)).toBe('within');
    expect(classifyLineMadOutlier(0, 0, 5)).toBe('within');
  });
  it('non-finite -> within', () => {
    expect(classifyLineMadOutlier(NaN, 0, 5)).toBe('within');
    expect(classifyLineMadOutlier(3, NaN, 5)).toBe('within');
  });
});

describe('runLineMad', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineMad(null);
    expect(r.samples).toEqual([]);
    expect(r.totalSamples).toBe(0);
    expect(r.outlierCount).toBe(0);
  });
  it('band is median +/- multiplier * scaledMAD', () => {
    const r = runLineMad(toPoints(OUTLIER_FIXTURE), {
      window: 5,
      multiplier: 3,
      madScale: 1.4826,
    });
    const last = r.samples[5]!;
    // window [2,3,4,5,50]: median 4, MAD 1, scaledMAD 1.4826
    expect(last.median).toBe(4);
    expect(last.mad).toBe(1);
    expect(last.scaledMad).toBeCloseTo(1.4826, 6);
    expect(last.upper).toBeCloseTo(4 + 3 * 1.4826, 6);
    expect(last.lower).toBeCloseTo(4 - 3 * 1.4826, 6);
  });
  it('flags a robust outlier outside the MAD band', () => {
    const r = runLineMad(toPoints(OUTLIER_FIXTURE), {
      window: 5,
      multiplier: 3,
    });
    // raw 50 is far above the band [~-0.45, ~8.45]
    expect(r.samples[5]!.outlier).toBe('above');
    expect(r.outlierCount).toBe(1);
    expect(r.aboveCount).toBe(1);
  });
  it('robustness: a lone spike inside the window is still flagged', () => {
    // [10,10,10,10,100] window 5: median 10, abs devs [0,0,0,0,90],
    // MAD 0 -- the band collapses to the median and the 100 is caught.
    // (A mean/stddev band would have been inflated by the 100 itself.)
    const r = runLineMad(toPoints([10, 10, 10, 10, 100]), {
      window: 5,
      multiplier: 3,
    });
    expect(r.samples[4]!.mad).toBe(0);
    expect(r.samples[4]!.outlier).toBe('above');
  });
  it('constant series has no outliers', () => {
    const r = runLineMad(toPoints(CONSTANT), { window: 3 });
    expect(r.outlierCount).toBe(0);
    for (const s of r.samples) {
      expect(s.outlier).toBe('within');
    }
  });
  it('index 0 is always within (single-point window)', () => {
    const r = runLineMad(toPoints(OUTLIER_FIXTURE), { window: 5 });
    expect(r.samples[0]!.outlier).toBe('within');
    expect(r.samples[0]!.mad).toBe(0);
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineMad([
      { x: 3, y: 4 },
      { x: NaN, y: 0 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3]);
  });
  it('tracks finalMedian, finalScaledMad and maxScaledMad', () => {
    const r = runLineMad(toPoints(OUTLIER_FIXTURE), {
      window: 5,
      madScale: 1.4826,
    });
    expect(r.finalMedian).toBe(4);
    expect(r.finalScaledMad).toBeCloseTo(1.4826, 6);
    expect(r.maxScaledMad).toBeGreaterThan(0);
  });
  it('exposes window, multiplier and madScale', () => {
    const r = runLineMad(toPoints(RAMP), {
      window: 7,
      multiplier: 2.5,
      madScale: 1,
    });
    expect(r.window).toBe(7);
    expect(r.multiplier).toBe(2.5);
    expect(r.madScale).toBe(1);
  });
});

describe('computeLineMadLayout', () => {
  const series: ChartLineMadSeries[] = [
    { id: 'a', label: 'A', data: toPoints(OUTLIER_FIXTURE), window: 5 },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineMadLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineMadLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineMadLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw, median, band fill and band edge paths', () => {
    const layout = computeLineMadLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    const s = layout.series[0]!;
    expect(s.rawPath).toContain('M ');
    expect(s.medianPath).toContain('M ');
    expect(s.bandFillPath).toContain('M ');
    expect(s.bandFillPath).toContain('Z');
    expect(s.upperPath).toContain('M ');
    expect(s.lowerPath).toContain('M ');
  });

  it('exposes window, multiplier, madScale and outliers', () => {
    const layout = computeLineMadLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      multiplier: 3,
      madScale: 1.4826,
    });
    const s = layout.series[0]!;
    expect(s.window).toBe(5);
    expect(s.multiplier).toBe(3);
    expect(s.madScale).toBeCloseTo(1.4826, 6);
    expect(s.outlierCount).toBe(1);
    expect(s.outliers.length).toBe(1);
    expect(s.outliers[0]!.outlier).toBe('above');
  });

  it('per-series window override beats chart-level', () => {
    const layout = computeLineMadLayout({
      series: [
        { id: 'a', label: 'A', data: toPoints(OUTLIER_FIXTURE), window: 4 },
      ],
      width: 400,
      height: 200,
      padding: 30,
      window: 20,
    });
    expect(layout.series[0]!.window).toBe(4);
  });

  it('per-series multiplier override beats chart-level', () => {
    const layout = computeLineMadLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(OUTLIER_FIXTURE),
          multiplier: 5,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      multiplier: 3,
    });
    expect(layout.series[0]!.multiplier).toBe(5);
  });

  it('y range covers the band beyond the raw values', () => {
    const layout = computeLineMadLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    const minLower = Math.min(...s.points.map((p) => p.lower));
    const maxUpper = Math.max(...s.points.map((p) => p.upper));
    expect(layout.yMin).toBeLessThanOrEqual(minLower + 1e-6);
    expect(layout.yMax).toBeGreaterThanOrEqual(maxUpper - 1e-6);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineMadSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CONSTANT) },
    ];
    const layout = computeLineMadLayout({
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
    const layout = computeLineMadLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -100,
      yMax: 200,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(200);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineMadSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CONSTANT) },
    ];
    const layout = computeLineMadLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(OUTLIER_FIXTURE.length + CONSTANT.length);
  });
});

describe('describeLineMadChart', () => {
  it('no data -> No data', () => {
    expect(describeLineMadChart(null)).toBe('No data');
    expect(describeLineMadChart([])).toBe('No data');
  });
  it('summary mentions the MAD band and robust outliers', () => {
    const s = describeLineMadChart([
      { id: 'a', label: 'A', data: toPoints(OUTLIER_FIXTURE), window: 5 },
    ]);
    expect(s).toContain('Median Absolute Deviation');
    expect(s).toContain('window');
    expect(s).toContain('robust outliers');
  });
  it('handles hidden filter', () => {
    const s = describeLineMadChart(
      [{ id: 'a', label: 'A', data: toPoints(RAMP) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineMad> render', () => {
  const series: ChartLineMadSeries[] = [
    { id: 'a', label: 'Series A', data: toPoints(OUTLIER_FIXTURE), window: 5 },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineMad series={[]} />);
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineMad series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-mad-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders median path with data-kind=median', () => {
    render(<ChartLineMad series={series} />);
    const median = document.querySelector(
      '[data-section="chart-line-mad-median-path"]',
    );
    expect(median).not.toBeNull();
    expect(median!.getAttribute('data-kind')).toBe('median');
  });

  it('renders band fill and upper/lower edge paths', () => {
    render(<ChartLineMad series={series} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-band-fill"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-band-upper-path"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-band-lower-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides the band when showBand=false', () => {
    render(<ChartLineMad series={series} showBand={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-band"]'),
    ).toBeNull();
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineMad series={series} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-raw-path"]'),
    ).toBeNull();
  });

  it('hides median path when showMedian=false', () => {
    render(<ChartLineMad series={series} showMedian={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-median-path"]'),
    ).toBeNull();
  });

  it('renders an outlier marker for the detected robust outlier', () => {
    render(<ChartLineMad series={series} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-mad-outlier-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]!.getAttribute('data-outlier')).toBe('above');
  });

  it('hides outlier markers when showOutliers=false', () => {
    render(<ChartLineMad series={series} showOutliers={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-outlier-marker"]',
      ),
    ).toBeNull();
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineMad series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mad-dot"]').length,
    ).toBe(0);
    rerender(<ChartLineMad series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mad-dot"]').length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows window + multiplier + scale + outlier count', () => {
    render(<ChartLineMad series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-mad-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-mad-badge-window"]')
        ?.textContent?.startsWith('W='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-mad-badge-multiplier"]')
        ?.textContent?.startsWith('k='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-mad-badge-scale"]')
        ?.textContent?.startsWith('c='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-badge-outliers"]',
      )?.textContent,
    ).toBe('out=1');
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineMad series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineMad series={series} />);
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-mad-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-mad-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Median Absolute Deviation');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineMad series={series} />);
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(root!.getAttribute('data-total-outliers')).toBe('1');
    expect(Number(root!.getAttribute('data-window'))).toBe(5);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineMad series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-mad-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-window'))).toBe(5);
    expect(Number(grp!.getAttribute('data-series-final-median'))).toBe(4);
    expect(Number(grp!.getAttribute('data-series-outlier-count'))).toBe(1);
    expect(Number(grp!.getAttribute('data-series-above-count'))).toBe(1);
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip appears on dot hover with raw + median + MAD + band rows', () => {
    render(<ChartLineMad series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-mad-dot"]',
    );
    const dot = dots[3]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip-raw"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-tooltip-median"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip-mad"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip-band"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip"]'),
    ).toBeNull();
  });

  it('tooltip shows an outlier row on the flagged dot', () => {
    render(<ChartLineMad series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-mad-dot"]',
    );
    const outlierDot = Array.from(dots).find(
      (d) => d.getAttribute('data-outlier') === 'above',
    );
    expect(outlierDot).toBeTruthy();
    fireEvent.mouseEnter(outlierDot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-tooltip-outlier"]',
      ),
    ).not.toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineMad series={series} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-mad-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-mad-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineMad
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-mad-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows window + outlier stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineMad
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-mad-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('W=');
    expect(stats!.textContent).toContain('out');
    const btn = document.querySelector(
      '[data-section="chart-line-mad-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineMad series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mad-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineMad series={series} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineMad series={series} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-mad"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMad ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-mad');
  });

  it('has displayName', () => {
    expect(ChartLineMad.displayName).toBe('ChartLineMad');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(<ChartLineMad series={series} ariaLabel="Custom MAD label" />);
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom MAD label');
    const svg = document.querySelector(
      '[data-section="chart-line-mad-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom MAD label');
  });

  it('xLabel and yLabel render axis text', () => {
    render(<ChartLineMad series={series} xLabel="time" yLabel="value" />);
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-mad-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-mad-y-label',
    );
  });

  it('constant series renders zero outliers', () => {
    render(
      <ChartLineMad
        series={[{ id: 'c', label: 'C', data: toPoints(CONSTANT) }]}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-mad"]');
    expect(root!.getAttribute('data-total-outliers')).toBe('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-mad-outlier-marker"]',
      ),
    ).toBeNull();
  });
});
