import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineMfi,
  getLineMfiFinitePoints,
  normalizeLineMfiPeriod,
  computeLineMfi,
  runLineMfi,
  computeLineMfiLayout,
  describeLineMfiChart,
  DEFAULT_CHART_LINE_MFI_PERIOD,
  type ChartLineMfiPoint,
} from './chart-line-mfi';

afterEach(() => cleanup());

/**
 * Canonical fixture. prices = [10,20,10,20,10,20],
 * volumes = [100,400,100,50,800,50], period 3.
 * Raw money flow = price * volume:
 *   rawFlow = [1000, 8000, 1000, 1000, 8000, 1000]
 * Each flow is positive on an up close, negative on a down close:
 *   posMF = [0, 8000, 0,    1000, 0,    1000]
 *   negMF = [0, 0,    1000, 0,    8000, 0]
 * MFI = 100 * positiveFlow / (positiveFlow + negativeFlow) over a
 * trailing window of 3:
 *   i=3 window 1..3: pos 9000, neg 1000 -> 100*9000/10000 = 90
 *   i=4 window 2..4: pos 1000, neg 9000 -> 100*1000/10000 = 10
 *   i=5 window 3..5: pos 2000, neg 8000 -> 100*2000/10000 = 20
 * mfi = [.,.,.,90, 10, 20]. mfi[3] overbought, mfi[4] oversold.
 */
const MFI_DATA: ChartLineMfiPoint[] = [
  { x: 0, price: 10, volume: 100 },
  { x: 1, price: 20, volume: 400 },
  { x: 2, price: 10, volume: 100 },
  { x: 3, price: 20, volume: 50 },
  { x: 4, price: 10, volume: 800 },
  { x: 5, price: 20, volume: 50 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineMfiFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineMfiFinitePoints(MFI_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineMfiFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineMfiFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite price', () => {
    const out = getLineMfiFinitePoints([
      { x: 0, price: 10, volume: 100 },
      { x: 1, price: NaN, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite volume', () => {
    const out = getLineMfiFinitePoints([
      { x: 0, price: 10, volume: Infinity },
      { x: 1, price: 20, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineMfiFinitePoints([
      { x: NaN, price: 10, volume: 100 },
      { x: 1, price: 20, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineMfiPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineMfiPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineMfiPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineMfiPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineMfiPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineMfiPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineMfi', () => {
  it('computes the MFI series for the fixture', () => {
    expect(
      computeLineMfi(
        [10, 20, 10, 20, 10, 20],
        [100, 400, 100, 50, 800, 50],
        3,
      ),
    ).toEqual([null, null, null, 90, 10, 20]);
  });

  it('computes an overbought MFI above 80', () => {
    expect(
      computeLineMfi(
        [10, 20, 10, 20, 10, 20],
        [100, 400, 100, 50, 800, 50],
        3,
      )[3],
    ).toBe(90);
  });

  it('computes an oversold MFI below 20', () => {
    expect(
      computeLineMfi(
        [10, 20, 10, 20, 10, 20],
        [100, 400, 100, 50, 800, 50],
        3,
      )[4],
    ).toBe(10);
  });

  it('leaves entries null before the window fills', () => {
    const mfi = computeLineMfi(
      [10, 20, 10, 20, 10, 20],
      [100, 400, 100, 50, 800, 50],
      3,
    );
    expect(mfi[0]).toBeNull();
    expect(mfi[2]).toBeNull();
  });

  it('reads 50 for a flat price series (no directional flow)', () => {
    expect(computeLineMfi([5, 5, 5, 5], [100, 100, 100, 100], 3)).toEqual([
      null, null, null, 50,
    ]);
  });

  it('reads 50 when every volume is zero', () => {
    expect(computeLineMfi([10, 20, 10, 20], [0, 0, 0, 0], 3)[3]).toBe(50);
  });

  it('returns all null when the series is shorter than period + 1', () => {
    expect(computeLineMfi([10, 20, 10], [100, 100, 100], 3)).toEqual([
      null, null, null,
    ]);
  });

  it('returns empty for a non-array price input', () => {
    expect(computeLineMfi(null, [100, 200], 3)).toEqual([]);
  });

  it('returns empty for a non-array volume input', () => {
    expect(computeLineMfi([10, 20], null, 3)).toEqual([]);
  });

  it('keeps every defined reading within 0 and 100', () => {
    const mfi = computeLineMfi(
      [10, 20, 10, 20, 10, 20],
      [100, 400, 100, 50, 800, 50],
      3,
    );
    for (const v of mfi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('weights each move by its volume', () => {
    // Heavy volume on the up bar (index 1) lifts MFI; the same heavy
    // volume on the down bar (index 2) pushes MFI down instead.
    const heavyUp = computeLineMfi(
      [10, 20, 10, 20],
      [100, 1000, 100, 100],
      3,
    )[3]!;
    const heavyDown = computeLineMfi(
      [10, 20, 10, 20],
      [100, 100, 1000, 100],
      3,
    )[3]!;
    expect(heavyUp).toBeGreaterThan(heavyDown);
  });
});

describe('runLineMfi', () => {
  it('marks ok for a valid series', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineMfi([{ x: 0, price: 1, volume: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineMfi([]).ok).toBe(false);
  });

  it('computes the MFI series', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).mfi).toEqual([
      null, null, null, 90, 10, 20,
    ]);
  });

  it('reports the final MFI', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).mfiFinal).toBe(20);
  });

  it('classifies an overbought reading', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).samples[3]!.zone).toBe(
      'overbought',
    );
  });

  it('classifies an oversold reading', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).samples[4]!.zone).toBe(
      'oversold',
    );
  });

  it('classifies a mid-band reading as neutral', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).samples[5]!.zone).toBe(
      'neutral',
    );
  });

  it('counts the overbought and oversold readings', () => {
    const run = runLineMfi(MFI_DATA, { period: 3 });
    expect(run.overboughtCount).toBe(1);
    expect(run.oversoldCount).toBe(1);
  });

  it('emits one sample per point', () => {
    expect(runLineMfi(MFI_DATA, { period: 3 }).samples).toHaveLength(6);
  });

  it('carries price and volume onto each sample', () => {
    const s = runLineMfi(MFI_DATA, { period: 3 }).samples[3]!;
    expect(s.price).toBe(20);
    expect(s.volume).toBe(50);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineMfi(
      [
        { x: 5, price: 20, volume: 50 },
        { x: 0, price: 10, volume: 100 },
        { x: 3, price: 20, volume: 50 },
        { x: 1, price: 20, volume: 400 },
        { x: 4, price: 10, volume: 800 },
        { x: 2, price: 10, volume: 100 },
      ],
      { period: 3 },
    );
    expect(run.mfi).toEqual([null, null, null, 90, 10, 20]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineMfi(MFI_DATA).period).toBe(DEFAULT_CHART_LINE_MFI_PERIOD);
  });
});

describe('computeLineMfiLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineMfiLayout({ data: MFI_DATA, period: 3, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineMfiLayout({
      data: [{ x: 0, price: 1, volume: 1 }],
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the price panel above the MFI panel', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.mfiPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(3);
  });

  it('reports the final MFI and extreme counts', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.mfiFinal).toBe(20);
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one price dot per point', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits a marker only where the MFI is defined', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(3);
  });

  it('builds a non-empty MFI path', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.mfiPath.startsWith('M')).toBe(true);
  });

  it('builds a fixed 0-100 MFI y-axis', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.mfiYTicks[0]!.value).toBe(0);
    expect(layout.mfiYTicks[layout.mfiYTicks.length - 1]!.value).toBe(100);
  });

  it('defaults the thresholds to 80 and 20', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overbought).toBe(80);
    expect(layout.oversold).toBe(20);
  });

  it('places the overbought level above the oversold level', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('gives the extreme zones a positive height', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtZone.height).toBeGreaterThan(0);
    expect(layout.oversoldZone.height).toBeGreaterThan(0);
  });

  it('keeps markers inside the MFI panel', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.markers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.mfiPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.mfiPanel.y + layout.mfiPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineMfiLayout({
      data: MFI_DATA,
      period: 3,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineMfiChart', () => {
  it('mentions the Money Flow Index', () => {
    expect(describeLineMfiChart(MFI_DATA, { period: 3 })).toContain(
      'Money Flow Index',
    );
  });

  it('mentions that it is volume-weighted', () => {
    expect(describeLineMfiChart(MFI_DATA, { period: 3 })).toContain('volume');
  });

  it('mentions overbought and oversold', () => {
    const text = describeLineMfiChart(MFI_DATA, { period: 3 });
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the period', () => {
    expect(describeLineMfiChart(MFI_DATA, { period: 3 })).toContain(
      'period 3',
    );
  });

  it('reports the extreme counts', () => {
    expect(describeLineMfiChart(MFI_DATA, { period: 3 })).toContain(
      '1 overbought and 1 oversold across 6 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineMfiChart([{ x: 0, price: 1, volume: 1 }])).toBe(
      'No data',
    );
  });
});

describe('<ChartLineMfi />', () => {
  it('renders the root region', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineMfi data={[{ x: 0, price: 1, volume: 1 }]} period={3} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.getAttribute('data-period')).toBe('3');
  });

  it('exposes the extreme counts as data attributes', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.getAttribute('data-overbought-count')).toBe('1');
    expect(root?.getAttribute('data-oversold-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const desc = document.querySelector(
      '[data-section="chart-line-mfi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Money Flow Index');
  });

  it('renders the value path', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the MFI line', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi-mfi-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined MFI value', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mfi-marker"]'),
    ).toHaveLength(3);
  });

  it('tags markers with their zone', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-mfi-marker"]',
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
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mfi-zone"]'),
    ).toHaveLength(2);
  });

  it('hides the zones when showZones is false', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} showZones={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi-zone"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-mfi-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('MFI');
  });

  it('renders the config badge with period and extreme count', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-badge-period"]',
      )?.textContent,
    ).toBe('p=3');
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-badge-extremes"]',
      )?.textContent,
    ).toBe('ext=2');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mfi-legend-item"]'),
    ).toHaveLength(2);
  });

  it('toggles the MFI series off via the legend', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const mfiItem = document.querySelector(
      '[data-section="chart-line-mfi-legend-item"][data-series-id="mfi"]',
    ) as HTMLElement;
    fireEvent.click(mfiItem);
    expect(mfiItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-mfi-mfi-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineMfi data={MFI_DATA} period={3} onSeriesToggle={onSeriesToggle} />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-mfi-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the MFI line when showMfi is false', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} showMfi={false} />);
    expect(
      document.querySelector('[data-section="chart-line-mfi-mfi-line"]'),
    ).toBeNull();
  });

  it('renders price dots when showDots is true', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-mfi-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-mfi-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-tooltip-mfi"]',
      )?.textContent,
    ).toBe('mfi: 90');
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: overbought');
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-tooltip-volume"]',
      )?.textContent,
    ).toBe('volume: 50');
  });

  it('reports the oversold zone in the tooltip', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-mfi-marker"]',
    );
    const m4 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(m4);
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: oversold');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const marker = document.querySelector(
      '[data-section="chart-line-mfi-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-mfi-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-mfi-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineMfi data={MFI_DATA} period={3} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-mfi-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineMfi ref={ref} data={MFI_DATA} period={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} className="custom-mfi" />);
    const root = document.querySelector('[data-section="chart-line-mfi"]');
    expect(root?.className).toContain('custom-mfi');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the extreme counts in the legend stats', () => {
    render(<ChartLineMfi data={MFI_DATA} period={3} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-mfi-legend-stats"]',
      )?.textContent,
    ).toContain('1 overbought, 1 oversold');
  });
});
