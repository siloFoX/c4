import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineZlemaCross,
  applyLineZlemaCrossEma,
  classifyLineZlemaCrossRegime,
  classifyLineZlemaCrossRelation,
  computeLineZlemaCross,
  computeLineZlemaCrossLayout,
  describeLineZlemaCrossChart,
  detectLineZlemaCrossCrosses,
  getLineZlemaCrossFinitePoints,
  normalizeLineZlemaCrossLength,
  runLineZlemaCross,
  DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH,
} from './chart-line-zlema-cross';
import type { ChartLineZlemaCrossPoint } from './chart-line-zlema-cross';

const constBar = (count: number, K: number): ChartLineZlemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineZlemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineZlemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineZlemaCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineZlemaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineZlemaCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineZlemaCrossFinitePoints([
      null as unknown as ChartLineZlemaCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineZlemaCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineZlemaCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineZlemaCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineZlemaCrossLength(5, 14)).toBe(5);
  });
});

describe('applyLineZlemaCrossEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineZlemaCrossEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineZlemaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineZlemaCross(null);
    expect(ch.zlema).toEqual([]);
  });

  it('CONST K yields ZLEMA = K bit-exact and adjusted = K', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineZlemaCross(constBar(20, K), { length: 5 });
      const lag = Math.floor((5 - 1) / 2);
      const seedIdx = lag + 5 - 1;
      for (let i = seedIdx; i < 20; i += 1) {
        expect(ch.adjusted[i]).toBe(K);
        expect(ch.zlema[i]).toBe(K);
      }
    }
  });

  it('lag = floor((length - 1) / 2)', () => {
    expect(computeLineZlemaCross(constBar(10, 50), { length: 14 }).lag).toBe(
      6,
    );
    expect(computeLineZlemaCross(constBar(10, 50), { length: 5 }).lag).toBe(
      2,
    );
  });

  it('output length matches input', () => {
    const ch = computeLineZlemaCross(linearUp(20), { length: 5 });
    expect(ch.zlema.length).toBe(20);
    expect(ch.adjusted.length).toBe(20);
  });

  it('does not mutate input', () => {
    const data = linearUp(20);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineZlemaCross(data, { length: 5 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineZlemaCrossRelation', () => {
  it('bullish when close > zlema', () => {
    expect(classifyLineZlemaCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < zlema', () => {
    expect(classifyLineZlemaCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == zlema', () => {
    expect(classifyLineZlemaCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineZlemaCrossRelation(null, 5)).toBe('none');
  });
});

describe('classifyLineZlemaCrossRegime', () => {
  it('trending-up for bullish', () => {
    expect(classifyLineZlemaCrossRegime('bullish')).toBe('trending-up');
  });

  it('trending-down for bearish', () => {
    expect(classifyLineZlemaCrossRegime('bearish')).toBe('trending-down');
  });

  it('aligned for equal', () => {
    expect(classifyLineZlemaCrossRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineZlemaCrossRegime('none')).toBe('none');
  });
});

describe('detectLineZlemaCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineZlemaCrossCrosses([5, 10], [5, 8])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineZlemaCrossCrosses([10, 5], [10, 8])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(
      detectLineZlemaCrossCrosses([null, 5], [null, 4]),
    ).toEqual([null, null]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineZlemaCrossCrosses([10, 11, 12], [9, 9, 9]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineZlemaCross', () => {
  it('ok=false on short data', () => {
    const run = runLineZlemaCross(constBar(3, 50), { length: 5 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineZlemaCross(constBar(20, 50), { length: 5 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineZlemaCross(constBar(40, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ZLEMA_CROSS_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineZlemaCross(constBar(20, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineZlemaCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineZlemaCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineZlemaCross(constBar(20, 50), { length: 5 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST regime is aligned after warmup', () => {
    const run = runLineZlemaCross(constBar(20, 50), { length: 5 });
    expect(run.samples[10]?.regime).toBe('aligned');
  });
});

describe('computeLineZlemaCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineZlemaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineZlemaCrossLayout({
      data: linearUp(20),
      length: 5,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLineZlemaCrossLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price + zlema + deviation paths', () => {
    const layout = computeLineZlemaCrossLayout({
      data: linearUp(20),
      length: 5,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.zlemaPath.length).toBeGreaterThan(0);
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('CONST produces zero markers', () => {
    const layout = computeLineZlemaCrossLayout({
      data: constBar(20, 50),
      length: 5,
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineZlemaCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineZlemaCrossChart([])).toBe('No data');
  });

  it('mentions ZLEMA Cross', () => {
    expect(describeLineZlemaCrossChart(linearUp(20))).toContain(
      'ZLEMA Cross',
    );
  });

  it('reports length', () => {
    expect(describeLineZlemaCrossChart(linearUp(20), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineZlemaCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineZlemaCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ZLEMA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineZlemaCross data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-lag')).toBe('2');
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('exposes cross counts', () => {
    const { container } = render(
      <ChartLineZlemaCross data={constBar(20, 50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-aria-desc"]',
      )?.textContent,
    ).toContain('ZLEMA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="zlema"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineZlemaCross
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="zlema"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'zlema', hidden: true });
  });

  it('hides zlema when controlled', () => {
    const { container } = render(
      <ChartLineZlemaCross
        data={linearUp(20)}
        hiddenSeries={['zlema']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-cross-zlema"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineZlemaCross
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-zlema-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-zlema-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders zlema + deviation paths', () => {
    const { container } = render(
      <ChartLineZlemaCross data={linearUp(20)} length={5} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-zlema-cross-zlema"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineZlemaCross data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineZlemaCross
        data={linearUp(20)}
        defaultHiddenSeries={['deviation']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-zlema-cross-deviation"]',
      ),
    ).toBe(null);
  });
});

describe('ZLEMA Cross integration', () => {
  it('CONST K yields zero crosses across multiple K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 7, 14]) {
        const run = runLineZlemaCross(constBar(L * 3, K), { length: L });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
        const lag = Math.floor((L - 1) / 2);
        const seedIdx = lag + L - 1;
        for (let i = seedIdx; i < L * 3; i += 1) {
          expect(run.samples[i]?.zlema).toBe(K);
          expect(run.samples[i]?.deviation).toBe(0);
        }
      }
    }
  });
});
