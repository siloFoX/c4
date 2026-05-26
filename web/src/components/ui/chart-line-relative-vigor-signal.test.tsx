import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRelativeVigorSignal,
  applyLineRelativeVigorSignalRollingSum,
  applyLineRelativeVigorSignalSwma,
  classifyLineRelativeVigorSignalZone,
  computeLineRelativeVigorSignal,
  computeLineRelativeVigorSignalLayout,
  describeLineRelativeVigorSignalChart,
  detectLineRelativeVigorSignalCrosses,
  getLineRelativeVigorSignalFinitePoints,
  normalizeLineRelativeVigorSignalLength,
  normalizeLineRelativeVigorSignalThreshold,
  runLineRelativeVigorSignal,
  DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
} from './chart-line-relative-vigor-signal';
import type { ChartLineRelativeVigorSignalPoint } from './chart-line-relative-vigor-signal';

const constBar = (
  count: number,
  K: number,
): ChartLineRelativeVigorSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    open: K,
    high: K,
    low: K,
    close: K,
  }));

/**
 * CONSTANT-SPREAD anchor: open=K, close=K+D, low=K, high=K+R.
 * co=D constant, hl=R constant. RVI = D/R, signal = D/R.
 */
const constSpread = (
  count: number,
  K: number,
  D: number,
  R: number,
): ChartLineRelativeVigorSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    open: K,
    high: K + R,
    low: K,
    close: K + D,
  }));

describe('getLineRelativeVigorSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineRelativeVigorSignalFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite open', () => {
    const r = getLineRelativeVigorSignalFinitePoints([
      { x: 0, open: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 1, open: 7, high: 10, low: 5, close: 8 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineRelativeVigorSignalFinitePoints([
      null as unknown as ChartLineRelativeVigorSignalPoint,
      { x: 1, open: 7, high: 10, low: 5, close: 8 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineRelativeVigorSignalLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRelativeVigorSignalLength(undefined, 10)).toBe(10);
  });

  it('accepts 1', () => {
    expect(normalizeLineRelativeVigorSignalLength(1, 10)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineRelativeVigorSignalLength(0, 10)).toBe(10);
  });
});

describe('normalizeLineRelativeVigorSignalThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineRelativeVigorSignalThreshold(undefined, 0)).toBe(0);
  });

  it('accepts -1 and 1', () => {
    expect(normalizeLineRelativeVigorSignalThreshold(-1, 0)).toBe(-1);
    expect(normalizeLineRelativeVigorSignalThreshold(1, 0)).toBe(1);
  });

  it('rejects out of range', () => {
    expect(normalizeLineRelativeVigorSignalThreshold(-1.1, 0)).toBe(0);
    expect(normalizeLineRelativeVigorSignalThreshold(1.1, 0)).toBe(0);
  });
});

describe('applyLineRelativeVigorSignalSwma', () => {
  it('CONST v=K yields K bit-exact post-warmup', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineRelativeVigorSignalSwma(Array(10).fill(K));
      for (let i = 3; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineRelativeVigorSignalSwma([1, 1, 1, 1, 1]);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
    expect(out[3]).toBe(1);
  });

  it('null propagates to null', () => {
    const out = applyLineRelativeVigorSignalSwma([1, null, 3, 4, 5]);
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(null);
  });

  it('SWMA formula: (v3 + 2v2 + 2v1 + v0) / 6', () => {
    const out = applyLineRelativeVigorSignalSwma([6, 6, 6, 6]);
    expect(out[3]).toBe(6);
  });
});

describe('applyLineRelativeVigorSignalRollingSum', () => {
  it('CONST K rolling sum is L*K', () => {
    const out = applyLineRelativeVigorSignalRollingSum(
      Array(10).fill(5),
      4,
    );
    for (let i = 3; i < 10; i += 1) {
      expect(out[i]).toBe(20);
    }
  });

  it('warmup is null', () => {
    const out = applyLineRelativeVigorSignalRollingSum([1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(3);
  });
});

describe('computeLineRelativeVigorSignal', () => {
  it('returns empty for null', () => {
    const ch = computeLineRelativeVigorSignal(null);
    expect(ch.signal).toEqual([]);
  });

  it('CONST OHLC=K yields signal = null (0/0)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const series = constBar(25, K);
      const ch = computeLineRelativeVigorSignal(series, { length: 4 });
      for (let i = 9; i < 25; i += 1) {
        expect(ch.signal[i]).toBe(null);
      }
    }
  });

  it('CONSTANT-SPREAD D=0, R=1 yields signal = 0 bit-exact', () => {
    const series = constSpread(25, 5, 0, 1);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    for (let i = 9; i < 25; i += 1) {
      expect(ch.signal[i]).toBe(0);
    }
  });

  it('CONSTANT-SPREAD D=R=2 yields signal = 1 bit-exact', () => {
    const series = constSpread(25, 5, 2, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    for (let i = 9; i < 25; i += 1) {
      expect(ch.signal[i]).toBe(1);
    }
  });

  it('CONSTANT-SPREAD D=-R=-2 yields signal = -1 bit-exact', () => {
    const series = constSpread(25, 5, -2, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    for (let i = 9; i < 25; i += 1) {
      expect(ch.signal[i]).toBe(-1);
    }
  });

  it('CONSTANT-SPREAD D=1, R=2 yields signal = 0.5 bit-exact', () => {
    const series = constSpread(25, 5, 1, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    for (let i = 9; i < 25; i += 1) {
      expect(ch.signal[i]).toBe(0.5);
    }
  });

  it('CONSTANT-SPREAD D=-1, R=2 yields signal = -0.5 bit-exact', () => {
    const series = constSpread(25, 5, -1, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    for (let i = 9; i < 25; i += 1) {
      expect(ch.signal[i]).toBe(-0.5);
    }
  });

  it('coSwma and hlSwma populated for CONSTANT-SPREAD', () => {
    const series = constSpread(15, 5, 2, 4);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    expect(ch.coSwma[3]).toBe(2);
    expect(ch.hlSwma[3]).toBe(4);
  });

  it('output length matches input length', () => {
    const series = constSpread(20, 5, 1, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    expect(ch.signal.length).toBe(20);
  });

  it('does not mutate input', () => {
    const series = constSpread(20, 5, 1, 2);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineRelativeVigorSignal(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('warmup region is null', () => {
    const series = constSpread(25, 5, 1, 2);
    const ch = computeLineRelativeVigorSignal(series, { length: 4 });
    expect(ch.signal[0]).toBe(null);
    expect(ch.signal[8]).toBe(null);
    expect(ch.signal[9]).toBe(0.5);
  });
});

describe('classifyLineRelativeVigorSignalZone', () => {
  it('classifies bullish above threshold', () => {
    expect(classifyLineRelativeVigorSignalZone(0.5, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below threshold', () => {
    expect(classifyLineRelativeVigorSignalZone(-0.5, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineRelativeVigorSignalZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineRelativeVigorSignalZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineRelativeVigorSignalCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineRelativeVigorSignalCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineRelativeVigorSignalCrosses([null, -0.1, 0.2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineRelativeVigorSignalCrosses([null, 0.1, -0.2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineRelativeVigorSignalCrosses([null, 0.2], 0, 0)[1]).toBe(
      null,
    );
  });
});

describe('runLineRelativeVigorSignal', () => {
  it('marks ok=false for short data', () => {
    const run = runLineRelativeVigorSignal(constSpread(5, 5, 1, 2), {
      length: 4,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineRelativeVigorSignal(constSpread(15, 5, 1, 2), {
      length: 4,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineRelativeVigorSignal(constSpread(25, 5, 1, 2));
    expect(run.length).toBe(
      DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_LENGTH,
    );
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineRelativeVigorSignal(constSpread(25, 5, 1, 2), {
      length: 7,
      bullishThreshold: 0.5,
      bearishThreshold: -0.5,
    });
    expect(run.length).toBe(7);
    expect(run.bullishThreshold).toBe(0.5);
    expect(run.bearishThreshold).toBe(-0.5);
  });

  it('sorts by x', () => {
    const data: ChartLineRelativeVigorSignalPoint[] = [
      { x: 2, open: 5, high: 7, low: 5, close: 6 },
      { x: 0, open: 5, high: 7, low: 5, close: 6 },
      { x: 1, open: 5, high: 7, low: 5, close: 6 },
    ];
    const run = runLineRelativeVigorSignal(data, { length: 1 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST classifies as none (signal=null)', () => {
    const run = runLineRelativeVigorSignal(constBar(25, 10), { length: 4 });
    expect(run.noneCount).toBe(25);
  });

  it('CONSTANT-SPREAD D=R classifies as bullish', () => {
    const run = runLineRelativeVigorSignal(constSpread(25, 5, 2, 2), {
      length: 4,
    });
    expect(run.bullishCount).toBeGreaterThan(0);
  });
});

describe('computeLineRelativeVigorSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineRelativeVigorSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineRelativeVigorSignalLayout({
      data: constSpread(25, 5, 1, 2),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above osc', () => {
    const layout = computeLineRelativeVigorSignalLayout({
      data: constSpread(25, 5, 1, 2),
    });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis includes zero', () => {
    const layout = computeLineRelativeVigorSignalLayout({
      data: constSpread(25, 5, 1, 2),
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineRelativeVigorSignalLayout({
      data: constSpread(25, 5, 1, 2),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(25);
  });
});

describe('describeLineRelativeVigorSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineRelativeVigorSignalChart([])).toBe('No data');
  });

  it('mentions Relative Vigor Signal', () => {
    const desc = describeLineRelativeVigorSignalChart(
      constSpread(25, 5, 1, 2),
    );
    expect(desc).toContain('Relative Vigor Signal');
  });

  it('reports parameters', () => {
    const desc = describeLineRelativeVigorSignalChart(
      constSpread(25, 5, 1, 2),
      {
        length: 7,
        bullishThreshold: 0.5,
        bearishThreshold: -0.5,
      },
    );
    expect(desc).toContain('length 7');
    expect(desc).toContain('bullishThreshold 0.5');
    expect(desc).toContain('bearishThreshold -0.5');
  });
});

describe('<ChartLineRelativeVigorSignal />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('Vigor');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        ref={ref}
      />,
    );
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        length={7}
        bullishThreshold={0.5}
        bearishThreshold={-0.5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-relative-vigor-signal"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-bullish-threshold')).toBe('0.5');
    expect(root?.getAttribute('data-bearish-threshold')).toBe('-0.5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-relative-vigor-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('25');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-aria-desc"]',
      )?.textContent,
    ).toContain('Relative Vigor Signal');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="rvi"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'signal',
      hidden: true,
    });
  });

  it('hides signal when controlled hidden', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-signal-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-relative-vigor-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-relative-vigor-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders rvi and signal paths', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-rvi-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-signal-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal data={constSpread(25, 5, 1, 2)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineRelativeVigorSignal
        data={constSpread(25, 5, 1, 2)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-relative-vigor-signal-signal-path"]',
      ),
    ).toBe(null);
  });
});

describe('Relative Vigor Signal integration', () => {
  it('CONSTANT-SPREAD yields signal = D/R for dyadic ratios across (K, length)', () => {
    const cases: Array<[number, number, number]> = [
      [0, 1, 0],
      [1, 1, 1],
      [-1, 1, -1],
      [1, 2, 0.5],
      [-1, 2, -0.5],
      [2, 2, 1],
      [3, 6, 0.5],
    ];
    for (const [D, R, expected] of cases) {
      for (const K of [5, 100]) {
        for (const L of [2, 4, 7]) {
          const total = L + 10;
          const series = constSpread(total, K, D, R);
          const ch = computeLineRelativeVigorSignal(series, { length: L });
          const start = L + 5;
          for (let i = start; i < total; i += 1) {
            expect(ch.signal[i]).toBe(expected);
          }
        }
      }
    }
  });

  it('CONST yields signal = null across (K, length)', () => {
    for (const K of [0, 1, 5, 100]) {
      for (const L of [2, 4, 7]) {
        const total = L + 10;
        const series = constBar(total, K);
        const ch = computeLineRelativeVigorSignal(series, { length: L });
        const start = L + 5;
        for (let i = start; i < total; i += 1) {
          expect(ch.signal[i]).toBe(null);
        }
      }
    }
  });
});
