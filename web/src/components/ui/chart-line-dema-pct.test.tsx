import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDemaPct,
  applyLineDemaPctEma,
  classifyLineDemaPctRegime,
  computeLineDemaPct,
  computeLineDemaPctLayout,
  describeLineDemaPctChart,
  getLineDemaPctFinitePoints,
  normalizeLineDemaPctLength,
  runLineDemaPct,
  DEFAULT_CHART_LINE_DEMA_PCT_LENGTH,
} from './chart-line-dema-pct';
import type { ChartLineDemaPctPoint } from './chart-line-dema-pct';

const constBar = (count: number, K: number): ChartLineDemaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineDemaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineDemaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineDemaPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineDemaPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineDemaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineDemaPctFinitePoints([
      null as unknown as ChartLineDemaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineDemaPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineDemaPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineDemaPctLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineDemaPctLength(5, 14)).toBe(5);
  });
});

describe('applyLineDemaPctEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const L of [2, 3, 5, 14]) {
        const out = applyLineDemaPctEma(Array(L + 3).fill(K), L);
        for (let i = L - 1; i < L + 3; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineDemaPctEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineDemaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineDemaPct(null);
    expect(ch.dema).toEqual([]);
    expect(ch.demaPct).toEqual([]);
  });

  it('CONST K > 0 yields DEMA = K and demaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineDemaPct(constBar(20, K), { length: 3 });
      for (let i = 4; i < 20; i += 1) {
        expect(ch.dema[i]).toBe(K);
        expect(ch.demaPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields demaPct = null', () => {
    const ch = computeLineDemaPct(constBar(20, 0), { length: 3 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.dema[i]).toBe(0);
      expect(ch.demaPct[i]).toBe(null);
    }
  });

  it('LINEAR UP demaPct close to zero (DEMA tracks linear in steady state)', () => {
    const ch = computeLineDemaPct(linearUp(60), { length: 5 });
    // Need ample warmup for the chain to settle
    for (let i = 40; i < 60; i += 1) {
      const pct = ch.demaPct[i];
      expect(pct).not.toBe(null);
      expect(Math.abs(pct as number)).toBeLessThan(1);
    }
  });

  it('LINEAR DOWN demaPct close to zero', () => {
    const ch = computeLineDemaPct(linearDown(60), { length: 5 });
    for (let i = 40; i < 60; i += 1) {
      const pct = ch.demaPct[i];
      expect(pct).not.toBe(null);
      expect(Math.abs(pct as number)).toBeLessThan(1);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineDemaPct(linearUp(15), { length: 3 });
    expect(ch.dema.length).toBe(15);
    expect(ch.demaPct.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineDemaPct(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineDemaPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineDemaPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineDemaPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineDemaPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineDemaPctRegime(null)).toBe('none');
  });
});

describe('runLineDemaPct', () => {
  it('ok=false on short data', () => {
    const run = runLineDemaPct(constBar(3, 50), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineDemaPct(constBar(20, 50), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineDemaPct(constBar(40, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_DEMA_PCT_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineDemaPct(constBar(20, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineDemaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineDemaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 regime is at after seed', () => {
    const run = runLineDemaPct(constBar(15, 50), { length: 3 });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST K = 0 regime is none', () => {
    const run = runLineDemaPct(constBar(15, 0), { length: 3 });
    expect(run.noneCount).toBe(15);
  });
});

describe('computeLineDemaPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineDemaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineDemaPctLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above pct', () => {
    const layout = computeLineDemaPctLayout({ data: linearUp(15) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('zero inside pct axis', () => {
    const layout = computeLineDemaPctLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces price + dema paths', () => {
    const layout = computeLineDemaPctLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.demaPath.length).toBeGreaterThan(0);
  });

  it('CONST K = 0 yields empty pct path', () => {
    const layout = computeLineDemaPctLayout({
      data: constBar(15, 0),
      length: 3,
    });
    expect(layout.pctPath).toBe('');
  });
});

describe('describeLineDemaPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineDemaPctChart([])).toBe('No data');
  });

  it('mentions DEMA Pct', () => {
    expect(describeLineDemaPctChart(linearUp(15))).toContain('DEMA Pct');
  });

  it('reports length', () => {
    expect(describeLineDemaPctChart(linearUp(15), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineDemaPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineDemaPct data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('DEMA Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDemaPct data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('15');
  });

  it('exposes regime counts', () => {
    const { container } = render(<ChartLineDemaPct data={constBar(15, 50)} />);
    const root = container.querySelector(
      '[data-section="chart-line-dema-pct"]',
    );
    expect(root?.getAttribute('data-at-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-pct-aria-desc"]',
      )?.textContent,
    ).toContain('DEMA Pct');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="dema"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineDemaPct
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
      <ChartLineDemaPct
        data={linearUp(15)}
        hiddenSeries={['dema']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-dema"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineDemaPct
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-dema-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-dema-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders dema + pct paths', () => {
    const { container } = render(
      <ChartLineDemaPct data={linearUp(15)} length={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-dema"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-pct"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineDemaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-dema-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineDemaPct
        data={linearUp(15)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-dema-pct-pct"]'),
    ).toBe(null);
  });
});

describe('DEMA Pct integration', () => {
  it('CONST K > 0 yields demaPct = 0 bit-exact across multiple K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 7]) {
        const ch = computeLineDemaPct(constBar(L * 3, K), { length: L });
        for (let i = L * 2 - 1; i < L * 3; i += 1) {
          expect(ch.dema[i]).toBe(K);
          expect(ch.demaPct[i]).toBe(0);
        }
      }
    }
  });
});
