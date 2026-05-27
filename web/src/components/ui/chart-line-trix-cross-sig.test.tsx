import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTrixCrossSig,
  applyLineTrixCrossSigEma,
  classifyLineTrixCrossSigRegime,
  computeLineTrixCrossSig,
  computeLineTrixCrossSigLayout,
  describeLineTrixCrossSigChart,
  detectLineTrixCrossSigCrosses,
  getLineTrixCrossSigFinitePoints,
  normalizeLineTrixCrossSigLength,
  runLineTrixCrossSig,
  type ChartLineTrixCrossSigPoint,
} from './chart-line-trix-cross-sig';

const constSeries = (n: number, K: number): ChartLineTrixCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineTrixCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineTrixCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineTrixCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineTrixCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineTrixCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineTrixCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineTrixCrossSigLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineTrixCrossSigLength(1, 15)).toBe(15);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineTrixCrossSigLength('x', 15)).toBe(15);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineTrixCrossSigLength(21.7, 15)).toBe(21);
  });
});

describe('applyLineTrixCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 9, 15]) {
        const v = new Array<number>(30).fill(K);
        const out = applyLineTrixCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineTrixCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineTrixCrossSig(null)).toEqual({ trix: [], signal: [] });
  });

  it('CONST close = K > 0 -> TRIX = 0 / signal = 0 across multiple K', () => {
    for (const K of [1, 5, 17, 100, 1234]) {
      const data = constSeries(80, K);
      const { trix, signal } = computeLineTrixCrossSig(data, {
        length: 15,
        signalLength: 9,
      });
      // ema3 first non-null at 3*length - 3 ; TRIX needs i and i-1 -> at 3*length-2
      const trixWarmup = 3 * 15 - 2;
      const sigWarmup = trixWarmup + 9 - 1;
      for (let i = trixWarmup; i < data.length; i += 1) {
        expect(trix[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
      }
    }
  });

  it('CONST close = 0 -> TRIX = null', () => {
    const data = constSeries(80, 0);
    const { trix, signal } = computeLineTrixCrossSig(data, {
      length: 15,
      signalLength: 9,
    });
    for (let i = 0; i < data.length; i += 1) {
      expect(trix[i]).toBeNull();
      expect(signal[i]).toBeNull();
    }
  });

  it('falls back to default lengths', () => {
    const data = constSeries(80, 5);
    const { trix } = computeLineTrixCrossSig(data);
    expect(trix[60]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineTrixCrossSig(data, { length: 15, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineTrixCrossSigRegime', () => {
  it('returns bullish when trix > signal', () => {
    expect(classifyLineTrixCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when trix < signal', () => {
    expect(classifyLineTrixCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when trix == signal', () => {
    expect(classifyLineTrixCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineTrixCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineTrixCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineTrixCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineTrixCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const trix = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(detectLineTrixCrossSigCrosses(series, trix, signal)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineTrixCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const trix = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(detectLineTrixCrossSigCrosses(series, trix, signal)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null trix or signal', () => {
    const series: ChartLineTrixCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineTrixCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineTrixCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineTrixCrossSig(constSeries(20, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineTrixCrossSig(constSeries(80, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default lengths', () => {
    const res = runLineTrixCrossSig(constSeries(80, 5));
    expect(res.length).toBe(15);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom lengths', () => {
    const res = runLineTrixCrossSig(constSeries(80, 5), {
      length: 21,
      signalLength: 5,
    });
    expect(res.length).toBe(21);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineTrixCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K > 0 -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineTrixCrossSig(constSeries(80, 7));
    const sigWarmup = 3 * 15 - 2 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('CONST K = 0 -> regime none everywhere', () => {
    const res = runLineTrixCrossSig(constSeries(80, 0));
    expect(res.noneCount).toBe(80);
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineTrixCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineTrixCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.trixPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineTrixCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineTrixCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineTrixCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders price and trix paths', () => {
    const lo = computeLineTrixCrossSigLayout({
      data: linearSeries(80, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.trixPath).toMatch(/^M\s/);
  });
});

describe('describeLineTrixCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineTrixCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineTrixCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineTrixCrossSigChart(linearSeries(12, 1, 1), {
      length: 21,
      signalLength: 7,
    });
    expect(text).toContain('21');
    expect(text).toContain('7');
  });
});

describe('<ChartLineTrixCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineTrixCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-trix-cross-sig"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineTrixCrossSig ref={ref} data={linearSeries(80, 100, 1)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        length={15}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('15');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('80');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={constSeries(80, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-trix-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-trix-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
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
      <ChartLineTrixCrossSig
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

  it('shows config badge with length and signal', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        length={15}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 15');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-trix-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders trix and signal paths', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-trix-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the price path', () => {
    const { container } = render(
      <ChartLineTrixCrossSig data={linearSeries(80, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-price-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
        data={linearSeries(80, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-trix-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineTrixCrossSig
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

describe('TRIX Cross Signal integration', () => {
  it('CONST K > 0 -> TRIX = 0 / signal = 0 / regime neutral / 0 crosses across multiple K', () => {
    const trixWarmup = 3 * 15 - 2;
    const sigWarmup = trixWarmup + 9 - 1;
    for (const K of [1, 5, 17, 100, 1234]) {
      const res = runLineTrixCrossSig(constSeries(80, K), {
        length: 15,
        signalLength: 9,
      });
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.trix).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
