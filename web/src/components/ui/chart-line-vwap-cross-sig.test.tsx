import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVwapCrossSig,
  applyLineVwapCrossSigEma,
  classifyLineVwapCrossSigRegime,
  computeLineVwapCrossSig,
  computeLineVwapCrossSigLayout,
  describeLineVwapCrossSigChart,
  detectLineVwapCrossSigCrosses,
  getLineVwapCrossSigFinitePoints,
  normalizeLineVwapCrossSigLength,
  runLineVwapCrossSig,
  type ChartLineVwapCrossSigPoint,
} from './chart-line-vwap-cross-sig';

const constSeries = (n: number, K: number): ChartLineVwapCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineVwapCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineVwapCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVwapCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineVwapCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineVwapCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineVwapCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineVwapCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVwapCrossSigLength(0, 20)).toBe(20);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVwapCrossSigLength('x', 20)).toBe(20);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVwapCrossSigLength(15.7, 20)).toBe(15);
  });
});

describe('applyLineVwapCrossSigEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 9]) {
        const v = new Array<number>(40).fill(K);
        const out = applyLineVwapCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineVwapCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineVwapCrossSig(null)).toEqual({
      vwap: [],
      signal: [],
    });
  });

  it('CONST K > 0 -> vwap = K, signal = K', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineVwapCrossSig(data);
      const warmup = 20 + 9 - 1;
      for (let i = warmup; i < data.length; i += 1) {
        expect(ch.vwap[i]).toBe(K);
        expect(ch.signal[i]).toBe(K);
      }
    }
  });

  it('CONST K = 0 -> divide-by-zero -> vwap = null, signal = null', () => {
    const data = constSeries(40, 0);
    const ch = computeLineVwapCrossSig(data);
    for (let i = 19; i < data.length; i += 1) {
      expect(ch.vwap[i]).toBeNull();
      expect(ch.signal[i]).toBeNull();
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVwapCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP -> vwap > signal (VWAP outruns EMA)', () => {
    const data = linearSeries(40, 1, 1);
    const ch = computeLineVwapCrossSig(data);
    const warmup = 20 + 9 - 1;
    for (let i = warmup; i < data.length; i += 1) {
      const v = ch.vwap[i];
      const s = ch.signal[i];
      expect(v).not.toBeNull();
      expect(s).not.toBeNull();
      expect(v!).toBeGreaterThan(s!);
    }
  });
});

describe('classifyLineVwapCrossSigRegime', () => {
  it('returns bullish when vwap > signal', () => {
    expect(classifyLineVwapCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when vwap < signal', () => {
    expect(classifyLineVwapCrossSigRegime(1, 2)).toBe('bearish');
  });
  it('returns neutral when vwap == signal', () => {
    expect(classifyLineVwapCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineVwapCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineVwapCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineVwapCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVwapCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVwapCrossSigCrosses(series, [10, 20], [15, 15]),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVwapCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVwapCrossSigCrosses(series, [20, 10], [15, 15]),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineVwapCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVwapCrossSigCrosses(series, [null, 20], [null, 15]),
    ).toEqual([]);
  });
});

describe('runLineVwapCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVwapCrossSig(constSeries(15, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVwapCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineVwapCrossSig(constSeries(40, 5));
    expect(res.length).toBe(20);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineVwapCrossSig(constSeries(40, 5), {
      length: 14,
      signalLength: 5,
    });
    expect(res.length).toBe(14);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineVwapCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineVwapCrossSig(constSeries(40, 7));
    const warmup = 20 + 9 - 1;
    for (let i = warmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineVwapCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVwapCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.vwapPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVwapCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineVwapCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('renders price and vwap paths', () => {
    const lo = computeLineVwapCrossSigLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.vwapPath).toMatch(/^M\s/);
  });
});

describe('describeLineVwapCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVwapCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVwapCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions lengths', () => {
    const text = describeLineVwapCrossSigChart(linearSeries(12, 1, 1), {
      length: 14,
      signalLength: 5,
    });
    expect(text).toContain('14');
    expect(text).toContain('5');
  });
});

describe('<ChartLineVwapCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVwapCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-vwap-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVwapCrossSig ref={ref} data={linearSeries(40, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('20');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vwap-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-vwap-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="vwap"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
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

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 20');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vwap-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders vwap and signal paths', () => {
    const { container } = render(
      <ChartLineVwapCrossSig data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-vwap-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vwap-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineVwapCrossSig
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('VWAP Cross Signal integration', () => {
  it('CONST K > 0 -> vwap = signal = K bit-exact, regime neutral, 0 crosses', () => {
    const warmup = 20 + 9 - 1;
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineVwapCrossSig(constSeries(40, K));
      for (let i = warmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.vwap).toBe(K);
        expect(res.samples[i]?.signal).toBe(K);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
