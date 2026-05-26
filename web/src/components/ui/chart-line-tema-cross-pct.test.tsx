import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTemaCrossPct,
  applyLineTemaCrossPctEma,
  classifyLineTemaCrossPctRegime,
  computeLineTemaCrossPct,
  computeLineTemaCrossPctLayout,
  describeLineTemaCrossPctChart,
  getLineTemaCrossPctFinitePoints,
  normalizeLineTemaCrossPctLength,
  runLineTemaCrossPct,
  DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH,
} from './chart-line-tema-cross-pct';
import type { ChartLineTemaCrossPctPoint } from './chart-line-tema-cross-pct';

const constBar = (count: number, K: number): ChartLineTemaCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineTemaCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineTemaCrossPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineTemaCrossPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineTemaCrossPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineTemaCrossPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineTemaCrossPctFinitePoints([
      null as unknown as ChartLineTemaCrossPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineTemaCrossPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineTemaCrossPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineTemaCrossPctLength(1, 14)).toBe(14);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineTemaCrossPctLength(5, 14)).toBe(5);
  });
});

describe('applyLineTemaCrossPctEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      const out = applyLineTemaCrossPctEma(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineTemaCrossPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineTemaCrossPct(null);
    expect(ch.tema).toEqual([]);
    expect(ch.temaPct).toEqual([]);
  });

  it('CONST K > 0 yields TEMA = K bit-exact and temaPct = 0', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineTemaCrossPct(constBar(25, K), { length: 3 });
      for (let i = 6; i < 25; i += 1) {
        expect(ch.tema[i]).toBe(K);
        expect(ch.temaPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields temaPct = null', () => {
    const ch = computeLineTemaCrossPct(constBar(25, 0), { length: 3 });
    for (const v of ch.temaPct) expect(v).toBe(null);
  });

  it('output length matches input', () => {
    const ch = computeLineTemaCrossPct(linearUp(25), { length: 3 });
    expect(ch.tema.length).toBe(25);
    expect(ch.temaPct.length).toBe(25);
  });

  it('does not mutate input', () => {
    const data = linearUp(25);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineTemaCrossPct(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineTemaCrossPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineTemaCrossPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineTemaCrossPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineTemaCrossPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineTemaCrossPctRegime(null)).toBe('none');
  });
});

describe('runLineTemaCrossPct', () => {
  it('ok=false on short data', () => {
    const run = runLineTemaCrossPct(constBar(5, 50), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineTemaCrossPct(constBar(25, 50), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineTemaCrossPct(constBar(60, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TEMA_CROSS_PCT_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineTemaCrossPct(constBar(25, 50), { length: 5 });
    expect(run.length).toBe(5);
  });

  it('sorts by x', () => {
    const data: ChartLineTemaCrossPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTemaCrossPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 yields regime at after warmup', () => {
    const run = runLineTemaCrossPct(constBar(25, 50), { length: 3 });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST K = 0 yields regime none', () => {
    const run = runLineTemaCrossPct(constBar(25, 0), { length: 3 });
    expect(run.noneCount).toBe(25);
  });
});

describe('computeLineTemaCrossPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineTemaCrossPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineTemaCrossPctLayout({
      data: linearUp(25),
      length: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above pct', () => {
    const layout = computeLineTemaCrossPctLayout({ data: linearUp(25) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('zero inside pct axis', () => {
    const layout = computeLineTemaCrossPctLayout({
      data: linearUp(25),
      length: 3,
    });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces price + tema paths', () => {
    const layout = computeLineTemaCrossPctLayout({
      data: linearUp(25),
      length: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.temaPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineTemaCrossPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineTemaCrossPctChart([])).toBe('No data');
  });

  it('mentions TEMA Pct', () => {
    expect(describeLineTemaCrossPctChart(linearUp(25))).toContain(
      'TEMA Pct',
    );
  });

  it('reports length', () => {
    expect(
      describeLineTemaCrossPctChart(linearUp(25), { length: 7 }),
    ).toContain('length 7');
  });
});

describe('<ChartLineTemaCrossPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineTemaCrossPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('TEMA Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTemaCrossPct data={linearUp(25)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('exposes regime counts', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={constBar(25, 50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-pct"]',
    );
    expect(root?.getAttribute('data-at-count')).not.toBe(null);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-aria-desc"]',
      )?.textContent,
    ).toContain('TEMA Pct');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="tema"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="temaPct"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTemaCrossPct
        data={linearUp(25)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="tema"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'tema', hidden: true });
  });

  it('hides tema when controlled', () => {
    const { container } = render(
      <ChartLineTemaCrossPct
        data={linearUp(25)}
        hiddenSeries={['tema']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-tema"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineTemaCrossPct
        data={linearUp(25)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineTemaCrossPct
        data={linearUp(25)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-tema-cross-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders tema + pct paths', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} length={3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-tema"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-tema-cross-pct-pct"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(
      <ChartLineTemaCrossPct data={linearUp(25)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineTemaCrossPct
        data={linearUp(25)}
        defaultHiddenSeries={['temaPct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-cross-pct-pct"]'),
    ).toBe(null);
  });
});

describe('TEMA Pct integration', () => {
  it('CONST K > 0 yields TEMA = K bit-exact and temaPct = 0 across K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 5, 7]) {
        const ch = computeLineTemaCrossPct(constBar(L * 4, K), {
          length: L,
        });
        for (let i = L * 3 - 1; i < L * 4; i += 1) {
          expect(ch.tema[i]).toBe(K);
          expect(ch.temaPct[i]).toBe(0);
        }
      }
    }
  });
});
