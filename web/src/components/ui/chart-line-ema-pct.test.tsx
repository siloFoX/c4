import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineEmaPct,
  applyLineEmaPctEma,
  classifyLineEmaPctZone,
  computeLineEmaPct,
  computeLineEmaPctLayout,
  describeLineEmaPctChart,
  detectLineEmaPctCrosses,
  getLineEmaPctFinitePoints,
  normalizeLineEmaPctLength,
  normalizeLineEmaPctThreshold,
  runLineEmaPct,
  DEFAULT_CHART_LINE_EMA_PCT_LENGTH,
} from './chart-line-ema-pct';
import type { ChartLineEmaPctPoint } from './chart-line-ema-pct';

const constBar = (count: number, K: number): ChartLineEmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineEmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineEmaPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineEmaPctFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineEmaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineEmaPctFinitePoints([
      null as unknown as ChartLineEmaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineEmaPctLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineEmaPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineEmaPctLength(1, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineEmaPctLength(7.7, 14)).toBe(7);
  });
});

describe('normalizeLineEmaPctThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineEmaPctThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineEmaPctThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineEmaPctThreshold(5, 0)).toBe(5);
  });
});

describe('applyLineEmaPctEma', () => {
  it('CONST K EMA is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 7, 14]) {
        const out = applyLineEmaPctEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineEmaPctEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null resets seed', () => {
    const out = applyLineEmaPctEma([1, 1, null, 1, 1, 1], 3);
    expect(out[2]).toBe(null);
    expect(out[5]).toBe(1);
  });

  it('LINEAR UP seed = SMA at i=L-1', () => {
    const out = applyLineEmaPctEma([1, 2, 3], 3);
    expect(out[2]).toBe(2); // (1+2+3)/3 = 2
  });
});

describe('computeLineEmaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineEmaPct(null);
    expect(ch.emaPct).toEqual([]);
  });

  it('CONST close = K, K != 0 yields emaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineEmaPct(series, { length: 4 });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.emaPct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields emaPct = null (divide guard)', () => {
    const series = constBar(20, 0);
    const ch = computeLineEmaPct(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.emaPct[i]).toBe(null);
    }
  });

  it('LINEAR UP at i=L-1 yields (L-1)/(L+1)*100 dyadic for L=3 -> 50', () => {
    const series = linearUp(10);
    const ch = computeLineEmaPct(series, { length: 3 });
    expect(ch.emaPct[2]).toBe(50);
  });

  it('LINEAR UP at i=L-1 yields 75 for L=7', () => {
    const series = linearUp(20);
    const ch = computeLineEmaPct(series, { length: 7 });
    expect(ch.emaPct[6]).toBe(75);
  });

  it('LINEAR UP at i=L-1 yields 87.5 for L=15', () => {
    const series = linearUp(30);
    const ch = computeLineEmaPct(series, { length: 15 });
    expect(ch.emaPct[14]).toBe(87.5);
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineEmaPct(series, { length: 4 });
    expect(ch.emaPct[0]).toBe(null);
    expect(ch.emaPct[2]).toBe(null);
    expect(ch.emaPct[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineEmaPct(series, { length: 4 });
    expect(ch.emaPct.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineEmaPct(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('ema values populated post-warmup', () => {
    const series = constBar(10, 7);
    const ch = computeLineEmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.ema[i]).toBe(7);
    }
  });

  it('delta = close - ema bit-exact for CONST', () => {
    const series = constBar(10, 5);
    const ch = computeLineEmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.delta[i]).toBe(0);
    }
  });
});

describe('classifyLineEmaPctZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineEmaPctZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineEmaPctZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineEmaPctZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineEmaPctZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineEmaPctCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineEmaPctCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineEmaPctCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineEmaPctCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineEmaPctCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineEmaPct', () => {
  it('marks ok=false for short data', () => {
    const run = runLineEmaPct(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineEmaPct(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineEmaPct(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_EMA_PCT_LENGTH);
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineEmaPct(constBar(20, 10), {
      length: 7,
      bullishThreshold: 2,
      bearishThreshold: -2,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(2);
    expect(run.bearishThreshold).toBe(-2);
  });

  it('sorts by x', () => {
    const data: ChartLineEmaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineEmaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K>0 classifies as neutral (emaPct=0)', () => {
    const run = runLineEmaPct(constBar(20, 10), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });

  it('LINEAR UP classifies as bullish post warmup', () => {
    const run = runLineEmaPct(linearUp(20), { length: 4 });
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('computeLineEmaPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineEmaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineEmaPctLayout({ data: linearUp(20) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above pct', () => {
    const layout = computeLineEmaPctLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('pct axis includes zero', () => {
    const layout = computeLineEmaPctLayout({ data: linearUp(20) });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path, ema path, and dots', () => {
    const layout = computeLineEmaPctLayout({ data: linearUp(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.emaPath.length).toBeGreaterThan(0);
    expect(layout.priceDots.length).toBe(20);
  });
});

describe('describeLineEmaPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineEmaPctChart([])).toBe('No data');
  });

  it('mentions EMA Percent-Change', () => {
    const desc = describeLineEmaPctChart(linearUp(20));
    expect(desc).toContain('EMA Percent-Change');
  });

  it('reports parameters', () => {
    const desc = describeLineEmaPctChart(linearUp(20), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 5');
    expect(desc).toContain('bearishThreshold -5');
  });
});

describe('<ChartLineEmaPct />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineEmaPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('EMA');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEmaPct data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineEmaPct
        data={linearUp(20)}
        length={7}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-5');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-ema-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-pct-aria-desc"]',
      )?.textContent,
    ).toContain('EMA Percent-Change');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="ema"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineEmaPct
        data={linearUp(20)}
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
      <ChartLineEmaPct data={linearUp(20)} hiddenSeries={['pct']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-line"]'),
    ).toBe(null);
  });

  it('hides ema when controlled hidden', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} hiddenSeries={['ema']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-ema-path"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-badge"]'),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-zero-line"]'),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineEmaPct
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-ema-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineEmaPct data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-ema-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the pct line by default', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-line"]'),
    ).toBeTruthy();
  });

  it('renders the ema overlay path', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-ema-path"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineEmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-ema-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineEmaPct
        data={linearUp(20)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ema-pct-line"]'),
    ).toBe(null);
  });
});

describe('EMA Percent integration', () => {
  it('CONST K!=0 yields emaPct=0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 14]) {
        const series = constBar(L + 5, K);
        const ch = computeLineEmaPct(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.emaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K=0 yields emaPct=null across (length)', () => {
    for (const L of [2, 4, 7]) {
      const series = constBar(L + 5, 0);
      const ch = computeLineEmaPct(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.emaPct[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP at i=L-1 yields (L-1)/(L+1)*100 for dyadic L', () => {
    const expected: Record<number, number> = {
      3: 50,
      7: 75,
      15: 87.5,
    };
    for (const [L, exp] of Object.entries(expected)) {
      const LL = Number(L);
      const series = linearUp(LL * 3);
      const ch = computeLineEmaPct(series, { length: LL });
      expect(ch.emaPct[LL - 1]).toBe(exp);
    }
  });
});
