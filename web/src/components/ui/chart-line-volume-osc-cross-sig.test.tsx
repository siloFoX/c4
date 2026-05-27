import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineVolumeOscCrossSig,
  applyLineVolumeOscCrossSigEma,
  classifyLineVolumeOscCrossSigRegime,
  computeLineVolumeOscCrossSig,
  computeLineVolumeOscCrossSigLayout,
  describeLineVolumeOscCrossSigChart,
  detectLineVolumeOscCrossSigCrosses,
  getLineVolumeOscCrossSigFinitePoints,
  normalizeLineVolumeOscCrossSigLength,
  runLineVolumeOscCrossSig,
  type ChartLineVolumeOscCrossSigPoint,
} from './chart-line-volume-osc-cross-sig';

const constSeries = (n: number, K: number): ChartLineVolumeOscCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineVolumeOscCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineVolumeOscCrossSigPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineVolumeOscCrossSigFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineVolumeOscCrossSigFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineVolumeOscCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineVolumeOscCrossSigPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineVolumeOscCrossSigFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineVolumeOscCrossSigLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineVolumeOscCrossSigLength(0, 5)).toBe(5);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineVolumeOscCrossSigLength('x', 5)).toBe(5);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineVolumeOscCrossSigLength(7.7, 5)).toBe(7);
  });
});

describe('applyLineVolumeOscCrossSigEma', () => {
  it('matches CONST K via precision fix', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      for (const n of [3, 5, 10]) {
        const v = new Array<number>(20).fill(K);
        const out = applyLineVolumeOscCrossSigEma(v, n);
        for (let i = n - 1; i < v.length; i += 1) {
          expect(out[i]).toBe(K);
        }
      }
    }
  });
});

describe('computeLineVolumeOscCrossSig', () => {
  it('handles null series', () => {
    expect(computeLineVolumeOscCrossSig(null)).toEqual({
      volOsc: [],
      signal: [],
    });
  });

  it('CONST K > 0 -> volOsc = 0, signal = 0', () => {
    for (const K of [1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineVolumeOscCrossSig(data);
      for (let i = 12; i < data.length; i += 1) {
        expect(ch.volOsc[i]).toBe(0);
        expect(ch.signal[i]).toBe(0);
      }
    }
  });

  it('CONST K = 0 -> volOsc=0 via divide-by-zero guard, signal=0', () => {
    const data = constSeries(40, 0);
    const ch = computeLineVolumeOscCrossSig(data);
    for (let i = 12; i < data.length; i += 1) {
      expect(ch.volOsc[i]).toBe(0);
      expect(ch.signal[i]).toBe(0);
    }
  });

  it('LINEAR UP -> volOsc > 0 and signal > 0', () => {
    const data = linearUpSeries(40);
    const ch = computeLineVolumeOscCrossSig(data);
    for (let i = 14; i < data.length; i += 1) {
      const v = ch.volOsc[i];
      const s = ch.signal[i];
      expect(v).not.toBeNull();
      expect(s).not.toBeNull();
      expect(v!).toBeGreaterThan(0);
      expect(s!).toBeGreaterThan(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineVolumeOscCrossSig(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineVolumeOscCrossSigRegime', () => {
  it('returns bullish when volOsc > signal', () => {
    expect(classifyLineVolumeOscCrossSigRegime(2, 1)).toBe('bullish');
  });
  it('returns bearish when volOsc < signal', () => {
    expect(classifyLineVolumeOscCrossSigRegime(1, 2)).toBe('bearish');
  });
  it('returns neutral when equal', () => {
    expect(classifyLineVolumeOscCrossSigRegime(1, 1)).toBe('neutral');
  });
  it('returns none when either null', () => {
    expect(classifyLineVolumeOscCrossSigRegime(null, 1)).toBe('none');
    expect(classifyLineVolumeOscCrossSigRegime(1, null)).toBe('none');
  });
});

describe('detectLineVolumeOscCrossSigCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineVolumeOscCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVolumeOscCrossSigCrosses(series, [-1, 1], [0, 0]),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineVolumeOscCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVolumeOscCrossSigCrosses(series, [1, -1], [0, 0]),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineVolumeOscCrossSigPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineVolumeOscCrossSigCrosses(series, [null, 1], [null, 0]),
    ).toEqual([]);
  });
});

describe('runLineVolumeOscCrossSig', () => {
  it('returns ok=false for short series', () => {
    const res = runLineVolumeOscCrossSig(constSeries(12, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineVolumeOscCrossSig(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects default lengths', () => {
    const res = runLineVolumeOscCrossSig(constSeries(40, 5));
    expect(res.shortLength).toBe(5);
    expect(res.longLength).toBe(10);
    expect(res.signalLength).toBe(4);
  });

  it('accepts custom lengths', () => {
    const res = runLineVolumeOscCrossSig(constSeries(40, 5), {
      shortLength: 7,
      longLength: 14,
      signalLength: 5,
    });
    expect(res.shortLength).toBe(7);
    expect(res.longLength).toBe(14);
    expect(res.signalLength).toBe(5);
  });

  it('sorts series by x', () => {
    const res = runLineVolumeOscCrossSig([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineVolumeOscCrossSig(constSeries(40, 7));
    for (let i = 12; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineVolumeOscCrossSigLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineVolumeOscCrossSigLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.volOscPath).toBe('');
    expect(lo.signalPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineVolumeOscCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineVolumeOscCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('zero line falls within osc panel', () => {
    const lo = computeLineVolumeOscCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.zeroY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.zeroY).toBeLessThanOrEqual(lo.oscBottom);
  });

  it('renders all paths', () => {
    const lo = computeLineVolumeOscCrossSigLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.volOscPath).toMatch(/^M\s/);
    expect(lo.signalPath).toMatch(/^M\s/);
  });
});

describe('describeLineVolumeOscCrossSigChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineVolumeOscCrossSigChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineVolumeOscCrossSigChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions all lengths', () => {
    const text = describeLineVolumeOscCrossSigChart(linearUpSeries(12), {
      shortLength: 7,
      longLength: 14,
      signalLength: 5,
    });
    expect(text).toContain('7');
    expect(text).toContain('14');
    expect(text).toContain('5');
  });
});

describe('<ChartLineVolumeOscCrossSig />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineVolumeOscCrossSig data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineVolumeOscCrossSig ref={ref} data={linearUpSeries(40)} />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths / total points as data attributes', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.dataset.shortLength).toBe('5');
    expect(root?.dataset.longLength).toBe('10');
    expect(root?.dataset.signalLength).toBe('4');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross-sig"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-volume-osc-cross-sig-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-volume-osc-cross-sig-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="volOsc"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
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
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-badge"]',
      )?.textContent,
    ).toContain('short 5');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-grid"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-volume-osc-cross-sig"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders volOsc and signal paths', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-vol-osc-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-signal-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides signal when defaultHiddenSeries includes signal', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig
        data={linearUpSeries(40)}
        defaultHiddenSeries={['signal']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zero line', () => {
    const { container } = render(
      <ChartLineVolumeOscCrossSig data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-volume-osc-cross-sig-zero-line"]',
      ),
    ).not.toBeNull();
  });
});

describe('Volume Oscillator Cross Signal integration', () => {
  it('CONST K -> volOsc=signal=0 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineVolumeOscCrossSig(constSeries(40, K));
      for (let i = 12; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.volOsc).toBe(0);
        expect(res.samples[i]?.signal).toBe(0);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });
});
