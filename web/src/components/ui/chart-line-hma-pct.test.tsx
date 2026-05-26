import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineHmaPct,
  applyLineHmaPctWma,
  classifyLineHmaPctRegime,
  computeLineHmaPct,
  computeLineHmaPctLayout,
  describeLineHmaPctChart,
  getLineHmaPctFinitePoints,
  normalizeLineHmaPctLength,
  runLineHmaPct,
  DEFAULT_CHART_LINE_HMA_PCT_LENGTH,
} from './chart-line-hma-pct';
import type { ChartLineHmaPctPoint } from './chart-line-hma-pct';

const constBar = (count: number, K: number): ChartLineHmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineHmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineHmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineHmaPctFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineHmaPctFinitePoints(null)).toEqual([]);
  });

  it('drops NaN close', () => {
    const r = getLineHmaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineHmaPctFinitePoints([
      null as unknown as ChartLineHmaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineHmaPctLength', () => {
  it('uses default', () => {
    expect(normalizeLineHmaPctLength(undefined, 9)).toBe(9);
  });

  it('rejects below 2', () => {
    expect(normalizeLineHmaPctLength(1, 9)).toBe(9);
  });

  it('accepts integer >= 2', () => {
    expect(normalizeLineHmaPctLength(5, 9)).toBe(5);
  });
});

describe('applyLineHmaPctWma', () => {
  it('CONST K WMA is K bit-exact', () => {
    for (const K of [0, 1, 50, 100]) {
      for (const L of [2, 3, 4, 5]) {
        const out = applyLineHmaPctWma(Array(L + 3).fill(K), L);
        for (let i = L - 1; i < L + 3; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineHmaPctWma([1, 2, 3], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
  });

  it('LINEAR i+1 WMA(4) at i=3 equals 3 (= i)', () => {
    const out = applyLineHmaPctWma([1, 2, 3, 4, 5], 4);
    expect(out[3]).toBe(3);
    expect(out[4]).toBe(4);
  });

  it('LINEAR i+1 WMA(2) at i is i + 2/3', () => {
    const out = applyLineHmaPctWma([1, 2, 3, 4, 5], 2);
    expect(out[1]).toBeCloseTo(1 + 2 / 3, 10);
    expect(out[2]).toBeCloseTo(2 + 2 / 3, 10);
  });
});

describe('computeLineHmaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineHmaPct(null);
    expect(ch.hma).toEqual([]);
    expect(ch.hmaPct).toEqual([]);
  });

  it('CONST K yields HMA = K and hmaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 50, 100]) {
      const ch = computeLineHmaPct(constBar(20, K), { length: 4 });
      // HMA warmup is length + sqrt(length) - 1 = 4 + 2 - 1 = 5 -> first defined at i >= 4
      for (let i = 4; i < 20; i += 1) {
        expect(ch.hma[i]).toBe(K);
        expect(ch.hmaPct[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 yields HMA = 0 and hmaPct = null (divide by zero)', () => {
    const ch = computeLineHmaPct(constBar(20, 0), { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.hma[i]).toBe(0);
      expect(ch.hmaPct[i]).toBe(null);
    }
  });

  it('LINEAR UP HMA tracks close (hmaPct close to zero)', () => {
    const ch = computeLineHmaPct(linearUp(20), { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      const pct = ch.hmaPct[i];
      expect(pct).not.toBe(null);
      expect(Math.abs(pct as number)).toBeLessThan(1e-10);
    }
  });

  it('LINEAR DOWN HMA tracks close (hmaPct close to zero)', () => {
    const ch = computeLineHmaPct(linearDown(20), { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      const pct = ch.hmaPct[i];
      expect(pct).not.toBe(null);
      expect(Math.abs(pct as number)).toBeLessThan(1e-10);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineHmaPct(linearUp(15), { length: 4 });
    expect(ch.hma.length).toBe(15);
    expect(ch.hmaPct.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineHmaPct(data, { length: 4 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineHmaPctRegime', () => {
  it('above for positive', () => {
    expect(classifyLineHmaPctRegime(0.5)).toBe('above');
  });

  it('below for negative', () => {
    expect(classifyLineHmaPctRegime(-0.5)).toBe('below');
  });

  it('at for zero', () => {
    expect(classifyLineHmaPctRegime(0)).toBe('at');
  });

  it('none for null', () => {
    expect(classifyLineHmaPctRegime(null)).toBe('none');
  });
});

describe('runLineHmaPct', () => {
  it('ok=false on short data', () => {
    const run = runLineHmaPct(constBar(3, 50), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineHmaPct(constBar(10, 50), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default length', () => {
    const run = runLineHmaPct(constBar(20, 50));
    expect(run.length).toBe(DEFAULT_CHART_LINE_HMA_PCT_LENGTH);
  });

  it('respects explicit length', () => {
    const run = runLineHmaPct(constBar(20, 50), { length: 6 });
    expect(run.length).toBe(6);
  });

  it('sorts by x', () => {
    const data: ChartLineHmaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineHmaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 yields hmaPct = 0 -> regime at', () => {
    const run = runLineHmaPct(constBar(15, 50), { length: 4 });
    expect(run.atCount).toBeGreaterThan(0);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('CONST K = 0 yields hmaPct = null -> regime none', () => {
    const run = runLineHmaPct(constBar(15, 0), { length: 4 });
    expect(run.noneCount).toBe(15);
  });
});

describe('computeLineHmaPctLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineHmaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineHmaPctLayout({
      data: linearUp(15),
      length: 4,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above pct', () => {
    const layout = computeLineHmaPctLayout({ data: linearUp(15) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('zero inside pct axis', () => {
    const layout = computeLineHmaPctLayout({
      data: linearUp(15),
      length: 4,
    });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces price + hma paths', () => {
    const layout = computeLineHmaPctLayout({
      data: linearUp(15),
      length: 4,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.hmaPath.length).toBeGreaterThan(0);
  });

  it('CONST K > 0 produces a flat pct path (all zero)', () => {
    const layout = computeLineHmaPctLayout({
      data: constBar(15, 50),
      length: 4,
    });
    expect(layout.pctPath.length).toBeGreaterThan(0);
  });

  it('CONST K = 0 produces no pct path (hmaPct null)', () => {
    const layout = computeLineHmaPctLayout({
      data: constBar(15, 0),
      length: 4,
    });
    expect(layout.pctPath).toBe('');
  });
});

describe('describeLineHmaPctChart', () => {
  it('No data on empty', () => {
    expect(describeLineHmaPctChart([])).toBe('No data');
  });

  it('mentions HMA Pct', () => {
    expect(describeLineHmaPctChart(linearUp(15))).toContain('HMA Pct');
  });

  it('reports length', () => {
    expect(describeLineHmaPctChart(linearUp(15), { length: 7 })).toContain(
      'length 7',
    );
  });
});

describe('<ChartLineHmaPct />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineHmaPct data={[]} />);
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-empty"]')
        ?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('HMA Percent');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHmaPct data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} length={5} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-total-points')).toBe('15');
  });

  it('exposes regime counts', () => {
    const { container } = render(<ChartLineHmaPct data={constBar(20, 50)} />);
    const root = container.querySelector(
      '[data-section="chart-line-hma-pct"]',
    );
    expect(root?.getAttribute('data-at-count')).not.toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-pct-aria-desc"]',
      )?.textContent,
    ).toContain('HMA Pct');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="hma"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineHmaPct
        data={linearUp(15)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="hma"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({ seriesId: 'hma', hidden: true });
  });

  it('hides hma when controlled', () => {
    const { container } = render(
      <ChartLineHmaPct
        data={linearUp(15)}
        hiddenSeries={['hma']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-hma"]'),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-pct-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-pct-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineHmaPct
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-hma-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} animate={false} />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-hma-pct-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders hma + pct paths', () => {
    const { container } = render(
      <ChartLineHmaPct data={linearUp(15)} length={4} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-hma"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-pct"]'),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(<ChartLineHmaPct data={linearUp(15)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-hma-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineHmaPct
        data={linearUp(15)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-pct-pct"]'),
    ).toBe(null);
  });
});

describe('HMA Pct integration', () => {
  it('CONST K > 0 yields hmaPct = 0 bit-exact across multiple K and length', () => {
    for (const K of [1, 5, 50, 100]) {
      for (const L of [3, 4, 5, 9]) {
        const ch = computeLineHmaPct(constBar(L * 3 + 10, K), { length: L });
        const warmup = L + Math.floor(Math.sqrt(L)) - 1;
        for (let i = warmup; i < L * 3 + 10; i += 1) {
          expect(ch.hma[i]).toBe(K);
          expect(ch.hmaPct[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR series stay close to zero (HMA tracks linear inputs)', () => {
    for (const series of [linearUp(20), linearDown(20)]) {
      const run = runLineHmaPct(series, { length: 4 });
      for (let i = 5; i < 20; i += 1) {
        const pct = run.samples[i]?.hmaPct;
        expect(pct).not.toBe(null);
        expect(Math.abs(pct as number)).toBeLessThan(1e-10);
      }
    }
  });
});
