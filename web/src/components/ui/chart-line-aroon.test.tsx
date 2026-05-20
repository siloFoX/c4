import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineAroon,
  getLineAroonFinitePoints,
  normalizeLineAroonPeriod,
  computeLineAroon,
  runLineAroon,
  computeLineAroonLayout,
  describeLineAroonChart,
  DEFAULT_CHART_LINE_AROON_PERIOD,
  type ChartLineAroonPoint,
} from './chart-line-aroon';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,14,11,12,18,9,20,8], period 4.
 * Each Aroon reading scans the window of period+1 = 5 values:
 *
 *   i=4 window [10,14,11,12,18]: high@4 off 0 -> up 100;
 *                                low@0  off 4 -> down 0
 *   i=5 window [14,11,12,18,9] : high@4 off 1 -> up 75;
 *                                low@5  off 0 -> down 100
 *   i=6 window [11,12,18,9,20] : high@6 off 0 -> up 100;
 *                                low@5  off 1 -> down 75
 *   i=7 window [12,18,9,20,8]  : high@6 off 1 -> up 75;
 *                                low@7  off 0 -> down 100
 *
 * aroonUp     = [.,.,.,.,100, 75, 100, 75]
 * aroonDown   = [.,.,.,.,0,   100, 75, 100]
 * oscillator  = [.,.,.,.,100, -25, 25, -25]
 * aroonUpFinal = 75, aroonDownFinal = 100, oscillatorFinal = -25.
 */
const AROON_DATA: ChartLineAroonPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 11 },
  { x: 3, value: 12 },
  { x: 4, value: 18 },
  { x: 5, value: 9 },
  { x: 6, value: 20 },
  { x: 7, value: 8 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineAroonFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineAroonFinitePoints(AROON_DATA)).toHaveLength(8);
  });

  it('returns empty for null input', () => {
    expect(getLineAroonFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineAroonFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineAroonFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineAroonFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 14 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineAroonPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAroonPeriod(25, 10)).toBe(25);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineAroonPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineAroonPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineAroonPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineAroonPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineAroon', () => {
  it('computes the Aroon-up series for the fixture', () => {
    expect(
      computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4).aroonUp,
    ).toEqual([null, null, null, null, 100, 75, 100, 75]);
  });

  it('computes the Aroon-down series for the fixture', () => {
    expect(
      computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4).aroonDown,
    ).toEqual([null, null, null, null, 0, 100, 75, 100]);
  });

  it('reads 100 when the high is the current bar', () => {
    expect(computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4).aroonUp[4]).toBe(
      100,
    );
  });

  it('reads 0 when the extreme is the oldest bar in the window', () => {
    expect(
      computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4).aroonDown[4],
    ).toBe(0);
  });

  it('reads Aroon-up 100 and Aroon-down 0 for a strictly rising series', () => {
    const ar = computeLineAroon([1, 2, 3, 4, 5], 4);
    expect(ar.aroonUp[4]).toBe(100);
    expect(ar.aroonDown[4]).toBe(0);
  });

  it('reads Aroon-up 0 and Aroon-down 100 for a strictly falling series', () => {
    const ar = computeLineAroon([5, 4, 3, 2, 1], 4);
    expect(ar.aroonUp[4]).toBe(0);
    expect(ar.aroonDown[4]).toBe(100);
  });

  it('reads both lines at 100 for a flat series (most recent tie wins)', () => {
    const ar = computeLineAroon([5, 5, 5, 5, 5], 4);
    expect(ar.aroonUp[4]).toBe(100);
    expect(ar.aroonDown[4]).toBe(100);
  });

  it('leaves entries null before the window fills', () => {
    const ar = computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4);
    expect(ar.aroonUp[3]).toBeNull();
    expect(ar.aroonDown[3]).toBeNull();
  });

  it('returns all null when the series is shorter than period + 1', () => {
    expect(computeLineAroon([1, 2, 3], 4).aroonUp).toEqual([
      null, null, null,
    ]);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineAroon(null, 4).aroonUp).toEqual([]);
  });

  it('keeps every defined reading within 0 and 100', () => {
    const ar = computeLineAroon([10, 14, 11, 12, 18, 9, 20, 8], 4);
    for (const v of [...ar.aroonUp, ...ar.aroonDown]) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineAroon([1, 2, 3], 0).aroonUp.some((v) => v !== null)).toBe(
      true,
    );
  });
});

describe('runLineAroon', () => {
  it('marks ok for a valid series', () => {
    expect(runLineAroon(AROON_DATA, { period: 4 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineAroon([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineAroon([]).ok).toBe(false);
  });

  it('computes the Aroon-up and Aroon-down series', () => {
    const run = runLineAroon(AROON_DATA, { period: 4 });
    expect(run.aroonUp).toEqual([null, null, null, null, 100, 75, 100, 75]);
    expect(run.aroonDown).toEqual([null, null, null, null, 0, 100, 75, 100]);
  });

  it('computes the Aroon oscillator as up minus down', () => {
    expect(runLineAroon(AROON_DATA, { period: 4 }).oscillator).toEqual([
      null, null, null, null, 100, -25, 25, -25,
    ]);
  });

  it('reports the final Aroon-up and Aroon-down', () => {
    const run = runLineAroon(AROON_DATA, { period: 4 });
    expect(run.aroonUpFinal).toBe(75);
    expect(run.aroonDownFinal).toBe(100);
  });

  it('reports the final oscillator', () => {
    expect(runLineAroon(AROON_DATA, { period: 4 }).oscillatorFinal).toBe(-25);
  });

  it('emits one sample per point', () => {
    expect(runLineAroon(AROON_DATA, { period: 4 }).samples).toHaveLength(8);
  });

  it('carries the Aroon metrics onto each sample', () => {
    const s = runLineAroon(AROON_DATA, { period: 4 }).samples[5]!;
    expect(s.aroonUp).toBe(75);
    expect(s.aroonDown).toBe(100);
    expect(s.oscillator).toBe(-25);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineAroon(
      [
        { x: 7, value: 8 },
        { x: 0, value: 10 },
        { x: 4, value: 18 },
        { x: 1, value: 14 },
        { x: 6, value: 20 },
        { x: 2, value: 11 },
        { x: 5, value: 9 },
        { x: 3, value: 12 },
      ],
      { period: 4 },
    );
    expect(run.aroonUp).toEqual([null, null, null, null, 100, 75, 100, 75]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineAroon(AROON_DATA).period).toBe(
      DEFAULT_CHART_LINE_AROON_PERIOD,
    );
  });

  it('is ok but reports NaN finals when too short for the window', () => {
    const run = runLineAroon(
      [
        { x: 0, value: 10 },
        { x: 1, value: 14 },
      ],
      { period: 4 },
    );
    expect(run.ok).toBe(true);
    expect(Number.isNaN(run.aroonUpFinal)).toBe(true);
  });
});

describe('computeLineAroonLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineAroonLayout({ data: AROON_DATA, period: 4, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineAroonLayout({
      data: [{ x: 0, value: 1 }],
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the Aroon panel', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.aroonPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(4);
  });

  it('reports the final Aroon readings', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.aroonUpFinal).toBe(75);
    expect(layout.aroonDownFinal).toBe(100);
    expect(layout.oscillatorFinal).toBe(-25);
  });

  it('reports the total point count', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(8);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(8);
  });

  it('emits a marker only where the Aroon is defined', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(4);
  });

  it('builds non-empty Aroon-up and Aroon-down paths', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.aroonUpPath.startsWith('M')).toBe(true);
    expect(layout.aroonDownPath.startsWith('M')).toBe(true);
  });

  it('defaults the reference levels to 70 and 30', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.upperLevel).toBe(70);
    expect(layout.lowerLevel).toBe(30);
  });

  it('honours custom reference levels', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      upperLevel: 80,
      lowerLevel: 20,
      ...LAYOUT_OPTS,
    });
    expect(layout.upperLevel).toBe(80);
    expect(layout.lowerLevel).toBe(20);
  });

  it('places the upper level above the lower level', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.upperLevelY).toBeLessThan(layout.lowerLevelY);
  });

  it('builds a fixed 0-100 Aroon y-axis', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.aroonYTicks[0]!.value).toBe(0);
    expect(layout.aroonYTicks[layout.aroonYTicks.length - 1]!.value).toBe(100);
  });

  it('keeps markers inside the Aroon panel', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.aroonPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.aroonPanel.y + layout.aroonPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineAroonLayout({
      data: AROON_DATA,
      period: 4,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAroonChart', () => {
  it('mentions Aroon', () => {
    expect(describeLineAroonChart(AROON_DATA, { period: 4 })).toContain(
      'Aroon',
    );
  });

  it('mentions the Aroon-up and Aroon-down lines', () => {
    const text = describeLineAroonChart(AROON_DATA, { period: 4 });
    expect(text).toContain('Aroon-up');
    expect(text).toContain('Aroon-down');
  });

  it('reports the period', () => {
    expect(describeLineAroonChart(AROON_DATA, { period: 4 })).toContain(
      'period 4',
    );
  });

  it('reports the final Aroon-up reading', () => {
    expect(describeLineAroonChart(AROON_DATA, { period: 4 })).toContain(
      'Final Aroon-up 75',
    );
  });

  it('reports the period count', () => {
    expect(describeLineAroonChart(AROON_DATA, { period: 4 })).toContain(
      'across 8 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineAroonChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineAroon />', () => {
  it('renders the root region', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineAroon data={[{ x: 0, value: 1 }]} period={4} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.getAttribute('data-period')).toBe('4');
  });

  it('exposes the final Aroon readings as data attributes', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.getAttribute('data-aroon-up-final')).toBe('75');
    expect(root?.getAttribute('data-aroon-down-final')).toBe('100');
    expect(root?.getAttribute('data-oscillator-final')).toBe('-25');
  });

  it('renders an accessible description', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const desc = document.querySelector(
      '[data-section="chart-line-aroon-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Aroon');
  });

  it('renders the value path', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the Aroon-up line', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-up-line"]'),
    ).toBeTruthy();
  });

  it('renders the Aroon-down line', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-down-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined Aroon value', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-aroon-marker"]'),
    ).toHaveLength(4);
  });

  it('renders both reference level lines', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-aroon-level-line"]',
      ),
    ).toHaveLength(2);
  });

  it('hides the reference levels when showLevels is false', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} showLevels={false} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-level-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-aroon-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('Aroon');
  });

  it('renders the config badge with period and oscillator', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-badge-period"]',
      )?.textContent,
    ).toBe('p=4');
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-badge-osc"]',
      )?.textContent,
    ).toBe('osc=-25');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-aroon-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('toggles the Aroon-up series off via the legend', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const upItem = document.querySelector(
      '[data-section="chart-line-aroon-legend-item"][data-series-id="aroonup"]',
    ) as HTMLElement;
    fireEvent.click(upItem);
    expect(
      document.querySelector('[data-section="chart-line-aroon-up-line"]'),
    ).toBeNull();
  });

  it('toggles the Aroon-down series off via the legend', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const downItem = document.querySelector(
      '[data-section="chart-line-aroon-legend-item"][data-series-id="aroondown"]',
    ) as HTMLElement;
    fireEvent.click(downItem);
    expect(
      document.querySelector('[data-section="chart-line-aroon-down-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineAroon
        data={AROON_DATA}
        period={4}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-aroon-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the Aroon-up line when showAroonUp is false', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} showAroonUp={false} />);
    expect(
      document.querySelector('[data-section="chart-line-aroon-up-line"]'),
    ).toBeNull();
  });

  it('hides the Aroon-down line when showAroonDown is false', () => {
    render(
      <ChartLineAroon data={AROON_DATA} period={4} showAroonDown={false} />,
    );
    expect(
      document.querySelector('[data-section="chart-line-aroon-down-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-aroon-dot"]'),
    ).toHaveLength(8);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-aroon-marker"]',
    );
    const m5 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '5',
    ) as Element;
    fireEvent.mouseEnter(m5);
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-tooltip-aroon-up"]',
      )?.textContent,
    ).toBe('aroon-up: 75');
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-tooltip-aroon-down"]',
      )?.textContent,
    ).toBe('aroon-down: 100');
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-tooltip-oscillator"]',
      )?.textContent,
    ).toBe('oscillator: -25');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const marker = document.querySelector(
      '[data-section="chart-line-aroon-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-aroon-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-aroon-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineAroon data={AROON_DATA} period={4} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-aroon-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAroon ref={ref} data={AROON_DATA} period={4} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineAroon data={AROON_DATA} period={4} className="custom-aroon" />,
    );
    const root = document.querySelector('[data-section="chart-line-aroon"]');
    expect(root?.className).toContain('custom-aroon');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('exposes the final readings in the legend stats', () => {
    render(<ChartLineAroon data={AROON_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-aroon-legend-stats"]',
      )?.textContent,
    ).toContain('up 75 / down 100');
  });
});
