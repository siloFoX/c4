import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHilbertCycle,
  applyLineHilbertCycleFir,
  applyLineHilbertCycleSma,
  classifyLineHilbertCycleZone,
  computeLineHilbertCycle,
  computeLineHilbertCycleLayout,
  describeLineHilbertCycleChart,
  getLineHilbertCycleFinitePoints,
  normalizeLineHilbertCycleLength,
  runLineHilbertCycle,
  DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH,
} from './chart-line-hilbert-cycle';
import type {
  ChartLineHilbertCyclePoint,
} from './chart-line-hilbert-cycle';

const constFlat = (length: number, K: number): ChartLineHilbertCyclePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: K }));

const sinusoid = (length: number, period: number, amplitude = 10, baseline = 100): ChartLineHilbertCyclePoint[] =>
  Array.from({ length }, (_, i) => ({
    x: i,
    close: baseline + amplitude * Math.sin((2 * Math.PI * i) / period),
  }));

const rising = (length: number, start = 100, step = 1): ChartLineHilbertCyclePoint[] =>
  Array.from({ length }, (_, i) => ({ x: i, close: start + i * step }));

describe('getLineHilbertCycleFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHilbertCycleFinitePoints(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(getLineHilbertCycleFinitePoints(undefined)).toEqual([]);
  });

  it('drops non-finite x', () => {
    const result = getLineHilbertCycleFinitePoints([
      { x: 1, close: 10 },
      { x: Number.NaN, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops non-finite close', () => {
    const result = getLineHilbertCycleFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineHilbertCycleFinitePoints([
      null as unknown as ChartLineHilbertCyclePoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineHilbertCycleLength', () => {
  it('returns the default when undefined', () => {
    expect(normalizeLineHilbertCycleLength(undefined, 4)).toBe(4);
  });

  it('returns the default when NaN', () => {
    expect(normalizeLineHilbertCycleLength(Number.NaN, 4)).toBe(4);
  });

  it('floors fractional lengths', () => {
    expect(normalizeLineHilbertCycleLength(7.9, 4)).toBe(7);
  });

  it('rejects length below 1', () => {
    expect(normalizeLineHilbertCycleLength(0, 4)).toBe(4);
  });

  it('accepts the minimum length of 1', () => {
    expect(normalizeLineHilbertCycleLength(1, 4)).toBe(1);
  });
});

describe('applyLineHilbertCycleFir', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineHilbertCycleFir([])).toEqual([]);
  });

  it('warmup bars (i < 6) are null', () => {
    const out = applyLineHilbertCycleFir([1, 2, 3, 4, 5, 6, 7]);
    for (let i = 0; i < 6; i += 1) {
      expect(out[i]).toBe(null);
    }
    expect(typeof out[6]).toBe('number');
  });

  it('CONST_FLAT yields values within ULPs of zero (numerical)', () => {
    for (const K of [0, 1, 5, 7, 10, 100, -3]) {
      const values = Array(20).fill(K);
      const out = applyLineHilbertCycleFir(values);
      for (let i = 6; i < 20; i += 1) {
        const v = out[i];
        expect(v).not.toBe(null);
        if (v !== null) expect(v).toBeCloseTo(0, 12);
      }
    }
  });

  it('CONST_FLAT at K=0 yields exactly 0 bit-exact', () => {
    const values = Array(20).fill(0);
    const out = applyLineHilbertCycleFir(values);
    for (let i = 6; i < 20; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('null in window nulls the output', () => {
    const values: Array<number | null> = [1, 2, 3, 4, 5, 6, 7];
    values[2] = null;
    const out = applyLineHilbertCycleFir(values);
    expect(out[6]).toBe(null);
  });
});

describe('applyLineHilbertCycleSma', () => {
  it('returns an empty array for empty input', () => {
    expect(applyLineHilbertCycleSma([], 3)).toEqual([]);
  });

  it('warmup bars (i < length - 1) are null', () => {
    const out = applyLineHilbertCycleSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('SMA of zeros stays at zero bit-exact', () => {
    const out = applyLineHilbertCycleSma([0, 0, 0, 0, 0], 3);
    for (let i = 2; i < 5; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('SMA of constant K stays at K bit-exact', () => {
    for (const K of [1, 2, 5, 10, 100]) {
      const out = applyLineHilbertCycleSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('null in window nulls the output', () => {
    const out = applyLineHilbertCycleSma([1, 2, null, 4, 5], 3);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(null); // contains null at position 2
    expect(out[4]).toBe(null); // contains null at position 2
  });
});

describe('computeLineHilbertCycle', () => {
  it('returns empty arrays for null', () => {
    const out = computeLineHilbertCycle(null);
    expect(out.cycle).toEqual([]);
    expect(out.inPhase).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    const out = computeLineHilbertCycle([]);
    expect(out.cycle).toEqual([]);
    expect(out.inPhase).toEqual([]);
  });

  it('CONST_FLAT at K=0 yields cycle = 0 bit-exact past warmup', () => {
    const closes = constFlat(30, 0).map((p) => p.close);
    const out = computeLineHilbertCycle(closes, { smoothLength: 4 });
    // Cycle requires: 6 (FIR for detrender) + 6 (FIR for Q) + 3 (smooth-1) = 15
    for (let i = 15; i < 30; i += 1) {
      expect(out.cycle[i]).toBe(0);
    }
  });

  it('CONST_FLAT at K!=0 yields cycle ~ 0 to numerical tolerance', () => {
    for (const K of [1, 5, 7, 10, 100, -3]) {
      const closes = constFlat(30, K).map((p) => p.close);
      const out = computeLineHilbertCycle(closes, { smoothLength: 4 });
      for (let i = 15; i < 30; i += 1) {
        const v = out.cycle[i];
        expect(v).not.toBe(null);
        if (v !== null) expect(v).toBeCloseTo(0, 12);
      }
    }
  });

  it('CONST_FLAT at K=0 yields inPhase = 0 bit-exact', () => {
    const closes = constFlat(30, 0).map((p) => p.close);
    const out = computeLineHilbertCycle(closes, { smoothLength: 4 });
    // inPhase requires: 6 (FIR) + 3 (delay) + smoothLength - 1 = 12
    for (let i = 12; i < 30; i += 1) {
      expect(out.inPhase[i]).toBe(0);
    }
  });

  it('nulls warmup bars for cycle', () => {
    const closes = rising(40).map((p) => p.close);
    const out = computeLineHilbertCycle(closes, { smoothLength: 4 });
    // Cycle warmup is 6 + 6 + 4 - 1 = 15, so bars 0..14 should be null
    for (let i = 0; i < 15; i += 1) {
      expect(out.cycle[i]).toBe(null);
    }
  });

  it('produces finite cycle values on sinusoidal data', () => {
    const closes = sinusoid(60, 20).map((p) => p.close);
    const out = computeLineHilbertCycle(closes, { smoothLength: 4 });
    let foundFinite = false;
    for (let i = 20; i < 60; i += 1) {
      const v = out.cycle[i];
      if (typeof v === 'number' && Math.abs(v) > 0.001) {
        foundFinite = true;
        break;
      }
    }
    expect(foundFinite).toBe(true);
  });

  it('output length matches input length', () => {
    const closes = rising(40).map((p) => p.close);
    const out = computeLineHilbertCycle(closes);
    expect(out.cycle.length).toBe(40);
    expect(out.inPhase.length).toBe(40);
  });

  it('does not mutate input', () => {
    const closes = rising(20).map((p) => p.close);
    const snap = closes.slice();
    computeLineHilbertCycle(closes);
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineHilbertCycleZone', () => {
  it('classifies positive', () => {
    expect(classifyLineHilbertCycleZone(0.5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineHilbertCycleZone(-0.5)).toBe('negative');
  });

  it('classifies flat at zero', () => {
    expect(classifyLineHilbertCycleZone(0)).toBe('flat');
  });

  it('returns none for null', () => {
    expect(classifyLineHilbertCycleZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineHilbertCycleZone(Number.NaN)).toBe('none');
  });
});

describe('runLineHilbertCycle', () => {
  it('marks ok=false for fewer than the warmup', () => {
    const run = runLineHilbertCycle(rising(10));
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough points', () => {
    const run = runLineHilbertCycle(rising(40));
    expect(run.ok).toBe(true);
  });

  it('uses the default smoothLength when none is provided', () => {
    const run = runLineHilbertCycle(rising(40));
    expect(run.smoothLength).toBe(
      DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH,
    );
  });

  it('respects an explicit smoothLength', () => {
    const run = runLineHilbertCycle(rising(40), { smoothLength: 6 });
    expect(run.smoothLength).toBe(6);
  });

  it('sorts by x', () => {
    const data: ChartLineHilbertCyclePoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineHilbertCycle(data);
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST_FLAT at K=0 classifies all finite bars as flat', () => {
    const run = runLineHilbertCycle(constFlat(30, 0));
    expect(run.flatCount).toBe(30 - 15);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('exposes cycleFinal as the last finite reading', () => {
    const run = runLineHilbertCycle(constFlat(30, 0));
    expect(run.cycleFinal).toBe(0);
  });

  it('cycleFinal is null when there is no data', () => {
    const run = runLineHilbertCycle([]);
    expect(run.cycleFinal).toBe(null);
  });
});

describe('computeLineHilbertCycleLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHilbertCycleLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above cycle', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
    });
    expect(layout.priceBottom).toBeLessThan(layout.cycleTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
      panelGap: 24,
    });
    expect(layout.cycleTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces a cycle path and markers', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
    });
    expect(layout.cyclePath.length).toBeGreaterThan(0);
    // markers cover bars past the warmup
    expect(layout.markers.length).toBeGreaterThan(0);
  });

  it('zero line is inside the cycle panel', () => {
    const layout = computeLineHilbertCycleLayout({
      data: constFlat(30, 0),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.cycleTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.cycleBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineHilbertCycleLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHilbertCycleChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHilbertCycleChart([])).toBe('No data');
  });

  it('mentions Hilbert Transform cycle', () => {
    const desc = describeLineHilbertCycleChart(rising(40));
    expect(desc).toContain('Hilbert Transform cycle');
  });

  it('mentions Quadrature component', () => {
    const desc = describeLineHilbertCycleChart(rising(40));
    expect(desc).toContain('Quadrature');
  });

  it('reports the smooth length', () => {
    const desc = describeLineHilbertCycleChart(rising(40), {
      smoothLength: 6,
    });
    expect(desc).toContain('smooth length 6');
  });

  it('reports the final reading', () => {
    const desc = describeLineHilbertCycleChart(constFlat(30, 0));
    expect(desc).toContain('0.0000');
  });
});

describe('<ChartLineHilbertCycle />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineHilbertCycle data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain(
      'Hilbert Transform cycle',
    );
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHilbertCycle data={constFlat(30, 0)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-smooth-length', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} smoothLength={6} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-cycle"]',
    );
    expect(root?.getAttribute('data-smooth-length')).toBe('6');
  });

  it('exposes data-cycle-final', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-cycle"]',
    );
    expect(root?.getAttribute('data-cycle-final')).toBe('0');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-cycle"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Hilbert Transform cycle');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="cycle"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="inphase"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="cycle"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'cycle', hidden: true });
  });

  it('respects controlled hiddenSeries', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        hiddenSeries={['cycle']}
      />,
    );
    const button = container.querySelector('[data-series-id="cycle"]');
    expect(button?.getAttribute('data-hidden')).toBe('true');
  });

  it('hides cycle line when controlled hidden', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        hiddenSeries={['cycle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-line"]',
      ),
    ).toBe(null);
  });

  it('shows InPhase line when showInPhase is true', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        showInPhase={true}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-inphase"]',
      ),
    ).toBeTruthy();
  });

  it('hides InPhase line by default (showInPhase=false)', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-inphase"]',
      ),
    ).toBe(null);
  });

  it('fires onPointClick on marker activation', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        onPointClick={onPointClick}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
    fireEvent.click(markers[0]!);
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Enter key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('responds to Space key on markers', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.keyDown(marker, { key: ' ' });
    expect(onPointClick).toHaveBeenCalled();
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides the config badge when disabled', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        showConfigBadge={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-badge"]',
      ),
    ).toBe(null);
  });

  it('renders dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} showDots={true} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-cycle-dot"]',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not render dots by default', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-hilbert-cycle-dot"]',
      ).length,
    ).toBe(0);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-grid"]',
      ),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} showMarkers={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-markers"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-legend"]',
      ),
    ).toBe(null);
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-zero-line"]',
      ),
    ).toBe(null);
  });

  it('respects a custom formatCycle', () => {
    const fmt = (v: number) => `[C:${v.toFixed(2)}]`;
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        formatCycle={fmt}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/\[C:-?\d/);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-cycle"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('exposes data-animate attribute', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} animate={true} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hilbert-cycle"]',
    );
    expect(root?.getAttribute('data-animate')).toBe('true');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the cycle line by default', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        defaultHiddenSeries={['cycle']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-line"]',
      ),
    ).toBe(null);
  });

  it('hovering a marker shows the tooltip', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-tooltip"]',
      ),
    ).toBeTruthy();
  });

  it('tooltip vanishes on mouseLeave', () => {
    const { container } = render(
      <ChartLineHilbertCycle data={constFlat(30, 0)} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) {
      fireEvent.mouseEnter(marker);
      fireEvent.mouseLeave(marker);
    }
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-tooltip"]',
      ),
    ).toBe(null);
  });

  it('tooltip respects showTooltip=false', () => {
    const { container } = render(
      <ChartLineHilbertCycle
        data={constFlat(30, 0)}
        showTooltip={false}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-hilbert-cycle-marker"]',
    ) as SVGElement | null;
    if (marker) fireEvent.mouseEnter(marker);
    expect(
      container.querySelector(
        '[data-section="chart-line-hilbert-cycle-tooltip"]',
      ),
    ).toBe(null);
  });
});

describe('Hilbert cycle integration', () => {
  it('CONST_FLAT K=0 yields cycle = 0 bit-exact across smooth lengths', () => {
    for (const L of [1, 2, 4, 6, 10]) {
      const closes = constFlat(50, 0).map((p) => p.close);
      const out = computeLineHilbertCycle(closes, { smoothLength: L });
      const startIdx = 11 + L;
      for (let i = startIdx; i < 50; i += 1) {
        expect(out.cycle[i]).toBe(0);
      }
    }
  });

  it('CONST_FLAT K!=0 yields cycle within numerical tolerance across smooth lengths', () => {
    for (const K of [1, 7, 100]) {
      for (const L of [1, 4, 6]) {
        const closes = constFlat(50, K).map((p) => p.close);
        const out = computeLineHilbertCycle(closes, { smoothLength: L });
        const startIdx = 11 + L;
        for (let i = startIdx; i < 50; i += 1) {
          const v = out.cycle[i];
          if (v !== null) expect(v).toBeCloseTo(0, 12);
        }
      }
    }
  });
});
