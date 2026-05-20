import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineAtr,
  getLineAtrFinitePoints,
  normalizeLineAtrPeriod,
  computeLineAtrTrueRanges,
  computeLineAtr,
  runLineAtr,
  computeLineAtrLayout,
  describeLineAtrChart,
  DEFAULT_CHART_LINE_ATR_PERIOD,
  type ChartLineAtrPoint,
} from './chart-line-atr';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,20,30,20,40,30].
 * true range = [null,10,10,10,20,10].
 * ATR period 2:
 *   atr[2] = mean(tr[1],tr[2]) = mean(10,10) = 10
 *   atr[3] = (10*1 + 10)/2 = 10
 *   atr[4] = (10*1 + 20)/2 = 15
 *   atr[5] = (15*1 + 10)/2 = 12.5
 * atr = [null,null,10,10,15,12.5]. peak = 15. final = 12.5.
 */
const ATR_DATA: ChartLineAtrPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 20 },
  { x: 2, value: 30 },
  { x: 3, value: 20 },
  { x: 4, value: 40 },
  { x: 5, value: 30 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineAtrFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineAtrFinitePoints(ATR_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineAtrFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineAtrFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineAtrFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineAtrFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 20 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineAtrPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAtrPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineAtrPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineAtrPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineAtrPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineAtrPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineAtrTrueRanges', () => {
  it('computes period-over-period absolute change', () => {
    expect(computeLineAtrTrueRanges([10, 20, 30, 20, 40, 30])).toEqual([
      null, 10, 10, 10, 20, 10,
    ]);
  });

  it('returns null for index 0', () => {
    expect(computeLineAtrTrueRanges([5, 9])[0]).toBeNull();
  });

  it('returns absolute values regardless of direction', () => {
    expect(computeLineAtrTrueRanges([50, 30])[1]).toBe(20);
  });

  it('returns empty for non-array', () => {
    expect(computeLineAtrTrueRanges(null)).toEqual([]);
  });

  it('returns a single null for a one-element series', () => {
    expect(computeLineAtrTrueRanges([7])).toEqual([null]);
  });
});

describe('computeLineAtr', () => {
  it('computes the Wilder ATR for the fixture', () => {
    expect(computeLineAtr([10, 20, 30, 20, 40, 30], 2)).toEqual([
      null, null, 10, 10, 15, 12.5,
    ]);
  });

  it('seeds the first ATR with a simple mean', () => {
    const out = computeLineAtr([10, 20, 30, 20, 40, 30], 2);
    expect(out[2]).toBe(10);
  });

  it('applies Wilder smoothing after the seed', () => {
    const out = computeLineAtr([10, 20, 30, 20, 40, 30], 2);
    expect(out[4]).toBe(15);
    expect(out[5]).toBe(12.5);
  });

  it('returns all null when the series is shorter than period + 1', () => {
    expect(computeLineAtr([10, 20], 2)).toEqual([null, null]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineAtr(null, 2)).toEqual([]);
  });

  it('returns null entries before the window fills', () => {
    const out = computeLineAtr([10, 20, 30, 20, 40, 30], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
  });

  it('clamps a sub-1 period to 1', () => {
    const out = computeLineAtr([10, 20, 30], 0);
    expect(out[1]).not.toBeNull();
  });

  it('produces a non-negative ATR', () => {
    const out = computeLineAtr([10, 20, 30, 20, 40, 30], 2);
    for (const a of out) {
      if (a !== null) expect(a).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('runLineAtr', () => {
  it('marks ok for a valid series', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineAtr([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineAtr([]).ok).toBe(false);
  });

  it('computes the true range series', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).trueRange).toEqual([
      null, 10, 10, 10, 20, 10,
    ]);
  });

  it('computes the ATR series', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).atr).toEqual([
      null, null, 10, 10, 15, 12.5,
    ]);
  });

  it('reports the final ATR', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).atrFinal).toBe(12.5);
  });

  it('reports the peak ATR', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).atrMax).toBe(15);
  });

  it('emits one sample per point', () => {
    expect(runLineAtr(ATR_DATA, { period: 2 }).samples).toHaveLength(6);
  });

  it('carries true range and atr onto each sample', () => {
    const s = runLineAtr(ATR_DATA, { period: 2 }).samples[4]!;
    expect(s.trueRange).toBe(20);
    expect(s.atr).toBe(15);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineAtr(
      [
        { x: 5, value: 30 },
        { x: 0, value: 10 },
        { x: 2, value: 30 },
        { x: 1, value: 20 },
        { x: 4, value: 40 },
        { x: 3, value: 20 },
      ],
      { period: 2 },
    );
    expect(run.atr).toEqual([null, null, 10, 10, 15, 12.5]);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineAtr(ATR_DATA).period).toBe(DEFAULT_CHART_LINE_ATR_PERIOD);
  });
});

describe('computeLineAtrLayout', () => {
  it('is ok for a valid series', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.ok).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineAtrLayout({
      data: [{ x: 0, value: 1 }],
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the price panel above the ATR panel', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.pricePanel.y).toBeLessThan(layout.atrPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.period).toBe(2);
  });

  it('reports the final and peak ATR', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.atrFinal).toBe(12.5);
    expect(layout.atrMax).toBe(15);
  });

  it('reports the total point count', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.totalPoints).toBe(6);
  });

  it('sets atrYMax to the largest of ATR and true range', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.atrYMax).toBe(20);
  });

  it('emits one price dot per point', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits an ATR marker only where ATR is defined', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.atrMarkers).toHaveLength(4);
  });

  it('emits a true-range bar only where true range is defined', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.trueRangeBars).toHaveLength(5);
  });

  it('bottom-anchors the true-range bars to the ATR panel baseline', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    const baseline = layout.atrPanel.y + layout.atrPanel.height;
    for (const bar of layout.trueRangeBars) {
      expect(bar.by + bar.bh).toBeCloseTo(baseline, 3);
    }
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('builds a non-empty ATR path', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    expect(layout.atrPath.startsWith('M')).toBe(true);
  });

  it('keeps ATR markers inside the ATR panel', () => {
    const layout = computeLineAtrLayout({ data: ATR_DATA, period: 2, ...LAYOUT_OPTS });
    for (const m of layout.atrMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.atrPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.atrPanel.y + layout.atrPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineAtrLayout({
      data: ATR_DATA,
      period: 2,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAtrChart', () => {
  it('mentions the Average True Range', () => {
    expect(describeLineAtrChart(ATR_DATA, { period: 2 })).toContain(
      'Average True Range',
    );
  });

  it('mentions volatility', () => {
    expect(describeLineAtrChart(ATR_DATA, { period: 2 })).toContain(
      'volatility',
    );
  });

  it('reports the period', () => {
    expect(describeLineAtrChart(ATR_DATA, { period: 2 })).toContain(
      'period 2',
    );
  });

  it('reports the peak ATR', () => {
    expect(describeLineAtrChart(ATR_DATA, { period: 2 })).toContain('peak 15');
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineAtrChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineAtr />', () => {
  it('renders the root region', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-atr"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineAtr data={[{ x: 0, value: 1 }]} period={2} />);
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.getAttribute('data-period')).toBe('2');
  });

  it('renders an accessible description', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const desc = document.querySelector(
      '[data-section="chart-line-atr-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Average True Range');
  });

  it('renders the price path', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-atr-price-path"]'),
    ).toBeTruthy();
  });

  it('renders the ATR line', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-atr-atr-line"]'),
    ).toBeTruthy();
  });

  it('renders one ATR marker per defined value', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-atr-marker"]'),
    ).toHaveLength(4);
  });

  it('renders one true-range bar per defined value', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-atr-true-range-bar"]',
      ),
    ).toHaveLength(5);
  });

  it('renders both panel labels', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-atr-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('ATR');
  });

  it('renders the config badge with period and peak', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-badge-period"]',
      )?.textContent,
    ).toBe('p=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-badge-max"]',
      )?.textContent,
    ).toBe('max=15');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-atr-badge"]'),
    ).toBeNull();
  });

  it('renders three legend items', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-atr-legend-item"]',
      ),
    ).toHaveLength(3);
  });

  it('toggles a series off via the legend', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const atrItem = document.querySelector(
      '[data-section="chart-line-atr-legend-item"][data-series-id="atr"]',
    ) as HTMLElement;
    fireEvent.click(atrItem);
    expect(atrItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-atr-atr-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineAtr
        data={ATR_DATA}
        period={2}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const trItem = document.querySelector(
      '[data-section="chart-line-atr-legend-item"][data-series-id="truerange"]',
    ) as HTMLElement;
    fireEvent.click(trItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'truerange',
      hidden: true,
    });
  });

  it('hides the ATR line when showAtr is false', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} showAtr={false} />);
    expect(
      document.querySelector('[data-section="chart-line-atr-atr-line"]'),
    ).toBeNull();
  });

  it('hides the true-range bars when showTrueRange is false', () => {
    render(
      <ChartLineAtr data={ATR_DATA} period={2} showTrueRange={false} />,
    );
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-true-range-bar"]',
      ),
    ).toBeNull();
  });

  it('renders price dots when showDots is true', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-atr-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when an ATR marker is hovered', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-atr-marker"]',
    );
    const peak = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '4',
    ) as Element;
    fireEvent.mouseEnter(peak);
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-tooltip-atr"]',
      )?.textContent,
    ).toBe('atr: 15');
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-tooltip-true-range"]',
      )?.textContent,
    ).toBe('true range: 20');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const marker = document.querySelector(
      '[data-section="chart-line-atr-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-atr-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-atr-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when an ATR marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineAtr data={ATR_DATA} period={2} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-atr-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.className ?? '').not.toContain('motion-safe:animate-fade-in');
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAtr ref={ref} data={ATR_DATA} period={2} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineAtr data={ATR_DATA} period={2} className="custom-atr" />,
    );
    const root = document.querySelector('[data-section="chart-line-atr"]');
    expect(root?.className).toContain('custom-atr');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('exposes the final ATR in the legend stats', () => {
    render(<ChartLineAtr data={ATR_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-atr-legend-stats"]',
      )?.textContent,
    ).toContain('12.50');
  });
});
