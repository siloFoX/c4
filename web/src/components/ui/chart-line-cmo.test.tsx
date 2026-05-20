import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineCmo,
  getLineCmoFinitePoints,
  normalizeLineCmoPeriod,
  computeLineCmoChanges,
  computeLineCmo,
  runLineCmo,
  computeLineCmoLayout,
  describeLineCmoChart,
  DEFAULT_CHART_LINE_CMO_PERIOD,
  type ChartLineCmoPoint,
} from './chart-line-cmo';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,18,17,18,10,21], period 3.
 * Per-period changes -> up / down:
 *   +8 / 0, -1 / 1, +1 / 0, -8 / 8, +11 / 0
 * CMO = 100 * (sumUp - sumDown) / (sumUp + sumDown) over a window
 * of 3 changes:
 *   i=3 window 1..3: up 9, down 1  -> 100*(9-1)/10  = 80
 *   i=4 window 2..4: up 1, down 9  -> 100*(1-9)/10  = -80
 *   i=5 window 3..5: up 12, down 8 -> 100*(12-8)/20 = 20
 * cmo = [.,.,.,80, -80, 20]. cmo[3] overbought, cmo[4] oversold.
 */
const CMO_DATA: ChartLineCmoPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 18 },
  { x: 2, value: 17 },
  { x: 3, value: 18 },
  { x: 4, value: 10 },
  { x: 5, value: 21 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineCmoFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineCmoFinitePoints(CMO_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineCmoFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineCmoFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineCmoFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineCmoFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 18 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineCmoPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineCmoPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineCmoPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineCmoPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineCmoPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineCmoPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineCmoChanges', () => {
  it('computes the per-period gains', () => {
    expect(computeLineCmoChanges([10, 18, 17, 18, 10, 21]).up).toEqual([
      null, 8, 0, 1, 0, 11,
    ]);
  });

  it('computes the per-period losses', () => {
    expect(computeLineCmoChanges([10, 18, 17, 18, 10, 21]).down).toEqual([
      null, 0, 1, 0, 8, 0,
    ]);
  });

  it('reads null at index 0 for both series', () => {
    const c = computeLineCmoChanges([10, 18]);
    expect(c.up[0]).toBeNull();
    expect(c.down[0]).toBeNull();
  });

  it('keeps gains and losses mutually exclusive', () => {
    const c = computeLineCmoChanges([10, 18, 17, 18, 10, 21]);
    for (let i = 1; i < 6; i += 1) {
      expect(c.up[i]! * c.down[i]!).toBe(0);
    }
  });

  it('keeps gains and losses non-negative', () => {
    const c = computeLineCmoChanges([10, 18, 17, 18, 10, 21]);
    for (let i = 1; i < 6; i += 1) {
      expect(c.up[i]!).toBeGreaterThanOrEqual(0);
      expect(c.down[i]!).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty arrays for a non-array', () => {
    expect(computeLineCmoChanges(null).up).toEqual([]);
  });
});

describe('computeLineCmo', () => {
  it('computes the CMO series for the fixture', () => {
    expect(computeLineCmo([10, 18, 17, 18, 10, 21], 3)).toEqual([
      null, null, null, 80, -80, 20,
    ]);
  });

  it('computes an overbought CMO above +50', () => {
    expect(computeLineCmo([10, 18, 17, 18, 10, 21], 3)[3]).toBe(80);
  });

  it('computes an oversold CMO below -50', () => {
    expect(computeLineCmo([10, 18, 17, 18, 10, 21], 3)[4]).toBe(-80);
  });

  it('leaves entries null before the window fills', () => {
    const cmo = computeLineCmo([10, 18, 17, 18, 10, 21], 3);
    expect(cmo[0]).toBeNull();
    expect(cmo[2]).toBeNull();
  });

  it('reads +100 for a strictly rising series', () => {
    expect(computeLineCmo([1, 2, 3, 4], 3)).toEqual([null, null, null, 100]);
  });

  it('reads -100 for a strictly falling series', () => {
    expect(computeLineCmo([4, 3, 2, 1], 3)).toEqual([
      null, null, null, -100,
    ]);
  });

  it('reads 0 for a flat series without dividing by zero', () => {
    expect(computeLineCmo([5, 5, 5, 5], 3)).toEqual([null, null, null, 0]);
  });

  it('returns all null when the series is shorter than period + 1', () => {
    expect(computeLineCmo([10, 18, 17], 3)).toEqual([null, null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineCmo(null, 3)).toEqual([]);
  });

  it('keeps every defined reading within -100 and 100', () => {
    const cmo = computeLineCmo([10, 18, 17, 18, 10, 21], 3);
    for (const v of cmo) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineCmo([10, 18, 17], 0).some((v) => v !== null)).toBe(true);
  });
});

describe('runLineCmo', () => {
  it('marks ok for a valid series', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineCmo([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineCmo([]).ok).toBe(false);
  });

  it('computes the CMO series', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).cmo).toEqual([
      null, null, null, 80, -80, 20,
    ]);
  });

  it('reports the final CMO', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).cmoFinal).toBe(20);
  });

  it('classifies an overbought reading', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).samples[3]!.zone).toBe(
      'overbought',
    );
  });

  it('classifies an oversold reading', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).samples[4]!.zone).toBe(
      'oversold',
    );
  });

  it('classifies a mid-band reading as neutral', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).samples[5]!.zone).toBe(
      'neutral',
    );
  });

  it('counts the overbought and oversold readings', () => {
    const run = runLineCmo(CMO_DATA, { period: 3 });
    expect(run.overboughtCount).toBe(1);
    expect(run.oversoldCount).toBe(1);
  });

  it('emits one sample per point', () => {
    expect(runLineCmo(CMO_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineCmo(
      [
        { x: 5, value: 21 },
        { x: 0, value: 10 },
        { x: 3, value: 18 },
        { x: 1, value: 18 },
        { x: 4, value: 10 },
        { x: 2, value: 17 },
      ],
      { period: 3 },
    );
    expect(run.cmo).toEqual([null, null, null, 80, -80, 20]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineCmo(CMO_DATA).period).toBe(DEFAULT_CHART_LINE_CMO_PERIOD);
  });

  it('honours custom overbought and oversold thresholds', () => {
    const run = runLineCmo(CMO_DATA, {
      period: 3,
      overbought: 10,
      oversold: -10,
    });
    expect(run.samples[5]!.zone).toBe('overbought');
  });
});

describe('computeLineCmoLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineCmoLayout({ data: CMO_DATA, period: 3, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineCmoLayout({
      data: [{ x: 0, value: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the CMO panel', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.cmoPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
  });

  it('reports the final CMO and extreme counts', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.cmoFinal).toBe(20);
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the CMO is defined', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(3);
  });

  it('builds a non-empty CMO path', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.cmoPath.startsWith('M')).toBe(true);
  });

  it('builds a fixed -100 to 100 CMO y-axis', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.cmoYTicks[0]!.value).toBe(-100);
    expect(layout.cmoYTicks[layout.cmoYTicks.length - 1]!.value).toBe(100);
  });

  it('defaults the thresholds to +50 and -50', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overbought).toBe(50);
    expect(layout.oversold).toBe(-50);
  });

  it('places the overbought level above the oversold level', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('gives the extreme zones a positive height', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtZone.height).toBeGreaterThan(0);
    expect(layout.oversoldZone.height).toBeGreaterThan(0);
  });

  it('places the zero line inside the CMO panel', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.cmoPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.cmoPanel.y + layout.cmoPanel.height,
    );
  });

  it('keeps markers inside the CMO panel', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.cmoPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.cmoPanel.y + layout.cmoPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineCmoLayout({
      data: CMO_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCmoChart', () => {
  it('mentions the Chande Momentum Oscillator', () => {
    expect(describeLineCmoChart(CMO_DATA, { period: 3 })).toContain(
      'Chande Momentum Oscillator',
    );
  });

  it('mentions gains and losses', () => {
    const text = describeLineCmoChart(CMO_DATA, { period: 3 });
    expect(text).toContain('gains');
    expect(text).toContain('losses');
  });

  it('mentions overbought and oversold', () => {
    const text = describeLineCmoChart(CMO_DATA, { period: 3 });
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the period', () => {
    expect(describeLineCmoChart(CMO_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('reports the extreme counts', () => {
    expect(describeLineCmoChart(CMO_DATA, { period: 3 })).toContain(
      '1 overbought and 1 oversold across 6 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineCmoChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineCmo />', () => {
  it('renders the root region', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineCmo data={[{ x: 0, value: 1 }]} period={3} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.getAttribute('data-period')).toBe('3');
  });

  it('exposes the extreme counts as data attributes', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.getAttribute('data-overbought-count')).toBe('1');
    expect(root?.getAttribute('data-oversold-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-cmo-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Chande Momentum Oscillator');
  });

  it('renders the value path', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the CMO line', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-cmo-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined CMO value', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cmo-marker"]'),
    ).toHaveLength(3);
  });

  it('tags markers with their zone', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cmo-marker"]',
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
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cmo-zone"]'),
    ).toHaveLength(2);
  });

  it('hides the zones when showZones is false', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} showZones={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-zone"]'),
    ).toBeNull();
  });

  it('renders the zero line', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-cmo-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('CMO');
  });

  it('renders the config badge with period and extreme count', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-badge-extremes"]',
      )?.textContent,
    ).toBe('ext=2');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cmo-legend-item"]'),
    ).toHaveLength(2);
  });

  it('toggles the CMO series off via the legend', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const cmoItem = document.querySelector(
      '[data-section="chart-line-cmo-legend-item"][data-series-id="cmo"]',
    ) as HTMLElement;
    fireEvent.click(cmoItem);
    expect(cmoItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-cmo-cmo-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineCmo data={CMO_DATA} period={3} onSeriesToggle={onSeriesToggle} />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-cmo-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the CMO line when showCmo is false', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} showCmo={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cmo-cmo-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cmo-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cmo-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-tooltip-cmo"]',
      )?.textContent,
    ).toBe('cmo: 80');
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: overbought');
  });

  it('reports the oversold zone in the tooltip', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cmo-marker"]',
    );
    const m4 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(m4);
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: oversold');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-cmo-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-cmo-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-cmo-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineCmo data={CMO_DATA} period={3} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-cmo-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCmo ref={ref} data={CMO_DATA} period={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} className="custom-cmo" />);
    const root = document.querySelector('[data-section="chart-line-cmo"]');
    expect(root?.className).toContain('custom-cmo');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the extreme counts in the legend stats', () => {
    render(<ChartLineCmo data={CMO_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cmo-legend-stats"]',
      )?.textContent,
    ).toContain('1 overbought, 1 oversold');
  });
});
