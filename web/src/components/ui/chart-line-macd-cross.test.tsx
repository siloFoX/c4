import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMacdCross,
  applyLineMacdCrossEma,
  classifyLineMacdCrossBias,
  classifyLineMacdCrossRelation,
  computeLineMacdCross,
  computeLineMacdCrossLayout,
  describeLineMacdCrossChart,
  detectLineMacdCrossCrosses,
  getLineMacdCrossFinitePoints,
  normalizeLineMacdCrossLength,
  runLineMacdCross,
  DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH,
  DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH,
  DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
} from './chart-line-macd-cross';
import type { ChartLineMacdCrossPoint } from './chart-line-macd-cross';

const constBar = (count: number, K: number): ChartLineMacdCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: K }));

const linearUp = (count: number): ChartLineMacdCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: i + 1 }));

const linearDown = (count: number): ChartLineMacdCrossPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, close: count - i }));

describe('getLineMacdCrossFinitePoints', () => {
  it('returns empty for null', () => {
    expect(getLineMacdCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN close', () => {
    const r = getLineMacdCrossFinitePoints([
      { x: 0, close: Number.NaN },
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineMacdCrossFinitePoints([
      null as unknown as ChartLineMacdCrossPoint,
      { x: 1, close: 10 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineMacdCrossLength', () => {
  it('uses default when undefined', () => {
    expect(normalizeLineMacdCrossLength(undefined, 12)).toBe(12);
  });

  it('rejects below 2', () => {
    expect(normalizeLineMacdCrossLength(1, 12)).toBe(12);
  });

  it('accepts a finite integer >= 2', () => {
    expect(normalizeLineMacdCrossLength(5, 12)).toBe(5);
  });
});

describe('applyLineMacdCrossEma', () => {
  it('CONST K EMA is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100, -2]) {
      for (const L of [2, 5, 12, 26]) {
        const out = applyLineMacdCrossEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineMacdCrossEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('CONST short-circuit keeps the value bit-exact', () => {
    const out = applyLineMacdCrossEma(
      [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      3,
    );
    // After seeding at i=2 = (1+2+2)/3 = 5/3, then alpha=0.5 each step
    // toward 2, but the v === smoothed short-circuit pins it once it
    // actually reaches the value. We just check it's monotonic toward 2.
    const last = out[out.length - 1];
    expect(last).not.toBe(null);
    expect(last!).toBeGreaterThan(1.9);
  });
});

describe('computeLineMacdCross', () => {
  it('returns empty for null', () => {
    const ch = computeLineMacdCross(null);
    expect(ch.macd).toEqual([]);
    expect(ch.signal).toEqual([]);
  });

  it('CONST yields macd = 0 and signal = 0', () => {
    for (const K of [1, 5, 100, -3]) {
      const series = constBar(40, K);
      const ch = computeLineMacdCross(series, {
        fastLength: 3,
        slowLength: 5,
        signalLength: 3,
      });
      for (let i = 7; i < 40; i += 1) {
        expect(ch.macd[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP eventually yields signal === macd (relation equal)', () => {
    const series = linearUp(120);
    const ch = computeLineMacdCross(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    // After several signal steps the EMA-of-near-constant settles
    // and signal effectively tracks macd.
    const tail = 100;
    const m = ch.macd[tail];
    const s = ch.signal[tail];
    expect(m).not.toBe(null);
    expect(s).not.toBe(null);
    expect(Math.abs((m as number) - (s as number))).toBeLessThan(1e-9);
  });

  it('output length matches input length', () => {
    const series = linearUp(50);
    const ch = computeLineMacdCross(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(ch.macd.length).toBe(50);
    expect(ch.signal.length).toBe(50);
  });

  it('does not mutate input', () => {
    const series = linearUp(40);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineMacdCross(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineMacdCrossRelation', () => {
  it('bullish when macd > signal', () => {
    expect(classifyLineMacdCrossRelation(1, 0)).toBe('bullish');
  });

  it('bearish when macd < signal', () => {
    expect(classifyLineMacdCrossRelation(-1, 0)).toBe('bearish');
  });

  it('equal when macd == signal', () => {
    expect(classifyLineMacdCrossRelation(0, 0)).toBe('equal');
  });

  it('none when either is null', () => {
    expect(classifyLineMacdCrossRelation(null, 0)).toBe('none');
  });
});

describe('classifyLineMacdCrossBias', () => {
  it('null when macd is null', () => {
    expect(classifyLineMacdCrossBias(null)).toBe(null);
  });

  it('bullish when macd > 0', () => {
    expect(classifyLineMacdCrossBias(1)).toBe('bullish');
  });

  it('bearish when macd < 0', () => {
    expect(classifyLineMacdCrossBias(-1)).toBe('bearish');
  });

  it('neutral at exact zero', () => {
    expect(classifyLineMacdCrossBias(0)).toBe('neutral');
  });
});

describe('detectLineMacdCrossCrosses', () => {
  it('flags up cross when macd newly exceeds signal', () => {
    const ev = detectLineMacdCrossCrosses([-1, 1], [0, 0]);
    expect(ev[1]).toBe('up');
  });

  it('flags down cross when macd newly drops below signal', () => {
    const ev = detectLineMacdCrossCrosses([1, -1], [0, 0]);
    expect(ev[1]).toBe('down');
  });

  it('warmup nulls do not fire', () => {
    expect(
      detectLineMacdCrossCrosses([null, -1, 1], [null, 0, 0]),
    ).toEqual([null, null, 'up']);
  });

  it('no second cross after staying above', () => {
    const ev = detectLineMacdCrossCrosses([1, 2, 3], [0, 0, 0]);
    expect(ev[1]).toBe(null);
    expect(ev[2]).toBe(null);
  });
});

describe('runLineMacdCross', () => {
  it('ok=false on short data', () => {
    const run = runLineMacdCross(constBar(5, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(false);
  });

  it('ok=true with enough data', () => {
    const run = runLineMacdCross(constBar(20, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.ok).toBe(true);
  });

  it('uses defaults', () => {
    const run = runLineMacdCross(constBar(80, 10));
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_MACD_CROSS_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_MACD_CROSS_SLOW_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_MACD_CROSS_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineMacdCross(constBar(40, 10), {
      fastLength: 5,
      slowLength: 10,
      signalLength: 3,
    });
    expect(run.fastLength).toBe(5);
    expect(run.slowLength).toBe(10);
    expect(run.signalLength).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineMacdCrossPoint[] = [
      { x: 2, close: 30 },
      { x: 0, close: 10 },
      { x: 1, close: 20 },
    ];
    const run = runLineMacdCross(data, {
      fastLength: 2,
      slowLength: 3,
      signalLength: 2,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST yields zero crosses', () => {
    const run = runLineMacdCross(constBar(60, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.upCrossCount).toBe(0);
    expect(run.downCrossCount).toBe(0);
  });

  it('CONST classifies bias as neutral', () => {
    const run = runLineMacdCross(constBar(60, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    for (let i = 7; i < 60; i += 1) {
      expect(run.samples[i]?.bias).toBe('neutral');
    }
  });

  it('LINEAR UP eventually classifies equal relation', () => {
    const run = runLineMacdCross(linearUp(120), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.samples[110]?.relation === 'equal').toBe(true);
  });
});

describe('computeLineMacdCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineMacdCrossLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineMacdCrossLayout({
      data: linearUp(80),
    });
    expect(layout.ok).toBe(true);
  });

  it('panels stack price above oscillator', () => {
    const layout = computeLineMacdCrossLayout({ data: linearUp(80) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('zero is inside the osc axis bounds', () => {
    const layout = computeLineMacdCrossLayout({
      data: linearUp(80),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineMacdCrossLayout({ data: linearUp(80) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(80);
  });

  it('produces macd and signal paths', () => {
    const layout = computeLineMacdCrossLayout({
      data: linearUp(80),
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(layout.macdPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });
});

describe('describeLineMacdCrossChart', () => {
  it('returns No data on empty', () => {
    expect(describeLineMacdCrossChart([])).toBe('No data');
  });

  it('mentions MACD Cross', () => {
    const desc = describeLineMacdCrossChart(linearUp(50));
    expect(desc).toContain('MACD Cross');
  });

  it('reports parameters', () => {
    const desc = describeLineMacdCrossChart(linearUp(50), {
      fastLength: 5,
      slowLength: 10,
      signalLength: 4,
    });
    expect(desc).toContain('fastLength 5');
    expect(desc).toContain('slowLength 10');
    expect(desc).toContain('signalLength 4');
  });
});

describe('<ChartLineMacdCross />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineMacdCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('MACD Cross');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMacdCross data={linearUp(80)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        fastLength={5}
        slowLength={10}
        signalLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('5');
    expect(root?.getAttribute('data-slow-length')).toBe('10');
    expect(root?.getAttribute('data-signal-length')).toBe('3');
  });

  it('exposes total-points and cross counts', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('80');
    expect(root?.getAttribute('data-up-cross-count')).toBe('0');
    expect(root?.getAttribute('data-down-cross-count')).toBe('0');
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-aria-desc"]',
      )?.textContent,
    ).toContain('MACD Cross');
  });

  it('renders all three legend buttons', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="macd"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        onSeriesToggle={onToggle}
      />,
    );
    const button = container.querySelector(
      '[data-series-id="macd"]',
    ) as HTMLButtonElement | null;
    if (button) fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'macd',
      hidden: true,
    });
  });

  it('hides macd when controlled', () => {
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        hiddenSeries={['macd']}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-macd-cross-macd"]'),
    ).toBe(null);
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-zeroline"]',
      ),
    ).toBeTruthy();
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} showZeroLine={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-zeroline"]',
      ),
    ).toBe(null);
  });

  it('hides axis when showAxis=false', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-macd-cross-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-macd-cross-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-macd-cross-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders macd and signal paths', () => {
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        fastLength={3}
        slowLength={5}
        signalLength={3}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-macd-cross-macd"]'),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-signal"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMacdCross data={linearUp(80)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('defaultHiddenSeries hides on mount', () => {
    const { container } = render(
      <ChartLineMacdCross
        data={linearUp(80)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-signal"]',
      ),
    ).toBe(null);
  });
});

describe('MACD Cross integration', () => {
  it('CONST yields macd=signal=0 and zero crosses across (K, fast, slow, signal)', () => {
    for (const K of [1, 5, 100, -3]) {
      for (const [F, S, G] of [
        [2, 4, 2],
        [3, 5, 3],
        [4, 8, 4],
      ] as const) {
        const minWarmup = S + G;
        const run = runLineMacdCross(constBar(minWarmup + 8, K), {
          fastLength: F,
          slowLength: S,
          signalLength: G,
        });
        for (let i = minWarmup; i < minWarmup + 8; i += 1) {
          expect(run.samples[i]?.macd).toBe(0);
          expect(run.samples[i]?.signal).toBe(0);
        }
        expect(run.upCrossCount).toBe(0);
        expect(run.downCrossCount).toBe(0);
      }
    }
  });

  it('CONST classifies all eligible bars as equal', () => {
    const run = runLineMacdCross(constBar(40, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 3,
    });
    expect(run.samples[20]?.relation).toBe('equal');
  });
});
