import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineAlma,
  computeLineAlmaWeights,
  computeLineAlma,
  computeLineAlmaLayout,
  normalizeLineAlmaPeriod,
  getLineAlmaFinitePoints,
  runLineAlma,
  describeLineAlmaChart,
  DEFAULT_CHART_LINE_ALMA_PERIOD,
  DEFAULT_CHART_LINE_ALMA_OFFSET,
  DEFAULT_CHART_LINE_ALMA_SIGMA,
  type ChartLineAlmaPoint,
} from './chart-line-alma';

afterEach(() => cleanup());

// A step-6 linear ramp; with a symmetric offset (0.5) the ALMA of a
// linear trend equals the centre of each window exactly.
const ALMA_DATA: ChartLineAlmaPoint[] = [
  { x: 0, value: 0 },
  { x: 1, value: 6 },
  { x: 2, value: 12 },
  { x: 3, value: 18 },
  { x: 4, value: 24 },
];

// For period 3, offset 0.5, sigma 2 the weights are symmetric
// [w, 1, w]; the ALMA of the ramp is the window centre:
//   alma = [null, null, 6, 12, 18]
const RUN_OPTS = { period: 3, offset: 0.5, sigma: 2 };

describe('getLineAlmaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineAlmaFinitePoints([
      { x: 0, value: 1 },
      { x: NaN, value: 2 },
      { x: 1, value: Infinity },
      { x: 2, value: 3 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineAlmaFinitePoints(null)).toEqual([]);
    expect(getLineAlmaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineAlmaPeriod', () => {
  it('passes through a positive integer', () => {
    expect(normalizeLineAlmaPeriod(9, 9)).toBe(9);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineAlmaPeriod(9.8, 9)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineAlmaPeriod(0, 9)).toBe(9);
    expect(normalizeLineAlmaPeriod(-2, 9)).toBe(9);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineAlmaPeriod(NaN, 9)).toBe(9);
    expect(normalizeLineAlmaPeriod(Infinity, 9)).toBe(9);
  });
});

describe('computeLineAlmaWeights', () => {
  it('produces one weight per slot of the period', () => {
    expect(computeLineAlmaWeights(9, 0.85, 6)).toHaveLength(9);
  });

  it('peaks at the offset position with a unit weight', () => {
    // offset 0.5, period 5 -> m = 2; the weight there is exp(0) = 1
    const weights = computeLineAlmaWeights(5, 0.5, 2);
    expect(weights[2]).toBe(1);
  });

  it('is symmetric for a centred offset', () => {
    const weights = computeLineAlmaWeights(5, 0.5, 2);
    expect(weights[1]).toBe(weights[3]);
    expect(weights[0]).toBe(weights[4]);
  });

  it('keeps every weight positive', () => {
    const weights = computeLineAlmaWeights(9, 0.85, 6);
    for (const w of weights) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('shifts the weight toward recent bars for a high offset', () => {
    const weights = computeLineAlmaWeights(9, 0.85, 6);
    expect(weights[8]!).toBeGreaterThan(weights[0]!);
  });

  it('makes the offset slot the heaviest', () => {
    const weights = computeLineAlmaWeights(5, 0.5, 2);
    expect(weights[2]!).toBeGreaterThanOrEqual(weights[1]!);
    expect(weights[2]!).toBeGreaterThanOrEqual(weights[0]!);
  });
});

describe('computeLineAlma', () => {
  const values = ALMA_DATA.map((p) => p.value);

  it('reproduces a constant series', () => {
    const { alma } = computeLineAlma([5, 5, 5, 5], 3, 0.5, 2);
    expect(alma[2]!).toBeCloseTo(5, 6);
    expect(alma[3]!).toBeCloseTo(5, 6);
  });

  it('averages the window to the centre on a symmetric ramp', () => {
    const { alma } = computeLineAlma(values, 3, 0.5, 2);
    expect(alma[0]).toBeNull();
    expect(alma[1]).toBeNull();
    expect(alma[2]!).toBeCloseTo(6, 6);
    expect(alma[3]!).toBeCloseTo(12, 6);
    expect(alma[4]!).toBeCloseTo(18, 6);
  });

  it('keeps every reading inside its window range', () => {
    const varied = [10, 2, 8, 4, 9];
    const { alma } = computeLineAlma(varied, 3, 0.85, 6);
    for (let i = 2; i < varied.length; i += 1) {
      const window = varied.slice(i - 2, i + 1);
      expect(alma[i]!).toBeGreaterThanOrEqual(Math.min(...window));
      expect(alma[i]!).toBeLessThanOrEqual(Math.max(...window));
    }
  });

  it('exposes the window weights', () => {
    const { weights } = computeLineAlma(values, 3, 0.5, 2);
    expect(weights).toHaveLength(3);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineAlma(null, 9, 0.85, 6)).toEqual({
      weights: [],
      alma: [],
    });
  });
});

describe('runLineAlma', () => {
  it('reports ok with the resolved period, offset and sigma', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.ok).toBe(true);
    expect(run.period).toBe(3);
    expect(run.offset).toBe(0.5);
    expect(run.sigma).toBe(2);
  });

  it('exposes the ALMA series and the window weights', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.alma[2]!).toBeCloseTo(6, 6);
    expect(run.weights).toHaveLength(3);
  });

  it('reports the final, min and max ALMA readings', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.almaFinal!).toBeCloseTo(18, 6);
    expect(run.almaMin!).toBeCloseTo(6, 6);
    expect(run.almaMax!).toBeCloseTo(18, 6);
  });

  it('counts the price running above the lagging ALMA in an uptrend', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.aboveCount).toBe(3);
    expect(run.belowCount).toBe(0);
  });

  it('classifies each sample by position relative to the ALMA', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('above');
    expect(run.samples[4]!.position).toBe('above');
  });

  it('falls back to the default offset for an out-of-range offset', () => {
    const run = runLineAlma(ALMA_DATA, { period: 3, offset: 5, sigma: 2 });
    expect(run.offset).toBe(DEFAULT_CHART_LINE_ALMA_OFFSET);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...ALMA_DATA].reverse();
    const run = runLineAlma(shuffled, RUN_OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.alma[2]!).toBeCloseTo(6, 6);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineAlma([{ x: 0, value: 1 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty input', () => {
    expect(runLineAlma([]).ok).toBe(false);
    expect(runLineAlma(null).ok).toBe(false);
  });

  it('defaults the config when no options are given', () => {
    const run = runLineAlma(ALMA_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_ALMA_PERIOD);
    expect(run.offset).toBe(DEFAULT_CHART_LINE_ALMA_OFFSET);
    expect(run.sigma).toBe(DEFAULT_CHART_LINE_ALMA_SIGMA);
  });

  it('produces one sample per series point', () => {
    const run = runLineAlma(ALMA_DATA, RUN_OPTS);
    expect(run.samples).toHaveLength(ALMA_DATA.length);
  });
});

describe('computeLineAlmaLayout', () => {
  const base = {
    data: ALMA_DATA,
    ...RUN_OPTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineAlmaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price and ALMA paths', () => {
    const layout = computeLineAlmaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.almaPath.startsWith('M')).toBe(true);
  });

  it('emits one marker per defined ALMA reading', () => {
    const layout = computeLineAlmaLayout(base);
    expect(layout.almaMarkers).toHaveLength(3);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('spans the y domain over both the price and the ALMA', () => {
    const layout = computeLineAlmaLayout(base);
    expect(layout.yMin).toBe(0);
    expect(layout.yMax).toBe(24);
  });

  it('carries the period, offset and sigma onto the layout', () => {
    const layout = computeLineAlmaLayout(base);
    expect(layout.period).toBe(3);
    expect(layout.offset).toBe(0.5);
    expect(layout.sigma).toBe(2);
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineAlmaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.almaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineAlmaLayout({
      ...base,
      data: [{ x: 0, value: 1 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineAlmaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineAlmaChart(ALMA_DATA, RUN_OPTS);
    expect(text).toContain('Arnaud Legoux Moving Average');
    expect(text).toContain('ALMA');
    expect(text).toContain('overlay');
    expect(text).toContain('Gaussian');
    expect(text).toContain('offset');
    expect(text).toContain('lag');
  });

  it('reports the price-versus-ALMA counts', () => {
    const text = describeLineAlmaChart(ALMA_DATA, RUN_OPTS);
    expect(text).toContain('above the ALMA on 3 bars');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineAlmaChart([])).toBe('No data');
    expect(describeLineAlmaChart(null)).toBe('No data');
  });
});

describe('<ChartLineAlma />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-alma-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Arnaud Legoux Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const root = container.querySelector('[data-section="chart-line-alma"]');
    expect(root!.getAttribute('data-period')).toBe('3');
    expect(root!.getAttribute('data-offset')).toBe('0.5');
    expect(root!.getAttribute('data-sigma')).toBe('2');
    expect(root!.getAttribute('data-above-count')).toBe('3');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and ALMA lines', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-alma-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-alma-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-alma-alma-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined ALMA reading', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-alma-marker"]',
    );
    expect(markers).toHaveLength(3);
  });

  it('renders the config badge with the period, offset and sigma', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const period = container.querySelector(
      '[data-section="chart-line-alma-badge-period"]',
    );
    const shape = container.querySelector(
      '[data-section="chart-line-alma-badge-shape"]',
    );
    expect(period!.textContent).toContain('3');
    expect(shape!.textContent).toContain('0.5');
    expect(shape!.textContent).toContain('2');
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-alma-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-alma-price-path"]'),
    ).toBeNull();
  });

  it('hides the ALMA line and markers when showAlma is false', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} showAlma={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-alma-alma-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-alma-marker"]'),
    ).toHaveLength(0);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-alma-dot"]'),
    ).toHaveLength(5);
  });

  it('omits price dots by default', () => {
    const { container } = render(<ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-alma-dot"]'),
    ).toHaveLength(0);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineAlma data={[{ x: 0, value: 1 }]} />);
    const root = container.querySelector('[data-section="chart-line-alma"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-alma-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-alma-badge"]'),
    ).toBeNull();
  });

  it('omits the legend when showLegend is false', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} showLegend={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-alma-legend"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineAlma ref={ref} data={ALMA_DATA} {...RUN_OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-alma');
  });

  it('has a stable displayName', () => {
    expect(ChartLineAlma.displayName).toBe('ChartLineAlma');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineAlma data={ALMA_DATA} {...RUN_OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-alma"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
