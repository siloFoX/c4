import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineFrama,
  computeLineFrama,
  computeLineFramaDimension,
  computeLineFramaLayout,
  getLineFramaFinitePoints,
  normalizeLineFramaPeriod,
  runLineFrama,
  describeLineFramaChart,
  type ChartLineFramaPoint,
} from './chart-line-frama';

afterEach(() => cleanup());

// A linear ramp is maximally smooth, so its fractal dimension
// clamps to 1, the adaptive alpha is exp(0) = 1, and the FRAMA
// tracks the price exactly:
//   dimension = [.,.,., 1, 1, 1, 1, 1]
//   frama     = value = [.,.,., 16, 18, 20, 22, 24]
const RAMP = [10, 12, 14, 16, 18, 20, 22, 24];
const FRAMA_DATA: ChartLineFramaPoint[] = RAMP.map((value, i) => ({
  x: i,
  value,
}));
// A square wave fills each half-window with the full range, so its
// fractal dimension is 2 and the adaptive alpha is exp(-4.6).
const SQUARE: ChartLineFramaPoint[] = [0, 8, 0, 8, 0, 8, 0, 8].map(
  (value, i) => ({ x: i, value }),
);

describe('getLineFramaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineFramaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineFramaFinitePoints(null)).toEqual([]);
    expect(getLineFramaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineFramaPeriod', () => {
  it('keeps an even period and floors a fractional one', () => {
    expect(normalizeLineFramaPeriod(4, 16)).toBe(4);
    expect(normalizeLineFramaPeriod(4.9, 16)).toBe(4);
  });

  it('rounds an odd period down to even', () => {
    expect(normalizeLineFramaPeriod(5, 16)).toBe(4);
    expect(normalizeLineFramaPeriod(3, 16)).toBe(2);
  });

  it('falls back for a sub-2 period', () => {
    expect(normalizeLineFramaPeriod(1, 16)).toBe(16);
    expect(normalizeLineFramaPeriod(0, 16)).toBe(16);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineFramaPeriod(NaN, 16)).toBe(16);
  });
});

describe('computeLineFramaDimension', () => {
  it('reads a fractal dimension of 1 for a smooth ramp window', () => {
    expect(computeLineFramaDimension([10, 12, 14, 16], 4)).toEqual([
      null,
      null,
      null,
      1,
    ]);
  });

  it('reads a fractal dimension of 2 for a square-wave window', () => {
    const dim = computeLineFramaDimension([0, 8, 0, 8], 4);
    expect(dim[0]).toBeNull();
    expect(dim[1]).toBeNull();
    expect(dim[2]).toBeNull();
    // log(8)/log(2) is 2 up to a floating-point rounding artifact.
    expect(dim[3]).toBeCloseTo(2, 10);
  });

  it('reads a fractal dimension of 1 for a flat window', () => {
    expect(computeLineFramaDimension([5, 5, 5, 5], 4)).toEqual([
      null,
      null,
      null,
      1,
    ]);
  });

  it('leaves the first period-1 bars as a null warm-up', () => {
    const dim = computeLineFramaDimension(RAMP, 4);
    expect(dim[2]).toBeNull();
    expect(dim[3]).not.toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineFramaDimension(null, 4)).toEqual([]);
  });
});

describe('computeLineFrama', () => {
  const values = FRAMA_DATA.map((p) => p.value);

  it('exposes the fractal dimension series', () => {
    const { dimension } = computeLineFrama(values, 4);
    expect(dimension).toEqual([null, null, null, 1, 1, 1, 1, 1]);
  });

  it('derives an adaptive alpha of 1 for a smooth trend', () => {
    const { alpha } = computeLineFrama(values, 4);
    expect(alpha).toEqual([null, null, null, 1, 1, 1, 1, 1]);
  });

  it('tracks a clean trend exactly with the adaptive average', () => {
    const { frama } = computeLineFrama(values, 4);
    expect(frama).toEqual([null, null, null, 16, 18, 20, 22, 24]);
  });

  it('seeds the FRAMA at index period-1 with that bar value', () => {
    const { frama } = computeLineFrama(values, 4);
    expect(frama[3]).toBe(16);
    expect(frama[0]).toBeNull();
  });

  it('derives an alpha of exp(-4.6) for a square-wave market', () => {
    const square = SQUARE.map((p) => p.value);
    const { dimension, alpha } = computeLineFrama(square, 4);
    expect(dimension[3]).toBeCloseTo(2, 10);
    expect(alpha[3]).toBeCloseTo(Math.exp(-4.6), 8);
  });

  it('barely moves the FRAMA in a choppy market', () => {
    const square = SQUARE.map((p) => p.value);
    const { frama } = computeLineFrama(square, 4);
    // seeded at 8, alpha ~0.01 -> the average stays close to 8.
    expect(frama[7]).toBeGreaterThan(7.5);
    expect(frama[7]).toBeLessThan(8.5);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineFrama(null, 4)).toEqual({
      dimension: [],
      alpha: [],
      frama: [],
    });
  });
});

describe('runLineFrama', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineFrama(FRAMA_DATA, { period: 4 }).ok).toBe(true);
  });

  it('carries the normalized even period onto the run', () => {
    expect(runLineFrama(FRAMA_DATA, { period: 5 }).period).toBe(4);
  });

  it('exposes the dimension, alpha and frama series', () => {
    const run = runLineFrama(FRAMA_DATA, { period: 4 });
    expect(run.dimension).toEqual([null, null, null, 1, 1, 1, 1, 1]);
    expect(run.frama).toEqual([null, null, null, 16, 18, 20, 22, 24]);
  });

  it('reports the final, min and max FRAMA readings', () => {
    const run = runLineFrama(FRAMA_DATA, { period: 4 });
    expect(run.framaFinal).toBe(24);
    expect(run.framaMin).toBe(16);
    expect(run.framaMax).toBe(24);
  });

  it('leaves the price on the FRAMA when it tracks a clean trend', () => {
    const run = runLineFrama(FRAMA_DATA, { period: 4 });
    expect(run.samples[3]!.position).toBe('on');
    expect(run.samples[7]!.position).toBe('on');
    expect(run.aboveCount).toBe(0);
    expect(run.belowCount).toBe(0);
  });

  it('counts bars above and below the FRAMA in a choppy market', () => {
    const run = runLineFrama(SQUARE, { period: 4 });
    expect(run.aboveCount).toBeGreaterThan(0);
    expect(run.belowCount).toBeGreaterThan(0);
  });

  it('leaves warm-up samples with a null FRAMA', () => {
    const run = runLineFrama(FRAMA_DATA, { period: 4 });
    expect(run.samples[0]!.frama).toBeNull();
    expect(run.samples[3]!.frama).toBe(16);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...FRAMA_DATA].reverse();
    const run = runLineFrama(shuffled, { period: 4 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.frama[7]).toBe(24);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineFrama([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineFrama([]).ok).toBe(false);
    expect(runLineFrama(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineFrama(FRAMA_DATA, { period: 4 }).samples).toHaveLength(8);
  });

  it('defaults to period 16 and reads no FRAMA for a short series', () => {
    const run = runLineFrama(FRAMA_DATA);
    expect(run.period).toBe(16);
    expect(run.frama.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.framaFinal)).toBe(true);
  });
});

describe('computeLineFramaLayout', () => {
  const base = {
    data: FRAMA_DATA,
    period: 4,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineFramaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(8);
  });

  it('builds non-empty price and FRAMA paths', () => {
    const layout = computeLineFramaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.framaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the FRAMA is defined', () => {
    const layout = computeLineFramaLayout(base);
    expect(layout.framaMarkers).toHaveLength(5);
    expect(layout.priceDots).toHaveLength(8);
  });

  it('spans a y domain covering both the price and the FRAMA', () => {
    const layout = computeLineFramaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(10);
    expect(layout.yMax).toBeGreaterThanOrEqual(24);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineFramaLayout(base);
    expect(layout.framaFinal).toBe(24);
    expect(layout.period).toBe(4);
  });

  it('keeps the FRAMA markers inside the panel', () => {
    const layout = computeLineFramaLayout(base);
    for (const m of layout.framaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineFramaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.framaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineFramaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineFramaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineFramaChart(FRAMA_DATA, { period: 4 });
    expect(text).toContain('Fractal Adaptive Moving Average');
    expect(text).toContain('FRAMA');
    expect(text).toContain('fractal dimension');
    expect(text).toContain('adaptive');
    expect(text).toContain('choppy');
  });

  it('reports the above and below counts', () => {
    const text = describeLineFramaChart(FRAMA_DATA, { period: 4 });
    expect(text).toContain('above the FRAMA on 0');
    expect(text).toContain('below on 0');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineFramaChart([])).toBe('No data');
    expect(describeLineFramaChart(null)).toBe('No data');
  });
});

describe('<ChartLineFrama />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const desc = container.querySelector(
      '[data-section="chart-line-frama-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Fractal Adaptive Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const root = container.querySelector('[data-section="chart-line-frama"]');
    expect(root!.getAttribute('data-period')).toBe('4');
    expect(root!.getAttribute('data-frama-final')).toBe('24');
    expect(root!.getAttribute('data-above-count')).toBe('0');
    expect(root!.getAttribute('data-below-count')).toBe('0');
    expect(root!.getAttribute('data-total-points')).toBe('8');
    expect(root!.getAttribute('data-empty')).toBe('false');
  });

  it('renders an svg with the price and FRAMA lines', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    expect(
      container.querySelector('[data-section="chart-line-frama-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-frama-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-frama-frama-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined FRAMA value', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-frama-marker"]',
    );
    expect(markers).toHaveLength(5);
  });

  it('renders a two-item legend', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-frama-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineFrama data={FRAMA_DATA} period={4} />);
    const badge = container.querySelector(
      '[data-section="chart-line-frama-badge-period"]',
    );
    expect(badge!.textContent).toContain('4');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-frama-price-path"]'),
    ).toBeNull();
  });

  it('hides the FRAMA line and markers when showFrama is false', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} showFrama={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-frama-frama-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-frama-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the FRAMA line via the hidden set', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} hiddenSeries={['frama']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-frama-frama-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineFrama
        data={FRAMA_DATA}
        period={4}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const button = container.querySelector(
      '[data-section="chart-line-frama-legend-item"][data-series-id="frama"]',
    ) as HTMLButtonElement;
    button.click();
    expect(seen).toEqual([{ seriesId: 'frama', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-frama-dot"]'),
    ).toHaveLength(8);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(<ChartLineFrama data={[{ x: 0, value: 5 }]} />);
    const root = container.querySelector('[data-section="chart-line-frama"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-frama-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-frama-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineFrama ref={ref} data={FRAMA_DATA} period={4} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-frama');
  });

  it('has a stable displayName', () => {
    expect(ChartLineFrama.displayName).toBe('ChartLineFrama');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineFrama data={FRAMA_DATA} period={4} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-frama"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
