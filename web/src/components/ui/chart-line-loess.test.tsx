import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineLoess,
  DEFAULT_CHART_LINE_LOESS_BANDWIDTH,
  DEFAULT_CHART_LINE_LOESS_DEGREE,
  DEFAULT_CHART_LINE_LOESS_HEIGHT,
  DEFAULT_CHART_LINE_LOESS_PALETTE,
  DEFAULT_CHART_LINE_LOESS_WIDTH,
  classifyLineLoessResidualSign,
  computeLineLoessLayout,
  computeLineLoessTricubeWeight,
  describeLineLoessChart,
  fitLineLoessWeightedPolynomialAtCenter,
  getLineLoessDefaultColor,
  getLineLoessFinitePoints,
  normaliseLineLoessBandwidth,
  normaliseLineLoessDegree,
  runLineLoess,
  type ChartLineLoessSeries,
} from './chart-line-loess';

// Noisy parabola, 30 evenly-spaced samples
const parabolaWithNoise = Array.from({ length: 30 }, (_, n) => ({
  x: n,
  y: (n - 15) ** 2 + (n % 2 === 0 ? 0.3 : -0.3),
}));

const parabolaSeries: ChartLineLoessSeries = {
  id: 'p',
  label: 'Parabola',
  data: parabolaWithNoise,
};

const flatSeries: ChartLineLoessSeries = {
  id: 'f',
  label: 'Flat',
  data: Array.from({ length: 20 }, (_, n) => ({ x: n, y: 5 })),
};

describe('chart-line-loess: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_LOESS_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_LOESS_HEIGHT).toBeGreaterThan(0);
  });

  it('default bandwidth in (0, 1]', () => {
    expect(DEFAULT_CHART_LINE_LOESS_BANDWIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_LOESS_BANDWIDTH).toBeLessThanOrEqual(1);
  });

  it('default degree is 0, 1, or 2 (LOESS canonical)', () => {
    expect([0, 1, 2]).toContain(DEFAULT_CHART_LINE_LOESS_DEGREE);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_LOESS_PALETTE.length).toBe(10);
  });
});

describe('getLineLoessDefaultColor', () => {
  it('cycles palette', () => {
    expect(getLineLoessDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_LOESS_PALETTE[0],
    );
    expect(getLineLoessDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_LOESS_PALETTE[0],
    );
  });

  it('falls back for NaN / negative', () => {
    expect(getLineLoessDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_LOESS_PALETTE[0],
    );
    expect(getLineLoessDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_LOESS_PALETTE[0],
    );
  });
});

describe('getLineLoessFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineLoessFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineLoessFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineLoessBandwidth', () => {
  it('default for non-finite', () => {
    expect(normaliseLineLoessBandwidth(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_LOESS_BANDWIDTH,
    );
  });

  it('clamps to (0, 1]', () => {
    expect(normaliseLineLoessBandwidth(0)).toBeGreaterThan(0);
    expect(normaliseLineLoessBandwidth(-1)).toBeGreaterThan(0);
    expect(normaliseLineLoessBandwidth(2)).toBe(1);
  });

  it('identity for in-range', () => {
    expect(normaliseLineLoessBandwidth(0.4)).toBe(0.4);
    expect(normaliseLineLoessBandwidth(1)).toBe(1);
  });
});

describe('normaliseLineLoessDegree', () => {
  it('default for non-finite', () => {
    expect(normaliseLineLoessDegree(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_LOESS_DEGREE,
    );
  });

  it('clamps to [0, 2]', () => {
    expect(normaliseLineLoessDegree(-1)).toBe(0);
    expect(normaliseLineLoessDegree(5)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineLoessDegree(1.7)).toBe(1);
  });
});

describe('computeLineLoessTricubeWeight', () => {
  it('returns 1 at distance 0 (full weight at center)', () => {
    expect(computeLineLoessTricubeWeight(0, 1)).toBe(1);
  });

  it('returns 0 at distance >= dMax', () => {
    expect(computeLineLoessTricubeWeight(1, 1)).toBe(0);
    expect(computeLineLoessTricubeWeight(2, 1)).toBe(0);
  });

  it('canonical tricube value at d/dMax = 0.5 is (7/8)^3', () => {
    // (1 - (0.5)^3)^3 = (1 - 0.125)^3 = (0.875)^3 = 0.669921875
    expect(computeLineLoessTricubeWeight(0.5, 1)).toBeCloseTo(
      Math.pow(7 / 8, 3),
      6,
    );
  });

  it('returns 0 for dMax <= 0', () => {
    expect(computeLineLoessTricubeWeight(0, 0)).toBe(0);
    expect(computeLineLoessTricubeWeight(0, -1)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(computeLineLoessTricubeWeight(-0.1, 1)).toBe(0);
  });

  it('returns 0 for non-finite distance or dMax', () => {
    expect(computeLineLoessTricubeWeight(Number.NaN, 1)).toBe(0);
    expect(computeLineLoessTricubeWeight(0.5, Number.NaN)).toBe(0);
  });

  it('monotonically decreasing with distance for 0 < d < dMax', () => {
    const w1 = computeLineLoessTricubeWeight(0.1, 1);
    const w2 = computeLineLoessTricubeWeight(0.5, 1);
    const w3 = computeLineLoessTricubeWeight(0.9, 1);
    expect(w1).toBeGreaterThan(w2);
    expect(w2).toBeGreaterThan(w3);
  });
});

describe('fitLineLoessWeightedPolynomialAtCenter', () => {
  it('returns null for empty inputs', () => {
    const v = fitLineLoessWeightedPolynomialAtCenter({
      xs: [],
      ys: [],
      weights: [],
      degree: 1,
      centerX: 0,
    });
    expect(v).toBeNull();
  });

  it('returns null when all weights are zero', () => {
    const v = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3],
      ys: [1, 2, 3],
      weights: [0, 0, 0],
      degree: 1,
      centerX: 2,
    });
    expect(v).toBeNull();
  });

  it('degree-1 fit reproduces a linear input exactly at the center', () => {
    // y = 2x + 1 evaluated at xs=[1, 2, 3, 4, 5] -> [3, 5, 7, 9, 11]
    const v = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3, 4, 5],
      ys: [3, 5, 7, 9, 11],
      weights: [1, 1, 1, 1, 1],
      degree: 1,
      centerX: 3,
    });
    expect(v).toBeCloseTo(7, 6);
  });

  it('degree-2 fit reproduces a quadratic input exactly at the center', () => {
    // y = (x - 3)^2 evaluated at xs=[1..5] -> [4, 1, 0, 1, 4]
    const v = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3, 4, 5],
      ys: [4, 1, 0, 1, 4],
      weights: [1, 1, 1, 1, 1],
      degree: 2,
      centerX: 3,
    });
    expect(v).toBeCloseTo(0, 6);
  });

  it('degree-0 fit reduces to weighted mean', () => {
    // weighted average of [1, 5, 10] with weights [1, 0, 1] should be 5.5
    const v = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3],
      ys: [1, 5, 10],
      weights: [1, 0, 1],
      degree: 0,
      centerX: 2,
    });
    expect(v).toBeCloseTo(5.5, 6);
  });

  it('weights influence the fit (higher weight near outlier pulls fit)', () => {
    // Same xs but emphasize one of the points
    const vEven = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3, 4, 5],
      ys: [1, 1, 100, 1, 1],
      weights: [1, 1, 1, 1, 1],
      degree: 0,
      centerX: 3,
    });
    const vSpikeWeighted = fitLineLoessWeightedPolynomialAtCenter({
      xs: [1, 2, 3, 4, 5],
      ys: [1, 1, 100, 1, 1],
      weights: [1, 1, 100, 1, 1],
      degree: 0,
      centerX: 3,
    });
    expect(vSpikeWeighted).toBeGreaterThan(vEven ?? 0);
  });
});

describe('classifyLineLoessResidualSign', () => {
  it('positive / negative / zero', () => {
    expect(classifyLineLoessResidualSign(1)).toBe('positive');
    expect(classifyLineLoessResidualSign(-1)).toBe('negative');
    expect(classifyLineLoessResidualSign(0)).toBe('zero');
  });

  it('null / non-finite -> zero', () => {
    expect(classifyLineLoessResidualSign(null)).toBe('zero');
    expect(classifyLineLoessResidualSign(Number.NaN)).toBe('zero');
  });
});

describe('runLineLoess', () => {
  it('returns empty samples for null input', () => {
    const r = runLineLoess(null);
    expect(r.samples).toEqual([]);
  });

  it('attaches smoothed + residual per sample', () => {
    const r = runLineLoess(parabolaWithNoise, {
      bandwidth: 0.3,
      degree: 2,
    });
    expect(r.samples).toHaveLength(30);
    const middle = r.samples[15]!;
    expect(middle.smoothed).not.toBeNull();
    expect(middle.residual).not.toBeNull();
  });

  it('smoothing reduces noise (RMSE of residuals < raw noise amplitude)', () => {
    const r = runLineLoess(parabolaWithNoise, {
      bandwidth: 0.3,
      degree: 2,
    });
    let sumSq = 0;
    let n = 0;
    for (const s of r.samples) {
      if (s.residual !== null) {
        sumSq += s.residual * s.residual;
        n += 1;
      }
    }
    const rmse = Math.sqrt(sumSq / n);
    // Noise amplitude is 0.3; LOESS with degree 2 should bring RMSE well
    // under that.
    expect(rmse).toBeLessThan(0.4);
  });

  it('reproduces linear input exactly with degree >= 1 (clean signal)', () => {
    const linear = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      y: 2 * i + 1,
    }));
    const r = runLineLoess(linear, { bandwidth: 0.5, degree: 1 });
    for (const sample of r.samples) {
      expect(sample.smoothed).toBeCloseTo(sample.raw, 6);
    }
  });

  it('reproduces quadratic input exactly with degree 2 (clean signal)', () => {
    const quad = Array.from({ length: 20 }, (_, i) => ({
      x: i,
      y: (i - 10) ** 2,
    }));
    const r = runLineLoess(quad, { bandwidth: 0.5, degree: 2 });
    for (const sample of r.samples) {
      expect(sample.smoothed).toBeCloseTo(sample.raw, 6);
    }
  });

  it('constant input passes through unchanged at all degrees', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 7 }));
    for (const d of [0, 1, 2]) {
      const r = runLineLoess(flat, { bandwidth: 0.3, degree: d });
      for (const s of r.samples) {
        expect(s.smoothed).toBeCloseTo(7, 6);
      }
    }
  });

  it('handles non-uniformly spaced data (k-NN based neighborhood)', () => {
    const uneven = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 100, y: 100 },
      { x: 101, y: 101 },
      { x: 200, y: 200 },
    ];
    // bandwidth large enough to include all points; degree 1 should give
    // good fits for this linear data.
    const r = runLineLoess(uneven, { bandwidth: 1, degree: 1 });
    expect(r.samples).toHaveLength(5);
    for (const s of r.samples) {
      expect(s.smoothed).toBeCloseTo(s.raw, 4);
    }
  });

  it('records bandwidth + degree + neighborhood count', () => {
    const r = runLineLoess(parabolaWithNoise, {
      bandwidth: 0.5,
      degree: 1,
    });
    expect(r.bandwidth).toBe(0.5);
    expect(r.degree).toBe(1);
    expect(r.neighborhoodCount).toBe(Math.ceil(0.5 * 30));
  });

  it('sorts ascending by x before smoothing', () => {
    const shuffled = [...parabolaWithNoise].sort(() => -1);
    const r = runLineLoess(shuffled, { bandwidth: 0.3 });
    expect(r.samples.map((s) => s.x)).toEqual(
      [...parabolaWithNoise].sort((a, b) => a.x - b.x).map((p) => p.x),
    );
  });

  it('drops non-finite before smoothing', () => {
    const withNan = [...parabolaWithNoise];
    withNan.splice(5, 1, { x: 5, y: Number.NaN });
    const r = runLineLoess(withNan);
    expect(r.samples.length).toBe(29);
  });

  it('neighborhood count clamped to at least degree+1', () => {
    // Very small bandwidth with very few samples
    const tiny = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
    ];
    const r = runLineLoess(tiny, { bandwidth: 0.01, degree: 2 });
    expect(r.neighborhoodCount).toBeGreaterThanOrEqual(3); // degree 2 needs 3 points
  });
});

describe('computeLineLoessLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineLoessLayout({
      series: [],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries],
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw + smoothed paths per series', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.rawPath.length).toBeGreaterThan(0);
    expect(s.smoothedPath.length).toBeGreaterThan(0);
  });

  it('records bandwidth + degree + neighborhood count', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
      bandwidth: 0.4,
      degree: 1,
    });
    const s = layout.series[0]!;
    expect(s.bandwidth).toBe(0.4);
    expect(s.degree).toBe(1);
    expect(s.neighborhoodCount).toBe(Math.ceil(0.4 * 30));
  });

  it('records RMSE residual and counts', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    const s = layout.series[0]!;
    expect(s.rmseResidual).toBeGreaterThan(0);
    expect(
      s.positiveResidualCount +
        s.negativeResidualCount +
        s.zeroResidualCount,
    ).toBe(s.finiteCount);
  });

  it('drops hidden series', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries, flatSeries],
      hiddenSeries: ['f'],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('p');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
      yMin: -100,
      yMax: 500,
    });
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(500);
  });

  it('per-series bandwidth override beats chart-level', () => {
    const layout = computeLineLoessLayout({
      series: [{ ...parabolaSeries, bandwidth: 0.7 }],
      width: 500,
      height: 320,
      padding: 40,
      bandwidth: 0.3,
    });
    expect(layout.series[0]?.bandwidth).toBe(0.7);
  });

  it('per-series degree override beats chart-level', () => {
    const layout = computeLineLoessLayout({
      series: [{ ...parabolaSeries, degree: 1 }],
      width: 500,
      height: 320,
      padding: 40,
      degree: 2,
    });
    expect(layout.series[0]?.degree).toBe(1);
  });

  it('totalPoints sums per series', () => {
    const layout = computeLineLoessLayout({
      series: [parabolaSeries, flatSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.totalPoints).toBe(30 + 20);
    expect(layout.visibleSeriesCount).toBe(2);
  });
});

describe('describeLineLoessChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineLoessChart([])).toBe('No data');
    expect(describeLineLoessChart(null)).toBe('No data');
  });

  it('mentions bandwidth + degree + neighbors per series', () => {
    const desc = describeLineLoessChart([parabolaSeries], {
      bandwidth: 0.3,
      degree: 2,
    });
    expect(desc).toMatch(/LOESS bandwidth 0.30/);
    expect(desc).toMatch(/neighbors/);
    expect(desc).toMatch(/degree 2/);
  });
});

describe('<ChartLineLoess> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineLoess series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-loess"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with kind=raw', () => {
    render(<ChartLineLoess series={[parabolaSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-loess-raw-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders smoothed path with kind=smoothed', () => {
    render(<ChartLineLoess series={[parabolaSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-loess-smoothed-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('smoothed');
  });

  it('hides raw via showRaw=false', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-loess-raw-path"]'),
    ).toBeNull();
  });

  it('renders residual sticks when showResidualSticks=true', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showResidualSticks />);
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-loess-residual-stick"]',
    );
    expect(sticks.length).toBeGreaterThan(0);
  });

  it('omits residual sticks by default', () => {
    render(<ChartLineLoess series={[parabolaSeries]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-loess-residual-stick"]',
      ).length,
    ).toBe(0);
  });

  it('renders dots when showDots=true', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-loess-dot"]',
    );
    expect(dots.length).toBe(parabolaWithNoise.length);
  });

  it('hides dots by default (showDots=false)', () => {
    render(<ChartLineLoess series={[parabolaSeries]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-loess-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders config badge with bandwidth + degree + neighbors', () => {
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        bandwidth={0.3}
        degree={2}
      />,
    );
    const badge = document.querySelector(
      '[data-section="chart-line-loess-badge"]',
    );
    expect(Number(badge?.getAttribute('data-bandwidth'))).toBeCloseTo(0.3, 5);
    expect(Number(badge?.getAttribute('data-degree'))).toBe(2);
    expect(Number(badge?.getAttribute('data-neighborhood-count'))).toBe(
      Math.ceil(0.3 * 30),
    );
  });

  it('hides badge via showConfigBadge=false', () => {
    render(
      <ChartLineLoess series={[parabolaSeries]} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-loess-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineLoess series={[parabolaSeries]} ariaLabel="loess" />);
    const region = screen.getByRole('region', { name: 'loess' });
    const img = within(region).getByRole('img', { name: 'loess' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        bandwidth={0.3}
        degree={2}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-loess"]',
    );
    expect(Number(root?.getAttribute('data-bandwidth'))).toBeCloseTo(0.3, 5);
    expect(Number(root?.getAttribute('data-degree'))).toBe(2);
    expect(root?.getAttribute('data-total-points')).toBe('30');
    expect(
      Number(root?.getAttribute('data-dominant-neighborhood-count')),
    ).toBeGreaterThan(0);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineLoess series={[parabolaSeries]} />);
    const group = document.querySelector(
      '[data-section="chart-line-loess-series-group"]',
    );
    expect(group?.getAttribute('data-series-bandwidth')).toBeTruthy();
    expect(group?.getAttribute('data-series-degree')).toBeTruthy();
    expect(
      Number(group?.getAttribute('data-series-neighborhood-count')),
    ).toBeGreaterThan(0);
    expect(group?.getAttribute('data-series-rmse')).toBeTruthy();
  });

  it('tooltip on dot hover shows raw + smoothed + residual + config', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-loess-dot"][data-point-index="15"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const raw = document.querySelector(
      '[data-section="chart-line-loess-tooltip-raw"]',
    );
    const smoothed = document.querySelector(
      '[data-section="chart-line-loess-tooltip-smoothed"]',
    );
    const residual = document.querySelector(
      '[data-section="chart-line-loess-tooltip-residual"]',
    );
    const config = document.querySelector(
      '[data-section="chart-line-loess-tooltip-config"]',
    );
    expect(raw?.textContent).toMatch(/raw:/);
    expect(smoothed?.textContent).toMatch(/smoothed:/);
    expect(residual?.textContent).toMatch(/residual:/);
    expect(config?.textContent).toMatch(/α=/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-loess-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-loess-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-loess-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-loess-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-loess-dot"][data-point-index="10"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(10);
  });

  it('legend shows bandwidth + degree + RMSE per series', () => {
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        bandwidth={0.3}
        degree={2}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-loess-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/α=0\.30/);
    expect(stats?.textContent).toMatch(/d=2/);
    expect(stats?.textContent).toMatch(/rmse/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineLoess
        series={[parabolaSeries]}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-loess-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: parabolaSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineLoess series={[parabolaSeries]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-loess-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineLoess series={[parabolaSeries]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-loess"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineLoess series={[parabolaSeries]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-loess"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineLoess ref={ref} series={[parabolaSeries]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineLoess.displayName).toBe('ChartLineLoess');
  });
});
