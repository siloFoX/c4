import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAdxCrossExtreme,
  applyLineAdxCrossExtremeWilder,
  classifyLineAdxCrossExtremeRegime,
  computeLineAdxCrossExtreme,
  computeLineAdxCrossExtremeLayout,
  describeLineAdxCrossExtremeChart,
  detectLineAdxCrossExtremeCrosses,
  getLineAdxCrossExtremeFinitePoints,
  normalizeLineAdxCrossExtremeLength,
  normalizeLineAdxCrossExtremeThreshold,
  runLineAdxCrossExtreme,
  type ChartLineAdxCrossExtremePoint,
} from './chart-line-adx-cross-extreme';

const constSeries = (n: number, K: number): ChartLineAdxCrossExtremePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineAdxCrossExtremePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineAdxCrossExtremePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineAdxCrossExtremeFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAdxCrossExtremeFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAdxCrossExtremeFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAdxCrossExtremePoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAdxCrossExtremeFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAdxCrossExtremeLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAdxCrossExtremeLength(0, 14)).toBe(14);
  });
  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAdxCrossExtremeLength('x', 14)).toBe(14);
  });
  it('returns floored length when acceptable', () => {
    expect(normalizeLineAdxCrossExtremeLength(20.9, 14)).toBe(20);
  });
});

describe('normalizeLineAdxCrossExtremeThreshold', () => {
  it('accepts value in [0, 100]', () => {
    expect(normalizeLineAdxCrossExtremeThreshold(40, 50)).toBe(40);
  });
  it('returns fallback for value outside [0, 100]', () => {
    expect(normalizeLineAdxCrossExtremeThreshold(-1, 50)).toBe(50);
    expect(normalizeLineAdxCrossExtremeThreshold(101, 50)).toBe(50);
  });
});

describe('applyLineAdxCrossExtremeWilder', () => {
  it('matches CONST K via short-circuit', () => {
    for (const K of [0, 1, 5, 17]) {
      const v = new Array<number>(20).fill(K);
      const out = applyLineAdxCrossExtremeWilder(v, 14);
      for (let i = 13; i < v.length; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineAdxCrossExtreme', () => {
  it('handles null series', () => {
    expect(computeLineAdxCrossExtreme(null)).toEqual({ adx: [] });
  });

  it('CONST K -> adx = 0', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(60, K);
      const ch = computeLineAdxCrossExtreme(data);
      for (let i = 30; i < data.length; i += 1) {
        expect(ch.adx[i]).toBe(0);
      }
    }
  });

  it('LINEAR UP -> adx eventually approaches 100', () => {
    const data = linearUpSeries(60);
    const ch = computeLineAdxCrossExtreme(data);
    const last = ch.adx[59];
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThan(50);
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAdxCrossExtreme(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAdxCrossExtremeRegime', () => {
  it('returns bullish when adx >= upper', () => {
    expect(classifyLineAdxCrossExtremeRegime(50, 40, 20)).toBe('bullish');
    expect(classifyLineAdxCrossExtremeRegime(40, 40, 20)).toBe('bullish');
  });
  it('returns bearish when adx < lower', () => {
    expect(classifyLineAdxCrossExtremeRegime(10, 40, 20)).toBe('bearish');
  });
  it('returns neutral when adx is between thresholds', () => {
    expect(classifyLineAdxCrossExtremeRegime(30, 40, 20)).toBe('neutral');
  });
  it('returns none when adx is null', () => {
    expect(classifyLineAdxCrossExtremeRegime(null, 40, 20)).toBe('none');
  });
});

describe('detectLineAdxCrossExtremeCrosses', () => {
  it('flags bullish crosses up above upper', () => {
    const series: ChartLineAdxCrossExtremePoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAdxCrossExtremeCrosses(series, [35, 45], 40, 20),
    ).toEqual([{ index: 1, x: 1, kind: 'bullish' }]);
  });

  it('flags bearish crosses down below lower', () => {
    const series: ChartLineAdxCrossExtremePoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAdxCrossExtremeCrosses(series, [25, 15], 40, 20),
    ).toEqual([{ index: 1, x: 1, kind: 'bearish' }]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineAdxCrossExtremePoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAdxCrossExtremeCrosses(series, [null, 45], 40, 20),
    ).toEqual([]);
  });

  it('does not flag when adx stays in moderate range', () => {
    const series: ChartLineAdxCrossExtremePoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAdxCrossExtremeCrosses(series, [25, 30], 40, 20),
    ).toEqual([]);
  });
});

describe('runLineAdxCrossExtreme', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAdxCrossExtreme(constSeries(20, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAdxCrossExtreme(constSeries(60, 5));
    expect(res.ok).toBe(true);
  });

  it('respects defaults', () => {
    const res = runLineAdxCrossExtreme(constSeries(60, 5));
    expect(res.length).toBe(14);
    expect(res.upperThreshold).toBe(40);
    expect(res.lowerThreshold).toBe(20);
  });

  it('accepts custom thresholds', () => {
    const res = runLineAdxCrossExtreme(constSeries(60, 5), {
      length: 21,
      upperThreshold: 50,
      lowerThreshold: 25,
    });
    expect(res.length).toBe(21);
    expect(res.upperThreshold).toBe(50);
    expect(res.lowerThreshold).toBe(25);
  });

  it('sorts series by x', () => {
    const res = runLineAdxCrossExtreme([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime bearish (weak) after warmup, 0 crosses', () => {
    const res = runLineAdxCrossExtreme(constSeries(60, 7));
    for (let i = 30; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
    expect(res.crosses.length).toBe(0);
  });
});

describe('computeLineAdxCrossExtremeLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAdxCrossExtremeLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.adxPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAdxCrossExtremeLayout({
      data: linearUpSeries(60),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAdxCrossExtremeLayout({
      data: linearUpSeries(60),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineAdxCrossExtremeLayout({
      data: linearUpSeries(60),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('upper / mid / lower bands within osc panel', () => {
    const lo = computeLineAdxCrossExtremeLayout({
      data: linearUpSeries(60),
    });
    expect(lo.upperY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.lowerY).toBeLessThanOrEqual(lo.oscBottom);
    // SVG y grows downward: value 50 (midY) maps higher (smaller y) than
    // value 40 (upperY) which is higher than value 20 (lowerY).
    expect(lo.midY).toBeLessThan(lo.upperY);
    expect(lo.upperY).toBeLessThan(lo.lowerY);
  });

  it('renders price and adx paths', () => {
    const lo = computeLineAdxCrossExtremeLayout({
      data: linearUpSeries(60),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.adxPath).toMatch(/^M\s/);
  });
});

describe('describeLineAdxCrossExtremeChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAdxCrossExtremeChart([])).toBe('No data');
  });
  it('mentions the bar count', () => {
    const text = describeLineAdxCrossExtremeChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });
  it('mentions thresholds', () => {
    const text = describeLineAdxCrossExtremeChart(linearUpSeries(12), {
      length: 14,
      upperThreshold: 50,
      lowerThreshold: 25,
    });
    expect(text).toContain('50');
    expect(text).toContain('25');
  });
});

describe('<ChartLineAdxCrossExtreme />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAdxCrossExtreme data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-cross-extreme"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAdxCrossExtreme ref={ref} data={linearUpSeries(60)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes thresholds and length as data attributes', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross-extreme"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.upperThreshold).toBe('40');
    expect(root?.dataset.lowerThreshold).toBe('20');
    expect(root?.dataset.totalPoints).toBe('60');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={constSeries(60, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross-extreme"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-cross-extreme-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-adx-cross-extreme-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="adx"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        hiddenSeries={['adx']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="adx"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'adx',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-badge"]',
      )?.textContent,
    ).toContain('upper 40');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-cross-extreme"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders adx path', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme data={linearUpSeries(60)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-adx-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-cross-extreme-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides adx when defaultHiddenSeries includes adx', () => {
    const { container } = render(
      <ChartLineAdxCrossExtreme
        data={linearUpSeries(60)}
        defaultHiddenSeries={['adx']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="adx"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ADX Cross Extreme integration', () => {
  it('CONST K -> adx=0 bit-exact, regime bearish (weak), 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAdxCrossExtreme(constSeries(60, K));
      for (let i = 30; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.adx).toBe(0);
        expect(res.samples[i]?.regime).toBe('bearish');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> adx eventually > 40, regime bullish (strong)', () => {
    const res = runLineAdxCrossExtreme(linearUpSeries(60));
    const last = res.samples[59];
    expect(last?.adx).not.toBeNull();
    expect(last?.adx!).toBeGreaterThan(40);
    expect(last?.regime).toBe('bullish');
  });

  it('LINEAR DOWN -> adx eventually > 40, regime bullish (strong trend)', () => {
    const res = runLineAdxCrossExtreme(linearDownSeries(60));
    const last = res.samples[59];
    expect(last?.adx).not.toBeNull();
    expect(last?.adx!).toBeGreaterThan(40);
    expect(last?.regime).toBe('bullish');
  });
});
