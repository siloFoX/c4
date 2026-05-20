import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineSavgol,
  DEFAULT_CHART_LINE_SAVGOL_HEIGHT,
  DEFAULT_CHART_LINE_SAVGOL_PALETTE,
  DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER,
  DEFAULT_CHART_LINE_SAVGOL_WIDTH,
  DEFAULT_CHART_LINE_SAVGOL_WINDOW,
  applyLineSavgol,
  classifyLineSavgolResidualSign,
  computeLineSavgolLayout,
  computeSavgolCoefficients,
  describeLineSavgolChart,
  getLineSavgolDefaultColor,
  getLineSavgolFinitePoints,
  normaliseLineSavgolPolyOrder,
  normaliseLineSavgolWindow,
  runLineSavgol,
  type ChartLineSavgolSeries,
} from './chart-line-savgol';

// Noisy version of a smooth parabola: y = (x-15)^2 + small alternating noise
const parabolaWithNoise = Array.from({ length: 30 }, (_, n) => ({
  x: n,
  y: (n - 15) ** 2 + (n % 2 === 0 ? 0.5 : -0.5),
}));

const parabolaSeries: ChartLineSavgolSeries = {
  id: 'p',
  label: 'Parabola',
  data: parabolaWithNoise,
};

const flatData = Array.from({ length: 20 }, (_, n) => ({
  x: n,
  y: 5,
}));

const flatSeries: ChartLineSavgolSeries = {
  id: 'f',
  label: 'Flat',
  data: flatData,
};

describe('chart-line-savgol: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_SAVGOL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_SAVGOL_HEIGHT).toBeGreaterThan(0);
  });

  it('default window is odd and >= 3', () => {
    expect(DEFAULT_CHART_LINE_SAVGOL_WINDOW).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_CHART_LINE_SAVGOL_WINDOW % 2).toBe(1);
  });

  it('default poly order >= 0 and < window', () => {
    expect(DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER).toBeLessThan(
      DEFAULT_CHART_LINE_SAVGOL_WINDOW,
    );
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_SAVGOL_PALETTE.length).toBe(10);
  });
});

describe('getLineSavgolDefaultColor', () => {
  it('cycles palette', () => {
    expect(getLineSavgolDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_PALETTE[0],
    );
    expect(getLineSavgolDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineSavgolDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_PALETTE[0],
    );
    expect(getLineSavgolDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_PALETTE[0],
    );
  });
});

describe('getLineSavgolFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineSavgolFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineSavgolFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineSavgolWindow', () => {
  it('default for non-finite', () => {
    expect(normaliseLineSavgolWindow(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_WINDOW,
    );
  });

  it('clamps to >= 3', () => {
    expect(normaliseLineSavgolWindow(0)).toBe(3);
    expect(normaliseLineSavgolWindow(2)).toBe(3);
  });

  it('rounds even up to next odd', () => {
    expect(normaliseLineSavgolWindow(6)).toBe(7);
    expect(normaliseLineSavgolWindow(10)).toBe(11);
  });

  it('identity for valid odd', () => {
    expect(normaliseLineSavgolWindow(7)).toBe(7);
    expect(normaliseLineSavgolWindow(11)).toBe(11);
  });

  it('floors fractional before parity adjustment', () => {
    expect(normaliseLineSavgolWindow(7.9)).toBe(7);
    expect(normaliseLineSavgolWindow(6.9)).toBe(7);
  });
});

describe('normaliseLineSavgolPolyOrder', () => {
  it('default for non-finite', () => {
    expect(normaliseLineSavgolPolyOrder(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_SAVGOL_POLY_ORDER,
    );
  });

  it('clamps to >= 0', () => {
    expect(normaliseLineSavgolPolyOrder(-2)).toBe(0);
  });

  it('floors fractional', () => {
    expect(normaliseLineSavgolPolyOrder(3.9)).toBe(3);
  });
});

describe('computeSavgolCoefficients', () => {
  it('returns null for invalid window', () => {
    expect(computeSavgolCoefficients(2, 1)).toBeNull();
    expect(computeSavgolCoefficients(4, 1)).toBeNull(); // even
    expect(computeSavgolCoefficients(Number.NaN, 1)).toBeNull();
  });

  it('returns null when polyOrder >= window', () => {
    expect(computeSavgolCoefficients(5, 5)).toBeNull();
    expect(computeSavgolCoefficients(5, -1)).toBeNull();
  });

  it('returns null for non-finite poly order', () => {
    expect(computeSavgolCoefficients(5, Number.NaN)).toBeNull();
  });

  it('poly order 0 gives uniform 1/N kernel (SMA equivalent)', () => {
    const c = computeSavgolCoefficients(5, 0)!;
    for (const v of c) {
      expect(v).toBeCloseTo(0.2, 5);
    }
  });

  it('canonical SG window=5 order=2 coefficients are [-3,12,17,12,-3]/35', () => {
    const c = computeSavgolCoefficients(5, 2)!;
    expect(c[0]).toBeCloseTo(-3 / 35, 5);
    expect(c[1]).toBeCloseTo(12 / 35, 5);
    expect(c[2]).toBeCloseTo(17 / 35, 5);
    expect(c[3]).toBeCloseTo(12 / 35, 5);
    expect(c[4]).toBeCloseTo(-3 / 35, 5);
  });

  it('canonical SG window=7 order=2 coefficients are [-2,3,6,7,6,3,-2]/21', () => {
    const c = computeSavgolCoefficients(7, 2)!;
    expect(c[0]).toBeCloseTo(-2 / 21, 5);
    expect(c[1]).toBeCloseTo(3 / 21, 5);
    expect(c[2]).toBeCloseTo(6 / 21, 5);
    expect(c[3]).toBeCloseTo(7 / 21, 5);
    expect(c[4]).toBeCloseTo(6 / 21, 5);
    expect(c[5]).toBeCloseTo(3 / 21, 5);
    expect(c[6]).toBeCloseTo(-2 / 21, 5);
  });

  it('kernel is symmetric around the center', () => {
    const c = computeSavgolCoefficients(9, 3)!;
    for (let i = 0; i < c.length; i += 1) {
      expect(c[i]).toBeCloseTo(c[c.length - 1 - i]!, 8);
    }
  });

  it('coefficient sum is 1 (preserves DC)', () => {
    const c = computeSavgolCoefficients(11, 3)!;
    const sum = c.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });
});

describe('classifyLineSavgolResidualSign', () => {
  it('positive / negative / zero', () => {
    expect(classifyLineSavgolResidualSign(1)).toBe('positive');
    expect(classifyLineSavgolResidualSign(-1)).toBe('negative');
    expect(classifyLineSavgolResidualSign(0)).toBe('zero');
  });

  it('null / non-finite -> zero', () => {
    expect(classifyLineSavgolResidualSign(null)).toBe('zero');
    expect(classifyLineSavgolResidualSign(Number.NaN)).toBe('zero');
  });
});

describe('applyLineSavgol', () => {
  it('returns [] for non-array', () => {
    expect(applyLineSavgol(null, 5, 2)).toEqual([]);
  });

  it('returns all-null when input shorter than window', () => {
    const out = applyLineSavgol([1, 2, 3], 5, 2);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('first and last m entries are null at the edges', () => {
    const out = applyLineSavgol([1, 2, 3, 4, 5, 6, 7], 5, 2);
    // m = 2 -> first 2 and last 2 are null
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).not.toBeNull();
    expect(out[4]).not.toBeNull();
    expect(out[5]).toBeNull();
    expect(out[6]).toBeNull();
  });

  it('constant input passes through unchanged', () => {
    const out = applyLineSavgol([5, 5, 5, 5, 5, 5, 5, 5, 5], 5, 2);
    for (let i = 2; i < 7; i += 1) {
      expect(out[i]).toBeCloseTo(5, 5);
    }
  });

  it('linear input preserved exactly (order >= 1)', () => {
    // SG with polyOrder >= 1 reproduces linear inputs exactly at interior
    const vals = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
    const out = applyLineSavgol(vals, 5, 2);
    for (let i = 2; i < vals.length - 2; i += 1) {
      expect(out[i]).toBeCloseTo(vals[i]!, 5);
    }
  });

  it('quadratic input preserved exactly when polyOrder >= 2', () => {
    const vals = Array.from({ length: 11 }, (_, i) => (i - 5) ** 2);
    const out = applyLineSavgol(vals, 5, 2);
    for (let i = 2; i < vals.length - 2; i += 1) {
      expect(out[i]).toBeCloseTo(vals[i]!, 5);
    }
  });

  it('non-finite within window -> null at that position', () => {
    const vals = [1, 2, 3, Number.NaN, 5, 6, 7];
    const out = applyLineSavgol(vals, 5, 2);
    expect(out[2]).toBeNull(); // window 0..4 contains NaN
    expect(out[4]).toBeNull();
  });

  it('drops the polynomial order to at most W-1', () => {
    // polyOrder=5 with window=3 -> effectively clamped to W-1=2
    const out = applyLineSavgol([1, 2, 3, 4, 5], 3, 5);
    // m=1 -> interior i=1..3 should be filled
    expect(out[0]).toBeNull();
    expect(out[1]).not.toBeNull();
    expect(out[4]).toBeNull();
  });
});

describe('runLineSavgol', () => {
  it('returns empty samples for null input', () => {
    const r = runLineSavgol(null);
    expect(r.samples).toEqual([]);
    expect(r.coefficients).toHaveLength(DEFAULT_CHART_LINE_SAVGOL_WINDOW);
  });

  it('attaches smoothed + residual per sample', () => {
    const r = runLineSavgol(parabolaWithNoise, {
      windowLength: 7,
      polyOrder: 2,
    });
    expect(r.samples).toHaveLength(30);
    expect(r.windowLength).toBe(7);
    expect(r.polyOrder).toBe(2);
    const middle = r.samples[15]!;
    expect(middle.smoothed).not.toBeNull();
    expect(middle.residual).not.toBeNull();
  });

  it('smoothing reduces noise (RMSE of residuals < raw noise amplitude)', () => {
    const r = runLineSavgol(parabolaWithNoise, {
      windowLength: 7,
      polyOrder: 2,
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
    expect(rmse).toBeLessThan(0.55); // raw noise amplitude is 0.5
  });

  it('sorts ascending by x before smoothing', () => {
    const shuffled = [...parabolaWithNoise].sort(() => -1);
    const r = runLineSavgol(shuffled, { windowLength: 5 });
    expect(r.samples.map((s) => s.x)).toEqual(
      [...parabolaWithNoise].sort((a, b) => a.x - b.x).map((p) => p.x),
    );
  });

  it('drops non-finite before smoothing', () => {
    const withNan = [...parabolaWithNoise];
    withNan.splice(5, 1, { x: 5, y: Number.NaN });
    const r = runLineSavgol(withNan);
    expect(r.samples.length).toBe(29);
  });
});

describe('computeLineSavgolLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineSavgolLayout({
      series: [],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineSavgolLayout({
      series: [parabolaSeries],
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw + smoothed paths per series', () => {
    const layout = computeLineSavgolLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 7,
      polyOrder: 2,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.rawPath.length).toBeGreaterThan(0);
    expect(s.smoothedPath.length).toBeGreaterThan(0);
  });

  it('records window length + poly order + coefficients per series', () => {
    const layout = computeLineSavgolLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 7,
      polyOrder: 2,
    });
    const s = layout.series[0]!;
    expect(s.windowLength).toBe(7);
    expect(s.polyOrder).toBe(2);
    expect(s.coefficients).toHaveLength(7);
  });

  it('records RMSE residual and counts', () => {
    const layout = computeLineSavgolLayout({
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
    const layout = computeLineSavgolLayout({
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
    const layout = computeLineSavgolLayout({
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

  it('per-series windowLength override beats chart-level', () => {
    const layout = computeLineSavgolLayout({
      series: [{ ...parabolaSeries, windowLength: 9 }],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 5,
    });
    expect(layout.series[0]?.windowLength).toBe(9);
  });

  it('per-series polyOrder override beats chart-level', () => {
    const layout = computeLineSavgolLayout({
      series: [{ ...parabolaSeries, polyOrder: 4 }],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 9,
      polyOrder: 2,
    });
    expect(layout.series[0]?.polyOrder).toBe(4);
  });

  it('per-point smoothedPy null at the edges', () => {
    const layout = computeLineSavgolLayout({
      series: [parabolaSeries],
      width: 500,
      height: 320,
      padding: 40,
      windowLength: 7,
    });
    const points = layout.series[0]!.points;
    expect(points[0]?.smoothedPy).toBeNull();
    expect(points[points.length - 1]?.smoothedPy).toBeNull();
  });

  it('totalPoints sums per series', () => {
    const layout = computeLineSavgolLayout({
      series: [parabolaSeries, flatSeries],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.totalPoints).toBe(30 + 20);
    expect(layout.visibleSeriesCount).toBe(2);
  });
});

describe('describeLineSavgolChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineSavgolChart([])).toBe('No data');
    expect(describeLineSavgolChart(null)).toBe('No data');
  });

  it('mentions window + order per series', () => {
    const desc = describeLineSavgolChart([parabolaSeries], {
      windowLength: 7,
      polyOrder: 2,
    });
    expect(desc).toMatch(/Savitzky-Golay window 7/);
    expect(desc).toMatch(/order 2/);
  });
});

describe('<ChartLineSavgol> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineSavgol series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-savgol"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with kind=raw', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-savgol-raw-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders smoothed path with kind=smoothed', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} />);
    const path = document.querySelector(
      '[data-section="chart-line-savgol-smoothed-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('smoothed');
  });

  it('hides raw via showRaw=false', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-savgol-raw-path"]'),
    ).toBeNull();
  });

  it('renders residual sticks when showResidualSticks=true', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} showResidualSticks />);
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-savgol-residual-stick"]',
    );
    expect(sticks.length).toBeGreaterThan(0);
  });

  it('omits residual sticks by default', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-savgol-residual-stick"]',
      ).length,
    ).toBe(0);
  });

  it('renders dots when showDots=true', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-savgol-dot"]',
    );
    expect(dots.length).toBe(parabolaWithNoise.length);
  });

  it('hides dots by default (showDots=false default)', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-savgol-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders config badge with window + order + sum', () => {
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        windowLength={7}
        polyOrder={2}
      />,
    );
    const badge = document.querySelector(
      '[data-section="chart-line-savgol-badge"]',
    );
    expect(Number(badge?.getAttribute('data-window-length'))).toBe(7);
    expect(Number(badge?.getAttribute('data-poly-order'))).toBe(2);
    // sum of SG kernel is 1
    expect(
      Number(badge?.getAttribute('data-coefficient-sum')),
    ).toBeCloseTo(1, 5);
  });

  it('hides badge via showConfigBadge=false', () => {
    render(
      <ChartLineSavgol series={[parabolaSeries]} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-savgol-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} ariaLabel="sg" />);
    const region = screen.getByRole('region', { name: 'sg' });
    const img = within(region).getByRole('img', { name: 'sg' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        windowLength={7}
        polyOrder={2}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-savgol"]',
    );
    expect(root?.getAttribute('data-window-length')).toBe('7');
    expect(root?.getAttribute('data-poly-order')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('30');
    expect(
      Number(root?.getAttribute('data-dominant-coefficient-sum')),
    ).toBeCloseTo(1, 5);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} />);
    const group = document.querySelector(
      '[data-section="chart-line-savgol-series-group"]',
    );
    expect(
      Number(group?.getAttribute('data-series-window-length')),
    ).toBeGreaterThan(0);
    expect(group?.getAttribute('data-series-poly-order')).toBeTruthy();
    expect(group?.getAttribute('data-series-rmse')).toBeTruthy();
  });

  it('tooltip on dot hover shows raw + smoothed + residual + config', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-savgol-dot"][data-point-index="15"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const raw = document.querySelector(
      '[data-section="chart-line-savgol-tooltip-raw"]',
    );
    const smoothed = document.querySelector(
      '[data-section="chart-line-savgol-tooltip-smoothed"]',
    );
    const residual = document.querySelector(
      '[data-section="chart-line-savgol-tooltip-residual"]',
    );
    const config = document.querySelector(
      '[data-section="chart-line-savgol-tooltip-config"]',
    );
    expect(raw?.textContent).toMatch(/raw:/);
    expect(smoothed?.textContent).toMatch(/smoothed:/);
    expect(residual?.textContent).toMatch(/residual:/);
    expect(config?.textContent).toMatch(/W=/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineSavgol series={[parabolaSeries]} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-savgol-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-savgol-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-savgol-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-savgol-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick with payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-savgol-dot"][data-point-index="10"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(10);
  });

  it('legend shows window + order + RMSE per series', () => {
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        windowLength={7}
        polyOrder={2}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-savgol-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/W=7/);
    expect(stats?.textContent).toMatch(/p=2/);
    expect(stats?.textContent).toMatch(/rmse/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineSavgol
        series={[parabolaSeries]}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-savgol-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: parabolaSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineSavgol series={[parabolaSeries]} showLegend={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-savgol-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineSavgol series={[parabolaSeries]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-savgol"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineSavgol series={[parabolaSeries]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-savgol"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSavgol ref={ref} series={[parabolaSeries]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineSavgol.displayName).toBe('ChartLineSavgol');
  });
});
