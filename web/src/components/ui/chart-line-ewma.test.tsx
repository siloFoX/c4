import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineEwma,
  DEFAULT_CHART_LINE_EWMA_ALPHA,
  DEFAULT_CHART_LINE_EWMA_HEIGHT,
  DEFAULT_CHART_LINE_EWMA_PALETTE,
  DEFAULT_CHART_LINE_EWMA_RESIDUAL_NEG_COLOR,
  DEFAULT_CHART_LINE_EWMA_RESIDUAL_POS_COLOR,
  DEFAULT_CHART_LINE_EWMA_WIDTH,
  classifyLineEwmaResidual,
  computeLineEwmaLayout,
  describeLineEwmaChart,
  getLineEwmaDefaultColor,
  getLineEwmaFinitePoints,
  lineEwmaAlphaToSpan,
  lineEwmaHalfLife,
  lineEwmaSpanToAlpha,
  normaliseLineEwmaAlpha,
  resolveLineEwmaAlpha,
  runLineEwma,
  type ChartLineEwmaSeries,
} from './chart-line-ewma';

const noisy: ChartLineEwmaSeries = {
  id: 'n',
  label: 'Noisy',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 12 },
    { x: 2, y: 8 },
    { x: 3, y: 13 },
    { x: 4, y: 9 },
    { x: 5, y: 11 },
    { x: 6, y: 10 },
    { x: 7, y: 14 },
    { x: 8, y: 9 },
    { x: 9, y: 12 },
  ],
};

const flat: ChartLineEwmaSeries = {
  id: 'f',
  label: 'Flat',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
  ],
};

describe('chart-line-ewma: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_EWMA_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMA_HEIGHT).toBeGreaterThan(0);
  });

  it('default alpha in (0, 1]', () => {
    expect(DEFAULT_CHART_LINE_EWMA_ALPHA).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMA_ALPHA).toBeLessThanOrEqual(1);
  });

  it('distinct positive / negative residual colors', () => {
    expect(DEFAULT_CHART_LINE_EWMA_RESIDUAL_POS_COLOR).not.toBe(
      DEFAULT_CHART_LINE_EWMA_RESIDUAL_NEG_COLOR,
    );
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_EWMA_PALETTE.length).toBe(10);
  });
});

describe('getLineEwmaDefaultColor', () => {
  it('cycles', () => {
    expect(getLineEwmaDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_EWMA_PALETTE[0],
    );
    expect(getLineEwmaDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_EWMA_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineEwmaDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_EWMA_PALETTE[0],
    );
    expect(getLineEwmaDefaultColor(-3)).toBe(
      DEFAULT_CHART_LINE_EWMA_PALETTE[0],
    );
  });
});

describe('getLineEwmaFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineEwmaFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineEwmaFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineEwmaAlpha', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineEwmaAlpha(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_EWMA_ALPHA,
    );
  });

  it('clamps to (0, 1]', () => {
    expect(normaliseLineEwmaAlpha(0)).toBeCloseTo(1e-6, 8);
    expect(normaliseLineEwmaAlpha(-1)).toBeCloseTo(1e-6, 8);
    expect(normaliseLineEwmaAlpha(2)).toBe(1);
  });

  it('identity for in-range', () => {
    expect(normaliseLineEwmaAlpha(0.5)).toBe(0.5);
  });
});

describe('lineEwmaSpanToAlpha / lineEwmaAlphaToSpan', () => {
  it('span 1 -> alpha 1', () => {
    expect(lineEwmaSpanToAlpha(1)).toBe(1);
  });

  it('span 9 -> alpha 0.2 (pandas convention)', () => {
    expect(lineEwmaSpanToAlpha(9)).toBeCloseTo(0.2, 5);
  });

  it('round-trip alpha -> span -> alpha', () => {
    const a = 0.4;
    const s = lineEwmaAlphaToSpan(a);
    expect(lineEwmaSpanToAlpha(s)).toBeCloseTo(a, 5);
  });

  it('alpha = 1 returns infinity (degenerate; no smoothing)', () => {
    expect(Number.isFinite(lineEwmaAlphaToSpan(1))).toBe(false);
  });

  it('non-positive span falls back to default alpha', () => {
    expect(lineEwmaSpanToAlpha(0)).toBe(DEFAULT_CHART_LINE_EWMA_ALPHA);
    expect(lineEwmaSpanToAlpha(-5)).toBe(DEFAULT_CHART_LINE_EWMA_ALPHA);
  });
});

describe('lineEwmaHalfLife', () => {
  it('alpha=1 -> half-life 0', () => {
    expect(lineEwmaHalfLife(1)).toBe(0);
  });

  it('alpha=0.5 -> half-life 1', () => {
    expect(lineEwmaHalfLife(0.5)).toBeCloseTo(1, 5);
  });

  it('smaller alpha -> longer half-life', () => {
    expect(lineEwmaHalfLife(0.1)).toBeGreaterThan(lineEwmaHalfLife(0.5));
  });

  it('alpha=0 -> infinite half-life', () => {
    expect(Number.isFinite(lineEwmaHalfLife(0))).toBe(false);
  });
});

describe('classifyLineEwmaResidual', () => {
  it('positive', () => {
    expect(classifyLineEwmaResidual(1)).toBe('positive');
  });

  it('negative', () => {
    expect(classifyLineEwmaResidual(-1)).toBe('negative');
  });

  it('zero', () => {
    expect(classifyLineEwmaResidual(0)).toBe('zero');
  });

  it('non-finite -> zero', () => {
    expect(classifyLineEwmaResidual(Number.NaN)).toBe('zero');
  });
});

describe('resolveLineEwmaAlpha', () => {
  it('explicit alpha beats span', () => {
    expect(resolveLineEwmaAlpha({ alpha: 0.4, span: 99 })).toBe(0.4);
  });

  it('span used when no alpha', () => {
    expect(resolveLineEwmaAlpha({ span: 9 })).toBeCloseTo(0.2, 5);
  });

  it('falls back to default when neither provided', () => {
    expect(resolveLineEwmaAlpha()).toBe(DEFAULT_CHART_LINE_EWMA_ALPHA);
    expect(resolveLineEwmaAlpha({})).toBe(DEFAULT_CHART_LINE_EWMA_ALPHA);
  });
});

describe('runLineEwma', () => {
  it('returns [] for empty / null', () => {
    expect(runLineEwma(null)).toEqual([]);
    expect(runLineEwma([])).toEqual([]);
  });

  it('first ewma equals initial estimate after smoothing toward observation', () => {
    // initialEstimate=0, alpha=0.5, first raw=10:
    // ewma = 0.5*10 + 0.5*0 = 5
    const out = runLineEwma(
      [
        { x: 0, y: 10 },
        { x: 1, y: 10 },
      ],
      { alpha: 0.5, initialEstimate: 0 },
    );
    expect(out[0]?.ewma).toBe(5);
  });

  it('flat series converges quickly to constant value (alpha=1 -> immediate)', () => {
    const out = runLineEwma(flat.data, { alpha: 1, initialEstimate: 0 });
    // alpha=1 -> ewma[0]=raw[0]=5; all subsequent also 5
    expect(out[0]?.ewma).toBe(5);
    expect(out[2]?.ewma).toBe(5);
  });

  it('uses observation[0] as initial when not specified -> first residual 0', () => {
    const out = runLineEwma([
      { x: 0, y: 7 },
      { x: 1, y: 7 },
    ]);
    expect(out[0]?.residual).toBe(0);
    expect(out[0]?.ewma).toBe(7);
  });

  it('alpha=1 -> ewma == raw (no smoothing)', () => {
    const out = runLineEwma(noisy.data, { alpha: 1 });
    for (const sample of out) {
      expect(sample.ewma).toBe(sample.raw);
    }
  });

  it('small alpha gives more smoothing than large alpha (RMSE residual ordering)', () => {
    const heavy = runLineEwma(noisy.data, { alpha: 0.1, initialEstimate: 10 });
    const light = runLineEwma(noisy.data, { alpha: 0.9, initialEstimate: 10 });
    const rmse = (arr: { residual: number }[]) =>
      Math.sqrt(arr.reduce((a, b) => a + b.residual ** 2, 0) / arr.length);
    expect(rmse(heavy)).toBeGreaterThan(rmse(light));
  });

  it('sorts ascending by x before scanning', () => {
    const out = runLineEwma([
      { x: 3, y: 1 },
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 1, y: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([0, 1, 2, 3]);
  });

  it('drops non-finite before scanning', () => {
    const out = runLineEwma([
      { x: 0, y: 1 },
      { x: 1, y: Number.NaN },
      { x: 2, y: 3 },
    ]);
    expect(out).toHaveLength(2);
  });

  it('residual sign reflects raw above / below ewma', () => {
    const out = runLineEwma(
      [
        { x: 0, y: 10 },
        { x: 1, y: 20 }, // big jump up -> residual positive (raw > smoothed)
        { x: 2, y: 5 }, // big jump down -> residual negative
      ],
      { alpha: 0.3 },
    );
    expect(out[1]?.residualSign).toBe('positive');
    expect(out[2]?.residualSign).toBe('negative');
  });

  it('span alternative param yields same result as derived alpha', () => {
    const span = 9;
    const a = lineEwmaSpanToAlpha(span);
    const fromSpan = runLineEwma(noisy.data, { span });
    const fromAlpha = runLineEwma(noisy.data, { alpha: a });
    for (let i = 0; i < fromSpan.length; i += 1) {
      expect(fromSpan[i]?.ewma).toBeCloseTo(fromAlpha[i]?.ewma ?? 0, 5);
    }
  });
});

describe('computeLineEwmaLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineEwmaLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series raw + ewma paths', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.rawPath.length).toBeGreaterThan(0);
    expect(s.ewmaPath.length).toBeGreaterThan(0);
  });

  it('records per-series alpha + half-life + effective span', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
      alpha: 0.5,
    });
    expect(layout.series[0]?.alpha).toBe(0.5);
    expect(layout.series[0]?.halfLife).toBeCloseTo(1, 5);
  });

  it('counts positive / negative / zero residuals', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    const s = layout.series[0]!;
    expect(s.positiveResidualCount + s.negativeResidualCount + s.zeroResidualCount).toBe(
      s.finiteCount,
    );
  });

  it('records RMSE residual', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series[0]?.rmseResidual).toBeGreaterThan(0);
  });

  it('drops hidden series', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy, flat],
      hiddenSeries: ['f'],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('n');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
      yMin: -10,
      yMax: 30,
    });
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(30);
  });

  it('per-series alpha override beats chart-level', () => {
    const layout = computeLineEwmaLayout({
      series: [{ ...noisy, alpha: 0.7 }],
      width: 500,
      height: 300,
      padding: 40,
      alpha: 0.2,
    });
    expect(layout.series[0]?.alpha).toBe(0.7);
  });

  it('per-series span overrides chart-level alpha', () => {
    const layout = computeLineEwmaLayout({
      series: [{ ...noisy, span: 9 }],
      width: 500,
      height: 300,
      padding: 40,
      alpha: 0.5,
    });
    expect(layout.series[0]?.alpha).toBeCloseTo(0.2, 5);
  });

  it('records visibleSeriesCount + totalPoints', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy, flat],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(10 + 3);
  });

  it('per-point carries px + rawPy + ewmaPy', () => {
    const layout = computeLineEwmaLayout({
      series: [noisy],
      width: 500,
      height: 300,
      padding: 40,
    });
    const points = layout.series[0]!.points;
    expect(points[1]?.rawPy).not.toBe(points[1]?.ewmaPy);
  });
});

describe('describeLineEwmaChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineEwmaChart([])).toBe('No data');
    expect(describeLineEwmaChart(null)).toBe('No data');
  });

  it('describes alpha, half-life, final EWMA', () => {
    const desc = describeLineEwmaChart([noisy]);
    expect(desc).toMatch(/alpha /);
    expect(desc).toMatch(/half-life /);
    expect(desc).toMatch(/final EWMA/);
  });
});

describe('<ChartLineEwma> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineEwma series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-ewma"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with kind=raw', () => {
    render(<ChartLineEwma series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-ewma-raw-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders ewma path with kind=ewma', () => {
    render(<ChartLineEwma series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-ewma-ewma-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('ewma');
  });

  it('hides raw path via showRaw=false', () => {
    render(<ChartLineEwma series={[noisy]} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewma-raw-path"]'),
    ).toBeNull();
  });

  it('renders residual sticks when showResidualSticks=true', () => {
    render(<ChartLineEwma series={[noisy]} showResidualSticks />);
    const sticks = document.querySelectorAll(
      '[data-section="chart-line-ewma-residual-stick"]',
    );
    expect(sticks.length).toBeGreaterThan(0);
  });

  it('omits residual sticks by default', () => {
    render(<ChartLineEwma series={[noisy]} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-ewma-residual-stick"]',
      ).length,
    ).toBe(0);
  });

  it('renders dots with residual + ewma + raw attrs', () => {
    render(<ChartLineEwma series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-ewma-dot"][data-point-index="1"]',
    );
    expect(dot?.getAttribute('data-raw')).toBeTruthy();
    expect(dot?.getAttribute('data-ewma')).toBeTruthy();
    expect(dot?.getAttribute('data-residual')).toBeTruthy();
    expect(dot?.getAttribute('data-residual-sign')).toBeTruthy();
  });

  it('hides dots via showDots=false', () => {
    render(<ChartLineEwma series={[noisy]} showDots={false} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-ewma-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders half-life badge with alpha', () => {
    render(<ChartLineEwma series={[noisy]} alpha={0.5} />);
    const badge = document.querySelector(
      '[data-section="chart-line-ewma-badge"]',
    );
    expect(Number(badge?.getAttribute('data-alpha'))).toBe(0.5);
    expect(Number(badge?.getAttribute('data-half-life'))).toBeCloseTo(1, 5);
  });

  it('hides badge via showHalfLifeBadge=false', () => {
    render(
      <ChartLineEwma series={[noisy]} showHalfLifeBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-ewma-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineEwma series={[noisy]} ariaLabel="ewma" />);
    const region = screen.getByRole('region', { name: 'ewma' });
    const img = within(region).getByRole('img', { name: 'ewma' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLineEwma series={[noisy]} alpha={0.3} />);
    const root = document.querySelector('[data-section="chart-line-ewma"]');
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('10');
    expect(Number(root?.getAttribute('data-alpha'))).toBe(0.3);
    expect(Number(root?.getAttribute('data-dominant-alpha'))).toBe(0.3);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineEwma series={[noisy]} alpha={0.5} />);
    const group = document.querySelector(
      '[data-section="chart-line-ewma-series-group"]',
    );
    expect(Number(group?.getAttribute('data-series-alpha'))).toBe(0.5);
    expect(Number(group?.getAttribute('data-series-half-life'))).toBeCloseTo(
      1,
      5,
    );
    expect(group?.getAttribute('data-series-rmse')).toBeTruthy();
  });

  it('tooltip shows raw + ewma + residual rows on hover', () => {
    render(<ChartLineEwma series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-ewma-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const raw = document.querySelector(
      '[data-section="chart-line-ewma-tooltip-raw"]',
    );
    const ewma = document.querySelector(
      '[data-section="chart-line-ewma-tooltip-ewma"]',
    );
    const residual = document.querySelector(
      '[data-section="chart-line-ewma-tooltip-residual"]',
    );
    expect(raw?.textContent).toMatch(/raw:/);
    expect(ewma?.textContent).toMatch(/ewma:/);
    expect(residual?.textContent).toMatch(/residual:/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineEwma series={[noisy]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-ewma-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-ewma-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLineEwma series={[noisy]} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-ewma-dot"][data-point-index="3"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-ewma-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick', () => {
    const onPointClick = vi.fn();
    render(<ChartLineEwma series={[noisy]} onPointClick={onPointClick} />);
    const dot = document.querySelector(
      '[data-section="chart-line-ewma-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend shows alpha + half-life', () => {
    render(<ChartLineEwma series={[noisy]} alpha={0.5} />);
    const stats = document.querySelector(
      '[data-section="chart-line-ewma-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/α /);
    expect(stats?.textContent).toMatch(/hl /);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(<ChartLineEwma series={[noisy]} onSeriesToggle={onToggle} />);
    const item = document.querySelector(
      '[data-section="chart-line-ewma-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: noisy, hidden: true });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineEwma series={[noisy]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewma-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(<ChartLineEwma series={[noisy]} animate />);
    const root = container.querySelector(
      '[data-section="chart-line-ewma"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineEwma series={[noisy]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ewma"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEwma ref={ref} series={[noisy]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineEwma.displayName).toBe('ChartLineEwma');
  });
});
