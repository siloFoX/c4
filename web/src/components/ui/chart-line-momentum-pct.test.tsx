import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMomentumPct,
  classifyLineMomentumPctZone,
  computeLineMomentumPct,
  computeLineMomentumPctLayout,
  describeLineMomentumPctChart,
  detectLineMomentumPctCrosses,
  getLineMomentumPctFinitePoints,
  normalizeLineMomentumPctLength,
  normalizeLineMomentumPctThreshold,
  runLineMomentumPct,
  DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH,
} from './chart-line-momentum-pct';
import type { ChartLineMomentumPctPoint } from './chart-line-momentum-pct';

const constBar = (count: number, K: number): ChartLineMomentumPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineMomentumPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

/**
 * DOUBLED step: close = K for i < L; close = 2K for i >= L. For
 * `L <= i < 2L` the lookback bar is in the first segment (K) and
 * the current bar in the second (2K), giving momentum = 100 bit-exact.
 */
const doubled = (
  count: number,
  K: number,
  L: number,
): ChartLineMomentumPctPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    close: i < L ? K : 2 * K,
  }));

describe('getLineMomentumPctFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineMomentumPctFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineMomentumPctFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineMomentumPctFinitePoints([
      null as unknown as ChartLineMomentumPctPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineMomentumPctLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineMomentumPctLength(undefined, 10)).toBe(10);
  });

  it('accepts 1', () => {
    expect(normalizeLineMomentumPctLength(1, 10)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineMomentumPctLength(0, 10)).toBe(10);
  });

  it('floors fractional', () => {
    expect(normalizeLineMomentumPctLength(7.7, 10)).toBe(7);
  });
});

describe('normalizeLineMomentumPctThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineMomentumPctThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineMomentumPctThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineMomentumPctThreshold(5, 0)).toBe(5);
  });
});

describe('computeLineMomentumPct', () => {
  it('returns empty for null', () => {
    const ch = computeLineMomentumPct(null);
    expect(ch.momentum).toEqual([]);
  });

  it('CONST close = K > 0 yields momentum = 0 bit-exact', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(20, K);
      const ch = computeLineMomentumPct(series, { length: 4 });
      for (let i = 4; i < 20; i += 1) {
        expect(ch.momentum[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 yields momentum = null (divide guard)', () => {
    const series = constBar(20, 0);
    const ch = computeLineMomentumPct(series, { length: 4 });
    for (let i = 4; i < 20; i += 1) {
      expect(ch.momentum[i]).toBe(null);
    }
  });

  it('DOUBLED step yields momentum = 100 bit-exact for L <= i < 2L', () => {
    for (const K of [1, 5, 100, -3]) {
      const L = 4;
      const series = doubled(20, K, L);
      const ch = computeLineMomentumPct(series, { length: L });
      for (let i = L; i < 2 * L; i += 1) {
        expect(ch.momentum[i]).toBe(100);
      }
    }
  });

  it('DOUBLED step yields momentum = 0 for i >= 2L', () => {
    const series = doubled(20, 5, 4);
    const ch = computeLineMomentumPct(series, { length: 4 });
    for (let i = 8; i < 20; i += 1) {
      expect(ch.momentum[i]).toBe(0);
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(20);
    const ch = computeLineMomentumPct(series, { length: 4 });
    expect(ch.momentum[0]).toBe(null);
    expect(ch.momentum[3]).toBe(null);
    expect(ch.momentum[4]).toBeTypeOf('number');
  });

  it('output length matches input length', () => {
    const series = linearUp(20);
    const ch = computeLineMomentumPct(series, { length: 4 });
    expect(ch.momentum.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = linearUp(20);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineMomentumPct(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('LINEAR UP momentum at i=L: (L+1-1)/1 * 100 = L*100 bit-exact', () => {
    const series = linearUp(20);
    const ch = computeLineMomentumPct(series, { length: 4 });
    // close[4]=5, close[0]=1, momentum = (5-1)/1*100 = 400
    expect(ch.momentum[4]).toBe(400);
  });

  it('prior values capture close[i - length]', () => {
    const series = linearUp(10);
    const ch = computeLineMomentumPct(series, { length: 3 });
    expect(ch.prior[3]).toBe(1);
    expect(ch.prior[5]).toBe(3);
  });

  it('delta = close - prior bit-exact', () => {
    const series = linearUp(10);
    const ch = computeLineMomentumPct(series, { length: 3 });
    expect(ch.delta[3]).toBe(3);
    expect(ch.delta[5]).toBe(3);
  });
});

describe('classifyLineMomentumPctZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineMomentumPctZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineMomentumPctZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineMomentumPctZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineMomentumPctZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineMomentumPctCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineMomentumPctCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineMomentumPctCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineMomentumPctCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineMomentumPctCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineMomentumPct', () => {
  it('marks ok=false for short data', () => {
    const run = runLineMomentumPct(constBar(4, 10), { length: 4 });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineMomentumPct(constBar(5, 10), { length: 4 });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineMomentumPct(constBar(20, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_MOMENTUM_PCT_LENGTH);
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineMomentumPct(constBar(20, 10), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(5);
    expect(run.bearishThreshold).toBe(-5);
  });

  it('sorts by x', () => {
    const data: ChartLineMomentumPctPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineMomentumPct(data, { length: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('LINEAR UP classifies as bullish post warmup', () => {
    const run = runLineMomentumPct(linearUp(20), { length: 4 });
    expect(run.bullishCount).toBeGreaterThan(0);
  });

  it('CONST close > 0 classifies as neutral (momentum=0)', () => {
    const run = runLineMomentumPct(constBar(20, 10), { length: 4 });
    expect(run.neutralCount).toBe(16);
  });
});

describe('computeLineMomentumPctLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMomentumPctLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMomentumPctLayout({
      data: linearUp(20),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above momentum', () => {
    const layout = computeLineMomentumPctLayout({
      data: linearUp(20),
    });
    expect(layout.priceBottom).toBeLessThan(layout.momTop);
  });

  it('mom axis includes zero', () => {
    const layout = computeLineMomentumPctLayout({
      data: linearUp(20),
    });
    expect(layout.momMin).toBeLessThanOrEqual(0);
    expect(layout.momMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMomentumPctLayout({
      data: linearUp(20),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(20);
  });
});

describe('describeLineMomentumPctChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineMomentumPctChart([])).toBe('No data');
  });

  it('mentions Momentum Percent', () => {
    const desc = describeLineMomentumPctChart(linearUp(20));
    expect(desc).toContain('Momentum Percent');
  });

  it('reports parameters', () => {
    const desc = describeLineMomentumPctChart(linearUp(20), {
      length: 7,
      bullishThreshold: 5,
      bearishThreshold: -5,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 5');
    expect(desc).toContain('bearishThreshold -5');
  });
});

describe('<ChartLineMomentumPct />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineMomentumPct data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Momentum');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMomentumPct data={linearUp(20)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        length={7}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-pct"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-pct"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('20');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-aria-desc"]',
      )?.textContent,
    ).toContain('Momentum Percent');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(
      container.querySelector('[data-series-id="momentum"]'),
    ).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="momentum"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'momentum',
      hidden: true,
    });
  });

  it('hides momentum when controlled hidden', () => {
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        hiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-zero-line"]',
      ),
    ).toBe(null);
  });

  it('does not render thresholds when both equal zero', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-bullish-line"]',
      ),
    ).toBe(null);
  });

  it('renders thresholds when nonzero', () => {
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        bullishThreshold={5}
        bearishThreshold={-5}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-bullish-line"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-bearish-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} showAxis={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} showGrid={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-momentum-pct"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-momentum-pct-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the momentum line by default', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMomentumPct data={linearUp(20)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineMomentumPct
        data={linearUp(20)}
        defaultHiddenSeries={['momentum']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-momentum-pct-line"]',
      ),
    ).toBe(null);
  });
});

describe('Momentum Percent integration', () => {
  it('CONST K>0 yields momentum=0 across (K, length)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [1, 2, 4, 7, 10]) {
        const series = constBar(L + 5, K);
        const ch = computeLineMomentumPct(series, { length: L });
        for (let i = L; i < L + 5; i += 1) {
          expect(ch.momentum[i]).toBe(0);
        }
      }
    }
  });

  it('CONST K=0 yields momentum=null across (length)', () => {
    for (const L of [1, 2, 4, 7]) {
      const series = constBar(L + 5, 0);
      const ch = computeLineMomentumPct(series, { length: L });
      for (let i = L; i < L + 5; i += 1) {
        expect(ch.momentum[i]).toBe(null);
      }
    }
  });

  it('DOUBLED step yields momentum=100 for L<=i<2L across (K, L)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const L of [2, 4, 7]) {
        const series = doubled(2 * L + 2, K, L);
        const ch = computeLineMomentumPct(series, { length: L });
        for (let i = L; i < 2 * L; i += 1) {
          expect(ch.momentum[i]).toBe(100);
        }
      }
    }
  });
});
