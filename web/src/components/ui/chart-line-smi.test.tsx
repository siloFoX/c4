import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChartLineSmi,
  classifyLineSmiZone,
  computeLineSmi,
  computeLineSmiEma,
  computeLineSmiLayout,
  computeLineSmiRaw,
  describeLineSmiChart,
  getLineSmiFinitePoints,
  normalizeLineSmiPeriod,
  runLineSmi,
  type ChartLineSmiPoint,
} from './chart-line-smi';

/**
 * Fixture: 10 bars that all share high 30 and low 10, so over any 3-bar
 * window the range is the constant 20 and the midpoint is the constant 20.
 * The close steps 20 -> 28 -> 12, so D = close - 20 is [.,.,8,8,8,8,-8,-8,
 * -8,-8]. With smoothing periods 3 the EMA alpha is exactly 0.5, so the
 * double EMA stays dyadic and -- the range being constant -- the whole SMI
 * series is exact: [.,.,80,80,80,80,40,0,-30,-50].
 */
const SMI_DATA: ChartLineSmiPoint[] = [
  { x: 1, high: 30, low: 10, close: 20 },
  { x: 2, high: 30, low: 10, close: 20 },
  { x: 3, high: 30, low: 10, close: 28 },
  { x: 4, high: 30, low: 10, close: 28 },
  { x: 5, high: 30, low: 10, close: 28 },
  { x: 6, high: 30, low: 10, close: 28 },
  { x: 7, high: 30, low: 10, close: 12 },
  { x: 8, high: 30, low: 10, close: 12 },
  { x: 9, high: 30, low: 10, close: 12 },
  { x: 10, high: 30, low: 10, close: 12 },
];
const OPTS = { qPeriod: 3, smoothPeriod1: 3, smoothPeriod2: 3 };

const D_EXPECTED = [null, null, 8, 8, 8, 8, -8, -8, -8, -8];
const RANGE_EXPECTED = [null, null, 20, 20, 20, 20, 20, 20, 20, 20];
const SMI_EXPECTED = [null, null, 80, 80, 80, 80, 40, 0, -30, -50];
const ZONE_EXPECTED = [
  'none',
  'none',
  'overbought',
  'overbought',
  'overbought',
  'overbought',
  'neutral',
  'neutral',
  'neutral',
  'oversold',
];

// All bars identical with the close at the high -> SMI pins at 100.
const CONST_DATA: ChartLineSmiPoint[] = [
  { x: 1, high: 40, low: 20, close: 40 },
  { x: 2, high: 40, low: 20, close: 40 },
  { x: 3, high: 40, low: 20, close: 40 },
  { x: 4, high: 40, low: 20, close: 40 },
  { x: 5, high: 40, low: 20, close: 40 },
];

describe('getLineSmiFinitePoints', () => {
  it('keeps only bars with finite x, high, low and close', () => {
    const out = getLineSmiFinitePoints([
      { x: 1, high: 30, low: 10, close: 20 },
      { x: Number.NaN, high: 10, low: 5, close: 7 },
      { x: 3, high: 12, low: Number.POSITIVE_INFINITY, close: 7 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
    expect(out).toEqual([
      { x: 1, high: 30, low: 10, close: 20 },
      { x: 4, high: 20, low: 10, close: 15 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineSmiFinitePoints(null)).toEqual([]);
    expect(getLineSmiFinitePoints(undefined)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(getLineSmiFinitePoints([])).toEqual([]);
  });

  it('preserves the input order', () => {
    const out = getLineSmiFinitePoints([
      { x: 9, high: 5, low: 1, close: 3 },
      { x: 2, high: 6, low: 2, close: 4 },
      { x: 5, high: 7, low: 3, close: 5 },
    ]);
    expect(out.map((p) => p.x)).toEqual([9, 2, 5]);
  });
});

describe('normalizeLineSmiPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineSmiPeriod(20, 10)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineSmiPeriod(7.9, 10)).toBe(7);
  });

  it('falls back when the period is below one', () => {
    expect(normalizeLineSmiPeriod(0, 10)).toBe(10);
    expect(normalizeLineSmiPeriod(-3, 10)).toBe(10);
  });

  it('falls back when the period is not finite', () => {
    expect(normalizeLineSmiPeriod(Number.NaN, 10)).toBe(10);
    expect(normalizeLineSmiPeriod('x', 10)).toBe(10);
  });

  it('allows the minimum period of one', () => {
    expect(normalizeLineSmiPeriod(1, 10)).toBe(1);
  });
});

describe('computeLineSmiEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSmiEma(null, 3)).toEqual([]);
  });

  it('seeds from the first finite value', () => {
    expect(computeLineSmiEma([4, 8, 16], 3)[0]).toBe(4);
  });

  it('is the exact dyadic EMA for a period-3 alpha of one half', () => {
    expect(computeLineSmiEma([4, 8, 16], 3)).toEqual([4, 6, 11]);
  });

  it('keeps a constant series constant', () => {
    expect(computeLineSmiEma([7, 7, 7, 7], 3)).toEqual([7, 7, 7, 7]);
  });

  it('carries the previous value across a null slot', () => {
    expect(computeLineSmiEma([null, null, 8], 3)).toEqual([null, null, 8]);
  });

  it('matches the input length', () => {
    expect(computeLineSmiEma([1, 2, 3, 4, 5], 3)).toHaveLength(5);
  });
});

describe('computeLineSmiRaw', () => {
  it('returns empty arrays for a non-array input', () => {
    expect(computeLineSmiRaw(null, 3)).toEqual({ d: [], rangeHL: [] });
  });

  it('matches the input length', () => {
    const raw = computeLineSmiRaw(SMI_DATA, 3);
    expect(raw.d).toHaveLength(SMI_DATA.length);
    expect(raw.rangeHL).toHaveLength(SMI_DATA.length);
  });

  it('keeps the warm-up window null', () => {
    const raw = computeLineSmiRaw(SMI_DATA, 3);
    expect(raw.d[0]).toBeNull();
    expect(raw.d[1]).toBeNull();
    expect(raw.d[2]).not.toBeNull();
  });

  it('computes the exact distance to the range midpoint', () => {
    expect(computeLineSmiRaw(SMI_DATA, 3).d).toEqual(D_EXPECTED);
  });

  it('computes the exact high-low range', () => {
    expect(computeLineSmiRaw(SMI_DATA, 3).rangeHL).toEqual(RANGE_EXPECTED);
  });

  it('is positive when the close sits above the range midpoint', () => {
    expect(computeLineSmiRaw(SMI_DATA, 3).d[2]!).toBeGreaterThan(0);
  });

  it('is negative when the close sits below the range midpoint', () => {
    expect(computeLineSmiRaw(SMI_DATA, 3).d[6]!).toBeLessThan(0);
  });

  it('yields a zero range for a flat bar', () => {
    const flat: ChartLineSmiPoint[] = [
      { x: 1, high: 20, low: 20, close: 20 },
      { x: 2, high: 20, low: 20, close: 20 },
      { x: 3, high: 20, low: 20, close: 20 },
    ];
    expect(computeLineSmiRaw(flat, 3).rangeHL[2]).toBe(0);
  });
});

describe('computeLineSmi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineSmi(null, 3, 3, 3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineSmi(SMI_DATA, 3, 3, 3)).toHaveLength(SMI_DATA.length);
  });

  it('keeps the warm-up window null', () => {
    const smi = computeLineSmi(SMI_DATA, 3, 3, 3);
    expect(smi[0]).toBeNull();
    expect(smi[1]).toBeNull();
  });

  it('computes the exact SMI series', () => {
    expect(computeLineSmi(SMI_DATA, 3, 3, 3)).toEqual(SMI_EXPECTED);
  });

  it('pins at 100 for a constant series with the close at the high', () => {
    expect(computeLineSmi(CONST_DATA, 3, 3, 3)).toEqual([
      null,
      null,
      100,
      100,
      100,
    ]);
  });

  it('yields null when the range is zero', () => {
    const flat: ChartLineSmiPoint[] = [
      { x: 1, high: 20, low: 20, close: 20 },
      { x: 2, high: 20, low: 20, close: 20 },
      { x: 3, high: 20, low: 20, close: 20 },
      { x: 4, high: 20, low: 20, close: 20 },
    ];
    expect(computeLineSmi(flat, 3, 3, 3).every((v) => v === null)).toBe(true);
  });

  it('keeps every defined SMI within -100 and 100', () => {
    for (const v of computeLineSmi(SMI_DATA, 3, 3, 3)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(-100);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is positive when the close leads the range midpoint', () => {
    expect(computeLineSmi(SMI_DATA, 3, 3, 3)[2]!).toBeGreaterThan(0);
  });

  it('is all null when the period exceeds the series length', () => {
    expect(
      computeLineSmi(SMI_DATA.slice(0, 2), 5, 3, 3).every((v) => v === null),
    ).toBe(true);
  });
});

describe('classifyLineSmiZone', () => {
  it('is overbought above the upper threshold', () => {
    expect(classifyLineSmiZone(60, 40, -40)).toBe('overbought');
  });

  it('is oversold below the lower threshold', () => {
    expect(classifyLineSmiZone(-60, 40, -40)).toBe('oversold');
  });

  it('is neutral between the thresholds', () => {
    expect(classifyLineSmiZone(10, 40, -40)).toBe('neutral');
  });

  it('is none for a null reading', () => {
    expect(classifyLineSmiZone(null, 40, -40)).toBe('none');
  });

  it('is none for a non-finite reading', () => {
    expect(classifyLineSmiZone(Number.NaN, 40, -40)).toBe('none');
  });
});

describe('runLineSmi', () => {
  it('is not ok for a series shorter than two bars', () => {
    expect(
      runLineSmi([{ x: 1, high: 30, low: 10, close: 20 }], OPTS).ok,
    ).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(runLineSmi(SMI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the default periods', () => {
    const run = runLineSmi(SMI_DATA);
    expect(run.qPeriod).toBe(10);
    expect(run.smoothPeriod1).toBe(3);
    expect(run.smoothPeriod2).toBe(3);
  });

  it('honours custom periods', () => {
    const run = runLineSmi(SMI_DATA, OPTS);
    expect(run.qPeriod).toBe(3);
    expect(run.smoothPeriod1).toBe(3);
  });

  it('carries the default thresholds', () => {
    const run = runLineSmi(SMI_DATA, OPTS);
    expect(run.upperThreshold).toBe(40);
    expect(run.lowerThreshold).toBe(-40);
  });

  it('honours custom thresholds', () => {
    const run = runLineSmi(SMI_DATA, {
      ...OPTS,
      upperThreshold: 50,
      lowerThreshold: -50,
    });
    expect(run.upperThreshold).toBe(50);
    expect(run.lowerThreshold).toBe(-50);
  });

  it('computes the exact SMI series', () => {
    expect(runLineSmi(SMI_DATA, OPTS).smi).toEqual(SMI_EXPECTED);
  });

  it('classifies the zone of every bar', () => {
    const run = runLineSmi(SMI_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('has self-consistent zone counts', () => {
    const run = runLineSmi(SMI_DATA, OPTS);
    expect(run.overboughtCount).toBe(4);
    expect(run.oversoldCount).toBe(1);
    expect(run.neutralCount).toBe(3);
  });

  it('reports the final SMI reading', () => {
    expect(runLineSmi(SMI_DATA, OPTS).smiFinal).toBe(-50);
  });

  it('carries the raw distance and range arrays', () => {
    const run = runLineSmi(SMI_DATA, OPTS);
    expect(run.d).toEqual(D_EXPECTED);
    expect(run.rangeHL).toEqual(RANGE_EXPECTED);
  });

  it('emits one sample per bar', () => {
    expect(runLineSmi(SMI_DATA, OPTS).samples).toHaveLength(SMI_DATA.length);
  });

  it('sorts the input by x', () => {
    const shuffled = [...SMI_DATA].reverse();
    const run = runLineSmi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual(SMI_DATA.map((p) => p.x));
    expect(run.smi).toEqual(SMI_EXPECTED);
  });

  it('is not ok for an empty series', () => {
    expect(runLineSmi([], OPTS).ok).toBe(false);
    expect(runLineSmi(null, OPTS).ok).toBe(false);
  });
});

describe('computeLineSmiLayout', () => {
  it('is not ok for a single bar', () => {
    const layout = computeLineSmiLayout({
      data: [{ x: 1, high: 30, low: 10, close: 20 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineSmiLayout({
      data: SMI_DATA,
      ...OPTS,
      width: 10,
      height: 10,
      padding: 40,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for the fixture', () => {
    expect(computeLineSmiLayout({ data: SMI_DATA, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the SMI panel', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.smiPanelTop);
  });

  it('builds the price and SMI paths', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.smiPath.startsWith('M')).toBe(true);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(SMI_DATA.length);
  });

  it('emits one marker per defined SMI bar', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    const defined = layout.run.smi.filter((v) => v !== null).length;
    expect(layout.markers).toHaveLength(defined);
  });

  it('orders the upper threshold above zero above the lower threshold', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('carries the run on the layout', () => {
    const layout = computeLineSmiLayout({ data: SMI_DATA, ...OPTS });
    expect(layout.run.smiFinal).toBe(-50);
  });
});

describe('describeLineSmiChart', () => {
  it('names the indicator', () => {
    expect(describeLineSmiChart(SMI_DATA, OPTS)).toContain(
      'Stochastic Momentum Index',
    );
  });

  it('mentions the double-smoothed distance to the midpoint', () => {
    const text = describeLineSmiChart(SMI_DATA, OPTS);
    expect(text).toContain('double-smoothed');
    expect(text).toContain('midpoint');
  });

  it('reports the zone counts', () => {
    const text = describeLineSmiChart(SMI_DATA, OPTS);
    expect(text).toContain('overbought on 4');
    expect(text).toContain('oversold on 1');
  });

  it('returns No data for an empty series', () => {
    expect(describeLineSmiChart([], OPTS)).toBe('No data');
  });
});

describe('ChartLineSmi component', () => {
  it('renders a labelled region', () => {
    render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-smi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Stochastic Momentum Index');
  });

  it('renders the empty state for no data', () => {
    const { container } = render(<ChartLineSmi data={[]} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-smi-empty"]'),
    ).toBeInTheDocument();
  });

  it('marks the root with the run config', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-smi"]');
    expect(root?.getAttribute('data-q-period')).toBe('3');
    expect(root?.getAttribute('data-overbought-count')).toBe('4');
    expect(root?.getAttribute('data-smi-final')).toBe('-50');
  });

  it('renders an img-role svg', () => {
    render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('draws the price and SMI lines', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-smi-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-smi-smi-line"]'),
    ).toBeInTheDocument();
  });

  it('draws the zero line and the two threshold lines', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-smi-zero-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-smi-threshold-line"]',
      ),
    ).toHaveLength(2);
  });

  it('renders one marker per defined SMI bar', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-smi-marker"]',
    );
    expect(markers).toHaveLength(SMI_EXPECTED.filter((v) => v !== null).length);
  });

  it('tags each marker with its zone', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const markers = Array.from(
      container.querySelectorAll('[data-section="chart-line-smi-marker"]'),
    );
    expect(markers.map((m) => m.getAttribute('data-zone'))).toEqual([
      'overbought',
      'overbought',
      'overbought',
      'overbought',
      'neutral',
      'neutral',
      'neutral',
      'oversold',
    ]);
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const labels = container.querySelectorAll(
      '[data-section="chart-line-smi-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });

  it('shows the config badge', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-smi-badge-config"]',
    );
    expect(badge?.textContent).toBe('SMI 3/3/3');
  });

  it('hides the SMI line when its legend item is toggled', () => {
    const { container } = render(<ChartLineSmi data={SMI_DATA} {...OPTS} />);
    const button = container.querySelector(
      '[data-section="chart-line-smi-legend-item"][data-series-id="smi"]',
    ) as HTMLButtonElement;
    fireEvent.click(button);
    expect(
      container.querySelector('[data-section="chart-line-smi-smi-line"]'),
    ).not.toBeInTheDocument();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineSmi data={SMI_DATA} {...OPTS} onPointClick={onPointClick} />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-smi-marker"]',
    ) as SVGElement;
    fireEvent.click(marker);
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSmi ref={ref} data={SMI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-smi');
  });
});
