import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineDecompose,
  DEFAULT_CHART_LINE_DECOMPOSE_HEIGHT,
  DEFAULT_CHART_LINE_DECOMPOSE_PERIOD,
  DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_COLOR,
  DEFAULT_CHART_LINE_DECOMPOSE_SEASONAL_COLOR,
  DEFAULT_CHART_LINE_DECOMPOSE_TREND_COLOR,
  DEFAULT_CHART_LINE_DECOMPOSE_WIDTH,
  LINE_DECOMPOSE_COMPONENT_KINDS,
  computeCenteredMovingAverage,
  computeLineDecomposeLayout,
  computeLineDecomposeSeasonalPattern,
  computeLineDecomposition,
  describeLineDecomposeChart,
  getLineDecomposeFinitePoints,
  normaliseLineDecomposePeriod,
} from './chart-line-decompose';

// Synthetic signal: linear trend + period-4 sinusoid + tiny noise
const synthetic = Array.from({ length: 40 }, (_, n) => ({
  x: n,
  y: 0.1 * n + Math.cos((2 * Math.PI * n) / 4) * 2,
}));

// Flat + period-3 pulse
const pulse = Array.from({ length: 12 }, (_, n) => ({
  x: n,
  y: n % 3 === 0 ? 3 : 0,
}));

describe('chart-line-decompose: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_DECOMPOSE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_DECOMPOSE_HEIGHT).toBeGreaterThan(0);
  });

  it('default period >= 2', () => {
    expect(DEFAULT_CHART_LINE_DECOMPOSE_PERIOD).toBeGreaterThanOrEqual(2);
  });

  it('trend / seasonal / residual colors distinct', () => {
    const set = new Set([
      DEFAULT_CHART_LINE_DECOMPOSE_TREND_COLOR,
      DEFAULT_CHART_LINE_DECOMPOSE_SEASONAL_COLOR,
      DEFAULT_CHART_LINE_DECOMPOSE_RESIDUAL_COLOR,
    ]);
    expect(set.size).toBe(3);
  });

  it('exports 4 canonical component kinds', () => {
    expect(LINE_DECOMPOSE_COMPONENT_KINDS).toEqual([
      'observed',
      'trend',
      'seasonal',
      'residual',
    ]);
  });
});

describe('getLineDecomposeFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineDecomposeFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineDecomposeFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineDecomposePeriod', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineDecomposePeriod(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_DECOMPOSE_PERIOD,
    );
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineDecomposePeriod(1)).toBe(2);
    expect(normaliseLineDecomposePeriod(0)).toBe(2);
    expect(normaliseLineDecomposePeriod(-5)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineDecomposePeriod(7.9)).toBe(7);
  });
});

describe('computeCenteredMovingAverage', () => {
  it('returns [] for non-array', () => {
    expect(computeCenteredMovingAverage(null, 3)).toEqual([]);
  });

  it('returns all-null when input shorter than period', () => {
    const out = computeCenteredMovingAverage([1, 2], 5);
    expect(out.every((v) => v === null)).toBe(true);
  });

  it('odd-period centered MA matches expected', () => {
    // values [1,2,3,4,5], period 3: out[1]=2 (mean 1,2,3), out[2]=3,
    // out[3]=4; edges null.
    const out = computeCenteredMovingAverage([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeCloseTo(2, 5);
    expect(out[2]).toBeCloseTo(3, 5);
    expect(out[3]).toBeCloseTo(4, 5);
    expect(out[4]).toBeNull();
  });

  it('even-period centered MA uses half-weight endpoints', () => {
    // values [1,2,3,4,5,6], period 4. center at i=2:
    //   weights: 0.5*v0 + v1 + v2 + v3 + 0.5*v4 -> (0.5 + 2 + 3 + 4 + 2.5)/4 = 12/4 = 3
    const out = computeCenteredMovingAverage([1, 2, 3, 4, 5, 6], 4);
    expect(out[2]).toBeCloseTo(3, 5);
    expect(out[3]).toBeCloseTo(4, 5);
  });

  it('handles constant signal (output equals constant)', () => {
    const out = computeCenteredMovingAverage([7, 7, 7, 7, 7, 7], 3);
    expect(out[1]).toBe(7);
    expect(out[4]).toBe(7);
  });

  it('skips non-finite from the window', () => {
    const out = computeCenteredMovingAverage([1, Number.NaN, 3], 3);
    // window at center 1: finite values 1 and 3 -> mean 2
    expect(out[1]).toBeCloseTo(2, 5);
  });
});

describe('computeLineDecomposeSeasonalPattern', () => {
  it('returns zero pattern for non-array', () => {
    const p = computeLineDecomposeSeasonalPattern(null, 4);
    expect(p).toHaveLength(4);
    expect(p.every((v) => v === 0)).toBe(true);
  });

  it('pattern length matches period', () => {
    const p = computeLineDecomposeSeasonalPattern([], 7);
    expect(p).toHaveLength(7);
  });

  it('centers pattern so mean is zero', () => {
    // detrended values [1, 2, 1, 2, 1, 2] with period 2 -> phase 0 has
    // mean 1, phase 1 has mean 2. After centering (subtract overall mean
    // 1.5) pattern is [-0.5, 0.5].
    const p = computeLineDecomposeSeasonalPattern([1, 2, 1, 2, 1, 2], 2);
    expect(p[0]).toBeCloseTo(-0.5, 5);
    expect(p[1]).toBeCloseTo(0.5, 5);
    const sum = p.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 5);
  });

  it('skips null entries', () => {
    const p = computeLineDecomposeSeasonalPattern(
      [null, 2, null, 4],
      2,
    );
    // phase 0 has only [..2..]? wait: detrended[0]=null, [1]=2, [2]=null,
    // [3]=4. phase 0 (indices 0, 2): only null -> 0. phase 1 (indices 1,
    // 3): mean=3 -> after centering by overall mean 3, pattern[1]=0;
    // pattern[0]=-3. Actually only phase 1 had valid entries; overall
    // mean of pattern[1]=3 (since phase 0 stayed at 0 from init). So
    // patternValid=1 -> meanOfPattern = 3. Result: [0-3, 3-3] = [-3, 0].
    expect(p).toHaveLength(2);
    expect(p[1]).toBeCloseTo(0, 5);
  });
});

describe('computeLineDecomposition', () => {
  it('returns ok=false for empty', () => {
    expect(computeLineDecomposition([]).ok).toBe(false);
    expect(computeLineDecomposition(null).ok).toBe(false);
  });

  it('produces samples with observed + phase per index', () => {
    const r = computeLineDecomposition(synthetic, 4);
    expect(r.ok).toBe(true);
    expect(r.samples).toHaveLength(40);
    expect(r.samples[0]?.observed).toBeCloseTo(synthetic[0]!.y, 5);
    expect(r.samples[5]?.phase).toBe(5 % 4);
  });

  it('trend is null at edges (window not filled)', () => {
    const r = computeLineDecomposition(synthetic, 4);
    expect(r.samples[0]?.trend).toBeNull();
    expect(r.samples[r.samples.length - 1]?.trend).toBeNull();
    expect(r.samples[r.samples.length / 2 | 0]?.trend).not.toBeNull();
  });

  it('seasonal pattern repeats with period', () => {
    const r = computeLineDecomposition(synthetic, 4);
    expect(r.seasonalPattern).toHaveLength(4);
    // for a clean period-4 cosine the seasonal pattern should be roughly
    // [2, 0, -2, 0]
    const s = r.seasonalPattern;
    expect(s[0]).toBeGreaterThan(s[2]!);
    // sum to zero (centered)
    const sum = s.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0, 5);
  });

  it('observed = trend + seasonal + residual where trend is valid', () => {
    const r = computeLineDecomposition(synthetic, 4);
    for (const s of r.samples) {
      if (s.trend === null) continue;
      const recon = s.trend + (s.seasonal ?? 0) + (s.residual ?? 0);
      expect(recon).toBeCloseTo(s.observed, 5);
    }
  });

  it('records trendValidCount and residualValidCount equal', () => {
    const r = computeLineDecomposition(synthetic, 4);
    expect(r.trendValidCount).toBe(r.residualValidCount);
    expect(r.trendValidCount).toBeGreaterThan(0);
  });

  it('falls back to default period when not specified', () => {
    const r = computeLineDecomposition(synthetic);
    expect(r.period).toBe(DEFAULT_CHART_LINE_DECOMPOSE_PERIOD);
  });

  it('sorts ascending by x before decomposing', () => {
    const shuffled = [...synthetic].sort(() => -1);
    const r = computeLineDecomposition(shuffled, 4);
    expect(r.samples.map((s) => s.x)).toEqual(
      [...synthetic].sort((a, b) => a.x - b.x).map((p) => p.x),
    );
  });
});

describe('computeLineDecomposeLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineDecomposeLayout({
      data: [],
      width: 500,
      height: 400,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds 4 stacked panels in canonical order', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    expect(layout.panels.map((p) => p.kind)).toEqual([
      'observed',
      'trend',
      'seasonal',
      'residual',
    ]);
    expect(layout.panels[1]!.y).toBeGreaterThan(layout.panels[0]!.y);
  });

  it('respects enabledComponents filter', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
      enabledComponents: ['observed', 'residual'],
    });
    expect(layout.panels).toHaveLength(2);
    expect(layout.panels[0]!.kind).toBe('observed');
    expect(layout.panels[1]!.kind).toBe('residual');
  });

  it('residual panel y range is centered on zero when signs differ', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    const res = layout.panelMap.residual!;
    if (res.yMin < 0 && res.yMax > 0) {
      expect(res.yMin).toBeCloseTo(-res.yMax, 5);
    }
  });

  it('residual panel has zero reference py when range straddles zero', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    const res = layout.panelMap.residual!;
    expect(res.zeroPy).not.toBeNull();
  });

  it('per-panel points carry py=null where data is null (trend edges)', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    const trend = layout.panelMap.trend!;
    expect(trend.points[0]?.py).toBeNull();
    expect(trend.points[trend.points.length - 1]?.py).toBeNull();
  });

  it('observed panel never has null points', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    const obs = layout.panelMap.observed!;
    expect(obs.points.every((p) => p.py !== null)).toBe(true);
  });

  it('records totalPoints + finite count + period', () => {
    const layout = computeLineDecomposeLayout({
      data: synthetic,
      width: 500,
      height: 480,
      padding: 40,
      period: 4,
    });
    expect(layout.totalPoints).toBe(40);
    expect(layout.period).toBe(4);
  });
});

describe('describeLineDecomposeChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineDecomposeChart([])).toBe('No data');
    expect(describeLineDecomposeChart(null)).toBe('No data');
  });

  it('summarises period + samples + trend/residual counts', () => {
    const desc = describeLineDecomposeChart(synthetic, { period: 4 });
    expect(desc).toMatch(/period 4/);
    expect(desc).toMatch(/40 samples/);
    expect(desc).toMatch(/trend-valid samples/);
  });
});

describe('<ChartLineDecompose> render', () => {
  it('renders empty when no data', () => {
    const { container } = render(<ChartLineDecompose data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-decompose"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders 4 panel paths in canonical order', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const paths = document.querySelectorAll(
      '[data-section="chart-line-decompose-path"]',
    );
    expect(paths.length).toBe(4);
    const kinds = Array.from(paths).map((p) => p.getAttribute('data-kind'));
    expect(kinds).toEqual(['observed', 'trend', 'seasonal', 'residual']);
  });

  it('hides components via hiddenComponents', () => {
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        hiddenComponents={['seasonal', 'residual']}
      />,
    );
    const paths = document.querySelectorAll(
      '[data-section="chart-line-decompose-path"]',
    );
    expect(paths.length).toBe(2);
  });

  it('zero reference line drawn on residual + seasonal panels', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const residualZero = document.querySelector(
      '[data-section="chart-line-decompose-zero-line"][data-panel="residual"]',
    );
    const seasonalZero = document.querySelector(
      '[data-section="chart-line-decompose-zero-line"][data-panel="seasonal"]',
    );
    expect(residualZero).not.toBeNull();
    expect(seasonalZero).not.toBeNull();
  });

  it('hides zero line via showResidualZero=false', () => {
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        showResidualZero={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-decompose-zero-line"]',
      ),
    ).toBeNull();
  });

  it('per-panel label rendered on each panel', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const labels = document.querySelectorAll(
      '[data-section="chart-line-decompose-panel-label"]',
    );
    expect(labels.length).toBe(4);
    const texts = Array.from(labels).map((l) => l.textContent);
    expect(texts).toEqual(['Observed', 'Trend', 'Seasonal', 'Residual']);
  });

  it('renders period badge with period + samples', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const badge = document.querySelector(
      '[data-section="chart-line-decompose-badge"]',
    );
    expect(Number(badge?.getAttribute('data-period'))).toBe(4);
  });

  it('hides badge via showPeriodBadge=false', () => {
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        showPeriodBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-decompose-badge"]'),
    ).toBeNull();
  });

  it('renders dots only when showDots=true', () => {
    const { rerender } = render(
      <ChartLineDecompose data={synthetic} period={4} />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-decompose-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineDecompose data={synthetic} period={4} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-decompose-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('region+img ARIA', () => {
    render(<ChartLineDecompose data={synthetic} ariaLabel="decomp" />);
    const region = screen.getByRole('region', { name: 'decomp' });
    const img = within(region).getByRole('img', { name: 'decomp' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const root = document.querySelector(
      '[data-section="chart-line-decompose"]',
    );
    expect(Number(root?.getAttribute('data-period'))).toBe(4);
    expect(Number(root?.getAttribute('data-total-points'))).toBe(40);
    expect(
      Number(root?.getAttribute('data-trend-valid-count')),
    ).toBeGreaterThan(0);
    expect(Number(root?.getAttribute('data-panel-count'))).toBe(4);
  });

  it('tooltip shows component breakdown on hover', () => {
    render(<ChartLineDecompose data={synthetic} period={4} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-decompose-dot"][data-panel="trend"]',
    ) as HTMLElement;
    expect(dot).not.toBeNull();
    fireEvent.mouseEnter(dot);
    const obs = document.querySelector(
      '[data-section="chart-line-decompose-tooltip-observed"]',
    );
    const trend = document.querySelector(
      '[data-section="chart-line-decompose-tooltip-trend"]',
    );
    const seasonal = document.querySelector(
      '[data-section="chart-line-decompose-tooltip-seasonal"]',
    );
    const residual = document.querySelector(
      '[data-section="chart-line-decompose-tooltip-residual"]',
    );
    const phase = document.querySelector(
      '[data-section="chart-line-decompose-tooltip-phase"]',
    );
    expect(obs?.textContent).toMatch(/obs:/);
    expect(trend?.textContent).toMatch(/trend:/);
    expect(seasonal?.textContent).toMatch(/seasonal:/);
    expect(residual?.textContent).toMatch(/residual:/);
    expect(phase?.textContent).toMatch(/phase:/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineDecompose data={synthetic} period={4} showDots />);
    const dot = document.querySelector(
      '[data-section="chart-line-decompose-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-decompose-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        showDots
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-decompose-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-decompose-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick with panel + sample payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-decompose-dot"][data-panel="trend"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.panel?.kind).toBe('trend');
  });

  it('legend has 4 toggle buttons matching component kinds', () => {
    render(<ChartLineDecompose data={synthetic} period={4} />);
    const items = document.querySelectorAll(
      '[data-section="chart-line-decompose-legend-item"]',
    );
    expect(items.length).toBe(4);
    const kinds = Array.from(items).map((i) => i.getAttribute('data-kind'));
    expect(kinds).toEqual(['observed', 'trend', 'seasonal', 'residual']);
  });

  it('legend button toggles component visibility (uncontrolled)', () => {
    const onChange = vi.fn();
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        onHiddenComponentsChange={onChange}
      />,
    );
    const seasonalButton = document.querySelector(
      '[data-section="chart-line-decompose-legend-item"][data-kind="seasonal"]',
    ) as HTMLElement;
    fireEvent.click(seasonalButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect([...onChange.mock.calls[0]![0]]).toContain('seasonal');
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-decompose-legend"]'),
    ).toBeNull();
  });

  it('applies animate class when animate', () => {
    const { container } = render(
      <ChartLineDecompose data={synthetic} period={4} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-decompose"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineDecompose
        data={synthetic}
        period={4}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-decompose"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref to root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDecompose ref={ref} data={synthetic} period={4} />);
    expect(ref.current).not.toBeNull();
  });

  it('handles period > samples (all trend null)', () => {
    render(<ChartLineDecompose data={pulse} period={100} />);
    const root = document.querySelector(
      '[data-section="chart-line-decompose"]',
    );
    expect(Number(root?.getAttribute('data-trend-valid-count'))).toBe(0);
  });

  it('has stable displayName', () => {
    expect(ChartLineDecompose.displayName).toBe('ChartLineDecompose');
  });
});
