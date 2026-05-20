import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineDpo,
  getLineDpoFinitePoints,
  normalizeLineDpoPeriod,
  computeLineDpoShift,
  computeLineDpo,
  runLineDpo,
  computeLineDpoLayout,
  describeLineDpoChart,
  DEFAULT_CHART_LINE_DPO_PERIOD,
  type ChartLineDpoPoint,
} from './chart-line-dpo';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [20,12,16,16,8,8], period 4.
 * The displacement is floor(4/2) + 1 = 3.
 * DPO[i] = value[i - 3] - SMA(4)[i]:
 *
 *   i=3 SMA mean(20,12,16,16)=16 -> 20 - 16 = 4
 *   i=4 SMA mean(12,16,16,8) =13 -> 12 - 13 = -1
 *   i=5 SMA mean(16,16,8,8)  =12 -> 16 - 12 = 4
 *
 * dpo = [.,.,.,4, -1, 4]. positiveCount 2, negativeCount 1,
 * dpoFinal 4. The displaced subtraction strips the trend and
 * leaves the cycle oscillating around zero.
 */
const DPO_DATA: ChartLineDpoPoint[] = [
  { x: 0, value: 20 },
  { x: 1, value: 12 },
  { x: 2, value: 16 },
  { x: 3, value: 16 },
  { x: 4, value: 8 },
  { x: 5, value: 8 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineDpoFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineDpoFinitePoints(DPO_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineDpoFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineDpoFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineDpoFinitePoints([
      { x: 0, value: 20 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineDpoFinitePoints([
      { x: NaN, value: 20 },
      { x: 1, value: 12 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineDpoPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineDpoPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineDpoPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineDpoPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineDpoPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineDpoPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineDpoShift', () => {
  it('computes floor(period/2) + 1 for an even period', () => {
    expect(computeLineDpoShift(4)).toBe(3);
  });

  it('computes the shift for the default period', () => {
    expect(computeLineDpoShift(20)).toBe(11);
  });

  it('computes the shift for an odd period', () => {
    expect(computeLineDpoShift(3)).toBe(2);
  });

  it('clamps a sub-1 period to 1 before computing', () => {
    expect(computeLineDpoShift(0)).toBe(1);
  });

  it('floors a fractional period before computing', () => {
    expect(computeLineDpoShift(7.8)).toBe(4);
  });
});

describe('computeLineDpo', () => {
  it('computes the DPO series for the fixture', () => {
    expect(computeLineDpo([20, 12, 16, 16, 8, 8], 4)).toEqual([
      null, null, null, 4, -1, 4,
    ]);
  });

  it('computes a positive DPO when the displaced price led the average', () => {
    expect(computeLineDpo([20, 12, 16, 16, 8, 8], 4)[3]).toBe(4);
  });

  it('computes a negative DPO when the displaced price trailed the average', () => {
    expect(computeLineDpo([20, 12, 16, 16, 8, 8], 4)[4]).toBe(-1);
  });

  it('leaves entries null before both windows are available', () => {
    const dpo = computeLineDpo([20, 12, 16, 16, 8, 8], 4);
    expect(dpo[0]).toBeNull();
    expect(dpo[2]).toBeNull();
  });

  it('reads 0 for a flat series', () => {
    expect(computeLineDpo([5, 5, 5, 5, 5, 5], 4)).toEqual([
      null, null, null, 0, 0, 0,
    ]);
  });

  it('returns all null when the series is too short', () => {
    expect(computeLineDpo([20, 12, 16], 4)).toEqual([null, null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineDpo(null, 4)).toEqual([]);
  });

  it('emits one DPO entry per value', () => {
    expect(computeLineDpo([20, 12, 16, 16, 8, 8], 4)).toHaveLength(6);
  });

  it('produces a defined reading from the start index onward', () => {
    expect(computeLineDpo([20, 12, 16, 16, 8, 8], 4)[3]).not.toBeNull();
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineDpo([20, 12, 16], 0).some((v) => v !== null)).toBe(true);
  });

  it('oscillates around zero (sum of cycle deviations stays moderate)', () => {
    const dpo = computeLineDpo([20, 12, 16, 16, 8, 8], 4);
    const defined = dpo.filter((v): v is number => v !== null);
    expect(Math.min(...defined)).toBeLessThan(0);
    expect(Math.max(...defined)).toBeGreaterThan(0);
  });
});

describe('runLineDpo', () => {
  it('marks ok for a valid series', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineDpo([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineDpo([]).ok).toBe(false);
  });

  it('computes the DPO series', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).dpo).toEqual([
      null, null, null, 4, -1, 4,
    ]);
  });

  it('reports the displacement shift', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).shift).toBe(3);
  });

  it('reports the final DPO', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).dpoFinal).toBe(4);
  });

  it('reports the DPO range', () => {
    const run = runLineDpo(DPO_DATA, { period: 4 });
    expect(run.dpoMin).toBe(-1);
    expect(run.dpoMax).toBe(4);
  });

  it('counts the readings above and below the zero line', () => {
    const run = runLineDpo(DPO_DATA, { period: 4 });
    expect(run.positiveCount).toBe(2);
    expect(run.negativeCount).toBe(1);
  });

  it('classifies each sample sign', () => {
    const run = runLineDpo(DPO_DATA, { period: 4 });
    expect(run.samples[3]!.sign).toBe('positive');
    expect(run.samples[4]!.sign).toBe('negative');
  });

  it('emits one sample per point', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).samples).toHaveLength(6);
  });

  it('carries the DPO onto each sample', () => {
    expect(runLineDpo(DPO_DATA, { period: 4 }).samples[3]!.dpo).toBe(4);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineDpo(
      [
        { x: 5, value: 8 },
        { x: 0, value: 20 },
        { x: 3, value: 16 },
        { x: 1, value: 12 },
        { x: 4, value: 8 },
        { x: 2, value: 16 },
      ],
      { period: 4 },
    );
    expect(run.dpo).toEqual([null, null, null, 4, -1, 4]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineDpo(DPO_DATA).period).toBe(DEFAULT_CHART_LINE_DPO_PERIOD);
  });
});

describe('computeLineDpoLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineDpoLayout({ data: DPO_DATA, period: 4, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineDpoLayout({
      data: [{ x: 0, value: 1 }],
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the DPO panel', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.dpoPanel.y);
  });

  it('reports the period and shift', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(4);
    expect(layout.shift).toBe(3);
  });

  it('reports the final DPO and counts', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.dpoFinal).toBe(4);
    expect(layout.positiveCount).toBe(2);
    expect(layout.negativeCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the DPO is defined', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(3);
  });

  it('tags each marker with its sign', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers.map((m) => m.sign)).toEqual([
      'positive', 'negative', 'positive',
    ]);
  });

  it('builds a non-empty DPO path', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.dpoPath.startsWith('M')).toBe(true);
  });

  it('sets the symmetric y-bound to the largest DPO magnitude', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.dpoYBound).toBe(4);
  });

  it('places the zero line inside the DPO panel', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.dpoPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.dpoPanel.y + layout.dpoPanel.height,
    );
  });

  it('keeps markers inside the DPO panel', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.dpoPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.dpoPanel.y + layout.dpoPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineDpoLayout({
      data: DPO_DATA,
      period: 4,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineDpoChart', () => {
  it('mentions the Detrended Price Oscillator', () => {
    expect(describeLineDpoChart(DPO_DATA, { period: 4 })).toContain(
      'Detrended Price Oscillator',
    );
  });

  it('mentions the displaced moving average', () => {
    const text = describeLineDpoChart(DPO_DATA, { period: 4 });
    expect(text).toContain('displaced');
    expect(text).toContain('moving average');
  });

  it('mentions cycles', () => {
    expect(describeLineDpoChart(DPO_DATA, { period: 4 })).toContain('cycles');
  });

  it('reports the period', () => {
    expect(describeLineDpoChart(DPO_DATA, { period: 4 })).toContain(
      'period 4',
    );
  });

  it('reports the zero-line counts', () => {
    expect(describeLineDpoChart(DPO_DATA, { period: 4 })).toContain(
      '2 above and 1 below the zero line across 6 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineDpoChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineDpo />', () => {
  it('renders the root region', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineDpo data={[{ x: 0, value: 1 }]} period={4} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period and shift as data attributes', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-shift')).toBe('3');
  });

  it('exposes the zero-line counts as data attributes', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.getAttribute('data-positive-count')).toBe('2');
    expect(root?.getAttribute('data-negative-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const desc = document.querySelector(
      '[data-section="chart-line-dpo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Detrended Price Oscillator');
  });

  it('renders the value path', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the DPO line', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-dpo-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined DPO value', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dpo-marker"]'),
    ).toHaveLength(3);
  });

  it('tags markers with their sign', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-dpo-marker"]',
    );
    const positive = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    );
    const negative = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    );
    expect(positive?.getAttribute('data-sign')).toBe('positive');
    expect(negative?.getAttribute('data-sign')).toBe('negative');
  });

  it('renders the zero line', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-dpo-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('DPO');
  });

  it('renders the config badge with period and shift', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-badge-period"]',
      )?.textContent,
    ).toBe('p=4');
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-badge-shift"]',
      )?.textContent,
    ).toBe('d=3');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dpo-legend-item"]'),
    ).toHaveLength(2);
  });

  it('toggles the DPO series off via the legend', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const dpoItem = document.querySelector(
      '[data-section="chart-line-dpo-legend-item"][data-series-id="dpo"]',
    ) as HTMLElement;
    fireEvent.click(dpoItem);
    expect(dpoItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-dpo-dpo-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineDpo data={DPO_DATA} period={4} onSeriesToggle={onSeriesToggle} />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-dpo-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the DPO line when showDpo is false', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} showDpo={false} />);
    expect(
      document.querySelector('[data-section="chart-line-dpo-dpo-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-dpo-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-dpo-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-tooltip-dpo"]',
      )?.textContent,
    ).toBe('dpo: 4');
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-tooltip-sign"]',
      )?.textContent,
    ).toBe('sign: positive');
  });

  it('reports a negative sign in the tooltip', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-dpo-marker"]',
    );
    const m4 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(m4);
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-tooltip-sign"]',
      )?.textContent,
    ).toBe('sign: negative');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const marker = document.querySelector(
      '[data-section="chart-line-dpo-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-dpo-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-dpo-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineDpo data={DPO_DATA} period={4} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-dpo-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineDpo ref={ref} data={DPO_DATA} period={4} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} className="custom-dpo" />);
    const root = document.querySelector('[data-section="chart-line-dpo"]');
    expect(root?.className).toContain('custom-dpo');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the zero-line counts in the legend stats', () => {
    render(<ChartLineDpo data={DPO_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-dpo-legend-stats"]',
      )?.textContent,
    ).toContain('2 above, 1 below');
  });
});
