import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMacdCrossSig,
  applyLineMacdCrossSigEma,
  classifyLineMacdCrossSigRegime,
  computeLineMacdCrossSig,
  computeLineMacdCrossSigLayout,
  describeLineMacdCrossSigChart,
  detectLineMacdCrossSigCrosses,
  getLineMacdCrossSigFinitePoints,
  normalizeLineMacdCrossSigLength,
  runLineMacdCrossSig,
  type ChartLineMacdCrossSigPoint,
} from './chart-line-macd-cross-sig';

const constSeries = (n: number, K: number): ChartLineMacdCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineMacdCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineMacdCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineMacdCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineMacdCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineMacdCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineMacdCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineMacdCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineMacdCrossSigLength(0, 12)).toBe(12);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineMacdCrossSigLength('x', 12)).toBe(12);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineMacdCrossSigLength(14.7, 12)).toBe(14);
  });
});

describe('applyLineMacdCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 6, 9, 12]) {
        const v = new Array<number>(30).fill(K);
        const out = applyLineMacdCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineMacdCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineMacdCrossSig(null)).toEqual({
      macd: [],
      signal: [],
    });
  });

  it('CONST K -> MACD = 0 and signal = 0 across multiple K and tuples', () => {
    for (const K of [0, 1, 5, 50, 100]) {
      for (const fast of [9, 12]) {
        for (const slow of [21, 26]) {
          const data = constSeries(80, K);
          const { macd, signal } = computeLineMacdCrossSig(data, {
            fastLength: fast,
            slowLength: slow,
            signalLength: 9,
          });
          const macdWarmup = slow - 1;
          const sigWarmup = macdWarmup + 9 - 1;
          for (let i = macdWarmup; i < data.length; i += 1) {
            expect(macd[i]).toBe(0);
          }
          for (let i = sigWarmup; i < data.length; i += 1) {
            expect(signal[i]).toBe(0);
          }
        }
      }
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(80, 5);
    const { macd } = computeLineMacdCrossSig(data);
    expect(macd[40]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineMacdCrossSig(data, {
      fastLength: 12,
      slowLength: 26,
      signalLength: 9,
    });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineMacdCrossSigRegime', () => {
  it('returns bullish when macd > signal', () => {
    expect(classifyLineMacdCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when macd < signal', () => {
    expect(classifyLineMacdCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when macd == signal', () => {
    expect(classifyLineMacdCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineMacdCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineMacdCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineMacdCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineMacdCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const macd = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineMacdCrossSigCrosses(series, macd, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineMacdCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const macd = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineMacdCrossSigCrosses(series, macd, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null macd or signal', () => {
    const series: ChartLineMacdCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineMacdCrossSigCrosses(series, [null, 1], [null, 0])).toEqual([]);
  });
});

describe('runLineMacdCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineMacdCrossSig(constSeries(20, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineMacdCrossSig(constSeries(80, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineMacdCrossSig(constSeries(80, 5));
    expect(res.fastLength).toBe(12);
    expect(res.slowLength).toBe(26);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineMacdCrossSig(constSeries(80, 5), {
      fastLength: 8,
      slowLength: 21,
      signalLength: 5,
    });
    expect(res.fastLength).toBe(8);
    expect(res.slowLength).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineMacdCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup and zero crosses', () => {
    for (const K of [0, 7, 100]) {
      const res = runLineMacdCrossSig(constSeries(80, K));
      const sigWarmup = 26 - 1 + 9 - 1;
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
      expect(res.bullishCount).toBe(0);
      expect(res.bearishCount).toBe(0);
    }
  });
});

describe('computeLineMacdCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineMacdCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.macdPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineMacdCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineMacdCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineMacdCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and macd paths', () => {
    const lo = computeLineMacdCrossSigLayout({
      data: linearSeries(80, 100, 1),
      fastLength: 12,
      slowLength: 26,
      signalLength: 9,
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.macdPath).toMatch(/^M\s/);
  });
});

describe('describeLineMacdCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineMacdCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineMacdCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions all three lengths', () => {
    const text = describeLineMacdCrossSigChart(linearSeries(12, 1, 1), {
      fastLength: 8,
      slowLength: 21,
      signalLength: 5,
    });
    expect(text).toContain('8');
    expect(text).toContain('21');
    expect(text).toContain('5');
  });
});

describe('<ChartLineMacdCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineMacdCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineMacdCrossSig ref={ref} data={linearSeries(80, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes fast / slow / signal lengths and total points', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        fastLength={12}
        slowLength={26}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.fastLength).toBe('12');
    expect(root?.dataset.slowLength).toBe('26');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('80');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={constSeries(80, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-macd-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-macd-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        hiddenSeries={['signal']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'signal',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge with fast / slow / signal', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        fastLength={12}
        slowLength={26}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-badge"]',
      )?.textContent,
    ).toContain('fast 12');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-macd-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders macd and signal paths', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-macd-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineMacdCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-macd-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineMacdCrossSig
        data={linearSeries(80, 100, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('MACD Cross Signal integration', () => {
  it('CONST K -> MACD = 0 / signal = 0 bit-exact across multiple K and lengths', () => {
    for (const K of [0, 1, 50, 100, 1234]) {
      for (const fast of [8, 12]) {
        for (const slow of [21, 26]) {
          const res = runLineMacdCrossSig(constSeries(80, K), {
            fastLength: fast,
            slowLength: slow,
            signalLength: 9,
          });
          const sigWarmup = slow - 1 + 9 - 1;
          for (let i = sigWarmup; i < res.samples.length; i += 1) {
            expect(res.samples[i]?.macd).toBe(0);
            expect(res.samples[i]?.signal).toBe(0);
          }
          expect(res.crosses.length).toBe(0);
        }
      }
    }
  });
});
