import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKamaCross,
  classifyLineKamaCrossRegime,
  classifyLineKamaCrossRelation,
  computeLineKamaCross,
  computeLineKamaCrossEfficiencyRatio,
  computeLineKamaCrossLayout,
  describeLineKamaCrossChart,
  detectLineKamaCrossCrosses,
  getLineKamaCrossFinitePoints,
  normalizeLineKamaCrossLength,
  runLineKamaCross,
  DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH,
  DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH,
} from './chart-line-kama-cross';
import type { ChartLineKamaCrossPoint } from './chart-line-kama-cross';

const constBar = (count: number, K: number): ChartLineKamaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineKamaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineKamaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineKamaCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineKamaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN close', () => {
    const r = getLineKamaCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineKamaCrossFinitePoints([
      null as unknown as ChartLineKamaCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineKamaCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineKamaCrossLength(undefined, 10)).toBe(10);
  });

  it('rejects below 2', () => {
    expect(normalizeLineKamaCrossLength(1, 10)).toBe(10);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineKamaCrossLength(5, 10)).toBe(5);
  });
});

describe('computeLineKamaCrossEfficiencyRatio', () => {
  it('CONST yields ER = 0 (no movement)', () => {
    const er = computeLineKamaCrossEfficiencyRatio([5, 5, 5, 5, 5], 3);
    expect(er[0]).toBe(null);
    expect(er[1]).toBe(null);
    expect(er[2]).toBe(null);
    expect(er[3]).toBe(0);
    expect(er[4]).toBe(0);
  });

  it('LINEAR UP yields ER = 1 (perfect efficiency)', () => {
    const er = computeLineKamaCrossEfficiencyRatio([1, 2, 3, 4, 5], 3);
    expect(er[3]).toBe(1);
    expect(er[4]).toBe(1);
  });

  it('zig-zag yields ER < 1', () => {
    // 1,2,1,2,1 -> at i=3: |2-1| / (1+1+1) = 1/3
    const er = computeLineKamaCrossEfficiencyRatio([1, 2, 1, 2, 1], 3);
    expect(er[3]).toBeCloseTo(1 / 3, 10);
  });

  it('warmup is null', () => {
    const er = computeLineKamaCrossEfficiencyRatio([1, 2, 3], 3);
    expect(er[0]).toBe(null);
    expect(er[1]).toBe(null);
    expect(er[2]).toBe(null);
  });
});

describe('computeLineKamaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineKamaCross(null);
    expect(ch.kama).toEqual([]);
    expect(ch.deviation).toEqual([]);
  });

  it('CONST close yields KAMA = K bit-exact and deviation = 0', () => {
    const ch = computeLineKamaCross(constBar(15, 50), { erLength: 3 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.kama[i]).toBe(50);
      expect(ch.deviation[i]).toBe(0);
    }
  });

  it('LINEAR UP yields KAMA seeded at close[erLength] and lagging close', () => {
    const ch = computeLineKamaCross(linearUp(15), { erLength: 3 });
    // seed at i=3 is close[3] = 4
    expect(ch.kama[3]).toBe(4);
    expect(ch.deviation[3]).toBe(0);
    // at i=4 onward, KAMA lags close (deviation > 0)
    for (let i = 4; i < 15; i += 1) {
      expect(ch.deviation[i] as number).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN yields KAMA seeded at close[erLength] and leading close', () => {
    const ch = computeLineKamaCross(linearDown(15), { erLength: 3 });
    expect(ch.kama[3]).toBe(linearDown(15)[3]?.close);
    expect(ch.deviation[3]).toBe(0);
    for (let i = 4; i < 15; i += 1) {
      expect(ch.deviation[i] as number).toBeLessThan(0);
    }
  });

  it('fastSC and slowSC default to 2/3 and 2/31', () => {
    const ch = computeLineKamaCross(linearUp(15));
    expect(ch.fastSC).toBe(2 / 3);
    expect(ch.slowSC).toBe(2 / 31);
  });

  it('output length matches input length', () => {
    const ch = computeLineKamaCross(linearUp(15), { erLength: 3 });
    expect(ch.kama.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineKamaCross(data, { erLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineKamaCrossRelation', () => {
  it('bullish when close > kama', () => {
    expect(classifyLineKamaCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < kama', () => {
    expect(classifyLineKamaCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == kama', () => {
    expect(classifyLineKamaCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineKamaCrossRelation(null, 5)).toBe('none');
  });
});

describe('classifyLineKamaCrossRegime', () => {
  it('trending-up for bullish', () => {
    expect(classifyLineKamaCrossRegime('bullish')).toBe('trending-up');
  });

  it('trending-down for bearish', () => {
    expect(classifyLineKamaCrossRegime('bearish')).toBe('trending-down');
  });

  it('neutral for equal', () => {
    expect(classifyLineKamaCrossRegime('equal')).toBe('neutral');
  });

  it('none for none', () => {
    expect(classifyLineKamaCrossRegime('none')).toBe('none');
  });
});

describe('detectLineKamaCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineKamaCrossCrosses([5, 10], [5, 8])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineKamaCrossCrosses([10, 5], [10, 8])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLineKamaCrossCrosses([null, 5], [null, 4])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineKamaCrossCrosses([10, 11, 12], [9, 9, 9]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineKamaCross', () => {
  it('ok=false on short data', () => {
    const run = runLineKamaCross(constBar(3, 50), { erLength: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineKamaCross(constBar(10, 50), { erLength: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineKamaCross(constBar(40, 50));
    expect(run.erLength).toBe(DEFAULT_CHART_LINE_KAMA_CROSS_ER_LENGTH);
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_KAMA_CROSS_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_KAMA_CROSS_SLOW_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineKamaCross(constBar(20, 50), {
      erLength: 5,
      fastLength: 3,
      slowLength: 20,
    });
    expect(run.erLength).toBe(5);
    expect(run.fastLength).toBe(3);
    expect(run.slowLength).toBe(20);
  });

  it('sorts by x', () => {
    const data: ChartLineKamaCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineKamaCross(data, { erLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineKamaCross(constBar(15, 50), { erLength: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR UP yields exactly 1 up cross', () => {
    const run = runLineKamaCross(linearUp(15), { erLength: 3 });
    expect(run.upCrossCount).toBe(1);
    expect(run.downCrossCount).toBe(0);
  });

  it('LINEAR DOWN yields exactly 1 down cross', () => {
    const run = runLineKamaCross(linearDown(15), { erLength: 3 });
    expect(run.downCrossCount).toBe(1);
    expect(run.upCrossCount).toBe(0);
  });

  it('CONST regime is neutral after seed', () => {
    const run = runLineKamaCross(constBar(15, 50), { erLength: 3 });
    expect(run.samples[7]?.regime).toBe('neutral');
  });

  it('LINEAR UP regime is trending-up after seed', () => {
    const run = runLineKamaCross(linearUp(15), { erLength: 3 });
    expect(run.samples[7]?.regime).toBe('trending-up');
  });

  it('LINEAR DOWN regime is trending-down after seed', () => {
    const run = runLineKamaCross(linearDown(15), { erLength: 3 });
    expect(run.samples[7]?.regime).toBe('trending-down');
  });
});

describe('computeLineKamaCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineKamaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineKamaCrossLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLineKamaCrossLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price + kama + deviation paths', () => {
    const layout = computeLineKamaCrossLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.kamaPath.length).toBeGreaterThan(0);
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('LINEAR UP layout has exactly 1 marker', () => {
    const layout = computeLineKamaCrossLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.markers.length).toBe(1);
    expect(layout.markers[0]?.kind).toBe('up');
  });

  it('CONST layout has 0 markers', () => {
    const layout = computeLineKamaCrossLayout({
      data: constBar(15, 50),
      erLength: 3,
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineKamaCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineKamaCrossChart([])).toBe('No data');
  });

  it('mentions KAMA Cross', () => {
    expect(describeLineKamaCrossChart(linearUp(15))).toContain('KAMA Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineKamaCrossChart(linearUp(15), {
      erLength: 5,
      fastLength: 3,
      slowLength: 20,
    });
    expect(desc).toContain('erLength 5');
    expect(desc).toContain('fastLength 3');
    expect(desc).toContain('slowLength 20');
  });
});

describe('<ChartLineKamaCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineKamaCross data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('KAMA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKamaCross data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineKamaCross
        data={linearUp(15)}
        erLength={5}
        fastLength={3}
        slowLength={20}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross"]',
    );
    expect(root?.getAttribute('data-er-length')).toBe('5');
    expect(root?.getAttribute('data-fast-length')).toBe('3');
    expect(root?.getAttribute('data-slow-length')).toBe('20');
  });

  it('exposes cross counts', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} erLength={3} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('1');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-aria-desc"]',
      )?.textContent,
    ).toContain('KAMA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="kama"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKamaCross
        data={linearUp(15)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="kama"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'kama', hidden: true });
  });

  it('hides kama when controlled', () => {
    const { container } = render(
      <ChartLineKamaCross
        data={linearUp(15)}
        hiddenSeries={['kama']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-kama"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineKamaCross
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-kama-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders kama + deviation paths', () => {
    const { container } = render(
      <ChartLineKamaCross data={linearUp(15)} erLength={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-kama"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineKamaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineKamaCross
        data={linearUp(15)}
        defaultHiddenSeries={['kama']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-cross-kama"]'),
    ).toBe(null);
  });
});

describe('KAMA Cross integration', () => {
  it('CONST yields zero crosses across multiple erLengths', () => {
    for (const N of [3, 5, 7]) {
      const run = runLineKamaCross(constBar(N * 3, 50), { erLength: N });
      expect(run.upCrossCount).toBe(0);
      expect(run.downCrossCount).toBe(0);
    }
  });

  it('LINEAR UP yields 1 up cross across multiple erLengths', () => {
    for (const N of [3, 5, 7]) {
      const run = runLineKamaCross(linearUp(N * 3), { erLength: N });
      expect(run.upCrossCount).toBe(1);
      expect(run.downCrossCount).toBe(0);
    }
  });

  it('LINEAR DOWN yields 1 down cross across multiple erLengths', () => {
    for (const N of [3, 5, 7]) {
      const run = runLineKamaCross(linearDown(N * 3), { erLength: N });
      expect(run.downCrossCount).toBe(1);
      expect(run.upCrossCount).toBe(0);
    }
  });
});
