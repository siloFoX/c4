import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineRsiOversoldCross,
  applyLineRsiOversoldCrossWilder,
  classifyLineRsiOversoldCrossRegime,
  computeLineRsiOversoldCross,
  computeLineRsiOversoldCrossLayout,
  describeLineRsiOversoldCrossChart,
  detectLineRsiOversoldCrossCrosses,
  getLineRsiOversoldCrossFinitePoints,
  normalizeLineRsiOversoldCrossLength,
  normalizeLineRsiOversoldCrossThreshold,
  runLineRsiOversoldCross,
  type ChartLineRsiOversoldCrossPoint,
} from './chart-line-rsi-oversold-cross';

const constSeries = (
  n: number,
  K: number,
): ChartLineRsiOversoldCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineRsiOversoldCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i + 1 }));

const linearDownSeries = (n: number): ChartLineRsiOversoldCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineRsiOversoldCrossFinitePoints', () => {
  it('returns empty for null', () => {
    expect(getLineRsiOversoldCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineRsiOversoldCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineRsiOversoldCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineRsiOversoldCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineRsiOversoldCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineRsiOversoldCrossLength(0, 14)).toBe(14);
  });
  it('returns fallback when length is non-number', () => {
    expect(normalizeLineRsiOversoldCrossLength('x', 14)).toBe(14);
  });
  it('returns floored length when acceptable', () => {
    expect(normalizeLineRsiOversoldCrossLength(20.9, 14)).toBe(20);
  });
});

describe('normalizeLineRsiOversoldCrossThreshold', () => {
  it('accepts value in [0, 100]', () => {
    expect(normalizeLineRsiOversoldCrossThreshold(30, 30)).toBe(30);
    expect(normalizeLineRsiOversoldCrossThreshold(0, 30)).toBe(0);
    expect(normalizeLineRsiOversoldCrossThreshold(100, 30)).toBe(100);
  });
  it('returns fallback for out-of-range', () => {
    expect(normalizeLineRsiOversoldCrossThreshold(-1, 30)).toBe(30);
    expect(normalizeLineRsiOversoldCrossThreshold(101, 30)).toBe(30);
  });
});

describe('applyLineRsiOversoldCrossWilder', () => {
  it('matches CONST K via short-circuit', () => {
    for (const K of [0, 1, 5]) {
      const v = new Array<number>(20).fill(K);
      const out = applyLineRsiOversoldCrossWilder(v, 14);
      for (let i = 13; i < v.length; i += 1) {
        expect(out[i]).toBe(K);
      }
    }
  });
});

describe('computeLineRsiOversoldCross', () => {
  it('handles null series', () => {
    expect(computeLineRsiOversoldCross(null)).toEqual({ rsi: [] });
  });

  it('CONST K -> rsi = 50 (neutral fallback)', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineRsiOversoldCross(data);
      for (let i = 14; i < data.length; i += 1) {
        expect(ch.rsi[i]).toBe(50);
      }
    }
  });

  it('LINEAR UP -> rsi = 100 (all gains)', () => {
    const data = linearUpSeries(40);
    const ch = computeLineRsiOversoldCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.rsi[i]).toBe(100);
    }
  });

  it('LINEAR DOWN -> rsi = 0 (all losses)', () => {
    const data = linearDownSeries(40);
    const ch = computeLineRsiOversoldCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.rsi[i]).toBe(0);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineRsiOversoldCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineRsiOversoldCrossRegime', () => {
  it('returns bearish when rsi < threshold', () => {
    expect(classifyLineRsiOversoldCrossRegime(20, 30)).toBe('bearish');
  });
  it('returns neutral when rsi >= threshold', () => {
    expect(classifyLineRsiOversoldCrossRegime(30, 30)).toBe('neutral');
    expect(classifyLineRsiOversoldCrossRegime(50, 30)).toBe('neutral');
  });
  it('returns none when rsi is null', () => {
    expect(classifyLineRsiOversoldCrossRegime(null, 30)).toBe('none');
  });
});

describe('detectLineRsiOversoldCrossCrosses', () => {
  it('flags bullish (exit upward above threshold)', () => {
    const series: ChartLineRsiOversoldCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineRsiOversoldCrossCrosses(series, [25, 35], 30)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish (entry downward below threshold)', () => {
    const series: ChartLineRsiOversoldCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineRsiOversoldCrossCrosses(series, [35, 25], 30)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineRsiOversoldCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineRsiOversoldCrossCrosses(series, [null, 25], 30),
    ).toEqual([]);
  });

  it('no cross when RSI stays above threshold', () => {
    const series: ChartLineRsiOversoldCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(detectLineRsiOversoldCrossCrosses(series, [50, 60], 30)).toEqual(
      [],
    );
  });
});

describe('runLineRsiOversoldCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineRsiOversoldCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineRsiOversoldCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects defaults', () => {
    const res = runLineRsiOversoldCross(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.threshold).toBe(30);
  });

  it('accepts custom threshold', () => {
    const res = runLineRsiOversoldCross(constSeries(40, 5), {
      length: 21,
      threshold: 25,
    });
    expect(res.length).toBe(21);
    expect(res.threshold).toBe(25);
  });

  it('sorts series by x', () => {
    const res = runLineRsiOversoldCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineRsiOversoldCross(constSeries(40, 7));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.exitCount).toBe(0);
    expect(res.entryCount).toBe(0);
  });

  it('LINEAR DOWN -> regime bearish (RSI=0 < 30)', () => {
    const res = runLineRsiOversoldCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineRsiOversoldCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineRsiOversoldCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.rsiPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineRsiOversoldCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineRsiOversoldCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineRsiOversoldCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('threshold (30) below mid (50) in screen y', () => {
    const lo = computeLineRsiOversoldCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.thresholdY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.thresholdY).toBeLessThanOrEqual(lo.oscBottom);
    expect(lo.midY).toBeLessThan(lo.thresholdY);
  });

  it('renders price and rsi paths', () => {
    const lo = computeLineRsiOversoldCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.rsiPath).toMatch(/^M\s/);
  });
});

describe('describeLineRsiOversoldCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineRsiOversoldCrossChart([])).toBe('No data');
  });
  it('mentions the bar count', () => {
    const text = describeLineRsiOversoldCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });
  it('mentions threshold', () => {
    const text = describeLineRsiOversoldCrossChart(linearUpSeries(12), {
      length: 21,
      threshold: 25,
    });
    expect(text).toContain('21');
    expect(text).toContain('25');
  });
});

describe('<ChartLineRsiOversoldCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineRsiOversoldCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRsiOversoldCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / threshold / total points as data attributes', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-oversold-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.threshold).toBe('30');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-oversold-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-rsi-oversold-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-rsi-oversold-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="rsi"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        hiddenSeries={['rsi']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="rsi"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'rsi',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-badge"]',
      )?.textContent,
    ).toContain('threshold 30');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rsi-oversold-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders rsi path', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-rsi-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rsi-oversold-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides rsi when defaultHiddenSeries includes rsi', () => {
    const { container } = render(
      <ChartLineRsiOversoldCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['rsi']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="rsi"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('RSI Oversold Cross integration', () => {
  it('CONST K -> rsi=50 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineRsiOversoldCross(constSeries(40, K));
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.rsi).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR DOWN -> rsi=0 bit-exact, regime bearish (oversold)', () => {
    const res = runLineRsiOversoldCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.rsi).toBe(0);
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});
