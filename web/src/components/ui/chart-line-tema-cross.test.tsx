import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineTemaCross,
  DEFAULT_CHART_LINE_TEMA_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_LENGTH,
  classifyLineTemaCrossZone,
  computeLineTemaCrossEma,
  computeLineTemaCrossLayout,
  computeLineTemaCrossTema,
  describeLineTemaCrossChart,
  getLineTemaCrossFinitePoints,
  normalizeLineTemaCrossLength,
  runLineTemaCross,
  type ChartLineTemaCrossPoint,
} from './chart-line-tema-cross';

const toPoints = (closes: number[]): ChartLineTemaCrossPoint[] =>
  closes.map((c, i) => ({ x: i, close: c }));

// CONST_FLAT: every EMA = K, TEMA = 3K - 3K + K = K bit-exact at
// every bar. Fast == Slow == K -> no crosses, all bars "at".
const CONST_FLAT: ChartLineTemaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, () => 5),
);

const CONST_FLAT_HIGH: ChartLineTemaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, () => 1000),
);

const RISING: ChartLineTemaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => i + 10),
);

const FALLING: ChartLineTemaCrossPoint[] = toPoints(
  Array.from({ length: 30 }, (_, i) => 40 - i),
);

// Pivot fixture: 20 rising bars then 20 falling bars. Should
// trigger an up-cross during the warm-up + ride and a down-cross
// after the pivot when the fast TEMA overtakes the slow on the
// downturn.
const PIVOT: ChartLineTemaCrossPoint[] = toPoints([
  ...Array.from({ length: 20 }, (_, i) => 10 + i),
  ...Array.from({ length: 20 }, (_, i) => 29 - i),
]);

const WAVE: ChartLineTemaCrossPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, close: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS = { fastLength: 4, slowLength: 10 } as const;

describe('getLineTemaCrossFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineTemaCrossFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineTemaCrossFinitePoints(
        'nope' as unknown as ChartLineTemaCrossPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineTemaCrossPoint[] = [
      { x: 0, close: 1 },
      { x: Number.NaN, close: 2 },
      { x: 1, close: Number.POSITIVE_INFINITY },
      { x: 2, close: 3 },
    ];
    expect(getLineTemaCrossFinitePoints(points)).toEqual([
      { x: 0, close: 1 },
      { x: 2, close: 3 },
    ]);
  });
});

describe('normalizeLineTemaCrossLength', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineTemaCrossLength(8, 8)).toBe(8);
  });

  it('floors a fractional', () => {
    expect(normalizeLineTemaCrossLength(8.9, 8)).toBe(8);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineTemaCrossLength(1, 8)).toBe(8);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineTemaCrossLength(Number.NaN, 8)).toBe(8);
  });
});

describe('computeLineTemaCrossEma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineTemaCrossEma([], 4)).toEqual([]);
  });

  it('EMA of constant equals constant bit-exact', () => {
    const out = computeLineTemaCrossEma([7, 7, 7, 7, 7], 4);
    for (const v of out) expect(v).toBe(7);
  });
});

describe('computeLineTemaCrossTema', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineTemaCrossTema([], 4)).toEqual([]);
  });

  it('CONST_FLAT: TEMA = K bit-exact at every bar', () => {
    const out = computeLineTemaCrossTema(CONST_FLAT.map((p) => p.close), 4);
    for (const v of out) expect(v).toBe(5);
  });

  it('CONST_FLAT_HIGH: TEMA = 1000 bit-exact at every bar', () => {
    const out = computeLineTemaCrossTema(
      CONST_FLAT_HIGH.map((p) => p.close),
      4,
    );
    for (const v of out) expect(v).toBe(1000);
  });

  it('CONST_FLAT holds at any length', () => {
    const lengths = [2, 4, 8, 20, 100];
    for (const len of lengths) {
      const out = computeLineTemaCrossTema(
        CONST_FLAT.map((p) => p.close),
        len,
      );
      for (const v of out) expect(v).toBe(5);
    }
  });

  it('RISING / FALLING TEMA trends with the close', () => {
    const r = computeLineTemaCrossTema(RISING.map((p) => p.close), 4);
    const f = computeLineTemaCrossTema(FALLING.map((p) => p.close), 4);
    expect(r[r.length - 1]!).toBeGreaterThan(r[5]!);
    expect(f[f.length - 1]!).toBeLessThan(f[5]!);
  });

  it('translation invariance: shifting close by k shifts TEMA by exactly k', () => {
    const a = computeLineTemaCrossTema(RISING.map((p) => p.close), 4);
    const b = computeLineTemaCrossTema(
      RISING.map((p) => p.close + 1000),
      4,
    );
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBeCloseTo(a[i]! + 1000, 10);
    }
  });

  it('first bar equals close (EMA seeds at first value, TEMA = 3K - 3K + K = K)', () => {
    const out = computeLineTemaCrossTema(RISING.map((p) => p.close), 4);
    expect(out[0]).toBe(10);
  });
});

describe('classifyLineTemaCrossZone', () => {
  it('fast crosses above slow -> up-cross', () => {
    expect(classifyLineTemaCrossZone(11, 10, 9, 10)).toBe('up-cross');
  });

  it('fast crosses below slow -> down-cross', () => {
    expect(classifyLineTemaCrossZone(9, 10, 11, 10)).toBe('down-cross');
  });

  it('fast above without crossing -> above', () => {
    expect(classifyLineTemaCrossZone(12, 10, 11, 10)).toBe('above');
  });

  it('fast below without crossing -> below', () => {
    expect(classifyLineTemaCrossZone(8, 10, 9, 10)).toBe('below');
  });

  it('fast at slow -> at', () => {
    expect(classifyLineTemaCrossZone(10, 10, 10, 10)).toBe('at');
  });

  it('null prev: no cross even when fast != slow', () => {
    expect(classifyLineTemaCrossZone(11, 10, null, null)).toBe('above');
    expect(classifyLineTemaCrossZone(9, 10, null, null)).toBe('below');
  });

  it('null fast -> none', () => {
    expect(classifyLineTemaCrossZone(null, 10, 9, 10)).toBe('none');
  });

  it('null slow -> none', () => {
    expect(classifyLineTemaCrossZone(11, null, 9, 10)).toBe('none');
  });
});

describe('runLineTemaCross', () => {
  it('marks single-point input as not ok', () => {
    expect(runLineTemaCross([{ x: 0, close: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineTemaCross([], OPTS).ok).toBe(false);
    expect(runLineTemaCross(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineTemaCross(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineTemaCross(RISING).fastLength).toBe(
      DEFAULT_CHART_LINE_TEMA_CROSS_FAST_LENGTH,
    );
    expect(runLineTemaCross(RISING).slowLength).toBe(
      DEFAULT_CHART_LINE_TEMA_CROSS_SLOW_LENGTH,
    );
  });

  it('honours custom options', () => {
    const run = runLineTemaCross(RISING, OPTS);
    expect(run.fastLength).toBe(4);
    expect(run.slowLength).toBe(10);
  });

  it('produces one sample per finite point', () => {
    expect(runLineTemaCross(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('CONST_FLAT: no crosses, every sample is "at" (fast == slow == K)', () => {
    const run = runLineTemaCross(CONST_FLAT, OPTS);
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
    expect(run.atCount).toBe(CONST_FLAT.length);
  });

  it('PIVOT: records at least one down-cross after the peak', () => {
    const run = runLineTemaCross(PIVOT, OPTS);
    expect(run.downCrossCount).toBeGreaterThan(0);
  });

  it('exposes the final fast / slow readings', () => {
    expect(runLineTemaCross(CONST_FLAT, OPTS).fastFinal).toBe(5);
    expect(runLineTemaCross(CONST_FLAT, OPTS).slowFinal).toBe(5);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineTemaCross(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineTemaCross(WAVE, OPTS);
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

describe('computeLineTemaCrossLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineTemaCrossLayout({
        data: [{ x: 0, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineTemaCrossLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineTemaCrossLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineTemaCrossLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('builds non-empty fast and slow paths on RISING', () => {
    const layout = computeLineTemaCrossLayout({ data: RISING, ...OPTS });
    expect(layout.fastPath.length).toBeGreaterThan(0);
    expect(layout.slowPath.length).toBeGreaterThan(0);
  });

  it('CONST_FLAT: zero markers (no crosses)', () => {
    const layout = computeLineTemaCrossLayout({ data: CONST_FLAT, ...OPTS });
    expect(layout.markers).toHaveLength(0);
  });

  it('PIVOT: at least one marker (one cross detected)', () => {
    const layout = computeLineTemaCrossLayout({ data: PIVOT, ...OPTS });
    expect(layout.markers.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the panel', () => {
    const layout = computeLineTemaCrossLayout({ data: PIVOT, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(m.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineTemaCrossLayout({ data: RISING, ...OPTS });
    expect(layout.run.fastLength).toBe(4);
    expect(layout.run.slowLength).toBe(10);
  });
});

describe('describeLineTemaCrossChart', () => {
  it('names the indicator', () => {
    expect(describeLineTemaCrossChart(RISING, OPTS)).toContain(
      'Triple-EMA fast-over-slow crossover',
    );
  });

  it('mentions the fast / slow lengths', () => {
    const desc = describeLineTemaCrossChart(RISING, OPTS);
    expect(desc).toContain('fast length 4');
    expect(desc).toContain('slow length 10');
  });

  it('mentions the constant-close identity', () => {
    expect(describeLineTemaCrossChart(RISING, OPTS)).toContain(
      'constant close keeps both TEMA lines',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineTemaCrossChart([])).toBe('No data');
    expect(describeLineTemaCrossChart(null)).toBe('No data');
  });
});

describe('<ChartLineTemaCross />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    expect(
      screen.getByRole('region', { name: /TEMA cross chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-tema-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Triple-EMA');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineTemaCross data={[]} fastLength={4} slowLength={10} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tema-cross-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-tema-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('4');
    expect(root?.getAttribute('data-slow-length')).toBe('10');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price, fast, and slow lines', () => {
    const { container } = render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-fast-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-slow-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders cross markers on PIVOT input', () => {
    const { container } = render(
      <ChartLineTemaCross data={PIVOT} fastLength={4} slowLength={10} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tema-cross-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('renders no cross markers on CONST_FLAT', () => {
    const { container } = render(
      <ChartLineTemaCross data={CONST_FLAT} fastLength={4} slowLength={10} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-tema-cross-marker"]',
    );
    expect(markers).toHaveLength(0);
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tema-cross-badge-config"]',
    );
    expect(badge?.textContent).toContain('TEMA 4/10');
  });

  it('hides the fast line via the legend toggle', () => {
    const { container } = render(
      <ChartLineTemaCross data={RISING} fastLength={4} slowLength={10} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-tema-cross-legend-item"][data-series-id="fast"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-fast-line"]',
      ),
    ).toBeNull();
  });

  it('hides the slow line via showSlow=false', () => {
    const { container } = render(
      <ChartLineTemaCross
        data={RISING}
        fastLength={4}
        slowLength={10}
        showSlow={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-tema-cross-slow-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a cross marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineTemaCross
        data={PIVOT}
        fastLength={4}
        slowLength={10}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-tema-cross-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTemaCross
        ref={ref}
        data={RISING}
        fastLength={4}
        slowLength={10}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
