import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineCci,
  getLineCciFinitePoints,
  normalizeLineCciPeriod,
  computeLineCci,
  runLineCci,
  computeLineCciLayout,
  describeLineCciChart,
  DEFAULT_CHART_LINE_CCI_PERIOD,
  type ChartLineCciPoint,
} from './chart-line-cci';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,12,14,13,20,8,11], period 4.
 * CCI = (value - SMA) / (0.015 * meanAbsoluteDeviation):
 *
 *   i=3 window [10,12,14,13]: SMA 12.25, meanDev 1.25
 *       -> (13-12.25)/(0.015*1.25)   = 0.75/0.01875   = 40
 *   i=4 window [12,14,13,20]: SMA 14.75, meanDev 2.625
 *       -> (20-14.75)/(0.015*2.625)  = 5.25/0.039375  = 133.3333
 *   i=5 window [14,13,20,8] : SMA 13.75, meanDev 3.25
 *       -> (8-13.75)/(0.015*3.25)    = -5.75/0.04875  = -117.9487
 *   i=6 window [13,20,8,11] : SMA 13,    meanDev 3.5
 *       -> (11-13)/(0.015*3.5)       = -2/0.0525      = -38.0952
 *
 * cci = [.,.,.,40, 133.3333, -117.9487, -38.0952]
 * cci[4] > +100 -> overbought; cci[5] < -100 -> oversold.
 * cciFinal ~ -38.0952, overboughtCount 1, oversoldCount 1.
 */
const CCI_DATA: ChartLineCciPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 12 },
  { x: 2, value: 14 },
  { x: 3, value: 13 },
  { x: 4, value: 20 },
  { x: 5, value: 8 },
  { x: 6, value: 11 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineCciFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineCciFinitePoints(CCI_DATA)).toHaveLength(7);
  });

  it('returns empty for null input', () => {
    expect(getLineCciFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineCciFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineCciFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineCciFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 12 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineCciPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineCciPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineCciPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineCciPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineCciPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineCciPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineCci', () => {
  it('computes the first CCI from the simple mean and mean deviation', () => {
    expect(computeLineCci([10, 12, 14, 13, 20, 8, 11], 4)[3]).toBe(40);
  });

  it('computes an overbought CCI above +100', () => {
    expect(computeLineCci([10, 12, 14, 13, 20, 8, 11], 4)[4]!).toBeCloseTo(
      133.3333,
      3,
    );
  });

  it('computes an oversold CCI below -100', () => {
    expect(computeLineCci([10, 12, 14, 13, 20, 8, 11], 4)[5]!).toBeCloseTo(
      -117.9487,
      3,
    );
  });

  it('computes the final CCI', () => {
    expect(computeLineCci([10, 12, 14, 13, 20, 8, 11], 4)[6]!).toBeCloseTo(
      -38.0952,
      3,
    );
  });

  it('leaves entries null before the window fills', () => {
    const cci = computeLineCci([10, 12, 14, 13, 20, 8, 11], 4);
    expect(cci[0]).toBeNull();
    expect(cci[1]).toBeNull();
    expect(cci[2]).toBeNull();
  });

  it('reads 0 for a flat window (zero mean deviation)', () => {
    expect(computeLineCci([5, 5, 5, 5, 5], 4)).toEqual([
      null, null, null, 0, 0,
    ]);
  });

  it('returns all null when the series is shorter than the period', () => {
    expect(computeLineCci([10, 12, 14], 4)).toEqual([null, null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineCci(null, 4)).toEqual([]);
  });

  it('produces a defined reading from the period-th index onward', () => {
    const cci = computeLineCci([10, 12, 14, 13, 20, 8, 11], 4);
    expect(cci[3]).not.toBeNull();
  });

  it('clamps a sub-1 period to 1', () => {
    expect(computeLineCci([10, 12, 14], 0).some((v) => v !== null)).toBe(true);
  });

  it('can exceed the +/-100 band (CCI is unbounded)', () => {
    const cci = computeLineCci([10, 12, 14, 13, 20, 8, 11], 4);
    expect(cci[4]!).toBeGreaterThan(100);
    expect(cci[5]!).toBeLessThan(-100);
  });
});

describe('runLineCci', () => {
  it('marks ok for a valid series', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineCci([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineCci([]).ok).toBe(false);
  });

  it('computes the CCI series', () => {
    const run = runLineCci(CCI_DATA, { period: 4 });
    expect(run.cci[3]).toBe(40);
    expect(run.cci[4]!).toBeCloseTo(133.3333, 3);
  });

  it('reports the final CCI', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).cciFinal).toBeCloseTo(
      -38.0952,
      3,
    );
  });

  it('classifies an overbought reading', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).samples[4]!.zone).toBe(
      'overbought',
    );
  });

  it('classifies an oversold reading', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).samples[5]!.zone).toBe(
      'oversold',
    );
  });

  it('classifies a mid-band reading as neutral', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).samples[3]!.zone).toBe(
      'neutral',
    );
  });

  it('counts the overbought and oversold readings', () => {
    const run = runLineCci(CCI_DATA, { period: 4 });
    expect(run.overboughtCount).toBe(1);
    expect(run.oversoldCount).toBe(1);
  });

  it('emits one sample per point', () => {
    expect(runLineCci(CCI_DATA, { period: 4 }).samples).toHaveLength(7);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineCci(
      [
        { x: 6, value: 11 },
        { x: 0, value: 10 },
        { x: 4, value: 20 },
        { x: 1, value: 12 },
        { x: 5, value: 8 },
        { x: 2, value: 14 },
        { x: 3, value: 13 },
      ],
      { period: 4 },
    );
    expect(run.cci[3]).toBe(40);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineCci(CCI_DATA).period).toBe(DEFAULT_CHART_LINE_CCI_PERIOD);
  });

  it('honours custom overbought and oversold thresholds', () => {
    const run = runLineCci(CCI_DATA, {
      period: 4,
      overbought: 30,
      oversold: -30,
    });
    expect(run.samples[3]!.zone).toBe('overbought');
  });
});

describe('computeLineCciLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineCciLayout({ data: CCI_DATA, period: 4, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineCciLayout({
      data: [{ x: 0, value: 1 }],
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the CCI panel', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.cciPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(4);
  });

  it('reports the final CCI and extreme counts', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.cciFinal).toBeCloseTo(-38.0952, 3);
    expect(layout.overboughtCount).toBe(1);
    expect(layout.oversoldCount).toBe(1);
  });

  it('reports the total point count', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(7);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(7);
  });

  it('emits a marker only where the CCI is defined', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.markers).toHaveLength(4);
  });

  it('builds a non-empty CCI path', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.cciPath.startsWith('M')).toBe(true);
  });

  it('sets the symmetric y-bound to the largest CCI magnitude', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.cciYBound).toBeCloseTo(133.3333, 2);
  });

  it('defaults the thresholds to +100 and -100', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.overbought).toBe(100);
    expect(layout.oversold).toBe(-100);
  });

  it('places the overbought level above the oversold level', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtY).toBeLessThan(layout.oversoldY);
  });

  it('gives the extreme zones a positive height', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.overboughtZone.height).toBeGreaterThan(0);
    expect(layout.oversoldZone.height).toBeGreaterThan(0);
  });

  it('places the zero line inside the CCI panel', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      ...LAYOUT_OPTS,
    });
    expect(layout.zeroY).toBeGreaterThan(layout.cciPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.cciPanel.y + layout.cciPanel.height,
    );
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineCciLayout({
      data: CCI_DATA,
      period: 4,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCciChart', () => {
  it('mentions the Commodity Channel Index', () => {
    expect(describeLineCciChart(CCI_DATA, { period: 4 })).toContain(
      'Commodity Channel Index',
    );
  });

  it('mentions the oscillator panel', () => {
    expect(describeLineCciChart(CCI_DATA, { period: 4 })).toContain(
      'oscillator',
    );
  });

  it('mentions overbought and oversold', () => {
    const text = describeLineCciChart(CCI_DATA, { period: 4 });
    expect(text).toContain('overbought');
    expect(text).toContain('oversold');
  });

  it('reports the period', () => {
    expect(describeLineCciChart(CCI_DATA, { period: 4 })).toContain(
      'period 4',
    );
  });

  it('reports the extreme counts', () => {
    expect(describeLineCciChart(CCI_DATA, { period: 4 })).toContain(
      '1 overbought and 1 oversold across 7 periods',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineCciChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineCci />', () => {
  it('renders the root region', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-cci"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineCci data={[{ x: 0, value: 1 }]} period={4} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.getAttribute('data-period')).toBe('4');
  });

  it('exposes the extreme counts as data attributes', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.getAttribute('data-overbought-count')).toBe('1');
    expect(root?.getAttribute('data-oversold-count')).toBe('1');
  });

  it('renders an accessible description', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const desc = document.querySelector(
      '[data-section="chart-line-cci-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Commodity Channel Index');
  });

  it('renders the value path', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the CCI line', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-cci-line"]'),
    ).toBeTruthy();
  });

  it('renders one marker per defined CCI value', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cci-marker"]'),
    ).toHaveLength(4);
  });

  it('tags markers with their zone', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cci-marker"]',
    );
    const overbought = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    );
    const oversold = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '5',
    );
    expect(overbought?.getAttribute('data-zone')).toBe('overbought');
    expect(oversold?.getAttribute('data-zone')).toBe('oversold');
  });

  it('renders both extreme zone rectangles', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cci-zone"]'),
    ).toHaveLength(2);
  });

  it('hides the zones when showZones is false', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} showZones={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-zone"]'),
    ).toBeNull();
  });

  it('renders the zero line', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const labels = Array.from(
      document.querySelectorAll('[data-section="chart-line-cci-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('CCI');
  });

  it('renders the config badge with period and extreme count', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-badge-period"]',
      )?.textContent,
    ).toBe('p=4');
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-badge-extremes"]',
      )?.textContent,
    ).toBe('ext=2');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cci-legend-item"]'),
    ).toHaveLength(2);
  });

  it('toggles the CCI series off via the legend', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const cciItem = document.querySelector(
      '[data-section="chart-line-cci-legend-item"][data-series-id="cci"]',
    ) as HTMLElement;
    fireEvent.click(cciItem);
    expect(cciItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-cci-cci-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineCci data={CCI_DATA} period={4} onSeriesToggle={onSeriesToggle} />,
    );
    const valueItem = document.querySelector(
      '[data-section="chart-line-cci-legend-item"][data-series-id="value"]',
    ) as HTMLElement;
    fireEvent.click(valueItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'value',
      hidden: true,
    });
  });

  it('hides the CCI line when showCci is false', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} showCci={false} />);
    expect(
      document.querySelector('[data-section="chart-line-cci-cci-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-cci-dot"]'),
    ).toHaveLength(7);
  });

  it('shows a tooltip when a marker is hovered', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cci-marker"]',
    );
    const m3 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(m3);
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-tooltip-cci"]',
      )?.textContent,
    ).toBe('cci: 40');
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: neutral');
  });

  it('reports the overbought zone in the tooltip', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-cci-marker"]',
    );
    const m4 = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(m4);
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-tooltip-zone"]',
      )?.textContent,
    ).toBe('zone: overbought');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const marker = document.querySelector(
      '[data-section="chart-line-cci-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-cci-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-cci-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineCci data={CCI_DATA} period={4} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-cci-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineCci ref={ref} data={CCI_DATA} period={4} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} className="custom-cci" />);
    const root = document.querySelector('[data-section="chart-line-cci"]');
    expect(root?.className).toContain('custom-cci');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('reports the extreme counts in the legend stats', () => {
    render(<ChartLineCci data={CCI_DATA} period={4} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-cci-legend-stats"]',
      )?.textContent,
    ).toContain('1 overbought, 1 oversold');
  });
});
