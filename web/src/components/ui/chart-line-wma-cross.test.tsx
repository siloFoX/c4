import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineWmaCross,
  DEFAULT_CHART_LINE_WMA_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_WMA_CROSS_SLOW_LENGTH,
  classifyLineWmaCrossZone,
  computeLineWmaCrossLayout,
  computeLineWmaCrossWma,
  describeLineWmaCrossChart,
  getLineWmaCrossFinitePoints,
  normalizeLineWmaCrossLength,
  runLineWmaCross,
  type ChartLineWmaCrossPoint,
} from './chart-line-wma-cross';

const toPoints = (closes: number[]): ChartLineWmaCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT close = 5: WMA of constant K equals K bit-exact at
// every defined bar (weighted mean of K's = K).
const CONST_FLAT: ChartLineWmaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, () => 5),
);

const CONST_FLAT_HIGH: ChartLineWmaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, () => 1000),
);

// RISING_INT: close = i + 10. For period L = 4, the algebra gives
// WMA[i] = c + 2*(L-1)/3 = c + 2, where c = close[i-L+1] = i-3+10
// = i + 7. So WMA[i] = i + 9 bit-exact at every defined bar.
const RISING_INT: ChartLineWmaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => i + 10),
);

// PIVOT: 20 rising then 20 falling -- triggers crosses post-pivot.
const PIVOT: ChartLineWmaCrossPoint[] = toPoints([
  ...Array.from({ length: 20 }, (_, i) => 10 + i),
  ...Array.from({ length: 20 }, (_, i) => 29 - i),
]);

const WAVE: ChartLineWmaCrossPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { fastLength: 4, slowLength: 10 } as const;

describe('getLineWmaCrossFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineWmaCrossFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineWmaCrossFinitePoints(
        'nope' as unknown as ChartLineWmaCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineWmaCrossPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineWmaCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineWmaCrossLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineWmaCrossLength(9, 9)).toBe(9);
  });

  it('floors a fractional', () => {
    expect(normalizeLineWmaCrossLength(9.9, 9)).toBe(9);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineWmaCrossLength(1, 9)).toBe(9);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineWmaCrossLength(Number.NaN, 9)).toBe(9);
  });
});

describe('computeLineWmaCrossWma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineWmaCrossWma([], 4)).toEqual([]);
  });

  it('warm-up bars are null', () => {
    const out = computeLineWmaCrossWma([10, 11, 12, 13], 4);
    for (let i = 0; i < 3; i += 1) expect(out[i]).toBeNull();
  });

  it('CONST_FLAT close = 5: WMA = 5 bit-exact at every defined bar', () => {
    const out = computeLineWmaCrossWma(CONST_FLAT.map((p) => p.close), 4);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(5);
  });

  it('CONST_FLAT_HIGH close = 1000: WMA = 1000 bit-exact at every defined bar', () => {
    const out = computeLineWmaCrossWma(
      CONST_FLAT_HIGH.map((p) => p.close),
      4,
    );
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(1000);
  });

  it('CONST_FLAT identity holds at any length', () => {
    const lengths = [2, 4, 8, 20, 100];
    for (const len of lengths) {
      const out = computeLineWmaCrossWma(
        CONST_FLAT.map((p) => p.close),
        len,
      );
      for (let i = len - 1; i < out.length; i += 1) expect(out[i]).toBe(5);
    }
  });

  it('worked anchor: close = [0, 1, 2, 3] period 4 -> WMA[3] = 2 bit-exact', () => {
    // (1*0 + 2*1 + 3*2 + 4*3) / (1+2+3+4) = 20 / 10 = 2.
    const out = computeLineWmaCrossWma([0, 1, 2, 3], 4);
    expect(out[3]).toBe(2);
  });

  it('RISING_INT close = i + 10, period 4: WMA[i] = i + 9 bit-exact', () => {
    const out = computeLineWmaCrossWma(RISING_INT.map((p) => p.close), 4);
    for (let i = 3; i < out.length; i += 1) expect(out[i]).toBe(i + 9);
  });

  it('worked anchor: close = [10, 12] period 2 -> WMA = (10 + 24)/3 = 34/3', () => {
    const out = computeLineWmaCrossWma([10, 12], 2);
    expect(out[1]).toBe(34 / 3);
  });

  it('translation invariance: shifting close by k shifts WMA by exactly k', () => {
    const a = computeLineWmaCrossWma(RISING_INT.map((p) => p.close), 4);
    const b = computeLineWmaCrossWma(
      RISING_INT.map((p) => p.close + 1000),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]! + 1000);
    }
  });

  it('non-finite close in window nulls the bar', () => {
    const out = computeLineWmaCrossWma([5, 5, Number.NaN, 5], 4);
    expect(out[3]).toBeNull();
  });
});

describe('classifyLineWmaCrossZone', () => {
  it('fast crosses above slow -> up-cross', () => {
    expect(classifyLineWmaCrossZone(11, 10, 9, 10)).toBe('up-cross');
  });

  it('fast crosses below slow -> down-cross', () => {
    expect(classifyLineWmaCrossZone(9, 10, 11, 10)).toBe('down-cross');
  });

  it('fast above without crossing -> above', () => {
    expect(classifyLineWmaCrossZone(12, 10, 11, 10)).toBe('above');
  });

  it('fast below without crossing -> below', () => {
    expect(classifyLineWmaCrossZone(8, 10, 9, 10)).toBe('below');
  });

  it('fast at slow -> at', () => {
    expect(classifyLineWmaCrossZone(10, 10, 10, 10)).toBe('at');
  });

  it('null prev: no cross even when fast != slow', () => {
    expect(classifyLineWmaCrossZone(11, 10, null, null)).toBe('above');
    expect(classifyLineWmaCrossZone(9, 10, null, null)).toBe('below');
  });

  it('null fast -> none', () => {
    expect(classifyLineWmaCrossZone(null, 10, 9, 10)).toBe('none');
  });

  it('null slow -> none', () => {
    expect(classifyLineWmaCrossZone(11, null, 9, 10)).toBe('none');
  });
});

describe('runLineWmaCross', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineWmaCross([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineWmaCross([], OPTS).ok).toBe(false);
    expect(runLineWmaCross(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineWmaCross(RISING_INT, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineWmaCross(RISING_INT).fastLength).toBe(
      DEFAULT_CHART_LINE_WMA_CROSS_FAST_LENGTH,
    );
    expect(runLineWmaCross(RISING_INT).slowLength).toBe(
      DEFAULT_CHART_LINE_WMA_CROSS_SLOW_LENGTH,
    );
  });

  it('honours custom options', () => {
    const run = runLineWmaCross(RISING_INT, OPTS);
    expect(run.fastLength).toBe(4);
    expect(run.slowLength).toBe(10);
  });

  it('produces one sample per finite point', () => {
    expect(runLineWmaCross(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: no crosses, every sample after warm-up is "at" (fast == slow == K)', () => {
    const run = runLineWmaCross(CONST_FLAT, OPTS);
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.atCount).toBe(CONST_FLAT.length - 9);
  });

  it('PIVOT: records at least one cross', () => {
    const run = runLineWmaCross(PIVOT, OPTS);
    expect(run.upCrossCount + run.downCrossCount).toBeGreaterThan(0);
  });

  it('exposes the final fast / slow readings', () => {
    expect(runLineWmaCross(CONST_FLAT, OPTS).fastFinal).toBe(5);
    expect(runLineWmaCross(CONST_FLAT, OPTS).slowFinal).toBe(5);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING_INT].sort(() => -1);
    const run = runLineWmaCross(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineWmaCross(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.upCrossCount +
        run.downCrossCount +
        run.aboveCount +
        run.belowCount +
        run.atCount +
        none,
    ).toBe(run.samples.length);
  });
});

describe('computeLineWmaCrossLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineWmaCrossLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineWmaCrossLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineWmaCrossLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineWmaCrossLayout({ data: RISING_INT, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING_INT.length);
  });

  it('builds non-empty fast and slow paths', () => {
    const layout = computeLineWmaCrossLayout({ data: RISING_INT, ...OPTS });
    expect(layout.fastPath.length).toBeGreaterThan(0);
    expect(layout.slowPath.length).toBeGreaterThan(0);
  });

  it('CONST_FLAT: zero markers (no crosses)', () => {
    const layout = computeLineWmaCrossLayout({ data: CONST_FLAT, ...OPTS });
    expect(layout.markers).toHaveLength(0);
  });

  it('PIVOT: at least one marker', () => {
    const layout = computeLineWmaCrossLayout({ data: PIVOT, ...OPTS });
    expect(layout.markers.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineWmaCrossLayout({ data: PIVOT, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineWmaCrossLayout({ data: RISING_INT, ...OPTS });
    expect(layout.run.fastLength).toBe(4);
    expect(layout.run.slowLength).toBe(10);
  });
});

describe('describeLineWmaCrossChart', () => {
  it('names the indicator', () => {
    expect(describeLineWmaCrossChart(RISING_INT, OPTS)).toContain(
      'Weighted-MA fast-over-slow crossover',
    );
  });

  it('mentions the fast / slow lengths', () => {
    const desc = describeLineWmaCrossChart(RISING_INT, OPTS);
    expect(desc).toContain('fast length 4');
    expect(desc).toContain('slow length 10');
  });

  it('mentions the constant-close identity', () => {
    expect(describeLineWmaCrossChart(RISING_INT, OPTS)).toContain(
      'constant close keeps both WMA lines',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineWmaCrossChart([])).toBe('No data');
    expect(describeLineWmaCrossChart(null)).toBe('No data');
  });
});

describe('<ChartLineWmaCross />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    expect(
      screen.getByRole('region', { name: /WMA cross chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-wma-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Weighted-MA');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineWmaCross data={[]} fastLength={4} slowLength={10} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-wma-cross-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-wma-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('4');
    expect(root?.getAttribute('data-slow-length')).toBe('10');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING_INT.length),
    );
  });

  it('renders the price, fast, and slow lines', () => {
    const { container } = render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-fast-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-slow-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders cross markers on PIVOT input', () => {
    const { container } = render(
      <ChartLineWmaCross data={PIVOT} fastLength={4} slowLength={10} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wma-cross-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('renders no cross markers on CONST_FLAT', () => {
    const { container } = render(
      <ChartLineWmaCross data={CONST_FLAT} fastLength={4} slowLength={10} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wma-cross-marker"]',
    );
    expect(markers).toHaveLength(0);
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-wma-cross-badge-config"]',
    );
    expect(badge?.textContent).toContain('WMA 4/10');
  });

  it('hides the fast line via the legend toggle', () => {
    const { container } = render(
      <ChartLineWmaCross data={RISING_INT} fastLength={4} slowLength={10} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-wma-cross-legend-item"][data-series-id="fast"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-fast-line"]',
      ),
    ).toBeNull();
  });

  it('hides the slow line via showSlow=false', () => {
    const { container } = render(
      <ChartLineWmaCross
        data={RISING_INT}
        fastLength={4}
        slowLength={10}
        showSlow={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-wma-cross-slow-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a cross marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineWmaCross
        data={PIVOT}
        fastLength={4}
        slowLength={10}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-wma-cross-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineWmaCross
        ref={ref}
        data={RISING_INT}
        fastLength={4}
        slowLength={10}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
