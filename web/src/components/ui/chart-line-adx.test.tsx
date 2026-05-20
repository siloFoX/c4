import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ChartLineAdx,
  getLineAdxFinitePoints,
  normalizeLineAdxPeriod,
  computeLineAdxDirectionalMovement,
  computeLineAdx,
  runLineAdx,
  computeLineAdxLayout,
  describeLineAdxChart,
  DEFAULT_CHART_LINE_ADX_PERIOD,
  type ChartLineAdxPoint,
} from './chart-line-adx';

afterEach(() => cleanup());

/**
 * Canonical fixture. values = [10,12,11,14,13,16], period 2.
 *
 * Directional movement (change : +DM : -DM : TR):
 *   i1 +2 : 2 : 0 : 2     i2 -1 : 0 : 1 : 1
 *   i3 +3 : 3 : 0 : 3     i4 -1 : 0 : 1 : 1     i5 +3 : 3 : 0 : 3
 *
 * Wilder-smoothed (period 2, seeded at index 2):
 *   sPlusDM  = [.,.,1,    2,    1,     2     ]
 *   sMinusDM = [.,.,0.5,  0.25, 0.625, 0.3125]
 *   sTR      = [.,.,1.5,  2.25, 1.625, 2.3125]
 *
 * +DI = 100*sPlusDM/sTR ; -DI = 100*sMinusDM/sTR :
 *   +DI = [.,.,66.6667, 88.8889, 61.5385, 86.4865]
 *   -DI = [.,.,33.3333, 11.1111, 38.4615, 13.5135]
 *   (for a single-value series +DI + -DI = 100 exactly)
 *
 * DX = 100*|+DI - -DI|/(+DI + -DI) :
 *   DX  = [.,.,33.3333, 77.7778, 23.0769, 72.9730]
 *
 * ADX = Wilder-smoothed DX (period 2, seeded at index 3) :
 *   ADX = [.,.,.,55.5556, 39.3162, 56.1446]
 *
 * adxFinal = 56.1446, plusDiFinal = 86.4865, minusDiFinal = 13.5135.
 */
const ADX_DATA: ChartLineAdxPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 12 },
  { x: 2, value: 11 },
  { x: 3, value: 14 },
  { x: 4, value: 13 },
  { x: 5, value: 16 },
];

const LAYOUT_OPTS = {
  width: 560,
  height: 360,
  padding: 40,
};

describe('getLineAdxFinitePoints', () => {
  it('keeps all finite points', () => {
    expect(getLineAdxFinitePoints(ADX_DATA)).toHaveLength(6);
  });

  it('returns empty for null input', () => {
    expect(getLineAdxFinitePoints(null)).toEqual([]);
  });

  it('returns empty for undefined input', () => {
    expect(getLineAdxFinitePoints(undefined)).toEqual([]);
  });

  it('drops points with non-finite value', () => {
    const out = getLineAdxFinitePoints([
      { x: 0, value: 10 },
      { x: 1, value: NaN },
      { x: 2, value: Infinity },
    ]);
    expect(out).toHaveLength(1);
  });

  it('drops points with non-finite x', () => {
    const out = getLineAdxFinitePoints([
      { x: NaN, value: 10 },
      { x: 1, value: 12 },
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('normalizeLineAdxPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAdxPeriod(14, 10)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineAdxPeriod(7.8, 10)).toBe(7);
  });

  it('falls back when below 1', () => {
    expect(normalizeLineAdxPeriod(0, 10)).toBe(10);
  });

  it('falls back for NaN', () => {
    expect(normalizeLineAdxPeriod(NaN, 10)).toBe(10);
  });

  it('falls back for negative', () => {
    expect(normalizeLineAdxPeriod(-3, 9)).toBe(9);
  });
});

describe('computeLineAdxDirectionalMovement', () => {
  it('splits the change into plus directional movement', () => {
    expect(
      computeLineAdxDirectionalMovement([10, 12, 11, 14, 13, 16]).plusDM,
    ).toEqual([null, 2, 0, 3, 0, 3]);
  });

  it('splits the change into minus directional movement', () => {
    expect(
      computeLineAdxDirectionalMovement([10, 12, 11, 14, 13, 16]).minusDM,
    ).toEqual([null, 0, 1, 0, 1, 0]);
  });

  it('computes the absolute true range', () => {
    expect(
      computeLineAdxDirectionalMovement([10, 12, 11, 14, 13, 16]).trueRange,
    ).toEqual([null, 2, 1, 3, 1, 3]);
  });

  it('reads null at index 0 for every series', () => {
    const dm = computeLineAdxDirectionalMovement([10, 12]);
    expect(dm.plusDM[0]).toBeNull();
    expect(dm.minusDM[0]).toBeNull();
    expect(dm.trueRange[0]).toBeNull();
  });

  it('reports zero directional movement on a flat series', () => {
    const dm = computeLineAdxDirectionalMovement([5, 5, 5]);
    expect(dm.plusDM).toEqual([null, 0, 0]);
    expect(dm.minusDM).toEqual([null, 0, 0]);
  });

  it('returns empty arrays for a non-array', () => {
    const dm = computeLineAdxDirectionalMovement(null);
    expect(dm.plusDM).toEqual([]);
  });

  it('keeps plus and minus directional movement mutually exclusive', () => {
    const dm = computeLineAdxDirectionalMovement([10, 12, 11, 14, 13, 16]);
    for (let i = 1; i < 6; i += 1) {
      expect(dm.plusDM[i]! * dm.minusDM[i]!).toBe(0);
    }
  });
});

describe('computeLineAdx', () => {
  it('computes the +DI series', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.plusDI[2]!).toBeCloseTo(66.6667, 3);
    expect(adx.plusDI[5]!).toBeCloseTo(86.4865, 3);
  });

  it('computes the -DI series', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.minusDI[2]!).toBeCloseTo(33.3333, 3);
    expect(adx.minusDI[5]!).toBeCloseTo(13.5135, 3);
  });

  it('computes the DX series', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.dx[2]!).toBeCloseTo(33.3333, 3);
    expect(adx.dx[3]!).toBeCloseTo(77.7778, 3);
  });

  it('computes the ADX series', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.adx[3]!).toBeCloseTo(55.5556, 3);
    expect(adx.adx[4]!).toBeCloseTo(39.3162, 3);
    expect(adx.adx[5]!).toBeCloseTo(56.1446, 3);
  });

  it('leaves +DI null before the smoothing window fills', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.plusDI[0]).toBeNull();
    expect(adx.plusDI[1]).toBeNull();
  });

  it('leaves ADX null until the second smoothing window fills', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    expect(adx.adx[0]).toBeNull();
    expect(adx.adx[1]).toBeNull();
    expect(adx.adx[2]).toBeNull();
    expect(adx.adx[3]).not.toBeNull();
  });

  it('keeps +DI and -DI summing to 100 for a single-value series', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    for (let i = 2; i < 6; i += 1) {
      expect(adx.plusDI[i]! + adx.minusDI[i]!).toBeCloseTo(100, 6);
    }
  });

  it('returns all-null series for a series shorter than period + 1', () => {
    const adx = computeLineAdx([10, 12], 2);
    expect(adx.plusDI).toEqual([null, null]);
    expect(adx.adx).toEqual([null, null]);
  });

  it('returns empty series for a non-array', () => {
    expect(computeLineAdx(null, 2).plusDI).toEqual([]);
  });

  it('produces no NaN on a flat series', () => {
    const adx = computeLineAdx([5, 5, 5, 5], 2);
    expect(adx.plusDI[2]).toBe(0);
    expect(adx.adx[3]).toBe(0);
  });

  it('keeps every defined ADX value within 0 and 100', () => {
    const adx = computeLineAdx([10, 12, 11, 14, 13, 16], 2);
    for (const v of adx.adx) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('clamps a sub-1 period to 1', () => {
    const adx = computeLineAdx([10, 12, 11, 14], 0);
    expect(adx.plusDI.some((v) => v !== null)).toBe(true);
  });
});

describe('runLineAdx', () => {
  it('marks ok for a valid series', () => {
    expect(runLineAdx(ADX_DATA, { period: 2 }).ok).toBe(true);
  });

  it('reports not ok for fewer than two points', () => {
    expect(runLineAdx([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('reports not ok for empty input', () => {
    expect(runLineAdx([]).ok).toBe(false);
  });

  it('computes the ADX series', () => {
    const run = runLineAdx(ADX_DATA, { period: 2 });
    expect(run.adx[5]!).toBeCloseTo(56.1446, 3);
  });

  it('reports the final ADX', () => {
    expect(runLineAdx(ADX_DATA, { period: 2 }).adxFinal).toBeCloseTo(
      56.1446,
      3,
    );
  });

  it('reports the final +DI and -DI', () => {
    const run = runLineAdx(ADX_DATA, { period: 2 });
    expect(run.plusDiFinal).toBeCloseTo(86.4865, 3);
    expect(run.minusDiFinal).toBeCloseTo(13.5135, 3);
  });

  it('emits one sample per point', () => {
    expect(runLineAdx(ADX_DATA, { period: 2 }).samples).toHaveLength(6);
  });

  it('carries the directional metrics onto each sample', () => {
    const s = runLineAdx(ADX_DATA, { period: 2 }).samples[5]!;
    expect(s.plusDI!).toBeCloseTo(86.4865, 3);
    expect(s.adx!).toBeCloseTo(56.1446, 3);
  });

  it('sorts unsorted input by x', () => {
    const run = runLineAdx(
      [
        { x: 5, value: 16 },
        { x: 0, value: 10 },
        { x: 3, value: 14 },
        { x: 1, value: 12 },
        { x: 4, value: 13 },
        { x: 2, value: 11 },
      ],
      { period: 2 },
    );
    expect(run.adx[5]!).toBeCloseTo(56.1446, 3);
  });

  it('defaults the period when unspecified', () => {
    expect(runLineAdx(ADX_DATA).period).toBe(DEFAULT_CHART_LINE_ADX_PERIOD);
  });

  it('is ok but reports NaN ADX when the series is too short for ADX', () => {
    const run = runLineAdx(
      [
        { x: 0, value: 10 },
        { x: 1, value: 12 },
      ],
      { period: 2 },
    );
    expect(run.ok).toBe(true);
    expect(Number.isNaN(run.adxFinal)).toBe(true);
  });
});

describe('computeLineAdxLayout', () => {
  it('is ok for a valid series', () => {
    expect(
      computeLineAdxLayout({ data: ADX_DATA, period: 2, ...LAYOUT_OPTS }).ok,
    ).toBe(true);
  });

  it('is not ok for too few points', () => {
    const layout = computeLineAdxLayout({
      data: [{ x: 0, value: 1 }],
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('stacks the value panel above the ADX panel', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.pricePanel.y).toBeLessThan(layout.adxPanel.y);
  });

  it('reports the period', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.period).toBe(2);
  });

  it('reports the final ADX, +DI and -DI', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.adxFinal).toBeCloseTo(56.1446, 3);
    expect(layout.plusDiFinal).toBeCloseTo(86.4865, 3);
    expect(layout.minusDiFinal).toBeCloseTo(13.5135, 3);
  });

  it('reports the total point count', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.totalPoints).toBe(6);
  });

  it('emits one value dot per point', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.priceDots).toHaveLength(6);
  });

  it('emits an ADX marker only where ADX is defined', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.adxMarkers).toHaveLength(3);
  });

  it('builds non-empty ADX, +DI and -DI paths', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.adxPath.startsWith('M')).toBe(true);
    expect(layout.plusDiPath.startsWith('M')).toBe(true);
    expect(layout.minusDiPath.startsWith('M')).toBe(true);
  });

  it('places the threshold line inside the ADX panel', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.thresholdY).toBeGreaterThan(layout.adxPanel.y);
    expect(layout.thresholdY).toBeLessThan(
      layout.adxPanel.y + layout.adxPanel.height,
    );
  });

  it('defaults the threshold to 25', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.threshold).toBe(25);
  });

  it('honours a custom threshold', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      threshold: 40,
      ...LAYOUT_OPTS,
    });
    expect(layout.threshold).toBe(40);
  });

  it('builds a fixed 0-100 ADX y-axis', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    expect(layout.adxYTicks[0]!.value).toBe(0);
    expect(layout.adxYTicks[layout.adxYTicks.length - 1]!.value).toBe(100);
  });

  it('keeps ADX markers inside the ADX panel', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      ...LAYOUT_OPTS,
    });
    for (const m of layout.adxMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.adxPanel.y - 0.01);
      expect(m.py).toBeLessThanOrEqual(
        layout.adxPanel.y + layout.adxPanel.height + 0.01,
      );
    }
  });

  it('is not ok when the inner box collapses', () => {
    const layout = computeLineAdxLayout({
      data: ADX_DATA,
      period: 2,
      width: 40,
      height: 40,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAdxChart', () => {
  it('mentions the Average Directional Index', () => {
    expect(describeLineAdxChart(ADX_DATA, { period: 2 })).toContain(
      'Average Directional Index',
    );
  });

  it('mentions trend strength', () => {
    expect(describeLineAdxChart(ADX_DATA, { period: 2 })).toContain(
      'trend strength',
    );
  });

  it('mentions the +DI and -DI directional indicators', () => {
    const text = describeLineAdxChart(ADX_DATA, { period: 2 });
    expect(text).toContain('+DI');
    expect(text).toContain('-DI');
  });

  it('reports the period', () => {
    expect(describeLineAdxChart(ADX_DATA, { period: 2 })).toContain(
      'period 2',
    );
  });

  it('reports the final ADX', () => {
    expect(describeLineAdxChart(ADX_DATA, { period: 2 })).toContain(
      'Final ADX 56.14',
    );
  });

  it('returns a no-data string for too few points', () => {
    expect(describeLineAdxChart([{ x: 0, value: 1 }])).toBe('No data');
  });
});

describe('<ChartLineAdx />', () => {
  it('renders the root region', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-adx"]'),
    ).toBeTruthy();
  });

  it('marks data-empty false for a valid series', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.getAttribute('data-empty')).toBe('false');
  });

  it('marks data-empty true for too few points', () => {
    render(<ChartLineAdx data={[{ x: 0, value: 1 }]} period={2} />);
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('exposes the period as a data attribute', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.getAttribute('data-period')).toBe('2');
  });

  it('renders an accessible description', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const desc = document.querySelector(
      '[data-section="chart-line-adx-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Average Directional Index');
  });

  it('renders the value path', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-value-path"]'),
    ).toBeTruthy();
  });

  it('renders the ADX line', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-adx-line"]'),
    ).toBeTruthy();
  });

  it('renders the +DI line', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-plus-di-line"]'),
    ).toBeTruthy();
  });

  it('renders the -DI line', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-minus-di-line"]'),
    ).toBeTruthy();
  });

  it('renders one ADX marker per defined value', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-adx-marker"]'),
    ).toHaveLength(3);
  });

  it('renders the threshold line', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-threshold-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the threshold line when showThreshold is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showThreshold={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-threshold-line"]',
      ),
    ).toBeNull();
  });

  it('renders both panel labels', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const labels = Array.from(
      document.querySelectorAll(
        '[data-section="chart-line-adx-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Value');
    expect(labels).toContain('ADX');
  });

  it('renders the config badge with period and final ADX', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-badge-period"]',
      )?.textContent,
    ).toBe('p=2');
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-badge-final"]',
      )?.textContent,
    ).toBe('ADX=56.14');
  });

  it('hides the badge when showConfigBadge is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-badge"]'),
    ).toBeNull();
  });

  it('renders four legend items', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelectorAll(
        '[data-section="chart-line-adx-legend-item"]',
      ),
    ).toHaveLength(4);
  });

  it('toggles the ADX series off via the legend', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const adxItem = document.querySelector(
      '[data-section="chart-line-adx-legend-item"][data-series-id="adx"]',
    ) as HTMLElement;
    fireEvent.click(adxItem);
    expect(adxItem.getAttribute('data-hidden')).toBe('true');
    expect(
      document.querySelector('[data-section="chart-line-adx-adx-line"]'),
    ).toBeNull();
  });

  it('toggles the +DI series off via the legend', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const plusItem = document.querySelector(
      '[data-section="chart-line-adx-legend-item"][data-series-id="plusdi"]',
    ) as HTMLElement;
    fireEvent.click(plusItem);
    expect(
      document.querySelector('[data-section="chart-line-adx-plus-di-line"]'),
    ).toBeNull();
  });

  it('fires onSeriesToggle when a legend item is clicked', () => {
    const onSeriesToggle = vi.fn();
    render(
      <ChartLineAdx
        data={ADX_DATA}
        period={2}
        onSeriesToggle={onSeriesToggle}
      />,
    );
    const minusItem = document.querySelector(
      '[data-section="chart-line-adx-legend-item"][data-series-id="minusdi"]',
    ) as HTMLElement;
    fireEvent.click(minusItem);
    expect(onSeriesToggle).toHaveBeenCalledWith({
      seriesId: 'minusdi',
      hidden: true,
    });
  });

  it('hides the ADX line when showAdx is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showAdx={false} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-adx-line"]'),
    ).toBeNull();
  });

  it('hides the +DI line when showPlusDi is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showPlusDi={false} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-plus-di-line"]'),
    ).toBeNull();
  });

  it('hides the -DI line when showMinusDi is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showMinusDi={false} />);
    expect(
      document.querySelector('[data-section="chart-line-adx-minus-di-line"]'),
    ).toBeNull();
  });

  it('renders value dots when showDots is true', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} showDots />);
    expect(
      document.querySelectorAll('[data-section="chart-line-adx-dot"]'),
    ).toHaveLength(6);
  });

  it('shows a tooltip when an ADX marker is hovered', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-adx-marker"]',
    );
    const last = Array.from(markers).find(
      (m) => m.getAttribute('data-point-index') === '5',
    ) as Element;
    fireEvent.mouseEnter(last);
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-tooltip-adx"]',
      )?.textContent,
    ).toBe('ADX: 56.14');
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-tooltip-plus-di"]',
      )?.textContent,
    ).toBe('+DI: 86.49');
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-tooltip-minus-di"]',
      )?.textContent,
    ).toBe('-DI: 13.51');
  });

  it('clears the tooltip on mouse leave', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const marker = document.querySelector(
      '[data-section="chart-line-adx-marker"]',
    ) as Element;
    fireEvent.mouseEnter(marker);
    expect(
      document.querySelector('[data-section="chart-line-adx-tooltip"]'),
    ).toBeTruthy();
    fireEvent.mouseLeave(marker);
    expect(
      document.querySelector('[data-section="chart-line-adx-tooltip"]'),
    ).toBeNull();
  });

  it('fires onPointClick when an ADX marker is clicked', () => {
    const onPointClick = vi.fn();
    render(
      <ChartLineAdx data={ADX_DATA} period={2} onPointClick={onPointClick} />,
    );
    const marker = document.querySelector(
      '[data-section="chart-line-adx-marker"]',
    ) as Element;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('applies the fade-in animation class by default', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.className).toContain('motion-safe:animate-fade-in');
  });

  it('omits the animation class when animate is false', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} animate={false} />);
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.className ?? '').not.toContain(
      'motion-safe:animate-fade-in',
    );
  });

  it('forwards a ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<ChartLineAdx ref={ref} data={ADX_DATA} period={2} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies a custom class name', () => {
    render(
      <ChartLineAdx data={ADX_DATA} period={2} className="custom-adx" />,
    );
    const root = document.querySelector('[data-section="chart-line-adx"]');
    expect(root?.className).toContain('custom-adx');
  });

  it('renders an accessible region role', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(screen.getByRole('region')).toBeTruthy();
  });

  it('exposes the final ADX in the legend stats', () => {
    render(<ChartLineAdx data={ADX_DATA} period={2} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-adx-legend-stats"]',
      )?.textContent,
    ).toContain('56.14');
  });
});
