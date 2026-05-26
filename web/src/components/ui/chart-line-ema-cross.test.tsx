import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineEmaCross,
  applyLineEmaCrossEma,
  classifyLineEmaCrossRelation,
  computeLineEmaCross,
  computeLineEmaCrossLayout,
  describeLineEmaCrossChart,
  detectLineEmaCrossCrosses,
  getLineEmaCrossFinitePoints,
  normalizeLineEmaCrossLength,
  runLineEmaCross,
  DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH,
} from './chart-line-ema-cross';
import type { ChartLineEmaCrossPoint } from './chart-line-ema-cross';

const constBar = (count: number, K: number): ChartLineEmaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineEmaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const stepUp = (count: number, K1: number, K2: number, n: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i < n ? K1 : K2,
  }));

describe('getLineEmaCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineEmaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineEmaCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineEmaCrossFinitePoints([
      null as unknown as ChartLineEmaCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineEmaCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineEmaCrossLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLineEmaCrossLength(1, 12)).toBe(12);
  });

  it('floors fractional', () => {
    expect(normalizeLineEmaCrossLength(7.7, 12)).toBe(7);
  });
});

describe('applyLineEmaCrossEma', () => {
  it('CONST K EMA is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7]) {
        const out = applyLineEmaCrossEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineEmaCrossEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('LINEAR UP seed is SMA at i=L-1', () => {
    const out = applyLineEmaCrossEma([1, 2, 3], 3);
    expect(out[2]).toBe(2);
  });
});

describe('computeLineEmaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineEmaCross(null);
    expect(ch.fastEma).toEqual([]);
    expect(ch.slowEma).toEqual([]);
  });

  it('CONST close yields equal fast and slow EMAs', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(30, K);
      const ch = computeLineEmaCross(series, {
        fastLength: 5,
        slowLength: 10,
      });
      for (let i = 9; i < 30; i += 1) {
        expect(ch.fastEma[i]).toBe(K);
        expect(ch.slowEma[i]).toBe(K);
      }
    }
  });

  it('output length matches input length', () => {
    const series = linearUp(30);
    const ch = computeLineEmaCross(series, {
      fastLength: 5,
      slowLength: 10,
    });
    expect(ch.fastEma.length).toBe(30);
    expect(ch.slowEma.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = linearUp(30);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineEmaCross(series, { fastLength: 5, slowLength: 10 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineEmaCrossRelation', () => {
  it('above when fast > slow', () => {
    expect(classifyLineEmaCrossRelation(2, 1)).toBe('above');
  });

  it('below when fast < slow', () => {
    expect(classifyLineEmaCrossRelation(1, 2)).toBe('below');
  });

  it('equal when fast === slow', () => {
    expect(classifyLineEmaCrossRelation(5, 5)).toBe('equal');
  });

  it('none when either is null', () => {
    expect(classifyLineEmaCrossRelation(null, 1)).toBe('none');
    expect(classifyLineEmaCrossRelation(1, null)).toBe('none');
  });
});

describe('detectLineEmaCrossCrosses', () => {
  it('flags up cross when fast crosses above slow', () => {
    const ev = detectLineEmaCrossCrosses([1, 3], [2, 2]);
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when fast crosses below slow', () => {
    const ev = detectLineEmaCrossCrosses([3, 1], [2, 2]);
    expect(ev[1]).toBe('down');
  });

  it('null on warmup', () => {
    const ev = detectLineEmaCrossCrosses([null, 1, 2], [null, 1.5, 1.5]);
    expect(ev[0]).toBe(null);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe('up');
  });

  it('no cross when steady above', () => {
    const ev = detectLineEmaCrossCrosses([3, 4, 5], [2, 2, 2]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineEmaCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineEmaCross(constBar(4, 10), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineEmaCross(constBar(5, 10), {
      fastLength: 3,
      slowLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineEmaCross(constBar(40, 10));
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_EMA_CROSS_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_EMA_CROSS_SLOW_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineEmaCross(constBar(40, 10), {
      fastLength: 7,
      slowLength: 21,
    });
    expect(run.fastLength).toBe(7);
    expect(run.slowLength).toBe(21);
  });

  it('sorts by x', () => {
    const data: ChartLineEmaCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineEmaCross(data, { fastLength: 2, slowLength: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close yields zero crosses', () => {
    const run = runLineEmaCross(constBar(30, 10), {
      fastLength: 5,
      slowLength: 10,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields zero crosses', () => {
    const run = runLineEmaCross(linearUp(40), {
      fastLength: 5,
      slowLength: 10,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up yields exactly one up cross', () => {
    const run = runLineEmaCross(stepUp(15, 1, 5, 4), {
      fastLength: 2,
      slowLength: 4,
    });
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
  });

  it('STEP up cross fires at deterministic index', () => {
    const run = runLineEmaCross(stepUp(15, 1, 5, 4), {
      fastLength: 2,
      slowLength: 4,
    });
    const upIdx = run.samples.findIndex((s) => s.crossed === 'up');
    expect(upIdx).toBe(4);
  });

  it('STEP down yields exactly one down cross', () => {
    const series = stepUp(15, 5, 1, 4);
    const run = runLineEmaCross(series, {
      fastLength: 2,
      slowLength: 4,
    });
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
  });
});

describe('computeLineEmaCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineEmaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineEmaCrossLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineEmaCrossLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces fast and slow paths', () => {
    const layout = computeLineEmaCrossLayout({
      data: linearUp(30),
      fastLength: 5,
      slowLength: 10,
    });
    expect(layout.fastPath.length).toBeGreaterThan(0);
    expect(layout.slowPath.length).toBeGreaterThan(0);
  });

  it('produces cross markers for STEP', () => {
    const layout = computeLineEmaCrossLayout({
      data: stepUp(15, 1, 5, 4),
      fastLength: 2,
      slowLength: 4,
    });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });

  it('no markers for CONST', () => {
    const layout = computeLineEmaCrossLayout({
      data: constBar(30, 10),
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineEmaCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineEmaCrossChart([])).toBe('No data');
  });

  it('mentions EMA Cross', () => {
    const desc = describeLineEmaCrossChart(linearUp(30));
    expect(desc).toContain('EMA Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineEmaCrossChart(linearUp(30), {
      fastLength: 7,
      slowLength: 21,
    });
    expect(desc).toContain('fastLength 7');
    expect(desc).toContain('slowLength 21');
  });
});

describe('<ChartLineEmaCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineEmaCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('EMA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEmaCross data={linearUp(40)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineEmaCross
        data={linearUp(40)}
        fastLength={7}
        slowLength={21}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('7');
    expect(root?.getAttribute('data-slow-length')).toBe('21');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineEmaCross
        data={stepUp(15, 1, 5, 4)}
        fastLength={2}
        slowLength={4}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('15');
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-aria-desc"]',
      )?.textContent,
    ).toContain('EMA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="fast"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="slow"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineEmaCross
        data={linearUp(40)}
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
      <ChartLineEmaCross
        data={linearUp(40)}
        hiddenSeries={['fast']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-fast"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-badge"]'),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineEmaCross data={linearUp(40)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineEmaCross data={linearUp(40)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineEmaCross data={linearUp(40)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineEmaCross
        data={linearUp(40)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineEmaCross data={linearUp(40)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ema-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders fast and slow paths', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-fast"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-slow"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineEmaCross data={linearUp(40)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders cross markers for STEP', () => {
    const { container } = render(
      <ChartLineEmaCross
        data={stepUp(15, 1, 5, 4)}
        fastLength={2}
        slowLength={4}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-ema-cross-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]?.getAttribute('data-kind')).toBe('up');
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineEmaCross
        data={linearUp(40)}
        defaultHiddenSeries={['slow']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-cross-slow"]'),
    ).toBe(null);
  });
});

describe('EMA Cross integration', () => {
  it('CONST yields zero crosses across (K, fast, slow)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const [F, S] of [
        [2, 4],
        [5, 10],
        [12, 26],
      ] as const) {
        const run = runLineEmaCross(constBar(S + 10, K), {
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
      [12, 26],
    ] as const) {
      const run = runLineEmaCross(linearUp(S + 20), {
        fastLength: F,
        slowLength: S,
      });
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
    }
  });
});
