import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineAroonOsc,
  CHART_LINE_AROON_OSC_BOUND,
  DEFAULT_CHART_LINE_AROON_OSC_PERIOD,
  classifyLineAroonOscZone,
  computeLineAroonOsc,
  computeLineAroonOscAroonDown,
  computeLineAroonOscAroonUp,
  computeLineAroonOscLayout,
  describeLineAroonOscChart,
  getLineAroonOscFinitePoints,
  normalizeLineAroonOscPeriod,
  runLineAroonOsc,
  type ChartLineAroonOscPoint,
} from './chart-line-aroon-osc';

const toBars = (closes: number[]): ChartLineAroonOscPoint[] =>
  closes.map((c, i) => ({ x: i, high: c, low: c }));

const UP_RAMP: ChartLineAroonOscPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
const DOWN_RAMP: ChartLineAroonOscPoint[] = toBars([
  10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
]);
const CONST: ChartLineAroonOscPoint[] = toBars([
  50, 50, 50, 50, 50, 50, 50, 50, 50, 50,
]);
const MIXED_PEAK: ChartLineAroonOscPoint[] = toBars([
  1, 2, 3, 4, 5, 6, 5, 4, 3, 2,
]);
const WAVE: ChartLineAroonOscPoint[] = Array.from({ length: 24 }, (_, i) => {
  const value = 50 + 10 * Math.sin(i * 0.4);
  return { x: i, high: value + 1, low: value - 1 };
});

const OPTS = { period: 4 } as const;

describe('getLineAroonOscFinitePoints', () => {
  it('returns an empty list for null input', () => {
    expect(getLineAroonOscFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array input', () => {
    expect(
      getLineAroonOscFinitePoints(
        'oops' as unknown as ChartLineAroonOscPoint[],
      ),
    ).toEqual([]);
  });

  it('drops points with a non-finite field', () => {
    const points: ChartLineAroonOscPoint[] = [
      { x: 0, high: 1, low: 1 },
      { x: Number.NaN, high: 2, low: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 1 },
      { x: 1, high: 2, low: Number.NEGATIVE_INFINITY },
      { x: 1, high: 2, low: 1.5 },
    ];
    const finite = getLineAroonOscFinitePoints(points);
    expect(finite).toHaveLength(2);
    expect(finite[0]?.x).toBe(0);
    expect(finite[1]?.x).toBe(1);
  });

  it('preserves the input order', () => {
    const finite = getLineAroonOscFinitePoints(UP_RAMP.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe('normalizeLineAroonOscPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineAroonOscPeriod(14, 25)).toBe(14);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineAroonOscPeriod(14.9, 25)).toBe(14);
  });

  it('falls back for a sub-1 period', () => {
    expect(normalizeLineAroonOscPeriod(0, 25)).toBe(25);
    expect(normalizeLineAroonOscPeriod(-5, 25)).toBe(25);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineAroonOscPeriod(Number.NaN, 25)).toBe(25);
    expect(normalizeLineAroonOscPeriod('14' as unknown as number, 25)).toBe(25);
  });
});

describe('computeLineAroonOscAroonUp', () => {
  it('returns an empty array for non-array input', () => {
    expect(
      computeLineAroonOscAroonUp(
        null as unknown as ChartLineAroonOscPoint[],
        4,
      ),
    ).toEqual([]);
  });

  it('leaves the warm-up window null', () => {
    const up = computeLineAroonOscAroonUp(UP_RAMP, 4);
    expect(up.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('pins to 100 on a strictly rising series', () => {
    const up = computeLineAroonOscAroonUp(UP_RAMP, 4);
    expect(up.slice(4)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  it('drops to 0 on a strictly falling series', () => {
    const up = computeLineAroonOscAroonUp(DOWN_RAMP, 4);
    expect(up.slice(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('pins to 100 on a constant series (most-recent tie)', () => {
    const up = computeLineAroonOscAroonUp(CONST, 4);
    expect(up.slice(4)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  it('matches the worked Aroon Up values on the mixed peak fixture', () => {
    const up = computeLineAroonOscAroonUp(MIXED_PEAK, 4);
    expect(up).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
      75,
      50,
      25,
      0,
    ]);
  });
});

describe('computeLineAroonOscAroonDown', () => {
  it('drops to 0 on a strictly rising series', () => {
    const down = computeLineAroonOscAroonDown(UP_RAMP, 4);
    expect(down.slice(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('pins to 100 on a strictly falling series', () => {
    const down = computeLineAroonOscAroonDown(DOWN_RAMP, 4);
    expect(down.slice(4)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  it('pins to 100 on a constant series (most-recent tie)', () => {
    const down = computeLineAroonOscAroonDown(CONST, 4);
    expect(down.slice(4)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  it('matches the worked Aroon Down values on the mixed peak fixture', () => {
    const down = computeLineAroonOscAroonDown(MIXED_PEAK, 4);
    expect(down).toEqual([
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      100,
      100,
      100,
    ]);
  });
});

describe('computeLineAroonOsc', () => {
  it('returns empty arrays for non-array input', () => {
    const out = computeLineAroonOsc(
      null as unknown as ChartLineAroonOscPoint[],
      4,
    );
    expect(out).toEqual({ aroonUp: [], aroonDown: [], osc: [] });
  });

  it('returns three arrays of matching length', () => {
    const out = computeLineAroonOsc(UP_RAMP, 4);
    expect(out.aroonUp).toHaveLength(UP_RAMP.length);
    expect(out.aroonDown).toHaveLength(UP_RAMP.length);
    expect(out.osc).toHaveLength(UP_RAMP.length);
  });

  it('leaves the warm-up window null on all three arrays', () => {
    const out = computeLineAroonOsc(UP_RAMP, 4);
    expect(out.aroonUp.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.aroonDown.slice(0, 4)).toEqual([null, null, null, null]);
    expect(out.osc.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('pins to +100 on a strictly rising series', () => {
    const out = computeLineAroonOsc(UP_RAMP, 4);
    expect(out.osc.slice(4)).toEqual([100, 100, 100, 100, 100, 100]);
  });

  it('pins to -100 on a strictly falling series', () => {
    const out = computeLineAroonOsc(DOWN_RAMP, 4);
    expect(out.osc.slice(4)).toEqual([-100, -100, -100, -100, -100, -100]);
  });

  it('pins to 0 on a constant series', () => {
    const out = computeLineAroonOsc(CONST, 4);
    expect(out.osc.slice(4)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('matches the worked Aroon Oscillator on the mixed peak fixture', () => {
    const out = computeLineAroonOsc(MIXED_PEAK, 4);
    expect(out.osc).toEqual([
      null,
      null,
      null,
      null,
      100,
      100,
      75,
      -50,
      -75,
      -100,
    ]);
  });

  it('every defined oscillator value lies inside [-100, 100]', () => {
    const out = computeLineAroonOsc(WAVE, 4);
    for (const value of out.osc) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(-CHART_LINE_AROON_OSC_BOUND);
      expect(value).toBeLessThanOrEqual(CHART_LINE_AROON_OSC_BOUND);
    }
  });
});

describe('classifyLineAroonOscZone', () => {
  it('marks a positive value as up', () => {
    expect(classifyLineAroonOscZone(40)).toBe('up');
    expect(classifyLineAroonOscZone(0.5)).toBe('up');
  });

  it('marks a negative value as down', () => {
    expect(classifyLineAroonOscZone(-40)).toBe('down');
    expect(classifyLineAroonOscZone(-0.5)).toBe('down');
  });

  it('marks an exact zero as flat', () => {
    expect(classifyLineAroonOscZone(0)).toBe('flat');
  });

  it('marks null as none', () => {
    expect(classifyLineAroonOscZone(null)).toBe('none');
  });

  it('marks a non-finite value as none', () => {
    expect(classifyLineAroonOscZone(Number.NaN)).toBe('none');
    expect(classifyLineAroonOscZone(Number.POSITIVE_INFINITY)).toBe('none');
  });
});

describe('runLineAroonOsc', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineAroonOsc([{ x: 0, high: 1, low: 1 }]).ok).toBe(false);
  });

  it('marks empty input as not ok', () => {
    expect(runLineAroonOsc([]).ok).toBe(false);
    expect(runLineAroonOsc(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineAroonOsc(UP_RAMP, OPTS).ok).toBe(true);
  });

  it('uses the default period when none is given', () => {
    const run = runLineAroonOsc(UP_RAMP);
    expect(run.period).toBe(DEFAULT_CHART_LINE_AROON_OSC_PERIOD);
  });

  it('honours a custom period', () => {
    expect(runLineAroonOsc(UP_RAMP, { period: 6 }).period).toBe(6);
  });

  it('counts a rising series wholly up', () => {
    const run = runLineAroonOsc(UP_RAMP, OPTS);
    expect(run.upCount).toBe(6);
    expect(run.downCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a falling series wholly down', () => {
    const run = runLineAroonOsc(DOWN_RAMP, OPTS);
    expect(run.downCount).toBe(6);
    expect(run.upCount).toBe(0);
    expect(run.flatCount).toBe(0);
  });

  it('counts a constant series wholly flat', () => {
    const run = runLineAroonOsc(CONST, OPTS);
    expect(run.flatCount).toBe(6);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('mixes the zones on the mixed peak fixture', () => {
    const run = runLineAroonOsc(MIXED_PEAK, OPTS);
    expect(run.upCount).toBe(3);
    expect(run.downCount).toBe(3);
    expect(run.flatCount).toBe(0);
  });

  it('produces one sample per finite point', () => {
    const run = runLineAroonOsc(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('marks each sample with a valid zone', () => {
    const run = runLineAroonOsc(WAVE, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineAroonOsc(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('sorts the series by x', () => {
    const shuffled = [...UP_RAMP].sort(() => -1);
    const run = runLineAroonOsc(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final oscillator reading', () => {
    const run = runLineAroonOsc(UP_RAMP, OPTS);
    expect(run.oscFinal).toBe(100);
    expect(runLineAroonOsc(DOWN_RAMP, OPTS).oscFinal).toBe(-100);
    expect(runLineAroonOsc(CONST, OPTS).oscFinal).toBe(0);
  });
});

describe('computeLineAroonOscLayout', () => {
  it('marks single-point input as not ok', () => {
    const layout = computeLineAroonOscLayout({
      data: [{ x: 0, high: 1, low: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    const layout = computeLineAroonOscLayout({
      data: WAVE,
      width: 60,
      height: 60,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('marks ok with a normal input and canvas', () => {
    const layout = computeLineAroonOscLayout({ data: WAVE, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the oscillator panel', () => {
    const layout = computeLineAroonOscLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.oscPanelTop);
  });

  it('builds non-empty price and oscillator paths', () => {
    const layout = computeLineAroonOscLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.oscPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineAroonOscLayout({ data: UP_RAMP, ...OPTS });
    expect(layout.priceDots).toHaveLength(UP_RAMP.length);
  });

  it('emits one marker per finite-osc bar', () => {
    const layout = computeLineAroonOscLayout({ data: UP_RAMP, ...OPTS });
    expect(layout.markers).toHaveLength(6);
  });

  it('pads the oscillator domain past [-100, 100]', () => {
    const layout = computeLineAroonOscLayout({ data: WAVE, ...OPTS });
    expect(layout.oscMin).toBeLessThanOrEqual(-CHART_LINE_AROON_OSC_BOUND);
    expect(layout.oscMax).toBeGreaterThanOrEqual(CHART_LINE_AROON_OSC_BOUND);
  });

  it('puts the zero line inside the oscillator panel', () => {
    const layout = computeLineAroonOscLayout({ data: WAVE, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.oscPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.oscPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineAroonOscLayout({ data: UP_RAMP, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.samples).toHaveLength(UP_RAMP.length);
  });
});

describe('describeLineAroonOscChart', () => {
  it('names the indicator', () => {
    const text = describeLineAroonOscChart(UP_RAMP, OPTS);
    expect(text).toContain('Aroon Oscillator');
  });

  it('mentions Aroon Up and Aroon Down', () => {
    const text = describeLineAroonOscChart(UP_RAMP, OPTS);
    expect(text).toContain('Aroon Up');
    expect(text).toContain('Aroon Down');
  });

  it('mentions the lookback period', () => {
    const text = describeLineAroonOscChart(UP_RAMP, { period: 9 });
    expect(text).toContain('period 9');
  });

  it('mentions the zone counts', () => {
    const text = describeLineAroonOscChart(UP_RAMP, OPTS);
    expect(text).toContain('positive on 6');
    expect(text).toContain('negative on 0');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAroonOscChart([])).toBe('No data');
    expect(describeLineAroonOscChart(null)).toBe('No data');
  });
});

describe('<ChartLineAroonOsc />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAroonOsc data={UP_RAMP} period={4} />);
    expect(
      screen.getByRole('region', { name: /Aroon Oscillator chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-aroon-osc-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Aroon Oscillator');
  });

  it('renders the empty state on no data', () => {
    const { container } = render(<ChartLineAroonOsc data={[]} period={4} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-osc-empty"]',
      ),
    ).toBeInTheDocument();
  });

  it('mirrors the period and total-points on the root', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-osc"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(UP_RAMP.length),
    );
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
  });

  it('renders the midpoint and oscillator lines', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-osc-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-aroon-osc-osc-line"]'),
    ).toBeInTheDocument();
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-osc-zero-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per finite-osc bar', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-osc-marker"]',
    );
    expect(markers.length).toBe(6);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-aroon-osc-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['up', 'down', 'flat']).toContain(zone);
    }
  });

  it('renders the config badge with the period', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-aroon-osc-badge-config"]',
    );
    expect(badge?.textContent).toContain('AROON 4');
  });

  it('hides the oscillator line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} />,
    );
    const oscBtn = container.querySelector(
      '[data-section="chart-line-aroon-osc-legend-item"][data-series-id="osc"]',
    );
    expect(oscBtn).toBeInTheDocument();
    fireEvent.click(oscBtn as Element);
    expect(
      container.querySelector('[data-section="chart-line-aroon-osc-osc-line"]'),
    ).toBeNull();
  });

  it('hides the zero line via the showZeroLine flag', () => {
    const { container } = render(
      <ChartLineAroonOsc data={UP_RAMP} period={4} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-osc-zero-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAroonOsc
        data={UP_RAMP}
        period={4}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-aroon-osc-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAroonOsc ref={ref} data={UP_RAMP} period={4} />);
    expect(ref.current).not.toBeNull();
  });
});
