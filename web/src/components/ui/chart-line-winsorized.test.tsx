import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineWinsorized,
  DEFAULT_CHART_LINE_WINSORIZED_HEIGHT,
  DEFAULT_CHART_LINE_WINSORIZED_PADDING,
  DEFAULT_CHART_LINE_WINSORIZED_PALETTE,
  DEFAULT_CHART_LINE_WINSORIZED_TICK_COUNT,
  DEFAULT_CHART_LINE_WINSORIZED_WIDTH,
  computeLineWinsorizedLayout,
  computeLineWinsorizedQuantile,
  describeLineWinsorizedChart,
  getLineWinsorizedDefaultColor,
  getLineWinsorizedFinitePoints,
  runLineWinsorized,
  type ChartLineWinsorizedPoint,
} from './chart-line-winsorized';

afterEach(() => {
  cleanup();
});

// sorted y = [0, 10, 20, 30, 100]; with quantiles 0.25 / 0.75 the
// bounds land exactly on order statistics: lower 10, upper 30.
const WINSOR_DATA: ChartLineWinsorizedPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 10 },
  { x: 2, y: 20 },
  { x: 3, y: 30 },
  { x: 4, y: 100 },
];
const QUANTILE_VALUES = [10, 20, 30, 40, 50];
const CONST_DATA: ChartLineWinsorizedPoint[] = [
  { x: 0, y: 5 },
  { x: 1, y: 5 },
  { x: 2, y: 5 },
];

describe('chart-line-winsorized defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_WINSORIZED_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_WINSORIZED_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_WINSORIZED_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_WINSORIZED_TICK_COUNT).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_WINSORIZED_PALETTE.length).toBe(10);
  });
});

describe('getLineWinsorizedDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_WINSORIZED_PALETTE.length;
    expect(getLineWinsorizedDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_WINSORIZED_PALETTE[0],
    );
    expect(getLineWinsorizedDefaultColor(len + 3)).toBe(
      DEFAULT_CHART_LINE_WINSORIZED_PALETTE[3],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineWinsorizedDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_WINSORIZED_PALETTE[0],
    );
    expect(getLineWinsorizedDefaultColor(-2)).toBe(
      DEFAULT_CHART_LINE_WINSORIZED_PALETTE[0],
    );
  });
});

describe('getLineWinsorizedFinitePoints', () => {
  it('drops points with non-finite x or y', () => {
    const r = getLineWinsorizedFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineWinsorizedFinitePoints(null)).toEqual([]);
    expect(getLineWinsorizedFinitePoints(undefined)).toEqual([]);
  });
});

describe('computeLineWinsorizedQuantile', () => {
  it('empty input -> NaN', () => {
    expect(Number.isNaN(computeLineWinsorizedQuantile([], 0.5))).toBe(true);
    expect(Number.isNaN(computeLineWinsorizedQuantile(null, 0.5))).toBe(
      true,
    );
  });
  it('single value -> that value for any q', () => {
    expect(computeLineWinsorizedQuantile([42], 0)).toBe(42);
    expect(computeLineWinsorizedQuantile([42], 1)).toBe(42);
  });
  it('q=0 -> min, q=1 -> max', () => {
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 0)).toBe(10);
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 1)).toBe(50);
  });
  it('q=0.5 -> median', () => {
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 0.5)).toBe(30);
  });
  it('q=0.25 lands on an order statistic', () => {
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 0.25)).toBe(20);
  });
  it('interpolates between order statistics', () => {
    // h = 4 * 0.1 = 0.4 -> 10 + 0.4 * (20 - 10) = 14
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 0.1)).toBeCloseTo(
      14,
      10,
    );
  });
  it('clamps q outside [0,1]', () => {
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, -1)).toBe(10);
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, 2)).toBe(50);
  });
  it('drops non-finite values; non-finite q falls back to 0', () => {
    expect(
      computeLineWinsorizedQuantile([10, NaN, 20, Infinity, 30], 0.5),
    ).toBe(20);
    expect(computeLineWinsorizedQuantile(QUANTILE_VALUES, NaN)).toBe(10);
  });
});

describe('runLineWinsorized', () => {
  it('empty -> ok=false', () => {
    const r = runLineWinsorized([]);
    expect(r.ok).toBe(false);
    expect(r.totalSamples).toBe(0);
    expect(Number.isNaN(r.lowerBound)).toBe(true);
  });
  it('quantiles 0.25 / 0.75 -> bounds 10 / 30', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.25, 0.75);
    expect(r.lowerBound).toBe(10);
    expect(r.upperBound).toBe(30);
  });
  it('clamps values outside the band to the matching bound', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.25, 0.75);
    expect(r.samples.map((s) => s.winsorized)).toEqual([
      10, 10, 20, 30, 30,
    ]);
  });
  it('flags the clamped-low and clamped-high samples', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.25, 0.75);
    expect(r.samples[0]!.clampedLow).toBe(true);
    expect(r.samples[4]!.clampedHigh).toBe(true);
    expect(r.samples[2]!.clamped).toBe(false);
  });
  it('counts the clamped samples per tail', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.25, 0.75);
    expect(r.clampedLowCount).toBe(1);
    expect(r.clampedHighCount).toBe(1);
    expect(r.clampedCount).toBe(2);
  });
  it('delta is winsorized minus raw', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.25, 0.75);
    expect(r.samples[0]!.delta).toBe(10); // 10 - 0
    expect(r.samples[4]!.delta).toBe(-70); // 30 - 100
  });
  it('constant series clamps nothing', () => {
    const r = runLineWinsorized(CONST_DATA, 0.25, 0.75);
    expect(r.clampedCount).toBe(0);
    expect(r.lowerBound).toBe(5);
    expect(r.upperBound).toBe(5);
  });
  it('swaps the quantiles when lower exceeds upper', () => {
    const r = runLineWinsorized(WINSOR_DATA, 0.75, 0.25);
    expect(r.lowerQuantile).toBe(0.25);
    expect(r.upperQuantile).toBe(0.75);
    expect(r.lowerBound).toBe(10);
    expect(r.upperBound).toBe(30);
  });
  it('out-of-range quantiles are clamped to [0,1]', () => {
    // lq -> 0 (min), uq -> 1 (max): the band spans the whole range
    const r = runLineWinsorized(WINSOR_DATA, -1, 2);
    expect(r.lowerBound).toBe(0);
    expect(r.upperBound).toBe(100);
    expect(r.clampedCount).toBe(0);
  });
  it('sorts the samples ascending by x', () => {
    const r = runLineWinsorized(
      [
        { x: 2, y: 1 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
      0.25,
      0.75,
    );
    expect(r.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });
});

describe('computeLineWinsorizedLayout', () => {
  it('empty data -> ok=false', () => {
    const layout = computeLineWinsorizedLayout({
      data: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds the raw and winsorized paths', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    expect(layout.rawPath).toContain('M ');
    expect(layout.winsorizedPath).toContain('M ');
  });

  it('projects every sample with px / rawPy / winsorizedPy', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.samples.length).toBe(5);
    for (const s of layout.samples) {
      expect(Number.isFinite(s.px)).toBe(true);
      expect(Number.isFinite(s.rawPy)).toBe(true);
      expect(Number.isFinite(s.winsorizedPy)).toBe(true);
    }
  });

  it('exposes the bounds and their projected y coordinates', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.lowerBound).toBe(10);
    expect(layout.upperBound).toBe(30);
    expect(Number.isFinite(layout.lowerBoundPy)).toBe(true);
    expect(Number.isFinite(layout.upperBoundPy)).toBe(true);
  });

  it('carries the per-sample clamped flags', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.samples[0]!.clampedLow).toBe(true);
    expect(layout.samples[4]!.clampedHigh).toBe(true);
  });

  it('exposes the clamp counts', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.clampedCount).toBe(2);
    expect(layout.clampedLowCount).toBe(1);
    expect(layout.clampedHighCount).toBe(1);
    expect(layout.totalSamples).toBe(5);
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -10,
      yMax: 200,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-10);
    expect(layout.yMax).toBe(200);
  });

  it('the y range is taken from the raw values', () => {
    const layout = computeLineWinsorizedLayout({
      data: WINSOR_DATA,
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(100);
  });
});

describe('describeLineWinsorizedChart', () => {
  it('no data -> No data', () => {
    expect(describeLineWinsorizedChart([])).toBe('No data');
    expect(describeLineWinsorizedChart(null)).toBe('No data');
  });
  it('summary mentions winsorized + quantile + bounds + clamped', () => {
    const s = describeLineWinsorizedChart(WINSOR_DATA, {
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
    });
    expect(s).toContain('winsorized');
    expect(s).toContain('quantile');
    expect(s).toContain('bounds');
    expect(s).toContain('clamped');
  });
  it('summary reports the resolved bound values', () => {
    const s = describeLineWinsorizedChart(WINSOR_DATA, {
      lowerQuantile: 0.25,
      upperQuantile: 0.75,
    });
    expect(s).toContain('[10, 30]');
    expect(s).toContain('2 of 5');
  });
});

describe('<ChartLineWinsorized> render', () => {
  const baseProps = {
    data: WINSOR_DATA,
    lowerQuantile: 0.25,
    upperQuantile: 0.75,
  };

  it('renders empty state when there is no data', () => {
    render(<ChartLineWinsorized data={[]} />);
    const root = document.querySelector(
      '[data-section="chart-line-winsorized"]',
    );
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders the raw path with data-kind=raw', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const raw = document.querySelector(
      '[data-section="chart-line-winsorized-raw-path"]',
    );
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders the winsorized path with data-kind=winsorized', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const win = document.querySelector(
      '[data-section="chart-line-winsorized-winsorized-path"]',
    );
    expect(win!.getAttribute('data-kind')).toBe('winsorized');
  });

  it('hides the raw line via hiddenSeries', () => {
    render(
      <ChartLineWinsorized {...baseProps} hiddenSeries={['raw']} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-raw-path"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-winsorized-path"]',
      ),
    ).not.toBeNull();
  });

  it('hiding the winsorized series also drops its clamped markers', () => {
    render(
      <ChartLineWinsorized {...baseProps} hiddenSeries={['winsorized']} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-winsorized-path"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-clamped-marker"]',
      ),
    ).toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-raw-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders an upper and a lower bound line', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-bound-line"][data-edge="upper"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-bound-line"][data-edge="lower"]',
      ),
    ).not.toBeNull();
  });

  it('hides the bound lines via showBounds=false', () => {
    render(<ChartLineWinsorized {...baseProps} showBounds={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-bound-line"]',
      ),
    ).toBeNull();
  });

  it('renders the bound band and hides it via showBoundBand=false', () => {
    const { rerender } = render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-bound-band"]',
      ),
    ).not.toBeNull();
    rerender(
      <ChartLineWinsorized {...baseProps} showBoundBand={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-bound-band"]',
      ),
    ).toBeNull();
  });

  it('renders one clamped marker per clamped sample', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-winsorized-clamped-marker"]',
      ).length,
    ).toBe(2);
  });

  it('clamped markers carry a low / high direction', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-clamped-marker"][data-direction="low"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-clamped-marker"][data-direction="high"]',
      ),
    ).not.toBeNull();
  });

  it('hides clamped markers via showClampedMarkers=false', () => {
    render(
      <ChartLineWinsorized {...baseProps} showClampedMarkers={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-clamped-marker"]',
      ),
    ).toBeNull();
  });

  it('dots are off by default and shown via showDots', () => {
    const { rerender } = render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-winsorized-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineWinsorized {...baseProps} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-winsorized-dot"]')
        .length,
    ).toBe(5);
  });

  it('config badge shows the bounds and the clamp count', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-badge-lower"]',
      )?.textContent,
    ).toBe('lo=10');
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-badge-upper"]',
      )?.textContent,
    ).toBe('hi=30');
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-badge-clamp"]',
      )?.textContent,
    ).toBe('clamp=2');
  });

  it('hides the config badge via showConfigBadge=false', () => {
    render(
      <ChartLineWinsorized {...baseProps} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-winsorized-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const root = document.querySelector(
      '[data-section="chart-line-winsorized"]',
    );
    expect(root!.getAttribute('role')).toBe('region');
    expect(
      document
        .querySelector('[data-section="chart-line-winsorized-svg"]')!
        .getAttribute('role'),
    ).toBe('img');
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-aria-desc"]',
      )!.textContent,
    ).toContain('winsorized');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const root = document.querySelector(
      '[data-section="chart-line-winsorized"]',
    );
    expect(root!.getAttribute('data-total-samples')).toBe('5');
    expect(root!.getAttribute('data-clamped-count')).toBe('2');
    expect(root!.getAttribute('data-clamped-low-count')).toBe('1');
    expect(root!.getAttribute('data-clamped-high-count')).toBe('1');
    expect(Number(root!.getAttribute('data-lower-bound'))).toBe(10);
    expect(Number(root!.getAttribute('data-upper-bound'))).toBe(30);
  });

  it('tooltip on a clamped marker shows raw + winsorized + clamp rows', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const marker = document.querySelector(
      '[data-section="chart-line-winsorized-clamped-marker"][data-direction="low"]',
    );
    fireEvent.mouseEnter(marker!);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip-raw"]',
      )?.textContent,
    ).toBe('raw: 0');
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip-winsorized"]',
      )?.textContent,
    ).toBe('winsorized: 10');
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip-clamp"]',
      )?.textContent,
    ).toContain('clamped low');
    fireEvent.mouseLeave(marker!);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip"]',
      ),
    ).toBeNull();
  });

  it('tooltip on an un-clamped dot reports not clamped', () => {
    render(<ChartLineWinsorized {...baseProps} showDots />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-winsorized-dot"]',
    );
    fireEvent.mouseEnter(dots[2]!);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip-clamp"]',
      )?.textContent,
    ).toBe('not clamped');
  });

  it('omits the tooltip when showTooltip=false', () => {
    render(<ChartLineWinsorized {...baseProps} showTooltip={false} />);
    const marker = document.querySelector(
      '[data-section="chart-line-winsorized-clamped-marker"]',
    );
    fireEvent.mouseEnter(marker!);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-tooltip"]',
      ),
    ).toBeNull();
  });

  it('onPointClick fires with the sample payload', () => {
    let captured: number | null = null;
    render(
      <ChartLineWinsorized
        {...baseProps}
        onPointClick={({ sample }) => {
          captured = sample.index;
        }}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-winsorized-clamped-marker"]',
    );
    fireEvent.click(marker!);
    expect(captured).not.toBeNull();
  });

  it('legend has two toggle items and toggles a series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineWinsorized
        {...baseProps}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const items = document.querySelectorAll(
      '[data-section="chart-line-winsorized-legend-item"]',
    );
    expect(items.length).toBe(2);
    fireEvent.click(items[0]!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('raw')).toBe(true);
  });

  it('legend stats report the clamp tally', () => {
    render(<ChartLineWinsorized {...baseProps} />);
    const stats = document.querySelector(
      '[data-section="chart-line-winsorized-legend-stats"]',
    );
    expect(stats!.textContent).toContain('2 clamped');
    expect(stats!.textContent).toContain('1 low');
    expect(stats!.textContent).toContain('1 high');
  });

  it('omits the legend when showLegend=false', () => {
    render(<ChartLineWinsorized {...baseProps} showLegend={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-winsorized-legend"]',
      ),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineWinsorized {...baseProps} animate={true} />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-winsorized"]',
    );
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineWinsorized {...baseProps} animate={false} />);
    expect(
      document
        .querySelector('[data-section="chart-line-winsorized"]')!
        .getAttribute('data-animate'),
    ).toBe('false');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWinsorized ref={ref} {...baseProps} />);
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-winsorized',
    );
  });

  it('has displayName', () => {
    expect(ChartLineWinsorized.displayName).toBe('ChartLineWinsorized');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineWinsorized {...baseProps} ariaLabel="Clamped tails" />,
    );
    expect(
      document
        .querySelector('[data-section="chart-line-winsorized"]')!
        .getAttribute('aria-label'),
    ).toBe('Clamped tails');
    expect(
      document
        .querySelector('[data-section="chart-line-winsorized-svg"]')!
        .getAttribute('aria-label'),
    ).toBe('Clamped tails');
  });

  it('xLabel and yLabel render axis text', () => {
    render(
      <ChartLineWinsorized {...baseProps} xLabel="t" yLabel="value" />,
    );
    expect(screen.getByText('t').getAttribute('data-section')).toBe(
      'chart-line-winsorized-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-winsorized-y-label',
    );
  });
});
