import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTemaPct,
  applyLineTemaPctEma,
  classifyLineTemaPctZone,
  computeLineTemaPct,
  computeLineTemaPctLayout,
  describeLineTemaPctChart,
  detectLineTemaPctCrosses,
  getLineTemaPctFinitePoints,
  normalizeLineTemaPctLength,
  normalizeLineTemaPctThreshold,
  runLineTemaPct,
  DEFAULT_CHART_LINE_TEMA_PCT_LENGTH,
} from './chart-line-tema-pct';
import type { ChartLineTemaPctPoint } from './chart-line-tema-pct';

const constBar = (count: number, K: number): ChartLineTemaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineTemaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineTemaPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTemaPctFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineTemaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineTemaPctFinitePoints([
      null as unknown as ChartLineTemaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineTemaPctLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTemaPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineTemaPctLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineTemaPctThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTemaPctThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineTemaPctThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineTemaPctThreshold(5, 0)).toBe(5);
  });
});

describe('applyLineTemaPctEma', () => {
  it('CONST K EMA is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7]) {
        const out = applyLineTemaPctEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineTemaPctEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineTemaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineTemaPct(null);
    expect(ch.temaPct).toEqual([]);
  });

  it('CONST close = K, K != 0 yields tema = K and temaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(30, K);
      const ch = computeLineTemaPct(series, { length: 3 });
      // tema becomes defined at i = 3*(L-1) = 6 (i=6 is the first
      // index where ema3 is defined, with L=3).
      for (let i = 6; i < 30; i += 1) {
        expect(ch.tema[i]).toBe(K);
        expect(ch.temaPct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields temaPct = null (divide guard)', () => {
    const series = constBar(30, 0);
    const ch = computeLineTemaPct(series, { length: 3 });
    for (let i = 6; i < 30; i += 1) {
      expect(ch.tema[i]).toBe(0);
      expect(ch.temaPct[i]).toBe(null);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(30);
    const ch = computeLineTemaPct(series, { length: 3 });
    expect(ch.temaPct[0]).toBe(null);
    expect(ch.temaPct[5]).toBe(null);
    expect(ch.temaPct[6]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(30);
    const ch = computeLineTemaPct(series, { length: 3 });
    expect(ch.temaPct.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = linearUp(30);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineTemaPct(series, { length: 3 });
    expect(series).toEqual(snap);
  });

  it('all three ema channels populated for CONST', () => {
    const series = constBar(30, 7);
    const ch = computeLineTemaPct(series, { length: 3 });
    for (let i = 6; i < 30; i += 1) {
      expect(ch.ema1[i]).toBe(7);
      expect(ch.ema2[i]).toBe(7);
      expect(ch.ema3[i]).toBe(7);
    }
  });

  it('delta = close - tema bit-exact for CONST', () => {
    const series = constBar(30, 5);
    const ch = computeLineTemaPct(series, { length: 3 });
    for (let i = 6; i < 30; i += 1) {
      expect(ch.delta[i]).toBe(0);
    }
  });
});

describe('classifyLineTemaPctZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineTemaPctZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineTemaPctZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineTemaPctZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineTemaPctZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineTemaPctCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineTemaPctCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineTemaPctCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineTemaPctCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineTemaPctCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineTemaPct', () => {
  it('marks ok=false for short data', () => {
    const run = runLineTemaPct(constBar(5, 10), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineTemaPct(constBar(10, 10), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineTemaPct(constBar(80, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TEMA_PCT_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineTemaPct(constBar(30, 10), {
      length: 7,
      bullishThreshold: 2,
      bearishThreshold: -2,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(2);
    expect(run.bearishThreshold).toBe(-2);
  });

  it('sorts by x', () => {
    const data: ChartLineTemaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTemaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K>0 classifies as neutral (temaPct=0)', () => {
    const run = runLineTemaPct(constBar(30, 10), { length: 3 });
    expect(run.neutralCount).toBeGreaterThan(0);
  });
});

describe('computeLineTemaPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTemaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTemaPctLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above pct', () => {
    const layout = computeLineTemaPctLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('pct axis includes zero', () => {
    const layout = computeLineTemaPctLayout({ data: linearUp(30) });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path, tema path, and dots', () => {
    const layout = computeLineTemaPctLayout({
      data: linearUp(30),
      length: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.temaPath.length).toBeGreaterThan(0);
    expect(layout.priceDots.length).toBe(30);
  });
});

describe('describeLineTemaPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTemaPctChart([])).toBe('No data');
  });

  it('mentions TEMA Percent-Change', () => {
    const desc = describeLineTemaPctChart(linearUp(30));
    expect(desc).toContain('TEMA Percent-Change');
  });

  it('reports parameters', () => {
    const desc = describeLineTemaPctChart(linearUp(30), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 5');
    expect(desc).toContain('bearishThreshold -5');
  });
});

describe('<ChartLineTemaPct />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineTemaPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('TEMA');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTemaPct data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        length={7}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-5');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    const root = container.querySelector(
      '[data-section="chart-line-tema-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-aria-desc"]',
      )?.textContent,
    ).toContain('TEMA Percent-Change');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="tema"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="pct"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'pct',
      hidden: true,
    });
  });

  it('hides pct when controlled hidden', () => {
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        hiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-line"]'),
    ).toBe(null);
  });

  it('hides tema when controlled hidden', () => {
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        hiddenSeries={['tema']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-tema-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-badge"]'),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTemaPct data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTemaPct data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTemaPct data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTemaPct data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-tema-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the pct line by default', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-line"]'),
    ).toBeTruthy();
  });

  it('renders the tema overlay path', () => {
    const { container } = render(
      <ChartLineTemaPct data={linearUp(30)} length={3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-tema-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineTemaPct data={linearUp(30)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTemaPct
        data={linearUp(30)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-pct-line"]'),
    ).toBe(null);
  });
});

describe('TEMA Percent integration', () => {
  it('CONST K!=0 yields temaPct=0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [2, 3, 5, 7]) {
        const total = 3 * (L - 1) + 5;
        const series = constBar(total, K);
        const ch = computeLineTemaPct(series, { length: L });
        const start = 3 * (L - 1);
        for (let i = start; i < total; i += 1) {
          expect(ch.temaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K=0 yields temaPct=null across (length)', () => {
    for (const L of [2, 3, 5]) {
      const total = 3 * (L - 1) + 5;
      const series = constBar(total, 0);
      const ch = computeLineTemaPct(series, { length: L });
      const start = 3 * (L - 1);
      for (let i = start; i < total; i += 1) {
        expect(ch.temaPct[i]).toBe(null);
      }
    }
  });
});
