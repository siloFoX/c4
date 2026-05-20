import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineWilliamsR,
  getLineWilliamsRFinitePoints,
  normalizeLineWilliamsRPeriod,
  computeLineWilliamsR,
  runLineWilliamsR,
  computeLineWilliamsRLayout,
  describeLineWilliamsRChart,
  DEFAULT_CHART_LINE_WILLIAMS_R_PERIOD,
  type ChartLineWilliamsRPoint,
} from './chart-line-williams-r';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,14,12,18,8,16], period 3.
 * %R = -100 * (highestHigh - value) / (highestHigh - lowestLow):
 *
 *   i=2 window [10,14,12]: hh 14, ll 10 -> -100*(14-12)/4  = -50
 *   i=3 window [14,12,18]: hh 18, ll 12 -> -100*(18-18)/6  = 0
 *   i=4 window [12,18,8] : hh 18, ll 8  -> -100*(18-8)/10  = -100
 *   i=5 window [18,8,16] : hh 18, ll 8  -> -100*(18-16)/10 = -20
 *
 * williamsR = [.,.,-50, 0, -100, -20]
 * %R[3]=0 (value at the window high) -> overbought;
 * %R[4]=-100 (value at the window low) -> oversold.
 * williamsRFinal = -20, overboughtCount 1, oversoldCount 1.
 */
const WR_DATA: ChartLineWilliamsRPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 12 },
  { x: 3, value: 18 },
  { x: 4, value: 8 },
  { x: 5, value: 16 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineWilliamsRFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineWilliamsRFinitePoints(WR_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineWilliamsRFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineWilliamsRFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineWilliamsRFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineWilliamsRFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 14 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineWilliamsRPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineWilliamsRPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineWilliamsRPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineWilliamsRPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineWilliamsRPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineWilliamsRPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineWilliamsR', () => {
  it('computes the %R series for the fixture', () => {
    expect(computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3)).toEqual([
      null, null, -50, 0, -100, -20,
    ]);
  });

  it('reads 0 when the value is at the window high', () => {
    expect(computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3)[3]).toBe(0);
  });

  it('reads -100 when the value is at the window low', () => {
    expect(computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3)[4]).toBe(-100);
  });

  it('leaves entries null before the window fills', () => {
    const wr = computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3);
    expect(wr[0]).toBeNull();
    expect(wr[1]).toBeNull();
  });

  it('reads -50 for a flat window (zero range)', () => {
    expect(computeLineWilliamsR([5, 5, 5, 5], 3)).toEqual([
      null, null, -50, -50,
    ]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineWilliamsR([10, 14], 3)).toEqual([null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineWilliamsR(null, 3)).toEqual([]);
  });

  it('keeps every defined reading within -100 and 0', () => {
    const wr = computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3);
    for (const v of wr) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(0);
      }
    }
  });

  it('produces a defined reading from the period-th index onward', () => {
    expect(computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3)[2]).not.toBeNull();
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineWilliamsR([10, 14, 12], 0).some((v) => v !== null)).toBe(
      true,
    );
  });

  it('reads a mid-range value at the proportional %R', () => {
    expect(computeLineWilliamsR([10, 14, 12, 18, 8, 16], 3)[2]).toBe(-50);
  });
});

describe('runLineWilliamsR', () => {
  it('marks ok for a valid series', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineWilliamsR([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineWilliamsR([]).ok).toBe(false);
  });

  it('computes the %R series', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).williamsR).toEqual([
      null, null, -50, 0, -100, -20,
    ]);
  });

  it('reports the final %R', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).williamsRFinal).toBe(-20);
  });

  it('classifies an overbought reading', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).samples[3]!.zone).toBe(
      'overbought',
    );
  });

  it('classifies an oversold reading', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).samples[4]!.zone).toBe(
      'oversold',
    );
  });

  it('classifies a mid-range reading as neutral', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).samples[2]!.zone).toBe(
      'neutral',
    );
  });

  it('counts the overbought and oversold readings', () => {
    const run = runLineWilliamsR(WR_DATA, { period: 3 });
    expect(run.overboughtCount).toBe(1);
    expect(run.oversoldCount).toBe(1);
  });

  it('emits one sample per point', () => {
    expect(runLineWilliamsR(WR_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineWilliamsR(
      [
        { x: 5, value: 16 },
        { x: 0, value: 10 },
        { x: 3, value: 18 },
        { x: 1, value: 14 },
        { x: 4, value: 8 },
        { x: 2, value: 12 },
      ],
      { period: 3 },
    );
    expect(run.williamsR).toEqual([null, null, -50, 0, -100, -20]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineWilliamsR(WR_DATA).period).toBe(
      DEFAULT_CHART_LINE_WILLIAMS_R_PERIOD,
    );
  });

  it('honours custom overbought and oversold thresholds', () => {
    const run = runLineWilliamsR(WR_DATA, {
      period: 3,
      overbought: -60,
      oversold: -90,
    });
    expect(run.samples[2]!.zone).toBe('overbought');
  });
});

describe('computeLineWilliamsRLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineWilliamsRLayout({ data: WR_DATA, period: 3, ...LAYOUT_OPTS })
        .ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineWilliamsRLayout({
      data: [{ x: 0, value: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the %R panel', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.wrPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
  });

  it('reports the final %R and extreme counts', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.williamsRFinal).toBe(-20);
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the %R is defined', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(4);
  });

  it('builds a non-empty %R path', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.wrPath.startsWith('M')).toBe(true);
  });

  it('builds a 0 to -100 %R y-axis', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.wrYTicks[0]!.value).toBe(0);
    expect(layout.wrYTicks[layout.wrYTicks.length - 1]!.value).toBe(-100);
  });

  it('defaults the thresholds to -20 and -80', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overbought).toBe(-20);
    expect(layout.oversold).toBe(-80);
  });

  it('places the overbought level above the oversold level', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('gives the extreme zones a positive height', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtZone.height).toBeGreaterThan(0);
    expect(layout.oversoldZone.height).toBeGreaterThan(0);
  });

  it('keeps markers inside the %R panel', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.wrPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.wrPanel.y + layout.wrPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineWilliamsRLayout({
      data: WR_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineWilliamsRChart', () => {
  it('mentions Williams %R', () => {
    expect(describeLineWilliamsRChart(WR_DATA, { period: 3 })).toContain(
      'Williams %R',
    );
  });

  it('mentions the oscillator panel', () => {
    expect(describeLineWilliamsRChart(WR_DATA, { period: 3 })).toContain(
      'oscillator',
    );
  });

  it('mentions overbought and oversold', () => {
    const text = describeLineWilliamsRChart(WR_DATA, { period: 3 });
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the period', () => {
    expect(describeLineWilliamsRChart(WR_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('reports the extreme counts', () => {
    expect(describeLineWilliamsRChart(WR_DATA, { period: 3 })).toContain(
      '1 overbought and 1 oversold across 6 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineWilliamsRChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineWilliamsR />', () => {
  it('renders the root region', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-williams-r"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineWilliamsR data={[{ x: 0, value: 1 }]} period={3} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.getAttribute('data-period')).toBe('3');
  });

  it('exposes the extreme counts as data attributes', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.getAttribute('data-overbought-count')).toBe('1');
    expect(root?.getAttribute('data-oversold-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-williams-r-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Williams %R');
  });

  it('renders the value path', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-value-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the %R line', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-williams-r-wr-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined %R value', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-williams-r-marker"]',
      ),
    ).toHaveLength(4);
  });

  it('tags markers with their zone', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-williams-r-marker"]',
    );
    const overbought = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    );
    const oversold = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    );
    expect(overbought?.getAttribute('data-zone')).toBe('overbought');
    expect(oversold?.getAttribute('data-zone')).toBe('oversold');
  });

  it('renders both extreme zone rectangles', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-williams-r-zone"]'),
    ).toHaveLength(2);
  });

  it('hides the zones when showZones is false', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} showZones={false} />);
    expect(
      document.querySelector('[data-section="chart-line-williams-r-zone"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-williams-r-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('Williams %R');
  });

  it('renders the config badge with period and extreme count', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-badge-extremes"]',
      )?.textContent,
    ).toBe('ext=2');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(
      <ChartLineWilliamsR data={WR_DATA} period={3} showConfigBadge={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-williams-r-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-williams-r-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('toggles the %R series off via the legend', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const wrItem = document.querySelector(
      '[data-section="chart-line-williams-r-legend-item"][data-series-id="wr"]',
    ) as HTMLElement;
    fireEvent.click(wrItem);
    expect(wrItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-williams-r-wr-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineWilliamsR
        data={WR_DATA}
        period={3}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-williams-r-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the %R line when showWilliamsR is false', () => {
    render(
      <ChartLineWilliamsR data={WR_DATA} period={3} showWilliamsR={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-williams-r-wr-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-williams-r-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-williams-r-marker"]',
    );
    const m4 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(m4);
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-tooltip-wr"]',
      )?.textContent,
    ).toBe('%R: -100');
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: oversold');
  });

  it('reports the overbought zone in the tooltip', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-williams-r-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: overbought');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-williams-r-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-williams-r-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-williams-r-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineWilliamsR
        data={WR_DATA}
        period={3}
        onPointClick={onPointClick}
      />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-williams-r-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} animate={false} />);
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineWilliamsR ref={ref} data={WR_DATA} period={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineWilliamsR data={WR_DATA} period={3} className="custom-wr" />,
    );
    const root = document.querySelector(
      '[data-section="chart-line-williams-r"]',
    );
    expect(root?.className).toContain('custom-wr');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the extreme counts in the legend stats', () => {
    render(<ChartLineWilliamsR data={WR_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-williams-r-legend-stats"]',
      )?.textContent,
    ).toContain('1 overbought, 1 oversold');
  });
});
