import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineWae,
  classifyLineWaeZone,
  computeLineWae,
  computeLineWaeBollWidth,
  computeLineWaeEma,
  computeLineWaeLayout,
  computeLineWaeMacd,
  computeLineWaeStdev,
  describeLineWaeChart,
  getLineWaeFinitePoints,
  normalizeLineWaePeriod,
  runLineWae,
  type ChartLineWaePoint,
} from './chart-line-wae';

/**
 * Fixture: closes step 16 -> 32. The fast EMA period 3 has alpha 0.5 and
 * the slow EMA period 7 has alpha 0.25 -- both dyadic -- so the MACD stays
 * exact. The Bollinger width is read at period 2, where the standard
 * deviation collapses to half the absolute close change, also exact. With
 * an integer sensitivity the whole WAE pipeline is exact:
 *   MACD      [0,0,0,0,4,5,4.75,4.0625]
 *   momentum  [.,0,0,0,16,4,-1,-2.75]
 *   explosion [.,0,0,0,16,0,0,0]
 */
const WAE_DATA: ChartLineWaePoint[] = [
  { x: 1, value: 16 },
  { x: 2, value: 16 },
  { x: 3, value: 16 },
  { x: 4, value: 16 },
  { x: 5, value: 32 },
  { x: 6, value: 32 },
  { x: 7, value: 32 },
  { x: 8, value: 32 },
];
const WAE_CLOSES = WAE_DATA.map((p) => p.value);
const OPTS = {
  fastPeriod: 3,
  slowPeriod: 7,
  bbPeriod: 2,
  bbMult: 1,
  sensitivity: 4,
};

const MACD_EXPECTED = [0, 0, 0, 0, 4, 5, 4.75, 4.0625];
const TREND_EXPECTED = [null, 0, 0, 0, 16, 4, -1, -2.75];
const EXPLOSION_EXPECTED = [null, 0, 0, 0, 16, 0, 0, 0];
const ZONE_EXPECTED = [
  'none',
  'quiet',
  'quiet',
  'quiet',
  'quiet',
  'explosive-up',
  'explosive-down',
  'explosive-down',
];

describe('getLineWaeFinitePoints', () => {
  it('keeps only points with a finite x and a finite value', () => {
    const out = getLineWaeFinitePoints([
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
    expect(getLineWaeFinitePoints(null)).toEqual([]);
    expect(getLineWaeFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineWaeFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineWaeFinitePoints([
      { x: 9, value: 1 },
      { x: 2, value: 2 },
      { x: 5, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineWaePeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineWaePeriod(20, 14)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineWaePeriod(9.8, 14)).toBe(9);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineWaePeriod(0, 14)).toBe(14);
    expect(normalizeLineWaePeriod(-3, 14)).toBe(14);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineWaePeriod(Number.NaN, 14)).toBe(14);
    expect(normalizeLineWaePeriod('x', 14)).toBe(14);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineWaePeriod(1, 14)).toBe(1);
  });
});

describe('computeLineWaeEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWaeEma(null, 3)).toEqual([]);
  });

  it('is the exact dyadic EMA for a period-3 alpha of one half', () => {
    expect(computeLineWaeEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('is the exact dyadic EMA for a period-7 alpha of one quarter', () => {
    // alpha = 2/8 = 0.25: 0.25*8 + 0.75*4 = 5.
    expect(computeLineWaeEma([4, 8], 7)).toEqual([4, 5]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineWaeEma([7, 7, 7, 7], 5)).toEqual([7, 7, 7, 7]);
  });
});

describe('computeLineWaeMacd', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWaeMacd(null, 3, 7)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineWaeMacd(WAE_CLOSES, 3, 7)).toHaveLength(
      WAE_CLOSES.length,
    );
  });

  it('computes the exact MACD line', () => {
    expect(computeLineWaeMacd(WAE_CLOSES, 3, 7)).toEqual(MACD_EXPECTED);
  });

  it('is zero for a constant series', () => {
    expect(computeLineWaeMacd([20, 20, 20, 20], 3, 7)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('is positive while the fast EMA leads on a rising series', () => {
    const macd = computeLineWaeMacd(WAE_CLOSES, 3, 7);
    expect(macd[5]!).toBeGreaterThan(0);
  });
});

describe('computeLineWaeStdev', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWaeStdev(null, 2)).toEqual([]);
  });

  it('keeps the warm-up window null', () => {
    expect(computeLineWaeStdev([10, 16, 20], 2)[0]).toBeNull();
  });

  it('is half the absolute change for a period-2 window', () => {
    expect(computeLineWaeStdev([10, 16], 2)).toEqual([null, 3]);
  });

  it('is zero for a constant series', () => {
    expect(computeLineWaeStdev([5, 5, 5, 5], 2)).toEqual([null, 0, 0, 0]);
  });

  it('computes the exact standard deviation of the fixture', () => {
    expect(computeLineWaeStdev(WAE_CLOSES, 2)).toEqual([
      null, 0, 0, 0, 8, 0, 0, 0,
    ]);
  });

  it('matches the input length', () => {
    expect(computeLineWaeStdev(WAE_CLOSES, 2)).toHaveLength(WAE_CLOSES.length);
  });
});

describe('computeLineWaeBollWidth', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineWaeBollWidth(null, 2, 1)).toEqual([]);
  });

  it('is twice the multiplier times the standard deviation', () => {
    expect(computeLineWaeBollWidth([10, 16], 2, 1)).toEqual([null, 6]);
  });

  it('computes the exact band width of the fixture', () => {
    expect(computeLineWaeBollWidth(WAE_CLOSES, 2, 1)).toEqual(
      EXPLOSION_EXPECTED,
    );
  });

  it('scales with the multiplier', () => {
    expect(computeLineWaeBollWidth([10, 16], 2, 2)).toEqual([null, 12]);
  });

  it('is zero for a constant series', () => {
    expect(computeLineWaeBollWidth([5, 5, 5, 5], 2, 2)).toEqual([
      null, 0, 0, 0,
    ]);
  });
});

describe('classifyLineWaeZone', () => {
  it('is explosive-up when a positive momentum tops the explosion line', () => {
    expect(classifyLineWaeZone(20, 10)).toBe('explosive-up');
  });

  it('is explosive-down when a negative momentum tops the explosion line', () => {
    expect(classifyLineWaeZone(-20, 10)).toBe('explosive-down');
  });

  it('is quiet when the momentum is within the explosion line', () => {
    expect(classifyLineWaeZone(5, 10)).toBe('quiet');
    expect(classifyLineWaeZone(-5, 10)).toBe('quiet');
  });

  it('is quiet when the momentum equals the explosion line', () => {
    expect(classifyLineWaeZone(10, 10)).toBe('quiet');
  });

  it('is none for a null momentum', () => {
    expect(classifyLineWaeZone(null, 10)).toBe('none');
  });

  it('is none for a null explosion line', () => {
    expect(classifyLineWaeZone(20, null)).toBe('none');
  });

  it('is none for a non-finite input', () => {
    expect(classifyLineWaeZone(Number.NaN, 10)).toBe('none');
  });
});

describe('computeLineWae', () => {
  it('returns empty arrays for a non-array input', () => {
    const out = computeLineWae(null);
    expect(out.macd).toEqual([]);
    expect(out.trend).toEqual([]);
    expect(out.explosion).toEqual([]);
  });

  it('matches every array to the input length', () => {
    const out = computeLineWae(WAE_CLOSES, OPTS);
    expect(out.macd).toHaveLength(WAE_CLOSES.length);
    expect(out.trend).toHaveLength(WAE_CLOSES.length);
    expect(out.explosion).toHaveLength(WAE_CLOSES.length);
  });

  it('computes the exact MACD line', () => {
    expect(computeLineWae(WAE_CLOSES, OPTS).macd).toEqual(MACD_EXPECTED);
  });

  it('computes the exact momentum series', () => {
    expect(computeLineWae(WAE_CLOSES, OPTS).trend).toEqual(TREND_EXPECTED);
  });

  it('computes the exact explosion line', () => {
    expect(computeLineWae(WAE_CLOSES, OPTS).explosion).toEqual(
      EXPLOSION_EXPECTED,
    );
  });

  it('keeps the momentum null on the first bar', () => {
    expect(computeLineWae(WAE_CLOSES, OPTS).trend[0]).toBeNull();
  });

  it('scales the momentum by the sensitivity factor', () => {
    const base = computeLineWae(WAE_CLOSES, OPTS).trend[4]!;
    const doubled = computeLineWae(WAE_CLOSES, {
      ...OPTS,
      sensitivity: 8,
    }).trend[4]!;
    expect(doubled).toBe(base * 2);
  });

  it('produces a zero momentum for a constant series', () => {
    const out = computeLineWae([20, 20, 20, 20, 20, 20], OPTS);
    expect(out.trend.filter((v) => v !== null).every((v) => v === 0)).toBe(
      true,
    );
  });
});

describe('runLineWae', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineWae([{ x: 1, value: 10 }], OPTS).ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineWae(WAE_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default options', () => {
    const run = runLineWae(WAE_DATA);
    expect(run.fastPeriod).toBe(20);
    expect(run.slowPeriod).toBe(40);
    expect(run.bbPeriod).toBe(20);
    expect(run.bbMult).toBe(2);
    expect(run.sensitivity).toBe(150);
  });

  it('honours custom options', () => {
    const run = runLineWae(WAE_DATA, OPTS);
    expect(run.fastPeriod).toBe(3);
    expect(run.slowPeriod).toBe(7);
    expect(run.sensitivity).toBe(4);
  });

  it('computes the exact momentum and explosion series', () => {
    const run = runLineWae(WAE_DATA, OPTS);
    expect(run.trend).toEqual(TREND_EXPECTED);
    expect(run.explosion).toEqual(EXPLOSION_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineWae(WAE_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineWae(WAE_DATA, OPTS);
    expect(run.explosiveUpCount).toBe(1);
    expect(run.explosiveDownCount).toBe(2);
    expect(run.quietCount).toBe(4);
  });

  it('reports the final momentum', () => {
    expect(runLineWae(WAE_DATA, OPTS).trendFinal).toBe(-2.75);
  });

  it('emits one sample per point', () => {
    expect(runLineWae(WAE_DATA, OPTS).samples).toHaveLength(WAE_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...WAE_DATA].reverse();
    const run = runLineWae(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(WAE_DATA.map((p) => p.x));
    expect(run.trend).toEqual(TREND_EXPECTED);
  });

  it('keeps a constant series wholly quiet', () => {
    const flat = [20, 20, 20, 20, 20, 20].map((value, i) => ({ x: i, value }));
    const run = runLineWae(flat, OPTS);
    expect(run.explosiveUpCount).toBe(0);
    expect(run.explosiveDownCount).toBe(0);
    expect(run.quietCount).toBeGreaterThan(0);
  });

  it('is not ok for an empty series', () => {
    expect(runLineWae([], OPTS).ok).toBe(false);
    expect(runLineWae(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineWaeLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineWaeLayout({
      data: [{ x: 1, value: 10 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineWaeLayout({
      data: WAE_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineWaeLayout({ data: WAE_DATA, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the WAE panel', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.waePanelTop);
  });

  it('builds the price, momentum and explosion paths', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.momentumPath.startsWith('M')).toBe(true);
    expect(layout.explosionPath.startsWith('M')).toBe(true);
    expect(layout.explosionMirrorPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAE_DATA.length);
  });

  it('emits one marker per defined momentum bar', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    const defined = layout.run.trend.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('places the zero line inside the WAE panel', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.waePanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.waePanelBottom);
  });

  it('spans the WAE domain across zero', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.waeMin).toBeLessThanOrEqual(0);
    expect(layout.waeMax).toBeGreaterThanOrEqual(0);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineWaeLayout({ data: WAE_DATA, ...OPTS });
    expect(layout.run.trendFinal).toBe(-2.75);
  });
});

describe('describeLineWaeChart', () => {
  it('names the indicator', () => {
    expect(describeLineWaeChart(WAE_DATA, OPTS)).toContain(
      'Waddah Attar Explosion',
    );
  });

  it('mentions the MACD and the Bollinger Band width', () => {
    const text = describeLineWaeChart(WAE_DATA, OPTS);
    expect(text).toContain('MACD');
    expect(text).toContain('Bollinger Band width');
  });

  it('reports the zone counts', () => {
    const text = describeLineWaeChart(WAE_DATA, OPTS);
    expect(text).toContain('explodes up on 1');
    expect(text).toContain('down on 2');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineWaeChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineWae component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-wae-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Waddah Attar Explosion');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineWae data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-wae-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-wae"]');
    expect(root?.getAttribute('data-fast-period')).toBe('3');
    expect(root?.getAttribute('data-slow-period')).toBe('7');
    expect(root?.getAttribute('data-total-points')).toBe('8');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price, momentum and explosion lines', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-wae-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-wae-momentum-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-wae-explosion-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the explosion mirror line', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    expect(
      container.querySelector(
        '[data-section="chart-line-wae-explosion-mirror"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders one marker per defined momentum bar', () => {
    const run = runLineWae(WAE_DATA, OPTS);
    const defined = run.trend.filter((v) => v !== null).length;
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-wae-marker"]',
    );
    expect(markers).toHaveLength(defined);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-wae-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'quiet',
      'quiet',
      'quiet',
      'quiet',
      'explosive-up',
      'explosive-down',
      'explosive-down',
    ]);
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-wae-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-wae-badge-config"]',
    );
    expect(badge?.textContent).toBe('WAE 3/7');
  });

  it('hides the explosion line when its legend item is toggled', () => {
    const { container } = render(<ChartLineWae data={WAE_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-wae-legend-item"][data-series-id="explosion"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-wae-explosion-line"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineWae data={WAE_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-wae-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineWae ref={ref} data={WAE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-wae');
  });
});
