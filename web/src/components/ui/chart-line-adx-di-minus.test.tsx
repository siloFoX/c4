import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineAdxDiMinus,
  DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD,
  DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD,
  classifyLineAdxDiMinusZone,
  computeLineAdxDiMinus,
  computeLineAdxDiMinusLayout,
  computeLineAdxDiMinusSma,
  describeLineAdxDiMinusChart,
  getLineAdxDiMinusFinitePoints,
  normalizeLineAdxDiMinusPeriod,
  normalizeLineAdxDiMinusThreshold,
  runLineAdxDiMinus,
  type ChartLineAdxDiMinusPoint,
} from './chart-line-adx-di-minus';

const CONST_FLAT: ChartLineAdxDiMinusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

const RISING: ChartLineAdxDiMinusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: i + 10, low: i + 10, close: i + 10 }),
);

const FALLING: ChartLineAdxDiMinusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 19 - i, low: 19 - i, close: 19 - i }),
);

// FALLING_HALF: low == close == 19 - i, high == 21 - i.
// At bar i >= 1: upMove = (21-i) - (21-(i-1)) = -1. downMove =
// (19-(i-1)) - (19-i) = 1. minusDM = 1. TR = max(hl=2,
// hc=|21-i-(19-(i-1))|=|21-i-20+i|=1, lc=|19-i-(19-(i-1))|
// =|19-i-20+i|=1) = 2. SMA(minusDM, 4) = 1, SMA(TR, 4) = 2.
// -DI = 100 * 1 / 2 = 50 bit-exact.
const FALLING_HALF: ChartLineAdxDiMinusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 21 - i, low: 19 - i, close: 19 - i }),
);

const WAVE: ChartLineAdxDiMinusPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4, threshold: 25 } as const;

describe('getLineAdxDiMinusFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAdxDiMinusFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAdxDiMinusFinitePoints(
        'nope' as unknown as ChartLineAdxDiMinusPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineAdxDiMinusPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineAdxDiMinusFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineAdxDiMinusPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineAdxDiMinusFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineAdxDiMinusPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAdxDiMinusPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAdxDiMinusPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineAdxDiMinusPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxDiMinusPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineAdxDiMinusThreshold', () => {
  it('keeps a valid threshold', () => {
    expect(normalizeLineAdxDiMinusThreshold(40, 25)).toBe(40);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineAdxDiMinusThreshold(0, 25)).toBe(25);
    expect(normalizeLineAdxDiMinusThreshold(-1, 25)).toBe(25);
  });

  it('falls back for > 100', () => {
    expect(normalizeLineAdxDiMinusThreshold(120, 25)).toBe(25);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxDiMinusThreshold(Number.NaN, 25)).toBe(25);
  });
});

describe('computeLineAdxDiMinusSma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineAdxDiMinusSma([], 4)).toEqual([]);
  });

  it('constant input: SMA = constant bit-exact', () => {
    const out = computeLineAdxDiMinusSma([7, 7, 7, 7, 7], 4);
    expect(out[3]).toBe(7);
    expect(out[4]).toBe(7);
  });
});

describe('computeLineAdxDiMinus', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineAdxDiMinus(null, 4)).toEqual([]);
    expect(computeLineAdxDiMinus([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineAdxDiMinus(RISING, 4)).toHaveLength(RISING.length);
  });

  it('CONST_FLAT: -DI null at every bar (TR = 0)', () => {
    const out = computeLineAdxDiMinus(CONST_FLAT, 4);
    for (const v of out) expect(v).toBeNull();
  });

  it('RISING period 4: -DI = 0 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiMinus(RISING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('FALLING period 4: -DI = 100 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiMinus(FALLING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('FALLING_HALF period 4: -DI = 50 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiMinus(FALLING_HALF, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(50);
  });

  it('warm-up bars are null', () => {
    const out = computeLineAdxDiMinus(FALLING, 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('translation invariance: shifting OHLC by k leaves -DI unchanged', () => {
    const a = computeLineAdxDiMinus(FALLING, 4);
    const shifted = FALLING.map((p) => ({
      ...p,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineAdxDiMinus(shifted, 4);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('reads finite and bounded in [0, 100] on the wave', () => {
    const out = computeLineAdxDiMinus(WAVE, 4);
    for (let i = 4; i < out.length; i += 1) {
      const v = out[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('classifyLineAdxDiMinusZone', () => {
  it('value >= 2 * threshold -> strong', () => {
    expect(classifyLineAdxDiMinusZone(60, 25)).toBe('strong');
  });

  it('threshold <= value < 2 * threshold -> bear', () => {
    expect(classifyLineAdxDiMinusZone(30, 25)).toBe('bear');
  });

  it('value < threshold -> weak', () => {
    expect(classifyLineAdxDiMinusZone(20, 25)).toBe('weak');
  });

  it('null -> none', () => {
    expect(classifyLineAdxDiMinusZone(null, 25)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineAdxDiMinusZone(Number.NaN, 25)).toBe('none');
  });
});

describe('runLineAdxDiMinus', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineAdxDiMinus([{ x: 0, high: 1, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAdxDiMinus([], OPTS).ok).toBe(false);
    expect(runLineAdxDiMinus(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineAdxDiMinus(FALLING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineAdxDiMinus(FALLING).period).toBe(
      DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD,
    );
    expect(runLineAdxDiMinus(FALLING).threshold).toBe(
      DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineAdxDiMinus(FALLING, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(25);
  });

  it('produces one sample per finite point', () => {
    expect(runLineAdxDiMinus(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('FALLING threshold 25: defined samples are strong (-DI = 100 >= 50)', () => {
    const run = runLineAdxDiMinus(FALLING, OPTS);
    expect(run.strongCount).toBe(FALLING.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('FALLING_HALF threshold 25: defined samples are strong (-DI = 50 boundary)', () => {
    const run = runLineAdxDiMinus(FALLING_HALF, OPTS);
    expect(run.strongCount).toBe(FALLING_HALF.length - 4);
  });

  it('RISING threshold 25: defined samples are weak (-DI = 0)', () => {
    const run = runLineAdxDiMinus(RISING, OPTS);
    expect(run.weakCount).toBe(RISING.length - 4);
    expect(run.strongCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineAdxDiMinus(FALLING, OPTS).diMinusFinal).toBe(100);
    expect(runLineAdxDiMinus(FALLING_HALF, OPTS).diMinusFinal).toBe(50);
    expect(runLineAdxDiMinus(RISING, OPTS).diMinusFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...FALLING].sort(() => -1);
    const run = runLineAdxDiMinus(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineAdxDiMinus(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.strongCount + run.bearCount + run.weakCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineAdxDiMinusLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAdxDiMinusLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAdxDiMinusLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineAdxDiMinusLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineAdxDiMinusLayout({ data: FALLING, ...OPTS });
    expect(layout.priceDots).toHaveLength(FALLING.length);
  });

  it('emits one marker per defined -DI bar', () => {
    const layout = computeLineAdxDiMinusLayout({ data: FALLING, ...OPTS });
    expect(layout.markers).toHaveLength(FALLING.length - 4);
  });

  it('builds a non-empty -DI path on FALLING', () => {
    const layout = computeLineAdxDiMinusLayout({ data: FALLING, ...OPTS });
    expect(layout.diMinusPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the -DI panel', () => {
    const layout = computeLineAdxDiMinusLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.diMinusPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.diMinusPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineAdxDiMinusLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.diMinusPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineAdxDiMinusLayout({ data: FALLING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(25);
  });
});

describe('describeLineAdxDiMinusChart', () => {
  it('names the indicator', () => {
    expect(describeLineAdxDiMinusChart(FALLING, OPTS)).toContain('-DI');
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineAdxDiMinusChart(FALLING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 25');
  });

  it('mentions the pure-falling identity', () => {
    expect(describeLineAdxDiMinusChart(FALLING, OPTS)).toContain(
      'pure falling trend',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAdxDiMinusChart([])).toBe('No data');
    expect(describeLineAdxDiMinusChart(null)).toBe('No data');
  });
});

describe('<ChartLineAdxDiMinus />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />);
    expect(
      screen.getByRole('region', { name: /-DI directional indicator chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-di-minus-aria-desc"]',
    );
    expect(desc?.textContent).toContain('-DI');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={[]} period={4} threshold={25} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-di-minus-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-di-minus"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('25');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(FALLING.length),
    );
  });

  it('renders the price line and the -DI line', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-minus-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-adx-di-minus-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every FALLING marker as strong (-DI = 100)', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adx-di-minus-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('strong');
  });

  it('marks every RISING marker as weak (-DI = 0)', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={RISING} period={4} threshold={25} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adx-di-minus-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('weak');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-adx-di-minus-badge-config"]',
    );
    expect(badge?.textContent).toContain('-DI 4');
    expect(badge?.textContent).toContain('25');
  });

  it('hides the -DI line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAdxDiMinus data={FALLING} period={4} threshold={25} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-adx-di-minus-legend-item"][data-series-id="diMinus"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-adx-di-minus-line"]'),
    ).toBeNull();
  });

  it('hides the -DI line via showDiMinus=false', () => {
    const { container } = render(
      <ChartLineAdxDiMinus
        data={FALLING}
        period={4}
        threshold={25}
        showDiMinus={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-di-minus-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAdxDiMinus
        data={FALLING}
        period={4}
        threshold={25}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-adx-di-minus-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAdxDiMinus
        ref={ref}
        data={FALLING}
        period={4}
        threshold={25}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
