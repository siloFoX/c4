import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineResidual,
  DEFAULT_CHART_LINE_RESIDUAL_HEIGHT,
  DEFAULT_CHART_LINE_RESIDUAL_NEGATIVE_COLOR,
  DEFAULT_CHART_LINE_RESIDUAL_PADDING,
  DEFAULT_CHART_LINE_RESIDUAL_PALETTE,
  DEFAULT_CHART_LINE_RESIDUAL_POSITIVE_COLOR,
  DEFAULT_CHART_LINE_RESIDUAL_TICK_COUNT,
  DEFAULT_CHART_LINE_RESIDUAL_WIDTH,
  classifyLineResidualSign,
  computeLineResidualLayout,
  computeLineResidualStats,
  computeResidual,
  describeLineResidualChart,
  getLineResidualDefaultColor,
  getLineResidualFinitePoints,
  type ChartLineResidualPoint,
  type ChartLineResidualSeries,
} from './chart-line-residual';

const series: ChartLineResidualSeries = {
  id: 'a',
  label: 'Model',
  data: [
    { x: 0, observed: 10, predicted: 10 }, // residual 0
    { x: 1, observed: 12, predicted: 10 }, // +2 underpredicted
    { x: 2, observed: 9, predicted: 11 }, // -2 overpredicted
    { x: 3, observed: 15, predicted: 12 }, // +3
    { x: 4, observed: 8, predicted: 11 }, // -3
  ],
};

describe('DEFAULT_CHART_LINE_RESIDUAL_* defaults', () => {
  it('has positive width, height, padding, tick count', () => {
    expect(DEFAULT_CHART_LINE_RESIDUAL_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RESIDUAL_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RESIDUAL_PADDING).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_CHART_LINE_RESIDUAL_TICK_COUNT).toBeGreaterThanOrEqual(2);
  });

  it('has distinct positive and negative residual colors', () => {
    expect(DEFAULT_CHART_LINE_RESIDUAL_POSITIVE_COLOR).not.toBe(
      DEFAULT_CHART_LINE_RESIDUAL_NEGATIVE_COLOR,
    );
  });

  it('exposes a 10-color palette', () => {
    expect(DEFAULT_CHART_LINE_RESIDUAL_PALETTE).toHaveLength(10);
  });
});

describe('getLineResidualDefaultColor', () => {
  it('cycles through the palette', () => {
    expect(getLineResidualDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_RESIDUAL_PALETTE[0],
    );
    expect(getLineResidualDefaultColor(11)).toBe(
      DEFAULT_CHART_LINE_RESIDUAL_PALETTE[1],
    );
  });

  it('falls back to first color on invalid index', () => {
    expect(getLineResidualDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_RESIDUAL_PALETTE[0],
    );
    expect(getLineResidualDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_RESIDUAL_PALETTE[0],
    );
  });
});

describe('getLineResidualFinitePoints', () => {
  it('drops non-finite samples (any field)', () => {
    expect(
      getLineResidualFinitePoints([
        { x: 0, observed: 1, predicted: 2 },
        { x: Number.NaN, observed: 1, predicted: 2 },
        { x: 1, observed: Number.NaN, predicted: 2 },
        { x: 2, observed: 1, predicted: Number.POSITIVE_INFINITY },
        { x: 3, observed: 5, predicted: 4 },
      ]),
    ).toEqual([
      { x: 0, observed: 1, predicted: 2 },
      { x: 3, observed: 5, predicted: 4 },
    ]);
  });

  it('returns [] for non-array', () => {
    expect(
      getLineResidualFinitePoints(
        null as unknown as ReadonlyArray<ChartLineResidualPoint>,
      ),
    ).toEqual([]);
  });
});

describe('computeResidual', () => {
  it('returns observed - predicted', () => {
    expect(computeResidual(10, 7)).toBe(3);
    expect(computeResidual(5, 10)).toBe(-5);
  });

  it('returns 0 on non-finite inputs', () => {
    expect(computeResidual(Number.NaN, 5)).toBe(0);
    expect(computeResidual(5, Number.NaN)).toBe(0);
    expect(computeResidual(Number.NaN, Number.NaN)).toBe(0);
  });
});

describe('classifyLineResidualSign', () => {
  it('classifies positive / negative / zero', () => {
    expect(classifyLineResidualSign(3)).toBe('positive');
    expect(classifyLineResidualSign(-3)).toBe('negative');
    expect(classifyLineResidualSign(0)).toBe('zero');
  });

  it('honors epsilon equality band', () => {
    expect(classifyLineResidualSign(0.5, 1)).toBe('zero');
    expect(classifyLineResidualSign(-0.5, 1)).toBe('zero');
    expect(classifyLineResidualSign(1.5, 1)).toBe('positive');
  });

  it('returns zero for non-finite', () => {
    expect(classifyLineResidualSign(Number.NaN)).toBe('zero');
  });

  it('non-finite / negative epsilon falls back to 0', () => {
    expect(classifyLineResidualSign(1, Number.NaN)).toBe('positive');
    expect(classifyLineResidualSign(1, -1)).toBe('positive');
  });
});

describe('computeLineResidualStats', () => {
  it('returns zeros for empty / non-array', () => {
    const e = computeLineResidualStats([]);
    expect(e.finiteCount).toBe(0);
    expect(e.meanResidual).toBe(0);
    expect(e.mae).toBe(0);
    expect(e.rmse).toBe(0);
    expect(e.bias).toBe('unbiased');
    expect(
      computeLineResidualStats(
        null as unknown as readonly ChartLineResidualPoint[],
      ).finiteCount,
    ).toBe(0);
  });

  it('computes mean + mae + rmse + maxAbs + bias', () => {
    const s = computeLineResidualStats(series.data);
    // residuals: 0, 2, -2, 3, -3 -> mean 0, |.|: 0,2,2,3,3 mae=10/5=2, rmse=sqrt(26/5)
    expect(s.finiteCount).toBe(5);
    expect(s.meanResidual).toBeCloseTo(0, 6);
    expect(s.mae).toBeCloseTo(2, 6);
    expect(s.rmse).toBeCloseTo(Math.sqrt(26 / 5), 6);
    expect(s.maxAbs).toBe(3);
    expect(s.maxResidual).toBe(3);
    expect(s.minResidual).toBe(-3);
    expect(s.bias).toBe('unbiased');
  });

  it('detects positive bias (model under-predicts)', () => {
    const s = computeLineResidualStats([
      { x: 0, observed: 10, predicted: 5 },
      { x: 1, observed: 12, predicted: 8 },
    ]);
    expect(s.meanResidual).toBeGreaterThan(0);
    expect(s.bias).toBe('positive');
  });

  it('detects negative bias (model over-predicts)', () => {
    const s = computeLineResidualStats([
      { x: 0, observed: 5, predicted: 10 },
      { x: 1, observed: 8, predicted: 12 },
    ]);
    expect(s.meanResidual).toBeLessThan(0);
    expect(s.bias).toBe('negative');
  });

  it('honors epsilon for bias classification', () => {
    const s = computeLineResidualStats(
      [
        { x: 0, observed: 0.3, predicted: 0 },
        { x: 1, observed: 0.4, predicted: 0 },
      ],
      1,
    );
    expect(s.bias).toBe('unbiased');
    expect(s.positiveCount).toBe(0);
  });

  it('drops non-finite samples', () => {
    const s = computeLineResidualStats([
      { x: 0, observed: 1, predicted: 1 },
      { x: 1, observed: Number.NaN, predicted: 2 },
      { x: 2, observed: 3, predicted: 1 },
    ]);
    expect(s.finiteCount).toBe(2);
    expect(s.meanResidual).toBeCloseTo(1, 6);
  });
});

describe('computeLineResidualLayout', () => {
  it('returns empty when no series', () => {
    const layout = computeLineResidualLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty when canvas degenerate', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds layout with path + per-point residual + stem positions', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path).toMatch(/^M /);
    expect(s.points).toHaveLength(5);
    // residual fields populated
    expect(s.points[0]?.residual).toBe(0);
    expect(s.points[1]?.residual).toBe(2);
    expect(s.points[2]?.residual).toBe(-2);
    expect(s.points[1]?.sign).toBe('positive');
    expect(s.points[2]?.sign).toBe('negative');
  });

  it('expands y bounds to include zero', () => {
    // All-positive residuals -> yMin still 0.
    const all_pos: ChartLineResidualSeries = {
      id: 'p',
      label: 'p',
      data: [
        { x: 0, observed: 10, predicted: 5 },
        { x: 1, observed: 12, predicted: 7 },
      ],
    };
    const layout = computeLineResidualLayout({
      series: [all_pos],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.yMin).toBeLessThanOrEqual(0);
  });

  it('records zeroY inside the inner plot', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.zeroY).toBeGreaterThanOrEqual(30);
    expect(layout.zeroY).toBeLessThanOrEqual(270);
  });

  it('stem endpoints land on zeroY', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    for (const p of layout.series[0]!.points) {
      expect(p.stemY2).toBe(layout.zeroY);
    }
  });

  it('exposes per-series stats on the layout series', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
    });
    const s = layout.series[0]!;
    expect(s.stats.finiteCount).toBe(5);
    expect(s.stats.bias).toBe('unbiased');
    expect(s.stats.mae).toBeCloseTo(2, 6);
  });

  it('honors hidden series filter', () => {
    const layout = computeLineResidualLayout({
      series: [
        series,
        {
          id: 'b',
          label: 'B',
          data: [{ x: 0, observed: 1, predicted: 1 }],
        },
      ],
      hiddenSeries: new Set(['a']),
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('b');
  });

  it('respects user-supplied bounds overrides', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      width: 400,
      height: 300,
      padding: 30,
      xMin: -10,
      xMax: 20,
      yMin: -50,
      yMax: 50,
    });
    expect(layout.xMin).toBe(-10);
    expect(layout.xMax).toBe(20);
    expect(layout.yMin).toBe(-50);
    expect(layout.yMax).toBe(50);
  });

  it('produces axis ticks at the requested step count', () => {
    const layout = computeLineResidualLayout({
      series: [series],
      tickCount: 6,
      width: 400,
      height: 300,
      padding: 30,
    });
    expect(layout.xTicks).toHaveLength(6);
    expect(layout.yTicks).toHaveLength(6);
  });
});

describe('describeLineResidualChart', () => {
  it('returns "No data" on empty / hidden / no finite', () => {
    expect(describeLineResidualChart(null)).toBe('No data');
    expect(describeLineResidualChart([])).toBe('No data');
    expect(
      describeLineResidualChart([series], new Set(['a'])),
    ).toBe('No data');
  });

  it('summarises mean / MAE / RMSE / max + bias label', () => {
    const text = describeLineResidualChart([series]);
    expect(text).toContain('1 series');
    expect(text).toContain('Model');
    expect(text).toContain('MAE');
    expect(text).toContain('RMSE');
    expect(text).toContain('max |r|');
  });
});

describe('<ChartLineResidual /> rendering', () => {
  it('renders nothing meaningful when empty series', () => {
    const { container } = render(<ChartLineResidual series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-residual"]',
    );
    expect(root).not.toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-dot"]'),
    ).toHaveLength(0);
  });

  it('renders one line path + stems + dots per series by default', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-path"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-stem"]')
        .length,
    ).toBe(5);
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-dot"]'),
    ).toHaveLength(5);
  });

  it('omits the residual line when showLine=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-residual-path"]'),
    ).toBeNull();
  });

  it('omits stems when showStems=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showStems={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-stem"]'),
    ).toHaveLength(0);
  });

  it('renders the zero baseline by default', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-residual-zero-line"]',
      ),
    ).not.toBeNull();
  });

  it('omits zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-residual-zero-line"]',
      ),
    ).toBeNull();
  });

  it('exposes per-point residual + sign data attrs', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    const pos = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="1"]',
    );
    expect(pos?.getAttribute('data-sign')).toBe('positive');
    expect(pos?.getAttribute('data-residual')).toBe('2');
    const neg = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="2"]',
    );
    expect(neg?.getAttribute('data-sign')).toBe('negative');
    expect(neg?.getAttribute('data-residual')).toBe('-2');
    const zero = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="0"]',
    );
    expect(zero?.getAttribute('data-sign')).toBe('zero');
  });

  it('hides dots when showDots=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showDots={false} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-dot"]'),
    ).toHaveLength(0);
  });

  it('renders aria description and labels region', () => {
    render(<ChartLineResidual series={[series]} />);
    expect(
      screen.getByRole('region', { name: /residual plot/i }),
    ).toBeTruthy();
  });

  it('shows tooltip with observed + predicted + residual rows', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    const tip = container.querySelector(
      '[data-section="chart-line-residual-tooltip"]',
    );
    expect(tip).not.toBeNull();
    expect(
      tip?.querySelector(
        '[data-section="chart-line-residual-tooltip-observed"]',
      )?.textContent,
    ).toMatch(/15/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-residual-tooltip-predicted"]',
      )?.textContent,
    ).toMatch(/12/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-residual-tooltip-residual"]',
      )?.textContent,
    ).toMatch(/\+3/);
    expect(
      tip?.querySelector(
        '[data-section="chart-line-residual-tooltip-residual"]',
      )?.textContent,
    ).toMatch(/under-predicted/);
  });

  it('hides tooltip on mouseLeave', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    const dot = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-residual-tooltip"]'),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      container.querySelector('[data-section="chart-line-residual-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showTooltip={false} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="0"]',
    ) as SVGCircleElement;
    fireEvent.mouseEnter(dot);
    expect(
      container.querySelector('[data-section="chart-line-residual-tooltip"]'),
    ).toBeNull();
  });

  it('invokes onPointClick with series + point', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ChartLineResidual series={[series]} onPointClick={onClick} />,
    );
    const dot = container.querySelector(
      '[data-section="chart-line-residual-dot"][data-point-index="3"]',
    ) as SVGCircleElement;
    fireEvent.click(dot);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0].point.residual).toBe(3);
  });

  it('exposes per-series diagnostic stats via data attrs', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    const group = container.querySelector(
      '[data-section="chart-line-residual-series-group"][data-series-id="a"]',
    );
    expect(group?.getAttribute('data-series-mean-residual')).toBe('0');
    expect(group?.getAttribute('data-series-bias')).toBe('unbiased');
    expect(group?.getAttribute('data-series-positive-count')).toBe('2');
    expect(group?.getAttribute('data-series-negative-count')).toBe('2');
    expect(group?.getAttribute('data-series-zero-count')).toBe('1');
  });

  it('legend shows RMSE + bias per series', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-residual-legend-stats"]',
      )?.textContent,
    ).toMatch(/RMSE/);
    expect(
      container.querySelector(
        '[data-section="chart-line-residual-legend-stats"]',
      )?.textContent,
    ).toMatch(/unbiased/);
  });

  it('toggles series via the legend (uncontrolled)', () => {
    const { container } = render(
      <ChartLineResidual
        series={[
          series,
          {
            id: 'b',
            label: 'B',
            data: [{ x: 0, observed: 5, predicted: 5 }],
          },
        ]}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-residual-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-path"]'),
    ).toHaveLength(1);
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineResidual
        series={[
          series,
          {
            id: 'b',
            label: 'B',
            data: [{ x: 0, observed: 5, predicted: 5 }],
          },
        ]}
        hiddenSeries={new Set(['b'])}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-residual-path"]'),
    ).toHaveLength(1);
  });

  it('emits onHiddenSeriesChange', () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChartLineResidual
        series={[series]}
        onHiddenSeriesChange={onChange}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-residual-legend-button"][data-series-id="a"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineResidual series={[series]} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-residual-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate and fade-in class', () => {
    const { container } = render(<ChartLineResidual series={[series]} />);
    const root = container.querySelector(
      '[data-section="chart-line-residual"]',
    ) as HTMLDivElement;
    expect(root.getAttribute('data-animate')).toBe('true');
    expect(root.className).toContain('motion-safe:animate-fade-in');
    const { container: c2 } = render(
      <ChartLineResidual series={[series]} animate={false} />,
    );
    const r2 = c2.querySelector(
      '[data-section="chart-line-residual"]',
    ) as HTMLDivElement;
    expect(r2.getAttribute('data-animate')).toBe('false');
    expect(r2.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards ref to root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineResidual ref={ref} series={[series]} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-residual',
    );
  });

  it('renders a stable displayName for devtools', () => {
    expect(ChartLineResidual.displayName).toBe('ChartLineResidual');
  });
});
