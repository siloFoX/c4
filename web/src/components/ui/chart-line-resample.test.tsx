import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineResample,
  DEFAULT_CHART_LINE_RESAMPLE_HEIGHT,
  DEFAULT_CHART_LINE_RESAMPLE_PALETTE,
  DEFAULT_CHART_LINE_RESAMPLE_TARGET,
  DEFAULT_CHART_LINE_RESAMPLE_WIDTH,
  LINE_RESAMPLE_MODES,
  applyLineResample,
  computeLineResampleLayout,
  describeLineResampleChart,
  getLineResampleDefaultColor,
  getLineResampleFinitePoints,
  lineResampleLinearUpsample,
  lineResampleLttb,
  lineResampleMean,
  lineResampleMinMax,
  lineResampleStride,
  normaliseLineResampleMode,
  normaliseLineResampleTarget,
  type ChartLineResampleSeries,
} from './chart-line-resample';

const denseData = Array.from({ length: 200 }, (_, i) => ({
  x: i,
  y: Math.sin(i / 5) + i * 0.01,
}));

const dense: ChartLineResampleSeries = {
  id: 'd',
  label: 'Dense',
  data: denseData,
};

const sparse: ChartLineResampleSeries = {
  id: 's',
  label: 'Sparse',
  data: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
  ],
};

describe('chart-line-resample: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_RESAMPLE_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_RESAMPLE_HEIGHT).toBeGreaterThan(0);
  });

  it('default target >= 2', () => {
    expect(DEFAULT_CHART_LINE_RESAMPLE_TARGET).toBeGreaterThanOrEqual(2);
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_RESAMPLE_PALETTE.length).toBe(10);
  });

  it('exports 5 canonical modes', () => {
    expect(LINE_RESAMPLE_MODES).toEqual([
      'lttb',
      'stride',
      'mean',
      'minmax',
      'linear-upsample',
    ]);
  });
});

describe('getLineResampleDefaultColor', () => {
  it('cycles', () => {
    expect(getLineResampleDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0],
    );
    expect(getLineResampleDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineResampleDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0],
    );
    expect(getLineResampleDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_RESAMPLE_PALETTE[0],
    );
  });
});

describe('getLineResampleFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineResampleFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('preserves originalIndex', () => {
    const f = getLineResampleFinitePoints([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
    expect(f.map((p) => p.originalIndex)).toEqual([0, 1, 2]);
  });

  it('returns [] for null', () => {
    expect(getLineResampleFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineResampleTarget', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineResampleTarget(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_RESAMPLE_TARGET,
    );
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineResampleTarget(1)).toBe(2);
    expect(normaliseLineResampleTarget(0)).toBe(2);
    expect(normaliseLineResampleTarget(-5)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineResampleTarget(50.9)).toBe(50);
  });
});

describe('normaliseLineResampleMode', () => {
  it('returns lttb as default for invalid', () => {
    expect(normaliseLineResampleMode('invalid')).toBe('lttb');
    expect(normaliseLineResampleMode(null)).toBe('lttb');
  });

  it('identity for valid mode', () => {
    for (const m of LINE_RESAMPLE_MODES) {
      expect(normaliseLineResampleMode(m)).toBe(m);
    }
  });
});

describe('lineResampleStride', () => {
  it('returns [] for empty', () => {
    expect(lineResampleStride([], 10)).toEqual([]);
    expect(lineResampleStride(null, 10)).toEqual([]);
  });

  it('returns input as-is when input <= target', () => {
    const out = lineResampleStride(sparse.data, 10);
    expect(out).toHaveLength(3);
  });

  it('picks target samples at regular stride', () => {
    const out = lineResampleStride(denseData, 10);
    expect(out).toHaveLength(10);
    // first and last preserved
    expect(out[0]?.originalIndex).toBe(0);
    expect(out[out.length - 1]?.originalIndex).toBe(199);
  });

  it('clamps target to >= 2', () => {
    const out = lineResampleStride(denseData, 0);
    expect(out.length).toBe(2);
  });
});

describe('lineResampleMean', () => {
  it('returns [] for empty', () => {
    expect(lineResampleMean([], 10)).toEqual([]);
  });

  it('returns input as-is when input <= target', () => {
    const out = lineResampleMean(sparse.data, 10);
    expect(out).toHaveLength(3);
  });

  it('aggregates into target buckets', () => {
    const out = lineResampleMean(denseData, 10);
    expect(out).toHaveLength(10);
    // synthesized -- mean point
    expect(out[0]?.synthesized).toBe(true);
  });

  it('approximates the mean of the bucket', () => {
    // 4 points at y = [1, 2, 3, 4]; bucket of 4 into 1 -> mean = 2.5
    const out = lineResampleMean(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 4 },
      ],
      2,
    );
    // 2 buckets: [1, 2] mean=1.5; [3, 4] mean=3.5
    expect(out[0]?.y).toBeCloseTo(1.5, 5);
    expect(out[1]?.y).toBeCloseTo(3.5, 5);
  });
});

describe('lineResampleMinMax', () => {
  it('returns [] for empty', () => {
    expect(lineResampleMinMax([], 10)).toEqual([]);
  });

  it('preserves both min and max per bucket', () => {
    // 8 points, target=4 -> 2 buckets, each yields min + max
    const data = [
      { x: 0, y: 5 },
      { x: 1, y: 1 }, // min in bucket 1
      { x: 2, y: 9 }, // max in bucket 1
      { x: 3, y: 3 },
      { x: 4, y: 6 },
      { x: 5, y: 2 }, // min in bucket 2
      { x: 6, y: 8 }, // max in bucket 2
      { x: 7, y: 4 },
    ];
    const out = lineResampleMinMax(data, 4);
    // Should contain values 1, 9 from bucket 1 and 2, 8 from bucket 2
    const ys = out.map((p) => p.y);
    expect(ys).toContain(1);
    expect(ys).toContain(9);
    expect(ys).toContain(2);
    expect(ys).toContain(8);
  });

  it('orders min/max by original x order within bucket', () => {
    const data = [
      { x: 0, y: 9 }, // max first
      { x: 1, y: 5 },
      { x: 2, y: 1 }, // min last
    ];
    const out = lineResampleMinMax(data, 2);
    // Should be max=9 at x=0 then min=1 at x=2 (preserving x order)
    expect(out[0]?.x).toBe(0);
    expect(out[1]?.x).toBe(2);
  });

  it('returns input as-is when input <= target', () => {
    const out = lineResampleMinMax(sparse.data, 10);
    expect(out).toHaveLength(3);
  });
});

describe('lineResampleLttb', () => {
  it('returns [] for empty', () => {
    expect(lineResampleLttb([], 10)).toEqual([]);
  });

  it('returns input as-is when input <= target', () => {
    const out = lineResampleLttb(sparse.data, 10);
    expect(out).toHaveLength(3);
  });

  it('emits exactly target samples', () => {
    const out = lineResampleLttb(denseData, 20);
    expect(out).toHaveLength(20);
  });

  it('preserves first and last samples', () => {
    const out = lineResampleLttb(denseData, 20);
    expect(out[0]?.originalIndex).toBe(0);
    expect(out[out.length - 1]?.originalIndex).toBe(199);
  });

  it('all output points are non-synthesized (kept original samples)', () => {
    const out = lineResampleLttb(denseData, 20);
    expect(out.every((p) => p.synthesized === false)).toBe(true);
  });

  it('falls back to stride for target < 3', () => {
    const out = lineResampleLttb(denseData, 2);
    expect(out).toHaveLength(2);
    expect(out[0]?.originalIndex).toBe(0);
    expect(out[out.length - 1]?.originalIndex).toBe(199);
  });
});

describe('lineResampleLinearUpsample', () => {
  it('returns [] for empty', () => {
    expect(lineResampleLinearUpsample([], 10)).toEqual([]);
  });

  it('returns input as-is when input >= target', () => {
    const out = lineResampleLinearUpsample(denseData, 10);
    expect(out).toHaveLength(200);
  });

  it('upsamples to target via linear interpolation', () => {
    const out = lineResampleLinearUpsample(
      [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      5,
    );
    expect(out).toHaveLength(5);
    // x at 0, 0.25, 0.5, 0.75, 1; y interpolates 0, 0.5, 1.0, 1.5, 2.0
    expect(out[2]?.y).toBeCloseTo(1, 5);
    expect(out[2]?.synthesized).toBe(true);
  });

  it('marks endpoints as non-synthesized', () => {
    const out = lineResampleLinearUpsample(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      11,
    );
    expect(out[0]?.synthesized).toBe(false);
    expect(out[out.length - 1]?.synthesized).toBe(false);
  });

  it('handles single-point input', () => {
    const out = lineResampleLinearUpsample([{ x: 0, y: 5 }], 10);
    expect(out).toHaveLength(1);
  });
});

describe('applyLineResample', () => {
  it('dispatches to the right algorithm', () => {
    const ltt = applyLineResample(denseData, 'lttb', 10);
    const str = applyLineResample(denseData, 'stride', 10);
    const mean = applyLineResample(denseData, 'mean', 10);
    const mm = applyLineResample(denseData, 'minmax', 10);
    const up = applyLineResample(sparse.data, 'linear-upsample', 10);
    expect(ltt).toHaveLength(10);
    expect(str).toHaveLength(10);
    expect(mean).toHaveLength(10);
    // minmax with target=10 means 5 buckets * 2 outputs each = 10
    expect(mm.length).toBeLessThanOrEqual(10);
    expect(up).toHaveLength(10);
  });
});

describe('computeLineResampleLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineResampleLayout({
      series: [],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineResampleLayout({
      series: [dense],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds raw + resampled paths per series', () => {
    const layout = computeLineResampleLayout({
      series: [dense],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.rawPath.length).toBeGreaterThan(0);
    expect(s.resampledPath.length).toBeGreaterThan(0);
    expect(s.rawCount).toBe(200);
  });

  it('records reduction ratio per series', () => {
    const layout = computeLineResampleLayout({
      series: [dense],
      width: 500,
      height: 300,
      padding: 40,
      target: 20,
    });
    expect(layout.series[0]?.reductionRatio).toBeCloseTo(20 / 200, 3);
  });

  it('per-series mode override beats chart-level', () => {
    const layout = computeLineResampleLayout({
      series: [{ ...dense, mode: 'stride' }],
      width: 500,
      height: 300,
      padding: 40,
      mode: 'lttb',
    });
    expect(layout.series[0]?.mode).toBe('stride');
  });

  it('per-series target override beats chart-level', () => {
    const layout = computeLineResampleLayout({
      series: [{ ...dense, target: 5 }],
      width: 500,
      height: 300,
      padding: 40,
      target: 50,
    });
    expect(layout.series[0]?.target).toBe(5);
  });

  it('drops hidden series', () => {
    const layout = computeLineResampleLayout({
      series: [dense, sparse],
      hiddenSeries: ['s'],
      width: 500,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('d');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineResampleLayout({
      series: [dense],
      width: 500,
      height: 300,
      padding: 40,
      yMin: -100,
      yMax: 100,
    });
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(100);
  });

  it('records total raw + resampled counts', () => {
    const layout = computeLineResampleLayout({
      series: [dense, sparse],
      width: 500,
      height: 300,
      padding: 40,
      target: 20,
    });
    // dense -> 20 (downsample); sparse 3 -> 3 (already <= 20)
    expect(layout.totalRawPoints).toBe(200 + 3);
    expect(layout.totalResampledPoints).toBe(20 + 3);
  });

  it('upsamples sparse data when mode=linear-upsample', () => {
    const layout = computeLineResampleLayout({
      series: [sparse],
      width: 500,
      height: 300,
      padding: 40,
      mode: 'linear-upsample',
      target: 30,
    });
    expect(layout.series[0]?.resampledCount).toBe(30);
  });
});

describe('describeLineResampleChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineResampleChart([])).toBe('No data');
    expect(describeLineResampleChart(null)).toBe('No data');
  });

  it('summarises per series with mode and counts', () => {
    const desc = describeLineResampleChart([dense], {
      mode: 'lttb',
      target: 20,
    });
    expect(desc).toMatch(/lttb/);
    expect(desc).toMatch(/20\/200/);
  });
});

describe('<ChartLineResample> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineResample series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-resample"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with kind=raw', () => {
    render(<ChartLineResample series={[dense]} target={20} />);
    const raw = document.querySelector(
      '[data-section="chart-line-resample-raw-path"]',
    );
    expect(raw?.getAttribute('data-kind')).toBe('raw');
  });

  it('renders resampled path with kind=resampled', () => {
    render(<ChartLineResample series={[dense]} target={20} />);
    const r = document.querySelector(
      '[data-section="chart-line-resample-resampled-path"]',
    );
    expect(r?.getAttribute('data-kind')).toBe('resampled');
  });

  it('hides raw via showRaw=false', () => {
    render(<ChartLineResample series={[dense]} target={20} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-resample-raw-path"]'),
    ).toBeNull();
  });

  it('renders dots with synthesized + originalIndex attrs', () => {
    render(<ChartLineResample series={[dense]} mode="mean" target={20} />);
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"]',
    );
    expect(dot?.getAttribute('data-synthesized')).toBe('true');
    expect(dot?.getAttribute('data-original-index')).toBeTruthy();
  });

  it('hides dots via showDots=false', () => {
    render(
      <ChartLineResample series={[dense]} target={20} showDots={false} />,
    );
    expect(
      document.querySelectorAll('[data-section="chart-line-resample-dot"]')
        .length,
    ).toBe(0);
  });

  it('renders reduction badge with mode + counts', () => {
    render(<ChartLineResample series={[dense]} mode="lttb" target={20} />);
    const badge = document.querySelector(
      '[data-section="chart-line-resample-badge"]',
    );
    expect(badge?.getAttribute('data-mode')).toBe('lttb');
    expect(Number(badge?.getAttribute('data-resampled-count'))).toBe(20);
    expect(Number(badge?.getAttribute('data-raw-count'))).toBe(200);
  });

  it('hides badge via showReductionBadge=false', () => {
    render(
      <ChartLineResample
        series={[dense]}
        target={20}
        showReductionBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-resample-badge"]'),
    ).toBeNull();
  });

  it('mode toggle has 5 buttons matching LINE_RESAMPLE_MODES', () => {
    render(<ChartLineResample series={[dense]} />);
    const buttons = document.querySelectorAll(
      '[data-section="chart-line-resample-mode-button"]',
    );
    expect(buttons.length).toBe(5);
  });

  it('active mode button is marked aria-checked=true', () => {
    render(<ChartLineResample series={[dense]} defaultMode="stride" />);
    const active = document.querySelector(
      '[data-section="chart-line-resample-mode-button"][data-mode="stride"]',
    );
    expect(active?.getAttribute('aria-checked')).toBe('true');
    expect(active?.getAttribute('data-active')).toBe('true');
  });

  it('clicking mode button switches active (uncontrolled)', () => {
    const onModeChange = vi.fn();
    render(
      <ChartLineResample series={[dense]} onModeChange={onModeChange} />,
    );
    const meanButton = document.querySelector(
      '[data-section="chart-line-resample-mode-button"][data-mode="mean"]',
    ) as HTMLElement;
    fireEvent.click(meanButton);
    expect(onModeChange).toHaveBeenCalledWith('mean');
  });

  it('controlled mode does not update internal state', () => {
    const onModeChange = vi.fn();
    render(
      <ChartLineResample
        series={[dense]}
        mode="lttb"
        onModeChange={onModeChange}
      />,
    );
    const meanButton = document.querySelector(
      '[data-section="chart-line-resample-mode-button"][data-mode="mean"]',
    ) as HTMLElement;
    fireEvent.click(meanButton);
    expect(onModeChange).toHaveBeenCalledWith('mean');
    // active button should still be lttb because it's controlled
    const active = document.querySelector(
      '[data-section="chart-line-resample-mode-button"][data-active="true"]',
    );
    expect(active?.getAttribute('data-mode')).toBe('lttb');
  });

  it('hides mode toggle via showModeToggle=false', () => {
    render(<ChartLineResample series={[dense]} showModeToggle={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-resample-mode-toggle"]',
      ),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineResample series={[dense]} ariaLabel="rs" />);
    const region = screen.getByRole('region', { name: 'rs' });
    const img = within(region).getByRole('img', { name: 'rs' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(<ChartLineResample series={[dense]} mode="lttb" target={20} />);
    const root = document.querySelector(
      '[data-section="chart-line-resample"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-mode')).toBe('lttb');
    expect(Number(root?.getAttribute('data-target'))).toBe(20);
    expect(Number(root?.getAttribute('data-total-raw-points'))).toBe(200);
    expect(Number(root?.getAttribute('data-total-resampled-points'))).toBe(20);
  });

  it('tooltip shows synthesized vs original source row', () => {
    render(<ChartLineResample series={[dense]} mode="mean" target={20} />);
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const source = document.querySelector(
      '[data-section="chart-line-resample-tooltip-source"]',
    );
    expect(source?.textContent).toMatch(/synthesized/);
  });

  it('tooltip shows original index for non-synthesized', () => {
    render(<ChartLineResample series={[dense]} mode="lttb" target={20} />);
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const source = document.querySelector(
      '[data-section="chart-line-resample-tooltip-source"]',
    );
    expect(source?.textContent).toMatch(/original/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineResample series={[dense]} target={20} />);
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-resample-tooltip"]'),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineResample series={[dense]} target={20} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-resample-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineResample
        series={[dense]}
        target={20}
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-resample-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('legend shows resampled / raw counts', () => {
    render(<ChartLineResample series={[dense]} target={20} />);
    const stats = document.querySelector(
      '[data-section="chart-line-resample-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/\(20\/200\)/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineResample series={[dense]} onSeriesToggle={onToggle} />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-resample-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({ series: dense, hidden: true });
  });

  it('omits legend via showLegend=false', () => {
    render(<ChartLineResample series={[dense]} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-resample-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(<ChartLineResample series={[dense]} animate />);
    const root = container.querySelector(
      '[data-section="chart-line-resample"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineResample series={[dense]} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-resample"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineResample ref={ref} series={[dense]} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineResample.displayName).toBe('ChartLineResample');
  });
});
