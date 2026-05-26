import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineKvoSignal,
  applyLineKvoSignalEma,
  applyLineKvoSignalTypicalPrice,
  applyLineKvoSignalVolumeForce,
  classifyLineKvoSignalZone,
  computeLineKvoSignal,
  computeLineKvoSignalLayout,
  describeLineKvoSignalChart,
  detectLineKvoSignalCrosses,
  getLineKvoSignalFinitePoints,
  normalizeLineKvoSignalLength,
  normalizeLineKvoSignalSignalLength,
  runLineKvoSignal,
  DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH,
  DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH,
  DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
} from './chart-line-kvo-signal';
import type { ChartLineKvoSignalPoint } from './chart-line-kvo-signal';

const constBar = (
  count: number,
  K: number,
  V = 100,
): ChartLineKvoSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: K,
    low: K,
    close: K,
    volume: V,
  }));

const linearUp = (
  count: number,
  V = 100,
): ChartLineKvoSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: i + 1,
    low: i + 1,
    close: i + 1,
    volume: V,
  }));

const linearDown = (
  count: number,
  V = 100,
): ChartLineKvoSignalPoint[] =>
  Array.from({ length: count }, (_, i) => ({
    x: i,
    high: count - i,
    low: count - i,
    close: count - i,
    volume: V,
  }));

describe('getLineKvoSignalFinitePoints', () => {
  it('returns an empty array for null', () => {
    expect(getLineKvoSignalFinitePoints(null)).toEqual([]);
  });

  it('drops non-finite close', () => {
    const r = getLineKvoSignalFinitePoints([
      { x: 0, high: 10, low: 5, close: Number.NaN, volume: 100 },
      { x: 1, high: 10, low: 5, close: 7, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops negative volume', () => {
    const r = getLineKvoSignalFinitePoints([
      { x: 0, high: 10, low: 5, close: 7, volume: -1 },
      { x: 1, high: 10, low: 5, close: 7, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });

  it('drops null entries', () => {
    const r = getLineKvoSignalFinitePoints([
      null as unknown as ChartLineKvoSignalPoint,
      { x: 1, high: 10, low: 5, close: 7, volume: 100 },
    ]);
    expect(r.length).toBe(1);
  });
});

describe('normalizeLineKvoSignalLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineKvoSignalLength(undefined, 34)).toBe(34);
  });

  it('rejects below 2', () => {
    expect(normalizeLineKvoSignalLength(1, 34)).toBe(34);
  });
});

describe('normalizeLineKvoSignalSignalLength', () => {
  it('returns default when undefined', () => {
    expect(normalizeLineKvoSignalSignalLength(undefined, 13)).toBe(13);
  });

  it('accepts 1', () => {
    expect(normalizeLineKvoSignalSignalLength(1, 13)).toBe(1);
  });
});

describe('applyLineKvoSignalEma', () => {
  it('CONST K EMA is K bit-exact (min===max seed)', () => {
    for (const K of [0, 1, 5, 100, -3]) {
      for (const L of [3, 5, 7]) {
        const out = applyLineKvoSignalEma(Array(L + 5).fill(K), L);
        for (let i = L - 1; i < L + 5; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });

  it('warmup is null', () => {
    const out = applyLineKvoSignalEma([1, 1, 1, 1, 1], 3);
    expect(out[0]).toBe(null);
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(1);
  });

  it('null resets seed', () => {
    const out = applyLineKvoSignalEma([1, 1, null, 1, 1, 1], 3);
    expect(out[2]).toBe(null);
    expect(out[5]).toBe(1);
  });
});

describe('applyLineKvoSignalTypicalPrice', () => {
  it('computes (h+l+c)/3', () => {
    const tp = applyLineKvoSignalTypicalPrice([
      { x: 0, high: 12, low: 6, close: 9, volume: 100 },
    ]);
    expect(tp[0]).toBe(9);
  });

  it('CONST h=l=c gives tp = K', () => {
    const tp = applyLineKvoSignalTypicalPrice([
      { x: 0, high: 5, low: 5, close: 5, volume: 100 },
    ]);
    expect(tp[0]).toBe(5);
  });
});

describe('applyLineKvoSignalVolumeForce', () => {
  it('first bar is null', () => {
    const vf = applyLineKvoSignalVolumeForce([5, 6, 7], [100, 100, 100]);
    expect(vf[0]).toBe(null);
  });

  it('positive sign when tp rises', () => {
    const vf = applyLineKvoSignalVolumeForce([5, 6], [100, 100]);
    expect(vf[1]).toBe(100);
  });

  it('negative sign when tp falls', () => {
    const vf = applyLineKvoSignalVolumeForce([5, 4], [100, 100]);
    expect(vf[1]).toBe(-100);
  });

  it('zero when tp unchanged', () => {
    const vf = applyLineKvoSignalVolumeForce([5, 5], [100, 100]);
    expect(vf[1]).toBe(0);
  });
});

describe('computeLineKvoSignal', () => {
  it('returns empty for null', () => {
    const ch = computeLineKvoSignal(null);
    expect(ch.signal).toEqual([]);
  });

  it('CONST OHLC and volume yields signal = 0 bit-exact', () => {
    for (const K of [1, 5, 100]) {
      for (const V of [1, 50, 1000]) {
        const series = constBar(30, K, V);
        const ch = computeLineKvoSignal(series, {
          fastLength: 3,
          slowLength: 5,
          signalLength: 2,
        });
        for (let i = 6; i < 30; i += 1) {
          expect(ch.signal[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR UP yields signal = 0 bit-exact (vf constant = V)', () => {
    for (const V of [1, 50, 1000]) {
      const series = linearUp(30, V);
      const ch = computeLineKvoSignal(series, {
        fastLength: 3,
        slowLength: 5,
        signalLength: 2,
      });
      for (let i = 6; i < 30; i += 1) {
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('LINEAR DOWN yields signal = 0 bit-exact (vf constant = -V)', () => {
    for (const V of [1, 50, 1000]) {
      const series = linearDown(30, V);
      const ch = computeLineKvoSignal(series, {
        fastLength: 3,
        slowLength: 5,
        signalLength: 2,
      });
      for (let i = 6; i < 30; i += 1) {
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('warmup region is null', () => {
    const series = linearUp(30);
    const ch = computeLineKvoSignal(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(ch.signal[0]).toBe(null);
    expect(ch.signal[5]).toBe(null);
    expect(ch.signal[6]).toBe(0);
  });

  it('output length matches input length', () => {
    const series = linearUp(30);
    const ch = computeLineKvoSignal(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(ch.signal.length).toBe(30);
  });

  it('does not mutate input', () => {
    const series = linearUp(30);
    const snap = JSON.parse(JSON.stringify(series));
    computeLineKvoSignal(series, {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(series).toEqual(snap);
  });
});

describe('classifyLineKvoSignalZone', () => {
  it('bullish when > 0', () => {
    expect(classifyLineKvoSignalZone(5)).toBe('bullish');
  });

  it('bearish when < 0', () => {
    expect(classifyLineKvoSignalZone(-5)).toBe('bearish');
  });

  it('neutral when 0', () => {
    expect(classifyLineKvoSignalZone(0)).toBe('neutral');
  });

  it('none for null', () => {
    expect(classifyLineKvoSignalZone(null)).toBe('none');
  });
});

describe('detectLineKvoSignalCrosses', () => {
  it('null on warmup', () => {
    expect(detectLineKvoSignalCrosses([null, null])).toEqual([null, null]);
  });

  it('up cross when crossing above zero', () => {
    expect(detectLineKvoSignalCrosses([null, -1, 2])[2]).toBe('up');
  });

  it('down cross when crossing below zero', () => {
    expect(detectLineKvoSignalCrosses([null, 1, -2])[2]).toBe('down');
  });

  it('first defined sample is not a cross', () => {
    expect(detectLineKvoSignalCrosses([null, 5])[1]).toBe(null);
  });
});

describe('runLineKvoSignal', () => {
  it('marks ok=false for short data', () => {
    const run = runLineKvoSignal(constBar(5, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(run.ok).toBe(false);
  });

  it('marks ok=true with enough data', () => {
    const run = runLineKvoSignal(constBar(10, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(run.ok).toBe(true);
  });

  it('uses default parameters', () => {
    const run = runLineKvoSignal(constBar(100, 10));
    expect(run.fastLength).toBe(DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH);
    expect(run.slowLength).toBe(DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH);
    expect(run.signalLength).toBe(
      DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
    );
  });

  it('respects explicit options', () => {
    const run = runLineKvoSignal(constBar(20, 10), {
      fastLength: 7,
      slowLength: 14,
      signalLength: 3,
    });
    expect(run.fastLength).toBe(7);
    expect(run.slowLength).toBe(14);
    expect(run.signalLength).toBe(3);
  });

  it('sorts by x', () => {
    const data: ChartLineKvoSignalPoint[] = [
      { x: 2, high: 12, low: 10, close: 11, volume: 100 },
      { x: 0, high: 12, low: 10, close: 11, volume: 100 },
      { x: 1, high: 12, low: 10, close: 11, volume: 100 },
    ];
    const run = runLineKvoSignal(data, {
      fastLength: 2,
      slowLength: 3,
      signalLength: 2,
    });
    expect(run.samples.map((s) => s.x)).toEqual([0, 1, 2]);
  });

  it('CONST classifies as neutral (signal=0)', () => {
    const run = runLineKvoSignal(constBar(30, 10), {
      fastLength: 3,
      slowLength: 5,
      signalLength: 2,
    });
    expect(run.neutralCount).toBeGreaterThan(0);
  });
});

describe('computeLineKvoSignalLayout', () => {
  it('returns ok=false for empty data', () => {
    const layout = computeLineKvoSignalLayout({ data: [] });
    expect(layout.ok).toBe(false);
  });

  it('returns ok=true for sufficient data', () => {
    const layout = computeLineKvoSignalLayout({ data: linearUp(30) });
    expect(layout.ok).toBe(true);
  });

  it('panels stack with price above osc', () => {
    const layout = computeLineKvoSignalLayout({ data: linearUp(30) });
    expect(layout.priceBottom).toBeLessThan(layout.oscTop);
  });

  it('osc axis includes zero', () => {
    const layout = computeLineKvoSignalLayout({ data: linearUp(30) });
    expect(layout.oscMin).toBeLessThanOrEqual(0);
    expect(layout.oscMax).toBeGreaterThanOrEqual(0);
  });

  it('produces a price path and dots', () => {
    const layout = computeLineKvoSignalLayout({ data: linearUp(30) });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.priceDots.length).toBe(30);
  });
});

describe('describeLineKvoSignalChart', () => {
  it('returns No data for empty input', () => {
    expect(describeLineKvoSignalChart([])).toBe('No data');
  });

  it('mentions Klinger Volume Oscillator', () => {
    const desc = describeLineKvoSignalChart(linearUp(30));
    expect(desc).toContain('Klinger Volume Oscillator');
  });

  it('reports parameters', () => {
    const desc = describeLineKvoSignalChart(linearUp(30), {
      fastLength: 7,
      slowLength: 14,
      signalLength: 3,
    });
    expect(desc).toContain('fastLength 7');
    expect(desc).toContain('slowLength 14');
    expect(desc).toContain('signalLength 3');
  });
});

describe('<ChartLineKvoSignal />', () => {
  it('renders empty placeholder for no data', () => {
    const { container } = render(<ChartLineKvoSignal data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-empty"]',
      )?.textContent,
    ).toBe('No data');
  });

  it('renders region role with aria-label', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute('aria-label')).toContain('KVO');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKvoSignal data={linearUp(30)} ref={ref} />);
    expect(ref.current).not.toBe(null);
  });

  it('exposes data attrs', () => {
    const { container } = render(
      <ChartLineKvoSignal
        data={linearUp(30)}
        fastLength={7}
        slowLength={14}
        signalLength={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-signal"]',
    );
    expect(root?.getAttribute('data-fast-length')).toBe('7');
    expect(root?.getAttribute('data-slow-length')).toBe('14');
    expect(root?.getAttribute('data-signal-length')).toBe('3');
  });

  it('exposes total-points', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-signal"]',
    );
    expect(root?.getAttribute('data-total-points')).toBe('30');
  });

  it('renders the screen-reader description', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-aria-desc"]',
      )?.textContent,
    ).toContain('Klinger Volume Oscillator');
  });

  it('renders all three legend items', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    expect(container.querySelector('[data-series-id="price"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="kvo"]')).toBeTruthy();
    expect(container.querySelector('[data-series-id="signal"]')).toBeTruthy();
  });

  it('toggles a series via the legend', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineKvoSignal
        data={linearUp(30)}
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
      <ChartLineKvoSignal
        data={linearUp(30)}
        hiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-signal-path"]',
      ),
    ).toBe(null);
  });

  it('renders the config badge by default', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-badge"]',
      ),
    ).toBeTruthy();
  });

  it('renders zero line by default', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-zero-line"]',
      ),
    ).toBeTruthy();
  });

  it('hides axis when showAxis is false', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} showAxis={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-signal-axes"]'),
    ).toBe(null);
  });

  it('hides grid when showGrid is false', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} showGrid={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kvo-signal-grid"]'),
    ).toBe(null);
  });

  it('hides legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} showLegend={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-legend"]',
      ),
    ).toBe(null);
  });

  it('applies className and style', () => {
    const { container } = render(
      <ChartLineKvoSignal
        data={linearUp(30)}
        className="custom-class"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-kvo-signal"]',
    );
    expect(root?.classList.contains('custom-class')).toBe(true);
    expect((root as HTMLElement | null)?.style.background).toBe('red');
  });

  it('animate=false disables fade-in class', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} animate={false} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-kvo-signal-svg"]',
    );
    expect(svg?.classList.contains('motion-safe:animate-fade-in')).toBe(
      false,
    );
  });

  it('renders kvo and signal paths', () => {
    const { container } = render(
      <ChartLineKvoSignal
        data={linearUp(30)}
        fastLength={3}
        slowLength={5}
        signalLength={2}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-kvo-path"]',
      ),
    ).toBeTruthy();
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-signal-path"]',
      ),
    ).toBeTruthy();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineKvoSignal data={linearUp(30)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-price-path"]',
      ),
    ).toBeTruthy();
  });

  it('respects defaultHiddenSeries on uncontrolled mount', () => {
    const { container } = render(
      <ChartLineKvoSignal
        data={linearUp(30)}
        defaultHiddenSeries={['signal']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-kvo-signal-signal-path"]',
      ),
    ).toBe(null);
  });
});

describe('KVO Signal integration', () => {
  it('CONST yields signal = 0 across (K, V, fast, slow, signal)', () => {
    for (const K of [1, 5, 100]) {
      for (const V of [1, 50, 1000]) {
        for (const [F, S, Sg] of [
          [3, 5, 2],
          [4, 7, 3],
        ] as const) {
          const total = S + Sg + 10;
          const series = constBar(total, K, V);
          const ch = computeLineKvoSignal(series, {
            fastLength: F,
            slowLength: S,
            signalLength: Sg,
          });
          const start = S + Sg - 1;
          for (let i = start; i < total; i += 1) {
            expect(ch.signal[i]).toBe(0);
          }
        }
      }
    }
  });

  it('LINEAR UP yields signal = 0 across (V, fast, slow, signal)', () => {
    for (const V of [1, 50, 1000]) {
      for (const [F, S, Sg] of [
        [3, 5, 2],
        [4, 7, 3],
      ] as const) {
        const total = S + Sg + 10;
        const series = linearUp(total, V);
        const ch = computeLineKvoSignal(series, {
          fastLength: F,
          slowLength: S,
          signalLength: Sg,
        });
        const start = S + Sg - 1;
        for (let i = start; i < total; i += 1) {
          expect(ch.signal[i]).toBe(0);
        }
      }
    }
  });

  it('LINEAR DOWN yields signal = 0 across (V, fast, slow, signal)', () => {
    for (const V of [1, 50, 1000]) {
      for (const [F, S, Sg] of [
        [3, 5, 2],
        [4, 7, 3],
      ] as const) {
        const total = S + Sg + 10;
        const series = linearDown(total, V);
        const ch = computeLineKvoSignal(series, {
          fastLength: F,
          slowLength: S,
          signalLength: Sg,
        });
        const start = S + Sg - 1;
        for (let i = start; i < total; i += 1) {
          expect(ch.signal[i]).toBe(0);
        }
      }
    }
  });
});
