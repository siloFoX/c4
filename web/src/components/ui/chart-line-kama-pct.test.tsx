import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKamaPct,
  classifyLineKamaPctRegime,
  computeLineKamaPct,
  computeLineKamaPctEfficiencyRatio,
  computeLineKamaPctLayout,
  describeLineKamaPctChart,
  getLineKamaPctFinitePoints,
  normalizeLineKamaPctLength,
  runLineKamaPct,
  DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH,
  DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH,
  DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH,
} from './chart-line-kama-pct';
import type { ChartLineKamaPctPoint } from './chart-line-kama-pct';

const constBar = (count: number, K: number): ChartLineKamaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineKamaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineKamaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineKamaPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineKamaPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineKamaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineKamaPctFinitePoints([
      null as unknown as ChartLineKamaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineKamaPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineKamaPctLength(undefined, 10)).toBe(10);
  });

  it('rejects below 2', () => {
    expect(normalizeLineKamaPctLength(1, 10)).toBe(10);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineKamaPctLength(5, 10)).toBe(5);
  });
});

describe('computeLineKamaPctEfficiencyRatio', () => {
  it('CONST yields ER = 0', () => {
    const er = computeLineKamaPctEfficiencyRatio([5, 5, 5, 5, 5], 3);
    expect(er[3]).toBe(0);
    expect(er[4]).toBe(0);
  });

  it('LINEAR UP yields ER = 1', () => {
    const er = computeLineKamaPctEfficiencyRatio([1, 2, 3, 4, 5], 3);
    expect(er[3]).toBe(1);
    expect(er[4]).toBe(1);
  });
});

describe('computeLineKamaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineKamaPct(null);
    expect(ch.kama).toEqual([]);
    expect(ch.kamaPct).toEqual([]);
  });

  it('CONST K > 0 yields KAMA = K and kamaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineKamaPct(constBar(15, K), { erLength: 3 });
      for (let i = 3; i < 15; i += 1) {
        expect(ch.kama[i]).toBe(K);
        expect(ch.kamaPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields KAMA = 0 and kamaPct = null', () => {
    const ch = computeLineKamaPct(constBar(15, 0), { erLength: 3 });
    for (let i = 3; i < 15; i += 1) {
      expect(ch.kama[i]).toBe(0);
      expect(ch.kamaPct[i]).toBe(null);
    }
  });

  it('LINEAR UP kamaPct > 0 after seed', () => {
    const ch = computeLineKamaPct(linearUp(15), { erLength: 3 });
    for (let i = 4; i < 15; i += 1) {
      expect(ch.kamaPct[i] as number).toBeGreaterThan(0);
    }
  });

  it('LINEAR DOWN kamaPct < 0 after seed', () => {
    const ch = computeLineKamaPct(linearDown(15), { erLength: 3 });
    for (let i = 4; i < 15; i += 1) {
      expect(ch.kamaPct[i] as number).toBeLessThan(0);
    }
  });

  it('default fastSC = 2/3 and slowSC = 2/31', () => {
    const ch = computeLineKamaPct(linearUp(15));
    expect(ch.fastSC).toBe(2 / 3);
    expect(ch.slowSC).toBe(2 / 31);
  });

  it('output length matches input', () => {
    const ch = computeLineKamaPct(linearUp(15), { erLength: 3 });
    expect(ch.kama.length).toBe(15);
    expect(ch.kamaPct.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineKamaPct(data, { erLength: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineKamaPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineKamaPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineKamaPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineKamaPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineKamaPctRegime(null)).toBe('none');
  });
});

describe('runLineKamaPct', () => {
  it('ok=false on short data', () => {
    const run = runLineKamaPct(constBar(3, 50), { erLength: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineKamaPct(constBar(10, 50), { erLength: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineKamaPct(constBar(40, 50));
    expect(run.erLength).toBe(DEFAULT_CHART_LINE_KAMA_PCT_ER_LENGTH);
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_KAMA_PCT_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_KAMA_PCT_SLOW_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineKamaPct(constBar(20, 50), {
      erLength: 5,
      fastLength: 3,
      slowLength: 20,
    });
    expect(run.erLength).toBe(5);
    expect(run.fastLength).toBe(3);
    expect(run.slowLength).toBe(20);
  });

  it('sorts by x', () => {
    const data: ChartLineKamaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineKamaPct(data, { erLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 regime is at after seed', () => {
    const run = runLineKamaPct(constBar(15, 50), { erLength: 3 });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('LINEAR UP regime is above after seed', () => {
    const run = runLineKamaPct(linearUp(15), { erLength: 3 });
    expect(run.aboveCount).toBeGreaterThan(0);
  });

  it('LINEAR DOWN regime is below after seed', () => {
    const run = runLineKamaPct(linearDown(15), { erLength: 3 });
    expect(run.belowCount).toBeGreaterThan(0);
  });
});

describe('computeLineKamaPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineKamaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineKamaPctLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above pct', () => {
    const layout = computeLineKamaPctLayout({ data: linearUp(15) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('zero inside pct axis', () => {
    const layout = computeLineKamaPctLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces price + kama paths', () => {
    const layout = computeLineKamaPctLayout({
      data: linearUp(15),
      erLength: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.kamaPath.length).toBeGreaterThan(0);
  });

  it('CONST K = 0 yields empty pct path (null kamaPct)', () => {
    const layout = computeLineKamaPctLayout({
      data: constBar(15, 0),
      erLength: 3,
    });
    expect(layout.pctPath).toBe('');
  });
});

describe('describeLineKamaPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineKamaPctChart([])).toBe('No data');
  });

  it('mentions KAMA Pct', () => {
    expect(describeLineKamaPctChart(linearUp(15))).toContain('KAMA Pct');
  });

  it('reports parameters', () => {
    const desc = describeLineKamaPctChart(linearUp(15), {
      erLength: 5,
      fastLength: 3,
      slowLength: 20,
    });
    expect(desc).toContain('erLength 5');
    expect(desc).toContain('fastLength 3');
    expect(desc).toContain('slowLength 20');
  });
});

describe('<ChartLineKamaPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineKamaPct data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('KAMA Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKamaPct data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineKamaPct
        data={linearUp(15)}
        erLength={5}
        fastLength={3}
        slowLength={20}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-pct"]',
    );
    expect(root?.getAttribute('data-er-length')).toBe('5');
    expect(root?.getAttribute('data-fast-length')).toBe('3');
    expect(root?.getAttribute('data-slow-length')).toBe('20');
  });

  it('exposes regime counts', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    const root = container.querySelector(
      '[data-section="chart-line-kama-pct"]',
    );
    expect(root?.getAttribute('data-above-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-pct-aria-desc"]',
      )?.textContent,
    ).toContain('KAMA Pct');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="kama"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKamaPct
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
      <ChartLineKamaPct
        data={linearUp(15)}
        hiddenSeries={['kama']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-kama"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineKamaPct
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kama-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-kama-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders kama + pct paths', () => {
    const { container } = render(
      <ChartLineKamaPct data={linearUp(15)} erLength={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-kama"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-pct"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineKamaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kama-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineKamaPct
        data={linearUp(15)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-pct-pct"]'),
    ).toBe(null);
  });
});

describe('KAMA Pct integration', () => {
  it('CONST K > 0 yields kamaPct = 0 bit-exact across multiple K and erLength', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 7]) {
        const ch = computeLineKamaPct(constBar(L * 3, K), { erLength: L });
        for (let i = L; i < L * 3; i += 1) {
          expect(ch.kama[i]).toBe(K);
          expect(ch.kamaPct[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP / DOWN have correct kamaPct sign across erLengths', () => {
    for (const L of [3, 5, 7]) {
      const upRun = runLineKamaPct(linearUp(L * 4), { erLength: L });
      const downRun = runLineKamaPct(linearDown(L * 4), { erLength: L });
      expect(upRun.aboveCount).toBeGreaterThan(0);
      expect(upRun.belowCount).toBe(0);
      expect(downRun.belowCount).toBeGreaterThan(0);
      expect(downRun.aboveCount).toBe(0);
    }
  });
});
