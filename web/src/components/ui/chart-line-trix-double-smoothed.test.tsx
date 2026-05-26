import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrixDoubleSmoothed,
  applyLineTrixDoubleSmoothedDifference,
  applyLineTrixDoubleSmoothedEma,
  applyLineTrixDoubleSmoothedLog,
  classifyLineTrixDoubleSmoothedZone,
  computeLineTrixDoubleSmoothed,
  computeLineTrixDoubleSmoothedLayout,
  describeLineTrixDoubleSmoothedChart,
  detectLineTrixDoubleSmoothedCrosses,
  getLineTrixDoubleSmoothedFinitePoints,
  normalizeLineTrixDoubleSmoothedLength,
  normalizeLineTrixDoubleSmoothedSignalLength,
  normalizeLineTrixDoubleSmoothedThreshold,
  runLineTrixDoubleSmoothed,
  DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH,
  DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
} from './chart-line-trix-double-smoothed';
import type { ChartLineTrixDoubleSmoothedPoint } from './chart-line-trix-double-smoothed';

const constBar = (
  count: number,
  K: number,
): ChartLineTrixDoubleSmoothedPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineTrixDoubleSmoothedPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

describe('getLineTrixDoubleSmoothedFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineTrixDoubleSmoothedFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineTrixDoubleSmoothedFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineTrixDoubleSmoothedFinitePoints([
      null as unknown as ChartLineTrixDoubleSmoothedPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineTrixDoubleSmoothedLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrixDoubleSmoothedLength(undefined, 15)).toBe(15);
  });

  it('rejects below 2', () => {
    expect(normalizeLineTrixDoubleSmoothedLength(1, 15)).toBe(15);
  });

  it('floors fractional', () => {
    expect(normalizeLineTrixDoubleSmoothedLength(7.7, 15)).toBe(7);
  });
});

describe('normalizeLineTrixDoubleSmoothedSignalLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrixDoubleSmoothedSignalLength(undefined, 9)).toBe(9);
  });

  it('accepts 1', () => {
    expect(normalizeLineTrixDoubleSmoothedSignalLength(1, 9)).toBe(1);
  });

  it('rejects zero', () => {
    expect(normalizeLineTrixDoubleSmoothedSignalLength(0, 9)).toBe(9);
  });
});

describe('normalizeLineTrixDoubleSmoothedThreshold', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineTrixDoubleSmoothedThreshold(undefined, 0)).toBe(0);
  });

  it('accepts negative and positive', () => {
    expect(normalizeLineTrixDoubleSmoothedThreshold(-5, 0)).toBe(-5);
    expect(normalizeLineTrixDoubleSmoothedThreshold(5, 0)).toBe(5);
  });
});

describe('applyLineTrixDoubleSmoothedLog', () => {
  it('returns ln(close) when close > 0', () => {
    const out = applyLineTrixDoubleSmoothedLog([1, Math.E]);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(Math.log(Math.E));
  });

  it('null for close = 0', () => {
    const out = applyLineTrixDoubleSmoothedLog([0, 5]);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(Math.log(5));
  });

  it('null for close < 0', () => {
    const out = applyLineTrixDoubleSmoothedLog([-1, 5]);
    expect(out[0]).toBe(null);
  });
});

describe('applyLineTrixDoubleSmoothedEma', () => {
  it('CONST K EMA is K bit-exact', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      const out = applyLineTrixDoubleSmoothedEma(Array(10).fill(K), 3);
      for (let i = 2; i < 10; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineTrixDoubleSmoothedEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null resets seed', () => {
    const out = applyLineTrixDoubleSmoothedEma([1, 1, null, 1, 1, 1], 3);
    expect(out[2]).toBe(null);
    expect(out[5]).toBe(1);
  });
});

describe('applyLineTrixDoubleSmoothedDifference', () => {
  it('first defined is null (no prior)', () => {
    const out = applyLineTrixDoubleSmoothedDifference([null, 1, 2], 1);
    expect(out[1]).toBe(null);
  });

  it('CONST yields 0', () => {
    const out = applyLineTrixDoubleSmoothedDifference([5, 5, 5], 1);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it('scales the difference', () => {
    const out = applyLineTrixDoubleSmoothedDifference([1, 2, 3], 10000);
    expect(out[1]).toBe(10000);
    expect(out[2]).toBe(10000);
  });

  it('null resets prev', () => {
    const out = applyLineTrixDoubleSmoothedDifference(
      [1, 2, null, 3, 4],
      1,
    );
    expect(out[3]).toBe(null);
    expect(out[4]).toBe(1);
  });
});

describe('computeLineTrixDoubleSmoothed', () => {
  it('returns empty for null', () => {
    const ch = computeLineTrixDoubleSmoothed(null);
    expect(ch.doubleSmoothed).toEqual([]);
  });

  it('CONST close > 0 yields trix = 0 and double = 0', () => {
    for (const K of [1, 5, 100, Math.E]) {
      const series = constBar(40, K);
      const ch = computeLineTrixDoubleSmoothed(series, {
        length: 4,
        signalLength: 3,
      });
      for (let i = 12; i < 40; i += 1) {
        expect(ch.trix[i]).toBe(0);
        expect(ch.doubleSmoothed[i]).toBe(0);
      }
    }
  });

  it('CONST close <= 0 yields null throughout', () => {
    for (const K of [0, -1]) {
      const series = constBar(40, K);
      const ch = computeLineTrixDoubleSmoothed(series, {
        length: 4,
        signalLength: 3,
      });
      for (let i = 0; i < 40; i += 1) {
        expect(ch.logClose[i]).toBe(null);
        expect(ch.doubleSmoothed[i]).toBe(null);
      }
    }
  });

  it('warmup region is null', () => {
    const series = constBar(40, 5);
    const ch = computeLineTrixDoubleSmoothed(series, {
      length: 4,
      signalLength: 3,
    });
    expect(ch.doubleSmoothed[0]).toBe(null);
    expect(ch.doubleSmoothed[5]).toBe(null);
  });

  it('output length matches input length', () => {
    const series = constBar(40, 5);
    const ch = computeLineTrixDoubleSmoothed(series, {
      length: 4,
      signalLength: 3,
    });
    expect(ch.doubleSmoothed.length).toBe(40);
  });

  it('does not mutate input', () => {
    const series = linearUp(40);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineTrixDoubleSmoothed(series, { length: 4 });
    expect(series).toEqual(snap);
  });

  it('LINEAR UP yields finite trix post-warmup', () => {
    const series = linearUp(60);
    const ch = computeLineTrixDoubleSmoothed(series, {
      length: 4,
      signalLength: 3,
    });
    for (let i = 30; i < 60; i += 1) {
      expect(ch.doubleSmoothed[i]).toBeTypeOf('number');
    }
  });
});

describe('classifyLineTrixDoubleSmoothedZone', () => {
  it('classifies bullish above bullishThreshold', () => {
    expect(classifyLineTrixDoubleSmoothedZone(10, 0, 0)).toBe('bullish');
  });

  it('classifies bearish below bearishThreshold', () => {
    expect(classifyLineTrixDoubleSmoothedZone(-10, 0, 0)).toBe('bearish');
  });

  it('classifies neutral at zero', () => {
    expect(classifyLineTrixDoubleSmoothedZone(0, 0, 0)).toBe('neutral');
  });

  it('returns none for null', () => {
    expect(classifyLineTrixDoubleSmoothedZone(null, 0, 0)).toBe('none');
  });
});

describe('detectLineTrixDoubleSmoothedCrosses', () => {
  it('returns nulls for warmup', () => {
    expect(detectLineTrixDoubleSmoothedCrosses([null, null], 0, 0)).toEqual([
      null,
      null,
    ]);
  });

  it('flags up when crossing above bullish', () => {
    const ev = detectLineTrixDoubleSmoothedCrosses([null, -1, 2], 0, 0);
    expect(ev[2]).toBe('up');
  });

  it('flags down when crossing below bearish', () => {
    const ev = detectLineTrixDoubleSmoothedCrosses([null, 1, -2], 0, 0);
    expect(ev[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineTrixDoubleSmoothedCrosses([null, 2], 0, 0)[1]).toBe(null);
  });
});

describe('runLineTrixDoubleSmoothed', () => {
  it('marks ok=false for short data', () => {
    const run = runLineTrixDoubleSmoothed(constBar(5, 10), {
      length: 4,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineTrixDoubleSmoothed(constBar(20, 10), {
      length: 4,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineTrixDoubleSmoothed(constBar(60, 10));
    expect(run.length).toBe(DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
    );
    expect(run.bullishThreshold).toBe(0);
    expect(run.bearishThreshold).toBe(0);
  });

  it('respects explicit options', () => {
    const run = runLineTrixDoubleSmoothed(constBar(60, 10), {
      length: 7,
      signalLength: 5,
      bullishThreshold: 10,
      bearishThreshold: -10,
    });
    expect(run.length).toBe(7);
    expect(run.signalLength).toBe(5);
    expect(run.bullishThreshold).toBe(10);
    expect(run.bearishThreshold).toBe(-10);
  });

  it('sorts by x', () => {
    const data: ChartLineTrixDoubleSmoothedPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineTrixDoubleSmoothed(data, { length: 2 });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST close classifies as neutral (double=0)', () => {
    const run = runLineTrixDoubleSmoothed(constBar(40, 10), {
      length: 4,
      signalLength: 3,
    });
    expect(run.neutralCount).toBeGreaterThan(0);
  });
});

describe('computeLineTrixDoubleSmoothedLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineTrixDoubleSmoothedLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineTrixDoubleSmoothedLayout({
      data: linearUp(60),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above trix', () => {
    const layout = computeLineTrixDoubleSmoothedLayout({
      data: linearUp(60),
    });
    expect(layout.priceBottom).toBeLessThan(layout.trixTop);
  });

  it('trix axis includes zero', () => {
    const layout = computeLineTrixDoubleSmoothedLayout({
      data: linearUp(60),
    });
    expect(layout.trixMin).toBeLessThanOrEqual(0);
    expect(layout.trixMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineTrixDoubleSmoothedLayout({
      data: linearUp(60),
    });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(60);
  });
});

describe('describeLineTrixDoubleSmoothedChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineTrixDoubleSmoothedChart([])).toBe('No data');
  });

  it('mentions Double-smoothed TRIX', () => {
    const desc = describeLineTrixDoubleSmoothedChart(linearUp(60));
    expect(desc).toContain('Double-smoothed TRIX');
  });

  it('reports parameters', () => {
    const desc = describeLineTrixDoubleSmoothedChart(linearUp(60), {
      length: 7,
      signalLength: 5,
      bullishThreshold: 10,
      bearishThreshold: -10,
    });
    expect(desc).toContain('length 7');
    expect(desc).toContain('signalLength 5');
    expect(desc).toContain('bullishThreshold 10');
    expect(desc).toContain('bearishThreshold -10');
  });
});

describe('<ChartLineTrixDoubleSmoothed />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={[]} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('TRIX');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTrixDoubleSmoothed data={linearUp(60)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        length={7}
        signalLength={5}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-double-smoothed"]',
    );
    expect(root?.getAttribute('data-length')).toBe('7');
    expect(root?.getAttribute('data-signal-length')).toBe('5');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-double-smoothed"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('60');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-aria-desc"]',
      )?.textContent,
    ).toContain('Double-smoothed TRIX');
  });

  it('renders both legend items', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="trix"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="trix"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'trix',
      hidden: true,
    });
  });

  it('hides trix when controlled hidden', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        hiddenSeries={['trix']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-line"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-zero-line"]',
      ),
    ).toBe(null);
  });

  it('does not render thresholds when both equal zero', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-bullish-line"]',
      ),
    ).toBe(null);
  });

  it('renders thresholds when bullishThreshold > 0', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        bullishThreshold={10}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-bullish-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-axes"]',
      ),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-grid"]',
      ),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-double-smoothed"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        animate={false}
      />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-trix-double-smoothed-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders the trix line by default', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-line"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed data={linearUp(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineTrixDoubleSmoothed
        data={linearUp(60)}
        defaultHiddenSeries={['trix']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-double-smoothed-line"]',
      ),
    ).toBe(null);
  });
});

describe('TRIX Double-smoothed integration', () => {
  it('CONST close > 0 yields trix = 0 and double = 0 across (K, length, signal)', () => {
    for (const K of [1, 5, 100]) {
      for (const L of [4, 7]) {
        for (const S of [2, 3]) {
          const total = 3 * (L - 1) + S + 10;
          const series = constBar(total, K);
          const ch = computeLineTrixDoubleSmoothed(series, {
            length: L,
            signalLength: S,
          });
          const start = 3 * (L - 1) + S;
          for (let i = start; i < total; i += 1) {
            expect(ch.trix[i]).toBe(0);
            expect(ch.doubleSmoothed[i]).toBe(0);
          }
        }
      }
    }
  });
});
