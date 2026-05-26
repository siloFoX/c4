import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDonchianCross,
  applyLineDonchianCrossRollingMax,
  applyLineDonchianCrossRollingMin,
  classifyLineDonchianCrossRelation,
  computeLineDonchianCross,
  computeLineDonchianCrossLayout,
  describeLineDonchianCrossChart,
  detectLineDonchianCrossCrosses,
  getLineDonchianCrossFinitePoints,
  normalizeLineDonchianCrossLength,
  runLineDonchianCross,
  DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH,
} from './chart-line-donchian-cross';
import type { ChartLineDonchianCrossPoint } from './chart-line-donchian-cross';

const constBar = (count: number, K: number): ChartLineDonchianCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineDonchianCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineDonchianCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

const stepUp = (count: number, K1: number, K2: number, n: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i < n ? K1 : K2,
    low: i < n ? K1 : K2,
    close: i < n ? K1 : K2,
  }));

describe('getLineDonchianCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineDonchianCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineDonchianCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineDonchianCrossFinitePoints([
      null as unknown as ChartLineDonchianCrossPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineDonchianCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineDonchianCrossLength(undefined, 20)).toBe(20);
  });

  it('rejects below 2', () => {
    expect(normalizeLineDonchianCrossLength(1, 20)).toBe(20);
  });

  it('floors fractional', () => {
    expect(normalizeLineDonchianCrossLength(7.7, 20)).toBe(7);
  });
});

describe('applyLineDonchianCrossRollingMax', () => {
  it('excludes current bar - window is [i-length, i-1]', () => {
    const out = applyLineDonchianCrossRollingMax([1, 2, 3, 4, 5], 2);
    expect(out[2]).toBe(2);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('CONST K rolling max is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineDonchianCrossRollingMax(
        Array(10).fill(K),
        4,
      );
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup region (i < length) is null', () => {
    const out = applyLineDonchianCrossRollingMax([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(3);
  });
});

describe('applyLineDonchianCrossRollingMin', () => {
  it('CONST K rolling min is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineDonchianCrossRollingMin(
        Array(10).fill(K),
        4,
      );
      for (let i = 4; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineDonchianCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineDonchianCross(null);
    expect(ch.upper).toEqual([]);
    expect(ch.lower).toEqual([]);
  });

  it('CONST yields upper = lower = K', () => {
    const series = constBar(20, 10);
    const ch = computeLineDonchianCross(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.upper[i]).toBe(10);
      expect(ch.lower[i]).toBe(10);
    }
  });

  it('LINEAR UP: upper at i is i, lower at i is i-length+1', () => {
    const series = linearUp(20);
    const ch = computeLineDonchianCross(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      // window = [i-4, i-1], highs from i-3 to i. close[i-1] = i, so upper = i.
      expect(ch.upper[i]).toBe(i);
      // lows from i-3 to i. close[i-4] = i-3, so lower = i-3.
      expect(ch.lower[i]).toBe(i - 3);
    }
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineDonchianCross(series, { length: 4 });
    expect(ch.upper.length).toBe(20);
    expect(ch.lower.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineDonchianCross(series, { length: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineDonchianCrossRelation', () => {
  it('above when close > upper', () => {
    expect(classifyLineDonchianCrossRelation(11, 10, 5)).toBe('above');
  });

  it('below when close < lower', () => {
    expect(classifyLineDonchianCrossRelation(4, 10, 5)).toBe('below');
  });

  it('inside when close in band', () => {
    expect(classifyLineDonchianCrossRelation(7, 10, 5)).toBe('inside');
  });

  it('inside when close === upper (not strict)', () => {
    expect(classifyLineDonchianCrossRelation(10, 10, 5)).toBe('inside');
  });

  it('none when band null', () => {
    expect(classifyLineDonchianCrossRelation(7, null, null)).toBe('none');
  });
});

describe('detectLineDonchianCrossCrosses', () => {
  it('flags up cross when close newly breaks above upper', () => {
    // prev: close=5, upper=10 (inside) -> curr: close=12, upper=10 (above)
    const ev = detectLineDonchianCrossCrosses(
      [5, 12],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when close newly breaks below lower', () => {
    const ev = detectLineDonchianCrossCrosses(
      [5, -1],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('down');
  });

  it('no second cross when staying above', () => {
    const ev = detectLineDonchianCrossCrosses(
      [12, 14, 15],
      [10, 10, 10],
      [0, 0, 0],
    );
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });

  it('null on warmup', () => {
    const ev = detectLineDonchianCrossCrosses(
      [5, 11],
      [null, 10],
      [null, 0],
    );
    expect(ev[0]).toBe(null);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineDonchianCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineDonchianCross(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineDonchianCross(constBar(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineDonchianCross(constBar(30, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_DONCHIAN_CROSS_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineDonchianCross(constBar(30, 10), { length: 7 });
    expect(run.length).toBe(7);
  });

  it('sorts by x', () => {
    const data: ChartLineDonchianCrossPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineDonchianCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineDonchianCross(constBar(20, 10), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineDonchianCross(linearUp(20), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields zero crosses', () => {
    const run = runLineDonchianCross(linearDown(20), { length: 4 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up yields exactly one up cross at step index', () => {
    const run = runLineDonchianCross(stepUp(20, 1, 5, 10), { length: 4 });
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
    const idx = run.samples.findIndex((s) => s.crossed === 'up');
    expect(idx).toBe(10);
  });

  it('STEP down yields exactly one down cross at step index', () => {
    const run = runLineDonchianCross(stepUp(20, 5, 1, 10), { length: 4 });
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
    const idx = run.samples.findIndex((s) => s.crossed === 'down');
    expect(idx).toBe(10);
  });
});

describe('computeLineDonchianCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineDonchianCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineDonchianCrossLayout({
      data: linearUp(30),
    });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineDonchianCrossLayout({
      data: linearUp(30),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces upper and lower band paths', () => {
    const layout = computeLineDonchianCrossLayout({
      data: linearUp(30),
      length: 5,
    });
    expect(layout.upperPath.length).toBeGreaterThan(0);
    expect(layout.lowerPath.length).toBeGreaterThan(0);
  });

  it('produces cross markers for STEP', () => {
    const layout = computeLineDonchianCrossLayout({
      data: stepUp(20, 1, 5, 10),
      length: 4,
    });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });
});

describe('describeLineDonchianCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineDonchianCrossChart([])).toBe('No data');
  });

  it('mentions Donchian Cross', () => {
    const desc = describeLineDonchianCrossChart(linearUp(30));
    expect(desc).toContain('Donchian Cross');
  });

  it('reports length', () => {
    const desc = describeLineDonchianCrossChart(linearUp(30), {
      length: 7,
    });
    expect(desc).toContain('length 7');
  });
});

describe('<ChartLineDonchianCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineDonchianCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Donchian');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDonchianCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} length={7} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={stepUp(20, 1, 5, 10)}
        length={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Donchian Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="upper"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lower"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="upper"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'upper',
      hidden: true,
    });
  });

  it('hides upper when controlled hidden', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        hiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-upper"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-donchian-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-donchian-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders upper and lower paths', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} length={5} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-upper"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-lower"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineDonchianCross data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders cross markers for STEP', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={stepUp(20, 1, 5, 10)}
        length={4}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-donchian-cross-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]?.getAttribute('data-kind')).toBe('up');
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineDonchianCross
        data={linearUp(30)}
        defaultHiddenSeries={['lower']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-donchian-cross-lower"]',
      ),
    ).toBe(null);
  });
});

describe('Donchian Cross integration', () => {
  it('CONST yields zero crosses across (K, length)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 10]) {
        const run = runLineDonchianCross(constBar(L + 10, K), {
          length: L,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('LINEAR yields zero crosses across (length)', () => {
    for (const dataFn of [linearUp, linearDown]) {
      for (const L of [2, 4, 7]) {
        const run = runLineDonchianCross(dataFn(L + 10), { length: L });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('STEP yields deterministic single cross at step index', () => {
    for (const [K1, K2, expected] of [
      [1, 5, 'up'],
      [5, 1, 'down'],
      [10, 100, 'up'],
      [100, 10, 'down'],
    ] as const) {
      for (const L of [2, 4, 7]) {
        const N = L + 5;
        const run = runLineDonchianCross(stepUp(N + 10, K1, K2, N), {
          length: L,
        });
        const idx = run.samples.findIndex((s) => s.crossed != null);
        expect(idx).toBe(N);
        expect(run.samples[idx]?.crossed).toBe(expected);
        if (expected === 'up') {
          expect(run.upCrossCount).toBe(1);
          expect(run.downCrossCount).toBe(0);
        } else {
          expect(run.downCrossCount).toBe(1);
          expect(run.upCrossCount).toBe(0);
        }
      }
    }
  });
});
