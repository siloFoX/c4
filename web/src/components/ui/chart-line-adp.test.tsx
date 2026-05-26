import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdp,
  applyLineAdpRollingSum,
  classifyLineAdpZone,
  computeLineAdp,
  computeLineAdpLayout,
  describeLineAdpChart,
  detectLineAdpCrosses,
  getLineAdpFinitePoints,
  normalizeLineAdpLength,
  normalizeLineAdpThreshold,
  runLineAdp,
  DEFAULT_CHART_LINE_ADP_LENGTH,
} from './chart-line-adp';
import type { ChartLineAdpPoint } from './chart-line-adp';

const constBar = (
  count: number,
  K: number,
  A: number,
  D: number,
  T?: number,
): ChartLineAdpPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: K,
    advances: A,
    declines: D,
    ...(T !== undefined ? { totalIssues: T } : {}),
  }));

describe('getLineAdpFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineAdpFinitePoints(null)).toEqual([]);
  });

  it('defaults totalIssues to advances + declines', () => {
    const r = getLineAdpFinitePoints([
      { x: 0, close: 10, advances: 7, declines: 3 },
    ]);
    expect(r[0]?.totalIssues).toBe(10);
  });

  it('respects provided totalIssues', () => {
    const r = getLineAdpFinitePoints([
      { x: 0, close: 10, advances: 7, declines: 3, totalIssues: 20 },
    ]);
    expect(r[0]?.totalIssues).toBe(20);
  });

  it('drops non-finite advances', () => {
    const r = getLineAdpFinitePoints([
      { x: 0, close: 10, advances: Number.NaN, declines: 3 },
      { x: 1, close: 10, advances: 7, declines: 3 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops negative counts', () => {
    const r = getLineAdpFinitePoints([
      { x: 0, close: 10, advances: -1, declines: 3 },
      { x: 1, close: 10, advances: 7, declines: 3 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineAdpFinitePoints([
      null as unknown as ChartLineAdpPoint,
      { x: 1, close: 10, advances: 7, declines: 3 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineAdpLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAdpLength(undefined, 10)).toBe(10);
  });

  it('accepts 1', () => {
    expect(normalizeLineAdpLength(1, 10)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineAdpLength(0, 10)).toBe(10);
  });

  it('floors fractional', () => {
    expect(normalizeLineAdpLength(7.7, 10)).toBe(7);
  });
});

describe('normalizeLineAdpThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineAdpThreshold(undefined, 30)).toBe(30);
  });

  it('accepts -100 and 100', () => {
    expect(normalizeLineAdpThreshold(-100, 30)).toBe(-100);
    expect(normalizeLineAdpThreshold(100, 30)).toBe(100);
  });

  it('rejects out of range', () => {
    expect(normalizeLineAdpThreshold(-101, 30)).toBe(30);
    expect(normalizeLineAdpThreshold(101, 30)).toBe(30);
  });
});

describe('applyLineAdpRollingSum', () => {
  it('CONST K rolling sum is L*K bit-exact', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const L of [3, 4, 7, 10]) {
        const out = applyLineAdpRollingSum(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(L * K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineAdpRollingSum([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });
});

describe('computeLineAdp', () => {
  it('returns empty for null', () => {
    const ch = computeLineAdp(null);
    expect(ch.adp).toEqual([]);
  });

  it('CONST (100, 0, 100) yields adp = 100 bit-exact', () => {
    const series = constBar(20, 10, 100, 0, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(100);
    }
  });

  it('CONST (0, 100, 100) yields adp = -100 bit-exact', () => {
    const series = constBar(20, 10, 0, 100, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(-100);
    }
  });

  it('CONST (50, 50, 100) yields adp = 0 bit-exact', () => {
    const series = constBar(20, 10, 50, 50, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(0);
    }
  });

  it('CONST (75, 25, 100) yields adp = 50 bit-exact', () => {
    const series = constBar(20, 10, 75, 25, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(50);
    }
  });

  it('CONST (25, 75, 100) yields adp = -50 bit-exact', () => {
    const series = constBar(20, 10, 25, 75, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(-50);
    }
  });

  it('CONST total = 0 yields adp = null', () => {
    const series = constBar(20, 10, 0, 0, 0);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(null);
    }
  });

  it('totalIssues defaults to advances + declines', () => {
    const series = constBar(20, 10, 75, 25);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 20; i += 1) {
      expect(ch.adp[i]).toBe(50);
    }
  });

  it('warmup region is null', () => {
    const series = constBar(20, 10, 75, 25, 100);
    const ch = computeLineAdp(series, { length: 4 });
    expect(ch.adp[0]).toBe(null);
    expect(ch.adp[2]).toBe(null);
    expect(ch.adp[3]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = constBar(20, 10, 75, 25, 100);
    const ch = computeLineAdp(series, { length: 4 });
    expect(ch.adp.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = constBar(20, 10, 75, 25, 100);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineAdp(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('rolling sums populated post-warmup', () => {
    const series = constBar(10, 10, 75, 25, 100);
    const ch = computeLineAdp(series, { length: 4 });
    for (let i = 3; i < 10; i += 1) {
      expect(ch.rollAdv[i]).toBe(300);
      expect(ch.rollDec[i]).toBe(100);
      expect(ch.rollTot[i]).toBe(400);
    }
  });
});

describe('classifyLineAdpZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineAdpZone(50, 30, -30)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineAdpZone(-50, 30, -30)).toBe('bearish');
  });

  it('classifies neutral inside band', () => {
    expect(classifyLineAdpZone(10, 30, -30)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineAdpZone(null, 30, -30)).toBe('none');
  });
});

describe('detectLineAdpCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineAdpCrosses([null, null], 30, -30)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineAdpCrosses([null, 10, 50], 30, -30);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineAdpCrosses([null, -10, -50], 30, -30);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineAdpCrosses([null, 50], 30, -30)[1]).toBe(null);
  });
});

describe('runLineAdp', () => {
  it('marks ok=false for short data', () => {
    const run = runLineAdp(constBar(3, 10, 50, 50, 100), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineAdp(constBar(4, 10, 50, 50, 100), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineAdp(constBar(20, 10, 50, 50, 100));
    expect(run.length).toBe(DEFAULT_CHART_LINE_ADP_LENGTH);
    expect(run.bullishThreshold).toBe(30);
    expect(run.bearishThreshold).toBe(-30);
  });

  it('respects explicit options', () => {
    const run = runLineAdp(constBar(20, 10, 50, 50, 100), {
      length: 7,
      bullishThreshold: 50,
      bearishThreshold: -50,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(50);
    expect(run.bearishThreshold).toBe(-50);
  });

  it('sorts by x', () => {
    const data: ChartLineAdpPoint[] = [
      { x: 2, close: 30, advances: 50, declines: 50, totalIssues: 100 },
      { x: 0, close: 10, advances: 50, declines: 50, totalIssues: 100 },
      { x: 1, close: 20, advances: 50, declines: 50, totalIssues: 100 },
    ];
    const run = runLineAdp(data, { length: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST (75, 25, 100) classifies as bullish', () => {
    const run = runLineAdp(constBar(20, 10, 75, 25, 100), { length: 4 });
    expect(run.bullishCount).toBe(17);
  });

  it('CONST (25, 75, 100) classifies as bearish', () => {
    const run = runLineAdp(constBar(20, 10, 25, 75, 100), { length: 4 });
    expect(run.bearishCount).toBe(17);
  });

  it('CONST (50, 50, 100) classifies as neutral', () => {
    const run = runLineAdp(constBar(20, 10, 50, 50, 100), { length: 4 });
    expect(run.neutralCount).toBe(17);
  });
});

describe('computeLineAdpLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineAdpLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineAdpLayout({
      data: constBar(20, 10, 75, 25, 100),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above adp', () => {
    const layout = computeLineAdpLayout({
      data: constBar(20, 10, 75, 25, 100),
    });
    expect(layout.priceBottom).toBeLessThan(layout.adpTop);
  });

  it('adp axis fixed to [-100, 100]', () => {
    const layout = computeLineAdpLayout({
      data: constBar(20, 10, 75, 25, 100),
    });
    expect(layout.adpMin).toBe(-100);
    expect(layout.adpMax).toBe(100);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineAdpLayout({
      data: constBar(20, 10, 75, 25, 100),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });
});

describe('describeLineAdpChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineAdpChart([])).toBe('No data');
  });

  it('mentions Advance-Decline Percent', () => {
    const desc = describeLineAdpChart(constBar(20, 10, 75, 25, 100));
    expect(desc).toContain('Advance-Decline Percent');
  });

  it('reports parameters', () => {
    const desc = describeLineAdpChart(constBar(20, 10, 75, 25, 100), {
      length: 7,
      bullishThreshold: 50,
      bearishThreshold: -50,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 50');
    expect(desc).toContain('bearishThreshold -50');
  });
});

describe('<ChartLineAdp />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineAdp data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adp-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Advance-Decline');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdp data={constBar(20, 10, 75, 25, 100)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        length={7}
        bullishThreshold={50}
        bearishThreshold={-50}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adp"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('50');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-50');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adp"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adp-aria-desc"]',
      )?.textContent,
    ).toContain('Advance-Decline Percent');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="adp"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="adp"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'adp',
      hidden: true,
    });
  });

  it('hides adp when controlled hidden', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        hiddenSeries={['adp']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-line"]'),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-badge"]'),
    ).toBeTruthy();
  });

  it('renders thresholds by default', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adp-bullish-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-adp-bearish-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides thresholds when showThresholds is false', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        showThresholds={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adp-bullish-line"]',
      ),
    ).toBe(null);
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-zero-line"]'),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-legend"]'),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adp"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-adp-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the adp line by default', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-line"]'),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineAdp data={constBar(20, 10, 75, 25, 100)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-price-path"]'),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineAdp
        data={constBar(20, 10, 75, 25, 100)}
        defaultHiddenSeries={['adp']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adp-line"]'),
    ).toBe(null);
  });
});

describe('ADP integration', () => {
  it('CONST with dyadic ratios yields bit-exact adp across (A, D, T, length)', () => {
    const cases: Array<[number, number, number, number]> = [
      [100, 0, 100, 100],
      [0, 100, 100, -100],
      [50, 50, 100, 0],
      [75, 25, 100, 50],
      [25, 75, 100, -50],
      [200, 0, 200, 100],
      [50, 0, 100, 50],
      [0, 50, 100, -50],
    ];
    for (const [A, D, T, expected] of cases) {
      for (const L of [2, 4, 7, 10]) {
        const series = constBar(L + 5, 10, A, D, T);
        const ch = computeLineAdp(series, { length: L });
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(ch.adp[i]).toBe(expected);
        }
      }
    }
  });

  it('CONST total=0 yields adp=null across (length)', () => {
    for (const L of [2, 4, 7]) {
      const series = constBar(L + 5, 10, 0, 0, 0);
      const ch = computeLineAdp(series, { length: L });
      for (let i = L - 1; i < L + 5; i += 1) {
        expect(ch.adp[i]).toBe(null);
      }
    }
  });
});
