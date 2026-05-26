import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineRmta,
  type ChartLineRmtaPoint,
  type ChartLineRmtaSample,
  DEFAULT_CHART_LINE_RMTA_ALPHA,
  DEFAULT_CHART_LINE_RMTA_BETA,
  getLineRmtaFinitePoints,
  normalizeLineRmtaWeight,
  computeLineRmta,
  classifyLineRmtaTrend,
  runLineRmta,
  computeLineRmtaLayout,
  describeLineRmtaChart,
} from './chart-line-rmta';

const at = (x: number, value: number): ChartLineRmtaPoint => ({ x, value });

/** Eight constant bars: the RMTA holds the constant exactly. */
const CONST_DATA: ChartLineRmtaPoint[] = Array.from({ length: 8 }, (_, i) =>
  at(i, 50),
);

/** Eight integer-price bars used with the alpha + beta = 1 identity. */
const IDENTITY_PRICES = [10, 30, 25, 45, 40, 55, 50, 65];
const IDENTITY_DATA: ChartLineRmtaPoint[] = IDENTITY_PRICES.map((v, i) =>
  at(i, v),
);

/** A monotonically rising price series for the lagging case. */
const RISING_PRICES = [10, 20, 30, 40, 50, 60, 70, 80];
const RISING_DATA: ChartLineRmtaPoint[] = RISING_PRICES.map((v, i) => at(i, v));

/** Twenty-four varying bars for the structural and render checks. */
const WAVE_PRICES = [
  50, 53, 57, 60, 58, 54, 49, 46, 48, 52, 57, 60, 58, 53, 49, 47, 50, 54, 58,
  61, 59, 55, 51, 48,
];
const WAVE_DATA: ChartLineRmtaPoint[] = WAVE_PRICES.map((v, i) => at(i, v));

const OPTS = { alpha: 0.1, beta: 0.5 };
const IDENTITY_OPTS = { alpha: 0.5, beta: 0.5 };

describe('getLineRmtaFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineRmtaFinitePoints(null)).toEqual([]);
    expect(
      getLineRmtaFinitePoints(undefined as unknown as ChartLineRmtaPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineRmtaFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      at(0, 50),
      { x: Number.NaN, value: 51 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      at(3, 53),
    ] as ChartLineRmtaPoint[];
    expect(getLineRmtaFinitePoints(dirty)).toEqual([at(0, 50), at(3, 53)]);
  });

  it('preserves the input order', () => {
    const out = getLineRmtaFinitePoints([at(5, 1), at(2, 2), at(9, 3)]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineRmtaWeight', () => {
  it('keeps a positive weight inside the open interval', () => {
    expect(normalizeLineRmtaWeight(0.3, 0.5)).toBe(0.3);
  });

  it('falls back for a zero weight', () => {
    expect(normalizeLineRmtaWeight(0, 0.5)).toBe(0.5);
  });

  it('falls back for a negative weight', () => {
    expect(normalizeLineRmtaWeight(-0.1, 0.5)).toBe(0.5);
  });

  it('falls back for a weight at or above two', () => {
    expect(normalizeLineRmtaWeight(2, 0.5)).toBe(0.5);
    expect(normalizeLineRmtaWeight(5, 0.5)).toBe(0.5);
  });

  it('falls back for a non-finite weight', () => {
    expect(normalizeLineRmtaWeight(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineRmta', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineRmta(null, 0.1, 0.5)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineRmta(RISING_PRICES, 0.1, 0.5)).toHaveLength(
      RISING_PRICES.length,
    );
  });

  it('seeds the first bar with the price', () => {
    expect(computeLineRmta([12, 14, 16], 0.1, 0.5)[0]).toBe(12);
  });

  it('holds a constant series at its constant level', () => {
    expect(
      computeLineRmta(
        CONST_DATA.map((p) => p.value),
        0.1,
        0.5,
      ),
    ).toEqual([50, 50, 50, 50, 50, 50, 50, 50]);
  });

  it('matches the price exactly when alpha plus beta equals one', () => {
    expect(computeLineRmta(IDENTITY_PRICES, 0.5, 0.5)).toEqual(IDENTITY_PRICES);
  });

  it('matches the price exactly for asymmetric weights summing to one', () => {
    expect(computeLineRmta(IDENTITY_PRICES, 0.25, 0.75)).toEqual(
      IDENTITY_PRICES,
    );
  });

  it('lags the price when alpha plus beta is below one', () => {
    const out = computeLineRmta(RISING_PRICES, 0.1, 0.5);
    expect(out[0]).toBe(10);
    for (let i = 1; i < out.length; i += 1) {
      const r = out[i] as number;
      expect(r).toBeGreaterThan(out[i - 1] as number);
      expect(r).toBeLessThan(RISING_PRICES[i] as number);
    }
  });

  it('responds to alpha', () => {
    const fast = computeLineRmta(WAVE_PRICES, 0.3, 0.5);
    const slow = computeLineRmta(WAVE_PRICES, 0.05, 0.5);
    expect(fast).not.toEqual(slow);
  });

  it('carries the prior value forward across a non-finite bar', () => {
    const out = computeLineRmta([10, Number.NaN, 12], 0.5, 0.5);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(10);
  });
});

describe('classifyLineRmtaTrend', () => {
  it('classifies a rising RMTA as up', () => {
    expect(classifyLineRmtaTrend(12, 10)).toBe('up');
  });

  it('classifies a falling RMTA as down', () => {
    expect(classifyLineRmtaTrend(8, 10)).toBe('down');
  });

  it('classifies an unchanged RMTA as flat', () => {
    expect(classifyLineRmtaTrend(10, 10)).toBe('flat');
  });

  it('classifies a null current value as none', () => {
    expect(classifyLineRmtaTrend(null, 10)).toBe('none');
  });

  it('classifies a null prior value as none', () => {
    expect(classifyLineRmtaTrend(10, null)).toBe('none');
  });
});

describe('runLineRmta', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineRmta([at(0, 1)]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineRmta([]).ok).toBe(false);
    expect(runLineRmta(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineRmta(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default weights when none are given', () => {
    const run = runLineRmta(WAVE_DATA);
    expect(run.alpha).toBe(DEFAULT_CHART_LINE_RMTA_ALPHA);
    expect(run.beta).toBe(DEFAULT_CHART_LINE_RMTA_BETA);
  });

  it('honours custom weights', () => {
    const run = runLineRmta(WAVE_DATA, { alpha: 0.3, beta: 0.4 });
    expect(run.alpha).toBe(0.3);
    expect(run.beta).toBe(0.4);
  });

  it('counts a constant series wholly flat', () => {
    const run = runLineRmta(CONST_DATA, OPTS);
    expect(run.flatCount).toBe(7);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('counts a rising series wholly up', () => {
    const run = runLineRmta(RISING_DATA, OPTS);
    expect(run.upCount).toBe(7);
    expect(run.downCount).toBe(0);
  });

  it('marks the first bar none', () => {
    const run = runLineRmta(WAVE_DATA, OPTS);
    expect(run.samples[0]?.trend).toBe('none');
  });

  it('assigns each sample a valid trend', () => {
    const run = runLineRmta(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.trend);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineRmta(WAVE_DATA, OPTS);
    const noneCount = run.samples.filter((s) => s.trend === 'none').length;
    expect(run.upCount + run.downCount + run.flatCount + noneCount).toBe(
      run.series.length,
    );
  });

  it('emits one sample per point', () => {
    const run = runLineRmta(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('sorts the series by x', () => {
    const run = runLineRmta([at(3, 3), at(1, 1), at(2, 2)], OPTS);
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final RMTA reading', () => {
    const run = runLineRmta(IDENTITY_DATA, IDENTITY_OPTS);
    expect(run.rmtaFinal).toBe(IDENTITY_PRICES[IDENTITY_PRICES.length - 1]);
  });
});

describe('computeLineRmtaLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineRmtaLayout({
      data: [at(0, 1)],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineRmtaLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('builds a price path and an RMTA path', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.rmtaPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(WAVE_DATA.length);
  });

  it('spans the value domain over the price and the RMTA', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.valueMin).toBeLessThanOrEqual(Math.min(...WAVE_PRICES));
    expect(layout.valueMax).toBeGreaterThanOrEqual(Math.max(...WAVE_PRICES));
  });

  it('places the price markers inside the panel', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    for (const dot of layout.priceDots) {
      expect(dot.cy).toBeGreaterThanOrEqual(layout.innerTop);
      expect(dot.cy).toBeLessThanOrEqual(layout.innerBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineRmtaLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineRmtaChart', () => {
  it('names the Recursive Moving Trend Average', () => {
    expect(describeLineRmtaChart(WAVE_DATA, OPTS)).toContain(
      'Recursive Moving Trend Average',
    );
  });

  it('mentions the EMA-like recursion', () => {
    expect(describeLineRmtaChart(WAVE_DATA, OPTS)).toContain('recursive');
  });

  it('mentions the momentum lead', () => {
    expect(describeLineRmtaChart(WAVE_DATA, OPTS)).toContain('momentum lead');
  });

  it('reports the trend counts', () => {
    const run = runLineRmta(WAVE_DATA, OPTS);
    const text = describeLineRmtaChart(WAVE_DATA, OPTS);
    expect(text).toContain(`rises on ${run.upCount}`);
    expect(text).toContain(`falls on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineRmtaChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineRmta />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain(
      'Recursive Moving Trend Average',
    );
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-rmta-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Recursive Moving Trend Average');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineRmta data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-rmta-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the weights and bar count on the root', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-rmta"]');
    expect(root?.getAttribute('data-alpha')).toBe('0.1');
    expect(root?.getAttribute('data-beta')).toBe('0.5');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const svg = container.querySelector(
      '[data-section="chart-line-rmta-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price and RMTA lines', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-rmta-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-rmta-rmta-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per bar', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rmta-marker"]',
    );
    expect(markers).toHaveLength(WAVE_DATA.length);
  });

  it('tags each marker with a valid trend', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rmta-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-trend'),
      );
    }
  });

  it('renders the config badge', () => {
    const { container } = render(<ChartLineRmta data={WAVE_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-rmta-badge-config"]',
    );
    expect(badge?.textContent).toBe('RMTA 0.1/0.5');
  });

  it('hides the RMTA line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineRmta data={WAVE_DATA} {...OPTS} hiddenSeries={['rmta']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmta-rmta-line"]'),
    ).toBeNull();
  });

  it('hides the price line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineRmta data={WAVE_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rmta-price-path"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineRmta
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-rmta-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineRmtaSample;
    };
    expect(typeof detail.point.index).toBe('number');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineRmta ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-rmta');
  });
});
