import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineStochRsi,
  classifyLineStochRsiZone,
  computeLineStochRsi,
  computeLineStochRsiLayout,
  computeLineStochRsiRsi,
  computeLineStochRsiStoch,
  describeLineStochRsiChart,
  getLineStochRsiFinitePoints,
  normalizeLineStochRsiPeriod,
  runLineStochRsi,
  type ChartLineStochRsiPoint,
} from './chart-line-stoch-rsi';

/**
 * Fixtures:
 * - STOCH_INPUT: an integer array fed straight to the stochastic formula.
 *   100*(value-low)/(high-low) over a 3-slot window lands on exact values
 *   for these picks -- [.,.,50,100,0,31.25] -- so it is asserted toEqual.
 * - RISING / FALLING closes: a strictly monotone series has all gains or
 *   all losses, so the RSI pins at exactly 100 or 0.
 * - MIXED: a choppy series for the run / component structural checks.
 */
const STOCH_INPUT = [20, 60, 40, 80, 0, 25];
const STOCH_EXPECTED = [null, null, 50, 100, 0, 31.25];

const RISING_CLOSES = [10, 20, 30, 40, 50, 60];
const FALLING_CLOSES = [60, 50, 40, 30, 20, 10];
const RISING_CLOSES_LONG = [10, 20, 30, 40, 50, 60, 70, 80];

const MIXED_DATA: ChartLineStochRsiPoint[] = [
  { x: 1, value: 50 },
  { x: 2, value: 60 },
  { x: 3, value: 52 },
  { x: 4, value: 64 },
  { x: 5, value: 54 },
  { x: 6, value: 68 },
  { x: 7, value: 56 },
  { x: 8, value: 48 },
  { x: 9, value: 60 },
  { x: 10, value: 44 },
  { x: 11, value: 58 },
  { x: 12, value: 42 },
  { x: 13, value: 56 },
  { x: 14, value: 66 },
  { x: 15, value: 50 },
  { x: 16, value: 62 },
];
const OPTS = { rsiPeriod: 3, stochPeriod: 3 };

describe('getLineStochRsiFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineStochRsiFinitePoints([
      { x: 1, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 3, value: Number.POSITIVE_INFINITY },
      { x: 4, value: 40 },
    ]);
    expect(out).toEqual([
      { x: 1, value: 10 },
      { x: 4, value: 40 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineStochRsiFinitePoints(null)).toEqual([]);
    expect(getLineStochRsiFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineStochRsiFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineStochRsiFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineStochRsiPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineStochRsiPeriod(20, 14)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineStochRsiPeriod(9.8, 14)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineStochRsiPeriod(0, 14)).toBe(14);
    expect(normalizeLineStochRsiPeriod(-3, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineStochRsiPeriod(Number.NaN, 14)).toBe(14);
    expect(normalizeLineStochRsiPeriod('x', 14)).toBe(14);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineStochRsiPeriod(1, 14)).toBe(1);
  });
});

describe('computeLineStochRsiRsi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStochRsiRsi(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineStochRsiRsi(RISING_CLOSES, 3)).toHaveLength(
      RISING_CLOSES.length,
    );
  });

  it('keeps the warm-up window null', () => {
    const rsi = computeLineStochRsiRsi(RISING_CLOSES, 3);
    expect(rsi[0]).toBeNull();
    expect(rsi[2]).toBeNull();
    expect(rsi[3]).not.toBeNull();
  });

  it('pins at 100 for a strictly rising series', () => {
    expect(computeLineStochRsiRsi(RISING_CLOSES, 3)).toEqual([
      null,
      null,
      null,
      100,
      100,
      100,
    ]);
  });

  it('pins at 0 for a strictly falling series', () => {
    expect(computeLineStochRsiRsi(FALLING_CLOSES, 3)).toEqual([
      null,
      null,
      null,
      0,
      0,
      0,
    ]);
  });

  it('is all null when the series is too short', () => {
    expect(computeLineStochRsiRsi([10, 20, 30], 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('keeps every defined RSI within 0 and 100', () => {
    const rsi = computeLineStochRsiRsi(
      MIXED_DATA.map((p) => p.value),
      3,
    );
    for (const v of rsi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('computeLineStochRsiStoch', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStochRsiStoch(null, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineStochRsiStoch(STOCH_INPUT, 3)).toHaveLength(
      STOCH_INPUT.length,
    );
  });

  it('keeps the warm-up window null', () => {
    const stoch = computeLineStochRsiStoch(STOCH_INPUT, 3);
    expect(stoch[0]).toBeNull();
    expect(stoch[1]).toBeNull();
  });

  it('applies the stochastic formula exactly', () => {
    expect(computeLineStochRsiStoch(STOCH_INPUT, 3)).toEqual(STOCH_EXPECTED);
  });

  it('reads 100 when the newest value tops the window', () => {
    expect(computeLineStochRsiStoch([10, 20, 30], 3)[2]).toBe(100);
  });

  it('reads 0 when the newest value is the window low', () => {
    expect(computeLineStochRsiStoch([30, 20, 10], 3)[2]).toBe(0);
  });

  it('yields null for a flat window', () => {
    expect(computeLineStochRsiStoch([50, 50, 50], 3)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('yields null for a window touching a non-finite slot', () => {
    const stoch = computeLineStochRsiStoch([10, null, 30, 40], 3);
    expect(stoch[2]).toBeNull();
    expect(stoch[3]).toBeNull();
  });
});

describe('computeLineStochRsi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineStochRsi(null, 3, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineStochRsi(RISING_CLOSES_LONG, 3, 3)).toHaveLength(
      RISING_CLOSES_LONG.length,
    );
  });

  it('is all null for a strictly rising series', () => {
    // rising prices pin the RSI at 100, a flat window has no stoch.
    const stoch = computeLineStochRsi(RISING_CLOSES_LONG, 3, 3);
    expect(stoch.every((v) => v === null)).toBe(true);
  });

  it('is the stochastic of the RSI', () => {
    const closes = MIXED_DATA.map((p) => p.value);
    expect(computeLineStochRsi(closes, 3, 3)).toEqual(
      computeLineStochRsiStoch(computeLineStochRsiRsi(closes, 3), 3),
    );
  });

  it('keeps every defined value within 0 and 100', () => {
    const stoch = computeLineStochRsi(
      MIXED_DATA.map((p) => p.value),
      3,
      3,
    );
    for (const v of stoch) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineStochRsi(MIXED_DATA.map((p) => p.value), 3, 3)[0]).toBeNull();
  });
});

describe('classifyLineStochRsiZone', () => {
  it('is overbought above the upper threshold', () => {
    expect(classifyLineStochRsiZone(90, 80, 20)).toBe('overbought');
  });

  it('is oversold below the lower threshold', () => {
    expect(classifyLineStochRsiZone(10, 80, 20)).toBe('oversold');
  });

  it('is neutral between the thresholds', () => {
    expect(classifyLineStochRsiZone(50, 80, 20)).toBe('neutral');
  });

  it('is none for a null reading', () => {
    expect(classifyLineStochRsiZone(null, 80, 20)).toBe('none');
  });

  it('is none for a non-finite reading', () => {
    expect(classifyLineStochRsiZone(Number.NaN, 80, 20)).toBe('none');
  });
});

describe('runLineStochRsi', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineStochRsi([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineStochRsi(MIXED_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default periods', () => {
    const run = runLineStochRsi(MIXED_DATA);
    expect(run.rsiPeriod).toBe(14);
    expect(run.stochPeriod).toBe(14);
  });

  it('honours custom periods', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    expect(run.rsiPeriod).toBe(3);
    expect(run.stochPeriod).toBe(3);
  });

  it('carries the default thresholds', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    expect(run.upperThreshold).toBe(80);
    expect(run.lowerThreshold).toBe(20);
  });

  it('honours custom thresholds', () => {
    const run = runLineStochRsi(MIXED_DATA, {
      ...OPTS,
      upperThreshold: 70,
      lowerThreshold: 30,
    });
    expect(run.upperThreshold).toBe(70);
    expect(run.lowerThreshold).toBe(30);
  });

  it('emits one sample per point', () => {
    expect(runLineStochRsi(MIXED_DATA, OPTS).samples).toHaveLength(
      MIXED_DATA.length,
    );
  });

  it('keeps every Stochastic RSI reading within 0 and 100', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    for (const v of run.stochRsi) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('classifies every bar into a valid zone', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['overbought', 'oversold', 'neutral', 'none']).toContain(
        sample.zone,
      );
    }
  });

  it('has self-consistent zone counts', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    const defined = run.stochRsi.filter((v) => v !== null).length;
    expect(
      run.overboughtCount + run.oversoldCount + run.neutralCount,
    ).toBe(defined);
  });

  it('produces no defined readings for a trending series', () => {
    const trending = RISING_CLOSES_LONG.map((value, i) => ({ x: i, value }));
    const run = runLineStochRsi(trending, OPTS);
    expect(run.stochRsiFinal).toBeNull();
  });

  it('sorts the input by x', () => {
    const shuffled = [...MIXED_DATA].reverse();
    const run = runLineStochRsi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(MIXED_DATA.map((p) => p.x));
  });

  it('is not ok for an empty series', () => {
    expect(runLineStochRsi([], OPTS).ok).toBe(false);
    expect(runLineStochRsi(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineStochRsiLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineStochRsiLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineStochRsiLayout({
      data: MIXED_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS }).ok).toBe(
      true,
    );
  });

  it('stacks the price panel above the Stochastic RSI panel', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.stochPanelTop);
  });

  it('builds the price and Stochastic RSI paths', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.stochPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(MIXED_DATA.length);
  });

  it('emits one marker per defined Stochastic RSI bar', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    const defined = layout.run.stochRsi.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the upper threshold line above the lower', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.upperY).toBeLessThan(layout.lowerY);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineStochRsiLayout({ data: MIXED_DATA, ...OPTS });
    expect(layout.run.rsiPeriod).toBe(3);
  });
});

describe('describeLineStochRsiChart', () => {
  it('names the indicator', () => {
    expect(describeLineStochRsiChart(MIXED_DATA, OPTS)).toContain(
      'Stochastic RSI',
    );
  });

  it('mentions the stochastic formula and the RSI series', () => {
    const text = describeLineStochRsiChart(MIXED_DATA, OPTS);
    expect(text).toContain('stochastic');
    expect(text).toContain('RSI');
  });

  it('reports the zone counts', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    const text = describeLineStochRsiChart(MIXED_DATA, OPTS);
    expect(text).toContain(`overbought on ${run.overboughtCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineStochRsiChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineStochRsi component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-stoch-rsi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic RSI');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineStochRsi data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-stoch-rsi-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-stoch-rsi"]');
    expect(root?.getAttribute('data-rsi-period')).toBe('3');
    expect(root?.getAttribute('data-stoch-period')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('16');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and Stochastic RSI lines', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-stoch-rsi-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-stoch-rsi-stoch-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the two threshold lines', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-stoch-rsi-threshold-line"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one marker per defined Stochastic RSI bar', () => {
    const run = runLineStochRsi(MIXED_DATA, OPTS);
    const defined = run.stochRsi.filter((v) => v !== null).length;
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-stoch-rsi-marker"]'),
    );
    for (const marker of markers) {
      expect(['overbought', 'oversold', 'neutral']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-stoch-rsi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-stoch-rsi-badge-config"]',
    );
    expect(badge?.textContent).toBe('SRSI 3/3');
  });

  it('hides the Stochastic RSI line when its legend item is toggled', () => {
    const { container } = render(<ChartLineStochRsi data={MIXED_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-stoch-rsi-legend-item"][data-series-id="stoch"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-stoch-rsi-stoch-line"]'),
    ).not.toBeInTheDocument();
  });

  it('honours a controlled hiddenSeries for the price line', () => {
    const { container } = render(
      <ChartLineStochRsi data={MIXED_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-stoch-rsi-price-path"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineStochRsi data={MIXED_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-stoch-rsi-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineStochRsi ref={ref} data={MIXED_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-stoch-rsi',
    );
  });
});
