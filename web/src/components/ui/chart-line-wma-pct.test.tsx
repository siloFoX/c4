import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineWmaPct,
  applyLineWmaPctWma,
  classifyLineWmaPctZone,
  computeLineWmaPct,
  computeLineWmaPctLayout,
  describeLineWmaPctChart,
  detectLineWmaPctCrosses,
  getLineWmaPctFinitePoints,
  normalizeLineWmaPctLength,
  normalizeLineWmaPctThreshold,
  runLineWmaPct,
  DEFAULT_CHART_LINE_WMA_PCT_LENGTH,
} from './chart-line-wma-pct';
import type { ChartLineWmaPctPoint } from './chart-line-wma-pct';

const constBar = (count: number, K: number): ChartLineWmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineWmaPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineWmaPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineWmaPctFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineWmaPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineWmaPctFinitePoints([
      null as unknown as ChartLineWmaPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineWmaPctLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineWmaPctLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineWmaPctLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineWmaPctThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineWmaPctThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineWmaPctThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineWmaPctThreshold(5, 0)).toBe(5);
  });
});

describe('applyLineWmaPctWma', () => {
  it('CONST K WMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7, 14]) {
        const out = applyLineWmaPctWma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineWmaPctWma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null in window propagates to null', () => {
    const out = applyLineWmaPctWma([1, null, 3, 4], 3);
    expect(out[2]).toBe(null);
  });

  it('L=3 WMA of [1,2,3]: (3*3 + 2*2 + 1*1)/6 = 14/6', () => {
    const out = applyLineWmaPctWma([1, 2, 3], 3);
    expect(out[2]).toBeCloseTo(14 / 6, 10);
  });

  it('L=7 WMA of [1..7] yields sum-of-squares/sum = 140/28 = 5', () => {
    const out = applyLineWmaPctWma([1, 2, 3, 4, 5, 6, 7], 7);
    expect(out[6]).toBe(5);
  });
});

describe('computeLineWmaPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineWmaPct(null);
    expect(ch.wmaPct).toEqual([]);
  });

  it('CONST close = K, K != 0 yields wmaPct = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineWmaPct(series, { length: 4 });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.wmaPct[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields wmaPct = null (divide guard)', () => {
    const series = constBar(20, 0);
    const ch = computeLineWmaPct(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.wmaPct[i]).toBe(null);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineWmaPct(series, { length: 4 });
    expect(ch.wmaPct[0]).toBe(null);
    expect(ch.wmaPct[2]).toBe(null);
    expect(ch.wmaPct[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineWmaPct(series, { length: 4 });
    expect(ch.wmaPct.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineWmaPct(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('wma values populated for CONST', () => {
    const series = constBar(10, 7);
    const ch = computeLineWmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.wma[i]).toBe(7);
    }
  });

  it('delta = close - wma bit-exact for CONST', () => {
    const series = constBar(10, 5);
    const ch = computeLineWmaPct(series, { length: 3 });
    for (let i = 2; i < 10; i += 1) {
      expect(ch.delta[i]).toBe(0);
    }
  });
});

describe('classifyLineWmaPctZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineWmaPctZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineWmaPctZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineWmaPctZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineWmaPctZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineWmaPctCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineWmaPctCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineWmaPctCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineWmaPctCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineWmaPctCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineWmaPct', () => {
  it('marks ok=false for short data', () => {
    const run = runLineWmaPct(constBar(3, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineWmaPct(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineWmaPct(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_WMA_PCT_LENGTH);
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineWmaPct(constBar(20, 10), {
      length: 7,
      bullishThreshold: 2,
      bearishThreshold: -2,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(2);
    expect(run.bearishThreshold).toBe(-2);
  });

  it('sorts by x', () => {
    const data: ChartLineWmaPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineWmaPct(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST K>0 classifies as neutral (wmaPct=0)', () => {
    const run = runLineWmaPct(constBar(20, 10), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });

  it('LINEAR UP classifies as bullish post warmup', () => {
    const run = runLineWmaPct(linearUp(20), { length: 4 });
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('computeLineWmaPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineWmaPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineWmaPctLayout({ data: linearUp(20) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above pct', () => {
    const layout = computeLineWmaPctLayout({ data: linearUp(20) });
    expect(layout.priceBottom).toBeLessThan(layout.pctTop);
  });

  it('pct axis includes zero', () => {
    const layout = computeLineWmaPctLayout({ data: linearUp(20) });
    expect(layout.pctMin).toBeLessThanOrEqual(0);
    expect(layout.pctMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path, wma path, and dots', () => {
    const layout = computeLineWmaPctLayout({ data: linearUp(20) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.wmaPath.length).toBeGreaterThan(0);
    expect(layout.priceDots.length).toBe(20);
  });
});

describe('describeLineWmaPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineWmaPctChart([])).toBe('No data');
  });

  it('mentions WMA Percent-Change', () => {
    const desc = describeLineWmaPctChart(linearUp(20));
    expect(desc).toContain('WMA Percent-Change');
  });

  it('reports parameters', () => {
    const desc = describeLineWmaPctChart(linearUp(20), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 5');
    expect(desc).toContain('bearishThreshold -5');
  });
});

describe('<ChartLineWmaPct />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineWmaPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('WMA');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWmaPct data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineWmaPct
        data={linearUp(20)}
        length={7}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-5');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-wma-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-pct-aria-desc"]',
      )?.textContent,
    ).toContain('WMA Percent-Change');
  });

  it('renders all three legend items', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="wma"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="pct"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineWmaPct
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
      <ChartLineWmaPct data={linearUp(20)} hiddenSeries={['pct']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-line"]'),
    ).toBe(null);
  });

  it('hides wma when controlled hidden', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} hiddenSeries={['wma']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-wma-path"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-badge"]'),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-zero-line"]'),
    ).toBe(null);
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineWmaPct
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineWmaPct data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-wma-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the pct line by default', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-line"]'),
    ).toBeTruthy();
  });

  it('renders the wma overlay path', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-wma-path"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineWmaPct data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineWmaPct
        data={linearUp(20)}
        defaultHiddenSeries={['pct']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-pct-line"]'),
    ).toBe(null);
  });
});

describe('WMA Percent integration', () => {
  it('CONST K!=0 yields wmaPct=0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [2, 4, 7, 14]) {
        const series = constBar(L + 5, K);
        const ch = computeLineWmaPct(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.wmaPct[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K=0 yields wmaPct=null across (length)', () => {
    for (const L of [2, 4, 7]) {
      const series = constBar(L + 5, 0);
      const ch = computeLineWmaPct(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.wmaPct[i]).toBe(null);
      }
    }
  });

  it('LINEAR UP L=7 at i=6: wma=5, close=7, wmaPct=(2)/(5)*100 (approximate 40)', () => {
    const series = linearUp(20);
    const ch = computeLineWmaPct(series, { length: 7 });
    expect(ch.wma[6]).toBe(5);
    expect(ch.delta[6]).toBe(2);
    expect(ch.wmaPct[6]).toBeCloseTo(40, 10);
  });
});
