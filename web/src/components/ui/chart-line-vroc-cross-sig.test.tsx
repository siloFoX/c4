import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVrocCrossSig,
  applyLineVrocCrossSigEma,
  classifyLineVrocCrossSigRegime,
  computeLineVrocCrossSig,
  computeLineVrocCrossSigLayout,
  describeLineVrocCrossSigChart,
  detectLineVrocCrossSigCrosses,
  getLineVrocCrossSigFinitePoints,
  normalizeLineVrocCrossSigLength,
  runLineVrocCrossSig,
  type ChartLineVrocCrossSigPoint,
} from './chart-line-vroc-cross-sig';

const constSeries = (n: number, V: number): ChartLineVrocCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, volume: V }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineVrocCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({
    x: i,
    volume: start + step * i,
  }));

describe('getLineVrocCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVrocCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, volume: 100 },
      { x: NaN, volume: 200 },
      { x: 1, volume: Infinity },
      { x: 2, volume: 300 },
    ];
    expect(getLineVrocCrossSigFinitePoints(data)).toEqual([
      { x: 0, volume: 100 },
      { x: 2, volume: 300 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, volume: 1 },
      null as unknown as ChartLineVrocCrossSigPoint,
      { x: 1, volume: 2 },
    ];
    expect(getLineVrocCrossSigFinitePoints(data)).toEqual([
      { x: 0, volume: 1 },
      { x: 1, volume: 2 },
    ]);
  });
});

describe('normalizeLineVrocCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVrocCrossSigLength(0, 12)).toBe(12);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVrocCrossSigLength('x', 12)).toBe(12);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVrocCrossSigLength(14.7, 12)).toBe(14);
  });
});

describe('applyLineVrocCrossSigEma', () => {
  it('matches the bit-exact CONST K via the precision fix', () => {
    for (const K of [0, 1, 5, 17]) {
      for (const n of [2, 3, 6, 9]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineVrocCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineVrocCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineVrocCrossSig(null)).toEqual({
      vroc: [],
      signal: [],
    });
  });

  it('CONST V > 0 -> VROC = 0 and signal = 0 across multiple V', () => {
    for (const V of [1, 50, 100, 1000]) {
      const data = constSeries(40, V);
      const { vroc, signal } = computeLineVrocCrossSig(data, {
        length: 12,
        signalLength: 9,
      });
      const vrocWarmup = 12;
      const sigWarmup = vrocWarmup + 9 - 1;
      for (let i = vrocWarmup; i < data.length; i += 1) {
        expect(vroc[i]).toBe(0);
      }
      for (let i = sigWarmup; i < data.length; i += 1) {
        expect(signal[i]).toBe(0);
      }
    }
  });

  it('CONST V = 0 -> VROC = null and signal = null', () => {
    const data = constSeries(40, 0);
    const { vroc, signal } = computeLineVrocCrossSig(data, {
      length: 12,
      signalLength: 9,
    });
    for (let i = 12; i < data.length; i += 1) {
      expect(vroc[i]).toBeNull();
      expect(signal[i]).toBeNull();
    }
  });

  it('falls back to default length and signalLength', () => {
    const data = constSeries(40, 5);
    const { vroc } = computeLineVrocCrossSig(data);
    expect(vroc[12]).toBe(0);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(20, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVrocCrossSig(data, { length: 12, signalLength: 9 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineVrocCrossSigRegime', () => {
  it('returns bullish when vroc > signal', () => {
    expect(classifyLineVrocCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when vroc < signal', () => {
    expect(classifyLineVrocCrossSigRegime(0, 1)).toBe('bearish');
  });
  it('returns neutral when vroc == signal', () => {
    expect(classifyLineVrocCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineVrocCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineVrocCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineVrocCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVrocCrossSigPoint[] = [
      { x: 0, volume: 1 },
      { x: 1, volume: 1 },
      { x: 2, volume: 1 },
    ];
    const vroc = [-1, 1, 1];
    const signal = [0, 0, 0];
    expect(
      detectLineVrocCrossSigCrosses(series, vroc, signal),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVrocCrossSigPoint[] = [
      { x: 0, volume: 1 },
      { x: 1, volume: 1 },
      { x: 2, volume: 1 },
    ];
    const vroc = [1, -1, -1];
    const signal = [0, 0, 0];
    expect(
      detectLineVrocCrossSigCrosses(series, vroc, signal),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null vroc or signal', () => {
    const series: ChartLineVrocCrossSigPoint[] = [
      { x: 0, volume: 1 },
      { x: 1, volume: 1 },
    ];
    expect(
      detectLineVrocCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineVrocCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVrocCrossSig(constSeries(5, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVrocCrossSig(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length and signalLength', () => {
    const res = runLineVrocCrossSig(constSeries(60, 5));
    expect(res.length).toBe(12);
    expect(res.signalLength).toBe(9);
  });

  it('accepts custom length and signalLength', () => {
    const res = runLineVrocCrossSig(constSeries(60, 5), {
      length: 20,
      signalLength: 5,
    });
    expect(res.length).toBe(20);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineVrocCrossSig([
      { x: 2, volume: 5 },
      { x: 0, volume: 5 },
      { x: 1, volume: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST V > 0 -> regime neutral after warmup and zero crosses', () => {
    const res = runLineVrocCrossSig(constSeries(60, 100));
    const sigWarmup = 12 + 9 - 1;
    for (let i = sigWarmup; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('CONST V = 0 -> regime none everywhere', () => {
    const res = runLineVrocCrossSig(constSeries(60, 0));
    expect(res.noneCount).toBe(60);
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineVrocCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVrocCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.volumePath).toBe('');
    expect(lo.vrocPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVrocCrossSigLayout({
      data: linearSeries(60, 100, 5),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack volume above osc', () => {
    const lo = computeLineVrocCrossSigLayout({
      data: linearSeries(60, 100, 5),
    });
    expect(lo.volumeTop).toBeLessThan(lo.volumeBottom);
    expect(lo.volumeBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero in the osc axis sits between top and bottom', () => {
    const lo = computeLineVrocCrossSigLayout({
      data: linearSeries(60, 100, 5),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders volume and vroc paths', () => {
    const lo = computeLineVrocCrossSigLayout({
      data: linearSeries(60, 100, 5),
      length: 12,
      signalLength: 9,
    });
    expect(lo.volumePath).toMatch(/^M\s/);
    expect(lo.vrocPath).toMatch(/^M\s/);
  });
});

describe('describeLineVrocCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVrocCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVrocCrossSigChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions both lengths', () => {
    const text = describeLineVrocCrossSigChart(linearSeries(12, 1, 1), {
      length: 14,
      signalLength: 7,
    });
    expect(text).toContain('14');
    expect(text).toContain('7');
  });
});

describe('<ChartLineVrocCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVrocCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region role when data is present', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVrocCrossSig ref={ref} data={linearSeries(60, 100, 5)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / signalLength / total points', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        length={12}
        signalLength={9}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('12');
    expect(root?.dataset.signalLength).toBe('9');
    expect(root?.dataset.totalPoints).toBe('60');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={constSeries(60, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders an aria description', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-vroc-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-vroc-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
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
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
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
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        length={12}
        signalLength={9}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-badge"]',
      )?.textContent,
    ).toContain('length 12');
  });

  it('hides zero line when showZeroLine=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-zeroline"]',
      ),
    ).toBeNull();
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-vroc-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders vroc and signal paths', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-vroc-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('renders the volume path', () => {
    const { container } = render(
      <ChartLineVrocCrossSig data={linearSeries(60, 100, 5)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-volume-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-vroc-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineVrocCrossSig
        data={linearSeries(60, 100, 5)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('VROC Cross Signal integration', () => {
  it('CONST V > 0 -> VROC = 0 / signal = 0 bit-exact across multiple V', () => {
    for (const V of [1, 50, 100, 1000, 12345]) {
      const res = runLineVrocCrossSig(constSeries(60, V), {
        length: 12,
        signalLength: 9,
      });
      const sigWarmup = 12 + 9 - 1;
      for (let i = sigWarmup; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.vroc).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
