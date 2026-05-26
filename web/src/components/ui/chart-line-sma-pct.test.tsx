import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSmaPct,
  applyLineSmaPctSma,
  classifyLineSmaPctZone,
  computeLineSmaPct,
  computeLineSmaPctLayout,
  describeLineSmaPctChart,
  detectLineSmaPctCrosses,
  getLineSmaPctFinitePoints,
  normalizeLineSmaPctLength,
  normalizeLineSmaPctThreshold,
  runLineSmaPct,
  DEFAULT_CHART_LINE_SMA_PCT_LENGTH,
} from './chart-line-sma-pct';
import type { ChartLineSmaPctPoint } from './chart-line-sma-pct';

const constBar = (count: number, K: number): ChartLineSmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineSmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineSmaPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineSmaPctFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineSmaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineSmaPctFinitePoints([
      null as unknown as ChartLineSmaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineSmaPctLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmaPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineSmaPctLength(1, 14)).toBe(14);
  });

  it('floors fractional', () => {
    expect(normalizeLineSmaPctLength(7.7, 14)).toBe(7);
  });
});

describe('normalizeLineSmaPctThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineSmaPctThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineSmaPctThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineSmaPctThreshold(5, 0)).toBe(5);
  });
});

describe('applyLineSmaPctSma', () => {
  it('CONST K SMA is K bit-exact (min===max window)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 14]) {
        const out = applyLineSmaPctSma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineSmaPctSma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null in window propagates to null', () => {
    const out = applyLineSmaPctSma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });

  it('LINEAR UP SMA at i=L-1 is (L+1)/2', () => {
    const out = applyLineSmaPctSma([1, 2, 3], 3);
    expect(out[2]).toBe(2);
  });

  it('LINEAR UP L=3 SMA at i is i (close = i+1)', () => {
    const closes = Array.from({ length: 10 }, (_, i) => i + 1);
    const out = applyLineSmaPctSma(closes, 3);
    expect(out[2]).toBe(2);
    expect(out[4]).toBe(4);
    expect(out[9]).toBe(9);
  });
});

describe('computeLineSmaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineSmaPct(null);
    expect(ch.smaPct).toEqual([]);
  });

  it('CONST close = K, K != 0 yields smaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineSmaPct(series, { length: 4 });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.smaPct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields smaPct = null (divide guard)', () => {
    const series = constBar(20, 0);
    const ch = computeLineSmaPct(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.smaPct[i]).toBe(null);
    }
  });

  it('LINEAR UP at i=L-1 yields (L-1)/(L+1)*100 dyadic for L=3 -> 50', () => {
    const series = linearUp(10);
    const ch = computeLineSmaPct(series, { length: 3 });
    expect(ch.smaPct[2]).toBe(50);
  });

  it('LINEAR UP at i=L-1 yields 75 for L=7', () => {
    const series = linearUp(20);
    const ch = computeLineSmaPct(series, { length: 7 });
    expect(ch.smaPct[6]).toBe(75);
  });

  it('LINEAR UP at i=L-1 yields 87.5 for L=15', () => {
    const series = linearUp(30);
    const ch = computeLineSmaPct(series, { length: 15 });
    expect(ch.smaPct[14]).toBe(87.5);
  });

  it('LINEAR UP L=3 yields 100/i for i in {4, 5, 8, 10, 20, 25} bit-exact', () => {
    const series = linearUp(30);
    const ch = computeLineSmaPct(series, { length: 3 });
    const expected: Record<number, number> = {
      2: 50,
      4: 25,
      5: 20,
      8: 12.5,
      10: 10,
      20: 5,
      25: 4,
    };
    for (const [i, val] of Object.entries(expected)) {
      expect(ch.smaPct[Number(i)]).toBe(val);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineSmaPct(series, { length: 4 });
    expect(ch.smaPct[0]).toBe(null);
    expect(ch.smaPct[2]).toBe(null);
    expect(ch.smaPct[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineSmaPct(series, { length: 4 });
    expect(ch.smaPct.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineSmaPct(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('sma values populated post-warmup', () => {
    const series = constBar(10, 7);
    const ch = computeLineSmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.sma[i]).toBe(7);
    }
  });

  it('delta = close - sma bit-exact for CONST', () => {
    const series = constBar(10, 5);
    const ch = computeLineSmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.delta[i]).toBe(0);
    }
  });
});

describe('classifyLineSmaPctZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineSmaPctZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineSmaPctZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineSmaPctZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineSmaPctZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineSmaPctCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineSmaPctCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineSmaPctCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineSmaPctCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineSmaPctCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineSmaPct', () => {
  it('marks ok=false for short data', () => {
    const run = runLineSmaPct(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineSmaPct(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineSmaPct(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_SMA_PCT_LENGTH);
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineSmaPct(constBar(20, 10), {
      length: 7,
      bullishThreshold: 2,
      bearishThreshold: -2,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(2);
    expect(run.bearishThreshold).toBe(-2);
  });

  it('sorts by x', () => {
    const data: ChartLineSmaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineSmaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K>0 classifies as neutral (smaPct=0)', () => {
    const run = runLineSmaPct(constBar(20, 10), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });

  it('LINEAR UP classifies as bullish post warmup', () => {
    const run = runLineSmaPct(linearUp(20), { length: 4 });
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('computeLineSmaPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineSmaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineSmaPctLayout({ data: linearUp(20) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above pct', () => {
    const layout = computeLineSmaPctLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('pct axis includes zero', () => {
    const layout = computeLineSmaPctLayout({ data: linearUp(20) });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path, sma path, and dots', () => {
    const layout = computeLineSmaPctLayout({ data: linearUp(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.smaPath.length).toBeGreaterThan(0);
    expect(layout.priceDots.length).toBe(20);
  });
});

describe('describeLineSmaPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineSmaPctChart([])).toBe('No data');
  });

  it('mentions SMA Percent-Change', () => {
    const desc = describeLineSmaPctChart(linearUp(20));
    expect(desc).toContain('SMA Percent-Change');
  });

  it('reports parameters', () => {
    const desc = describeLineSmaPctChart(linearUp(20), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 5');
    expect(desc).toContain('bearishThreshold -5');
  });
});

describe('<ChartLineSmaPct />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineSmaPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('SMA');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSmaPct data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineSmaPct
        data={linearUp(20)}
        length={7}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-5');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-sma-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-aria-desc"]',
      )?.textContent,
    ).toContain('SMA Percent-Change');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="sma"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSmaPct
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
      <ChartLineSmaPct data={linearUp(20)} hiddenSeries={['pct']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-line"]'),
    ).toBe(null);
  });

  it('hides sma when controlled hidden', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} hiddenSeries={['sma']} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-sma-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-badge"]'),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-zero-line"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineSmaPct
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-sma-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineSmaPct data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-sma-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the pct line by default', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-line"]'),
    ).toBeTruthy();
  });

  it('renders the sma overlay path', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-sma-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineSmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-sma-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineSmaPct
        data={linearUp(20)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-sma-pct-line"]'),
    ).toBe(null);
  });
});

describe('SMA Percent integration', () => {
  it('CONST K!=0 yields smaPct=0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 14]) {
        const series = constBar(L + 5, K);
        const ch = computeLineSmaPct(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.smaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K=0 yields smaPct=null across (length)', () => {
    for (const L of [2, 4, 7]) {
      const series = constBar(L + 5, 0);
      const ch = computeLineSmaPct(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.smaPct[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP at i=L-1 yields (L-1)/(L+1)*100 dyadic', () => {
    const expected: Record<number, number> = {
      3: 50,
      7: 75,
      15: 87.5,
    };
    for (const [L, exp] of Object.entries(expected)) {
      const LL = Number(L);
      const series = linearUp(LL * 3);
      const ch = computeLineSmaPct(series, { length: LL });
      expect(ch.smaPct[LL - 1]).toBe(exp);
    }
  });
});
