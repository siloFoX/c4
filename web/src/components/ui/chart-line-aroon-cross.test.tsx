import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineAroonCross,
  classifyLineAroonCrossRegime,
  computeLineAroonCross,
  computeLineAroonCrossLayout,
  describeLineAroonCrossChart,
  detectLineAroonCrossCrosses,
  getLineAroonCrossFinitePoints,
  normalizeLineAroonCrossLength,
  runLineAroonCross,
  type ChartLineAroonCrossPoint,
} from './chart-line-aroon-cross';

const constSeries = (n: number, K: number): ChartLineAroonCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearUpSeries = (n: number): ChartLineAroonCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: i }));

const linearDownSeries = (n: number): ChartLineAroonCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: n - i }));

describe('getLineAroonCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineAroonCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineAroonCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineAroonCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineAroonCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineAroonCrossLength', () => {
  it('returns fallback when length is below 1', () => {
    expect(normalizeLineAroonCrossLength(0, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineAroonCrossLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineAroonCrossLength(20.9, 14)).toBe(20);
  });
});

describe('computeLineAroonCross', () => {
  it('handles null series', () => {
    expect(computeLineAroonCross(null)).toEqual({
      up: [],
      down: [],
    });
  });

  it('CONST K -> Aroon Up = Aroon Down = 100 (tie-break newest)', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineAroonCross(data);
      for (let i = 14; i < data.length; i += 1) {
        expect(ch.up[i]).toBe(100);
        expect(ch.down[i]).toBe(100);
      }
    }
  });

  it('LINEAR UP -> Aroon Up = 100, Aroon Down = 0', () => {
    const data = linearUpSeries(40);
    const ch = computeLineAroonCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.up[i]).toBe(100);
      expect(ch.down[i]).toBe(0);
    }
  });

  it('LINEAR DOWN -> Aroon Up = 0, Aroon Down = 100', () => {
    const data = linearDownSeries(40);
    const ch = computeLineAroonCross(data);
    for (let i = 14; i < data.length; i += 1) {
      expect(ch.up[i]).toBe(0);
      expect(ch.down[i]).toBe(100);
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineAroonCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('classifyLineAroonCrossRegime', () => {
  it('returns bullish when up > down', () => {
    expect(classifyLineAroonCrossRegime(60, 40)).toBe('bullish');
  });
  it('returns bearish when up < down', () => {
    expect(classifyLineAroonCrossRegime(40, 60)).toBe('bearish');
  });
  it('returns neutral when up == down', () => {
    expect(classifyLineAroonCrossRegime(50, 50)).toBe('neutral');
  });
  it('returns none when either is null', () => {
    expect(classifyLineAroonCrossRegime(null, 50)).toBe('none');
    expect(classifyLineAroonCrossRegime(50, null)).toBe('none');
  });
});

describe('detectLineAroonCrossCrosses', () => {
  it('flags bullish crosses', () => {
    const series: ChartLineAroonCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const up = [10, 60, 60];
    const down = [50, 40, 40];
    expect(detectLineAroonCrossCrosses(series, up, down)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish crosses', () => {
    const series: ChartLineAroonCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
      { x: 2, close: 1 },
    ];
    const up = [60, 30, 30];
    const down = [40, 70, 70];
    expect(detectLineAroonCrossCrosses(series, up, down)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineAroonCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineAroonCrossCrosses(series, [null, 50], [null, 40]),
    ).toEqual([]);
  });
});

describe('runLineAroonCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineAroonCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineAroonCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length', () => {
    const res = runLineAroonCross(constSeries(40, 5));
    expect(res.length).toBe(14);
  });

  it('accepts custom length', () => {
    const res = runLineAroonCross(constSeries(40, 5), { length: 20 });
    expect(res.length).toBe(20);
  });

  it('sorts series by x', () => {
    const res = runLineAroonCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineAroonCross(constSeries(40, 7));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineAroonCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> regime bearish after warmup', () => {
    const res = runLineAroonCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});

describe('computeLineAroonCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineAroonCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.upPath).toBe('');
    expect(lo.downPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineAroonCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineAroonCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineAroonCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('renders price, up, and down paths', () => {
    const lo = computeLineAroonCrossLayout({
      data: linearUpSeries(40),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.upPath).toMatch(/^M\s/);
    expect(lo.downPath).toMatch(/^M\s/);
  });
});

describe('describeLineAroonCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineAroonCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineAroonCrossChart(linearUpSeries(12));
    expect(text).toContain('12 bars');
  });

  it('mentions the length', () => {
    const text = describeLineAroonCrossChart(linearUpSeries(12), {
      length: 25,
    });
    expect(text).toContain('25');
  });
});

describe('<ChartLineAroonCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineAroonCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-aroon-cross"]'),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAroonCross ref={ref} data={linearUpSeries(40)} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes lengths and total points as data attributes', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineAroonCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-aroon-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders three legend items', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-aroon-cross-legend"] button',
    );
    expect(buttons.length).toBe(3);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="up"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        hiddenSeries={['down']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="down"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'down',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-aroon-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders up and down paths', () => {
    const { container } = render(
      <ChartLineAroonCross data={linearUpSeries(40)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-up-path"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-down-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-aroon-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides down when defaultHiddenSeries includes down', () => {
    const { container } = render(
      <ChartLineAroonCross
        data={linearUpSeries(40)}
        defaultHiddenSeries={['down']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="down"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Aroon Cross integration', () => {
  it('CONST K -> Aroon Up = Aroon Down = 100 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineAroonCross(constSeries(40, K));
      for (let i = 14; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.aroonUp).toBe(100);
        expect(res.samples[i]?.aroonDown).toBe(100);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> Aroon Up = 100, Aroon Down = 0 bit-exact, regime bullish', () => {
    const res = runLineAroonCross(linearUpSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.aroonUp).toBe(100);
      expect(res.samples[i]?.aroonDown).toBe(0);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });

  it('LINEAR DOWN -> Aroon Up = 0, Aroon Down = 100 bit-exact, regime bearish', () => {
    const res = runLineAroonCross(linearDownSeries(40));
    for (let i = 14; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.aroonUp).toBe(0);
      expect(res.samples[i]?.aroonDown).toBe(100);
      expect(res.samples[i]?.regime).toBe('bearish');
    }
  });
});
