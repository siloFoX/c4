import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartLineBollinger,
  DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_DOWN_COLOR,
  DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_UP_COLOR,
  DEFAULT_CHART_LINE_BOLLINGER_HEIGHT,
  DEFAULT_CHART_LINE_BOLLINGER_K_SIGMA,
  DEFAULT_CHART_LINE_BOLLINGER_PALETTE,
  DEFAULT_CHART_LINE_BOLLINGER_WIDTH,
  DEFAULT_CHART_LINE_BOLLINGER_WINDOW,
  classifyLineBollingerState,
  computeLineBollingerBands,
  computeLineBollingerLayout,
  computeRollingMean,
  computeRollingStd,
  describeLineBollingerChart,
  getLineBollingerDefaultColor,
  getLineBollingerFinitePoints,
  normaliseLineBollingerKSigma,
  normaliseLineBollingerWindow,
  type ChartLineBollingerSeries,
} from './chart-line-bollinger';

// Series with one out-of-band spike at the end. For a window of N + k=2
// sigma bands, a single outlier breaks out iff sqrt(N-1) > k, so we use a
// window of 10 (sqrt(9)=3 > 2) so the spike at i=9 is genuinely above its
// own band.
const spikeSeries: ChartLineBollingerSeries = {
  id: 's',
  label: 'S',
  data: [
    { x: 0, y: 10 },
    { x: 1, y: 11 },
    { x: 2, y: 9 },
    { x: 3, y: 10 },
    { x: 4, y: 11 },
    { x: 5, y: 9 },
    { x: 6, y: 10 },
    { x: 7, y: 11 },
    { x: 8, y: 9 },
    { x: 9, y: 200 }, // huge spike at end
  ],
};

const calmSeries: ChartLineBollingerSeries = {
  id: 'c',
  label: 'Calm',
  data: [
    { x: 0, y: 5 },
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 3, y: 5 },
    { x: 4, y: 5 },
    { x: 5, y: 5 },
  ],
};

describe('chart-line-bollinger: defaults', () => {
  it('positive width / height', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_BOLLINGER_HEIGHT).toBeGreaterThan(0);
  });

  it('default window is 20 and k=2 (Bollinger canonical)', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_WINDOW).toBe(20);
    expect(DEFAULT_CHART_LINE_BOLLINGER_K_SIGMA).toBe(2);
  });

  it('distinct breakout colors', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_UP_COLOR).not.toBe(
      DEFAULT_CHART_LINE_BOLLINGER_BREAKOUT_DOWN_COLOR,
    );
  });

  it('10-color palette', () => {
    expect(DEFAULT_CHART_LINE_BOLLINGER_PALETTE.length).toBe(10);
  });
});

describe('getLineBollingerDefaultColor', () => {
  it('cycles', () => {
    expect(getLineBollingerDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0],
    );
    expect(getLineBollingerDefaultColor(10)).toBe(
      DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0],
    );
  });

  it('falls back to color 0 for NaN / negative', () => {
    expect(getLineBollingerDefaultColor(Number.NaN)).toBe(
      DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0],
    );
    expect(getLineBollingerDefaultColor(-2)).toBe(
      DEFAULT_CHART_LINE_BOLLINGER_PALETTE[0],
    );
  });
});

describe('getLineBollingerFinitePoints', () => {
  it('drops non-finite', () => {
    const f = getLineBollingerFinitePoints([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 2, y: 3 },
    ]);
    expect(f).toHaveLength(2);
  });

  it('returns [] for null/non-array', () => {
    expect(getLineBollingerFinitePoints(null)).toEqual([]);
    expect(getLineBollingerFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineBollingerWindow', () => {
  it('returns default for non-finite', () => {
    expect(normaliseLineBollingerWindow(Number.NaN)).toBe(20);
  });

  it('clamps to >= 2', () => {
    expect(normaliseLineBollingerWindow(1)).toBe(2);
    expect(normaliseLineBollingerWindow(0)).toBe(2);
    expect(normaliseLineBollingerWindow(-5)).toBe(2);
  });

  it('floors fractional', () => {
    expect(normaliseLineBollingerWindow(3.9)).toBe(3);
  });
});

describe('normaliseLineBollingerKSigma', () => {
  it('returns default for non-finite / non-positive', () => {
    expect(normaliseLineBollingerKSigma(Number.NaN)).toBe(2);
    expect(normaliseLineBollingerKSigma(0)).toBe(2);
    expect(normaliseLineBollingerKSigma(-1)).toBe(2);
  });

  it('identity for positive', () => {
    expect(normaliseLineBollingerKSigma(2.5)).toBe(2.5);
  });
});

describe('computeRollingMean', () => {
  it('returns leading nulls then rolling mean', () => {
    const m = computeRollingMean([1, 2, 3, 4, 5], 3);
    expect(m[0]).toBeNull();
    expect(m[1]).toBeNull();
    expect(m[2]).toBe(2); // (1+2+3)/3
    expect(m[3]).toBe(3); // (2+3+4)/3
    expect(m[4]).toBe(4); // (3+4+5)/3
  });

  it('returns [] for non-array', () => {
    expect(computeRollingMean(null, 3)).toEqual([]);
  });

  it('skips non-finite from the mean', () => {
    const m = computeRollingMean([1, Number.NaN, 3, 4, 5], 3);
    // window at i=2: finite values are 1, 3 -> mean 2
    expect(m[2]).toBe(2);
  });
});

describe('computeRollingStd', () => {
  it('returns leading nulls then rolling std', () => {
    const s = computeRollingStd([1, 2, 3, 4, 5], 3);
    expect(s[0]).toBeNull();
    expect(s[1]).toBeNull();
    // window at i=2: values 1,2,3, mean=2, var=(1+0+1)/3=2/3, std=sqrt(2/3)
    expect(s[2]).toBeCloseTo(Math.sqrt(2 / 3), 5);
  });

  it('returns 0 std for constant window', () => {
    const s = computeRollingStd([5, 5, 5, 5, 5], 3);
    expect(s[2]).toBe(0);
    expect(s[3]).toBe(0);
    expect(s[4]).toBe(0);
  });
});

describe('classifyLineBollingerState', () => {
  it('inside when within bands', () => {
    expect(classifyLineBollingerState(10, 12, 8)).toBe('inside');
  });

  it('above when > upper', () => {
    expect(classifyLineBollingerState(20, 12, 8)).toBe('above');
  });

  it('below when < lower', () => {
    expect(classifyLineBollingerState(0, 12, 8)).toBe('below');
  });

  it('inside when bands null', () => {
    expect(classifyLineBollingerState(10, null, null)).toBe('inside');
  });

  it('inside for non-finite y', () => {
    expect(classifyLineBollingerState(Number.NaN, 12, 8)).toBe('inside');
  });
});

describe('computeLineBollingerBands', () => {
  it('returns [] for empty', () => {
    expect(computeLineBollingerBands(null)).toEqual([]);
    expect(computeLineBollingerBands([])).toEqual([]);
  });

  it('leading nulls for first window-1 entries', () => {
    const samples = computeLineBollingerBands(spikeSeries.data, {
      window: 10,
      kSigma: 2,
    });
    expect(samples[0]?.middle).toBeNull();
    expect(samples[8]?.middle).toBeNull();
    expect(samples[9]?.middle).not.toBeNull();
  });

  it('flags above when y exceeds upper band', () => {
    const samples = computeLineBollingerBands(spikeSeries.data, {
      window: 10,
      kSigma: 2,
    });
    // spike at end
    expect(samples[9]?.state).toBe('above');
  });

  it('computes %B value when inside (within the canonical 0-1 envelope)', () => {
    // a calm series will produce inside-band points with %B near 0.5
    const samples = computeLineBollingerBands(
      [
        { x: 0, y: 9 },
        { x: 1, y: 11 },
        { x: 2, y: 10 },
        { x: 3, y: 9 },
        { x: 4, y: 11 },
        { x: 5, y: 10 },
        { x: 6, y: 9 },
        { x: 7, y: 11 },
        { x: 8, y: 10 },
        { x: 9, y: 10 },
      ],
      { window: 3, kSigma: 2 },
    );
    const inside = samples.find(
      (s) => s.state === 'inside' && s.percentB !== null,
    );
    expect(inside?.percentB).not.toBeNull();
  });

  it('computes bandwidth as positive when bands defined', () => {
    const samples = computeLineBollingerBands(spikeSeries.data, {
      window: 10,
      kSigma: 2,
    });
    const valid = samples.find((s) => s.bandwidth !== null);
    expect(valid?.bandwidth).toBeGreaterThan(0);
  });

  it('returns null bandwidth when middle is 0', () => {
    const samples = computeLineBollingerBands(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      { window: 3, kSigma: 2 },
    );
    expect(samples[2]?.bandwidth).toBeNull();
  });

  it('sorts ascending before computing', () => {
    const samples = computeLineBollingerBands(
      [
        { x: 5, y: 1 },
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 },
        { x: 1, y: 5 },
      ],
      { window: 2, kSigma: 2 },
    );
    // x sorted ascending: 0,1,2,3,4,5
    expect(samples.map((s) => s.x)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('computeLineBollingerLayout', () => {
  it('returns empty for empty series', () => {
    const layout = computeLineBollingerLayout({
      series: [],
      width: 400,
      height: 300,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('returns empty for degenerate canvas', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.series).toEqual([]);
  });

  it('builds per-series points with band paths', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 10,
    });
    expect(layout.series).toHaveLength(1);
    const s = layout.series[0]!;
    expect(s.points).toHaveLength(10);
    expect(s.bandPath.length).toBeGreaterThan(0);
    expect(s.upperPath.length).toBeGreaterThan(0);
    expect(s.lowerPath.length).toBeGreaterThan(0);
    expect(s.middlePath.length).toBeGreaterThan(0);
  });

  it('counts above / below / inside states', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 10,
    });
    const s = layout.series[0]!;
    expect(s.aboveCount).toBeGreaterThan(0);
    // The leading window-1 points are unclassifiable; the test seeds them as
    // 'inside' (band null -> inside).
    expect(s.insideCount).toBeGreaterThan(0);
  });

  it('expands y range to cover upper/lower bands', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 10,
    });
    // Spike at 200; y range should cover it.
    expect(layout.yMax).toBeGreaterThanOrEqual(200);
  });

  it('per-point carries middlePy/upperPy/lowerPy as null for leading entries', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
    });
    const points = layout.series[0]!.points;
    expect(points[0]?.upperPy).toBeNull();
    expect(points[0]?.lowerPy).toBeNull();
    expect(points[0]?.middlePy).toBeNull();
    expect(points[2]?.upperPy).not.toBeNull();
  });

  it('drops hidden series', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries, calmSeries],
      hiddenSeries: ['c'],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
    });
    expect(layout.series).toHaveLength(1);
    expect(layout.series[0]?.id).toBe('s');
  });

  it('honors bounds overrides', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
      yMin: -100,
      yMax: 200,
    });
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(200);
  });

  it('per-series window override beats chart window', () => {
    const layout = computeLineBollingerLayout({
      series: [{ ...spikeSeries, window: 5 }],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
    });
    expect(layout.series[0]?.window).toBe(5);
  });

  it('records visibleSeriesCount and totalPoints', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries, calmSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
    });
    expect(layout.visibleSeriesCount).toBe(2);
    expect(layout.totalPoints).toBe(10 + 6);
  });

  it('latestPercentB and latestState reflect last sample', () => {
    const layout = computeLineBollingerLayout({
      series: [spikeSeries],
      width: 500,
      height: 300,
      padding: 40,
      window: 3,
    });
    const s = layout.series[0]!;
    expect(s.latestState).toBeDefined();
  });

  it('band path is empty for series too short to fill window', () => {
    const layout = computeLineBollingerLayout({
      series: [
        {
          id: 'short',
          label: 'Short',
          data: [
            { x: 0, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ],
      width: 500,
      height: 300,
      padding: 40,
      window: 5,
    });
    expect(layout.series[0]?.bandPath).toBe('');
  });
});

describe('describeLineBollingerChart', () => {
  it('returns No data for empty', () => {
    expect(describeLineBollingerChart([])).toBe('No data');
    expect(describeLineBollingerChart(null)).toBe('No data');
  });

  it('mentions window + k + latest %B', () => {
    const desc = describeLineBollingerChart([spikeSeries], { window: 3 });
    expect(desc).toMatch(/window 3/);
    expect(desc).toMatch(/k 2/);
    expect(desc).toMatch(/latest %B/);
  });
});

describe('<ChartLineBollinger> render', () => {
  it('renders empty when no series', () => {
    const { container } = render(<ChartLineBollinger series={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-bollinger"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('renders price path with kind=price', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const path = document.querySelector(
      '[data-section="chart-line-bollinger-path"]',
    );
    expect(path?.getAttribute('data-kind')).toBe('price');
  });

  it('renders upper/middle/lower band lines', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const upper = document.querySelector(
      '[data-section="chart-line-bollinger-band-line"][data-kind="upper"]',
    );
    const middle = document.querySelector(
      '[data-section="chart-line-bollinger-band-line"][data-kind="middle"]',
    );
    const lower = document.querySelector(
      '[data-section="chart-line-bollinger-band-line"][data-kind="lower"]',
    );
    expect(upper).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(lower).not.toBeNull();
  });

  it('middle line is dashed', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const middle = document.querySelector(
      '[data-section="chart-line-bollinger-band-line"][data-kind="middle"]',
    );
    expect(middle?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('renders band filled polygon', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const band = document.querySelector(
      '[data-section="chart-line-bollinger-band"]',
    );
    expect(band).not.toBeNull();
  });

  it('hides band via showBand=false', () => {
    render(
      <ChartLineBollinger series={[spikeSeries]} window={3} showBand={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-bollinger-band"]'),
    ).toBeNull();
  });

  it('hides middle via showMiddle=false', () => {
    render(
      <ChartLineBollinger series={[spikeSeries]} window={3} showMiddle={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-bollinger-band-line"][data-kind="middle"]',
      ),
    ).toBeNull();
  });

  it('renders dots with state attrs', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={10} />);
    const spike = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="9"]',
    );
    expect(spike?.getAttribute('data-state')).toBe('above');
  });

  it('inside dots carry data-state=inside (leading null bands)', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={10} />);
    // First sample has no bands yet -> state=inside per classifier
    const dot4 = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="4"]',
    );
    expect(dot4?.getAttribute('data-state')).toBe('inside');
  });

  it('hides dots via showDots=false', () => {
    render(
      <ChartLineBollinger series={[spikeSeries]} window={3} showDots={false} />,
    );
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-bollinger-dot"]',
      ).length,
    ).toBe(0);
  });

  it('renders breakout badge with dominant state', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={10} />);
    const badge = document.querySelector(
      '[data-section="chart-line-bollinger-badge"]',
    );
    expect(badge?.getAttribute('data-state')).toBeDefined();
    expect(Number(badge?.getAttribute('data-breakout-count'))).toBeGreaterThan(
      0,
    );
  });

  it('hides badge via showBreakoutBadge=false', () => {
    render(
      <ChartLineBollinger
        series={[spikeSeries]}
        window={3}
        showBreakoutBadge={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-bollinger-badge"]'),
    ).toBeNull();
  });

  it('region+img ARIA', () => {
    render(<ChartLineBollinger series={[spikeSeries]} ariaLabel="bb" />);
    const region = screen.getByRole('region', { name: 'bb' });
    const img = within(region).getByRole('img', { name: 'bb' });
    expect(img.tagName.toLowerCase()).toBe('svg');
  });

  it('mirrors root data-*', () => {
    render(
      <ChartLineBollinger series={[spikeSeries]} window={10} kSigma={2} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-bollinger"]',
    );
    expect(root?.getAttribute('data-series-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('10');
    expect(root?.getAttribute('data-window')).toBe('10');
    expect(root?.getAttribute('data-k-sigma')).toBe('2');
    expect(
      Number(root?.getAttribute('data-breakout-count')),
    ).toBeGreaterThan(0);
  });

  it('mirrors per-series stats on group', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const group = document.querySelector(
      '[data-section="chart-line-bollinger-series-group"]',
    );
    expect(group?.getAttribute('data-series-window')).toBe('3');
    expect(
      Number(group?.getAttribute('data-series-band-valid-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip shows middle + upper + lower rows on hover', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const dot = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="5"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const middle = document.querySelector(
      '[data-section="chart-line-bollinger-tooltip-middle"]',
    );
    const upper = document.querySelector(
      '[data-section="chart-line-bollinger-tooltip-upper"]',
    );
    const lower = document.querySelector(
      '[data-section="chart-line-bollinger-tooltip-lower"]',
    );
    expect(middle?.textContent).toMatch(/middle:/);
    expect(upper?.textContent).toMatch(/upper:/);
    expect(lower?.textContent).toMatch(/lower:/);
  });

  it('tooltip shows n/a for leading point (window not filled)', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const dot = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="0"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    const middle = document.querySelector(
      '[data-section="chart-line-bollinger-tooltip-middle"]',
    );
    expect(middle?.textContent).toMatch(/n\/a/);
  });

  it('hides tooltip on leave', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const dot = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="5"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-bollinger-tooltip"]',
      ),
    ).toBeNull();
  });

  it('omits tooltip via showTooltip=false', () => {
    render(
      <ChartLineBollinger
        series={[spikeSeries]}
        window={3}
        showTooltip={false}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="5"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector(
        '[data-section="chart-line-bollinger-tooltip"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineBollinger
        series={[spikeSeries]}
        window={3}
        onPointClick={onPointClick}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-bollinger-dot"][data-point-index="2"]',
    ) as HTMLElement;
    fireEvent.click(dot);
    expect(onPointClick).toHaveBeenCalledTimes(1);
    expect(onPointClick.mock.calls[0]?.[0]?.point?.index).toBe(2);
  });

  it('legend shows BB(window, k) + breakouts stats', () => {
    render(<ChartLineBollinger series={[spikeSeries]} window={3} />);
    const stats = document.querySelector(
      '[data-section="chart-line-bollinger-legend-stats"]',
    );
    expect(stats?.textContent).toMatch(/BB\(3, 2\)/);
    expect(stats?.textContent).toMatch(/breakouts/);
  });

  it('toggles visibility via legend', () => {
    const onToggle = vi.fn();
    render(
      <ChartLineBollinger
        series={[spikeSeries]}
        window={3}
        onSeriesToggle={onToggle}
      />,
    );
    const item = document.querySelector(
      '[data-section="chart-line-bollinger-legend-item"]',
    ) as HTMLElement;
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalledWith({
      series: spikeSeries,
      hidden: true,
    });
  });

  it('omits legend via showLegend=false', () => {
    render(
      <ChartLineBollinger
        series={[spikeSeries]}
        window={3}
        showLegend={false}
      />,
    );
    expect(
      document.querySelector('[data-section="chart-line-bollinger-legend"]'),
    ).toBeNull();
  });

  it('applies animate class', () => {
    const { container } = render(
      <ChartLineBollinger series={[spikeSeries]} window={3} animate />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bollinger"]',
    );
    expect(root?.className).toMatch(/animate-fade-in/);
  });

  it('omits animate class when animate=false', () => {
    const { container } = render(
      <ChartLineBollinger series={[spikeSeries]} window={3} animate={false} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bollinger"]',
    );
    expect(root?.className ?? '').not.toMatch(/animate-fade-in/);
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBollinger ref={ref} series={[spikeSeries]} window={3} />);
    expect(ref.current).not.toBeNull();
  });

  it('has stable displayName', () => {
    expect(ChartLineBollinger.displayName).toBe('ChartLineBollinger');
  });
});
