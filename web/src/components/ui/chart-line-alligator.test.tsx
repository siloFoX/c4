import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAlligator,
  applyLineAlligatorSmma,
  classifyLineAlligatorZone,
  computeLineAlligator,
  computeLineAlligatorLayout,
  describeLineAlligatorChart,
  getLineAlligatorFinitePoints,
  normalizeLineAlligatorPeriod,
  normalizeLineAlligatorShift,
  runLineAlligator,
  DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD,
  DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT,
} from './chart-line-alligator';
import type { ChartLineAlligatorPoint } from './chart-line-alligator';

const constFlat = (
  count: number,
  K: number,
): ChartLineAlligatorPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const constBar = (
  count: number,
  H = 12,
  L = 8,
  C = 10,
): ChartLineAlligatorPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: H,
    low: L,
    close: C,
  }));

describe('getLineAlligatorFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAlligatorFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineAlligatorFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x / high / low / close', () => {
    const result = getLineAlligatorFinitePoints([
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: Number.NaN, low: 9, close: 10 },
      { x: 2, high: 11, low: Number.NaN, close: 10 },
      { x: 3, high: 11, low: 9, close: Number.NaN },
      { x: Number.NaN, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineAlligatorFinitePoints([
      null as unknown as ChartLineAlligatorPoint,
      { x: 1, high: 11, low: 9, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineAlligatorPeriod', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAlligatorPeriod(undefined, 13)).toBe(13);
  });

  it('floors fractional periods', () => {
    expect(normalizeLineAlligatorPeriod(5.9, 13)).toBe(5);
  });

  it('rejects period below 2', () => {
    expect(normalizeLineAlligatorPeriod(1, 13)).toBe(13);
  });
});

describe('normalizeLineAlligatorShift', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineAlligatorShift(undefined, 8)).toBe(8);
  });

  it('accepts zero', () => {
    expect(normalizeLineAlligatorShift(0, 8)).toBe(0);
  });

  it('floors fractional shifts', () => {
    expect(normalizeLineAlligatorShift(3.7, 8)).toBe(3);
  });

  it('rejects negative', () => {
    expect(normalizeLineAlligatorShift(-1, 8)).toBe(8);
  });
});

describe('applyLineAlligatorSmma', () => {
  it('returns empty for empty input', () => {
    expect(applyLineAlligatorSmma([], 5)).toEqual([]);
  });

  it('nulls bars before the seed window completes', () => {
    const out = applyLineAlligatorSmma([1, 2, 3, 4, 5], 4);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    // i=3: seed = (1+2+3+4)/4 = 2.5
    expect(out[3]).toBe(2.5);
    // i=4: smma = (2.5*3 + 5)/4 = 12.5/4 = 3.125
    expect(out[4]).toBe(3.125);
  });

  it('SMMA of constant K is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3, 10, -50]) {
      const out = applyLineAlligatorSmma(Array(15).fill(K), 5);
      for (let i = 4; i < 15; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineAlligator', () => {
  it('returns empty for null', () => {
    const ch = computeLineAlligator(null);
    expect(ch.median).toEqual([]);
    expect(ch.jaw).toEqual([]);
    expect(ch.teeth).toEqual([]);
    expect(ch.lips).toEqual([]);
  });

  it('returns empty for empty input', () => {
    const ch = computeLineAlligator([]);
    expect(ch.jaw).toEqual([]);
  });

  it('computes median = (high + low) / 2', () => {
    const ch = computeLineAlligator([
      { high: 12, low: 8 },
      { high: 20, low: 10 },
    ]);
    expect(ch.median[0]).toBe(10);
    expect(ch.median[1]).toBe(15);
  });

  it('CONST_FLAT (h = l = K) yields jaw = teeth = lips = K past warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const bars = constFlat(40, K).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const ch = computeLineAlligator(bars);
      // jaw valid at i >= jawPeriod + jawShift - 1 = 13 + 8 - 1 = 20.
      for (let i = 20; i < 40; i += 1) {
        expect(ch.jaw[i]).toBe(K);
        expect(ch.teeth[i]).toBe(K);
        expect(ch.lips[i]).toBe(K);
      }
    }
  });

  it('output length matches input length', () => {
    const bars = constFlat(40, 5).map((p) => ({
      high: p.high,
      low: p.low,
    }));
    const ch = computeLineAlligator(bars);
    expect(ch.jaw.length).toBe(40);
    expect(ch.teeth.length).toBe(40);
    expect(ch.lips.length).toBe(40);
  });

  it('does not mutate input', () => {
    const bars = constFlat(40, 5).map((p) => ({
      high: p.high,
      low: p.low,
    }));
    const snap = bars.map((b) => ({ ...b }));
    computeLineAlligator(bars);
    for (let i = 0; i < bars.length; i += 1) {
      expect(bars[i]).toEqual(snap[i]);
    }
  });

  it('rejects non-finite periods (uses defaults)', () => {
    const bars = constFlat(40, 5).map((p) => ({
      high: p.high,
      low: p.low,
    }));
    const ch = computeLineAlligator(bars, {
      jawPeriod: Number.NaN,
      teethPeriod: Number.NaN,
      lipsPeriod: Number.NaN,
    });
    // Defaults yield jaw warmup at i >= 20.
    expect(ch.jaw[20]).toBe(5);
  });
});

describe('classifyLineAlligatorZone', () => {
  it('classifies eating when lips > teeth > jaw', () => {
    expect(classifyLineAlligatorZone(8, 10, 12)).toBe('eating');
  });

  it('classifies eating when lips < teeth < jaw', () => {
    expect(classifyLineAlligatorZone(12, 10, 8)).toBe('eating');
  });

  it('classifies sleeping when all three coincide', () => {
    expect(classifyLineAlligatorZone(10, 10, 10)).toBe('sleeping');
  });

  it('classifies sleeping when two of three coincide', () => {
    expect(classifyLineAlligatorZone(10, 10, 8)).toBe('sleeping');
  });

  it('classifies awake when the order is broken (transitional)', () => {
    // lips > jaw but lips < teeth
    expect(classifyLineAlligatorZone(11, 14, 12)).toBe('awake');
  });

  it('returns none for any null line', () => {
    expect(classifyLineAlligatorZone(null, 10, 8)).toBe('none');
    expect(classifyLineAlligatorZone(12, null, 8)).toBe('none');
    expect(classifyLineAlligatorZone(12, 10, null)).toBe('none');
  });
});

describe('runLineAlligator', () => {
  it('marks ok=false for fewer than jawPeriod + jawShift points', () => {
    const run = runLineAlligator(constFlat(20, 5));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineAlligator(constFlat(21, 5));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineAlligator(constFlat(30, 5));
    expect(run.jawPeriod).toBe(DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD);
    expect(run.jawShift).toBe(DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT);
  });

  it('respects explicit options', () => {
    const run = runLineAlligator(constFlat(50, 5), {
      jawPeriod: 21,
      jawShift: 5,
    });
    expect(run.jawPeriod).toBe(21);
    expect(run.jawShift).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineAlligatorPoint[] = [
      { x: 2, high: 11, low: 9, close: 10 },
      { x: 0, high: 11, low: 9, close: 10 },
      { x: 1, high: 11, low: 9, close: 10 },
    ];
    const run = runLineAlligator(data, {
      jawPeriod: 2,
      jawShift: 0,
      teethPeriod: 2,
      teethShift: 0,
      lipsPeriod: 2,
      lipsShift: 0,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies post-warmup as sleeping (all lines = K)', () => {
    const run = runLineAlligator(constFlat(40, 5));
    // bar 20 onward: 40 - 20 = 20 sleeping bars
    expect(run.sleepingCount).toBe(20);
  });

  it('exposes jawFinal as the last finite jaw reading', () => {
    const run = runLineAlligator(constFlat(40, 5));
    expect(run.jawFinal).toBe(5);
    expect(run.teethFinal).toBe(5);
    expect(run.lipsFinal).toBe(5);
  });

  it('jawFinal is null when there is no data', () => {
    const run = runLineAlligator([]);
    expect(run.jawFinal).toBe(null);
  });
});

describe('computeLineAlligatorLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAlligatorLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAlligatorLayout({ data: constFlat(40, 5) });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineAlligatorLayout({
      data: constFlat(40, 5),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAlligatorLayout({ data: constFlat(40, 5) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(40);
  });

  it('produces jaw, teeth, lips paths', () => {
    const layout = computeLineAlligatorLayout({ data: constFlat(40, 5) });
    expect(layout.jawPath.startsWith('M')).toBe(true);
    expect(layout.teethPath.startsWith('M')).toBe(true);
    expect(layout.lipsPath.startsWith('M')).toBe(true);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineAlligatorLayout({
      data: [{ x: 0, high: 11, low: 9, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });

  it('y-range covers close and the alligator lines', () => {
    const layout = computeLineAlligatorLayout({
      data: constBar(40, 12, 8, 10),
    });
    // median = 10, all three lines settle at 10 past warmup
    // close = 10, so the y range narrows to [10, 10] but the
    // layout expands it by +/-1.
    expect(layout.yMax - layout.yMin).toBeGreaterThan(0);
  });
});

describe('describeLineAlligatorChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAlligatorChart([])).toBe('No data');
  });

  it('mentions Bill Williams Alligator', () => {
    const desc = describeLineAlligatorChart(constFlat(40, 5));
    expect(desc).toContain('Bill Williams Alligator');
  });

  it('mentions the formula and periods', () => {
    const desc = describeLineAlligatorChart(constFlat(40, 5));
    expect(desc).toContain('(high + low) / 2');
    expect(desc).toContain('jaw is SMMA(13)');
  });

  it('reports the final jaw value', () => {
    const desc = describeLineAlligatorChart(constFlat(40, 5));
    expect(desc).toContain('5.0000');
  });
});

describe('<ChartLineAlligator />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineAlligator data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-alligator-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Alligator');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAlligator data={constFlat(40, 5)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-jaw-period and data-jaw-shift', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        jawPeriod={21}
        jawShift={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-alligator"]',
    );
    expect(root?.getAttribute('data-jaw-period')).toBe('21');
    expect(root?.getAttribute('data-jaw-shift')).toBe('5');
  });

  it('exposes data-jaw-final, data-teeth-final, data-lips-final', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-alligator"]',
    );
    expect(root?.getAttribute('data-jaw-final')).toBe('5');
    expect(root?.getAttribute('data-teeth-final')).toBe('5');
    expect(root?.getAttribute('data-lips-final')).toBe('5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-alligator"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('40');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-alligator-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Bill Williams Alligator');
  });

  it('renders four legend items', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="jaw"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="teeth"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lips"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="jaw"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'jaw',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        hiddenSeries={['jaw']}
      />,
    );
    const button = container.querySelector('[data-series-id="jaw"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides jaw path when controlled hidden', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        hiddenSeries={['jaw']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-jaw-path"]',
      ),
    ).toBe(null);
  });

  it('hides teeth path with showTeeth=false', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} showTeeth={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-teeth-path"]',
      ),
    ).toBe(null);
  });

  it('hides lips path with showLips=false', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} showLips={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-lips-path"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-alligator-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-alligator-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-alligator-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showMarkers={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-legend"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatAlligator', () => {
    const fmt = (v: number) => `[A:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        formatAlligator={fmt}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[A:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-alligator"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-alligator"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-alligator-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the jaw, teeth, lips paths by default', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-jaw-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-teeth-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-lips-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        defaultHiddenSeries={['jaw']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-jaw-path"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineAlligator data={constFlat(40, 5)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineAlligator
        data={constFlat(40, 5)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-alligator-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-alligator-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Alligator integration', () => {
  it('CONST_FLAT yields jaw = teeth = lips = K across many K', () => {
    for (const K of [0, 1, 5, 100, -3, 7, -50]) {
      const bars = constFlat(40, K).map((p) => ({
        high: p.high,
        low: p.low,
      }));
      const ch = computeLineAlligator(bars);
      for (let i = 20; i < 40; i += 1) {
        expect(ch.jaw[i]).toBe(K);
        expect(ch.teeth[i]).toBe(K);
        expect(ch.lips[i]).toBe(K);
      }
    }
  });
});
