import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineRangeFocus,
  DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_COLOR,
  DEFAULT_CHART_LINE_RANGEFOCUS_HEIGHT,
  DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE,
  DEFAULT_CHART_LINE_RANGEFOCUS_WIDTH,
  clampLineRangeFocusRange,
  computeLineRangeFocusLayout,
  describeLineRangeFocusChart,
  getLineRangeFocusDefaultColor,
  getLineRangeFocusFinitePoints,
  normaliseLineRangeFocusOverviewRatio,
  type ChartLineRangeFocusSeries,
} from './chart-line-rangefocus';

const noisy: ChartLineRangeFocusSeries = {
  id: 'n',
  label: 'Noisy',
  data: Array.from({ length: 100 }, (_, i) => ({
    x: i,
    y: Math.sin(i / 5) + i * 0.02,
  })),
};

const simple: ChartLineRangeFocusSeries = {
  id: 's',
  label: 'Simple',
  data: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 5 },
    { x: 30, y: 15 },
  ],
};

describe('chart-line-rangefocus: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_RANGEFOCUS_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RANGEFOCUS_HEIGHT).toBeGreaterThan(0);
  });

  it('brush color set', () => {
    expect(DEFAULT_CHART_LINE_RANGEFOCUS_BRUSH_COLOR).toMatch(/#/);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE.length).toBe(10);
  });
});

describe('getLineRangeFocusDefaultColor', () => {
  it('cycles', () => {
    expect(getLineRangeFocusDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0],
    );
    expect(getLineRangeFocusDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineRangeFocusDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0],
    );
    expect(getLineRangeFocusDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_RANGEFOCUS_PALETTE[0],
    );
  });
});

describe('getLineRangeFocusFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineRangeFocusFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineRangeFocusFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineRangeFocusOverviewRatio', () => {
  it('clamps below to 0.1', () => {
    expect(normaliseLineRangeFocusOverviewRatio(0)).toBe(0.1);
    expect(normaliseLineRangeFocusOverviewRatio(-1)).toBe(0.1);
  });

  it('clamps above to 0.5', () => {
    expect(normaliseLineRangeFocusOverviewRatio(1)).toBe(0.5);
    expect(normaliseLineRangeFocusOverviewRatio(2)).toBe(0.5);
  });

  it('identity for in-range', () => {
    expect(normaliseLineRangeFocusOverviewRatio(0.25)).toBe(0.25);
  });

  it('default for non-finite', () => {
    expect(normaliseLineRangeFocusOverviewRatio(Number.NaN)).toBeGreaterThan(0);
  });
});

describe('clampLineRangeFocusRange', () => {
  it('clamps to full bounds', () => {
    const r = clampLineRangeFocusRange({ x0: -10, x1: 200 }, 0, 100);
    expect(r.x0).toBe(0);
    expect(r.x1).toBe(100);
  });

  it('null range -> full bounds', () => {
    const r = clampLineRangeFocusRange(null, 0, 100);
    expect(r.x0).toBe(0);
    expect(r.x1).toBe(100);
  });

  it('swaps x0 and x1 when reversed', () => {
    const r = clampLineRangeFocusRange({ x0: 80, x1: 20 }, 0, 100);
    expect(r.x0).toBe(20);
    expect(r.x1).toBe(80);
  });

  it('expands to minWidth when too narrow', () => {
    const r = clampLineRangeFocusRange({ x0: 50, x1: 51 }, 0, 100, 20);
    expect(r.x1 - r.x0).toBeGreaterThanOrEqual(20);
  });

  it('handles bounds collapse (full extent zero)', () => {
    const r = clampLineRangeFocusRange({ x0: 5, x1: 5 }, 5, 5);
    expect(r.x0).toBe(5);
    expect(r.x1).toBe(5);
  });

  it('handles non-finite bounds', () => {
    const r = clampLineRangeFocusRange(
      { x0: 0, x1: 1 },
      Number.NaN,
      Number.NaN,
    );
    expect(r.x0).toBeDefined();
    expect(r.x1).toBeDefined();
  });

  it('pins minWidth to lo when both endpoints near lo', () => {
    const r = clampLineRangeFocusRange({ x0: 0, x1: 0 }, 0, 100, 20);
    expect(r.x0).toBe(0);
    expect(r.x1).toBe(20);
  });
});

describe('computeLineRangeFocusLayout', () => {
  it('returns ok=false for empty', () => {
    const layout = computeLineRangeFocusLayout({
      series: [],
      range: { x0: 0, x1: 1 },
      width: 500,
      height: 400,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: 0, x1: 100 },
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('splits canvas into detail + overview panels', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: 20, x1: 60 },
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.ok).toBe(true);
    expect(layout.detailPanel.height).toBeGreaterThan(layout.overviewPanel.height);
    expect(layout.overviewPanel.y).toBeGreaterThan(
      layout.detailPanel.y + layout.detailPanel.height,
    );
  });

  it('per-series detail path only includes in-range points', () => {
    const layout = computeLineRangeFocusLayout({
      series: [simple],
      range: { x0: 5, x1: 25 },
      width: 600,
      height: 400,
      padding: 40,
    });
    const s = layout.series[0]!;
    expect(s.inRangeCount).toBe(2); // x=10 and x=20 within [5, 25]
    const inRange = s.detailPoints.filter((p) => p.inRange);
    expect(inRange).toHaveLength(2);
  });

  it('overview path includes all finite points', () => {
    const layout = computeLineRangeFocusLayout({
      series: [simple],
      range: { x0: 5, x1: 25 },
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.series[0]?.overviewPoints).toHaveLength(4);
    expect(layout.series[0]?.overviewPath.length).toBeGreaterThan(0);
  });

  it('brush rect width matches the projected range width', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: 25, x1: 75 },
      width: 600,
      height: 400,
      padding: 40,
    });
    const fullW = layout.overviewPanel.width;
    const ratio = (75 - 25) / (layout.fullXMax - layout.fullXMin);
    expect(layout.brushRect.width).toBeCloseTo(fullW * ratio, 3);
  });

  it('records inRange counts', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: 20, x1: 50 },
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.totalInRange).toBeGreaterThan(0);
    expect(layout.totalInRange).toBeLessThan(100);
  });

  it('drops hidden series', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy, simple],
      hiddenSeries: ['s'],
      range: { x0: 0, x1: 100 },
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('n');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineRangeFocusLayout({
      series: [simple],
      range: { x0: 0, x1: 30 },
      width: 600,
      height: 400,
      padding: 40,
      fullXMin: -10,
      fullXMax: 100,
      fullYMin: -5,
      fullYMax: 20,
    });
    expect(layout.fullXMin).toBe(-10);
    expect(layout.fullXMax).toBe(100);
    expect(layout.fullYMin).toBe(-5);
    expect(layout.fullYMax).toBe(20);
  });

  it('clamps range within bounds', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: -100, x1: 1000 },
      width: 600,
      height: 400,
      padding: 40,
    });
    expect(layout.range.x0).toBe(layout.fullXMin);
    expect(layout.range.x1).toBe(layout.fullXMax);
  });

  it('totalInRange === sum of per-series inRangeCount', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy, simple],
      range: { x0: 0, x1: 20 },
      width: 600,
      height: 400,
      padding: 40,
    });
    const sum = layout.series.reduce((acc, s) => acc + s.inRangeCount, 0);
    expect(layout.totalInRange).toBe(sum);
  });

  it('brush handles flank the brush rect at handle-width / 2', () => {
    const layout = computeLineRangeFocusLayout({
      series: [noisy],
      range: { x0: 25, x1: 75 },
      width: 600,
      height: 400,
      padding: 40,
      brushHandleWidth: 8,
    });
    expect(layout.brushLeftHandle.x).toBeCloseTo(layout.brushRect.x - 4, 3);
    expect(layout.brushRightHandle.x).toBeCloseTo(
      layout.brushRect.x + layout.brushRect.width - 4,
      3,
    );
  });
});

describe('describeLineRangeFocusChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineRangeFocusChart([])).toBe('No data');
    expect(describeLineRangeFocusChart(null)).toBe('No data');
  });

  it('describes range and in-range count', () => {
    const desc = describeLineRangeFocusChart([noisy], {
      range: { x0: 20, x1: 60 },
    });
    expect(desc).toMatch(/Detail panel shows/);
    expect(desc).toMatch(/from 20 to 60/);
  });
});

describe('<ChartLineRangeFocus> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineRangeFocus series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-rangefocus"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders detail path with kind=detail', () => {
    render(<ChartLineRangeFocus series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-rangefocus-detail-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('detail');
  });

  it('renders overview path with kind=overview', () => {
    render(<ChartLineRangeFocus series={[noisy]} />);
    const path = document.querySelector(
      '[data-section="chart-line-rangefocus-overview-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('overview');
  });

  it('hides overview via showOverview=false', () => {
    render(<ChartLineRangeFocus series={[noisy]} showOverview={false} />);
    expect(
      document.querySelector('[data-section="chart-line-rangefocus-overview"]'),
    ).toBeNull();
  });

  it('renders brush rect + two handles', () => {
    render(<ChartLineRangeFocus series={[noisy]} />);
    const rect = document.querySelector(
      '[data-section="chart-line-rangefocus-brush-rect"]',
    );
    const handles = document.querySelectorAll(
      '[data-section="chart-line-rangefocus-brush-handle"]',
    );
    expect(rect).not.toBeNull();
    expect(handles.length).toBe(2);
  });

  it('brush is role=slider with aria-valuemin / valuemax / valuenow', () => {
    render(<ChartLineRangeFocus series={[noisy]} />);
    const brush = document.querySelector(
      '[data-section="chart-line-rangefocus-brush"]',
    );
    expect(brush?.getAttribute('role')).toBe('slider');
    expect(brush?.getAttribute('aria-valuemin')).toBeTruthy();
    expect(brush?.getAttribute('aria-valuemax')).toBeTruthy();
    expect(brush?.getAttribute('aria-valuenow')).toBeTruthy();
  });

  it('hides brush via showOverviewBrush=false', () => {
    render(
      <ChartLineRangeFocus series={[noisy]} showOverviewBrush={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-rangefocus-brush"]'),
    ).toBeNull();
  });

  it('renders detail dots only for in-range points', () => {
    render(
      <ChartLineRangeFocus
        series={[simple]}
        defaultRange={{ x0: 5, x1: 25 }}
      />,
    );
    const dots = document.querySelectorAll(
      '[data-section="chart-line-rangefocus-detail-dot"]',
    );
    expect(dots.length).toBe(2); // 10 and 20 within [5, 25]
  });

  it('hides dots via showDots=false', () => {
    render(<ChartLineRangeFocus series={[noisy]} showDots={false} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-rangefocus-detail-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders range badge with x0 / x1', () => {
    render(
      <ChartLineRangeFocus
        series={[noisy]}
        defaultRange={{ x0: 20, x1: 60 }}
      />,
    );
    const badge = document.querySelector(
      '[data-section="chart-line-rangefocus-badge"]',
    );
    expect(Number(badge?.getAttribute('data-range-x0'))).toBe(20);
    expect(Number(badge?.getAttribute('data-range-x1'))).toBe(60);
  });

  it('hides badge via showRangeBadge=false', () => {
    render(
      <ChartLineRangeFocus series={[noisy]} showRangeBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-rangefocus-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineRangeFocus series={[noisy]} ariaLabel="rf" />);
    const region = screen.getByRole('region', { name: 'rf' });
    const img = within(region).getByRole('img', { name: 'rf' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineRangeFocus
        series={[noisy]}
        defaultRange={{ x0: 25, x1: 75 }}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-rangefocus"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('100');
    expect(Number(root?.getAttribute('data-range-x0'))).toBe(25);
    expect(Number(root?.getAttribute('data-range-x1'))).toBe(75);
    expect(Number(root?.getAttribute('data-total-in-range'))).toBeGreaterThan(0);
  });

  it('controlled range does not update internal state', () => {
    const onRangeChange = vi.fn();
    const { container } = render(
      <ChartLineRangeFocus
        series={[noisy]}
        range={{ x0: 10, x1: 30 }}
        onRangeChange={onRangeChange}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rangefocus"]',
    );
    expect(Number(root?.getAttribute('data-range-x0'))).toBe(10);
    expect(Number(root?.getAttribute('data-range-x1'))).toBe(30);
  });

  it('tooltip on detail dot hover shows x / y', () => {
    render(<ChartLineRangeFocus series={[simple]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-rangefocus-detail-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const x = document.querySelector(
      '[data-section="chart-line-rangefocus-tooltip-x"]',
    );
    const y = document.querySelector(
      '[data-section="chart-line-rangefocus-tooltip-y"]',
    );
    expect(x?.textContent).toMatch(/x:/);
    expect(y?.textContent).toMatch(/y:/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineRangeFocus series={[simple]} />);
    const dot = document.querySelector(
      '[data-section="chart-line-rangefocus-detail-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-rangefocus-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(<ChartLineRangeFocus series={[simple]} showTooltip={false} />);
    const dot = document.querySelector(
      '[data-section="chart-line-rangefocus-detail-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-rangefocus-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick for detail dots', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineRangeFocus
        series={[simple]}
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-rangefocus-detail-dot"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows in-range / finite counts', () => {
    render(
      <ChartLineRangeFocus
        series={[simple]}
        defaultRange={{ x0: 5, x1: 25 }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-rangefocus-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/\(2\/4\)/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineRangeFocus series={[noisy]} onSeriesToggle={onToggle} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-rangefocus-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: noisy, hidden: true });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineRangeFocus series={[noisy]} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-rangefocus-legend"]',
      ),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineRangeFocus series={[noisy]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rangefocus"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineRangeFocus series={[noisy]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rangefocus"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRangeFocus ref={ref} series={[noisy]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineRangeFocus.displayName).toBe('ChartLineRangeFocus');
  });
});
