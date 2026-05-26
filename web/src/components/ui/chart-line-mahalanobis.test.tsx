import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  CHART_LINE_MAHALANOBIS_DET_EPSILON,
  ChartLineMahalanobis,
  DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD,
  DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW,
  classifyLineMahalanobisZone,
  computeLineMahalanobisDistance,
  computeLineMahalanobisFeatures,
  computeLineMahalanobisLayout,
  computeLineMahalanobisRolling,
  computeLineMahalanobisStats,
  describeLineMahalanobisChart,
  getLineMahalanobisFinitePoints,
  normalizeLineMahalanobisThreshold,
  normalizeLineMahalanobisWindow,
  runLineMahalanobis,
  type ChartLineMahalanobisPoint,
} from './chart-line-mahalanobis';

const toPoints = (values: number[]): ChartLineMahalanobisPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineMahalanobisPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const RISING_LINEAR: ChartLineMahalanobisPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);
const VARIED: ChartLineMahalanobisPoint[] = toPoints([
  10, 12, 11, 13, 12, 14, 13, 15, 14, 16, 15, 17, 16, 18, 17, 19,
]);
const WAVE: ChartLineMahalanobisPoint[] = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { window: 5, threshold: 2 } as const;

describe('getLineMahalanobisFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineMahalanobisFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineMahalanobisFinitePoints(
        'nope' as unknown as ChartLineMahalanobisPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineMahalanobisPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineMahalanobisFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineMahalanobisFinitePoints(
      RISING_LINEAR.slice().reverse(),
    );
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING_LINEAR].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineMahalanobisWindow', () => {
  it('keeps a valid integer window', () => {
    expect(normalizeLineMahalanobisWindow(20, 20)).toBe(20);
  });

  it('floors a fractional window', () => {
    expect(normalizeLineMahalanobisWindow(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-3 window', () => {
    expect(normalizeLineMahalanobisWindow(2, 20)).toBe(20);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineMahalanobisWindow(Number.NaN, 20)).toBe(20);
  });

  it('falls back for a string', () => {
    expect(normalizeLineMahalanobisWindow('20' as unknown as number, 20)).toBe(
      20,
    );
  });
});

describe('normalizeLineMahalanobisThreshold', () => {
  it('keeps a positive threshold', () => {
    expect(normalizeLineMahalanobisThreshold(2.5, 2)).toBe(2.5);
  });

  it('falls back for zero', () => {
    expect(normalizeLineMahalanobisThreshold(0, 2)).toBe(2);
  });

  it('falls back for negative', () => {
    expect(normalizeLineMahalanobisThreshold(-1, 2)).toBe(2);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineMahalanobisThreshold(Number.NaN, 2)).toBe(2);
  });
});

describe('computeLineMahalanobisFeatures', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineMahalanobisFeatures(null as unknown as number[]),
    ).toEqual([]);
  });

  it('matches input length', () => {
    expect(
      computeLineMahalanobisFeatures(RISING_LINEAR.map((p) => p.value)),
    ).toHaveLength(RISING_LINEAR.length);
  });

  it('the first feature is null', () => {
    const out = computeLineMahalanobisFeatures(
      RISING_LINEAR.map((p) => p.value),
    );
    expect(out[0]).toBeNull();
  });

  it('uses [value, return] as the feature pair', () => {
    const out = computeLineMahalanobisFeatures([10, 12, 15]);
    expect(out[1]).toEqual({ value: 12, ret: 2 });
    expect(out[2]).toEqual({ value: 15, ret: 3 });
  });

  it('null at a non-finite bar', () => {
    const out = computeLineMahalanobisFeatures([1, 2, Number.NaN, 5]);
    expect(out[2]).toBeNull();
    expect(out[3]).toBeNull();
  });
});

describe('computeLineMahalanobisStats', () => {
  it('returns zero stats for an empty window', () => {
    const stats = computeLineMahalanobisStats([]);
    expect(stats.muValue).toBe(0);
    expect(stats.det).toBe(0);
  });

  it('computes the sample mean correctly', () => {
    const stats = computeLineMahalanobisStats([
      { value: 10, ret: 1 },
      { value: 12, ret: 2 },
      { value: 14, ret: 3 },
      { value: 16, ret: 4 },
    ]);
    expect(stats.muValue).toBe(13);
    expect(stats.muRet).toBe(2.5);
  });

  it('produces a singular covariance for perfectly correlated features', () => {
    const stats = computeLineMahalanobisStats([
      { value: 10, ret: 10 },
      { value: 12, ret: 12 },
      { value: 14, ret: 14 },
      { value: 16, ret: 16 },
    ]);
    expect(stats.det).toBeCloseTo(0, 10);
  });

  it('produces a non-singular covariance for varied features', () => {
    const stats = computeLineMahalanobisStats([
      { value: 1, ret: 0 },
      { value: 0, ret: 1 },
      { value: -1, ret: -1 },
    ]);
    expect(stats.det).toBeGreaterThan(0);
  });
});

describe('computeLineMahalanobisDistance', () => {
  it('returns null on a singular covariance', () => {
    const stats = computeLineMahalanobisStats([
      { value: 5, ret: 1 },
      { value: 5, ret: 1 },
      { value: 5, ret: 1 },
    ]);
    expect(stats.det).toBeCloseTo(0, 10);
    const d = computeLineMahalanobisDistance({ value: 5, ret: 1 }, stats);
    expect(d).toBeNull();
  });

  it('returns zero for a point exactly at the mean of a non-degenerate window', () => {
    const window = [
      { value: 1, ret: 0 },
      { value: 0, ret: 1 },
      { value: -1, ret: -1 },
    ];
    const stats = computeLineMahalanobisStats(window);
    const d = computeLineMahalanobisDistance(
      { value: stats.muValue, ret: stats.muRet },
      stats,
    );
    expect(d).toBeCloseTo(0, 10);
  });

  it('returns sqrt(2) for the symmetric anchor', () => {
    // mu = [0, 0], Sigma = (1/2) * [[2, 1], [1, 2]] = [[1, 0.5], [0.5, 1]] (sample cov, N-1).
    // det = 1 - 0.25 = 0.75. Sigma^(-1) = (1/0.75) * [[1, -0.5], [-0.5, 1]] = [[4/3, -2/3], [-2/3, 4/3]].
    // For feature [1, 0]: d^2 = 1 * 4/3 + 0 - 0 = 4/3. d = sqrt(4/3).
    const stats = computeLineMahalanobisStats([
      { value: 1, ret: 0 },
      { value: 0, ret: 1 },
      { value: -1, ret: -1 },
    ]);
    const d = computeLineMahalanobisDistance({ value: 1, ret: 0 }, stats);
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(Math.sqrt(4 / 3), 10);
  });

  it('the distance is non-negative for a non-degenerate window', () => {
    const stats = computeLineMahalanobisStats([
      { value: 1, ret: 0 },
      { value: 0, ret: 1 },
      { value: -1, ret: -1 },
    ]);
    for (const f of [
      { value: 2, ret: 2 },
      { value: -3, ret: 4 },
      { value: 0.5, ret: -0.5 },
    ]) {
      const d = computeLineMahalanobisDistance(f, stats);
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThanOrEqual(0);
    }
  });

  it('exposes a small singular-det epsilon', () => {
    expect(CHART_LINE_MAHALANOBIS_DET_EPSILON).toBeGreaterThan(0);
    expect(CHART_LINE_MAHALANOBIS_DET_EPSILON).toBeLessThan(1e-6);
  });
});

describe('computeLineMahalanobisRolling', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineMahalanobisRolling(null as unknown as number[], 5),
    ).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineMahalanobisRolling(
      RISING_LINEAR.map((p) => p.value),
      5,
    );
    expect(out).toHaveLength(RISING_LINEAR.length);
  });

  it('leaves the first window bars null (the warm-up)', () => {
    const out = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      5,
    );
    for (let i = 0; i < 5; i += 1) expect(out[i]).toBeNull();
  });

  it('a constant series produces a null distance at every defined bar (singular covariance)', () => {
    const out = computeLineMahalanobisRolling(
      CONST_FLAT.map((p) => p.value),
      5,
    );
    for (const d of out) expect(d).toBeNull();
  });

  it('a linear ramp produces a null distance at every defined bar (perfectly correlated features)', () => {
    const out = computeLineMahalanobisRolling(
      RISING_LINEAR.map((p) => p.value),
      5,
    );
    for (const d of out) expect(d).toBeNull();
  });

  it('a varied series produces a finite non-negative distance at every defined bar', () => {
    const out = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      5,
    );
    for (let i = 5; i < out.length; i += 1) {
      const d = out[i];
      expect(d).not.toBeNull();
      expect(d!).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(d!)).toBe(true);
    }
  });

  it('translation invariance: shifting all values by k leaves the distances within ULP (the algebraic anchor)', () => {
    const k = 1000;
    const a = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      5,
    );
    const b = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value + k),
      5,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) {
        expect(b[i]).toBeNull();
      } else {
        expect(b[i]!).toBeCloseTo(a[i]!, 10);
      }
    }
  });

  it('translation invariance also holds for negative shifts', () => {
    const a = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      5,
    );
    const b = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value - 50),
      5,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) {
        expect(b[i]).toBeNull();
      } else {
        expect(b[i]!).toBeCloseTo(a[i]!, 10);
      }
    }
  });

  it('scale invariance: scaling all values by a power of two leaves the distances within ULP (the algebraic anchor)', () => {
    const a = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      5,
    );
    const b = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value * 2),
      5,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) {
        expect(b[i]).toBeNull();
      } else {
        expect(b[i]!).toBeCloseTo(a[i]!, 10);
      }
    }
  });

  it('respects sub-3 / non-finite window via the fallback', () => {
    const out = computeLineMahalanobisRolling(
      VARIED.map((p) => p.value),
      Number.NaN,
    );
    expect(out).toHaveLength(VARIED.length);
  });
});

describe('classifyLineMahalanobisZone', () => {
  it('null distance -> none', () => {
    expect(classifyLineMahalanobisZone(null, 2)).toBe('none');
  });

  it('non-finite distance -> none', () => {
    expect(classifyLineMahalanobisZone(Number.NaN, 2)).toBe('none');
  });

  it('distance below threshold -> normal', () => {
    expect(classifyLineMahalanobisZone(1.5, 2)).toBe('normal');
  });

  it('distance at threshold -> outlier', () => {
    expect(classifyLineMahalanobisZone(2, 2)).toBe('outlier');
  });

  it('distance above threshold -> outlier', () => {
    expect(classifyLineMahalanobisZone(3, 2)).toBe('outlier');
  });
});

describe('runLineMahalanobis', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineMahalanobis([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineMahalanobis([]).ok).toBe(false);
    expect(runLineMahalanobis(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineMahalanobis(VARIED, OPTS).ok).toBe(true);
  });

  it('uses the default window and threshold', () => {
    const run = runLineMahalanobis(VARIED);
    expect(run.window).toBe(DEFAULT_CHART_LINE_MAHALANOBIS_WINDOW);
    expect(run.threshold).toBe(DEFAULT_CHART_LINE_MAHALANOBIS_THRESHOLD);
  });

  it('honours custom options', () => {
    const run = runLineMahalanobis(VARIED, { window: 6, threshold: 1.5 });
    expect(run.window).toBe(6);
    expect(run.threshold).toBe(1.5);
  });

  it('a constant series classifies every bar as none (singular cov)', () => {
    const run = runLineMahalanobis(CONST_FLAT, OPTS);
    expect(run.normalCount).toBe(0);
    expect(run.outlierCount).toBe(0);
  });

  it('a linear ramp classifies every bar as none (singular cov)', () => {
    const run = runLineMahalanobis(RISING_LINEAR, OPTS);
    expect(run.normalCount).toBe(0);
    expect(run.outlierCount).toBe(0);
  });

  it('a varied series produces some defined distances', () => {
    const run = runLineMahalanobis(VARIED, OPTS);
    expect(run.normalCount + run.outlierCount).toBeGreaterThan(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineMahalanobis(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.normalCount + run.outlierCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineMahalanobis(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...VARIED].sort(() => -1);
    const run = runLineMahalanobis(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final distance', () => {
    const run = runLineMahalanobis(VARIED, OPTS);
    expect(Number.isFinite(run.distanceFinal!)).toBe(true);
  });
});

describe('computeLineMahalanobisLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineMahalanobisLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineMahalanobisLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineMahalanobisLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('stacks the price panel above the distance panel', () => {
    const layout = computeLineMahalanobisLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(
      layout.distancePanelTop,
    );
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineMahalanobisLayout({ data: VARIED, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineMahalanobisLayout({ data: VARIED, ...OPTS });
    expect(layout.priceDots).toHaveLength(VARIED.length);
  });

  it('emits one marker per defined-distance bar', () => {
    const layout = computeLineMahalanobisLayout({ data: VARIED, ...OPTS });
    const definedBars = layout.run.samples.filter(
      (s) => s.distance !== null,
    ).length;
    expect(layout.markers).toHaveLength(definedBars);
  });

  it('puts the threshold inside the distance panel', () => {
    const layout = computeLineMahalanobisLayout({ data: VARIED, ...OPTS });
    expect(layout.thresholdY).toBeGreaterThanOrEqual(layout.distancePanelTop);
    expect(layout.thresholdY).toBeLessThanOrEqual(layout.distancePanelBottom);
  });

  it('every marker lies inside the distance panel', () => {
    const layout = computeLineMahalanobisLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.distancePanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.distancePanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineMahalanobisLayout({ data: VARIED, ...OPTS });
    expect(layout.run.window).toBe(5);
    expect(layout.run.threshold).toBe(2);
  });
});

describe('describeLineMahalanobisChart', () => {
  it('names the indicator', () => {
    expect(describeLineMahalanobisChart(VARIED, OPTS)).toContain(
      'Mahalanobis',
    );
  });

  it('mentions the bivariate feature pair', () => {
    expect(describeLineMahalanobisChart(VARIED, OPTS)).toContain(
      '[value, return]',
    );
  });

  it('mentions the rolling window', () => {
    expect(describeLineMahalanobisChart(VARIED, OPTS)).toContain('window 5');
  });

  it('mentions the singular-covariance behaviour', () => {
    expect(describeLineMahalanobisChart(VARIED, OPTS)).toContain('singular');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineMahalanobisChart([])).toBe('No data');
    expect(describeLineMahalanobisChart(null)).toBe('No data');
  });
});

describe('<ChartLineMahalanobis />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    expect(
      screen.getByRole('region', { name: /Mahalanobis Distance chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-mahalanobis-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Mahalanobis');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineMahalanobis data={[]} window={5} threshold={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors window and threshold on the root', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-mahalanobis"]',
    );
    expect(root?.getAttribute('data-window')).toBe('5');
    expect(root?.getAttribute('data-threshold')).toBe('2');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the distance line', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-distance-path"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the threshold line by default', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-threshold"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per defined-distance bar', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mahalanobis-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-mahalanobis-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['normal', 'outlier']).toContain(zone);
    }
  });

  it('renders the config badge with the window and threshold', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-mahalanobis-badge-config"]',
    );
    expect(badge?.textContent).toContain('MAHA 5/2');
  });

  it('hides the distance line via the legend toggle', () => {
    const { container } = render(
      <ChartLineMahalanobis data={VARIED} window={5} threshold={2} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-mahalanobis-legend-item"][data-series-id="distance"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-distance-path"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold via showThreshold=false', () => {
    const { container } = render(
      <ChartLineMahalanobis
        data={VARIED}
        window={5}
        threshold={2}
        showThreshold={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-mahalanobis-threshold"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineMahalanobis
        data={VARIED}
        window={5}
        threshold={2}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-mahalanobis-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMahalanobis
        ref={ref}
        data={VARIED}
        window={5}
        threshold={2}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
