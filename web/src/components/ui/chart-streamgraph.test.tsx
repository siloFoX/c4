import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartStreamgraph,
  buildStreamgraphCurve,
  computeStreamgraphBaseline,
  computeStreamgraphLayers,
  describeStreamgraphChart,
  getStreamgraphDefaultColor,
  getStreamgraphSampleCount,
  getStreamgraphTotals,
  DEFAULT_CHART_STREAMGRAPH_WIDTH,
  DEFAULT_CHART_STREAMGRAPH_HEIGHT,
  DEFAULT_CHART_STREAMGRAPH_PADDING,
  DEFAULT_CHART_STREAMGRAPH_BASELINE,
  DEFAULT_CHART_STREAMGRAPH_CURVE,
  DEFAULT_CHART_STREAMGRAPH_TENSION,
  DEFAULT_CHART_STREAMGRAPH_FILL_OPACITY,
  DEFAULT_CHART_STREAMGRAPH_PALETTE,
  type ChartStreamgraphSeries,
} from './chart-streamgraph';

afterEach(() => cleanup());

const SAMPLE: ChartStreamgraphSeries[] = [
  { id: 'a', label: 'Alpha', data: [1, 2, 3, 4, 5] },
  { id: 'b', label: 'Beta', data: [5, 3, 2, 4, 1] },
  { id: 'c', label: 'Gamma', data: [2, 4, 6, 2, 1] },
];

describe('chart-streamgraph constants', () => {
  it('exports the documented defaults', () => {
    expect(DEFAULT_CHART_STREAMGRAPH_WIDTH).toBe(640);
    expect(DEFAULT_CHART_STREAMGRAPH_HEIGHT).toBe(280);
    expect(DEFAULT_CHART_STREAMGRAPH_PADDING).toBe(32);
    expect(DEFAULT_CHART_STREAMGRAPH_BASELINE).toBe('silhouette');
    expect(DEFAULT_CHART_STREAMGRAPH_CURVE).toBe('cardinal');
    expect(DEFAULT_CHART_STREAMGRAPH_TENSION).toBeCloseTo(0.5);
    expect(DEFAULT_CHART_STREAMGRAPH_FILL_OPACITY).toBeCloseTo(0.7);
    expect(DEFAULT_CHART_STREAMGRAPH_PALETTE.length).toBe(10);
  });
});

describe('getStreamgraphDefaultColor', () => {
  it('returns palette[index] for valid indices', () => {
    expect(getStreamgraphDefaultColor(0)).toBe(DEFAULT_CHART_STREAMGRAPH_PALETTE[0]);
    expect(getStreamgraphDefaultColor(2)).toBe(DEFAULT_CHART_STREAMGRAPH_PALETTE[2]);
  });
  it('wraps modulo palette length', () => {
    expect(
      getStreamgraphDefaultColor(DEFAULT_CHART_STREAMGRAPH_PALETTE.length)
    ).toBe(DEFAULT_CHART_STREAMGRAPH_PALETTE[0]);
  });
  it('falls back to color 0 for invalid input', () => {
    expect(getStreamgraphDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_STREAMGRAPH_PALETTE[0]
    );
    expect(getStreamgraphDefaultColor(-1)).toBe(
      DEFAULT_CHART_STREAMGRAPH_PALETTE[0]
    );
  });
});

describe('getStreamgraphSampleCount', () => {
  it('returns the largest data length', () => {
    expect(getStreamgraphSampleCount(SAMPLE)).toBe(5);
  });
  it('returns 0 for empty input', () => {
    expect(getStreamgraphSampleCount([])).toBe(0);
  });
});

describe('getStreamgraphTotals', () => {
  it('sums per-sample values across visible series', () => {
    const t = getStreamgraphTotals(SAMPLE, 5);
    expect(t).toEqual([8, 9, 11, 10, 7]);
  });
  it('clamps non-positive / non-finite values to 0', () => {
    const series: ChartStreamgraphSeries[] = [
      { id: 'a', label: 'A', data: [Number.NaN, -1, 4, 0] },
      { id: 'b', label: 'B', data: [1, 2, 3, 4] },
    ];
    expect(getStreamgraphTotals(series, 4)).toEqual([1, 2, 7, 4]);
  });
  it('pads short series with zero', () => {
    const series: ChartStreamgraphSeries[] = [
      { id: 'a', label: 'A', data: [1, 2] },
      { id: 'b', label: 'B', data: [3, 4, 5] },
    ];
    expect(getStreamgraphTotals(series, 3)).toEqual([4, 6, 5]);
  });
});

describe('computeStreamgraphBaseline', () => {
  it('zero baseline returns all zeros', () => {
    const b = computeStreamgraphBaseline(SAMPLE, 5, 'zero');
    expect(b).toEqual([0, 0, 0, 0, 0]);
  });
  it('expand baseline returns zeros (rescaled per sample)', () => {
    const b = computeStreamgraphBaseline(SAMPLE, 5, 'expand');
    expect(b).toEqual([0, 0, 0, 0, 0]);
  });
  it('silhouette baseline centres around -total/2', () => {
    const b = computeStreamgraphBaseline(SAMPLE, 5, 'silhouette');
    expect(b[0]).toBeCloseTo(-4);
    expect(b[2]).toBeCloseTo(-5.5);
    expect(b[4]).toBeCloseTo(-3.5);
  });
  it('wiggle baseline returns one value per sample', () => {
    const b = computeStreamgraphBaseline(SAMPLE, 5, 'wiggle');
    expect(b).toHaveLength(5);
    for (const v of b) expect(Number.isFinite(v)).toBe(true);
  });
  it('wiggle preserves prev offset when total is zero', () => {
    const series: ChartStreamgraphSeries[] = [
      { id: 'a', label: 'A', data: [0, 0, 5] },
      { id: 'b', label: 'B', data: [0, 0, 5] },
    ];
    const b = computeStreamgraphBaseline(series, 3, 'wiggle');
    expect(b[0]).toBe(0);
    expect(b[1]).toBe(0);
  });
});

describe('buildStreamgraphCurve', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 0 },
  ];
  it('linear curve has L commands per segment', () => {
    const p = buildStreamgraphCurve(pts, 'linear', 'M', 0.5);
    expect(p.startsWith('M')).toBe(true);
    expect(p).toContain('L');
    expect(p).not.toContain('C');
  });
  it('step curve has square corners', () => {
    const p = buildStreamgraphCurve(pts, 'step', 'M', 0.5);
    expect(p).toContain('L 10.00 0.00');
    expect(p).toContain('L 10.00 5.00');
  });
  it('cardinal curve emits cubic bezier C commands', () => {
    const p = buildStreamgraphCurve(pts, 'cardinal', 'M', 0.5);
    expect(p).toContain('C');
  });
  it('catmullRom curve emits cubic bezier C commands too', () => {
    const p = buildStreamgraphCurve(pts, 'catmullRom', 'M', 0);
    expect(p).toContain('C');
  });
  it('single point falls through to a single move', () => {
    const p = buildStreamgraphCurve(
      [{ x: 0, y: 0 }],
      'cardinal',
      'M',
      0.5
    );
    expect(p.startsWith('M')).toBe(true);
    expect(p).not.toContain('C');
  });
  it('empty input -> empty string', () => {
    expect(buildStreamgraphCurve([], 'linear', 'M', 0.5)).toBe('');
  });
});

describe('computeStreamgraphLayers', () => {
  const innerW = 480;
  const innerH = 200;
  const padX = 40;
  const padY = 40;

  it('returns one layer per visible series', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(r.layers).toHaveLength(3);
    expect(r.sampleCount).toBe(5);
  });

  it('skips hidden series', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(['b']),
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(r.layers).toHaveLength(2);
    for (const layer of r.layers) {
      expect(layer.id).not.toBe('b');
    }
  });

  it('layers tile cleanly: layer N top == layer N+1 base', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    for (let s = 0; s < r.layers.length - 1; s++) {
      const cur = r.layers[s]!;
      const nxt = r.layers[s + 1]!;
      for (let i = 0; i < r.sampleCount; i++) {
        expect(nxt.points[i]!.baseValue).toBeCloseTo(cur.points[i]!.topValue);
      }
    }
  });

  it('expand baseline produces shares that sum to 1 per sample', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'expand',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    for (let i = 0; i < r.sampleCount; i++) {
      let sum = 0;
      for (const layer of r.layers) sum += layer.points[i]!.rawValue;
      expect(sum).toBeCloseTo(1);
    }
  });

  it('silhouette baseline centres so the stack is symmetric around 0', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    for (let i = 0; i < r.sampleCount; i++) {
      const bottom = r.layers[0]!.points[i]!.baseValue;
      const top = r.layers[r.layers.length - 1]!.points[i]!.topValue;
      expect(bottom + top).toBeCloseTo(0);
    }
  });

  it('non-positive values clamp so a series never inverts', () => {
    const series: ChartStreamgraphSeries[] = [
      { id: 'a', label: 'A', data: [Number.NaN, -3, 5] },
      { id: 'b', label: 'B', data: [1, 1, 1] },
    ];
    const r = computeStreamgraphLayers({
      series,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    for (const layer of r.layers) {
      for (const p of layer.points) {
        expect(p.rawValue).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('areaPath ends with Z (closed path)', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'cardinal',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    for (const layer of r.layers) {
      expect(layer.areaPath.endsWith('Z')).toBe(true);
    }
  });

  it('non-positive inner dimensions -> empty', () => {
    const r = computeStreamgraphLayers({
      series: SAMPLE,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW: 0,
      innerH,
      padX,
      padY,
    });
    expect(r.layers).toEqual([]);
  });

  it('empty series -> empty', () => {
    const r = computeStreamgraphLayers({
      series: [],
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(r.layers).toEqual([]);
    expect(r.sampleCount).toBe(0);
  });

  it('per-series color override beats palette', () => {
    const series: ChartStreamgraphSeries[] = [
      { id: 'a', label: 'A', data: [1, 1], color: '#abcdef' },
    ];
    const r = computeStreamgraphLayers({
      series,
      baseline: 'silhouette',
      curve: 'linear',
      tension: 0.5,
      hidden: new Set(),
      innerW,
      innerH,
      padX,
      padY,
    });
    expect(r.layers[0]!.color).toBe('#abcdef');
  });
});

describe('describeStreamgraphChart', () => {
  it('returns "No data" for empty', () => {
    expect(describeStreamgraphChart([], new Set(), 'silhouette')).toBe(
      'No data'
    );
  });
  it('returns "No data" when every series is hidden', () => {
    expect(
      describeStreamgraphChart(
        SAMPLE,
        new Set(['a', 'b', 'c']),
        'silhouette'
      )
    ).toBe('No data');
  });
  it('includes baseline + counts + total + peak', () => {
    const d = describeStreamgraphChart(SAMPLE, new Set(), 'wiggle');
    expect(d).toContain('Streamgraph (wiggle)');
    expect(d).toContain('3 series');
    expect(d).toContain('5 samples');
    expect(d).toContain('Total');
    expect(d).toContain('peak total');
  });
});

describe('<ChartStreamgraph> component', () => {
  it('renders region + custom aria-label', () => {
    const { getByRole } = render(
      <ChartStreamgraph series={SAMPLE} ariaLabel="Test streamgraph" />
    );
    expect(getByRole('region', { name: 'Test streamgraph' })).toBeTruthy();
  });

  it('renders one layer per series', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-streamgraph-layer"]'
      ).length
    ).toBe(3);
  });

  it('layer data attrs carry id / index / color', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    const layer = container.querySelector(
      '[data-series-id="a"]'
    ) as HTMLElement;
    expect(layer.getAttribute('data-series-index')).toBe('0');
    expect(layer.getAttribute('data-series-color')).toBeTruthy();
  });

  it('area path is role=graphics-symbol + tabIndex=0 + aria-label', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    const area = container.querySelector(
      '[data-section="chart-streamgraph-area"]'
    ) as SVGPathElement;
    expect(area.getAttribute('role')).toBe('graphics-symbol');
    expect(area.getAttribute('tabindex')).toBe('0');
    expect(area.getAttribute('aria-label')).toContain('stream layer');
  });

  it('root mirrors counts + baseline + curve + animate', () => {
    const { container } = render(
      <ChartStreamgraph
        series={SAMPLE}
        baseline="wiggle"
        curve="catmullRom"
      />
    );
    const root = container.querySelector('[data-section="chart-streamgraph"]');
    expect(root?.getAttribute('data-series-count')).toBe('3');
    expect(root?.getAttribute('data-visible-count')).toBe('3');
    expect(root?.getAttribute('data-sample-count')).toBe('5');
    expect(root?.getAttribute('data-baseline')).toBe('wiggle');
    expect(root?.getAttribute('data-curve')).toBe('catmullRom');
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('legend renders one button per series', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-streamgraph-legend-button"]'
      ).length
    ).toBe(3);
  });

  it('legend toggle fires onSeriesToggle and decrements visible count', () => {
    const onSeriesToggle = vi.fn();
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} onSeriesToggle={onSeriesToggle} />
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-streamgraph-legend-button"]'
    );
    fireEvent.click(buttons[1]! as HTMLElement);
    expect(onSeriesToggle).toHaveBeenCalledTimes(1);
    expect(onSeriesToggle.mock.calls[0]![0].series.id).toBe('b');
    expect(onSeriesToggle.mock.calls[0]![0].hidden).toBe(true);
    const root = container.querySelector('[data-section="chart-streamgraph"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('legend respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} hiddenSeries={['c']} />
    );
    const root = container.querySelector('[data-section="chart-streamgraph"]');
    expect(root?.getAttribute('data-visible-count')).toBe('2');
  });

  it('showLegend=false suppresses the legend', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} showLegend={false} />
    );
    expect(
      container.querySelector('[data-section="chart-streamgraph-legend"]')
    ).toBeNull();
  });

  it('legend placement = right reverses layout', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} legendPlacement="right" />
    );
    const legend = container.querySelector(
      '[data-section="chart-streamgraph-legend"]'
    );
    expect(legend?.getAttribute('data-placement')).toBe('right');
  });

  it('x axis renders by default; suppression', () => {
    const a = render(<ChartStreamgraph series={SAMPLE} />);
    expect(
      a.container.querySelector('[data-section="chart-streamgraph-x-axis"]')
    ).not.toBeNull();
    cleanup();
    const b = render(<ChartStreamgraph series={SAMPLE} showXAxis={false} />);
    expect(
      b.container.querySelector('[data-section="chart-streamgraph-x-axis"]')
    ).toBeNull();
  });

  it('x labels render by default with auto-thinning above 8 samples', () => {
    const long: ChartStreamgraphSeries[] = [
      {
        id: 'a',
        label: 'A',
        data: Array.from({ length: 20 }, () => 1),
      },
    ];
    const { container } = render(<ChartStreamgraph series={long} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-streamgraph-x-label"]'
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(20);
  });

  it('showXLabels=false suppresses the labels', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} showXLabels={false} />
    );
    expect(
      container.querySelector('[data-section="chart-streamgraph-x-labels"]')
    ).toBeNull();
  });

  it('xLabels prop drives labels at every visible sample', () => {
    const xs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} xLabels={xs} />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-streamgraph-x-label"]'
    );
    expect(labels.length).toBe(5);
    expect(labels[0]!.textContent).toBe('Mon');
    expect(labels[4]!.textContent).toBe('Fri');
  });

  it('formatXLabel rewrites the x-axis labels', () => {
    const { container } = render(
      <ChartStreamgraph
        series={SAMPLE}
        xLabels={[0, 1, 2, 3, 4]}
        formatXLabel={(label, i) => `${i}:${label}`}
      />
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-streamgraph-x-label"]'
    );
    expect(labels[0]!.textContent).toBe('0:0');
    expect(labels[4]!.textContent).toBe('4:4');
  });

  it('tooltip opens on layer hover with label + total + sample count', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    const layer = container.querySelector(
      '[data-series-id="b"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(layer);
    expect(
      container.querySelector('[data-section="chart-streamgraph-tooltip"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-streamgraph-tooltip-label"]'
      )?.textContent
    ).toBe('Beta');
    expect(
      container.querySelector(
        '[data-section="chart-streamgraph-tooltip-total"]'
      )?.textContent
    ).toContain('15');
    expect(
      container.querySelector(
        '[data-section="chart-streamgraph-tooltip-samples"]'
      )?.textContent
    ).toContain('5');
  });

  it('tooltip hides on mouseleave', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    const layer = container.querySelector(
      '[data-series-id="a"]'
    ) as HTMLElement;
    fireEvent.mouseEnter(layer);
    expect(
      container.querySelector('[data-section="chart-streamgraph-tooltip"]')
    ).not.toBeNull();
    fireEvent.mouseLeave(layer);
    expect(
      container.querySelector('[data-section="chart-streamgraph-tooltip"]')
    ).toBeNull();
  });

  it('showTooltip=false suppresses tooltip', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} showTooltip={false} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector('[data-section="chart-streamgraph-tooltip"]')
    ).toBeNull();
  });

  it('formatValue reaches the tooltip total', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} formatValue={(v) => `${v}u`} />
    );
    fireEvent.mouseEnter(
      container.querySelector('[data-series-id="a"]')! as HTMLElement
    );
    expect(
      container.querySelector(
        '[data-section="chart-streamgraph-tooltip-total"]'
      )?.textContent
    ).toContain('u');
  });

  it('onLayerClick fires with series + layer payload', () => {
    const onLayerClick = vi.fn();
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} onLayerClick={onLayerClick} />
    );
    fireEvent.click(
      container.querySelector('[data-series-id="c"]')! as HTMLElement
    );
    expect(onLayerClick).toHaveBeenCalledTimes(1);
    expect(onLayerClick.mock.calls[0]![0].series.id).toBe('c');
    expect(onLayerClick.mock.calls[0]![0].layer.id).toBe('c');
  });

  it('data-hovered mirrors hover state', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    const layer = container.querySelector(
      '[data-series-id="a"]'
    ) as HTMLElement;
    expect(layer.getAttribute('data-hovered')).toBe('false');
    fireEvent.mouseEnter(layer);
    expect(layer.getAttribute('data-hovered')).toBe('true');
    fireEvent.mouseLeave(layer);
    expect(layer.getAttribute('data-hovered')).toBe('false');
  });

  it('auto ARIA description renders by default', () => {
    const { container } = render(<ChartStreamgraph series={SAMPLE} />);
    expect(
      container.querySelector('[data-section="chart-streamgraph-aria-desc"]')
        ?.textContent
    ).toContain('3 series');
  });

  it('ariaDescription override beats auto', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} ariaDescription="Override" />
    );
    expect(
      container.querySelector('[data-section="chart-streamgraph-aria-desc"]')
        ?.textContent
    ).toBe('Override');
  });

  it('SVG mirrors width / height / viewBox', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} width={400} height={200} />
    );
    const svg = container.querySelector(
      '[data-section="chart-streamgraph-svg"]'
    ) as SVGElement;
    expect(svg.getAttribute('width')).toBe('400');
    expect(svg.getAttribute('height')).toBe('200');
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
  });

  it('empty series list renders without crashing', () => {
    const { container } = render(<ChartStreamgraph series={[]} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-streamgraph-layer"]'
      ).length
    ).toBe(0);
    expect(
      container.querySelector('[data-section="chart-streamgraph-aria-desc"]')!
        .textContent
    ).toBe('No data');
  });

  it('forwards ref to root', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartStreamgraph series={SAMPLE} ref={ref} />);
    expect(ref.current?.dataset.section).toBe('chart-streamgraph');
  });

  it('has stable displayName', () => {
    expect(ChartStreamgraph.displayName).toBe('ChartStreamgraph');
  });

  it('data-animate mirrors prop', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} animate={false} />
    );
    expect(
      container.querySelector('[data-section="chart-streamgraph"]')!
        .getAttribute('data-animate')
    ).toBe('false');
  });

  it('expand baseline renders without crashing', () => {
    const { container } = render(
      <ChartStreamgraph series={SAMPLE} baseline="expand" />
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-streamgraph-layer"]'
      ).length
    ).toBe(3);
    const root = container.querySelector('[data-section="chart-streamgraph"]');
    expect(root?.getAttribute('data-baseline')).toBe('expand');
  });
});
