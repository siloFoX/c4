import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineObv,
  getLineObvFinitePoints,
  computeLineObvDirections,
  computeLineObv,
  runLineObv,
  computeLineObvLayout,
  describeLineObvChart,
  type ChartLineObvPoint,
} from './chart-line-obv';

afterEach(() => cleanup());

/**
 * Canonical fixture. prices = [10,13,11,14,12,9],
 * volumes = [100,200,150,400,250,300].
 * OBV (starts at 0, +volume on up close, -volume on down close):
 *   obv[0] = 0
 *   obv[1] = 0   + 200 (13 > 10 up)   = 200
 *   obv[2] = 200 - 150 (11 < 13 down) = 50
 *   obv[3] = 50  + 400 (14 > 11 up)   = 450
 *   obv[4] = 450 - 250 (12 < 14 down) = 200
 *   obv[5] = 200 - 300 (9 < 12 down)  = -100
 * obv = [0,200,50,450,200,-100]. final = -100, min = -100, max = 450.
 * directions = [flat, up, down, up, down, down].
 */
const OBV_DATA: ChartLineObvPoint[] = [
  { x: 0, price: 10, volume: 100 },
  { x: 1, price: 13, volume: 200 },
  { x: 2, price: 11, volume: 150 },
  { x: 3, price: 14, volume: 400 },
  { x: 4, price: 12, volume: 250 },
  { x: 5, price: 9, volume: 300 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineObvFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineObvFinitePoints(OBV_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineObvFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineObvFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite price', () => {
    const out = getLineObvFinitePoints([
      { x: 0, price: 10, volume: 100 },
      { x: 1, price: NaN, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite volume', () => {
    const out = getLineObvFinitePoints([
      { x: 0, price: 10, volume: Infinity },
      { x: 1, price: 13, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineObvFinitePoints([
      { x: NaN, price: 10, volume: 100 },
      { x: 1, price: 13, volume: 200 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('computeLineObvDirections', () => {
  it('marks index 0 as flat', () => {
    expect(computeLineObvDirections([10, 13, 11])[0]).toBe('flat');
  });

  it('marks an up close', () => {
    expect(computeLineObvDirections([10, 13])[1]).toBe('up');
  });

  it('marks a down close', () => {
    expect(computeLineObvDirections([13, 10])[1]).toBe('down');
  });

  it('marks an unchanged close as flat', () => {
    expect(computeLineObvDirections([10, 10])[1]).toBe('flat');
  });

  it('computes the fixture directions', () => {
    expect(computeLineObvDirections([10, 13, 11, 14, 12, 9])).toEqual([
      'flat', 'up', 'down', 'up', 'down', 'down',
    ]);
  });

  it('returns empty for a non-array', () => {
    expect(computeLineObvDirections(null)).toEqual([]);
  });
});

describe('computeLineObv', () => {
  it('computes the cumulative OBV for the fixture', () => {
    expect(
      computeLineObv([10, 13, 11, 14, 12, 9], [100, 200, 150, 400, 250, 300]),
    ).toEqual([0, 200, 50, 450, 200, -100]);
  });

  it('starts the running total at zero', () => {
    expect(
      computeLineObv([10, 13], [100, 200])[0],
    ).toBe(0);
  });

  it('adds volume on an up close', () => {
    expect(computeLineObv([1, 2, 3], [10, 20, 30])).toEqual([0, 20, 50]);
  });

  it('subtracts volume on a down close', () => {
    expect(computeLineObv([3, 2, 1], [10, 20, 30])).toEqual([0, -20, -50]);
  });

  it('leaves the total unchanged on a flat close', () => {
    expect(computeLineObv([5, 5, 5], [10, 20, 30])).toEqual([0, 0, 0]);
  });

  it('returns empty for a non-array price input', () => {
    expect(computeLineObv(null, [10, 20])).toEqual([]);
  });

  it('returns empty for a non-array volume input', () => {
    expect(computeLineObv([10, 20], null)).toEqual([]);
  });

  it('returns empty for an empty series', () => {
    expect(computeLineObv([], [])).toEqual([]);
  });

  it('returns a single zero for a one-element series', () => {
    expect(computeLineObv([10], [100])).toEqual([0]);
  });

  it('can cross zero from positive to negative', () => {
    const obv = computeLineObv(
      [10, 13, 11, 14, 12, 9],
      [100, 200, 150, 400, 250, 300],
    );
    expect(Math.min(...obv)).toBeLessThan(0);
    expect(Math.max(...obv)).toBeGreaterThan(0);
  });
});

describe('runLineObv', () => {
  it('marks ok for a valid series', () => {
    expect(runLineObv(OBV_DATA).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineObv([{ x: 0, price: 1, volume: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineObv([]).ok).toBe(false);
  });

  it('computes the OBV series', () => {
    expect(runLineObv(OBV_DATA).obv).toEqual([0, 200, 50, 450, 200, -100]);
  });

  it('computes the direction series', () => {
    expect(runLineObv(OBV_DATA).directions).toEqual([
      'flat', 'up', 'down', 'up', 'down', 'down',
    ]);
  });

  it('reports the final OBV', () => {
    expect(runLineObv(OBV_DATA).obvFinal).toBe(-100);
  });

  it('reports the OBV range', () => {
    const run = runLineObv(OBV_DATA);
    expect(run.obvMin).toBe(-100);
    expect(run.obvMax).toBe(450);
  });

  it('emits one sample per point', () => {
    expect(runLineObv(OBV_DATA).samples).toHaveLength(6);
  });

  it('carries obv, volume and direction onto each sample', () => {
    const s = runLineObv(OBV_DATA).samples[3]!;
    expect(s.obv).toBe(450);
    expect(s.volume).toBe(400);
    expect(s.direction).toBe('up');
  });

  it('keeps the first OBV sample at zero', () => {
    expect(runLineObv(OBV_DATA).samples[0]!.obv).toBe(0);
  });

  it('sorts unsorted input by x before accumulating', () => {
    const run = runLineObv([
      { x: 5, price: 9, volume: 300 },
      { x: 0, price: 10, volume: 100 },
      { x: 3, price: 14, volume: 400 },
      { x: 1, price: 13, volume: 200 },
      { x: 4, price: 12, volume: 250 },
      { x: 2, price: 11, volume: 150 },
    ]);
    expect(run.obv).toEqual([0, 200, 50, 450, 200, -100]);
  });

  it('drops non-finite points before accumulating', () => {
    const run = runLineObv([
      { x: 0, price: 10, volume: 100 },
      { x: 1, price: 13, volume: 200 },
      { x: 2, price: NaN, volume: 150 },
    ]);
    expect(run.samples).toHaveLength(2);
  });
});

describe('computeLineObvLayout', () => {
  it('is ok for a valid series', () => {
    expect(computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS }).ok).toBe(
      true,
    );
  });

  it('is not ok for too few points', () => {
    const layout = computeLineObvLayout({
      data: [{ x: 0, price: 1, volume: 1 }],
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the price panel above the OBV panel', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.pricePanel.y).toBeLessThan(layout.obvPanel.y);
  });

  it('reports the final OBV', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.obvFinal).toBe(-100);
  });

  it('reports the OBV range', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.obvMin).toBe(-100);
    expect(layout.obvMax).toBe(450);
  });

  it('reports the total point count', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one price dot per point', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits one OBV marker per point', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.obvMarkers).toHaveLength(6);
  });

  it('carries the direction onto each OBV marker', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.obvMarkers.map((m) => m.direction)).toEqual([
      'flat', 'up', 'down', 'up', 'down', 'down',
    ]);
  });

  it('places the zero baseline inside the OBV panel', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.zeroY).toBeGreaterThan(layout.obvPanel.y);
    expect(layout.zeroY).toBeLessThan(
      layout.obvPanel.y + layout.obvPanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
  });

  it('builds a non-empty OBV path', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    expect(layout.obvPath.startsWith('M')).toBe(true);
  });

  it('keeps OBV markers inside the OBV panel', () => {
    const layout = computeLineObvLayout({ data: OBV_DATA, ...LAYOUT_OPTS });
    for (const m of layout.obvMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.obvPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.obvPanel.y + layout.obvPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineObvLayout({
      data: OBV_DATA,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineObvChart', () => {
  it('mentions On-Balance Volume', () => {
    expect(describeLineObvChart(OBV_DATA)).toContain('On-Balance Volume');
  });

  it('mentions the cumulative panel', () => {
    expect(describeLineObvChart(OBV_DATA)).toContain('cumulative');
  });

  it('reports the final OBV', () => {
    expect(describeLineObvChart(OBV_DATA)).toContain('Final OBV -100');
  });

  it('reports the OBV range', () => {
    expect(describeLineObvChart(OBV_DATA)).toContain('range -100 to 450');
  });

  it('reports the period count', () => {
    expect(describeLineObvChart(OBV_DATA)).toContain('across 6 periods');
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineObvChart([{ x: 0, price: 1, volume: 1 }])).toBe(
      'No data',
    );
  });
});

describe('<ChartLineObv />', () => {
  it('renders the root region', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-obv"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineObv data={[{ x: 0, price: 1, volume: 1 }]} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the final OBV as a data attribute', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.getAttribute('data-obv-final')).toBe('-100');
  });

  it('renders an accessible description', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const desc = document.querySelector(
      '[data-section="chart-line-obv-aria-desc"]',
    );
    expect(desc?.textContent).toContain('On-Balance Volume');
  });

  it('renders the price path', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-price-path"]'),
    ).toBeTruthy();
  });

  it('renders the OBV line', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-obv-line"]'),
    ).toBeTruthy();
  });

  it('renders one OBV marker per point', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-obv-marker"]'),
    ).toHaveLength(6);
  });

  it('tags each OBV marker with its direction', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const markers = Array.from(
      document.querySelectorAll('[data-section="chart-line-obv-marker"]'),
    ).map((m) => m.getAttribute('data-direction'));
    expect(markers).toEqual(['flat', 'up', 'down', 'up', 'down', 'down']);
  });

  it('renders the zero baseline', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides the zero baseline when showZeroLine is false', () => {
    render(<ChartLineObv data={OBV_DATA} showZeroLine={false} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-zero-line"]'),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-obv-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('OBV');
  });

  it('renders the config badge with final and peak', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-badge-final"]',
      )?.textContent,
    ).toBe('final=-100');
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-badge-peak"]',
      )?.textContent,
    ).toBe('peak=450');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineObv data={OBV_DATA} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-badge"]'),
    ).toBeNull();
  });

  it('renders two legend items', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-obv-legend-item"]',
      ),
    ).toHaveLength(2);
  });

  it('toggles the OBV series off via the legend', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const obvItem = document.querySelector(
      '[data-section="chart-line-obv-legend-item"][data-series-id="obv"]',
    ) as HTMLElement;
    fireEvent.click(obvItem);
    expect(obvItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-obv-obv-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineObv data={OBV_DATA} onSeriesToggle={onSeriesToggle} />,
    );
    const priceItem = document.querySelector(
      '[data-section="chart-line-obv-legend-item"][data-series-id="price"]',
    ) as HTMLElement;
    fireEvent.click(priceItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'price',
      hidden: true,
    });
  });

  it('hides the OBV line and markers when showObv is false', () => {
    render(<ChartLineObv data={OBV_DATA} showObv={false} />);
    expect(
      document.querySelector('[data-section="chart-line-obv-obv-line"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-section="chart-line-obv-marker"]'),
    ).toBeNull();
  });

  it('renders price dots when showDots is true', () => {
    render(<ChartLineObv data={OBV_DATA} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-obv-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when an OBV marker is hovered', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-obv-marker"]',
    );
    const peak = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '3',
    ) as Element;
    fireEvent.mouseEnter(peak);
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-tooltip-obv"]',
      )?.textContent,
    ).toBe('obv: 450');
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-tooltip-volume"]',
      )?.textContent,
    ).toBe('volume: 400');
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-tooltip-direction"]',
      )?.textContent,
    ).toBe('direction: up');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const marker = document.querySelector(
      '[data-section="chart-line-obv-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-obv-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-obv-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when an OBV marker is clicked', () => {
    const onPointClick = vi.fn();
    render(<ChartLineObv data={OBV_DATA} onPointClick={onPointClick} />);
    const marker = document.querySelector(
      '[data-section="chart-line-obv-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineObv data={OBV_DATA} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineObv ref={ref} data={OBV_DATA} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(<ChartLineObv data={OBV_DATA} className="custom-obv" />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.className).toContain('custom-obv');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('exposes the final OBV in the legend stats', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-obv-legend-stats"]',
      )?.textContent,
    ).toContain('-100');
  });

  it('exposes the OBV range as data attributes', () => {
    render(<ChartLineObv data={OBV_DATA} />);
    const root = document.querySelector('[data-section="chart-line-obv"]');
    expect(root?.getAttribute('data-obv-min')).toBe('-100');
    expect(root?.getAttribute('data-obv-max')).toBe('450');
  });
});
