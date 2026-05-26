import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSmaCross,
  applyLineSmaCrossSma,
  classifyLineSmaCrossRelation,
  computeLineSmaCross,
  computeLineSmaCrossLayout,
  describeLineSmaCrossChart,
  detectLineSmaCrossCrosses,
  getLineSmaCrossFinitePoints,
  normalizeLineSmaCrossLength,
  runLineSmaCross,
  DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH,
} from './chart-line-sma-cross';
import type { ChartLineSmaCrossPoint } from './chart-line-sma-cross';

const constBar = (count: number, K: number): ChartLineSmaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineSmaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const stepUp = (count: number, K1: number, K2: number, n: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i < n ? K1 : K2,
  }));

describe('getLineSmaCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSmaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineSmaCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineSmaCrossFinitePoints([
      null as unknown as ChartLineSmaCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineSmaCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmaCrossLength(undefined, 10)).toBe(10);
  });

  it('rejects below 2', () => {
    expect(normalizeLineSmaCrossLength(1, 10)).toBe(10);
  });

  it('floors fractional', () => {
    expect(normalizeLineSmaCrossLength(7.7, 10)).toBe(7);
  });
});

describe('applyLineSmaCrossSma', () => {
  it('CONST K SMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7]) {
        const out = applyLineSmaCrossSma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('LINEAR UP SMA at i=L-1 is (L+1)/2', () => {
    const out = applyLineSmaCrossSma([1, 2, 3], 3);
    expect(out[2]).toBe(2);
  });

  it('warmup is null', () => {
    const out = applyLineSmaCrossSma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineSmaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineSmaCross(null);
    expect(ch.fastSma).toEqual([]);
    expect(ch.slowSma).toEqual([]);
  });

  it('CONST close yields equal fast and slow SMAs', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(30, K);
      const ch = computeLineSmaCross(series, {
        fastLength: 5,
        slowLength: 10,
      });
      for (let i = 9; i < 30; i += 1) {
        expect(ch.fastSma[i]).toBe(K);
        expect(ch.slowSma[i]).toBe(K);
      }
    }
  });

  it('LINEAR UP yields fastSma - slowSma = (slow-fast)/2', () => {
    const series = linearUp(30);
    const ch = computeLineSmaCross(series, {
      fastLength: 5,
      slowLength: 10,
    });
    // For i >= 9, both defined. fast - slow = (slow-fast)/2 = 2.5
    for (let i = 9; i < 30; i += 1) {
      expect(ch.fastSma[i]! - ch.slowSma[i]!).toBe(2.5);
    }
  });

  it('output length matches input length', () => {
    const series = linearUp(30);
    const ch = computeLineSmaCross(series, {
      fastLength: 5,
      slowLength: 10,
    });
    expect(ch.fastSma.length).toBe(30);
    expect(ch.slowSma.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = linearUp(30);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineSmaCross(series, { fastLength: 5, slowLength: 10 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineSmaCrossRelation', () => {
  it('above when fast > slow', () => {
    expect(classifyLineSmaCrossRelation(2, 1)).toBe('above');
  });

  it('below when fast < slow', () => {
    expect(classifyLineSmaCrossRelation(1, 2)).toBe('below');
  });

  it('equal when fast === slow', () => {
    expect(classifyLineSmaCrossRelation(5, 5)).toBe('equal');
  });

  it('none when either is null', () => {
    expect(classifyLineSmaCrossRelation(null, 1)).toBe('none');
    expect(classifyLineSmaCrossRelation(1, null)).toBe('none');
  });
});

describe('detectLineSmaCrossCrosses', () => {
  it('flags up cross when fast crosses above slow', () => {
    const ev = detectLineSmaCrossCrosses([1, 3], [2, 2]);
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when fast crosses below slow', () => {
    const ev = detectLineSmaCrossCrosses([3, 1], [2, 2]);
    expect(ev[1]).toBe('down');
  });

  it('null on warmup', () => {
    const ev = detectLineSmaCrossCrosses([null, 1, 2], [null, 1.5, 1.5]);
    expect(ev[0]).toBe(null);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe('up');
  });

  it('no cross when steady above', () => {
    const ev = detectLineSmaCrossCrosses([3, 4, 5], [2, 2, 2]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineSmaCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineSmaCross(constBar(4, 10), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineSmaCross(constBar(5, 10), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineSmaCross(constBar(80, 10));
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_SMA_CROSS_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_SMA_CROSS_SLOW_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineSmaCross(constBar(80, 10), {
      fastLength: 7,
      slowLength: 21,
    });
    expect(run.fastLength).toBe(7);
    expect(run.slowLength).toBe(21);
  });

  it('sorts by x', () => {
    const data: ChartLineSmaCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineSmaCross(data, { fastLength: 2, slowLength: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close yields zero crosses', () => {
    const run = runLineSmaCross(constBar(30, 10), {
      fastLength: 5,
      slowLength: 10,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineSmaCross(linearUp(30), {
      fastLength: 5,
      slowLength: 10,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up yields exactly one up cross', () => {
    const run = runLineSmaCross(stepUp(15, 1, 5, 4), {
      fastLength: 2,
      slowLength: 4,
    });
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up cross fires at deterministic index', () => {
    const run = runLineSmaCross(stepUp(15, 1, 5, 4), {
      fastLength: 2,
      slowLength: 4,
    });
    // With fast=2, slow=4, K1=1, K2=5, step at index 4:
    // i=3 fastSma=1, slowSma=1 (4 ones)
    // i=4 fastSma=(1+5)/2=3, slowSma=(1+1+1+5)/4=2 -> up cross fires
    const upIdx = run.samples.findIndex((s) => s.crossed === 'up');
    expect(upIdx).toBe(4);
  });

  it('STEP down yields exactly one down cross', () => {
    const series = stepUp(15, 5, 1, 4);
    const run = runLineSmaCross(series, {
      fastLength: 2,
      slowLength: 4,
    });
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
  });
});

describe('computeLineSmaCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSmaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSmaCrossLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineSmaCrossLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces fast and slow paths', () => {
    const layout = computeLineSmaCrossLayout({
      data: linearUp(30),
      fastLength: 5,
      slowLength: 10,
    });
    expect(layout.fastPath.length).toBeGreaterThan(0);
    expect(layout.slowPath.length).toBeGreaterThan(0);
  });

  it('produces cross markers for STEP', () => {
    const layout = computeLineSmaCrossLayout({
      data: stepUp(15, 1, 5, 4),
      fastLength: 2,
      slowLength: 4,
    });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });

  it('no markers for CONST', () => {
    const layout = computeLineSmaCrossLayout({
      data: constBar(30, 10),
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineSmaCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSmaCrossChart([])).toBe('No data');
  });

  it('mentions SMA Cross', () => {
    const desc = describeLineSmaCrossChart(linearUp(30));
    expect(desc).toContain('SMA Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineSmaCrossChart(linearUp(30), {
      fastLength: 7,
      slowLength: 21,
    });
    expect(desc).toContain('fastLength 7');
    expect(desc).toContain('slowLength 21');
  });
});

describe('<ChartLineSmaCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineSmaCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('SMA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSmaCross data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={linearUp(30)}
        fastLength={7}
        slowLength={21}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('7');
    expect(root?.getAttribute('data-slow-length')).toBe('21');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={stepUp(15, 1, 5, 4)}
        fastLength={2}
        slowLength={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('15');
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-aria-desc"]',
      )?.textContent,
    ).toContain('SMA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="fast"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="slow"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSmaCross
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="fast"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'fast',
      hidden: true,
    });
  });

  it('hides fast when controlled hidden', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={linearUp(30)}
        hiddenSeries={['fast']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-fast"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-badge"]'),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSmaCross data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSmaCross data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSmaCross data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSmaCross data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-sma-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders fast and slow paths', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-fast"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-slow"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineSmaCross data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders cross markers for STEP', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={stepUp(15, 1, 5, 4)}
        fastLength={2}
        slowLength={4}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-sma-cross-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]?.getAttribute('data-kind')).toBe('up');
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSmaCross
        data={linearUp(30)}
        defaultHiddenSeries={['slow']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-cross-slow"]'),
    ).toBe(null);
  });
});

describe('SMA Cross integration', () => {
  it('CONST yields zero crosses across (K, fast, slow)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const [F, S] of [
        [2, 4],
        [5, 10],
        [10, 50],
      ] as const) {
        const run = runLineSmaCross(constBar(S + 10, K), {
          fastLength: F,
          slowLength: S,
        });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('LINEAR UP yields zero crosses', () => {
    for (const [F, S] of [
      [2, 4],
      [5, 10],
      [10, 50],
    ] as const) {
      const run = runLineSmaCross(linearUp(S + 10), {
        fastLength: F,
        slowLength: S,
      });
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
    }
  });
});
