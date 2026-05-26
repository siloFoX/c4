import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineUlcerIndex,
  DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD,
  DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD,
  classifyLineUlcerIndexZone,
  computeLineUlcerIndex,
  computeLineUlcerIndexLayout,
  describeLineUlcerIndexChart,
  getLineUlcerIndexFinitePoints,
  normalizeLineUlcerIndexPeriod,
  normalizeLineUlcerIndexThreshold,
  runLineUlcerIndex,
  type ChartLineUlcerIndexPoint,
} from './chart-line-ulcer-index';

const toPoints = (closes: number[]): ChartLineUlcerIndexPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

const CONST_FLAT: ChartLineUlcerIndexPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

// Monotone-rising series: every bar's peak equals itself, so every
// drawdown is zero -> UI = 0 bit-exact at every defined bar.
const RISING: ChartLineUlcerIndexPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
]);

// Drawdown anchor: close = [12, 6, 12, 12], period 4.
// Inside the window: peak[0..3] = 12 at every bar. Drawdowns:
//   j=0: 0
//   j=1: 100 * (6 - 12) / 12 = -50 -> sq = 2500
//   j=2: 0
//   j=3: 0
// sum / 4 = 625 = 25^2 -> UI[3] = 25 bit-exact.
const DRAWDOWN_25: ChartLineUlcerIndexPoint[] = toPoints([12, 6, 12, 12]);

// Same magnitude in scale: close = [4, 2, 4, 4] gives the same -50% drawdown.
const DRAWDOWN_25_SCALED: ChartLineUlcerIndexPoint[] = toPoints([4, 2, 4, 4]);

const WAVE: ChartLineUlcerIndexPoint[] = Array.from(
  { length: 30 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { period: 4, threshold: 5 } as const;

describe('getLineUlcerIndexFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineUlcerIndexFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineUlcerIndexFinitePoints(
        'nope' as unknown as ChartLineUlcerIndexPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or close', () => {
    const points: ChartLineUlcerIndexPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineUlcerIndexFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineUlcerIndexPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineUlcerIndexPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineUlcerIndexPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineUlcerIndexPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineUlcerIndexPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineUlcerIndexThreshold', () => {
  it('keeps a positive finite', () => {
    expect(normalizeLineUlcerIndexThreshold(10, 5)).toBe(10);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineUlcerIndexThreshold(0, 5)).toBe(5);
    expect(normalizeLineUlcerIndexThreshold(-1, 5)).toBe(5);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineUlcerIndexThreshold(Number.NaN, 5)).toBe(5);
  });
});

describe('computeLineUlcerIndex', () => {
  it('returns an empty array for null', () => {
    expect(computeLineUlcerIndex(null, 4)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineUlcerIndex([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineUlcerIndex(RISING.map((p) => p.close), 4)).toHaveLength(
      RISING.length,
    );
  });

  it('leaves the warm-up bars null', () => {
    const ui = computeLineUlcerIndex(RISING.map((p) => p.close), 4);
    for (let i = 0; i < 3; i += 1) {
      expect(ui[i]).toBeNull();
    }
  });

  it('CONST_FLAT: UI = 0 bit-exact at every defined bar', () => {
    const ui = computeLineUlcerIndex(CONST_FLAT.map((p) => p.close), 4);
    for (let i = 3; i < ui.length; i += 1) {
      expect(ui[i]).toBe(0);
    }
  });

  it('RISING: UI = 0 bit-exact at every defined bar (no drawdowns)', () => {
    const ui = computeLineUlcerIndex(RISING.map((p) => p.close), 4);
    for (let i = 3; i < ui.length; i += 1) {
      expect(ui[i]).toBe(0);
    }
  });

  it('DRAWDOWN_25 [12, 6, 12, 12] period 4: UI[3] = 25 bit-exact', () => {
    const ui = computeLineUlcerIndex(
      DRAWDOWN_25.map((p) => p.close),
      4,
    );
    expect(ui[3]).toBe(25);
  });

  it('DRAWDOWN_25_SCALED [4, 2, 4, 4] period 4: UI[3] = 25 bit-exact', () => {
    const ui = computeLineUlcerIndex(
      DRAWDOWN_25_SCALED.map((p) => p.close),
      4,
    );
    expect(ui[3]).toBe(25);
  });

  it('scale invariance: multiplying close by a positive constant leaves UI unchanged (relative drawdowns)', () => {
    const a = computeLineUlcerIndex(DRAWDOWN_25.map((p) => p.close), 4);
    const b = computeLineUlcerIndex(
      DRAWDOWN_25.map((p) => p.close * 100),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) {
        expect(b[i]).toBeNull();
      } else {
        expect(b[i]).toBe(a[i]);
      }
    }
  });

  it('returns null for non-finite close in the window', () => {
    const closes = [5, 5, Number.NaN, 5];
    const ui = computeLineUlcerIndex(closes, 4);
    expect(ui[3]).toBeNull();
  });

  it('returns null for non-positive close in the window', () => {
    const closes = [5, 5, 0, 5];
    const ui = computeLineUlcerIndex(closes, 4);
    expect(ui[3]).toBeNull();
  });

  it('reads non-negative on the wave', () => {
    const ui = computeLineUlcerIndex(WAVE.map((p) => p.close), 4);
    for (let i = 3; i < ui.length; i += 1) {
      expect(ui[i]!).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(ui[i]!)).toBe(true);
    }
  });
});

describe('classifyLineUlcerIndexZone', () => {
  it('value < threshold -> low', () => {
    expect(classifyLineUlcerIndexZone(2, 5)).toBe('low');
  });

  it('threshold <= value < 2 * threshold -> medium', () => {
    expect(classifyLineUlcerIndexZone(5, 5)).toBe('medium');
    expect(classifyLineUlcerIndexZone(8, 5)).toBe('medium');
  });

  it('value >= 2 * threshold -> high', () => {
    expect(classifyLineUlcerIndexZone(10, 5)).toBe('high');
    expect(classifyLineUlcerIndexZone(25, 5)).toBe('high');
  });

  it('null -> none', () => {
    expect(classifyLineUlcerIndexZone(null, 5)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineUlcerIndexZone(Number.NaN, 5)).toBe('none');
  });
});

describe('runLineUlcerIndex', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineUlcerIndex([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineUlcerIndex([]).ok).toBe(false);
    expect(runLineUlcerIndex(null).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineUlcerIndex(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default period', () => {
    expect(runLineUlcerIndex(RISING).period).toBe(
      DEFAULT_CHART_LINE_ULCER_INDEX_PERIOD,
    );
  });

  it('uses the default threshold', () => {
    expect(runLineUlcerIndex(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_ULCER_INDEX_THRESHOLD,
    );
  });

  it('produces one sample per finite point', () => {
    expect(runLineUlcerIndex(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: every defined sample is low (UI = 0 < threshold)', () => {
    const run = runLineUlcerIndex(CONST_FLAT, OPTS);
    expect(run.lowCount).toBe(CONST_FLAT.length - 3);
    expect(run.mediumCount).toBe(0);
    expect(run.highCount).toBe(0);
  });

  it('DRAWDOWN_25 with threshold = 5: last sample is high (UI = 25 >= 10)', () => {
    const run = runLineUlcerIndex(DRAWDOWN_25, OPTS);
    expect(run.samples[3]!.zone).toBe('high');
    expect(run.samples[3]!.ulcer).toBe(25);
  });

  it('exposes the final and max readings', () => {
    expect(runLineUlcerIndex(CONST_FLAT, OPTS).ulcerFinal).toBe(0);
    expect(runLineUlcerIndex(CONST_FLAT, OPTS).ulcerMax).toBe(0);
    expect(runLineUlcerIndex(DRAWDOWN_25, OPTS).ulcerFinal).toBe(25);
    expect(runLineUlcerIndex(DRAWDOWN_25, OPTS).ulcerMax).toBe(25);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineUlcerIndex(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineUlcerIndex(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.lowCount + run.mediumCount + run.highCount + none,
    ).toBe(run.samples.length);
  });

  it('ulcer >= 0 on every defined sample', () => {
    const run = runLineUlcerIndex(WAVE, OPTS);
    for (const sample of run.samples) {
      if (sample.ulcer !== null) {
        expect(sample.ulcer).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('computeLineUlcerIndexLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineUlcerIndexLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineUlcerIndexLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineUlcerIndexLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineUlcerIndexLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined ulcer bar', () => {
    const layout = computeLineUlcerIndexLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 3);
  });

  it('builds a non-empty Ulcer path', () => {
    const layout = computeLineUlcerIndexLayout({ data: RISING, ...OPTS });
    expect(layout.ulcerPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the Ulcer panel', () => {
    const layout = computeLineUlcerIndexLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.ulcerPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.ulcerPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineUlcerIndexLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.ulcerPanelTop);
  });

  it('ulcerMin is exactly zero', () => {
    const layout = computeLineUlcerIndexLayout({ data: WAVE, ...OPTS });
    expect(layout.ulcerMin).toBe(0);
  });

  it('carries the run', () => {
    const layout = computeLineUlcerIndexLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(5);
  });
});

describe('describeLineUlcerIndexChart', () => {
  it('names the indicator', () => {
    expect(describeLineUlcerIndexChart(RISING, OPTS)).toContain(
      'Ulcer Index',
    );
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineUlcerIndexChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 5');
  });

  it('mentions root-mean-square', () => {
    expect(describeLineUlcerIndexChart(RISING, OPTS)).toContain(
      'root-mean-square',
    );
  });

  it('mentions the monotone-rising identity', () => {
    expect(describeLineUlcerIndexChart(RISING, OPTS)).toContain(
      'monotone-rising series reads exactly zero',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineUlcerIndexChart([])).toBe('No data');
    expect(describeLineUlcerIndexChart(null)).toBe('No data');
  });
});

describe('<ChartLineUlcerIndex />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineUlcerIndex data={RISING} period={4} threshold={5} />);
    expect(
      screen.getByRole('region', { name: /Ulcer Index chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-ulcer-index-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ulcer Index');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={[]} period={4} threshold={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-index-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the period / threshold / total-points on the root', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ulcer-index"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the Ulcer line', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-ulcer-index-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-ulcer-index-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as low (UI = 0)', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ulcer-index-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('low');
  });

  it('marks the last DRAWDOWN_25 marker as high', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={DRAWDOWN_25} period={4} threshold={5} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ulcer-index-marker"]',
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.getAttribute('data-zone')).toBe('high');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-ulcer-index-badge-config"]',
    );
    expect(badge?.textContent).toContain('UI 4');
    expect(badge?.textContent).toContain('thr 5');
  });

  it('hides the Ulcer line via the legend toggle', () => {
    const { container } = render(
      <ChartLineUlcerIndex data={RISING} period={4} threshold={5} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-ulcer-index-legend-item"][data-series-id="ulcer"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-ulcer-index-line"]'),
    ).toBeNull();
  });

  it('hides the Ulcer line via showUlcer=false', () => {
    const { container } = render(
      <ChartLineUlcerIndex
        data={RISING}
        period={4}
        threshold={5}
        showUlcer={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ulcer-index-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineUlcerIndex
        data={RISING}
        period={4}
        threshold={5}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-ulcer-index-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineUlcerIndex
        ref={ref}
        data={RISING}
        period={4}
        threshold={5}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
