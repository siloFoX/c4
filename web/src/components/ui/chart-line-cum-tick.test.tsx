import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineCumTick,
  applyLineCumTickRollingSum,
  classifyLineCumTickZone,
  computeLineCumTick,
  computeLineCumTickDirections,
  computeLineCumTickLayout,
  describeLineCumTickChart,
  detectLineCumTickCrosses,
  getLineCumTickFinitePoints,
  normalizeLineCumTickLength,
  runLineCumTick,
  DEFAULT_CHART_LINE_CUM_TICK_LENGTH,
} from './chart-line-cum-tick';
import type { ChartLineCumTickPoint } from './chart-line-cum-tick';

const constClose = (
  count: number,
  K: number,
): ChartLineCumTickPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const monoUp = (count: number): ChartLineCumTickPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const monoDown = (count: number): ChartLineCumTickPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

const alternating = (count: number): ChartLineCumTickPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i % 2 === 0 ? 10 : 11,
  }));

describe('getLineCumTickFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineCumTickFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const result = getLineCumTickFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });

  it('drops null entries', () => {
    const result = getLineCumTickFinitePoints([
      null as unknown as ChartLineCumTickPoint,
      { x: 1, close: 10 },
    ]);
    expect(result.length).toBe(1);
  });
});

describe('normalizeLineCumTickLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineCumTickLength(undefined, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineCumTickLength(7.9, 14)).toBe(7);
  });

  it('rejects zero', () => {
    expect(normalizeLineCumTickLength(0, 14)).toBe(14);
  });
});

describe('computeLineCumTickDirections', () => {
  it('first bar is null', () => {
    const out = computeLineCumTickDirections([1, 2, 3]);
    expect(out[0]).toBe(null);
  });

  it('CONST close yields direction = 0', () => {
    const out = computeLineCumTickDirections([5, 5, 5, 5]);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it('MONO UP yields direction = +1', () => {
    const out = computeLineCumTickDirections([1, 2, 3, 4]);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(1);
  });

  it('MONO DOWN yields direction = -1', () => {
    const out = computeLineCumTickDirections([4, 3, 2, 1]);
    expect(out[1]).toBe(-1);
    expect(out[3]).toBe(-1);
  });

  it('non-finite previous close yields null', () => {
    const out = computeLineCumTickDirections([Number.NaN, 5, 6]);
    expect(out[1]).toBe(null);
  });
});

describe('applyLineCumTickRollingSum', () => {
  it('warmup region is null', () => {
    const out = applyLineCumTickRollingSum([1, 1, 1, 1, 1], 4);
    expect(out[0]).toBe(null);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(4);
  });

  it('CONST values yield sum = K * length bit-exact', () => {
    for (const K of [0, 1, -1]) {
      const values = Array(10).fill(K);
      const out = applyLineCumTickRollingSum(values, 4);
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(K * 4);
      }
    }
  });
});

describe('computeLineCumTick', () => {
  it('returns empty for null', () => {
    const ch = computeLineCumTick(null);
    expect(ch.cumTick).toEqual([]);
  });

  it('CONST close yields cumTick = 0 (bit-exact)', () => {
    const closes = Array(20).fill(10);
    const ch = computeLineCumTick(closes, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.cumTick[i]).toBe(0);
    }
  });

  it('MONO UP yields cumTick = +length (bit-exact)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const ch = computeLineCumTick(closes, { length: 5 });
    for (let i = 5; i < 20; i += 1) {
      expect(ch.cumTick[i]).toBe(5);
    }
  });

  it('MONO DOWN yields cumTick = -length (bit-exact)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const ch = computeLineCumTick(closes, { length: 5 });
    for (let i = 5; i < 20; i += 1) {
      expect(ch.cumTick[i]).toBe(-5);
    }
  });

  it('ALTERNATING with even length yields cumTick = 0 (bit-exact)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 10 : 11));
    const ch = computeLineCumTick(closes, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.cumTick[i]).toBe(0);
    }
  });

  it('output length matches input length', () => {
    const closes = Array(20).fill(5);
    const ch = computeLineCumTick(closes, { length: 4 });
    expect(ch.cumTick.length).toBe(20);
    expect(ch.direction.length).toBe(20);
  });

  it('does not mutate input', () => {
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const snap = closes.slice();
    computeLineCumTick(closes, { length: 4 });
    expect(closes).toEqual(snap);
  });
});

describe('classifyLineCumTickZone', () => {
  it('classifies positive', () => {
    expect(classifyLineCumTickZone(5)).toBe('positive');
  });

  it('classifies negative', () => {
    expect(classifyLineCumTickZone(-5)).toBe('negative');
  });

  it('classifies zero', () => {
    expect(classifyLineCumTickZone(0)).toBe('zero');
  });

  it('returns none for null', () => {
    expect(classifyLineCumTickZone(null)).toBe('none');
  });

  it('returns none for NaN', () => {
    expect(classifyLineCumTickZone(Number.NaN)).toBe('none');
  });
});

describe('detectLineCumTickCrosses', () => {
  it('returns [null, null] for warmup', () => {
    expect(detectLineCumTickCrosses([null, null])).toEqual([null, null]);
  });

  it('flags up when prev <= 0 and current > 0', () => {
    const crosses = detectLineCumTickCrosses([null, -1, 1]);
    expect(crosses[2]).toBe('up');
  });

  it('flags down when prev >= 0 and current < 0', () => {
    const crosses = detectLineCumTickCrosses([null, 1, -1]);
    expect(crosses[2]).toBe('down');
  });

  it('no cross when both positive', () => {
    const crosses = detectLineCumTickCrosses([null, 1, 2]);
    expect(crosses[2]).toBe(null);
  });

  it('detects multiple crosses', () => {
    const crosses = detectLineCumTickCrosses([null, 1, -1, 1]);
    expect(crosses[2]).toBe('down');
    expect(crosses[3]).toBe('up');
  });

  it('first defined bar is not a cross', () => {
    const crosses = detectLineCumTickCrosses([null, 1]);
    expect(crosses[1]).toBe(null);
  });
});

describe('runLineCumTick', () => {
  it('marks ok=false when data is too short', () => {
    const run = runLineCumTick(constClose(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with length + 1 points', () => {
    const run = runLineCumTick(constClose(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineCumTick(constClose(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_CUM_TICK_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineCumTick(constClose(30, 10), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineCumTickPoint[] = [
      { x: 2, close: 10 },
      { x: 0, close: 10 },
      { x: 1, close: 10 },
    ];
    const run = runLineCumTick(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies post-warmup as zero', () => {
    const run = runLineCumTick(constClose(20, 10), { length: 4 });
    expect(run.zeroCount).toBe(16);
    expect(run.positiveCount).toBe(0);
    expect(run.negativeCount).toBe(0);
  });

  it('MONO UP classifies post-warmup as positive', () => {
    const run = runLineCumTick(monoUp(20), { length: 5 });
    expect(run.positiveCount).toBe(15);
    expect(run.negativeCount).toBe(0);
  });

  it('MONO DOWN classifies post-warmup as negative', () => {
    const run = runLineCumTick(monoDown(20), { length: 5 });
    expect(run.negativeCount).toBe(15);
  });

  it('no crosses when zone is stable', () => {
    const run = runLineCumTick(monoUp(20), { length: 5 });
    expect(run.bullishCrossCount).toBe(0);
    expect(run.bearishCrossCount).toBe(0);
  });
});

describe('computeLineCumTickLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineCumTickLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
    });
    expect(layout.ok).toBe(true);
  });

  it('uses the explicit width and height', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
      width: 600,
      height: 400,
    });
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(400);
  });

  it('panels stack with price above cumTick', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
    });
    expect(layout.priceBottom).toBeLessThan(layout.cumTickTop);
  });

  it('panel gap is respected', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
      panelGap: 24,
    });
    expect(layout.cumTickTop - layout.priceBottom).toBeCloseTo(24, 9);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('CONST yields zero markers (no crosses)', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
    });
    expect(layout.markers.length).toBe(0);
  });

  it('y range covers [-length, +length]', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
      length: 14,
    });
    expect(layout.cumTickMin).toBeLessThanOrEqual(-14);
    expect(layout.cumTickMax).toBeGreaterThanOrEqual(14);
  });

  it('zero line y is between cumTickTop and cumTickBottom', () => {
    const layout = computeLineCumTickLayout({
      data: constClose(30, 10),
    });
    expect(layout.zeroLineY).toBeGreaterThanOrEqual(layout.cumTickTop);
    expect(layout.zeroLineY).toBeLessThanOrEqual(layout.cumTickBottom);
  });

  it('handles a single point gracefully', () => {
    const layout = computeLineCumTickLayout({
      data: [{ x: 0, close: 10 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineCumTickChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineCumTickChart([])).toBe('No data');
  });

  it('mentions Cumulative Tick', () => {
    const desc = describeLineCumTickChart(constClose(30, 10));
    expect(desc).toContain('Cumulative Tick');
  });

  it('mentions the formula', () => {
    const desc = describeLineCumTickChart(constClose(30, 10));
    expect(desc).toContain('sign(close[i] - close[i - 1])');
  });

  it('reports the length', () => {
    const desc = describeLineCumTickChart(constClose(30, 10), { length: 7 });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineCumTick />', () => {
  it('renders an empty placeholder for no data', () => {
    const { container } = render(<ChartLineCumTick data={[]} />);
    const placeholder = container.querySelector(
      '[data-section="chart-line-cum-tick-empty"]',
    );
    expect(placeholder?.textContent).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Cumulative Tick');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineCumTick data={constClose(30, 10)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data-length', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} length={7} />,
    );
    const root = container.querySelector('[data-section="chart-line-cum-tick"]');
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    const root = container.querySelector('[data-section="chart-line-cum-tick"]');
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-cum-tick-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Cumulative Tick');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="cumTick"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineCumTick
        data={constClose(30, 10)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="cumTick"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'cumTick',
      hidden: true,
    });
  });

  it('hides cumTick when controlled hidden', () => {
    const { container } = render(
      <ChartLineCumTick
        data={constClose(30, 10)}
        hiddenSeries={['cumTick']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-badge"]'),
    ).toBeTruthy();
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cum-tick-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cum-tick-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-grid"]'),
    ).toBe(null);
  });

  it('hides markers when showMarkers is false', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} showMarkers={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-markers"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineCumTick
        data={constClose(30, 10)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector('[data-section="chart-line-cum-tick"]');
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-cum-tick-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(false);
  });

  it('renders the cumTick line by default', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-cum-tick-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineCumTick data={constClose(30, 10)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-cum-tick-price-path"]',
      ),
    ).toBeTruthy();
  });
});

describe('Cumulative Tick integration', () => {
  it('CONST close yields cumTick = 0 across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 10]) {
        const closes = Array(L + 5).fill(K);
        const ch = computeLineCumTick(closes, { length: L });
        for (let i = L; i < L + 5; i += 1) {
          expect(ch.cumTick[i]).toBe(0);
        }
      }
    }
  });

  it('MONO UP yields cumTick = +L across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const closes = Array.from({ length: L + 5 }, (_, i) => i + 1);
      const ch = computeLineCumTick(closes, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.cumTick[i]).toBe(L);
      }
    }
  });

  it('MONO DOWN yields cumTick = -L across length sweep', () => {
    for (const L of [3, 4, 7, 10]) {
      const closes = Array.from({ length: L + 5 }, (_, i) => 100 - i);
      const ch = computeLineCumTick(closes, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.cumTick[i]).toBe(-L);
      }
    }
  });

  it('ALTERNATING with even L yields cumTick = 0', () => {
    for (const L of [2, 4, 6, 8, 10]) {
      const points = alternating(L + 5);
      const closes = points.map((p) => p.close);
      const ch = computeLineCumTick(closes, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.cumTick[i]).toBe(0);
      }
    }
  });
});
