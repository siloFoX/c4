import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineRocketRsi,
  DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD,
  DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1,
  DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2,
  classifyLineRocketRsiZone,
  computeLineRocketRsi,
  computeLineRocketRsiFisher,
  computeLineRocketRsiLayout,
  computeLineRocketRsiRSI,
  computeLineRocketRsiSmooth,
  describeLineRocketRsiChart,
  getLineRocketRsiFinitePoints,
  normalizeLineRocketRsiClamp,
  normalizeLineRocketRsiInteger,
  runLineRocketRsi,
  type ChartLineRocketRsiPoint,
} from './chart-line-rocket-rsi';

const toPoints = (values: number[]): ChartLineRocketRsiPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineRocketRsiPoint[] = toPoints(
  Array.from({ length: 25 }, () => 5),
);
const RISING: ChartLineRocketRsiPoint[] = toPoints(
  Array.from({ length: 25 }, (_, i) => 10 + i),
);
const FALLING: ChartLineRocketRsiPoint[] = toPoints(
  Array.from({ length: 25 }, (_, i) => 30 - i),
);
const WAVE: ChartLineRocketRsiPoint[] = Array.from(
  { length: 40 },
  (_, i) => ({
    x: i,
    value: 50 + 10 * Math.sin(i * 0.4),
  }),
);

const OPTS = { rsiPeriod: 4, smooth1: 3, smooth2: 3 } as const;

describe('getLineRocketRsiFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineRocketRsiFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineRocketRsiFinitePoints(
        'nope' as unknown as ChartLineRocketRsiPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineRocketRsiPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineRocketRsiFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineRocketRsiFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineRocketRsiInteger', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineRocketRsiInteger(8, 8)).toBe(8);
  });

  it('floors a fractional', () => {
    expect(normalizeLineRocketRsiInteger(8.9, 8)).toBe(8);
  });

  it('falls back for a sub-min value', () => {
    expect(normalizeLineRocketRsiInteger(0, 8)).toBe(8);
  });

  it('respects a custom minimum', () => {
    expect(normalizeLineRocketRsiInteger(3, 8, 5)).toBe(8);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineRocketRsiInteger(Number.NaN, 8)).toBe(8);
  });
});

describe('normalizeLineRocketRsiClamp', () => {
  it('keeps a clamp inside (0, 1)', () => {
    expect(normalizeLineRocketRsiClamp(0.95, 0.999)).toBe(0.95);
  });

  it('falls back for zero', () => {
    expect(normalizeLineRocketRsiClamp(0, 0.999)).toBe(0.999);
  });

  it('falls back for one', () => {
    expect(normalizeLineRocketRsiClamp(1, 0.999)).toBe(0.999);
  });

  it('falls back for negative', () => {
    expect(normalizeLineRocketRsiClamp(-0.1, 0.999)).toBe(0.999);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineRocketRsiClamp(Number.NaN, 0.999)).toBe(0.999);
  });
});

describe('computeLineRocketRsiRSI', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLineRocketRsiRSI(null, 4)).toEqual([]);
    expect(computeLineRocketRsiRSI([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineRocketRsiRSI(RISING.map((p) => p.value), 4);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineRocketRsiRSI(RISING.map((p) => p.value), 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('returns 50 at every defined bar of a constant series (the flat convention)', () => {
    const out = computeLineRocketRsiRSI(CONST_FLAT.map((p) => p.value), 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(50);
  });

  it('returns 100 at every defined bar of a strictly rising series', () => {
    const out = computeLineRocketRsiRSI(RISING.map((p) => p.value), 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('returns 0 at every defined bar of a strictly falling series', () => {
    const out = computeLineRocketRsiRSI(FALLING.map((p) => p.value), 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('returns a value in [0, 100] at every defined bar', () => {
    const out = computeLineRocketRsiRSI(WAVE.map((p) => p.value), 4);
    for (const v of out) {
      if (v === null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('falls back via the period normalization on non-finite input', () => {
    const out = computeLineRocketRsiRSI(
      RISING.map((p) => p.value),
      Number.NaN,
    );
    expect(out).toHaveLength(RISING.length);
  });
});

describe('computeLineRocketRsiSmooth', () => {
  it('returns an empty list for non-array', () => {
    expect(computeLineRocketRsiSmooth(null, 3)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineRocketRsiSmooth([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(5);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineRocketRsiSmooth([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
  });

  it('the SMA of a constant series is the constant (bit-exact)', () => {
    const out = computeLineRocketRsiSmooth([5, 5, 5, 5, 5, 5], 3);
    expect(out[2]).toBe(5);
    expect(out[3]).toBe(5);
    expect(out[4]).toBe(5);
    expect(out[5]).toBe(5);
  });

  it('the SMA of [1..5] window 3 is [null, null, 2, 3, 4]', () => {
    const out = computeLineRocketRsiSmooth([1, 2, 3, 4, 5], 3);
    expect(out).toEqual([null, null, 2, 3, 4]);
  });

  it('outputs null when the window contains a null', () => {
    const out = computeLineRocketRsiSmooth([1, null, 3, 4, 5], 3);
    expect(out[3]).toBeNull();
  });
});

describe('computeLineRocketRsiFisher', () => {
  it('Fisher(0) is exactly 0 (the bit-exact anchor)', () => {
    expect(computeLineRocketRsiFisher(0)).toBe(0);
  });

  it('Fisher is antisymmetric within ULP: Fisher(-x) ~= -Fisher(x)', () => {
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(computeLineRocketRsiFisher(-x)).toBeCloseTo(
        -computeLineRocketRsiFisher(x),
        12,
      );
    }
  });

  it('matches the worked Fisher(0.5) = 0.5 * ln(3)', () => {
    expect(computeLineRocketRsiFisher(0.5)).toBeCloseTo(
      0.5 * Math.log(3),
      12,
    );
  });

  it('clamps inputs above 1 to the clamp value', () => {
    const clamp = 0.999;
    expect(computeLineRocketRsiFisher(2, clamp)).toBe(
      computeLineRocketRsiFisher(clamp, clamp),
    );
  });

  it('clamps inputs below -1 to the negative clamp', () => {
    const clamp = 0.999;
    expect(computeLineRocketRsiFisher(-2, clamp)).toBe(
      computeLineRocketRsiFisher(-clamp, clamp),
    );
  });

  it('returns 0 for non-finite input', () => {
    expect(computeLineRocketRsiFisher(Number.NaN)).toBe(0);
  });

  it('the clamp parameter controls the saturation magnitude', () => {
    const tight = computeLineRocketRsiFisher(1, 0.5);
    const loose = computeLineRocketRsiFisher(1, 0.95);
    expect(Math.abs(loose)).toBeGreaterThan(Math.abs(tight));
  });
});

describe('classifyLineRocketRsiZone', () => {
  it('null -> none', () => {
    expect(classifyLineRocketRsiZone(null)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineRocketRsiZone(Number.NaN)).toBe('none');
  });

  it('positive -> up', () => {
    expect(classifyLineRocketRsiZone(0.5)).toBe('up');
  });

  it('negative -> down', () => {
    expect(classifyLineRocketRsiZone(-0.5)).toBe('down');
  });

  it('exact zero -> flat', () => {
    expect(classifyLineRocketRsiZone(0)).toBe('flat');
  });
});

describe('computeLineRocketRsi', () => {
  it('returns empty arrays for non-array or empty input', () => {
    expect(computeLineRocketRsi(null)).toEqual({
      rsi: [],
      smoothed: [],
      rocketRsi: [],
    });
    expect(computeLineRocketRsi([])).toEqual({
      rsi: [],
      smoothed: [],
      rocketRsi: [],
    });
  });

  it('matches input length on all three arrays', () => {
    const out = computeLineRocketRsi(RISING.map((p) => p.value), OPTS);
    expect(out.rsi).toHaveLength(RISING.length);
    expect(out.smoothed).toHaveLength(RISING.length);
    expect(out.rocketRsi).toHaveLength(RISING.length);
  });

  it('a constant series gives Rocket RSI = 0 bit-exact at every defined bar', () => {
    const out = computeLineRocketRsi(CONST_FLAT.map((p) => p.value), OPTS);
    // rsiPeriod 4 + smooth1 3 - 1 + smooth2 3 - 1 = 4 + 2 + 2 = 8 warm-up bars.
    const warm = 4 + 3 - 1 + 3 - 1;
    for (let i = warm; i < out.rocketRsi.length; i += 1) {
      expect(out.rocketRsi[i]).toBe(0);
    }
  });

  it('a rising series saturates the Rocket RSI to a positive value', () => {
    const out = computeLineRocketRsi(RISING.map((p) => p.value), OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    for (let i = warm; i < out.rocketRsi.length; i += 1) {
      const v = out.rocketRsi[i];
      expect(v).not.toBeNull();
      expect(v!).toBeGreaterThan(0);
    }
  });

  it('a falling series saturates the Rocket RSI to a negative value', () => {
    const out = computeLineRocketRsi(FALLING.map((p) => p.value), OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    for (let i = warm; i < out.rocketRsi.length; i += 1) {
      const v = out.rocketRsi[i];
      expect(v).not.toBeNull();
      expect(v!).toBeLessThan(0);
    }
  });

  it('rising and falling Rocket RSI are antisymmetric in magnitude within ULP', () => {
    const up = computeLineRocketRsi(RISING.map((p) => p.value), OPTS);
    const down = computeLineRocketRsi(FALLING.map((p) => p.value), OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    for (let i = warm; i < up.rocketRsi.length; i += 1) {
      const u = up.rocketRsi[i]!;
      const d = down.rocketRsi[i]!;
      expect(d).toBeCloseTo(-u, 12);
    }
  });

  it('every defined Rocket RSI value is finite', () => {
    const out = computeLineRocketRsi(WAVE.map((p) => p.value), OPTS);
    for (const v of out.rocketRsi) {
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('honours a custom clamp by reducing the saturation magnitude', () => {
    const loose = computeLineRocketRsi(RISING.map((p) => p.value), {
      ...OPTS,
      clamp: 0.999,
    });
    const tight = computeLineRocketRsi(RISING.map((p) => p.value), {
      ...OPTS,
      clamp: 0.5,
    });
    const warm = 4 + 3 - 1 + 3 - 1;
    const lastLoose = loose.rocketRsi[loose.rocketRsi.length - 1]!;
    const lastTight = tight.rocketRsi[tight.rocketRsi.length - 1]!;
    expect(Math.abs(lastLoose)).toBeGreaterThan(Math.abs(lastTight));
    void warm;
  });
});

describe('runLineRocketRsi', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineRocketRsi([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineRocketRsi([]).ok).toBe(false);
    expect(runLineRocketRsi(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineRocketRsi(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default rsiPeriod / smooth1 / smooth2', () => {
    const run = runLineRocketRsi(RISING);
    expect(run.rsiPeriod).toBe(DEFAULT_CHART_LINE_ROCKET_RSI_RSI_PERIOD);
    expect(run.smooth1).toBe(DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH1);
    expect(run.smooth2).toBe(DEFAULT_CHART_LINE_ROCKET_RSI_SMOOTH2);
  });

  it('honours custom options', () => {
    const run = runLineRocketRsi(RISING, {
      rsiPeriod: 6,
      smooth1: 4,
      smooth2: 7,
      clamp: 0.9,
    });
    expect(run.rsiPeriod).toBe(6);
    expect(run.smooth1).toBe(4);
    expect(run.smooth2).toBe(7);
    expect(run.clamp).toBe(0.9);
  });

  it('classifies a constant series as flat after the warm-up (bit-exact)', () => {
    const run = runLineRocketRsi(CONST_FLAT, OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    expect(run.flatCount).toBe(CONST_FLAT.length - warm);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('classifies a rising series as up after the warm-up', () => {
    const run = runLineRocketRsi(RISING, OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    expect(run.upCount).toBe(RISING.length - warm);
    expect(run.downCount).toBe(0);
  });

  it('classifies a falling series as down after the warm-up', () => {
    const run = runLineRocketRsi(FALLING, OPTS);
    const warm = 4 + 3 - 1 + 3 - 1;
    expect(run.downCount).toBe(FALLING.length - warm);
    expect(run.upCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineRocketRsi(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineRocketRsi(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineRocketRsi(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final Rocket RSI value', () => {
    const run = runLineRocketRsi(CONST_FLAT, OPTS);
    expect(run.rocketFinal).toBe(0);
  });
});

describe('computeLineRocketRsiLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineRocketRsiLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineRocketRsiLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineRocketRsiLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('stacks the price panel above the rocket panel', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.rocketPanelTop);
  });

  it('builds non-empty paths for price and rocket', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.rocketPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE.length);
  });

  it('emits one marker per defined-rocket bar', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    const definedBars = layout.run.samples.filter(
      (s) => s.rocketRsi !== null,
    ).length;
    expect(layout.markers).toHaveLength(definedBars);
  });

  it('puts the zero line inside the rocket panel', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.rocketPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.rocketPanelBottom);
  });

  it('every marker lies inside the rocket panel', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.rocketPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.rocketPanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineRocketRsiLayout({ data: WAVE, ...OPTS });
    expect(layout.run.rsiPeriod).toBe(4);
    expect(layout.run.samples).toHaveLength(WAVE.length);
  });
});

describe('describeLineRocketRsiChart', () => {
  it('names the indicator', () => {
    expect(describeLineRocketRsiChart(RISING, OPTS)).toContain('Rocket RSI');
  });

  it('mentions the Fisher Transform', () => {
    expect(describeLineRocketRsiChart(RISING, OPTS)).toContain(
      'Fisher Transform',
    );
  });

  it('mentions the double smoothing', () => {
    expect(describeLineRocketRsiChart(RISING, OPTS)).toContain('smoothed twice');
  });

  it('mentions the lookback periods', () => {
    expect(describeLineRocketRsiChart(RISING, OPTS)).toContain('rsiPeriod 4');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineRocketRsiChart([])).toBe('No data');
    expect(describeLineRocketRsiChart(null)).toBe('No data');
  });
});

describe('<ChartLineRocketRsi />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Rocket RSI chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-rocket-rsi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Rocket RSI');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineRocketRsi data={[]} rsiPeriod={4} smooth1={3} smooth2={3} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-rocket-rsi-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors rsiPeriod / smooth1 / smooth2 on the root', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-rocket-rsi"]',
    );
    expect(root?.getAttribute('data-rsi-period')).toBe('4');
    expect(root?.getAttribute('data-smooth1')).toBe('3');
    expect(root?.getAttribute('data-smooth2')).toBe('3');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the rocket line', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rocket-rsi-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-rocket-rsi-rocket-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the zero line by default', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rocket-rsi-zero-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders markers for the defined-rocket bars', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rocket-rsi-marker"]',
    );
    expect(markers.length).toBeGreaterThan(0);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-rocket-rsi-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['up', 'down', 'flat']).toContain(zone);
    }
  });

  it('renders the config badge with the parameters', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-rocket-rsi-badge-config"]',
    );
    expect(badge?.textContent).toContain('ROCKET 4/3/3');
  });

  it('hides the rocket line via the legend toggle', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-rocket-rsi-legend-item"][data-series-id="rocket"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-rocket-rsi-rocket-line"]',
      ),
    ).toBeNull();
  });

  it('hides the zero line via showZeroLine=false', () => {
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
        showZeroLine={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-rocket-rsi-zero-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineRocketRsi
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-rocket-rsi-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineRocketRsi
        ref={ref}
        data={RISING}
        rsiPeriod={4}
        smooth1={3}
        smooth2={3}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
