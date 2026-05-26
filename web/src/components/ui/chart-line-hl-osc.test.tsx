import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHlOsc,
  applyLineHlOscSma,
  classifyLineHlOscZone,
  computeLineHlOsc,
  computeLineHlOscLayout,
  describeLineHlOscChart,
  detectLineHlOscCrosses,
  getLineHlOscFinitePoints,
  normalizeLineHlOscLength,
  normalizeLineHlOscThreshold,
  runLineHlOsc,
  DEFAULT_CHART_LINE_HL_OSC_LENGTH,
} from './chart-line-hl-osc';
import type { ChartLineHlOscPoint } from './chart-line-hl-osc';

const constBar = (count: number, K: number): ChartLineHlOscPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const constantSpread = (
  count: number,
  baseLow: number,
  spread: number,
): ChartLineHlOscPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: baseLow + spread,
    low: baseLow,
    close: baseLow + spread / 2,
  }));

const linearConstantSpread = (
  count: number,
  spread: number,
): ChartLineHlOscPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1 + spread,
    low: i + 1,
    close: i + 1 + spread / 2,
  }));

describe('getLineHlOscFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHlOscFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineHlOscFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const r = getLineHlOscFinitePoints([
      { x: 0, high: 10, low: Number.NaN, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineHlOscFinitePoints([
      null as unknown as ChartLineHlOscPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineHlOscLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHlOscLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineHlOscLength(1, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineHlOscLength(7.7, 14)).toBe(7);
  });
});

describe('normalizeLineHlOscThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHlOscThreshold(undefined, 1)).toBe(1);
  });

  it('accepts zero', () => {
    expect(normalizeLineHlOscThreshold(0, 1)).toBe(0);
  });

  it('accepts negative (no enforced minimum)', () => {
    expect(normalizeLineHlOscThreshold(-1, 1)).toBe(-1);
  });
});

describe('applyLineHlOscSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineHlOscSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineHlOscSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('null short-circuit', () => {
    const out = applyLineHlOscSma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });
});

describe('computeLineHlOsc', () => {
  it('returns empty for null', () => {
    const ch = computeLineHlOsc(null);
    expect(ch.osc).toEqual([]);
  });

  it('CONST high=low=K yields osc = 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineHlOsc(series, { length: 4 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.osc[i]).toBe(0);
      }
    }
  });

  it('CONSTANT SPREAD high-low=1 yields osc = 1 bit-exact', () => {
    const series = constantSpread(15, 5, 1);
    const ch = computeLineHlOsc(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.osc[i]).toBe(1);
    }
  });

  it('CONSTANT SPREAD high-low=3 yields osc = 3 bit-exact', () => {
    const series = constantSpread(15, 5, 3);
    const ch = computeLineHlOsc(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.osc[i]).toBe(3);
    }
  });

  it('LINEAR + CONSTANT SPREAD spread=1 yields osc = 1 bit-exact', () => {
    const series = linearConstantSpread(15, 1);
    const ch = computeLineHlOsc(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.osc[i]).toBe(1);
    }
  });

  it('LINEAR + CONSTANT SPREAD spread=2 yields osc = 2 bit-exact', () => {
    const series = linearConstantSpread(15, 2);
    const ch = computeLineHlOsc(series, { length: 4 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.osc[i]).toBe(2);
    }
  });

  it('warmup region is null', () => {
    const series = linearConstantSpread(15, 1);
    const ch = computeLineHlOsc(series, { length: 4 });
    expect(ch.osc[0]).toBe(null);
    expect(ch.osc[2]).toBe(null);
    expect(ch.osc[3]).toBe(1);
  });

  it('output length matches input length', () => {
    const series = linearConstantSpread(15, 1);
    const ch = computeLineHlOsc(series, { length: 4 });
    expect(ch.osc.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearConstantSpread(15, 1);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineHlOsc(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('highSma and lowSma are populated', () => {
    const series = constantSpread(15, 5, 2);
    const ch = computeLineHlOsc(series, { length: 4 });
    expect(ch.highSma[3]).toBe(7);
    expect(ch.lowSma[3]).toBe(5);
  });
});

describe('classifyLineHlOscZone', () => {
  it('classifies expanded', () => {
    expect(classifyLineHlOscZone(2, 1, 0)).toBe('expanded');
  });

  it('classifies narrow', () => {
    expect(classifyLineHlOscZone(0, 1, 0)).toBe('narrow');
  });

  it('classifies neutral', () => {
    expect(classifyLineHlOscZone(0.5, 1, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineHlOscZone(null, 1, 0)).toBe('none');
  });
});

describe('detectLineHlOscCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineHlOscCrosses([null, null], 1, 0)).toEqual([null, null]);
  });

  it('flags up when crossing above high threshold', () => {
    const ev = detectLineHlOscCrosses([null, 0.5, 2], 1, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below low threshold', () => {
    const ev = detectLineHlOscCrosses([null, 0.5, -1], 1, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineHlOscCrosses([null, 2], 1, 0)[1]).toBe(null);
  });
});

describe('runLineHlOsc', () => {
  it('marks ok=false for short data', () => {
    const run = runLineHlOsc(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineHlOsc(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineHlOsc(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HL_OSC_LENGTH);
    expect(run.highThreshold).toBe(1);
    expect(run.lowThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineHlOsc(constBar(30, 10), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.5,
    });
    expect(run.length).toBe(7);
    expect(run.highThreshold).toBe(2);
    expect(run.lowThreshold).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineHlOscPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineHlOsc(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST classifies all post-warmup as narrow (osc=0)', () => {
    const run = runLineHlOsc(constBar(20, 10), { length: 4 });
    expect(run.narrowCount).toBe(17);
  });

  it('CONSTANT SPREAD spread=2 classifies as expanded', () => {
    const run = runLineHlOsc(constantSpread(20, 5, 2), {
      length: 4,
      highThreshold: 1,
    });
    expect(run.expandedCount).toBe(17);
  });
});

describe('computeLineHlOscLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHlOscLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHlOscLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above osc', () => {
    const layout = computeLineHlOscLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis includes zero', () => {
    const layout = computeLineHlOscLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThan(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHlOscLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('threshold lines in osc panel bounds', () => {
    const layout = computeLineHlOscLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.highY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.highY).toBeLessThanOrEqual(layout.oscBottom);
    expect(layout.lowY).toBeGreaterThanOrEqual(layout.oscTop);
    expect(layout.lowY).toBeLessThanOrEqual(layout.oscBottom);
  });
});

describe('describeLineHlOscChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHlOscChart([])).toBe('No data');
  });

  it('mentions High-Low Oscillator', () => {
    const desc = describeLineHlOscChart(linearConstantSpread(30, 1));
    expect(desc).toContain('High-Low Oscillator');
  });

  it('reports parameters', () => {
    const desc = describeLineHlOscChart(linearConstantSpread(30, 1), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('highThreshold 2');
    expect(desc).toContain('lowThreshold 0.5');
  });
});

describe('<ChartLineHlOsc />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineHlOsc data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-osc-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('High-Low');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} ref={ref} />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        length={7}
        highThreshold={2}
        lowThreshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-osc"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-high-threshold')).toBe('2');
    expect(root?.getAttribute('data-low-threshold')).toBe('0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-osc"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-osc-aria-desc"]',
      )?.textContent,
    ).toContain('High-Low Oscillator');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="osc"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="osc"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'osc',
      hidden: true,
    });
  });

  it('hides osc when controlled hidden', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        hiddenSeries={['osc']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-badge"]'),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-high-line"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-low-line"]'),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-high-line"]'),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-zero-line"]'),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-osc"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hl-osc-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the osc line by default', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHlOsc data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-osc-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHlOsc
        data={linearConstantSpread(30, 1)}
        defaultHiddenSeries={['osc']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-osc-line"]'),
    ).toBe(null);
  });
});

describe('HL Oscillator integration', () => {
  it('CONST high=low=K yields osc = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 10]) {
        const total = L + 5;
        const series = constBar(total, K);
        const ch = computeLineHlOsc(series, { length: L });
        for (let i = L - 1; i < total; i += 1) {
          expect(ch.osc[i]).toBe(0);
        }
      }
    }
  });

  it('CONSTANT SPREAD yields osc = D across (D, baseLow, length)', () => {
    for (const D of [1, 2, 5, 10]) {
      for (const baseLow of [0, 1, 100, -3]) {
        for (const L of [2, 4, 7, 10]) {
          const total = L + 5;
          const series = constantSpread(total, baseLow, D);
          const ch = computeLineHlOsc(series, { length: L });
          for (let i = L - 1; i < total; i += 1) {
            expect(ch.osc[i]).toBe(D);
          }
        }
      }
    }
  });

  it('LINEAR + CONSTANT SPREAD yields osc = D across (D, length)', () => {
    for (const D of [1, 2, 5, 10]) {
      for (const L of [2, 4, 7, 10]) {
        const total = L + 5;
        const series = linearConstantSpread(total, D);
        const ch = computeLineHlOsc(series, { length: L });
        for (let i = L - 1; i < total; i += 1) {
          expect(ch.osc[i]).toBe(D);
        }
      }
    }
  });
});
