import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineHma,
  computeLineHmaWma,
  computeLineHma,
  computeLineHmaLayout,
  normalizeLineHmaPeriod,
  getLineHmaFinitePoints,
  runLineHma,
  describeLineHmaChart,
  DEFAULT_CHART_LINE_HMA_PERIOD,
  type ChartLineHmaPoint,
} from './chart-line-hma';

afterEach(() => cleanup());

// A step-3 linear ramp; on a linear trend the HMA has zero lag,
// so the HMA reproduces the value exactly once it is defined.
const HMA_DATA: ChartLineHmaPoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 3 },
  { x: 2, value: 6 },
  { x: 3, value: 9 },
  { x: 4, value: 12 },
  { x: 5, value: 15 },
  { x: 6, value: 18 },
];

// Hand-verified for period 4 (halfPeriod 2, sqrtPeriod 2):
//   wmaHalf = WMA(values, 2) = [null,2,5,8,11,14,17]
//   wmaFull = WMA(values, 4) = [null,null,null,6,9,12,15]
//   raw     = 2*wmaHalf - wmaFull = [null,null,null,10,13,16,19]
//   hma     = WMA(raw, 2) = [null,null,null,null,12,15,18]
const RUN_OPTS = { period: 4 };

describe('getLineHmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineHmaFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineHmaFinitePoints(null)).toEqual([]);
    expect(getLineHmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineHmaPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineHmaPeriod(16, 16)).toBe(16);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineHmaPeriod(16.8, 16)).toBe(16);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineHmaPeriod(0, 16)).toBe(16);
    expect(normalizeLineHmaPeriod(-3, 16)).toBe(16);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineHmaPeriod(NaN, 16)).toBe(16);
    expect(normalizeLineHmaPeriod(Infinity, 16)).toBe(16);
  });
});

describe('computeLineHmaWma', () => {
  it('applies the linearly weighted moving average', () => {
    expect(computeLineHmaWma([0, 3, 6, 9], 2)).toEqual([null, 2, 5, 8]);
  });

  it('weights the most recent value most heavily', () => {
    const recent = computeLineHmaWma([0, 0, 9], 3);
    const old = computeLineHmaWma([9, 0, 0], 3);
    expect(recent[2]).toBe(4.5);
    expect(old[2]).toBe(1.5);
    expect(recent[2]!).toBeGreaterThan(old[2]!);
  });

  it('leaves a window containing a null undefined', () => {
    expect(computeLineHmaWma([null, 3, 6, 9], 2)).toEqual([
      null,
      null,
      5,
      8,
    ]);
  });

  it('leaves indices before the first full window null', () => {
    expect(computeLineHmaWma([1, 2], 3)).toEqual([null, null]);
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineHmaWma(null, 2)).toEqual([]);
  });
});

describe('computeLineHma', () => {
  const values = HMA_DATA.map((p) => p.value);

  it('takes the half-length and full-length weighted moving averages', () => {
    const { wmaHalf, wmaFull } = computeLineHma(values, 4);
    expect(wmaHalf).toEqual([null, 2, 5, 8, 11, 14, 17]);
    expect(wmaFull).toEqual([null, null, null, 6, 9, 12, 15]);
  });

  it('takes the raw line as twice the half WMA minus the full WMA', () => {
    const { raw } = computeLineHma(values, 4);
    expect(raw).toEqual([null, null, null, 10, 13, 16, 19]);
  });

  it('smooths the raw line into the Hull Moving Average', () => {
    const { hma } = computeLineHma(values, 4);
    expect(hma).toEqual([null, null, null, null, 12, 15, 18]);
  });

  it('tracks a linear trend with zero lag', () => {
    const { hma } = computeLineHma(values, 4);
    for (let i = 0; i < values.length; i += 1) {
      if (hma[i] !== null) {
        expect(hma[i]).toBe(values[i]);
      }
    }
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineHma(null, 16)).toEqual({
      wmaHalf: [],
      wmaFull: [],
      raw: [],
      hma: [],
    });
  });
});

describe('runLineHma', () => {
  it('reports ok with the resolved period and derived lengths', () => {
    const run = runLineHma(HMA_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.period).toBe(4);
    expect(run.halfPeriod).toBe(2);
    expect(run.sqrtPeriod).toBe(2);
  });

  it('exposes the Hull Moving Average series', () => {
    const run = runLineHma(HMA_DATA, RUN_OPTS);
    expect(run.hma).toEqual([null, null, null, null, 12, 15, 18]);
  });

  it('reports the final, min and max HMA readings', () => {
    const run = runLineHma(HMA_DATA, RUN_OPTS);
    expect(run.hmaFinal).toBe(18);
    expect(run.hmaMin).toBe(12);
    expect(run.hmaMax).toBe(18);
  });

  it('classifies a linear trend as price sitting on the HMA', () => {
    const run = runLineHma(HMA_DATA, RUN_OPTS);
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
    expect(run.samples[5]!.position).toBe('on');
  });

  it('classifies price above the HMA on a late upward spike', () => {
    const spike: ChartLineHmaPoint[] = [
      { x: 0, value: 0 },
      { x: 1, value: 3 },
      { x: 2, value: 6 },
      { x: 3, value: 9 },
      { x: 4, value: 12 },
      { x: 5, value: 15 },
      { x: 6, value: 30 },
    ];
    const run = runLineHma(spike, RUN_OPTS);
    expect(run.samples[6]!.position).toBe('above');
    expect(run.aboveCount).toBeGreaterThanOrEqual(1);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...HMA_DATA].reverse();
    const run = runLineHma(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(run.hma[6]).toBe(18);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineHma([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineHma([]).ok).toBe(false);
    expect(runLineHma(null).ok).toBe(false);
  });

  it('defaults the period when no options are given', () => {
    const run = runLineHma(HMA_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_HMA_PERIOD);
  });

  it('produces one sample per series point', () => {
    const run = runLineHma(HMA_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(HMA_DATA.length);
  });
});

describe('computeLineHmaLayout', () => {
  const base = {
    data: HMA_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineHmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(7);
  });

  it('builds non-empty price and HMA paths', () => {
    const layout = computeLineHmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.hmaPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined HMA reading', () => {
    const layout = computeLineHmaLayout(base);
    expect(layout.hmaMarkers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(7);
  });

  it('spans the y domain over both the price and the HMA', () => {
    const layout = computeLineHmaLayout(base);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(18);
  });

  it('carries the derived lengths and statistics onto the layout', () => {
    const layout = computeLineHmaLayout(base);
    expect(layout.halfPeriod).toBe(2);
    expect(layout.sqrtPeriod).toBe(2);
    expect(layout.hmaFinal).toBe(18);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineHmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.hmaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineHmaLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineHmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineHmaChart(HMA_DATA, RUN_OPTS);
    expect(text).toContain('Hull Moving Average');
    expect(text).toContain('HMA');
    expect(text).toContain('overlay');
    expect(text).toContain('weighted moving average');
    expect(text).toContain('lag');
    expect(text).toContain('smooth');
  });

  it('reports the price-versus-HMA counts', () => {
    const text = describeLineHmaChart(HMA_DATA, RUN_OPTS);
    expect(text).toContain('above the HMA on 0 bars');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineHmaChart([])).toBe('No data');
    expect(describeLineHmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineHma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-hma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Hull Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-hma"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-half-period')).toBe('2');
    expect(root!.getAttribute('data-sqrt-period')).toBe('2');
    expect(root!.getAttribute('data-above-count')).toBe('0');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('7');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and HMA lines', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-hma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-hma-hma-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined HMA reading', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-hma-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const period = container.querySelector(
      '[data-section="chart-line-hma-badge-period"]',
    );
    expect(period!.textContent).toContain('4');
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-hma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-price-path"]'),
    ).toBeNull();
  });

  it('hides the HMA line and markers when showHma is false', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} showHma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-hma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-hma-marker"]'),
    ).toHaveLength(0);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-hma-dot"]'),
    ).toHaveLength(7);
  });

  it('omits price dots by default', () => {
    const { container } = render(<ChartLineHma data={HMA_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-hma-dot"]'),
    ).toHaveLength(0);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineHma data={[{ x: 0, value: 1 }]} />);
    const root = container.querySelector('[data-section="chart-line-hma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-hma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-badge"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-hma-legend"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineHma ref={ref} data={HMA_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-hma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineHma.displayName).toBe('ChartLineHma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineHma data={HMA_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-hma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
