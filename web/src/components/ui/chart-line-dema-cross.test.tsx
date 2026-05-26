import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDemaCross,
  applyLineDemaCrossEma,
  classifyLineDemaCrossRegime,
  classifyLineDemaCrossRelation,
  computeLineDemaCross,
  computeLineDemaCrossLayout,
  describeLineDemaCrossChart,
  detectLineDemaCrossCrosses,
  getLineDemaCrossFinitePoints,
  normalizeLineDemaCrossLength,
  runLineDemaCross,
  DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH,
} from './chart-line-dema-cross';
import type { ChartLineDemaCrossPoint } from './chart-line-dema-cross';

const constBar = (count: number, K: number): ChartLineDemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineDemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineDemaCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineDemaCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineDemaCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineDemaCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineDemaCrossFinitePoints([
      null as unknown as ChartLineDemaCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineDemaCrossLength', () => {
  it('uses default', () => {
    expect(normalizeLineDemaCrossLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineDemaCrossLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineDemaCrossLength(5, 14)).toBe(5);
  });
});

describe('applyLineDemaCrossEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLineDemaCrossEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineDemaCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineDemaCross(null);
    expect(ch.dema).toEqual([]);
  });

  it('CONST K yields DEMA = K bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineDemaCross(constBar(15, K), { length: 3 });
      for (let i = 4; i < 15; i += 1) {
        expect(ch.dema[i]).toBe(K);
      }
    }
  });

  it('output length matches input', () => {
    const ch = computeLineDemaCross(linearUp(15), { length: 3 });
    expect(ch.dema.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineDemaCross(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineDemaCrossRelation', () => {
  it('bullish when close > dema', () => {
    expect(classifyLineDemaCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < dema', () => {
    expect(classifyLineDemaCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == dema', () => {
    expect(classifyLineDemaCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineDemaCrossRelation(null, 5)).toBe('none');
  });
});

describe('classifyLineDemaCrossRegime', () => {
  it('trending-up for bullish', () => {
    expect(classifyLineDemaCrossRegime('bullish')).toBe('trending-up');
  });

  it('trending-down for bearish', () => {
    expect(classifyLineDemaCrossRegime('bearish')).toBe('trending-down');
  });

  it('aligned for equal', () => {
    expect(classifyLineDemaCrossRegime('equal')).toBe('aligned');
  });

  it('none for none', () => {
    expect(classifyLineDemaCrossRegime('none')).toBe('none');
  });
});

describe('detectLineDemaCrossCrosses', () => {
  it('up cross', () => {
    expect(detectLineDemaCrossCrosses([5, 10], [5, 8])[1]).toBe('up');
  });

  it('down cross', () => {
    expect(detectLineDemaCrossCrosses([10, 5], [10, 8])[1]).toBe('down');
  });

  it('warmup null', () => {
    expect(detectLineDemaCrossCrosses([null, 5], [null, 4])).toEqual([
      null,
      null,
    ]);
  });

  it('no second cross when staying above', () => {
    const ev = detectLineDemaCrossCrosses([10, 11, 12], [9, 9, 9]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineDemaCross', () => {
  it('ok=false on short data', () => {
    const run = runLineDemaCross(constBar(3, 50), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineDemaCross(constBar(20, 50), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineDemaCross(constBar(40, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_DEMA_CROSS_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineDemaCross(constBar(20, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineDemaCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineDemaCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineDemaCross(constBar(15, 50), { length: 3 });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST regime is aligned after warmup', () => {
    const run = runLineDemaCross(constBar(15, 50), { length: 3 });
    expect(run.samples[10]?.regime).toBe('aligned');
  });
});

describe('computeLineDemaCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineDemaCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineDemaCrossLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLineDemaCrossLayout({ data: linearUp(15) });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price + dema + deviation paths', () => {
    const layout = computeLineDemaCrossLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.demaPath.length).toBeGreaterThan(0);
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('CONST produces zero markers', () => {
    const layout = computeLineDemaCrossLayout({
      data: constBar(15, 50),
      length: 3,
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineDemaCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineDemaCrossChart([])).toBe('No data');
  });

  it('mentions DEMA Cross', () => {
    expect(describeLineDemaCrossChart(linearUp(15))).toContain('DEMA Cross');
  });

  it('reports length', () => {
    expect(describeLineDemaCrossChart(linearUp(15), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineDemaCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineDemaCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('DEMA Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDemaCross data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('15');
  });

  it('exposes cross counts', () => {
    const { container } = render(<ChartLineDemaCross data={constBar(15, 50)} />);
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross"]',
    );
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-aria-desc"]',
      )?.textContent,
    ).toContain('DEMA Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="dema"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDemaCross
        data={linearUp(15)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="dema"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'dema', hidden: true });
  });

  it('hides dema when controlled', () => {
    const { container } = render(
      <ChartLineDemaCross
        data={linearUp(15)}
        hiddenSeries={['dema']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-cross-dema"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineDemaCross
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-dema-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders dema + deviation paths', () => {
    const { container } = render(
      <ChartLineDemaCross data={linearUp(15)} length={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-cross-dema"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineDemaCross data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineDemaCross
        data={linearUp(15)}
        defaultHiddenSeries={['deviation']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-cross-deviation"]',
      ),
    ).toBe(null);
  });
});

describe('DEMA Cross integration', () => {
  it('CONST K yields zero crosses across multiple K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 7]) {
        const run = runLineDemaCross(constBar(L * 3, K), { length: L });
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
        for (let i = L * 2 - 1; i < L * 3; i += 1) {
          expect(run.samples[i]?.dema).toBe(K);
          expect(run.samples[i]?.deviation).toBe(0);
        }
      }
    }
  });
});
