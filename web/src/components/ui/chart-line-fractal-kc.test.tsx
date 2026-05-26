import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineFractalKc,
  applyLineFractalKcTrueRange,
  applyLineFractalKcWilder,
  classifyLineFractalKcZone,
  computeLineFractalKc,
  computeLineFractalKcLayout,
  describeLineFractalKcChart,
  detectLineFractalKcCrosses,
  detectLineFractalKcLowerFractals,
  detectLineFractalKcUpperFractals,
  getLineFractalKcFinitePoints,
  normalizeLineFractalKcAtrLength,
  normalizeLineFractalKcFractalLookback,
  normalizeLineFractalKcMultiplier,
  runLineFractalKc,
  DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH,
} from './chart-line-fractal-kc';
import type { ChartLineFractalKcPoint } from './chart-line-fractal-kc';

const constBar = (count: number, K: number): ChartLineFractalKcPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineFractalKcPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineFractalKcPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

/**
 * CONSTANT-SPREAD anchor: high = baseLow + spread, low = baseLow,
 * close = midpoint (baseLow + spread/2). TR is `spread` from index 0
 * (since |h - prevC| = |l - prevC| = spread/2 <= spread). No fractals
 * trigger because high and low are flat.
 */
const constantSpread = (
  count: number,
  baseLow: number,
  spread: number,
): ChartLineFractalKcPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: baseLow + spread,
    low: baseLow,
    close: baseLow + spread / 2,
  }));

describe('getLineFractalKcFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineFractalKcFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineFractalKcFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineFractalKcFinitePoints([
      null as unknown as ChartLineFractalKcPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineFractalKcAtrLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalKcAtrLength(undefined, 14)).toBe(14);
  });

  it('rejects below 2', () => {
    expect(normalizeLineFractalKcAtrLength(1, 14)).toBe(14);
  });
});

describe('normalizeLineFractalKcFractalLookback', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalKcFractalLookback(undefined, 2)).toBe(2);
  });

  it('accepts 1', () => {
    expect(normalizeLineFractalKcFractalLookback(1, 2)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineFractalKcFractalLookback(0, 2)).toBe(2);
  });
});

describe('normalizeLineFractalKcMultiplier', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineFractalKcMultiplier(undefined, 2)).toBe(2);
  });

  it('accepts zero', () => {
    expect(normalizeLineFractalKcMultiplier(0, 2)).toBe(0);
  });

  it('rejects negative', () => {
    expect(normalizeLineFractalKcMultiplier(-1, 2)).toBe(2);
  });
});

describe('applyLineFractalKcTrueRange', () => {
  it('TR[0] = h - l', () => {
    const out = applyLineFractalKcTrueRange([10], [5], [7]);
    expect(out[0]).toBe(5);
  });

  it('CONST h=l yields TR=0 for all bars', () => {
    const out = applyLineFractalKcTrueRange(
      [5, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
    );
    expect(out).toEqual([0, 0, 0]);
  });

  it('LINEAR UP h=l=close yields TR=1 for i>=1', () => {
    const out = applyLineFractalKcTrueRange(
      [1, 2, 3, 4],
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    );
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(1);
    expect(out[2]).toBe(1);
    expect(out[3]).toBe(1);
  });
});

describe('applyLineFractalKcWilder', () => {
  it('CONST input yields constant output bit-exact (any length)', () => {
    for (const L of [3, 7, 14]) {
      const out = applyLineFractalKcWilder(Array(20).fill(1), L);
      for (let i = L - 1; i < 20; i += 1) {
        expect(out[i]).toBe(1);
      }
    }
  });

  it('CONST=0 yields 0', () => {
    const out = applyLineFractalKcWilder(Array(10).fill(0), 4);
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(0);
    }
  });

  it('warmup is null', () => {
    const out = applyLineFractalKcWilder([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null resets seed', () => {
    const out = applyLineFractalKcWilder([1, 1, null, 1, 1, 1], 3);
    expect(out[2]).toBe(null);
    expect(out[5]).toBe(1);
  });
});

describe('detectLineFractalKcUpperFractals', () => {
  it('flags strict 5-bar maxima', () => {
    const out = detectLineFractalKcUpperFractals(
      [1, 2, 5, 2, 1, 0, 1, 2, 6, 2, 1],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('does not flag plateau (non-strict)', () => {
    const out = detectLineFractalKcUpperFractals(
      [1, 5, 5, 5, 1],
      2,
    );
    expect(out[2]).toBe(false);
  });

  it('LINEAR UP yields no fractals', () => {
    const out = detectLineFractalKcUpperFractals([1, 2, 3, 4, 5, 6, 7], 2);
    for (const v of out) expect(v).toBe(false);
  });
});

describe('detectLineFractalKcLowerFractals', () => {
  it('flags strict 5-bar minima', () => {
    const out = detectLineFractalKcLowerFractals(
      [5, 4, 1, 4, 5, 6, 5, 4, 0, 4, 5],
      2,
    );
    expect(out[2]).toBe(true);
    expect(out[8]).toBe(true);
  });

  it('LINEAR DOWN yields no fractals', () => {
    const out = detectLineFractalKcLowerFractals([7, 6, 5, 4, 3, 2, 1], 2);
    for (const v of out) expect(v).toBe(false);
  });
});

describe('computeLineFractalKc', () => {
  it('returns empty for null', () => {
    const ch = computeLineFractalKc(null);
    expect(ch.upper).toEqual([]);
  });

  it('CONST h=l=close=K yields upper=lower=mid=K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineFractalKc(series, {
        atrLength: 4,
        fractalLookback: 2,
        multiplier: 2,
      });
      for (let i = 3; i < 20; i += 1) {
        expect(ch.upper[i]).toBe(K);
        expect(ch.lower[i]).toBe(K);
        expect(ch.mid[i]).toBe(K);
      }
    }
  });

  it('CONSTANT-SPREAD spread=2 yields upper=close+m*2, lower=close-m*2 bit-exact', () => {
    const series = constantSpread(20, 5, 2);
    const ch = computeLineFractalKc(series, {
      atrLength: 4,
      fractalLookback: 2,
      multiplier: 2,
    });
    // close = 6, TR = 2, ATR = 2, no fractals -> mid = close = 6
    for (let i = 3; i < 20; i += 1) {
      expect(ch.mid[i]).toBe(6);
      expect(ch.upper[i]).toBe(10);
      expect(ch.lower[i]).toBe(2);
    }
  });

  it('CONSTANT-SPREAD spread=4 multiplier=1 yields bands at close +/- 4', () => {
    const series = constantSpread(20, 10, 4);
    const ch = computeLineFractalKc(series, {
      atrLength: 4,
      fractalLookback: 2,
      multiplier: 1,
    });
    // close = 12, TR = 4, ATR = 4
    for (let i = 3; i < 20; i += 1) {
      expect(ch.mid[i]).toBe(12);
      expect(ch.upper[i]).toBe(16);
      expect(ch.lower[i]).toBe(8);
    }
  });

  it('multiplier=0 collapses bands onto mid', () => {
    const series = constantSpread(20, 5, 2);
    const ch = computeLineFractalKc(series, {
      atrLength: 4,
      multiplier: 0,
    });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.upper[i]).toBe(6);
      expect(ch.lower[i]).toBe(6);
      expect(ch.mid[i]).toBe(6);
    }
  });

  it('warmup region has null bands', () => {
    const series = linearUp(20);
    const ch = computeLineFractalKc(series, { atrLength: 4 });
    expect(ch.upper[0]).toBe(null);
    expect(ch.upper[2]).toBe(null);
    expect(ch.upper[3]).toBeTypeOf('number');
  });

  it('reseeds mid to fractal pivot when one is confirmed', () => {
    // Simple peak at index 2: highs = [1,2,5,2,1,...]
    const series: ChartLineFractalKcPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 1, high: 2, low: 2, close: 2 },
      { x: 2, high: 5, low: 5, close: 5 },
      { x: 3, high: 2, low: 2, close: 2 },
      { x: 4, high: 1, low: 1, close: 1 },
      { x: 5, high: 2, low: 2, close: 2 },
      { x: 6, high: 3, low: 3, close: 3 },
    ];
    const ch = computeLineFractalKc(series, {
      atrLength: 3,
      fractalLookback: 2,
      multiplier: 0,
    });
    // upper fractal at index 2 confirmed at index 4 (lookback=2).
    expect(ch.lastUpperFractal[4]).toBe(5);
    expect(ch.mid[4]).toBe(5);
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineFractalKc(series, { atrLength: 4 });
    expect(ch.upper.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineFractalKc(series, { atrLength: 4 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineFractalKcZone', () => {
  it('classifies above when close > upper', () => {
    expect(classifyLineFractalKcZone(11, 10, 5)).toBe('above');
  });

  it('classifies below when close < lower', () => {
    expect(classifyLineFractalKcZone(4, 10, 5)).toBe('below');
  });

  it('classifies inside when close in [lower, upper]', () => {
    expect(classifyLineFractalKcZone(7, 10, 5)).toBe('inside');
  });

  it('returns none when bands are null', () => {
    expect(classifyLineFractalKcZone(7, null, null)).toBe('none');
  });
});

describe('detectLineFractalKcCrosses', () => {
  it('flags up when going from inside to above', () => {
    const ev = detectLineFractalKcCrosses(
      [5, 11],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('up');
  });

  it('flags down when going from inside to below', () => {
    const ev = detectLineFractalKcCrosses(
      [5, -1],
      [10, 10],
      [0, 0],
    );
    expect(ev[1]).toBe('down');
  });

  it('warmup is null', () => {
    const ev = detectLineFractalKcCrosses(
      [5, 11],
      [null, 10],
      [null, 0],
    );
    expect(ev[0]).toBe(null);
    expect(ev[1]).toBe(null);
  });
});

describe('runLineFractalKc', () => {
  it('marks ok=false for short data', () => {
    const run = runLineFractalKc(constBar(5, 10), {
      atrLength: 4,
      fractalLookback: 2,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineFractalKc(constBar(10, 10), {
      atrLength: 4,
      fractalLookback: 2,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineFractalKc(constBar(40, 10));
    expect(run.atrLength).toBe(DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH);
    expect(run.fractalLookback).toBe(2);
    expect(run.multiplier).toBe(2);
  });

  it('respects explicit options', () => {
    const run = runLineFractalKc(constBar(40, 10), {
      atrLength: 7,
      fractalLookback: 3,
      multiplier: 1.5,
    });
    expect(run.atrLength).toBe(7);
    expect(run.fractalLookback).toBe(3);
    expect(run.multiplier).toBe(1.5);
  });

  it('sorts by x', () => {
    const data: ChartLineFractalKcPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineFractalKc(data, { atrLength: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies post-warmup as inside', () => {
    const run = runLineFractalKc(linearUp(20), {
      atrLength: 4,
      multiplier: 2,
    });
    expect(run.insideCount).toBeGreaterThan(0);
  });
});

describe('computeLineFractalKcLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineFractalKcLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineFractalKcLayout({
      data: linearUp(20),
    });
    expect(layout.ok).toBe(true);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineFractalKcLayout({
      data: linearUp(20),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });

  it('band paths exist when bands defined', () => {
    const layout = computeLineFractalKcLayout({
      data: linearUp(20),
    });
    expect(layout.upperPath.length).toBeGreaterThan(0);
    expect(layout.lowerPath.length).toBeGreaterThan(0);
    expect(layout.midPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineFractalKcChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineFractalKcChart([])).toBe('No data');
  });

  it('mentions Fractal Keltner Channel', () => {
    const desc = describeLineFractalKcChart(linearUp(20));
    expect(desc).toContain('Fractal Keltner Channel');
  });

  it('reports parameters', () => {
    const desc = describeLineFractalKcChart(linearUp(20), {
      atrLength: 7,
      fractalLookback: 3,
      multiplier: 1.5,
    });
    expect(desc).toContain('atrLength 7');
    expect(desc).toContain('fractalLookback 3');
    expect(desc).toContain('multiplier 1.5');
  });
});

describe('<ChartLineFractalKc />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineFractalKc data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-kc-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Keltner');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFractalKc data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineFractalKc
        data={linearUp(20)}
        atrLength={7}
        fractalLookback={3}
        multiplier={1.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-kc"]',
    );
    expect(root?.getAttribute('data-atr-length')).toBe('7');
    expect(root?.getAttribute('data-fractal-lookback')).toBe('3');
    expect(root?.getAttribute('data-multiplier')).toBe('1.5');
  });

  it('exposes total-points', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    const root = container.querySelector(
      '[data-section="chart-line-fractal-kc"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-kc-aria-desc"]',
      )?.textContent,
    ).toContain('Fractal Keltner Channel');
  });

  it('renders all four legend items', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="upper"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="mid"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="lower"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineFractalKc
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="upper"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'upper',
      hidden: true,
    });
  });

  it('hides upper when controlled hidden', () => {
    const { container } = render(
      <ChartLineFractalKc
        data={linearUp(20)}
        hiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-upper"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-badge"]'),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineFractalKc data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineFractalKc data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineFractalKc data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-kc-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineFractalKc
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-fractal-kc"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineFractalKc data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-fractal-kc-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders upper and lower band paths', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-upper"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-lower"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(<ChartLineFractalKc data={linearUp(20)} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-fractal-kc-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineFractalKc
        data={linearUp(20)}
        defaultHiddenSeries={['upper']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-fractal-kc-upper"]'),
    ).toBe(null);
  });
});

describe('Fractal KC integration', () => {
  it('CONST yields bands = K across (K, atrLength, multiplier)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 4, 7]) {
        for (const M of [0, 1, 2, 3]) {
          const series = constBar(L + 5, K);
          const ch = computeLineFractalKc(series, {
            atrLength: L,
            fractalLookback: 2,
            multiplier: M,
          });
          for (let i = L - 1; i < L + 5; i += 1) {
            expect(ch.upper[i]).toBe(K);
            expect(ch.lower[i]).toBe(K);
          }
        }
      }
    }
  });

  it('CONSTANT-SPREAD yields upper=close+m*D, lower=close-m*D across (D, length, multiplier)', () => {
    for (const D of [1, 2, 4]) {
      for (const L of [3, 4, 7]) {
        for (const M of [0, 1, 2]) {
          const baseLow = 5;
          const close = baseLow + D / 2;
          const series = constantSpread(L + 5, baseLow, D);
          const ch = computeLineFractalKc(series, {
            atrLength: L,
            fractalLookback: 2,
            multiplier: M,
          });
          for (let i = L - 1; i < L + 5; i += 1) {
            expect(ch.upper[i]).toBe(close + M * D);
            expect(ch.lower[i]).toBe(close - M * D);
          }
        }
      }
    }
  });
});
