import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineBbPercentB,
  classifyLineBbPercentBZone,
  computeLineBbPercentB,
  computeLineBbPercentBLayout,
  describeLineBbPercentBChart,
  getLineBbPercentBFinitePoints,
  normalizeLineBbPercentBLength,
  normalizeLineBbPercentBNumStd,
  runLineBbPercentB,
  DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH,
  DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD,
} from './chart-line-bb-percent-b';
import type {
  ChartLineBbPercentBPoint,
} from './chart-line-bb-percent-b';

const constFlat = (length: number, K: number): ChartLineBbPercentBPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const risingByS = (length: number, S = 1, c0 = 100): ChartLineBbPercentBPoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: c0 + S * i }));

describe('getLineBbPercentBFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineBbPercentBFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineBbPercentBFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineBbPercentBFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineBbPercentBFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineBbPercentBFinitePoints([
      null as unknown as ChartLineBbPercentBPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineBbPercentBLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineBbPercentBLength(undefined, 20)).toBe(20);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineBbPercentBLength(7.9, 20)).toBe(7);
  });

  it('rejects length below 2', () => {
    expect(normalizeLineBbPercentBLength(1, 20)).toBe(20);
  });
});

describe('normalizeLineBbPercentBNumStd', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineBbPercentBNumStd(undefined, 2)).toBe(2);
  });

  it('rejects zero', () => {
    expect(normalizeLineBbPercentBNumStd(0, 2)).toBe(2);
  });

  it('rejects negative', () => {
    expect(normalizeLineBbPercentBNumStd(-1, 2)).toBe(2);
  });

  it('accepts fractional values', () => {
    expect(normalizeLineBbPercentBNumStd(1.5, 2)).toBe(1.5);
  });
});

describe('computeLineBbPercentB', () => {
  it('returns an empty array for null', () => {
    expect(computeLineBbPercentB(null)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(computeLineBbPercentB([])).toEqual([]);
  });

  it('nulls warmup bars (i < length - 1)', () => {
    const out = computeLineBbPercentB(risingByS(20, 1).map((p) => p.close), {
      length: 20,
      numStd: 2,
    });
    for (let i = 0; i < 19; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[19]).toBe('number');
  });

  it('worked anchor [10, 12] length=2 numStd=1 yields %B[1] = 1 bit-exact', () => {
    // mean = 11, variance = ((10-11)^2 + (12-11)^2)/2 = 1, std = 1
    // upper = 12, lower = 10
    // close[1] = 12, %B = (12-10)/(12-10) = 1
    const out = computeLineBbPercentB([10, 12], { length: 2, numStd: 1 });
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(1);
  });

  it('worked anchor [12, 10] length=2 numStd=1 yields %B[1] = 0 bit-exact', () => {
    const out = computeLineBbPercentB([12, 10], { length: 2, numStd: 1 });
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(0);
  });

  it('worked anchor [10, 12, 10, 12] length=2 numStd=1 alternates 1 and 0', () => {
    const out = computeLineBbPercentB([10, 12, 10, 12], {
      length: 2,
      numStd: 1,
    });
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(1);
  });

  it('CONST_FLAT yields all nulls (singular std = 0)', () => {
    for (const K of [0, 1, 5, 10, 100, -3]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineBbPercentB(closes, { length: 20, numStd: 2 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('%B is bounded around [0, 1] for typical input (allowing excursions)', () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      closes.push(100 + Math.sin(i / 3) * 5 + (i % 7));
    }
    const out = computeLineBbPercentB(closes, { length: 20, numStd: 2 });
    for (let i = 19; i < 60; i += 1) {
      const v = out[i];
      if (v !== null) {
        // Sinusoidal data tends to stay roughly within [0, 1] but
        // can excurse slightly outside.
        expect(v).toBeGreaterThan(-2);
        expect(v).toBeLessThan(3);
      }
    }
  });

  it('output length matches input length', () => {
    const closes = risingByS(30).map((p) => p.close);
    const out = computeLineBbPercentB(closes, { length: 20, numStd: 2 });
    expect(out.length).toBe(30);
  });

  it('does not mutate input', () => {
    const closes = risingByS(30).map((p) => p.close);
    const snap = closes.slice();
    computeLineBbPercentB(closes, { length: 20, numStd: 2 });
    expect(closes).toEqual(snap);
  });

  it('rejects non-finite length (uses default)', () => {
    const closes = constFlat(30, 5).map((p) => p.close);
    const out = computeLineBbPercentB(closes, {
      length: Number.NaN,
      numStd: 2,
    });
    // Default length = 20 -> CONST_FLAT -> null
    expect(out[19]).toBe(null);
  });

  it('translation invariance: shifting close by C does not change %B', () => {
    const baseCloses: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      baseCloses.push(100 + Math.sin(i / 3) * 5);
    }
    const shiftedCloses = baseCloses.map((c) => c + 1000);
    const base = computeLineBbPercentB(baseCloses, {
      length: 14,
      numStd: 2,
    });
    const shifted = computeLineBbPercentB(shiftedCloses, {
      length: 14,
      numStd: 2,
    });
    for (let i = 0; i < base.length; i += 1) {
      const b = base[i];
      const s = shifted[i];
      if (b == null || s == null) {
        expect(b).toBe(s);
        continue;
      }
      expect(s).toBeCloseTo(b, 9);
    }
  });
});

describe('classifyLineBbPercentBZone', () => {
  it('classifies above-upper at >= 1', () => {
    expect(classifyLineBbPercentBZone(1)).toBe('above-upper');
    expect(classifyLineBbPercentBZone(1.5)).toBe('above-upper');
  });

  it('classifies above-mid between 0.5 and 1', () => {
    expect(classifyLineBbPercentBZone(0.75)).toBe('above-mid');
  });

  it('classifies below-mid between 0 and 0.5', () => {
    expect(classifyLineBbPercentBZone(0.25)).toBe('below-mid');
  });

  it('classifies below-lower at <= 0', () => {
    expect(classifyLineBbPercentBZone(0)).toBe('below-lower');
    expect(classifyLineBbPercentBZone(-0.5)).toBe('below-lower');
  });

  it('returns none for null', () => {
    expect(classifyLineBbPercentBZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineBbPercentBZone(Number.NaN)).toBe('none');
  });
});

describe('runLineBbPercentB', () => {
  it('marks ok=false for fewer than length points', () => {
    const run = runLineBbPercentB(risingByS(5));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineBbPercentB(risingByS(25));
    expect(run.ok).toBe(true);
  });

  it('uses defaults when none is provided', () => {
    const run = runLineBbPercentB(risingByS(30));
    expect(run.length).toBe(DEFAULT_CHART_LINE_BB_PERCENT_B_LENGTH);
    expect(run.numStd).toBe(DEFAULT_CHART_LINE_BB_PERCENT_B_NUM_STD);
  });

  it('respects explicit options', () => {
    const run = runLineBbPercentB(risingByS(30), {
      length: 10,
      numStd: 1.5,
    });
    expect(run.length).toBe(10);
    expect(run.numStd).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineBbPercentBPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineBbPercentB(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT classifies all bars as none', () => {
    const run = runLineBbPercentB(constFlat(30, 5));
    expect(run.noneCount).toBe(30);
  });

  it('exposes percentBFinal as the last finite reading', () => {
    const run = runLineBbPercentB([
      { x: 0, close: 10 },
      { x: 1, close: 12 },
    ], { length: 2, numStd: 1 });
    expect(run.percentBFinal).toBe(1);
  });

  it('percentBFinal is null when there is no data', () => {
    const run = runLineBbPercentB([]);
    expect(run.percentBFinal).toBe(null);
  });
});

describe('computeLineBbPercentBLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineBbPercentBLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineBbPercentBLayout({
      data: risingByS(25),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineBbPercentBLayout({
      data: risingByS(25),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above %B', () => {
    const layout = computeLineBbPercentBLayout({ data: risingByS(25) });
    expect(layout.priceBottom).toBeLessThan(layout.pbTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineBbPercentBLayout({
      data: risingByS(25),
      panelGap: 24,
    });
    expect(layout.pbTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineBbPercentBLayout({ data: risingByS(25) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(25);
  });

  it('produces a %B path and markers (skipping warmup)', () => {
    const layout = computeLineBbPercentBLayout({ data: risingByS(25) });
    expect(layout.markers.length).toBe(25 - 19);
  });

  it('upper / mid / lower band lines are inside the %B panel', () => {
    const layout = computeLineBbPercentBLayout({ data: risingByS(25) });
    expect(layout.upperBandY).toBeGreaterThanOrEqual(layout.pbTop);
    expect(layout.upperBandY).toBeLessThanOrEqual(layout.pbBottom);
    expect(layout.midBandY).toBeGreaterThanOrEqual(layout.pbTop);
    expect(layout.midBandY).toBeLessThanOrEqual(layout.pbBottom);
    expect(layout.lowerBandY).toBeGreaterThanOrEqual(layout.pbTop);
    expect(layout.lowerBandY).toBeLessThanOrEqual(layout.pbBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineBbPercentBLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineBbPercentBChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineBbPercentBChart([])).toBe('No data');
  });

  it('mentions Bollinger Bands %B', () => {
    const desc = describeLineBbPercentBChart(risingByS(25));
    expect(desc).toContain('Bollinger Bands %B');
  });

  it('mentions the formula', () => {
    const desc = describeLineBbPercentBChart(risingByS(25));
    expect(desc).toContain('lowerBand');
    expect(desc).toContain('upperBand');
  });

  it('reports the length and numStd', () => {
    const desc = describeLineBbPercentBChart(risingByS(25), {
      length: 14,
      numStd: 1.5,
    });
    expect(desc).toContain('length 14');
    expect(desc).toContain('numStd 1.5');
  });

  it('reports the final reading', () => {
    const data: ChartLineBbPercentBPoint[] = [
      { x: 0, close: 10 },
      { x: 1, close: 12 },
    ];
    const desc = describeLineBbPercentBChart(data, { length: 2, numStd: 1 });
    expect(desc).toContain('1.0000');
  });
});

describe('<ChartLineBbPercentB />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineBbPercentB data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-bb-percent-b-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Bollinger Bands %B');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBbPercentB data={risingByS(25)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length and data-num-std', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        length={14}
        numStd={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-percent-b"]',
    );
    expect(root?.getAttribute('data-length')).toBe('14');
    expect(root?.getAttribute('data-num-std')).toBe('1.5');
  });

  it('exposes data-percent-b-final', () => {
    const data: ChartLineBbPercentBPoint[] = [
      { x: 0, close: 10 },
      { x: 1, close: 12 },
    ];
    const { container } = render(
      <ChartLineBbPercentB data={data} length={2} numStd={1} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-percent-b"]',
    );
    expect(root?.getAttribute('data-percent-b-final')).toBe('1');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-percent-b"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bb-percent-b-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Bollinger Bands %B');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="percentB"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="percentB"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'percentB',
      hidden: true,
    });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        hiddenSeries={['percentB']}
      />,
    );
    const button = container.querySelector('[data-series-id="percentB"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides %B line when controlled hidden', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        hiddenSeries={['percentB']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-line"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-bb-percent-b-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-percent-b-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-percent-b-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bb-percent-b-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-bb-percent-b-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-legend"]',
      ),
    ).toBe(null);
  });

  it('hides bands when showBands is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showBands={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-bands"]',
      ),
    ).toBe(null);
  });

  it('hides mid line when showMidLine is false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showMidLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-mid-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatPercentB', () => {
    const fmt = (v: number) => `[B:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        formatPercentB={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[B:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-percent-b"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bb-percent-b"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-bb-percent-b-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the %B line by default', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineBbPercentB
        data={risingByS(25)}
        defaultHiddenSeries={['percentB']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-percent-b-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-percent-b-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineBbPercentB data={risingByS(25)} showTooltip={false} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bb-percent-b-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-bb-percent-b-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('BB %B integration', () => {
  it('CONST_FLAT yields all-null %B across many K values', () => {
    for (const K of [0, 1, 5, 10, 100, -3, 0.5]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineBbPercentB(closes, { length: 20, numStd: 2 });
      for (let i = 0; i < 30; i += 1) {
        expect(out[i]).toBe(null);
      }
    }
  });

  it('alternating worked anchor [10, 12, ...] length=2 numStd=1 alternates 1/0', () => {
    const closes: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      closes.push(i % 2 === 0 ? 10 : 12);
    }
    const out = computeLineBbPercentB(closes, { length: 2, numStd: 1 });
    // odd i (close=12) -> %B=1; even i>=1 (close=10) -> %B=0
    for (let i = 1; i < 20; i += 1) {
      if (i % 2 === 1) {
        expect(out[i]).toBe(1);
      } else {
        expect(out[i]).toBe(0);
      }
    }
  });
});
