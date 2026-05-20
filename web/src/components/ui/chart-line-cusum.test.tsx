import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineCusum,
  DEFAULT_CHART_LINE_CUSUM_HEIGHT,
  DEFAULT_CHART_LINE_CUSUM_PADDING,
  DEFAULT_CHART_LINE_CUSUM_PALETTE,
  DEFAULT_CHART_LINE_CUSUM_SLACK,
  DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO,
  DEFAULT_CHART_LINE_CUSUM_THRESHOLD,
  DEFAULT_CHART_LINE_CUSUM_TICK_COUNT,
  DEFAULT_CHART_LINE_CUSUM_WIDTH,
  classifyLineCusumTriggerSide,
  computeLineCusumLayout,
  computeLineCusumStats,
  describeLineCusumChart,
  getLineCusumDefaultColor,
  getLineCusumFinitePoints,
  normaliseLineCusumSlack,
  normaliseLineCusumSubHeightRatio,
  normaliseLineCusumThreshold,
  runLineCusum,
  type ChartLineCusumSeries,
} from './chart-line-cusum';

afterEach(() => {
  cleanup();
});

// Constant at 10 then a persistent +4 shift -> CUSUM detects the drift.
const UP_DRIFT = [10, 10, 10, 10, 14, 14, 14, 14];
// Constant at 10 then a persistent -4 shift.
const DOWN_DRIFT = [10, 10, 10, 10, 6, 6, 6, 6];
// Constant at 10, a single huge spike, then back to 10.
const SPIKE = [10, 10, 10, 10, 40, 10, 10, 10, 10];

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-cusum defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_CUSUM_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUSUM_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUSUM_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUSUM_TICK_COUNT).toBeGreaterThan(0);
  });
  it('slack and threshold positive defaults', () => {
    expect(DEFAULT_CHART_LINE_CUSUM_SLACK).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUSUM_THRESHOLD).toBeGreaterThan(0);
  });
  it('sub height ratio in (0, 1)', () => {
    expect(DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO).toBeLessThan(1);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_CUSUM_PALETTE.length).toBe(10);
  });
});

describe('getLineCusumDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_CUSUM_PALETTE.length;
    expect(getLineCusumDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CUSUM_PALETTE[0],
    );
    expect(getLineCusumDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_CUSUM_PALETTE[0],
    );
    expect(getLineCusumDefaultColor(len + 4)).toBe(
      DEFAULT_CHART_LINE_CUSUM_PALETTE[4],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineCusumDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_CUSUM_PALETTE[0],
    );
    expect(getLineCusumDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_CUSUM_PALETTE[0],
    );
  });
});

describe('getLineCusumFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineCusumFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineCusumFinitePoints(null)).toEqual([]);
    expect(getLineCusumFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineCusumSlack', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineCusumSlack(NaN)).toBe(DEFAULT_CHART_LINE_CUSUM_SLACK);
    expect(normaliseLineCusumSlack(undefined)).toBe(
      DEFAULT_CHART_LINE_CUSUM_SLACK,
    );
  });
  it('clamps negative to 0', () => {
    expect(normaliseLineCusumSlack(-2)).toBe(0);
  });
  it('passes valid values including 0', () => {
    expect(normaliseLineCusumSlack(0)).toBe(0);
    expect(normaliseLineCusumSlack(1.5)).toBe(1.5);
  });
});

describe('normaliseLineCusumThreshold', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineCusumThreshold(NaN)).toBe(
      DEFAULT_CHART_LINE_CUSUM_THRESHOLD,
    );
  });
  it('clamps negative to 0', () => {
    expect(normaliseLineCusumThreshold(-3)).toBe(0);
  });
  it('passes valid values', () => {
    expect(normaliseLineCusumThreshold(4)).toBe(4);
  });
});

describe('normaliseLineCusumSubHeightRatio', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineCusumSubHeightRatio(NaN)).toBe(
      DEFAULT_CHART_LINE_CUSUM_SUB_HEIGHT_RATIO,
    );
  });
  it('clamps to [0.1, 0.9]', () => {
    expect(normaliseLineCusumSubHeightRatio(0)).toBe(0.1);
    expect(normaliseLineCusumSubHeightRatio(1)).toBe(0.9);
  });
  it('passes valid values', () => {
    expect(normaliseLineCusumSubHeightRatio(0.5)).toBe(0.5);
  });
});

describe('classifyLineCusumTriggerSide', () => {
  it('upper / lower / both / none', () => {
    expect(classifyLineCusumTriggerSide(true, false)).toBe('upper');
    expect(classifyLineCusumTriggerSide(false, true)).toBe('lower');
    expect(classifyLineCusumTriggerSide(true, true)).toBe('both');
    expect(classifyLineCusumTriggerSide(false, false)).toBe('none');
  });
});

describe('computeLineCusumStats', () => {
  it('empty / null -> zeros, ok=false', () => {
    const s = computeLineCusumStats(null);
    expect(s.mean).toBe(0);
    expect(s.sigma).toBe(0);
    expect(s.ok).toBe(false);
  });
  it('computes mean and population sigma', () => {
    // [10,10,10,10,14,14,14,14]: mean 12, deviations +/-2 -> sigma 2
    const s = computeLineCusumStats(UP_DRIFT);
    expect(s.mean).toBeCloseTo(12, 8);
    expect(s.computedSigma).toBeCloseTo(2, 8);
    expect(s.sigma).toBeCloseTo(2, 8);
    expect(s.ok).toBe(true);
  });
  it('default target is the series mean', () => {
    expect(computeLineCusumStats(UP_DRIFT).target).toBeCloseTo(12, 8);
  });
  it('target override beats the mean', () => {
    expect(computeLineCusumStats(UP_DRIFT, { target: 10 }).target).toBe(10);
  });
  it('sigma override beats the computed sigma', () => {
    const s = computeLineCusumStats(UP_DRIFT, { sigma: 4 });
    expect(s.sigma).toBe(4);
    expect(s.computedSigma).toBeCloseTo(2, 8);
  });
  it('allowance = slack * sigma, decisionInterval = threshold * sigma', () => {
    const s = computeLineCusumStats(UP_DRIFT, {
      sigma: 2,
      slack: 0.5,
      threshold: 5,
    });
    expect(s.allowance).toBeCloseTo(1, 8);
    expect(s.decisionInterval).toBeCloseTo(10, 8);
  });
  it('constant series -> sigma 0, ok=false', () => {
    const s = computeLineCusumStats([5, 5, 5, 5]);
    expect(s.sigma).toBe(0);
    expect(s.ok).toBe(false);
  });
});

describe('runLineCusum', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineCusum(null);
    expect(r.samples).toEqual([]);
    expect(r.triggerCount).toBe(0);
    expect(r.totalSamples).toBe(0);
  });

  it('no drift (all at target) -> zero CUSUM, no triggers', () => {
    const r = runLineCusum(toPoints([10, 10, 10, 10]), {
      target: 10,
      sigma: 2,
    });
    for (const s of r.samples) {
      expect(s.cusumPos).toBeCloseTo(0, 8);
      expect(s.cusumNeg).toBeCloseTo(0, 8);
      expect(s.triggered).toBe(false);
    }
    expect(r.triggerCount).toBe(0);
  });

  it('upward drift accumulates CUSUM+ and triggers', () => {
    // target 10, sigma 2 -> allowance 1, decisionInterval 10.
    // t4 dev +4 -> C+ = 3; t5 -> 6; t6 -> 9; t7 -> 12 > 10 -> trigger.
    const r = runLineCusum(toPoints(UP_DRIFT), {
      target: 10,
      sigma: 2,
      slack: 0.5,
      threshold: 5,
    });
    expect(r.samples[4]!.cusumPos).toBeCloseTo(3, 8);
    expect(r.samples[5]!.cusumPos).toBeCloseTo(6, 8);
    expect(r.samples[6]!.cusumPos).toBeCloseTo(9, 8);
    expect(r.samples[7]!.cusumPos).toBeCloseTo(12, 8);
    expect(r.samples[7]!.upperTriggered).toBe(true);
    expect(r.samples[7]!.triggerSide).toBe('upper');
    expect(r.triggerCount).toBe(1);
    expect(r.upperTriggerCount).toBe(1);
    expect(r.lowerTriggerCount).toBe(0);
  });

  it('downward drift accumulates CUSUM- and triggers', () => {
    const r = runLineCusum(toPoints(DOWN_DRIFT), {
      target: 10,
      sigma: 2,
      slack: 0.5,
      threshold: 5,
    });
    expect(r.samples[7]!.cusumNeg).toBeCloseTo(12, 8);
    expect(r.samples[7]!.lowerTriggered).toBe(true);
    expect(r.samples[7]!.triggerSide).toBe('lower');
    expect(r.triggerCount).toBe(1);
    expect(r.lowerTriggerCount).toBe(1);
    expect(r.upperTriggerCount).toBe(0);
  });

  it('resets CUSUM to 0 after a trigger (reset-on-trigger)', () => {
    // SPIKE: huge single spike at t4 then back to target.
    // t4 dev +30 -> C+ = 29 > 10 -> trigger -> reset.
    // t5 dev 0 -> C+ = max(0, 0 + 0 - 1) = 0  (proves the reset).
    const r = runLineCusum(toPoints(SPIKE), {
      target: 10,
      sigma: 2,
      slack: 0.5,
      threshold: 5,
    });
    expect(r.samples[4]!.cusumPos).toBeCloseTo(29, 8);
    expect(r.samples[4]!.triggered).toBe(true);
    expect(r.samples[5]!.cusumPos).toBeCloseTo(0, 8);
    expect(r.samples[5]!.triggered).toBe(false);
    expect(r.triggerCount).toBe(1);
  });

  it('records the deviation per sample', () => {
    const r = runLineCusum(toPoints(UP_DRIFT), { target: 10, sigma: 2 });
    expect(r.samples[0]!.deviation).toBeCloseTo(0, 8);
    expect(r.samples[4]!.deviation).toBeCloseTo(4, 8);
  });

  it('tracks maxCusumPos and maxCusumNeg', () => {
    const r = runLineCusum(toPoints(SPIKE), {
      target: 10,
      sigma: 2,
      slack: 0.5,
      threshold: 5,
    });
    expect(r.maxCusumPos).toBeCloseTo(29, 8);
    expect(r.maxCusumNeg).toBeCloseTo(0, 8);
  });

  it('sorts ascending and drops non-finite', () => {
    const r = runLineCusum([
      { x: 3, y: 40 },
      { x: NaN, y: 0 },
      { x: 1, y: 10 },
      { x: 0, y: 10 },
      { x: 2, y: 10 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3]);
  });

  it('threshold 0 disables triggering', () => {
    const r = runLineCusum(toPoints(UP_DRIFT), {
      target: 10,
      sigma: 2,
      threshold: 0,
    });
    expect(r.triggerCount).toBe(0);
  });

  it('constant series at target -> no triggers', () => {
    const r = runLineCusum(toPoints([7, 7, 7, 7, 7]), { target: 7 });
    expect(r.triggerCount).toBe(0);
  });

  it('CUSUM sums are always non-negative', () => {
    const r = runLineCusum(
      toPoints([10, 5, 20, 8, 14, 3, 30, 12, 10, 9]),
      { target: 10, sigma: 3 },
    );
    for (const s of r.samples) {
      expect(s.cusumPos).toBeGreaterThanOrEqual(0);
      expect(s.cusumNeg).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('computeLineCusumLayout', () => {
  const series: ChartLineCusumSeries[] = [
    { id: 'a', label: 'A', data: toPoints(UP_DRIFT), target: 10, sigma: 2 },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineCusumLayout({
      series: [],
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineCusumLayout({
      series,
      width: 30,
      height: 30,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineCusumLayout({
      series,
      hiddenSeries: ['a'],
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds main and sub panels stacked vertically', () => {
    const layout = computeLineCusumLayout({
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

  it('builds raw + cusum paths', () => {
    const layout = computeLineCusumLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.rawPath).toContain('M ');
    expect(s.cusumPosPath).toContain('M ');
    expect(s.cusumNegPath).toContain('M ');
  });

  it('exposes stats and the trigger list', () => {
    const layout = computeLineCusumLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.stats.target).toBe(10);
    expect(s.stats.sigma).toBe(2);
    expect(s.stats.allowance).toBeCloseTo(1, 8);
    expect(s.stats.decisionInterval).toBeCloseTo(10, 8);
    expect(s.triggerCount).toBe(1);
    expect(s.triggers.length).toBe(1);
    expect(s.triggers[0]!.side).toBe('upper');
  });

  it('sub panel y range is symmetric around zero', () => {
    const layout = computeLineCusumLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.subYMin).toBeCloseTo(-layout.subYMax, 8);
  });

  it('per-series target override is honoured', () => {
    const layout = computeLineCusumLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(UP_DRIFT),
          target: 13,
          sigma: 2,
        },
      ],
      width: 500,
      height: 360,
      padding: 30,
      target: 10,
    });
    expect(layout.series[0]!.stats.target).toBe(13);
  });

  it('chart-level slack and threshold reach the run', () => {
    const layout = computeLineCusumLayout({
      series,
      width: 500,
      height: 360,
      padding: 30,
      slack: 1,
      threshold: 8,
    });
    const s = layout.series[0]!;
    expect(s.stats.slack).toBe(1);
    expect(s.stats.threshold).toBe(8);
    expect(s.stats.allowance).toBeCloseTo(2, 8);
    expect(s.stats.decisionInterval).toBeCloseTo(16, 8);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineCusumSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(DOWN_DRIFT), target: 10, sigma: 2 },
    ];
    const layout = computeLineCusumLayout({
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
    const layout = computeLineCusumLayout({
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
    const multi: ChartLineCusumSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(DOWN_DRIFT), target: 10, sigma: 2 },
    ];
    const layout = computeLineCusumLayout({
      series: multi,
      width: 500,
      height: 360,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(UP_DRIFT.length + DOWN_DRIFT.length);
  });
});

describe('describeLineCusumChart', () => {
  it('no data -> No data', () => {
    expect(describeLineCusumChart(null)).toBe('No data');
    expect(describeLineCusumChart([])).toBe('No data');
  });
  it('summary mentions CUSUM and drift triggers', () => {
    const s = describeLineCusumChart([
      { id: 'a', label: 'A', data: toPoints(UP_DRIFT), target: 10, sigma: 2 },
    ]);
    expect(s).toContain('CUSUM');
    expect(s).toContain('target');
    expect(s).toContain('drift triggers');
  });
  it('handles hidden filter', () => {
    const s = describeLineCusumChart(
      [{ id: 'a', label: 'A', data: toPoints(UP_DRIFT) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineCusum> render', () => {
  const series: ChartLineCusumSeries[] = [
    {
      id: 'a',
      label: 'Series A',
      data: toPoints(UP_DRIFT),
      target: 10,
      sigma: 2,
    },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineCusum series={[]} />);
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineCusum series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-cusum-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders cusum-pos and cusum-neg paths', () => {
    render(<ChartLineCusum series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-cusum-pos-path"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-cusum-neg-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the sub-panel zero line', () => {
    render(<ChartLineCusum series={series} />);
    expect(
      document.querySelector('[data-section="chart-line-cusum-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders the target line by default and hides via prop', () => {
    const { rerender } = render(<ChartLineCusum series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-target-line"]',
      ),
    ).not.toBeNull();
    rerender(<ChartLineCusum series={series} showTargetLine={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-target-line"]',
      ),
    ).toBeNull();
  });

  it('renders threshold lines (upper + lower) and hides via prop', () => {
    const { rerender } = render(<ChartLineCusum series={series} />);
    const upper = document.querySelector(
      '[data-section="chart-line-cusum-threshold-line"][data-side="upper"]',
    );
    const lower = document.querySelector(
      '[data-section="chart-line-cusum-threshold-line"][data-side="lower"]',
    );
    expect(upper).not.toBeNull();
    expect(lower).not.toBeNull();
    rerender(<ChartLineCusum series={series} showThresholds={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('renders a trigger marker for the detected upward drift', () => {
    render(<ChartLineCusum series={series} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cusum-trigger-marker"]',
    );
    // UP_DRIFT triggers exactly once (upper) -> one upper marker
    expect(markers.length).toBe(1);
    expect(markers[0]!.getAttribute('data-side')).toBe('upper');
  });

  it('renders a trigger line spanning the main panel', () => {
    render(<ChartLineCusum series={series} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-trigger-line"]',
      ),
    ).not.toBeNull();
  });

  it('hides triggers when showTriggers=false', () => {
    render(<ChartLineCusum series={series} showTriggers={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-trigger-marker"]',
      ),
    ).toBeNull();
  });

  it('hides trigger lines when showTriggerLines=false', () => {
    render(<ChartLineCusum series={series} showTriggerLines={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-trigger-line"]',
      ),
    ).toBeNull();
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineCusum series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cusum-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineCusum series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cusum-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows target + slack + threshold + drift count', () => {
    render(<ChartLineCusum series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-cusum-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-cusum-badge-target"]')
        ?.textContent?.startsWith('T='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-cusum-badge-slack"]')
        ?.textContent?.startsWith('k='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-cusum-badge-threshold"]')
        ?.textContent?.startsWith('h='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-badge-triggers"]',
      )?.textContent,
    ).toBe('drift=1');
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineCusum series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cusum-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineCusum series={series} />);
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-cusum-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-cusum-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('CUSUM');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineCusum series={series} />);
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(root!.getAttribute('data-total-triggers')).toBe('1');
    expect(Number(root!.getAttribute('data-target'))).toBe(10);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineCusum series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-cusum-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-target'))).toBe(10);
    expect(Number(grp!.getAttribute('data-series-sigma'))).toBe(2);
    expect(
      Number(grp!.getAttribute('data-series-decision-interval')),
    ).toBeCloseTo(10, 5);
    expect(Number(grp!.getAttribute('data-series-trigger-count'))).toBe(1);
    expect(
      Number(grp!.getAttribute('data-series-upper-trigger-count')),
    ).toBe(1);
  });

  it('tooltip appears on dot hover with raw + deviation + cusum rows', () => {
    render(<ChartLineCusum series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-cusum-dot"]',
    );
    const dot = dots[5]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-cusum-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-tooltip-deviation"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-tooltip-cusum-pos"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-tooltip-cusum-neg"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-cusum-tooltip"]'),
    ).toBeNull();
  });

  it('tooltip shows a trigger row on a triggered dot', () => {
    render(<ChartLineCusum series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-cusum-dot"]',
    );
    // index 7 is the triggered sample for UP_DRIFT
    const triggeredDot = Array.from(dots).find(
      (d) => d.getAttribute('data-triggered') === 'true',
    );
    expect(triggeredDot).toBeTruthy();
    fireEvent.mouseEnter(triggeredDot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-tooltip-trigger"]',
      ),
    ).not.toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineCusum series={series} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-cusum-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-cusum-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineCusum
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-cusum-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('onTriggerClick fires with series + trigger payload', () => {
    let captured: { seriesId: string; index: number } | null = null;
    render(
      <ChartLineCusum
        series={series}
        onTriggerClick={({ series: s, trigger }) => {
          captured = { seriesId: s.id, index: trigger.index };
        }}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-cusum-trigger-marker"]',
    );
    fireEvent.click(marker!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
    expect(captured!.index).toBe(7);
  });

  it('legend shows target + drift stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineCusum
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-cusum-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('T=');
    expect(stats!.textContent).toContain('drift');
    const btn = document.querySelector(
      '[data-section="chart-line-cusum-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineCusum series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cusum-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineCusum series={series} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineCusum series={series} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCusum ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-cusum',
    );
  });

  it('has displayName', () => {
    expect(ChartLineCusum.displayName).toBe('ChartLineCusum');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineCusum series={series} ariaLabel="Custom CUSUM label" />,
    );
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom CUSUM label');
    const svg = document.querySelector(
      '[data-section="chart-line-cusum-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom CUSUM label');
  });

  it('xLabel, yLabel and subLabel render axis text', () => {
    render(
      <ChartLineCusum
        series={series}
        xLabel="time"
        yLabel="value"
        subLabel="cusum panel"
      />,
    );
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-cusum-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-cusum-y-label',
    );
    expect(
      screen.getByText('cusum panel').getAttribute('data-section'),
    ).toBe('chart-line-cusum-sub-label');
  });

  it('no-drift series renders zero triggers', () => {
    render(
      <ChartLineCusum
        series={[
          {
            id: 'flat',
            label: 'Flat',
            data: toPoints([10, 10, 10, 10, 10, 10]),
            target: 10,
            sigma: 2,
          },
        ]}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-cusum"]');
    expect(root!.getAttribute('data-total-triggers')).toBe('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-cusum-trigger-marker"]',
      ),
    ).toBeNull();
  });
});
