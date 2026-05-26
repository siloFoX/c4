import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAtrCross,
  applyLineAtrCrossTrueRange,
  applyLineAtrCrossWilder,
  classifyLineAtrCrossRelation,
  computeLineAtrCross,
  computeLineAtrCrossLayout,
  describeLineAtrCrossChart,
  detectLineAtrCrossCrosses,
  getLineAtrCrossFinitePoints,
  normalizeLineAtrCrossLength,
  runLineAtrCross,
  DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH,
  DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH,
} from './chart-line-atr-cross';
import type { ChartLineAtrCrossPoint } from './chart-line-atr-cross';

const constBar = (count: number, K: number): ChartLineAtrCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const constantSpread = (
  count: number,
  baseLow: number,
  spread: number,
): ChartLineAtrCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: baseLow + spread,
    low: baseLow,
    close: baseLow + spread / 2,
  }));

describe('getLineAtrCrossFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAtrCrossFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite high', () => {
    const r = getLineAtrCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 5, close: 7 },
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineAtrCrossFinitePoints([
      null as unknown as ChartLineAtrCrossPoint,
      { x: 1, high: 10, low: 5, close: 7 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineAtrCrossLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAtrCrossLength(undefined, 7)).toBe(7);
  });

  it('rejects below 2', () => {
    expect(normalizeLineAtrCrossLength(1, 7)).toBe(7);
  });
});

describe('applyLineAtrCrossTrueRange', () => {
  it('TR[0] = h - l', () => {
    const out = applyLineAtrCrossTrueRange([10], [5], [7]);
    expect(out[0]).toBe(5);
  });

  it('CONST h=l yields TR=0 everywhere', () => {
    const out = applyLineAtrCrossTrueRange(
      [5, 5, 5],
      [5, 5, 5],
      [5, 5, 5],
    );
    expect(out).toEqual([0, 0, 0]);
  });

  it('CONSTANT-SPREAD with mid close yields TR=D constant', () => {
    const out = applyLineAtrCrossTrueRange(
      [6, 6, 6],
      [4, 4, 4],
      [5, 5, 5],
    );
    expect(out).toEqual([2, 2, 2]);
  });
});

describe('applyLineAtrCrossWilder', () => {
  it('CONST K Wilder is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const L of [3, 7, 14]) {
        const out = applyLineAtrCrossWilder(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineAtrCrossWilder([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });
});

describe('computeLineAtrCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineAtrCross(null);
    expect(ch.shortAtr).toEqual([]);
    expect(ch.longAtr).toEqual([]);
  });

  it('CONST yields both ATRs = 0', () => {
    const series = constBar(30, 10);
    const ch = computeLineAtrCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    for (let i = 4; i < 30; i += 1) {
      expect(ch.shortAtr[i]).toBe(0);
      expect(ch.longAtr[i]).toBe(0);
    }
  });

  it('CONSTANT-SPREAD yields both ATRs = D bit-exact', () => {
    const series = constantSpread(30, 5, 2);
    const ch = computeLineAtrCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    for (let i = 4; i < 30; i += 1) {
      expect(ch.shortAtr[i]).toBe(2);
      expect(ch.longAtr[i]).toBe(2);
    }
  });

  it('output length matches input length', () => {
    const series = constBar(30, 10);
    const ch = computeLineAtrCross(series, {
      shortLength: 3,
      longLength: 5,
    });
    expect(ch.shortAtr.length).toBe(30);
    expect(ch.longAtr.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = constantSpread(30, 5, 2);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineAtrCross(series, { shortLength: 3, longLength: 5 });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineAtrCrossRelation', () => {
  it('expanding when short > long', () => {
    expect(classifyLineAtrCrossRelation(2, 1)).toBe('expanding');
  });

  it('contracting when short < long', () => {
    expect(classifyLineAtrCrossRelation(1, 2)).toBe('contracting');
  });

  it('equal when short == long', () => {
    expect(classifyLineAtrCrossRelation(5, 5)).toBe('equal');
  });

  it('none when either null', () => {
    expect(classifyLineAtrCrossRelation(null, 1)).toBe('none');
    expect(classifyLineAtrCrossRelation(1, null)).toBe('none');
  });
});

describe('detectLineAtrCrossCrosses', () => {
  it('flags up cross when short newly exceeds long', () => {
    const ev = detectLineAtrCrossCrosses([1, 3], [2, 2]);
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when short newly falls below long', () => {
    const ev = detectLineAtrCrossCrosses([3, 1], [2, 2]);
    expect(ev[1]).toBe('down');
  });

  it('null on warmup', () => {
    expect(detectLineAtrCrossCrosses([null, 1, 2], [null, 1.5, 1.5])).toEqual(
      [null, null, 'up'],
    );
  });

  it('no second cross when staying above', () => {
    const ev = detectLineAtrCrossCrosses([3, 4, 5], [2, 2, 2]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineAtrCross', () => {
  it('marks ok=false for short data', () => {
    const run = runLineAtrCross(constBar(4, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineAtrCross(constBar(5, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineAtrCross(constBar(40, 10));
    expect(run.shortLength).toBe(DEFAULT_CHART_LINE_ATR_CROSS_SHORT_LENGTH);
    expect(run.longLength).toBe(DEFAULT_CHART_LINE_ATR_CROSS_LONG_LENGTH);
  });

  it('respects explicit options', () => {
    const run = runLineAtrCross(constBar(40, 10), {
      shortLength: 5,
      longLength: 14,
    });
    expect(run.shortLength).toBe(5);
    expect(run.longLength).toBe(14);
  });

  it('sorts by x', () => {
    const data: ChartLineAtrCrossPoint[] = [
      { x: 2, high: 12, low: 10, close: 11 },
      { x: 0, high: 12, low: 10, close: 11 },
      { x: 1, high: 12, low: 10, close: 11 },
    ];
    const run = runLineAtrCross(data, { shortLength: 2, longLength: 3 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineAtrCross(constBar(30, 10), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.expandingCrossCount).toBe(0);
    expect(run.contractingCrossCount).toBe(0);
  });

  it('CONSTANT-SPREAD yields zero crosses', () => {
    const run = runLineAtrCross(constantSpread(30, 5, 2), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.expandingCrossCount).toBe(0);
    expect(run.contractingCrossCount).toBe(0);
  });

  it('CONSTANT-SPREAD classifies as equal', () => {
    const run = runLineAtrCross(constantSpread(30, 5, 2), {
      shortLength: 3,
      longLength: 5,
    });
    expect(run.equalCount).toBeGreaterThan(0);
  });
});

describe('computeLineAtrCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAtrCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAtrCrossLayout({
      data: constantSpread(30, 5, 2),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above atr', () => {
    const layout = computeLineAtrCrossLayout({
      data: constantSpread(30, 5, 2),
    });
    expect(layout.priceBottom).toBeLessThan(layout.atrTop);
  });

  it('atr axis starts at 0', () => {
    const layout = computeLineAtrCrossLayout({
      data: constantSpread(30, 5, 2),
    });
    expect(layout.atrMin).toBe(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAtrCrossLayout({
      data: constantSpread(30, 5, 2),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });

  it('produces short and long band paths', () => {
    const layout = computeLineAtrCrossLayout({
      data: constantSpread(30, 5, 2),
      shortLength: 3,
      longLength: 5,
    });
    expect(layout.shortPath.length).toBeGreaterThan(0);
    expect(layout.longPath.length).toBeGreaterThan(0);
  });

  it('no markers for CONST', () => {
    const layout = computeLineAtrCrossLayout({
      data: constBar(30, 10),
      shortLength: 3,
      longLength: 5,
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineAtrCrossChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAtrCrossChart([])).toBe('No data');
  });

  it('mentions ATR Cross', () => {
    const desc = describeLineAtrCrossChart(constantSpread(30, 5, 2));
    expect(desc).toContain('ATR Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineAtrCrossChart(constantSpread(30, 5, 2), {
      shortLength: 5,
      longLength: 14,
    });
    expect(desc).toContain('shortLength 5');
    expect(desc).toContain('longLength 14');
  });
});

describe('<ChartLineAtrCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineAtrCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('ATR Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} ref={ref} />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        shortLength={5}
        longLength={14}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross"]',
    );
    expect(root?.getAttribute('data-short-length')).toBe('5');
    expect(root?.getAttribute('data-long-length')).toBe('14');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
    expect(root?.getAttribute('data-expanding-cross-count')).toBe('0');
    expect(root?.getAttribute('data-contracting-cross-count')).toBe('0');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-aria-desc"]',
      )?.textContent,
    ).toContain('ATR Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="short"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="long"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="short"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'short',
      hidden: true,
    });
  });

  it('hides short when controlled hidden', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        hiddenSeries={['short']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-short"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-badge"]'),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-atr-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-atr-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders short and long paths', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        shortLength={3}
        longLength={5}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-short"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-long"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAtrCross data={constantSpread(30, 5, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-atr-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAtrCross
        data={constantSpread(30, 5, 2)}
        defaultHiddenSeries={['long']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-atr-cross-long"]'),
    ).toBe(null);
  });
});

describe('ATR Cross integration', () => {
  it('CONST yields zero crosses across (K, short, long)', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const [S, L] of [
        [2, 4],
        [5, 10],
        [7, 21],
      ] as const) {
        const run = runLineAtrCross(constBar(L + 10, K), {
          shortLength: S,
          longLength: L,
        });
        expect(run.expandingCrossCount).toBe(0);
        expect(run.contractingCrossCount).toBe(0);
      }
    }
  });

  it('CONSTANT-SPREAD yields zero crosses across (D, baseLow, short, long)', () => {
    for (const D of [1, 2, 5]) {
      for (const baseLow of [0, 5, 100]) {
        for (const [S, L] of [
          [2, 4],
          [3, 7],
        ] as const) {
          const run = runLineAtrCross(constantSpread(L + 10, baseLow, D), {
            shortLength: S,
            longLength: L,
          });
          expect(run.expandingCrossCount).toBe(0);
          expect(run.contractingCrossCount).toBe(0);
        }
      }
    }
  });
});
