import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineDerivativeOsc,
  getLineDerivativeOscFinitePoints,
  normalizeLineDerivativeOscPeriod,
  computeLineDerivativeOscRsi,
  computeLineDerivativeOscEma,
  computeLineDerivativeOscSmoothed,
  computeLineDerivativeOscSignal,
  computeLineDerivativeOsc,
  runLineDerivativeOsc,
  computeLineDerivativeOscLayout,
  describeLineDerivativeOscChart,
  DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
  DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
  type ChartLineDerivativeOscPoint,
} from './chart-line-derivative-osc';

afterEach(() => cleanup());

const PARAMS = {
  rsiPeriod: 3,
  ema1Period: 3,
  ema2Period: 3,
  signalPeriod: 3,
};

// A strictly rising price keeps the RSI pinned at an exact 100, so
// both EMAs and the signal SMA stay at 100 and the oscillator is a
// bit-exact zero -- the end-to-end anchor for the pipeline. A
// strictly falling price pins the RSI at 0, a flat price at 50;
// all three collapse the oscillator to zero.
const MONO_UP = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const MONO_DOWN = [19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
const FLAT = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

const DERIV_CLOSES = [
  44, 47, 45, 50, 48, 52, 49, 53, 51, 55, 50, 54, 52, 56,
];
const DERIV_DATA: ChartLineDerivativeOscPoint[] = DERIV_CLOSES.map(
  (value, x) => ({ x, value }),
);

function sma(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = window - 1; i < values.length; i += 1) {
    let sum = 0;
    let ok = true;
    for (let k = i - window + 1; k <= i; k += 1) {
      const v = values[k];
      if (v === null || v === undefined) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / window;
  }
  return out;
}

describe('normalizeLineDerivativeOscPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineDerivativeOscPeriod(14, 99)).toBe(14);
  });
  it('floors a fractional period', () => {
    expect(normalizeLineDerivativeOscPeriod(5.8, 99)).toBe(5);
  });
  it('rejects a zero period', () => {
    expect(normalizeLineDerivativeOscPeriod(0, 99)).toBe(99);
  });
  it('rejects a negative period', () => {
    expect(normalizeLineDerivativeOscPeriod(-3, 99)).toBe(99);
  });
  it('rejects a non-finite period', () => {
    expect(normalizeLineDerivativeOscPeriod(Number.NaN, 99)).toBe(99);
  });
  it('accepts the minimum period of 1', () => {
    expect(normalizeLineDerivativeOscPeriod(1, 99)).toBe(1);
  });
});

describe('getLineDerivativeOscFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineDerivativeOscPoint[];
    expect(getLineDerivativeOscFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });
  it('returns an empty array for a non-array input', () => {
    expect(getLineDerivativeOscFinitePoints(null)).toEqual([]);
  });
  it('returns an empty array for an empty input', () => {
    expect(getLineDerivativeOscFinitePoints([])).toEqual([]);
  });
  it('preserves the input order', () => {
    const points = [
      { x: 5, value: 1 },
      { x: 2, value: 2 },
    ] as ChartLineDerivativeOscPoint[];
    expect(getLineDerivativeOscFinitePoints(points)).toEqual(points);
  });
});

describe('computeLineDerivativeOscRsi', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDerivativeOscRsi(null, 3)).toEqual([]);
  });
  it('is null before the window is full', () => {
    expect(computeLineDerivativeOscRsi([1, 2, 3], 5)).toEqual([
      null,
      null,
      null,
    ]);
  });
  it('computes the exact seed RSI from a hand fixture', () => {
    expect(computeLineDerivativeOscRsi([10, 13, 12], 2)).toEqual([
      null,
      null,
      75,
    ]);
  });
  it('computes the exact Wilder-smoothed RSI after the seed', () => {
    expect(computeLineDerivativeOscRsi([10, 13, 12, 14], 2)).toEqual([
      null,
      null,
      75,
      87.5,
    ]);
  });
  it('reads 100 for a strictly rising price', () => {
    const rsi = computeLineDerivativeOscRsi(MONO_UP, 3);
    expect(rsi.slice(3)).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });
  it('reads 0 for a strictly falling price', () => {
    const rsi = computeLineDerivativeOscRsi(MONO_DOWN, 3);
    expect(rsi.slice(3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it('reads 50 for a flat price', () => {
    const rsi = computeLineDerivativeOscRsi(FLAT, 3);
    expect(rsi.slice(3)).toEqual([50, 50, 50, 50, 50, 50, 50]);
  });
  it('stays within 0..100', () => {
    for (const v of computeLineDerivativeOscRsi(DERIV_CLOSES, 3)) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
  it('matches the input length', () => {
    expect(computeLineDerivativeOscRsi(DERIV_CLOSES, 3)).toHaveLength(
      DERIV_CLOSES.length,
    );
  });
});

describe('computeLineDerivativeOscEma', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDerivativeOscEma(null, 3)).toEqual([]);
  });
  it('advances by alpha times the gap from the prior average', () => {
    expect(computeLineDerivativeOscEma([2, 8, 4], 3)).toEqual([2, 5, 4.5]);
  });
  it('skips a null warm-up prefix and seeds at the first value', () => {
    expect(computeLineDerivativeOscEma([null, null, 2, 8, 4], 3)).toEqual([
      null,
      null,
      2,
      5,
      4.5,
    ]);
  });
  it('holds a constant input bit-exactly constant', () => {
    expect(computeLineDerivativeOscEma([100, 100, 100, 100], 5)).toEqual([
      100, 100, 100, 100,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineDerivativeOscEma([1, 2, 3, 4], 3)).toHaveLength(4);
  });
});

describe('computeLineDerivativeOscSmoothed', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDerivativeOscSmoothed(null, PARAMS)).toEqual([]);
  });
  it('is the RSI run through two exponential averages', () => {
    const rsi = computeLineDerivativeOscRsi(DERIV_CLOSES, 3);
    const expected = computeLineDerivativeOscEma(
      computeLineDerivativeOscEma(rsi, 3),
      3,
    );
    expect(computeLineDerivativeOscSmoothed(DERIV_CLOSES, PARAMS)).toEqual(
      expected,
    );
  });
  it('stays at 100 for a strictly rising price', () => {
    expect(
      computeLineDerivativeOscSmoothed(MONO_UP, PARAMS).slice(3),
    ).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });
  it('matches the input length', () => {
    expect(computeLineDerivativeOscSmoothed(DERIV_CLOSES, PARAMS)).toHaveLength(
      DERIV_CLOSES.length,
    );
  });
});

describe('computeLineDerivativeOscSignal', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDerivativeOscSignal(null, PARAMS)).toEqual([]);
  });
  it('is the moving average of the double-smoothed RSI', () => {
    const smoothed = computeLineDerivativeOscSmoothed(DERIV_CLOSES, PARAMS);
    expect(computeLineDerivativeOscSignal(DERIV_CLOSES, PARAMS)).toEqual(
      sma(smoothed, 3),
    );
  });
  it('lags the smoothed RSI by the signal window', () => {
    expect(
      computeLineDerivativeOscSignal(DERIV_CLOSES, PARAMS).slice(0, 5),
    ).toEqual([null, null, null, null, null]);
  });
  it('matches the input length', () => {
    expect(computeLineDerivativeOscSignal(DERIV_CLOSES, PARAMS)).toHaveLength(
      DERIV_CLOSES.length,
    );
  });
});

describe('computeLineDerivativeOsc', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineDerivativeOsc(null, PARAMS)).toEqual([]);
  });
  it('is the double-smoothed RSI minus its signal', () => {
    const smoothed = computeLineDerivativeOscSmoothed(DERIV_CLOSES, PARAMS);
    const signal = computeLineDerivativeOscSignal(DERIV_CLOSES, PARAMS);
    const osc = computeLineDerivativeOsc(DERIV_CLOSES, PARAMS);
    for (let i = 0; i < osc.length; i += 1) {
      const o = osc[i];
      if (o !== null) {
        expect(o).toBe((smoothed[i] as number) - (signal[i] as number));
      }
    }
  });
  it('collapses to an exact zero for a strictly rising price', () => {
    expect(computeLineDerivativeOsc(MONO_UP, PARAMS)).toEqual([
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
    ]);
  });
  it('collapses to an exact zero for a strictly falling price', () => {
    expect(computeLineDerivativeOsc(MONO_DOWN, PARAMS)).toEqual([
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
    ]);
  });
  it('collapses to an exact zero for a flat price', () => {
    expect(computeLineDerivativeOsc(FLAT, PARAMS)).toEqual([
      null,
      null,
      null,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
    ]);
  });
  it('matches the input length', () => {
    expect(computeLineDerivativeOsc(DERIV_CLOSES, PARAMS)).toHaveLength(
      DERIV_CLOSES.length,
    );
  });
});

describe('runLineDerivativeOsc', () => {
  it('is not ok with fewer than two points', () => {
    expect(runLineDerivativeOsc([{ x: 0, value: 1 }], PARAMS).ok).toBe(false);
  });
  it('is ok with a usable series', () => {
    expect(runLineDerivativeOsc(DERIV_DATA, PARAMS).ok).toBe(true);
  });
  it('carries the resolved periods', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    expect(run.rsiPeriod).toBe(3);
    expect(run.ema1Period).toBe(3);
    expect(run.ema2Period).toBe(3);
    expect(run.signalPeriod).toBe(3);
  });
  it('falls back to the classic default periods', () => {
    const run = runLineDerivativeOsc(DERIV_DATA);
    expect(run.rsiPeriod).toBe(DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD);
    expect(run.signalPeriod).toBe(
      DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
    );
  });
  it('exposes the smoothed RSI as the double exponential average', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    const expected = computeLineDerivativeOscEma(
      computeLineDerivativeOscEma(run.rsi, 3),
      3,
    );
    expect(run.smoothed).toEqual(expected);
  });
  it('keeps the oscillator equal to smoothed minus signal', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    for (let i = 0; i < run.osc.length; i += 1) {
      const o = run.osc[i];
      if (o !== null) {
        expect(o).toBe(
          (run.smoothed[i] as number) - (run.signal[i] as number),
        );
      }
    }
  });
  it('classifies each bar by the sign of the oscillator', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    for (const s of run.samples) {
      if (s.osc === null) expect(s.zone).toBe('none');
      else if (s.osc > 0) expect(s.zone).toBe('positive');
      else if (s.osc < 0) expect(s.zone).toBe('negative');
      else expect(s.zone).toBe('zero');
    }
  });
  it('crosses zero so both signs appear', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    expect(run.positiveCount).toBeGreaterThan(0);
    expect(run.negativeCount).toBeGreaterThan(0);
  });
  it('returns one sample per point', () => {
    expect(runLineDerivativeOsc(DERIV_DATA, PARAMS).samples).toHaveLength(
      DERIV_DATA.length,
    );
  });
  it('reports the final oscillator reading', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    const defined = run.osc.filter((v): v is number => v !== null);
    expect(run.oscFinal).toBe(defined[defined.length - 1]);
  });
  it('sorts unsorted input by x', () => {
    const shuffled = [...DERIV_DATA].reverse();
    const run = runLineDerivativeOsc(shuffled, PARAMS);
    const xs = run.series.map((p) => p.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('computeLineDerivativeOscLayout', () => {
  const base = {
    data: DERIV_DATA,
    rsiPeriod: 3,
    ema1Period: 3,
    ema2Period: 3,
    signalPeriod: 3,
    width: 560,
    height: 360,
    padding: 40,
  };
  it('is not ok for a single point', () => {
    expect(
      computeLineDerivativeOscLayout({ ...base, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
  it('is not ok for a collapsed canvas', () => {
    expect(computeLineDerivativeOscLayout({ ...base, width: 0 }).ok).toBe(
      false,
    );
  });
  it('is ok for a usable series', () => {
    expect(computeLineDerivativeOscLayout(base).ok).toBe(true);
  });
  it('stacks the price panel above the oscillator panel', () => {
    const layout = computeLineDerivativeOscLayout(base);
    expect(layout.pricePanel.y).toBeLessThan(layout.oscPanel.y);
  });
  it('builds the price and oscillator paths', () => {
    const layout = computeLineDerivativeOscLayout(base);
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.oscPath.length).toBeGreaterThan(0);
  });
  it('includes zero in the oscillator y-domain', () => {
    const layout = computeLineDerivativeOscLayout(base);
    expect(layout.oscYMin).toBeLessThanOrEqual(0);
    expect(layout.oscYMax).toBeGreaterThanOrEqual(0);
  });
  it('emits one marker per defined oscillator bar', () => {
    const layout = computeLineDerivativeOscLayout(base);
    expect(layout.markers).toHaveLength(DERIV_CLOSES.length - 5);
    expect(layout.priceDots).toHaveLength(DERIV_CLOSES.length);
  });
  it('reports the periods and total points', () => {
    const layout = computeLineDerivativeOscLayout(base);
    expect(layout.rsiPeriod).toBe(3);
    expect(layout.totalPoints).toBe(DERIV_CLOSES.length);
  });
});

describe('describeLineDerivativeOscChart', () => {
  it('reports no data for an empty series', () => {
    expect(describeLineDerivativeOscChart([])).toBe('No data');
  });
  it('names the Derivative Oscillator', () => {
    expect(describeLineDerivativeOscChart(DERIV_DATA, PARAMS)).toContain(
      'Derivative Oscillator',
    );
  });
  it('explains the double-smoothed RSI and signal', () => {
    const desc = describeLineDerivativeOscChart(DERIV_DATA, PARAMS);
    expect(desc).toContain('double-smooth');
    expect(desc).toContain('RSI');
    expect(desc).toContain('signal');
  });
  it('reports the zone counts', () => {
    const run = runLineDerivativeOsc(DERIV_DATA, PARAMS);
    const desc = describeLineDerivativeOscChart(DERIV_DATA, PARAMS);
    expect(desc).toContain(`positive on ${run.positiveCount} bars`);
  });
});

describe('ChartLineDerivativeOsc', () => {
  it('renders an accessible region', () => {
    const { getByRole } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    expect(getByRole('region')).toBeTruthy();
  });
  it('applies the aria label', () => {
    const { getByRole } = render(
      <ChartLineDerivativeOsc
        data={DERIV_DATA}
        {...PARAMS}
        ariaLabel="DO demo"
      />,
    );
    expect(getByRole('region').getAttribute('aria-label')).toBe('DO demo');
  });
  it('renders the empty state with no data', () => {
    const { container } = render(<ChartLineDerivativeOsc data={[]} />);
    const root = container.querySelector(
      '[data-section="chart-line-derivative-osc"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('true');
  });
  it('marks the populated root as not empty', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-derivative-osc"]',
    );
    expect(root?.getAttribute('data-empty')).toBe('false');
  });
  it('exposes the periods as data attributes', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-derivative-osc"]',
    );
    expect(root?.getAttribute('data-rsi-period')).toBe('3');
    expect(root?.getAttribute('data-signal-period')).toBe('3');
  });
  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-derivative-osc-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });
  it('draws the oscillator line', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-derivative-osc-osc-line"]',
      ),
    ).toBeTruthy();
  });
  it('renders one marker per defined oscillator bar', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-derivative-osc-marker"]',
    );
    expect(markers).toHaveLength(DERIV_CLOSES.length - 5);
  });
  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-derivative-osc-panel-label"]',
    );
    expect(labels).toHaveLength(2);
  });
  it('shows the periods in the config badge', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const cfg = container.querySelector(
      '[data-section="chart-line-derivative-osc-badge-config"]',
    );
    expect(cfg?.textContent).toBe('3/3/3/3');
  });
  it('toggles the oscillator off when its legend item is clicked', () => {
    const { container } = render(
      <ChartLineDerivativeOsc data={DERIV_DATA} {...PARAMS} />,
    );
    const oscItem = container.querySelector(
      '[data-section="chart-line-derivative-osc-legend-item"][data-series-id="osc"]',
    ) as HTMLElement;
    fireEvent.click(oscItem);
    expect(
      container.querySelector(
        '[data-section="chart-line-derivative-osc-osc-line"]',
      ),
    ).toBeNull();
  });
  it('honours a controlled hiddenSeries set', () => {
    const { container } = render(
      <ChartLineDerivativeOsc
        data={DERIV_DATA}
        {...PARAMS}
        hiddenSeries={new Set(['price'])}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-derivative-osc-price-path"]',
      ),
    ).toBeNull();
  });
  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineDerivativeOsc ref={ref} data={DERIV_DATA} {...PARAMS} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
