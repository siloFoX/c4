import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineHampel,
  DEFAULT_CHART_LINE_HAMPEL_HEIGHT,
  DEFAULT_CHART_LINE_HAMPEL_MAD_SCALE,
  DEFAULT_CHART_LINE_HAMPEL_N_SIGMAS,
  DEFAULT_CHART_LINE_HAMPEL_OUTLIER_COLOR,
  DEFAULT_CHART_LINE_HAMPEL_PALETTE,
  DEFAULT_CHART_LINE_HAMPEL_WIDTH,
  DEFAULT_CHART_LINE_HAMPEL_WINDOW,
  applyLineHampel,
  computeHampelMad,
  computeHampelMedian,
  computeLineHampelLayout,
  describeLineHampelChart,
  getLineHampelDefaultColor,
  getLineHampelFinitePoints,
  normaliseLineHampelMadScale,
  normaliseLineHampelNSigmas,
  normaliseLineHampelWindow,
  runLineHampel,
  type ChartLineHampelSeries,
} from './chart-line-hampel';

// Smooth baseline (constant 10) with two big outliers at indices 7 and 15.
const baselineWithSpikes = Array.from({ length: 20 }, (_, n) => ({
  x: n,
  y: n === 7 ? 100 : n === 15 ? -50 : 10,
}));

const spikeSeries: ChartLineHampelSeries = {
  id: 's',
  label: 'Spikes',
  data: baselineWithSpikes,
};

const flatSeries: ChartLineHampelSeries = {
  id: 'f',
  label: 'Flat',
  data: Array.from({ length: 20 }, (_, n) => ({ x: n, y: 5 })),
};

describe('chart-line-hampel: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_HAMPEL_HEIGHT).toBeGreaterThan(0);
  });

  it('default window is odd and >= 3', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_WINDOW).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_CHART_LINE_HAMPEL_WINDOW % 2).toBe(1);
  });

  it('default n-sigmas positive', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_N_SIGMAS).toBeGreaterThan(0);
  });

  it('default MAD scale is the canonical normality factor 1.4826', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_MAD_SCALE).toBeCloseTo(1.4826, 4);
  });

  it('outlier color is set', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_OUTLIER_COLOR).toMatch(/#/);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_HAMPEL_PALETTE.length).toBe(10);
  });
});

describe('getLineHampelDefaultColor', () => {
  it('cycles palette', () => {
    expect(getLineHampelDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_HAMPEL_PALETTE[0],
    );
    expect(getLineHampelDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_HAMPEL_PALETTE[0],
    );
  });

  it('falls back for NaN / negative', () => {
    expect(getLineHampelDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_HAMPEL_PALETTE[0],
    );
    expect(getLineHampelDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_HAMPEL_PALETTE[0],
    );
  });
});

describe('getLineHampelFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineHampelFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineHampelFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineHampelWindow', () => {
  it('default for non-finite', () => {
    expect(normaliseLineHampelWindow(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_HAMPEL_WINDOW,
    );
  });

  it('clamps to >= 3', () => {
    expect(normaliseLineHampelWindow(0)).toBe(3);
    expect(normaliseLineHampelWindow(2)).toBe(3);
  });

  it('rounds even up to next odd', () => {
    expect(normaliseLineHampelWindow(6)).toBe(7);
    expect(normaliseLineHampelWindow(10)).toBe(11);
  });

  it('identity for valid odd', () => {
    expect(normaliseLineHampelWindow(7)).toBe(7);
    expect(normaliseLineHampelWindow(11)).toBe(11);
  });
});

describe('normaliseLineHampelNSigmas', () => {
  it('default for non-finite / negative', () => {
    expect(normaliseLineHampelNSigmas(Number.NaN)).toBe(3);
    expect(normaliseLineHampelNSigmas(-1)).toBe(3);
  });

  it('identity for non-negative', () => {
    expect(normaliseLineHampelNSigmas(2.5)).toBe(2.5);
    expect(normaliseLineHampelNSigmas(0)).toBe(0);
  });
});

describe('normaliseLineHampelMadScale', () => {
  it('default for non-finite / non-positive', () => {
    expect(normaliseLineHampelMadScale(Number.NaN)).toBeCloseTo(1.4826, 4);
    expect(normaliseLineHampelMadScale(0)).toBeCloseTo(1.4826, 4);
    expect(normaliseLineHampelMadScale(-1)).toBeCloseTo(1.4826, 4);
  });

  it('identity for positive', () => {
    expect(normaliseLineHampelMadScale(2.0)).toBe(2.0);
  });
});

describe('computeHampelMedian', () => {
  it('returns NaN for empty or null', () => {
    expect(Number.isNaN(computeHampelMedian([]))).toBe(true);
    expect(Number.isNaN(computeHampelMedian(null))).toBe(true);
  });

  it('odd-length median is the middle element', () => {
    expect(computeHampelMedian([1, 2, 3, 4, 5])).toBe(3);
    expect(computeHampelMedian([5, 1, 4, 2, 3])).toBe(3); // unsorted
  });

  it('even-length median averages two middles', () => {
    expect(computeHampelMedian([1, 2, 3, 4])).toBe(2.5);
    expect(computeHampelMedian([4, 1, 3, 2])).toBe(2.5); // unsorted
  });

  it('robust to outliers (50% breakdown)', () => {
    // With 5 values [1, 2, 3, 4, 1e9] the median should still be 3
    expect(computeHampelMedian([1, 2, 3, 4, 1e9])).toBe(3);
  });

  it('drops non-finite from the input', () => {
    expect(computeHampelMedian([1, Number.NaN, 3, Number.POSITIVE_INFINITY])).toBe(2);
  });

  it('returns NaN if all entries are non-finite', () => {
    expect(Number.isNaN(computeHampelMedian([Number.NaN, Number.NaN]))).toBe(
      true,
    );
  });
});

describe('computeHampelMad', () => {
  it('returns NaN for empty', () => {
    expect(Number.isNaN(computeHampelMad([]))).toBe(true);
  });

  it('zero MAD for constant input', () => {
    expect(computeHampelMad([5, 5, 5, 5, 5])).toBe(0);
  });

  it('matches the canonical MAD value', () => {
    // [1, 2, 3, 4, 5] median=3. |diffs| = [2,1,0,1,2], median = 1.
    expect(computeHampelMad([1, 2, 3, 4, 5])).toBe(1);
  });

  it('accepts pre-computed center median', () => {
    expect(computeHampelMad([1, 2, 3, 4, 5], 3)).toBe(1);
    // Different center -> different MAD
    expect(computeHampelMad([1, 2, 3, 4, 5], 1)).toBe(2);
  });

  it('robust to outliers (50% breakdown)', () => {
    // [1, 2, 3, 4, 1e9] median 3, |dev| = [2,1,0,1, ~1e9], median of those
    // = 1.
    expect(computeHampelMad([1, 2, 3, 4, 1e9])).toBe(1);
  });
});

describe('applyLineHampel', () => {
  it('returns empty for null', () => {
    const r = applyLineHampel(null);
    expect(r.filtered).toEqual([]);
    expect(r.outlierIndices).toEqual([]);
  });

  it('flags both spikes in the spike fixture and replaces with median', () => {
    const ys = baselineWithSpikes.map((p) => p.y);
    const r = applyLineHampel(ys, { windowLength: 7, nSigmas: 3 });
    expect(r.outlierIndices).toContain(7);
    expect(r.outlierIndices).toContain(15);
    // Filtered values at spike indices should be the window median = 10
    expect(r.filtered[7]).toBe(10);
    expect(r.filtered[15]).toBe(10);
    // Non-outlier values pass through unchanged
    expect(r.filtered[0]).toBe(10);
    expect(r.filtered[10]).toBe(10);
  });

  it('flags no outliers on a flat constant signal', () => {
    const r = applyLineHampel(
      Array.from({ length: 20 }, () => 5),
      { windowLength: 7, nSigmas: 3 },
    );
    expect(r.outlierIndices).toEqual([]);
  });

  it('robust filter detects outliers even when the window contains an outlier (50% breakdown)', () => {
    // Place two adjacent spikes; classic mean+stddev-based detectors would
    // be skewed but the median+MAD filter remains robust.
    const ys = [10, 10, 10, 100, 100, 10, 10, 10, 10, 10, 10];
    const r = applyLineHampel(ys, { windowLength: 7, nSigmas: 3 });
    expect(r.outlierIndices).toContain(3);
    expect(r.outlierIndices).toContain(4);
  });

  it('higher nSigmas suppresses more outliers', () => {
    const ys = baselineWithSpikes.map((p) => p.y);
    const r = applyLineHampel(ys, { windowLength: 7, nSigmas: 3 });
    const wide = applyLineHampel(ys, { windowLength: 7, nSigmas: 1000 });
    // The spikes are huge so they still pass any threshold... use a more
    // moderate spike to test threshold sensitivity.
    const subtle = [10, 10, 10, 10, 11, 10, 10, 10, 10, 10];
    const tight = applyLineHampel(subtle, { windowLength: 5, nSigmas: 1 });
    const lax = applyLineHampel(subtle, { windowLength: 5, nSigmas: 100 });
    expect(tight.outlierIndices.length).toBeGreaterThanOrEqual(
      lax.outlierIndices.length,
    );
    // Sanity: wide threshold does not increase outlier count
    expect(wide.outlierIndices.length).toBeLessThanOrEqual(
      r.outlierIndices.length,
    );
  });

  it('records medians, mads, deviations, and scores per index', () => {
    const r = applyLineHampel([10, 10, 10, 100, 10, 10, 10], {
      windowLength: 5,
      nSigmas: 3,
    });
    expect(r.medians.length).toBe(7);
    expect(r.mads.length).toBe(7);
    expect(r.deviations.length).toBe(7);
    expect(r.scores.length).toBe(7);
    expect(r.medians[3]).toBe(10);
    expect(r.deviations[3]).toBe(90);
  });

  it('non-finite input slot preserves NaN in the filtered output', () => {
    const r = applyLineHampel([10, 10, Number.NaN, 10, 10], {
      windowLength: 3,
      nSigmas: 3,
    });
    expect(Number.isNaN(r.filtered[2])).toBe(true);
  });

  it('edge windows are clamped to in-bounds samples', () => {
    const r = applyLineHampel([10, 10, 100, 10, 10], {
      windowLength: 5,
      nSigmas: 3,
    });
    // Spike at index 2 should be flagged
    expect(r.outlierIndices).toContain(2);
  });

  it('reflects window length and n-sigmas in the result', () => {
    const r = applyLineHampel([1, 2, 3, 4, 5], {
      windowLength: 4,
      nSigmas: 2,
    });
    expect(r.windowLength).toBe(5); // even -> rounded up
    expect(r.nSigmas).toBe(2);
  });
});

describe('runLineHampel', () => {
  it('returns empty samples for null input', () => {
    const r = runLineHampel(null);
    expect(r.samples).toEqual([]);
    expect(r.outlierCount).toBe(0);
  });

  it('per-sample carries filtered + windowMedian + windowMad + score + isOutlier', () => {
    const r = runLineHampel(baselineWithSpikes);
    const spike = r.samples[7]!;
    expect(spike.raw).toBe(100);
    expect(spike.filtered).toBe(10);
    expect(spike.windowMedian).toBe(10);
    expect(spike.windowMad).toBe(0); // baseline is constant
    expect(spike.isOutlier).toBe(true);
  });

  it('sorts ascending by x before filtering', () => {
    const shuffled = [...baselineWithSpikes].sort(() => -1);
    const r = runLineHampel(shuffled);
    expect(r.samples.map((s) => s.x)).toEqual(
      [...baselineWithSpikes].sort((a, b) => a.x - b.x).map((p) => p.x),
    );
  });

  it('drops non-finite before filtering', () => {
    const withNan = [...baselineWithSpikes];
    withNan.splice(3, 1, { x: 3, y: Number.NaN });
    const r = runLineHampel(withNan);
    expect(r.samples.length).toBe(baselineWithSpikes.length - 1);
  });

  it('counts outliers correctly', () => {
    const r = runLineHampel(baselineWithSpikes, {
      windowLength: 7,
      nSigmas: 3,
    });
    expect(r.outlierCount).toBe(2);
  });
});

describe('computeLineHampelLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineHampelLayout({
      series: [],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw + filtered paths per series', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.rawPath.length).toBeGreaterThan(0);
    expect(s.filteredPath.length).toBeGreaterThan(0);
  });

  it('records outlier count + max score per series', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    const s = layout.series[0]!;
    expect(s.outlierCount).toBe(2);
    expect(s.maxScore).toBeGreaterThan(0);
  });

  it('extracts the outliers array', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.series[0]?.outliers).toHaveLength(2);
  });

  it('drops hidden series', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries, flatSeries],
      hiddenSeries: ['f'],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('s');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 500,
      height: 320,
      padding: 40,
      yMin: -100,
      yMax: 200,
    });
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(200);
  });

  it('per-series windowLength override beats chart-level', () => {
    const layout = computeLineHampelLayout({
      series: [{ ...spikeSeries, windowLength: 9 }],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 5,
    });
    expect(layout.series[0]?.windowLength).toBe(9);
  });

  it('per-series nSigmas override beats chart-level', () => {
    const layout = computeLineHampelLayout({
      series: [{ ...spikeSeries, nSigmas: 5 }],
      width: 500,
      height: 320,
      padding: 40,
      nSigmas: 3,
    });
    expect(layout.series[0]?.nSigmas).toBe(5);
  });

  it('totalOutliers sums per series', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries, flatSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.totalOutliers).toBe(2);
  });

  it('per-point rawPy and filteredPy diverge at outliers', () => {
    const layout = computeLineHampelLayout({
      series: [spikeSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    const spike = layout.series[0]!.points[7]!;
    expect(spike.rawPy).not.toBe(spike.filteredPy);
  });
});

describe('describeLineHampelChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineHampelChart([])).toBe('No data');
    expect(describeLineHampelChart(null)).toBe('No data');
  });

  it('mentions window + sigma + outlier count', () => {
    const desc = describeLineHampelChart([spikeSeries], {
      windowLength: 7,
      nSigmas: 3,
    });
    expect(desc).toMatch(/window 7/);
    expect(desc).toMatch(/3.00 sigma/);
    expect(desc).toMatch(/2 outliers/);
  });
});

describe('<ChartLineHampel> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineHampel series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-hampel"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with kind=raw', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-hampel-raw-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders filtered path with kind=filtered', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-hampel-filtered-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('filtered');
  });

  it('hides raw via showRaw=false', () => {
    render(<ChartLineHampel series={[spikeSeries]} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-hampel-raw-path"]'),
    ).toBeNull();
  });

  it('renders outlier markers (X crosses) at flagged points', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-hampel-outlier-marker"]',
    );
    expect(markers.length).toBe(2);
  });

  it('hides outlier markers via showOutlierMarkers=false', () => {
    render(
      <ChartLineHampel series={[spikeSeries]} showOutlierMarkers={false} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-hampel-outlier-marker"]',
      ).length,
    ).toBe(0);
  });

  it('renders replacement sticks via showReplacementSticks=true', () => {
    render(<ChartLineHampel series={[spikeSeries]} showReplacementSticks />);
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-hampel-replacement-stick"]',
    );
    expect(sticks.length).toBe(2);
  });

  it('omits replacement sticks by default', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-hampel-replacement-stick"]',
      ).length,
    ).toBe(0);
  });

  it('renders dots when showDots=true with data-outlier attr', () => {
    render(<ChartLineHampel series={[spikeSeries]} showDots />);
    const dot7 = document.querySelector(
      '[data-section="chart-line-hampel-dot"][data-point-index="7"]',
    );
    expect(dot7?.getAttribute('data-outlier')).toBe('true');
    const dot0 = document.querySelector(
      '[data-section="chart-line-hampel-dot"][data-point-index="0"]',
    );
    expect(dot0?.getAttribute('data-outlier')).toBe('false');
  });

  it('hides dots by default (showDots=false)', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-hampel-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders outlier badge with count + config', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const badge = document.querySelector(
      '[data-section="chart-line-hampel-badge"]',
    );
    expect(Number(badge?.getAttribute('data-outlier-count'))).toBe(2);
  });

  it('hides badge via showOutlierBadge=false', () => {
    render(<ChartLineHampel series={[spikeSeries]} showOutlierBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-hampel-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineHampel series={[spikeSeries]} ariaLabel="hampel" />);
    const region = screen.getByRole('region', { name: 'hampel' });
    const img = within(region).getByRole('img', { name: 'hampel' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineHampel
        series={[spikeSeries]}
        windowLength={7}
        nSigmas={3}
        madScale={1.4826}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-hampel"]',
    );
    expect(root?.getAttribute('data-window-length')).toBe('7');
    expect(root?.getAttribute('data-n-sigmas')).toBe('3');
    expect(Number(root?.getAttribute('data-mad-scale'))).toBeCloseTo(1.4826, 4);
    expect(Number(root?.getAttribute('data-total-outliers'))).toBe(2);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const group = document.querySelector(
      '[data-section="chart-line-hampel-series-group"]',
    );
    expect(Number(group?.getAttribute('data-series-outlier-count'))).toBe(2);
    expect(group?.getAttribute('data-series-max-score')).toBeTruthy();
  });

  it('tooltip on dot shows raw + filtered + median + MAD + score + config', () => {
    render(<ChartLineHampel series={[spikeSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-hampel-dot"][data-point-index="7"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const raw = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-raw"]',
    );
    const filtered = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-filtered"]',
    );
    const median = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-median"]',
    );
    const mad = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-mad"]',
    );
    const score = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-score"]',
    );
    const config = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-config"]',
    );
    expect(raw?.textContent).toMatch(/raw:/);
    expect(filtered?.textContent).toMatch(/filtered:/);
    expect(median?.textContent).toMatch(/median:/);
    expect(mad?.textContent).toMatch(/MAD:/);
    expect(score?.textContent).toMatch(/score:/);
    expect(config?.textContent).toMatch(/W=/);
  });

  it('tooltip label includes OUTLIER suffix for outliers', () => {
    render(<ChartLineHampel series={[spikeSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-hampel-dot"][data-point-index="7"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const label = document.querySelector(
      '[data-section="chart-line-hampel-tooltip-label"]',
    );
    expect(label?.textContent).toMatch(/OUTLIER/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineHampel series={[spikeSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-hampel-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-hampel-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineHampel series={[spikeSeries]} showDots showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-hampel-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-hampel-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with point payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineHampel
        series={[spikeSeries]}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-hampel-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(3);
  });

  it('fires onOutlierClick from the outlier marker', () => {
    const onOutlierClick = vi.fn();
    render(
      <ChartLineHampel
        series={[spikeSeries]}
        onOutlierClick={onOutlierClick}
      />,
    );
    const outlierDot = document.querySelector(
      '[data-section="chart-line-hampel-outlier-dot"]',
    ) as HTMLElement;
    fireEvent.click(outlierDot);
    expect(onOutlierClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows outlier count + max score per series', () => {
    render(<ChartLineHampel series={[spikeSeries]} />);
    const stats = document.querySelector(
      '[data-section="chart-line-hampel-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/2 outliers/);
    expect(stats?.textContent).toMatch(/sigma/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineHampel series={[spikeSeries]} onSeriesToggle={onToggle} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-hampel-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: spikeSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineHampel series={[spikeSeries]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-hampel-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineHampel series={[spikeSeries]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hampel"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineHampel series={[spikeSeries]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hampel"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHampel ref={ref} series={[spikeSeries]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineHampel.displayName).toBe('ChartLineHampel');
  });
});
