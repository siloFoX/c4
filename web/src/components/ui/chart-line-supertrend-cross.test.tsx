import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSupertrendCross,
  applyLineSupertrendCrossWilder,
  classifyLineSupertrendCrossRelation,
  computeLineSupertrendCross,
  computeLineSupertrendCrossLayout,
  computeLineSupertrendCrossTr,
  describeLineSupertrendCrossChart,
  detectLineSupertrendCrossFlips,
  getLineSupertrendCrossFinitePoints,
  normalizeLineSupertrendCrossLength,
  normalizeLineSupertrendCrossMultiplier,
  runLineSupertrendCross,
  DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH,
  DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
} from './chart-line-supertrend-cross';
import type { ChartLineSupertrendCrossPoint } from './chart-line-supertrend-cross';

const constBar = (
  count: number,
  K: number,
): ChartLineSupertrendCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
  }));

const linearUp = (count: number): ChartLineSupertrendCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
  }));

const linearDown = (count: number): ChartLineSupertrendCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
  }));

describe('getLineSupertrendCrossFinitePoints', () => {
  it('empty for null', () => {
    expect(getLineSupertrendCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN', () => {
    const r = getLineSupertrendCrossFinitePoints([
      { x: 0, high: Number.NaN, low: 0, close: 0 },
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineSupertrendCrossFinitePoints([
      null as unknown as ChartLineSupertrendCrossPoint,
      { x: 1, high: 1, low: 0, close: 1 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalize helpers', () => {
  it('length default + below-2 + accept', () => {
    expect(normalizeLineSupertrendCrossLength(undefined, 10)).toBe(10);
    expect(normalizeLineSupertrendCrossLength(1, 10)).toBe(10);
    expect(normalizeLineSupertrendCrossLength(5, 10)).toBe(5);
  });

  it('multiplier default + <=0 + accept', () => {
    expect(normalizeLineSupertrendCrossMultiplier(undefined, 3)).toBe(3);
    expect(normalizeLineSupertrendCrossMultiplier(0, 3)).toBe(3);
    expect(normalizeLineSupertrendCrossMultiplier(-1, 3)).toBe(3);
    expect(normalizeLineSupertrendCrossMultiplier(1.5, 3)).toBe(1.5);
  });
});

describe('applyLineSupertrendCrossWilder', () => {
  it('CONST K Wilder is K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      const out = applyLineSupertrendCrossWilder(Array(8).fill(K), 3);
      for (let i = 2; i < 8; i += 1) expect(out[i]).toBe(K);
    }
  });
});

describe('computeLineSupertrendCrossTr', () => {
  it('CONST yields TR = 0', () => {
    const tr = computeLineSupertrendCrossTr(constBar(5, 50));
    for (const v of tr) expect(v).toBe(0);
  });

  it('LINEAR UP h=l yields TR = 1 except first bar', () => {
    const tr = computeLineSupertrendCrossTr(linearUp(5));
    expect(tr[0]).toBe(0);
    expect(tr[1]).toBe(1);
    expect(tr[2]).toBe(1);
    expect(tr[3]).toBe(1);
    expect(tr[4]).toBe(1);
  });
});

describe('computeLineSupertrendCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineSupertrendCross(null);
    expect(ch.supertrend).toEqual([]);
  });

  it('CONST yields supertrend = K and direction = up', () => {
    const ch = computeLineSupertrendCross(constBar(15, 50), {
      length: 3,
    });
    for (let i = 2; i < 15; i += 1) {
      expect(ch.supertrend[i]).toBe(50);
      expect(ch.direction[i]).toBe('up');
    }
  });

  it('LINEAR UP keeps direction = up (close above supertrend)', () => {
    const ch = computeLineSupertrendCross(linearUp(20), {
      length: 3,
    });
    let saw = false;
    for (let i = 2; i < 20; i += 1) {
      if (ch.direction[i] !== 'none') {
        expect(ch.direction[i]).toBe('up');
        saw = true;
      }
    }
    expect(saw).toBe(true);
  });

  it('CONST: atr = 0 and final bands collapse to K', () => {
    const ch = computeLineSupertrendCross(constBar(15, 50), {
      length: 3,
    });
    for (let i = 2; i < 15; i += 1) {
      expect(ch.atr[i]).toBe(0);
      expect(ch.finalUpper[i]).toBe(50);
      expect(ch.finalLower[i]).toBe(50);
    }
  });

  it('output length matches input', () => {
    const ch = computeLineSupertrendCross(linearUp(15), { length: 3 });
    expect(ch.supertrend.length).toBe(15);
    expect(ch.direction.length).toBe(15);
  });

  it('does not mutate input', () => {
    const data = linearUp(15);
    const snap = JSON.parse(JSON.stringify(data));
    computeLineSupertrendCross(data, { length: 3 });
    expect(data).toEqual(snap);
  });
});

describe('classifyLineSupertrendCrossRelation', () => {
  it('bullish when close > supertrend', () => {
    expect(classifyLineSupertrendCrossRelation(10, 5)).toBe('bullish');
  });

  it('bearish when close < supertrend', () => {
    expect(classifyLineSupertrendCrossRelation(5, 10)).toBe('bearish');
  });

  it('equal when close == supertrend', () => {
    expect(classifyLineSupertrendCrossRelation(5, 5)).toBe('equal');
  });

  it('none on null', () => {
    expect(classifyLineSupertrendCrossRelation(null, 5)).toBe('none');
  });
});

describe('detectLineSupertrendCrossFlips', () => {
  it('flip-up on down -> up', () => {
    expect(detectLineSupertrendCrossFlips(['down', 'up'])[1]).toBe(
      'flip-up',
    );
  });

  it('flip-down on up -> down', () => {
    expect(detectLineSupertrendCrossFlips(['up', 'down'])[1]).toBe(
      'flip-down',
    );
  });

  it('null on same direction', () => {
    expect(detectLineSupertrendCrossFlips(['up', 'up'])[1]).toBe(null);
  });

  it('first bar always null', () => {
    expect(detectLineSupertrendCrossFlips(['up', 'up'])[0]).toBe(null);
  });

  it('none state suppresses flip', () => {
    expect(detectLineSupertrendCrossFlips(['none', 'up'])[1]).toBe(null);
  });
});

describe('runLineSupertrendCross', () => {
  it('ok=false on short data', () => {
    const run = runLineSupertrendCross(constBar(3, 50), { length: 3 });
    expect(run.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const run = runLineSupertrendCross(constBar(10, 50), { length: 3 });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineSupertrendCross(linearUp(20));
    expect(run.length).toBe(DEFAULT_CHART_LINE_SUPERTREND_CROSS_LENGTH);
    expect(run.multiplier).toBe(
      DEFAULT_CHART_LINE_SUPERTREND_CROSS_MULTIPLIER,
    );
  });

  it('respects explicit options', () => {
    const run = runLineSupertrendCross(linearUp(20), {
      length: 5,
      multiplier: 2,
    });
    expect(run.length).toBe(5);
    expect(run.multiplier).toBe(2);
  });

  it('sorts by x', () => {
    const data: ChartLineSupertrendCrossPoint[] = [
      { x: 2, high: 3, low: 3, close: 3 },
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 1, high: 2, low: 2, close: 2 },
    ];
    const run = runLineSupertrendCross(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero flips', () => {
    const run = runLineSupertrendCross(constBar(15, 50), { length: 3 });
    expect(run.flipUpCount).toBe(0);
    expect(run.flipDownCount).toBe(0);
  });

  it('CONST yields all equal relation after warmup', () => {
    const run = runLineSupertrendCross(constBar(15, 50), { length: 3 });
    expect(run.samples[5]?.relation).toBe('equal');
  });

  it('LINEAR UP yields zero flips (stays in uptrend)', () => {
    const run = runLineSupertrendCross(linearUp(30), { length: 3 });
    expect(run.flipUpCount).toBe(0);
    expect(run.flipDownCount).toBe(0);
  });
});

describe('computeLineSupertrendCrossLayout', () => {
  it('ok=false on empty', () => {
    const layout = computeLineSupertrendCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('ok=true on long enough data', () => {
    const layout = computeLineSupertrendCrossLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above deviation', () => {
    const layout = computeLineSupertrendCrossLayout({ data: linearUp(15) });
    expect(layout.priceBottom).toBeLessThan(layout.devTop);
  });

  it('produces price + supertrend + deviation paths', () => {
    const layout = computeLineSupertrendCrossLayout({
      data: linearUp(15),
      length: 3,
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.supertrendPath.length).toBeGreaterThan(0);
    expect(layout.deviationPath.length).toBeGreaterThan(0);
  });

  it('CONST produces zero markers', () => {
    const layout = computeLineSupertrendCrossLayout({
      data: constBar(15, 50),
      length: 3,
    });
    expect(layout.markers.length).toBe(0);
  });
});

describe('describeLineSupertrendCrossChart', () => {
  it('No data on empty', () => {
    expect(describeLineSupertrendCrossChart([])).toBe('No data');
  });

  it('mentions Supertrend Cross', () => {
    expect(describeLineSupertrendCrossChart(linearUp(15))).toContain(
      'Supertrend Cross',
    );
  });

  it('reports parameters', () => {
    const desc = describeLineSupertrendCrossChart(linearUp(15), {
      length: 5,
      multiplier: 2,
    });
    expect(desc).toContain('length 5');
    expect(desc).toContain('multiplier 2');
  });
});

describe('<ChartLineSupertrendCross />', () => {
  it('empty placeholder', () => {
    const { container } = render(<ChartLineSupertrendCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('region role with aria-label', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Supertrend');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSupertrendCross data={linearUp(15)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        length={5}
        multiplier={2}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross"]',
    );
    expect(root?.getAttribute('data-length')).toBe('5');
    expect(root?.getAttribute('data-multiplier')).toBe('2');
  });

  it('exposes flip counts', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={constBar(15, 50)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross"]',
    );
    expect(root?.getAttribute('data-flip-up-count')).toBe('0');
    expect(root?.getAttribute('data-flip-down-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-aria-desc"]',
      )?.textContent,
    ).toContain('Supertrend Cross');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="supertrend"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="deviation"]'),
    ).toBeTruthy();
  });

  it('legend toggle', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="supertrend"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'supertrend',
      hidden: true,
    });
  });

  it('hides supertrend when controlled', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        hiddenSeries={['supertrend']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-supertrend"]',
      ),
    ).toBe(null);
  });

  it('renders badge', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis on showAxis=false', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid on showGrid=false', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend on showLegend=false', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className+style', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-supertrend-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        animate={false}
      />,
    );
    expect(
      container
        .querySelector('[data-section="chart-line-supertrend-cross-svg"]')
        ?.classList.contains('motion-safe:animate-fade-in'),
    ).toBe(false);
  });

  it('renders supertrend + deviation paths', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} length={3} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-supertrend"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-deviation"]',
      ),
    ).toBeTruthy();
  });

  it('renders price path', () => {
    const { container } = render(
      <ChartLineSupertrendCross data={linearUp(15)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineSupertrendCross
        data={linearUp(15)}
        defaultHiddenSeries={['supertrend']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-supertrend-cross-supertrend"]',
      ),
    ).toBe(null);
  });
});

describe('Supertrend Cross integration', () => {
  it('CONST yields zero flips across multiple parameters', () => {
    for (const L of [3, 5, 7]) {
      for (const M of [1, 2, 3]) {
        const run = runLineSupertrendCross(constBar(L * 3, 50), {
          length: L,
          multiplier: M,
        });
        expect(run.flipUpCount).toBe(0);
        expect(run.flipDownCount).toBe(0);
      }
    }
  });

  it('CONST: supertrend = K bit-exact across multiple K and lengths', () => {
    for (const K of [1, 10, 100]) {
      for (const L of [3, 5, 7]) {
        const ch = computeLineSupertrendCross(constBar(L * 3, K), {
          length: L,
        });
        for (let i = L - 1; i < L * 3; i += 1) {
          expect(ch.supertrend[i]).toBe(K);
        }
      }
    }
  });
});
