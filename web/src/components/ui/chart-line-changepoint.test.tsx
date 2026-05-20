import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineChangepoint,
  DEFAULT_CHART_LINE_CHANGEPOINT_HEIGHT,
  DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_COLOR,
  DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT,
  DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE,
  DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS,
  DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD,
  DEFAULT_CHART_LINE_CHANGEPOINT_WIDTH,
  computeLineChangepointLayout,
  computeLineChangepointScores,
  describeLineChangepointChart,
  detectLineChangepoints,
  getLineChangepointDefaultColor,
  getLineChangepointFinitePoints,
  getLineChangepointSegmentColor,
  normaliseLineChangepointMinSegment,
  normaliseLineChangepointSuppressionWindow,
  normaliseLineChangepointThreshold,
  type ChartLineChangepointSeries,
} from './chart-line-changepoint';

// Variance shift: first 30 samples low-variance, last 30 high-variance.
// Use a fixed pseudo-random seed by alternating sign so the test is
// deterministic without a Math.random call.
const lowNoise = Array.from({ length: 30 }, (_, n) => ({
  x: n,
  y: 5 + (n % 2 === 0 ? 0.05 : -0.05),
}));
const highNoise = Array.from({ length: 30 }, (_, n) => ({
  x: 30 + n,
  y: 5 + (n % 2 === 0 ? 1.5 : -1.5),
}));
const varianceShiftData = [...lowNoise, ...highNoise];

const varianceShiftSeries: ChartLineChangepointSeries = {
  id: 'vs',
  label: 'VarianceShift',
  data: varianceShiftData,
};

// Flat signal -- no changepoints expected.
const flatData = Array.from({ length: 40 }, (_, n) => ({
  x: n,
  y: 7,
}));
const flatSeries: ChartLineChangepointSeries = {
  id: 'f',
  label: 'Flat',
  data: flatData,
};

describe('chart-line-changepoint: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_HEIGHT).toBeGreaterThan(0);
  });

  it('default min segment >= 2', () => {
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT).toBeGreaterThanOrEqual(2);
  });

  it('threshold positive', () => {
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD).toBeGreaterThan(0);
  });

  it('marker color set', () => {
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_MARKER_COLOR).toMatch(/#/);
  });

  it('10-color palette + non-empty segment palette', () => {
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE.length).toBe(10);
    expect(DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS.length).toBeGreaterThan(
      0,
    );
  });
});

describe('getLineChangepointDefaultColor / getLineChangepointSegmentColor', () => {
  it('cycles series palette', () => {
    expect(getLineChangepointDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE[0],
    );
    expect(getLineChangepointDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineChangepointDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_PALETTE[0],
    );
    expect(getLineChangepointSegmentColor(-3)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS[0],
    );
  });

  it('segment color cycles the segment palette', () => {
    expect(getLineChangepointSegmentColor(0)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS[0],
    );
    expect(
      getLineChangepointSegmentColor(
        DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS.length,
      ),
    ).toBe(DEFAULT_CHART_LINE_CHANGEPOINT_SEGMENT_COLORS[0]);
  });
});

describe('getLineChangepointFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineChangepointFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null', () => {
    expect(getLineChangepointFinitePoints(null)).toEqual([]);
  });
});

describe('normaliseLineChangepointMinSegment', () => {
  it('default for non-finite', () => {
    expect(normaliseLineChangepointMinSegment(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_MIN_SEGMENT,
    );
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineChangepointMinSegment(1)).toBe(2);
    expect(normaliseLineChangepointMinSegment(0)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineChangepointMinSegment(7.9)).toBe(7);
  });
});

describe('normaliseLineChangepointThreshold', () => {
  it('default for non-finite / negative', () => {
    expect(normaliseLineChangepointThreshold(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD,
    );
    expect(normaliseLineChangepointThreshold(-1)).toBe(
      DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD,
    );
  });

  it('identity for valid', () => {
    expect(normaliseLineChangepointThreshold(0.75)).toBe(0.75);
  });

  it('allows zero', () => {
    expect(normaliseLineChangepointThreshold(0)).toBe(0);
  });
});

describe('normaliseLineChangepointSuppressionWindow', () => {
  it('default for non-finite', () => {
    expect(normaliseLineChangepointSuppressionWindow(Number.NaN)).toBeGreaterThan(
      0,
    );
  });

  it('clamps to >= 1', () => {
    expect(normaliseLineChangepointSuppressionWindow(0)).toBe(1);
  });
});

describe('computeLineChangepointScores', () => {
  it('returns [] for non-array', () => {
    expect(computeLineChangepointScores(null)).toEqual([]);
  });

  it('all-null when input shorter than 2x minSegment', () => {
    const scores = computeLineChangepointScores([1, 2, 3], { minSegment: 5 });
    expect(scores.every((s) => s === null)).toBe(true);
  });

  it('null at edges, finite values in interior', () => {
    const scores = computeLineChangepointScores(
      varianceShiftData.map((p) => p.y),
      { minSegment: 5 },
    );
    expect(scores[0]).toBeNull();
    expect(scores[scores.length - 1]).toBeNull();
    expect(scores[30]).not.toBeNull();
  });

  it('high variance shift produces high score near the boundary', () => {
    const scores = computeLineChangepointScores(
      varianceShiftData.map((p) => p.y),
      { minSegment: 5 },
    );
    // Score at the true changepoint (index 30) should be large.
    expect((scores[30] ?? 0)).toBeGreaterThan(1);
  });

  it('flat constant input produces zero scores everywhere', () => {
    const scores = computeLineChangepointScores(
      Array.from({ length: 40 }, () => 7),
      { minSegment: 5 },
    );
    for (const s of scores) {
      if (s !== null) expect(s).toBeCloseTo(0, 5);
    }
  });
});

describe('detectLineChangepoints', () => {
  it('returns ok=false for empty', () => {
    expect(detectLineChangepoints([]).ok).toBe(false);
    expect(detectLineChangepoints(null).ok).toBe(false);
  });

  it('detects a variance shift around the true boundary', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      minSegment: 5,
      threshold: 1.0,
      suppressionWindow: 3,
    });
    expect(r.ok).toBe(true);
    expect(r.detections.length).toBeGreaterThanOrEqual(1);
    // Highest-score detection should land within a few samples of the true
    // boundary index 30.
    const top = [...r.detections].sort((a, b) => b.score - a.score)[0]!;
    expect(Math.abs(top.index - 30)).toBeLessThanOrEqual(3);
  });

  it('produces no detections on a flat signal at default threshold', () => {
    const r = detectLineChangepoints(flatData, {
      threshold: DEFAULT_CHART_LINE_CHANGEPOINT_THRESHOLD,
    });
    expect(r.detections.length).toBe(0);
  });

  it('higher threshold suppresses weak detections', () => {
    const high = detectLineChangepoints(varianceShiftData, {
      threshold: 10,
    });
    expect(high.detections.length).toBe(0);
  });

  it('lower threshold allows more detections', () => {
    const low = detectLineChangepoints(varianceShiftData, {
      threshold: 0.1,
      suppressionWindow: 1,
    });
    expect(low.detections.length).toBeGreaterThanOrEqual(1);
  });

  it('detections are sorted ascending by index', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      threshold: 0.5,
      suppressionWindow: 2,
    });
    for (let i = 1; i < r.detections.length; i += 1) {
      expect(r.detections[i]!.index).toBeGreaterThan(r.detections[i - 1]!.index);
    }
  });

  it('non-max suppression spaces detections by at least suppressionWindow', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      threshold: 0.3,
      suppressionWindow: 5,
    });
    for (let i = 1; i < r.detections.length; i += 1) {
      expect(
        Math.abs(r.detections[i]!.index - r.detections[i - 1]!.index),
      ).toBeGreaterThan(5);
    }
  });

  it('segments cover all samples (start to end)', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      threshold: 0.5,
    });
    let total = 0;
    for (const seg of r.segments) total += seg.count;
    expect(total).toBe(r.samples.length);
  });

  it('per-sample segmentIndex matches segment count', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      threshold: 0.5,
    });
    for (const sample of r.samples) {
      expect(sample.segmentIndex).toBeGreaterThanOrEqual(0);
      expect(sample.segmentIndex).toBeLessThan(r.segments.length);
    }
  });

  it('mean shift across the boundary is sizeable for the variance-shift fixture', () => {
    const r = detectLineChangepoints(varianceShiftData, {
      minSegment: 5,
      threshold: 0.5,
    });
    expect(r.detections.length).toBeGreaterThan(0);
    // The strongest detection should split the series into two regions
    // with sizeable variance difference.
    const top = [...r.detections].sort((a, b) => b.score - a.score)[0]!;
    expect(top.rightVariance / top.leftVariance).toBeGreaterThan(10);
  });

  it('sorts ascending before scanning', () => {
    const shuffled = [...varianceShiftData].sort(() => -1);
    const r = detectLineChangepoints(shuffled, {
      minSegment: 5,
      threshold: 1.0,
    });
    expect(r.samples[0]!.x).toBe(0);
    expect(r.samples[r.samples.length - 1]!.x).toBe(59);
  });

  it('drops non-finite before scanning', () => {
    const withNan = [...varianceShiftData];
    withNan.splice(15, 1, { x: 15, y: Number.NaN });
    const r = detectLineChangepoints(withNan, {
      minSegment: 5,
      threshold: 1.0,
    });
    expect(r.samples.length).toBe(59);
  });
});

describe('computeLineChangepointLayout', () => {
  it('returns ok=false for empty series', () => {
    const layout = computeLineChangepointLayout({
      series: [],
      width: 500,
      height: 320,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=false for degenerate canvas', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 30,
      height: 30,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds path + detection markers + segments', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 1.0,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.path.length).toBeGreaterThan(0);
    expect(s.detections.length).toBeGreaterThan(0);
    expect(s.segments.length).toBe(s.detections.length + 1);
  });

  it('markers projected within panel bounds', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 1.0,
    });
    for (const d of layout.series[0]!.detections) {
      expect(d.px).toBeGreaterThanOrEqual(layout.panel.x);
      expect(d.px).toBeLessThanOrEqual(layout.panel.x + layout.panel.width);
    }
  });

  it('drops hidden series', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries, flatSeries],
      hiddenSeries: ['f'],
      width: 600,
      height: 320,
      padding: 40,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('vs');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 600,
      height: 320,
      padding: 40,
      yMin: -10,
      yMax: 20,
    });
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(20);
  });

  it('per-series threshold override beats chart-level', () => {
    const layout = computeLineChangepointLayout({
      series: [{ ...varianceShiftSeries, threshold: 99 }],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 0.1,
    });
    expect(layout.series[0]?.threshold).toBe(99);
    expect(layout.series[0]?.detections.length).toBe(0);
  });

  it('totalDetections sums per-series detections', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries, flatSeries],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 1.0,
    });
    let sum = 0;
    for (const s of layout.series) sum += s.detections.length;
    expect(layout.totalDetections).toBe(sum);
  });

  it('per-point segment color matches segment palette index', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 1.0,
    });
    const s = layout.series[0]!;
    for (const p of s.points) {
      expect(p.segmentColor).toBe(
        getLineChangepointSegmentColor(p.segmentIndex),
      );
    }
  });

  it('segments expose px0 < px1 (sorted ascending by x)', () => {
    const layout = computeLineChangepointLayout({
      series: [varianceShiftSeries],
      width: 600,
      height: 320,
      padding: 40,
      threshold: 1.0,
    });
    for (const seg of layout.series[0]!.segments) {
      expect(seg.px1).toBeGreaterThanOrEqual(seg.px0);
    }
  });
});

describe('describeLineChangepointChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineChangepointChart([])).toBe('No data');
    expect(describeLineChangepointChart(null)).toBe('No data');
  });

  it('summarises detection count + threshold per series', () => {
    const desc = describeLineChangepointChart([varianceShiftSeries], {
      threshold: 1.0,
    });
    expect(desc).toMatch(/changepoint/);
    expect(desc).toMatch(/threshold/);
  });
});

describe('<ChartLineChangepoint> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineChangepoint series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-changepoint"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders signal path with kind=signal', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} threshold={1.0} />,
    );
    const path = document.querySelector(
      '[data-section="chart-line-changepoint-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('signal');
  });

  it('renders detection markers', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} threshold={1.0} />,
    );
    const markers = document.querySelectorAll(
      '[data-section="chart-line-changepoint-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('markers are dashed vertical lines', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} threshold={1.0} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-changepoint-marker"]',
    );
    expect(marker?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(marker?.getAttribute('x1')).toBe(marker?.getAttribute('x2'));
  });

  it('hides markers via showMarkers=false', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showMarkers={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-changepoint-marker"]',
      ).length,
    ).toBe(0);
  });

  it('renders segment shading rects by default', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} threshold={1.0} />,
    );
    const segs = document.querySelectorAll(
      '[data-section="chart-line-changepoint-segment"]',
    );
    expect(segs.length).toBeGreaterThan(0);
  });

  it('hides segment shading via showSegmentShading=false', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showSegmentShading={false}
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-changepoint-segment"]',
      ).length,
    ).toBe(0);
  });

  it('shows segment mean lines via showSegmentMeans=true', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showSegmentMeans
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-changepoint-segment-mean"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders dots via showDots=true', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showDots
      />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-changepoint-dot"]',
      ).length,
    ).toBe(varianceShiftData.length);
  });

  it('hides dots by default (showDots=false default)', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} threshold={1.0} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-changepoint-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders detection badge with count + threshold', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
      />,
    );
    const badge = document.querySelector(
      '[data-section="chart-line-changepoint-badge"]',
    );
    expect(Number(badge?.getAttribute('data-detection-count'))).toBeGreaterThan(
      0,
    );
    expect(Number(badge?.getAttribute('data-threshold'))).toBe(1);
  });

  it('hides badge via showCountBadge=false', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showCountBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-changepoint-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(
      <ChartLineChangepoint series={[varianceShiftSeries]} ariaLabel="cp" />,
    );
    const region = screen.getByRole('region', { name: 'cp' });
    const img = within(region).getByRole('img', { name: 'cp' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        minSegment={5}
        suppressionWindow={3}
      />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-changepoint"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('60');
    expect(Number(root?.getAttribute('data-total-detections'))).toBeGreaterThan(
      0,
    );
    expect(root?.getAttribute('data-min-segment')).toBe('5');
    expect(root?.getAttribute('data-threshold')).toBe('1');
    expect(root?.getAttribute('data-suppression-window')).toBe('3');
  });

  it('tooltip on marker hover shows score + mean shift + variance', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-changepoint-marker"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(marker);
    const score = document.querySelector(
      '[data-section="chart-line-changepoint-tooltip-score"]',
    );
    const meanShift = document.querySelector(
      '[data-section="chart-line-changepoint-tooltip-mean-shift"]',
    );
    const variance = document.querySelector(
      '[data-section="chart-line-changepoint-tooltip-variance"]',
    );
    expect(score?.textContent).toMatch(/score:/);
    expect(meanShift?.textContent).toMatch(/mean shift:/);
    expect(variance?.textContent).toMatch(/var:/);
  });

  it('tooltip on point hover shows segment info', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showDots
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-changepoint-dot"][data-point-index="45"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const seg = document.querySelector(
      '[data-section="chart-line-changepoint-tooltip-segment"]',
    );
    expect(seg?.textContent).toMatch(/segment/);
  });

  it('hides tooltip on leave', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-changepoint-marker"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(marker);
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-changepoint-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showTooltip={false}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-changepoint-marker"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector(
        '[data-section="chart-line-changepoint-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onMarkerClick with detection payload', () => {
    const onMarkerClick = vi.fn();
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        onMarkerClick={onMarkerClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-changepoint-marker"]',
    ) as HTMLElement;
    fireEvent.click(marker);
    expect(onMarkerClick).toHaveBeenCalledTimes(1);
    expect(
      onMarkerClick.mock.calls[0]?.[0]?.detection?.index,
    ).toBeGreaterThanOrEqual(0);
  });

  it('fires onPointClick with point payload', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
        showDots
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-changepoint-dot"][data-point-index="10"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(10);
  });

  it('legend shows detection count + segment count per series', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        threshold={1.0}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-changepoint-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/cp/);
    expect(stats?.textContent).toMatch(/seg/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-changepoint-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: varianceShiftSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-changepoint-legend"]',
      ),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineChangepoint series={[varianceShiftSeries]} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-changepoint"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineChangepoint
        series={[varianceShiftSeries]}
        animate={false}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-changepoint"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineChangepoint ref={ref} series={[varianceShiftSeries]} />,
    );
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineChangepoint.displayName).toBe('ChartLineChangepoint');
  });
});
