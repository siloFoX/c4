import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ChartLineEwmsd,
  DEFAULT_CHART_LINE_EWMSD_ALPHA,
  DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER,
  DEFAULT_CHART_LINE_EWMSD_HEIGHT,
  DEFAULT_CHART_LINE_EWMSD_PADDING,
  DEFAULT_CHART_LINE_EWMSD_PALETTE,
  DEFAULT_CHART_LINE_EWMSD_TICK_COUNT,
  DEFAULT_CHART_LINE_EWMSD_WIDTH,
  classifyLineEwmsdExceedance,
  computeLineEwmsd,
  computeLineEwmsdLayout,
  describeLineEwmsdChart,
  getLineEwmsdDefaultColor,
  getLineEwmsdFinitePoints,
  normaliseLineEwmsdAlpha,
  normaliseLineEwmsdBandMultiplier,
  runLineEwmsd,
  type ChartLineEwmsdSeries,
} from './chart-line-ewmsd';

afterEach(() => {
  cleanup();
});

// Calm at 10, then a single spike to 100. With alpha 0.1 and k 2 the
// spike exceeds the band (a < 1/(1+k^2) = 0.2).
const EXCEED_UP = [10, 10, 10, 10, 10, 100];
const EXCEED_DOWN = [10, 10, 10, 10, 10, -80];
const CALM = [5, 5, 5, 5, 5, 5];

function toPoints(ys: readonly number[]): { x: number; y: number }[] {
  return ys.map((y, i) => ({ x: i, y }));
}

describe('chart-line-ewmsd defaults', () => {
  it('positive size defaults', () => {
    expect(DEFAULT_CHART_LINE_EWMSD_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMSD_HEIGHT).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMSD_PADDING).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMSD_TICK_COUNT).toBeGreaterThan(0);
  });
  it('alpha in (0, 1] and band multiplier positive', () => {
    expect(DEFAULT_CHART_LINE_EWMSD_ALPHA).toBeGreaterThan(0);
    expect(DEFAULT_CHART_LINE_EWMSD_ALPHA).toBeLessThanOrEqual(1);
    expect(DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER).toBeGreaterThan(0);
  });
  it('palette has 10 colours', () => {
    expect(DEFAULT_CHART_LINE_EWMSD_PALETTE.length).toBe(10);
  });
});

describe('getLineEwmsdDefaultColor', () => {
  it('cycles through the palette', () => {
    const len = DEFAULT_CHART_LINE_EWMSD_PALETTE.length;
    expect(getLineEwmsdDefaultColor(0)).toBe(
      DEFAULT_CHART_LINE_EWMSD_PALETTE[0],
    );
    expect(getLineEwmsdDefaultColor(len)).toBe(
      DEFAULT_CHART_LINE_EWMSD_PALETTE[0],
    );
    expect(getLineEwmsdDefaultColor(len + 5)).toBe(
      DEFAULT_CHART_LINE_EWMSD_PALETTE[5],
    );
  });
  it('handles non-finite and negative', () => {
    expect(getLineEwmsdDefaultColor(NaN)).toBe(
      DEFAULT_CHART_LINE_EWMSD_PALETTE[0],
    );
    expect(getLineEwmsdDefaultColor(-1)).toBe(
      DEFAULT_CHART_LINE_EWMSD_PALETTE[0],
    );
  });
});

describe('getLineEwmsdFinitePoints', () => {
  it('drops non-finite values', () => {
    const r = getLineEwmsdFinitePoints([
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
      { x: 2, y: 4 },
    ]);
    expect(r.length).toBe(2);
  });
  it('null returns []', () => {
    expect(getLineEwmsdFinitePoints(null)).toEqual([]);
    expect(getLineEwmsdFinitePoints(undefined)).toEqual([]);
  });
});

describe('normaliseLineEwmsdAlpha', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineEwmsdAlpha(NaN)).toBe(DEFAULT_CHART_LINE_EWMSD_ALPHA);
    expect(normaliseLineEwmsdAlpha(undefined)).toBe(
      DEFAULT_CHART_LINE_EWMSD_ALPHA,
    );
  });
  it('clamps below 0.01 up to 0.01', () => {
    expect(normaliseLineEwmsdAlpha(0)).toBe(0.01);
    expect(normaliseLineEwmsdAlpha(-1)).toBe(0.01);
  });
  it('clamps above 1 down to 1', () => {
    expect(normaliseLineEwmsdAlpha(5)).toBe(1);
  });
  it('passes valid values', () => {
    expect(normaliseLineEwmsdAlpha(0.5)).toBe(0.5);
    expect(normaliseLineEwmsdAlpha(1)).toBe(1);
  });
});

describe('normaliseLineEwmsdBandMultiplier', () => {
  it('falls back for non-finite', () => {
    expect(normaliseLineEwmsdBandMultiplier(NaN)).toBe(
      DEFAULT_CHART_LINE_EWMSD_BAND_MULTIPLIER,
    );
  });
  it('clamps negative to 0', () => {
    expect(normaliseLineEwmsdBandMultiplier(-2)).toBe(0);
  });
  it('passes valid values including 0', () => {
    expect(normaliseLineEwmsdBandMultiplier(0)).toBe(0);
    expect(normaliseLineEwmsdBandMultiplier(3)).toBe(3);
  });
});

describe('classifyLineEwmsdExceedance', () => {
  it('above / below / within', () => {
    expect(classifyLineEwmsdExceedance(10, 0, 5)).toBe('above');
    expect(classifyLineEwmsdExceedance(-1, 0, 5)).toBe('below');
    expect(classifyLineEwmsdExceedance(3, 0, 5)).toBe('within');
  });
  it('boundary values are within (strict comparison)', () => {
    expect(classifyLineEwmsdExceedance(5, 0, 5)).toBe('within');
    expect(classifyLineEwmsdExceedance(0, 0, 5)).toBe('within');
  });
  it('non-finite -> within', () => {
    expect(classifyLineEwmsdExceedance(NaN, 0, 5)).toBe('within');
    expect(classifyLineEwmsdExceedance(3, NaN, 5)).toBe('within');
  });
});

describe('computeLineEwmsd', () => {
  it('empty / null -> []', () => {
    expect(computeLineEwmsd([], 0.3)).toEqual([]);
    expect(computeLineEwmsd(null, 0.3)).toEqual([]);
  });
  it('single point -> mean = value, variance 0, std 0', () => {
    const r = computeLineEwmsd([7], 0.3);
    expect(r.length).toBe(1);
    expect(r[0]!.mean).toBe(7);
    expect(r[0]!.variance).toBe(0);
    expect(r[0]!.std).toBe(0);
  });
  it('constant series -> variance and std are 0 throughout', () => {
    const r = computeLineEwmsd([5, 5, 5, 5], 0.5);
    for (const s of r) {
      expect(s.mean).toBeCloseTo(5, 10);
      expect(s.variance).toBeCloseTo(0, 10);
      expect(s.std).toBeCloseTo(0, 10);
    }
  });
  it('EWMA mean recursion matches alpha*y + (1-alpha)*prev', () => {
    // [0, 10], alpha 0.5 -> mean_1 = 0.5*10 + 0.5*0 = 5
    expect(computeLineEwmsd([0, 10], 0.5)[1]!.mean).toBeCloseTo(5, 10);
    // alpha 0.3 -> mean_1 = 0 + 0.3*(10 - 0) = 3
    expect(computeLineEwmsd([0, 10], 0.3)[1]!.mean).toBeCloseTo(3, 10);
  });
  it('step series: verified variance and std at the jump', () => {
    // [0,0,0,10], alpha 0.5:
    //   i3: delta = 10, mean = 0 + 0.5*10 = 5,
    //       variance = 0.5 * (0 + 0.5 * 100) = 25, std = 5
    const r = computeLineEwmsd([0, 0, 0, 10], 0.5);
    expect(r[3]!.mean).toBeCloseTo(5, 10);
    expect(r[3]!.variance).toBeCloseTo(25, 10);
    expect(r[3]!.std).toBeCloseTo(5, 10);
  });
  it('EXCEED_UP series: verified std = 27 at the spike', () => {
    // alpha 0.1, spike at index 5:
    //   delta = 90, mean = 19, variance = 0.9 * 0.1 * 8100 = 729,
    //   std = sqrt(729) = 27
    const r = computeLineEwmsd(EXCEED_UP, 0.1);
    expect(r[5]!.mean).toBeCloseTo(19, 8);
    expect(r[5]!.variance).toBeCloseTo(729, 6);
    expect(r[5]!.std).toBeCloseTo(27, 8);
  });
  it('variance is always non-negative', () => {
    const r = computeLineEwmsd([3, 9, 1, 14, 2, 20, 6, 11], 0.4);
    for (const s of r) {
      expect(s.variance).toBeGreaterThanOrEqual(0);
      expect(s.std).toBeGreaterThanOrEqual(0);
    }
  });
  it('drops non-finite values (output matches finite length)', () => {
    const r = computeLineEwmsd([5, NaN, 5, Infinity, 5], 0.3);
    expect(r.length).toBe(3);
  });
});

describe('runLineEwmsd', () => {
  it('empty / null -> empty samples', () => {
    const r = runLineEwmsd(null);
    expect(r.samples).toEqual([]);
    expect(r.totalSamples).toBe(0);
    expect(r.exceedanceCount).toBe(0);
  });
  it('band is mean +/- bandMultiplier * std', () => {
    const r = runLineEwmsd(toPoints([0, 0, 0, 10]), {
      alpha: 0.5,
      bandMultiplier: 2,
    });
    const last = r.samples[3]!;
    // mean 5, std 5 -> upper 15, lower -5
    expect(last.upper).toBeCloseTo(15, 8);
    expect(last.lower).toBeCloseTo(-5, 8);
  });
  it('detects an upward band exceedance', () => {
    const r = runLineEwmsd(toPoints(EXCEED_UP), {
      alpha: 0.1,
      bandMultiplier: 2,
    });
    // spike at index 5: raw 100 > upper 73 -> 'above'
    expect(r.samples[5]!.exceedance).toBe('above');
    expect(r.exceedanceCount).toBe(1);
    expect(r.aboveCount).toBe(1);
    expect(r.belowCount).toBe(0);
  });
  it('detects a downward band exceedance', () => {
    const r = runLineEwmsd(toPoints(EXCEED_DOWN), {
      alpha: 0.1,
      bandMultiplier: 2,
    });
    expect(r.samples[5]!.exceedance).toBe('below');
    expect(r.exceedanceCount).toBe(1);
    expect(r.belowCount).toBe(1);
  });
  it('calm series has no exceedances', () => {
    const r = runLineEwmsd(toPoints(CALM), {
      alpha: 0.3,
      bandMultiplier: 2,
    });
    expect(r.exceedanceCount).toBe(0);
    for (const s of r.samples) {
      expect(s.exceedance).toBe('within');
    }
  });
  it('index 0 is always within the band', () => {
    const r = runLineEwmsd(toPoints(EXCEED_UP), { alpha: 0.1 });
    expect(r.samples[0]!.exceedance).toBe('within');
    expect(r.samples[0]!.std).toBeCloseTo(0, 10);
  });
  it('sorts ascending and drops non-finite', () => {
    const r = runLineEwmsd([
      { x: 3, y: 4 },
      { x: NaN, y: 0 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
    const xs = r.samples.map((s) => s.x);
    expect(xs).toEqual([0, 1, 2, 3]);
  });
  it('tracks finalMean, finalStd and maxStd', () => {
    const r = runLineEwmsd(toPoints(EXCEED_UP), { alpha: 0.1 });
    expect(r.finalMean).toBeCloseTo(19, 8);
    expect(r.finalStd).toBeCloseTo(27, 8);
    expect(r.maxStd).toBeCloseTo(27, 8);
  });
  it('exposes alpha and bandMultiplier', () => {
    const r = runLineEwmsd(toPoints(CALM), {
      alpha: 0.42,
      bandMultiplier: 3,
    });
    expect(r.alpha).toBe(0.42);
    expect(r.bandMultiplier).toBe(3);
  });
});

describe('computeLineEwmsdLayout', () => {
  const series: ChartLineEwmsdSeries[] = [
    { id: 'a', label: 'A', data: toPoints(EXCEED_UP), alpha: 0.1 },
  ];

  it('empty series -> ok=false', () => {
    const layout = computeLineEwmsdLayout({
      series: [],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('degenerate canvas -> ok=false', () => {
    const layout = computeLineEwmsdLayout({
      series,
      width: 20,
      height: 20,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('all hidden -> ok=false', () => {
    const layout = computeLineEwmsdLayout({
      series,
      hiddenSeries: ['a'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(false);
  });

  it('builds raw, mean, band fill and band edge paths', () => {
    const layout = computeLineEwmsdLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.ok).toBe(true);
    const s = layout.series[0]!;
    expect(s.rawPath).toContain('M ');
    expect(s.meanPath).toContain('M ');
    expect(s.bandFillPath).toContain('M ');
    expect(s.bandFillPath).toContain('Z');
    expect(s.upperPath).toContain('M ');
    expect(s.lowerPath).toContain('M ');
  });

  it('exposes alpha, bandMultiplier, final stats and exceedances', () => {
    const layout = computeLineEwmsdLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      bandMultiplier: 2,
    });
    const s = layout.series[0]!;
    expect(s.alpha).toBe(0.1);
    expect(s.bandMultiplier).toBe(2);
    expect(s.finalStd).toBeCloseTo(27, 6);
    expect(s.exceedanceCount).toBe(1);
    expect(s.exceedances.length).toBe(1);
    expect(s.exceedances[0]!.exceedance).toBe('above');
  });

  it('per-series alpha override beats chart-level', () => {
    const layout = computeLineEwmsdLayout({
      series: [
        { id: 'a', label: 'A', data: toPoints(EXCEED_UP), alpha: 0.9 },
      ],
      width: 400,
      height: 200,
      padding: 30,
      alpha: 0.1,
    });
    expect(layout.series[0]!.alpha).toBe(0.9);
  });

  it('per-series bandMultiplier override beats chart-level', () => {
    const layout = computeLineEwmsdLayout({
      series: [
        {
          id: 'a',
          label: 'A',
          data: toPoints(EXCEED_UP),
          bandMultiplier: 4,
        },
      ],
      width: 400,
      height: 200,
      padding: 30,
      bandMultiplier: 2,
    });
    expect(layout.series[0]!.bandMultiplier).toBe(4);
  });

  it('y range covers the band beyond the raw values', () => {
    const layout = computeLineEwmsdLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
    });
    const s = layout.series[0]!;
    const minLower = Math.min(...s.points.map((p) => p.lower));
    const maxUpper = Math.max(...s.points.map((p) => p.upper));
    expect(layout.yMin).toBeLessThanOrEqual(minLower + 1e-6);
    expect(layout.yMax).toBeGreaterThanOrEqual(maxUpper - 1e-6);
  });

  it('hidden series excluded', () => {
    const multi: ChartLineEwmsdSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CALM) },
    ];
    const layout = computeLineEwmsdLayout({
      series: multi,
      hiddenSeries: ['b'],
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.visibleSeriesCount).toBe(1);
    expect(layout.series[0]!.id).toBe('a');
  });

  it('bounds overrides honoured', () => {
    const layout = computeLineEwmsdLayout({
      series,
      width: 400,
      height: 200,
      padding: 30,
      xMin: -5,
      xMax: 50,
      yMin: -100,
      yMax: 200,
    });
    expect(layout.xMin).toBe(-5);
    expect(layout.xMax).toBe(50);
    expect(layout.yMin).toBe(-100);
    expect(layout.yMax).toBe(200);
  });

  it('totalPoints sums finite samples', () => {
    const multi: ChartLineEwmsdSeries[] = [
      ...series,
      { id: 'b', label: 'B', data: toPoints(CALM) },
    ];
    const layout = computeLineEwmsdLayout({
      series: multi,
      width: 400,
      height: 200,
      padding: 30,
    });
    expect(layout.totalPoints).toBe(EXCEED_UP.length + CALM.length);
  });
});

describe('describeLineEwmsdChart', () => {
  it('no data -> No data', () => {
    expect(describeLineEwmsdChart(null)).toBe('No data');
    expect(describeLineEwmsdChart([])).toBe('No data');
  });
  it('summary mentions EWMA, the band and exceedances', () => {
    const s = describeLineEwmsdChart([
      { id: 'a', label: 'A', data: toPoints(EXCEED_UP), alpha: 0.1 },
    ]);
    expect(s).toContain('EWMA');
    expect(s).toContain('standard deviation band');
    expect(s).toContain('exceedances');
  });
  it('handles hidden filter', () => {
    const s = describeLineEwmsdChart(
      [{ id: 'a', label: 'A', data: toPoints(CALM) }],
      { hidden: ['a'] },
    );
    expect(s).toBe('No data');
  });
});

describe('<ChartLineEwmsd> render', () => {
  const series: ChartLineEwmsdSeries[] = [
    { id: 'a', label: 'Series A', data: toPoints(EXCEED_UP), alpha: 0.1 },
  ];

  it('renders empty state when no data', () => {
    render(<ChartLineEwmsd series={[]} />);
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root).not.toBeNull();
    expect(root!.getAttribute('data-empty')).toBe('true');
  });

  it('renders raw path with data-kind=raw', () => {
    render(<ChartLineEwmsd series={series} />);
    const raw = document.querySelector(
      '[data-section="chart-line-ewmsd-raw-path"]',
    );
    expect(raw).not.toBeNull();
    expect(raw!.getAttribute('data-kind')).toBe('raw');
  });

  it('renders mean path with data-kind=mean', () => {
    render(<ChartLineEwmsd series={series} />);
    const mean = document.querySelector(
      '[data-section="chart-line-ewmsd-mean-path"]',
    );
    expect(mean).not.toBeNull();
    expect(mean!.getAttribute('data-kind')).toBe('mean');
  });

  it('renders band fill and upper/lower edge paths', () => {
    render(<ChartLineEwmsd series={series} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-band-fill"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-band-upper-path"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-band-lower-path"]',
      ),
    ).not.toBeNull();
  });

  it('hides the band when showBand=false', () => {
    render(<ChartLineEwmsd series={series} showBand={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-band"]'),
    ).toBeNull();
  });

  it('hides raw path when showRaw=false', () => {
    render(<ChartLineEwmsd series={series} showRaw={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-raw-path"]'),
    ).toBeNull();
  });

  it('hides mean path when showMean=false', () => {
    render(<ChartLineEwmsd series={series} showMean={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-mean-path"]'),
    ).toBeNull();
  });

  it('renders an exceedance marker for the detected spike', () => {
    render(<ChartLineEwmsd series={series} />);
    const markers = document.querySelectorAll(
      '[data-section="chart-line-ewmsd-exceedance-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0]!.getAttribute('data-exceedance')).toBe('above');
  });

  it('hides exceedance markers when showExceedances=false', () => {
    render(<ChartLineEwmsd series={series} showExceedances={false} />);
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-exceedance-marker"]',
      ),
    ).toBeNull();
  });

  it('omits dots by default and shows via showDots', () => {
    const { rerender } = render(<ChartLineEwmsd series={series} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-ewmsd-dot"]')
        .length,
    ).toBe(0);
    rerender(<ChartLineEwmsd series={series} showDots={true} />);
    expect(
      document.querySelectorAll('[data-section="chart-line-ewmsd-dot"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('config badge shows alpha + multiplier + std + exceedance count', () => {
    render(<ChartLineEwmsd series={series} />);
    const badge = document.querySelector(
      '[data-section="chart-line-ewmsd-badge"]',
    );
    expect(badge).not.toBeNull();
    expect(
      document
        .querySelector('[data-section="chart-line-ewmsd-badge-alpha"]')
        ?.textContent?.startsWith('a='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-ewmsd-badge-multiplier"]')
        ?.textContent?.startsWith('k='),
    ).toBe(true);
    expect(
      document
        .querySelector('[data-section="chart-line-ewmsd-badge-std"]')
        ?.textContent?.startsWith('sd='),
    ).toBe(true);
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-badge-exceedances"]',
      )?.textContent,
    ).toBe('exc=1');
  });

  it('hides config badge when showConfigBadge=false', () => {
    render(<ChartLineEwmsd series={series} showConfigBadge={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-badge"]'),
    ).toBeNull();
  });

  it('ARIA: region + img + sr-only desc', () => {
    render(<ChartLineEwmsd series={series} />);
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root!.getAttribute('role')).toBe('region');
    const svg = document.querySelector(
      '[data-section="chart-line-ewmsd-svg"]',
    );
    expect(svg!.getAttribute('role')).toBe('img');
    const desc = document.querySelector(
      '[data-section="chart-line-ewmsd-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('EWMA');
  });

  it('root carries data-* attributes', () => {
    render(<ChartLineEwmsd series={series} />);
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root!.getAttribute('data-series-count')).toBe('1');
    expect(root!.getAttribute('data-visible-series-count')).toBe('1');
    expect(Number(root!.getAttribute('data-total-points'))).toBeGreaterThan(0);
    expect(root!.getAttribute('data-total-exceedances')).toBe('1');
    expect(Number(root!.getAttribute('data-alpha'))).toBeCloseTo(0.1, 5);
  });

  it('series group exposes data-* attributes', () => {
    render(<ChartLineEwmsd series={series} />);
    const grp = document.querySelector(
      '[data-section="chart-line-ewmsd-series-group"]',
    );
    expect(grp).not.toBeNull();
    expect(grp!.getAttribute('data-series-id')).toBe('a');
    expect(Number(grp!.getAttribute('data-series-alpha'))).toBeCloseTo(0.1, 5);
    expect(Number(grp!.getAttribute('data-series-final-std'))).toBeCloseTo(
      27,
      5,
    );
    expect(Number(grp!.getAttribute('data-series-exceedance-count'))).toBe(1);
    expect(Number(grp!.getAttribute('data-series-above-count'))).toBe(1);
    expect(
      Number(grp!.getAttribute('data-series-finite-count')),
    ).toBeGreaterThan(0);
  });

  it('tooltip appears on dot hover with raw + mean + std + band rows', () => {
    render(<ChartLineEwmsd series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-ewmsd-dot"]',
    );
    const dot = dots[3]!;
    fireEvent.mouseEnter(dot);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-tooltip"]'),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-tooltip-raw"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-tooltip-mean"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-tooltip-std"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-tooltip-band"]',
      ),
    ).not.toBeNull();
    fireEvent.mouseLeave(dot);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-tooltip"]'),
    ).toBeNull();
  });

  it('tooltip shows an exceedance row on a spike dot', () => {
    render(<ChartLineEwmsd series={series} showDots={true} />);
    const dots = document.querySelectorAll(
      '[data-section="chart-line-ewmsd-dot"]',
    );
    const spikeDot = Array.from(dots).find(
      (d) => d.getAttribute('data-exceedance') === 'above',
    );
    expect(spikeDot).toBeTruthy();
    fireEvent.mouseEnter(spikeDot!);
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-tooltip-exceedance"]',
      ),
    ).not.toBeNull();
  });

  it('omits tooltip when showTooltip=false', () => {
    render(
      <ChartLineEwmsd series={series} showDots={true} showTooltip={false} />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-ewmsd-dot"]',
    );
    fireEvent.mouseEnter(dot!);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-tooltip"]'),
    ).toBeNull();
  });

  it('onPointClick fires with series + point payload', () => {
    let captured: { seriesId: string; pointIndex: number } | null = null;
    render(
      <ChartLineEwmsd
        series={series}
        showDots={true}
        onPointClick={({ series: s, point }) => {
          captured = { seriesId: s.id, pointIndex: point.index };
        }}
      />,
    );
    const dot = document.querySelector(
      '[data-section="chart-line-ewmsd-dot"]',
    );
    fireEvent.click(dot!);
    expect(captured).not.toBeNull();
    expect(captured!.seriesId).toBe('a');
  });

  it('legend shows alpha + exceedance stats and toggles series', () => {
    let lastHidden: ReadonlySet<string> | null = null;
    render(
      <ChartLineEwmsd
        series={series}
        onHiddenSeriesChange={(h) => {
          lastHidden = h;
        }}
      />,
    );
    const stats = document.querySelector(
      '[data-section="chart-line-ewmsd-legend-stats"]',
    );
    expect(stats).not.toBeNull();
    expect(stats!.textContent).toContain('a=');
    expect(stats!.textContent).toContain('exc');
    const btn = document.querySelector(
      '[data-section="chart-line-ewmsd-legend-item"]',
    );
    fireEvent.click(btn!);
    expect(lastHidden).not.toBeNull();
    expect(lastHidden!.has('a')).toBe(true);
  });

  it('omits legend when showLegend=false', () => {
    render(<ChartLineEwmsd series={series} showLegend={false} />);
    expect(
      document.querySelector('[data-section="chart-line-ewmsd-legend"]'),
    ).toBeNull();
  });

  it('animate flag toggles data-animate + class', () => {
    const { rerender } = render(
      <ChartLineEwmsd series={series} animate={true} />,
    );
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root!.getAttribute('data-animate')).toBe('true');
    expect(root!.className).toContain('motion-safe:animate-fade-in');
    rerender(<ChartLineEwmsd series={series} animate={false} />);
    const root2 = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root2!.getAttribute('data-animate')).toBe('false');
    expect(root2!.className).not.toContain('motion-safe:animate-fade-in');
  });

  it('ref forwarding', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineEwmsd ref={ref} series={series} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe(
      'chart-line-ewmsd',
    );
  });

  it('has displayName', () => {
    expect(ChartLineEwmsd.displayName).toBe('ChartLineEwmsd');
  });

  it('custom ariaLabel applied to root and svg', () => {
    render(
      <ChartLineEwmsd series={series} ariaLabel="Custom EWMSD label" />,
    );
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root!.getAttribute('aria-label')).toBe('Custom EWMSD label');
    const svg = document.querySelector(
      '[data-section="chart-line-ewmsd-svg"]',
    );
    expect(svg!.getAttribute('aria-label')).toBe('Custom EWMSD label');
  });

  it('xLabel and yLabel render axis text', () => {
    render(<ChartLineEwmsd series={series} xLabel="time" yLabel="value" />);
    expect(screen.getByText('time').getAttribute('data-section')).toBe(
      'chart-line-ewmsd-x-label',
    );
    expect(screen.getByText('value').getAttribute('data-section')).toBe(
      'chart-line-ewmsd-y-label',
    );
  });

  it('calm series renders zero exceedances', () => {
    render(
      <ChartLineEwmsd
        series={[{ id: 'calm', label: 'Calm', data: toPoints(CALM) }]}
      />,
    );
    const root = document.querySelector('[data-section="chart-line-ewmsd"]');
    expect(root!.getAttribute('data-total-exceedances')).toBe('0');
    expect(
      document.querySelector(
        '[data-section="chart-line-ewmsd-exceedance-marker"]',
      ),
    ).toBeNull();
  });
});
