import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHlRange,
  applyLineHlRangeDifference,
  applyLineHlRangeSma,
  classifyLineHlRangeZone,
  computeLineHlRange,
  computeLineHlRangeLayout,
  describeLineHlRangeChart,
  detectLineHlRangeCrosses,
  getLineHlRangeFinitePoints,
  normalizeLineHlRangeLength,
  normalizeLineHlRangeThreshold,
  runLineHlRange,
  DEFAULT_CHART_LINE_HL_RANGE_LENGTH,
} from './chart-line-hl-range';
import type { ChartLineHlRangePoint } from './chart-line-hl-range';

const constBar = (count: number, K: number): ChartLineHlRangePoint[] =>
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
): ChartLineHlRangePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: baseLow + spread,
    low: baseLow,
    close: baseLow + spread / 2,
  }));

const linearConstantSpread = (
  count: number,
  spread: number,
): ChartLineHlRangePoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1 + spread,
    low: i + 1,
    close: i + 1 + spread / 2,
  }));

describe('getLineHlRangeFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineHlRangeFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineHlRangeFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops non-finite low', () => {
    const r = getLineHlRangeFinitePoints([
      { x: 0, high: 10, low: Number.NaN, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineHlRangeFinitePoints([
      null as unknown as ChartLineHlRangePoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineHlRangeLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHlRangeLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineHlRangeLength(1, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineHlRangeLength(7.7, 14)).toBe(7);
  });
});

describe('normalizeLineHlRangeThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineHlRangeThreshold(undefined, 1)).toBe(1);
  });

  it('accepts zero', () => {
    expect(normalizeLineHlRangeThreshold(0, 1)).toBe(0);
  });

  it('accepts negative', () => {
    expect(normalizeLineHlRangeThreshold(-1, 1)).toBe(-1);
  });
});

describe('applyLineHlRangeDifference', () => {
  it('CONST h=l=K yields 0', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineHlRangeDifference(
        Array(5).fill(K),
        Array(5).fill(K),
      );
      for (const v of out) expect(v).toBe(0);
    }
  });

  it('CONSTANT SPREAD yields D bit-exact', () => {
    const out = applyLineHlRangeDifference([6, 7, 8], [5, 6, 7]);
    expect(out).toEqual([1, 1, 1]);
  });

  it('null on non-finite', () => {
    const out = applyLineHlRangeDifference(
      [Number.NaN, 5],
      [1, 3],
    );
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(2);
  });
});

describe('applyLineHlRangeSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineHlRangeSma(Array(10).fill(K), 4);
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineHlRangeSma([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(2);
  });

  it('null short-circuit', () => {
    const out = applyLineHlRangeSma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });
});

describe('computeLineHlRange', () => {
  it('returns empty for null', () => {
    const ch = computeLineHlRange(null);
    expect(ch.avgRange).toEqual([]);
  });

  it('CONST high=low=K yields avgRange = 0 bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(15, K);
      const ch = computeLineHlRange(series, { length: 4 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.avgRange[i]).toBe(0);
      }
    }
  });

  it('CONSTANT SPREAD yields avgRange = D bit-exact', () => {
    for (const D of [1, 2, 5, 10]) {
      const series = constantSpread(15, 7, D);
      const ch = computeLineHlRange(series, { length: 4 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.avgRange[i]).toBe(D);
      }
    }
  });

  it('LINEAR + CONSTANT SPREAD yields avgRange = D bit-exact', () => {
    for (const D of [1, 2, 5, 10]) {
      const series = linearConstantSpread(15, D);
      const ch = computeLineHlRange(series, { length: 4 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.avgRange[i]).toBe(D);
      }
    }
  });

  it('per-bar range = D for CONSTANT SPREAD', () => {
    const series = constantSpread(10, 5, 3);
    const ch = computeLineHlRange(series, { length: 4 });
    for (let i = 0; i < 10; i += 1) {
      expect(ch.range[i]).toBe(3);
    }
  });

  it('warmup region is null', () => {
    const series = linearConstantSpread(15, 1);
    const ch = computeLineHlRange(series, { length: 4 });
    expect(ch.avgRange[0]).toBe(null);
    expect(ch.avgRange[2]).toBe(null);
    expect(ch.avgRange[3]).toBe(1);
  });

  it('output length matches input length', () => {
    const series = linearConstantSpread(15, 1);
    const ch = computeLineHlRange(series, { length: 4 });
    expect(ch.avgRange.length).toBe(15);
  });

  it('does not mutate input', () => {
    const series = linearConstantSpread(15, 1);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineHlRange(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineHlRangeZone', () => {
  it('classifies wide', () => {
    expect(classifyLineHlRangeZone(2, 1, 0)).toBe('wide');
  });

  it('classifies narrow', () => {
    expect(classifyLineHlRangeZone(0, 1, 0)).toBe('narrow');
  });

  it('classifies neutral', () => {
    expect(classifyLineHlRangeZone(0.5, 1, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineHlRangeZone(null, 1, 0)).toBe('none');
  });
});

describe('detectLineHlRangeCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineHlRangeCrosses([null, null], 1, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above high threshold', () => {
    const ev = detectLineHlRangeCrosses([null, 0.5, 2], 1, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below low threshold', () => {
    const ev = detectLineHlRangeCrosses([null, 0.5, -1], 1, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineHlRangeCrosses([null, 2], 1, 0)[1]).toBe(null);
  });
});

describe('runLineHlRange', () => {
  it('marks ok=false for short data', () => {
    const run = runLineHlRange(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineHlRange(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineHlRange(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HL_RANGE_LENGTH);
    expect(run.highThreshold).toBe(1);
    expect(run.lowThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineHlRange(constBar(30, 10), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.5,
    });
    expect(run.length).toBe(7);
    expect(run.highThreshold).toBe(2);
    expect(run.lowThreshold).toBe(0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineHlRangePoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineHlRange(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST classifies all post-warmup as narrow (avgRange=0)', () => {
    const run = runLineHlRange(constBar(20, 10), { length: 4 });
    expect(run.narrowCount).toBe(17);
  });

  it('CONSTANT SPREAD D=2 classifies as wide', () => {
    const run = runLineHlRange(constantSpread(20, 5, 2), {
      length: 4,
      highThreshold: 1,
    });
    expect(run.wideCount).toBe(17);
  });
});

describe('computeLineHlRangeLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineHlRangeLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineHlRangeLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above range', () => {
    const layout = computeLineHlRangeLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.priceBottom).toBeLessThan(layout.rangeTop);
  });

  it('range axis includes zero', () => {
    const layout = computeLineHlRangeLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.rangeMin).toBeLessThanOrEqual(0);
    expect(layout.rangeMax).toBeGreaterThan(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineHlRangeLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('threshold lines in range panel bounds', () => {
    const layout = computeLineHlRangeLayout({
      data: linearConstantSpread(30, 1),
    });
    expect(layout.highY).toBeGreaterThanOrEqual(layout.rangeTop);
    expect(layout.highY).toBeLessThanOrEqual(layout.rangeBottom);
    expect(layout.lowY).toBeGreaterThanOrEqual(layout.rangeTop);
    expect(layout.lowY).toBeLessThanOrEqual(layout.rangeBottom);
  });
});

describe('describeLineHlRangeChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineHlRangeChart([])).toBe('No data');
  });

  it('mentions High-Low Range', () => {
    const desc = describeLineHlRangeChart(linearConstantSpread(30, 1));
    expect(desc).toContain('High-Low Range');
  });

  it('reports parameters', () => {
    const desc = describeLineHlRangeChart(linearConstantSpread(30, 1), {
      length: 7,
      highThreshold: 2,
      lowThreshold: 0.5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('highThreshold 2');
    expect(desc).toContain('lowThreshold 0.5');
  });
});

describe('<ChartLineHlRange />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineHlRange data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('High-Low');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} ref={ref} />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        length={7}
        highThreshold={2}
        lowThreshold={0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-range"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-high-threshold')).toBe('2');
    expect(root?.getAttribute('data-low-threshold')).toBe('0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-range"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-aria-desc"]',
      )?.textContent,
    ).toContain('High-Low Range');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="range"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="range"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'range',
      hidden: true,
    });
  });

  it('hides range when controlled hidden', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        hiddenSeries={['range']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-range-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-high-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-low-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-high-line"]',
      ),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-range-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-range-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hl-range"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-hl-range-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the range line by default', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-range-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineHlRange data={linearConstantSpread(30, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hl-range-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineHlRange
        data={linearConstantSpread(30, 1)}
        defaultHiddenSeries={['range']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hl-range-line"]'),
    ).toBe(null);
  });
});

describe('HL Range integration', () => {
  it('CONST high=low=K yields avgRange = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 10]) {
        const total = L + 5;
        const series = constBar(total, K);
        const ch = computeLineHlRange(series, { length: L });
        for (let i = L - 1; i < total; i += 1) {
          expect(ch.avgRange[i]).toBe(0);
        }
      }
    }
  });

  it('CONSTANT SPREAD yields avgRange = D across (D, baseLow, length)', () => {
    for (const D of [1, 2, 5, 10]) {
      for (const baseLow of [0, 1, 100, -3]) {
        for (const L of [2, 4, 7, 10]) {
          const total = L + 5;
          const series = constantSpread(total, baseLow, D);
          const ch = computeLineHlRange(series, { length: L });
          for (let i = L - 1; i < total; i += 1) {
            expect(ch.avgRange[i]).toBe(D);
          }
        }
      }
    }
  });

  it('LINEAR + CONSTANT SPREAD yields avgRange = D across (D, length)', () => {
    for (const D of [1, 2, 5, 10]) {
      for (const L of [2, 4, 7, 10]) {
        const total = L + 5;
        const series = linearConstantSpread(total, D);
        const ch = computeLineHlRange(series, { length: L });
        for (let i = L - 1; i < total; i += 1) {
          expect(ch.avgRange[i]).toBe(D);
        }
      }
    }
  });
});
