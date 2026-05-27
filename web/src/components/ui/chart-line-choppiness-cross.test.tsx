import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineChoppinessCross,
  classifyLineChoppinessCrossRegime,
  computeLineChoppinessCross,
  computeLineChoppinessCrossLayout,
  describeLineChoppinessCrossChart,
  detectLineChoppinessCrossCrosses,
  getLineChoppinessCrossFinitePoints,
  normalizeLineChoppinessCrossLength,
  normalizeLineChoppinessCrossThreshold,
  runLineChoppinessCross,
  type ChartLineChoppinessCrossPoint,
} from './chart-line-choppiness-cross';

const constSeries = (n: number, K: number): ChartLineChoppinessCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: K }));

const linearSeries = (
  n: number,
  start: number,
  step: number,
): ChartLineChoppinessCrossPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, close: start + step * i }));

describe('getLineChoppinessCrossFinitePoints', () => {
  it('returns empty array for null input', () => {
    expect(getLineChoppinessCrossFinitePoints(null)).toEqual([]);
  });

  it('drops NaN and infinite values', () => {
    const data = [
      { x: 0, close: 10 },
      { x: NaN, close: 20 },
      { x: 1, close: Infinity },
      { x: 2, close: 30 },
    ];
    expect(getLineChoppinessCrossFinitePoints(data)).toEqual([
      { x: 0, close: 10 },
      { x: 2, close: 30 },
    ]);
  });

  it('drops null entries inside the array', () => {
    const data = [
      { x: 0, close: 1 },
      null as unknown as ChartLineChoppinessCrossPoint,
      { x: 1, close: 2 },
    ];
    expect(getLineChoppinessCrossFinitePoints(data)).toEqual([
      { x: 0, close: 1 },
      { x: 1, close: 2 },
    ]);
  });
});

describe('normalizeLineChoppinessCrossLength', () => {
  it('returns fallback when length is below 2', () => {
    expect(normalizeLineChoppinessCrossLength(1, 14)).toBe(14);
  });

  it('returns fallback when length is non-number', () => {
    expect(normalizeLineChoppinessCrossLength('x', 14)).toBe(14);
  });

  it('returns floored length when acceptable', () => {
    expect(normalizeLineChoppinessCrossLength(20.9, 14)).toBe(20);
  });
});

describe('normalizeLineChoppinessCrossThreshold', () => {
  it('accepts value in [0, 100]', () => {
    expect(normalizeLineChoppinessCrossThreshold(38.2, 50)).toBe(38.2);
    expect(normalizeLineChoppinessCrossThreshold(0, 50)).toBe(0);
    expect(normalizeLineChoppinessCrossThreshold(100, 50)).toBe(100);
  });

  it('returns fallback for value outside [0, 100]', () => {
    expect(normalizeLineChoppinessCrossThreshold(-1, 50)).toBe(50);
    expect(normalizeLineChoppinessCrossThreshold(101, 50)).toBe(50);
  });

  it('returns fallback for non-number', () => {
    expect(normalizeLineChoppinessCrossThreshold('x', 50)).toBe(50);
  });
});

describe('computeLineChoppinessCross', () => {
  it('handles null series', () => {
    expect(computeLineChoppinessCross(null)).toEqual({ ci: [] });
  });

  it('CONST close = K -> ci = 50 (neutral fallback)', () => {
    for (const K of [0, 1, 5, 17, 100]) {
      const data = constSeries(40, K);
      const ch = computeLineChoppinessCross(data);
      for (let i = 13; i < data.length; i += 1) {
        expect(ch.ci[i]).toBe(50);
      }
    }
  });

  it('does not mutate the input series', () => {
    const data = [...constSeries(40, 3)];
    const snapshot = JSON.stringify(data);
    computeLineChoppinessCross(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('LINEAR UP series produces low ci (trending)', () => {
    const data = linearSeries(40, 0, 1);
    const ch = computeLineChoppinessCross(data);
    for (let i = 13; i < data.length; i += 1) {
      const c = ch.ci[i];
      expect(c).not.toBeNull();
      expect(c!).toBeLessThan(50);
    }
  });
});

describe('classifyLineChoppinessCrossRegime', () => {
  it('returns bullish when ci < trendThreshold', () => {
    expect(classifyLineChoppinessCrossRegime(20, 38.2, 61.8)).toBe(
      'bullish',
    );
  });
  it('returns bearish when ci > chopThreshold', () => {
    expect(classifyLineChoppinessCrossRegime(80, 38.2, 61.8)).toBe(
      'bearish',
    );
  });
  it('returns neutral when ci is between thresholds', () => {
    expect(classifyLineChoppinessCrossRegime(50, 38.2, 61.8)).toBe(
      'neutral',
    );
  });
  it('returns none when ci is null', () => {
    expect(classifyLineChoppinessCrossRegime(null, 38.2, 61.8)).toBe(
      'none',
    );
  });
});

describe('detectLineChoppinessCrossCrosses', () => {
  it('flags bullish (trending) crosses below trendThreshold', () => {
    const series: ChartLineChoppinessCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const ci = [40, 30];
    expect(detectLineChoppinessCrossCrosses(series, ci, 38.2, 61.8)).toEqual([
      { index: 1, x: 1, kind: 'bullish' },
    ]);
  });

  it('flags bearish (ranging) crosses above chopThreshold', () => {
    const series: ChartLineChoppinessCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    const ci = [60, 70];
    expect(detectLineChoppinessCrossCrosses(series, ci, 38.2, 61.8)).toEqual([
      { index: 1, x: 1, kind: 'bearish' },
    ]);
  });

  it('skips bars with null values', () => {
    const series: ChartLineChoppinessCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineChoppinessCrossCrosses(series, [null, 20], 38.2, 61.8),
    ).toEqual([]);
  });

  it('does not flag when no threshold crossed', () => {
    const series: ChartLineChoppinessCrossPoint[] = [
      { x: 0, close: 1 },
      { x: 1, close: 1 },
    ];
    expect(
      detectLineChoppinessCrossCrosses(series, [45, 55], 38.2, 61.8),
    ).toEqual([]);
  });
});

describe('runLineChoppinessCross', () => {
  it('returns ok=false for short series', () => {
    const res = runLineChoppinessCross(constSeries(10, 5));
    expect(res.ok).toBe(false);
  });

  it('returns ok=true for long enough series', () => {
    const res = runLineChoppinessCross(constSeries(40, 5));
    expect(res.ok).toBe(true);
  });

  it('respects the default length and thresholds', () => {
    const res = runLineChoppinessCross(constSeries(40, 5));
    expect(res.length).toBe(14);
    expect(res.trendThreshold).toBe(38.2);
    expect(res.chopThreshold).toBe(61.8);
  });

  it('accepts custom length and thresholds', () => {
    const res = runLineChoppinessCross(constSeries(40, 5), {
      length: 20,
      trendThreshold: 30,
      chopThreshold: 70,
    });
    expect(res.length).toBe(20);
    expect(res.trendThreshold).toBe(30);
    expect(res.chopThreshold).toBe(70);
  });

  it('sorts series by x', () => {
    const res = runLineChoppinessCross([
      { x: 2, close: 5 },
      { x: 0, close: 5 },
      { x: 1, close: 5 },
    ]);
    expect(res.series.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it('CONST K -> regime neutral after warmup, 0 crosses', () => {
    const res = runLineChoppinessCross(constSeries(40, 7));
    for (let i = 13; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('neutral');
    }
    expect(res.crosses.length).toBe(0);
    expect(res.bullishCount).toBe(0);
    expect(res.bearishCount).toBe(0);
  });

  it('LINEAR UP -> regime bullish after warmup', () => {
    const res = runLineChoppinessCross(linearSeries(40, 0, 1));
    for (let i = 13; i < res.samples.length; i += 1) {
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});

describe('computeLineChoppinessCrossLayout', () => {
  it('returns ok=false for empty data', () => {
    const lo = computeLineChoppinessCrossLayout({ data: [] });
    expect(lo.ok).toBe(false);
    expect(lo.pricePath).toBe('');
    expect(lo.ciPath).toBe('');
    expect(lo.crossMarkers).toEqual([]);
  });

  it('returns ok=true when data is provided', () => {
    const lo = computeLineChoppinessCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.ok).toBe(true);
  });

  it('panel boundaries stack price above osc', () => {
    const lo = computeLineChoppinessCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.priceTop).toBeLessThan(lo.priceBottom);
    expect(lo.priceBottom).toBeLessThan(lo.oscTop);
    expect(lo.oscTop).toBeLessThan(lo.oscBottom);
  });

  it('osc scale is fixed to 0-100', () => {
    const lo = computeLineChoppinessCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.oscMin).toBe(0);
    expect(lo.oscMax).toBe(100);
  });

  it('trend / mid / chop bands fall within osc panel', () => {
    const lo = computeLineChoppinessCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.chopY).toBeGreaterThanOrEqual(lo.oscTop);
    expect(lo.trendY).toBeLessThanOrEqual(lo.oscBottom);
    expect(lo.midY).toBeGreaterThan(lo.chopY);
    expect(lo.midY).toBeLessThan(lo.trendY);
  });

  it('renders price and ci paths', () => {
    const lo = computeLineChoppinessCrossLayout({
      data: linearSeries(40, 100, 1),
    });
    expect(lo.pricePath).toMatch(/^M\s/);
    expect(lo.ciPath).toMatch(/^M\s/);
  });
});

describe('describeLineChoppinessCrossChart', () => {
  it('returns no-data sentinel when series is empty', () => {
    expect(describeLineChoppinessCrossChart([])).toBe('No data');
  });

  it('mentions the bar count', () => {
    const text = describeLineChoppinessCrossChart(linearSeries(12, 1, 1));
    expect(text).toContain('12 bars');
  });

  it('mentions the length and thresholds', () => {
    const text = describeLineChoppinessCrossChart(linearSeries(12, 1, 1), {
      length: 20,
      trendThreshold: 30,
      chopThreshold: 70,
    });
    expect(text).toContain('20');
    expect(text).toContain('30');
    expect(text).toContain('70');
  });
});

describe('<ChartLineChoppinessCross />', () => {
  it('renders an empty placeholder when data is empty', () => {
    const { container } = render(<ChartLineChoppinessCross data={[]} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-empty"]',
      ),
    ).not.toBeNull();
  });

  it('renders region when data is present', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross"]',
      ),
    ).not.toBeNull();
  });

  it('forwards ref to the wrapper div', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineChoppinessCross
        ref={ref}
        data={linearSeries(40, 100, 1)}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName.toLowerCase()).toBe('div');
  });

  it('exposes length / thresholds / total points as data attributes', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness-cross"]',
    ) as HTMLElement | null;
    expect(root?.dataset.length).toBe('14');
    expect(root?.dataset.trendThreshold).toBe('38.2');
    expect(root?.dataset.chopThreshold).toBe('61.8');
    expect(root?.dataset.totalPoints).toBe('40');
  });

  it('reports cross count as data attribute', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={constSeries(40, 100)} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness-cross"]',
    ) as HTMLElement | null;
    expect(Number(root?.dataset.crossCount)).toBe(0);
  });

  it('renders aria description', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-choppiness-cross-aria-desc"]',
    );
    expect(desc?.textContent).toContain('chart');
  });

  it('renders two legend items', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    const buttons = container.querySelectorAll(
      '[data-section="chart-line-choppiness-cross-legend"] button',
    );
    expect(buttons.length).toBe(2);
  });

  it('toggles legend on click in uncontrolled mode', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    const btn = container.querySelector(
      'button[data-series-id="ci"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn!);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('respects controlled hiddenSeries', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        hiddenSeries={['ci']}
        onSeriesToggle={onToggle}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="ci"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn!);
    expect(onToggle).toHaveBeenCalledWith({
      seriesId: 'ci',
      hidden: false,
    });
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows config badge', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-badge"]',
      )?.textContent,
    ).toContain('length 14');
  });

  it('hides axes when showAxis=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showAxis={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-axes"]',
      ),
    ).toBeNull();
  });

  it('hides grid when showGrid=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showGrid={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-grid"]',
      ),
    ).toBeNull();
  });

  it('hides bands when showBands=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showBands={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-bands"]',
      ),
    ).toBeNull();
  });

  it('hides legend when showLegend=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showLegend={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-legend"]',
      ),
    ).toBeNull();
  });

  it('passes className and style through', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        className="custom"
        style={{ background: 'red' }}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-choppiness-cross"]',
    ) as HTMLElement | null;
    expect(root?.className).toContain('custom');
    expect(root?.style.background).toBe('red');
  });

  it('disables animation class when animate=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        animate={false}
      />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').not.toContain(
      'animate-fade-in',
    );
  });

  it('renders ci path', () => {
    const { container } = render(
      <ChartLineChoppinessCross data={linearSeries(40, 100, 1)} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-ci-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides crosses when showCrosses=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides overlay crosses when showOverlayCrosses=false', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        showOverlayCrosses={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-choppiness-cross-overlay-crosses"]',
      ),
    ).toBeNull();
  });

  it('hides ci when defaultHiddenSeries includes ci', () => {
    const { container } = render(
      <ChartLineChoppinessCross
        data={linearSeries(40, 100, 1)}
        defaultHiddenSeries={['ci']}
      />,
    );
    const btn = container.querySelector(
      'button[data-series-id="ci"]',
    ) as HTMLButtonElement | null;
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Choppiness Cross integration', () => {
  it('CONST K -> ci = 50 bit-exact, regime neutral, 0 crosses', () => {
    for (const K of [0, 1, 5, 17, 100, 1234]) {
      const res = runLineChoppinessCross(constSeries(40, K));
      for (let i = 13; i < res.samples.length; i += 1) {
        expect(res.samples[i]?.ci).toBe(50);
        expect(res.samples[i]?.regime).toBe('neutral');
      }
      expect(res.crosses.length).toBe(0);
    }
  });

  it('LINEAR UP -> ci < 38.2, regime bullish', () => {
    const res = runLineChoppinessCross(linearSeries(40, 0, 1));
    for (let i = 13; i < res.samples.length; i += 1) {
      const c = res.samples[i]?.ci;
      expect(c).not.toBeNull();
      expect(c!).toBeLessThan(38.2);
      expect(res.samples[i]?.regime).toBe('bullish');
    }
  });
});
