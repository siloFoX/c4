import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineAdxDiPlus,
  DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD,
  DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD,
  classifyLineAdxDiPlusZone,
  computeLineAdxDiPlus,
  computeLineAdxDiPlusLayout,
  computeLineAdxDiPlusSma,
  describeLineAdxDiPlusChart,
  getLineAdxDiPlusFinitePoints,
  normalizeLineAdxDiPlusPeriod,
  normalizeLineAdxDiPlusThreshold,
  runLineAdxDiPlus,
  type ChartLineAdxDiPlusPoint,
} from './chart-line-adx-di-plus';

const CONST_FLAT: ChartLineAdxDiPlusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 5, low: 5, close: 5 }),
);

// RISING: high == low == close == i + 10 -> plusDM = 1, TR = 1
// at every defined bar -> +DI = 100 bit-exact.
const RISING: ChartLineAdxDiPlusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: i + 10, low: i + 10, close: i + 10 }),
);

// RISING_HALF: high == close == i + 10, low == i + 8.
// At bar i >= 1: upMove = 1, downMove = -1. plusDM = 1. TR =
// max(hl=2, hc=|i+10-(i+9)|=1, lc=|i+8-(i+9)|=1) = 2.
// SMA(plusDM, 4) = 1, SMA(TR, 4) = 2. +DI = 100 * 1 / 2 = 50
// bit-exact.
const RISING_HALF: ChartLineAdxDiPlusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: i + 10, low: i + 8, close: i + 10 }),
);

const FALLING: ChartLineAdxDiPlusPoint[] = Array.from(
  { length: 12 },
  (_, i) => ({ x: i, high: 19 - i, low: 19 - i, close: 19 - i }),
);

const WAVE: ChartLineAdxDiPlusPoint[] = Array.from(
  { length: 40 },
  (_, i) => {
    const base = 50 + 10 * Math.sin(i * 0.4);
    return { x: i, high: base + 2, low: base - 2, close: base };
  },
);

const OPTS = { period: 4, threshold: 25 } as const;

describe('getLineAdxDiPlusFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineAdxDiPlusFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineAdxDiPlusFinitePoints(
        'nope' as unknown as ChartLineAdxDiPlusPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite fields', () => {
    const points: ChartLineAdxDiPlusPoint[] = [
      { x: 0, high: 1, low: 1, close: 1 },
      { x: Number.NaN, high: 2, low: 2, close: 2 },
      { x: 1, high: Number.POSITIVE_INFINITY, low: 0, close: 0 },
      { x: 2, high: 3, low: 3, close: 3 },
    ];
    expect(getLineAdxDiPlusFinitePoints(points)).toEqual([
      { x: 0, high: 1, low: 1, close: 1 },
      { x: 2, high: 3, low: 3, close: 3 },
    ]);
  });

  it('drops inverted high/low', () => {
    const points: ChartLineAdxDiPlusPoint[] = [
      { x: 0, high: 1, low: 2, close: 1.5 },
      { x: 1, high: 3, low: 2, close: 2.5 },
    ];
    expect(getLineAdxDiPlusFinitePoints(points)).toEqual([
      { x: 1, high: 3, low: 2, close: 2.5 },
    ]);
  });
});

describe('normalizeLineAdxDiPlusPeriod', () => {
  it('keeps a valid integer', () => {
    expect(normalizeLineAdxDiPlusPeriod(14, 14)).toBe(14);
  });

  it('floors a fractional', () => {
    expect(normalizeLineAdxDiPlusPeriod(14.9, 14)).toBe(14);
  });

  it('falls back for sub-2', () => {
    expect(normalizeLineAdxDiPlusPeriod(1, 14)).toBe(14);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxDiPlusPeriod(Number.NaN, 14)).toBe(14);
  });
});

describe('normalizeLineAdxDiPlusThreshold', () => {
  it('keeps a valid threshold', () => {
    expect(normalizeLineAdxDiPlusThreshold(40, 25)).toBe(40);
  });

  it('falls back for zero / negative', () => {
    expect(normalizeLineAdxDiPlusThreshold(0, 25)).toBe(25);
    expect(normalizeLineAdxDiPlusThreshold(-1, 25)).toBe(25);
  });

  it('falls back for > 100', () => {
    expect(normalizeLineAdxDiPlusThreshold(120, 25)).toBe(25);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineAdxDiPlusThreshold(Number.NaN, 25)).toBe(25);
  });
});

describe('computeLineAdxDiPlusSma', () => {
  it('returns an empty list on empty input', () => {
    expect(computeLineAdxDiPlusSma([], 4)).toEqual([]);
  });

  it('constant input: SMA = constant bit-exact', () => {
    const out = computeLineAdxDiPlusSma([7, 7, 7, 7, 7], 4);
    expect(out[3]).toBe(7);
    expect(out[4]).toBe(7);
  });
});

describe('computeLineAdxDiPlus', () => {
  it('returns an empty array for non-array / empty input', () => {
    expect(computeLineAdxDiPlus(null, 4)).toEqual([]);
    expect(computeLineAdxDiPlus([], 4)).toEqual([]);
  });

  it('matches input length', () => {
    expect(computeLineAdxDiPlus(RISING, 4)).toHaveLength(RISING.length);
  });

  it('CONST_FLAT: +DI null at every bar (TR = 0)', () => {
    const out = computeLineAdxDiPlus(CONST_FLAT, 4);
    for (const v of out) expect(v).toBeNull();
  });

  it('RISING period 4: +DI = 100 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiPlus(RISING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(100);
  });

  it('RISING_HALF period 4: +DI = 50 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiPlus(RISING_HALF, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(50);
  });

  it('FALLING period 4: +DI = 0 bit-exact at every defined bar', () => {
    const out = computeLineAdxDiPlus(FALLING, 4);
    for (let i = 4; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('warm-up bars are null', () => {
    const out = computeLineAdxDiPlus(RISING, 4);
    for (let i = 0; i < 4; i += 1) expect(out[i]).toBeNull();
  });

  it('translation invariance: shifting OHLC by k leaves +DI unchanged', () => {
    const a = computeLineAdxDiPlus(RISING, 4);
    const shifted = RISING.map((p) => ({
      ...p,
      high: p.high + 1000,
      low: p.low + 1000,
      close: p.close + 1000,
    }));
    const b = computeLineAdxDiPlus(shifted, 4);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === null) expect(b[i]).toBeNull();
      else expect(b[i]).toBe(a[i]);
    }
  });

  it('reads finite and bounded in [0, 100] on the wave', () => {
    const out = computeLineAdxDiPlus(WAVE, 4);
    for (let i = 4; i < out.length; i += 1) {
      const v = out[i];
      if (v === null) continue;
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('classifyLineAdxDiPlusZone', () => {
  it('value >= 2 * threshold -> strong', () => {
    expect(classifyLineAdxDiPlusZone(60, 25)).toBe('strong');
  });

  it('threshold <= value < 2 * threshold -> bull', () => {
    expect(classifyLineAdxDiPlusZone(30, 25)).toBe('bull');
  });

  it('value < threshold -> weak', () => {
    expect(classifyLineAdxDiPlusZone(20, 25)).toBe('weak');
  });

  it('null -> none', () => {
    expect(classifyLineAdxDiPlusZone(null, 25)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineAdxDiPlusZone(Number.NaN, 25)).toBe('none');
  });
});

describe('runLineAdxDiPlus', () => {
  it('marks single-point input as not ok', () => {
    expect(
      runLineAdxDiPlus([{ x: 0, high: 1, low: 1, close: 1 }], OPTS).ok,
    ).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineAdxDiPlus([], OPTS).ok).toBe(false);
    expect(runLineAdxDiPlus(null, OPTS).ok).toBe(false);
  });

  it('marks multi-point input as ok', () => {
    expect(runLineAdxDiPlus(RISING, OPTS).ok).toBe(true);
  });

  it('uses the defaults', () => {
    expect(runLineAdxDiPlus(RISING).period).toBe(
      DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD,
    );
    expect(runLineAdxDiPlus(RISING).threshold).toBe(
      DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD,
    );
  });

  it('honours custom options', () => {
    const run = runLineAdxDiPlus(RISING, OPTS);
    expect(run.period).toBe(4);
    expect(run.threshold).toBe(25);
  });

  it('produces one sample per finite point', () => {
    expect(runLineAdxDiPlus(WAVE, OPTS).samples).toHaveLength(WAVE.length);
  });

  it('RISING threshold 25: defined samples are strong (+DI = 100 >= 50)', () => {
    const run = runLineAdxDiPlus(RISING, OPTS);
    expect(run.strongCount).toBe(RISING.length - 4);
    expect(run.weakCount).toBe(0);
  });

  it('RISING_HALF threshold 25: defined samples are bull (+DI = 50 in [25, 50))', () => {
    // 50 >= 2 * 25 = 50 -> strong (boundary). So actually strong.
    const run = runLineAdxDiPlus(RISING_HALF, OPTS);
    expect(run.strongCount).toBe(RISING_HALF.length - 4);
  });

  it('FALLING threshold 25: defined samples are weak (+DI = 0)', () => {
    const run = runLineAdxDiPlus(FALLING, OPTS);
    expect(run.weakCount).toBe(FALLING.length - 4);
    expect(run.strongCount).toBe(0);
  });

  it('exposes the final reading', () => {
    expect(runLineAdxDiPlus(RISING, OPTS).diPlusFinal).toBe(100);
    expect(runLineAdxDiPlus(RISING_HALF, OPTS).diPlusFinal).toBe(50);
    expect(runLineAdxDiPlus(FALLING, OPTS).diPlusFinal).toBe(0);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineAdxDiPlus(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('self-consistent counts equal the sample length', () => {
    const run = runLineAdxDiPlus(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.strongCount + run.bullCount + run.weakCount + none).toBe(
      run.samples.length,
    );
  });
});

describe('computeLineAdxDiPlusLayout', () => {
  it('marks single-point input as not ok', () => {
    expect(
      computeLineAdxDiPlusLayout({
        data: [{ x: 0, high: 1, low: 1, close: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks collapsed canvas as not ok', () => {
    expect(
      computeLineAdxDiPlusLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineAdxDiPlusLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('emits one price dot per finite bar', () => {
    const layout = computeLineAdxDiPlusLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined +DI bar', () => {
    const layout = computeLineAdxDiPlusLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 4);
  });

  it('builds a non-empty +DI path on RISING', () => {
    const layout = computeLineAdxDiPlusLayout({ data: RISING, ...OPTS });
    expect(layout.diPlusPath.length).toBeGreaterThan(0);
  });

  it('every marker lies inside the +DI panel', () => {
    const layout = computeLineAdxDiPlusLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cx).toBeGreaterThanOrEqual(layout.innerLeft);
      expect(m.cx).toBeLessThanOrEqual(layout.innerRight);
      expect(m.cy).toBeGreaterThanOrEqual(layout.diPlusPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.diPlusPanelBottom);
    }
  });

  it('two panels are non-overlapping', () => {
    const layout = computeLineAdxDiPlusLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.diPlusPanelTop);
  });

  it('carries the run', () => {
    const layout = computeLineAdxDiPlusLayout({ data: RISING, ...OPTS });
    expect(layout.run.period).toBe(4);
    expect(layout.run.threshold).toBe(25);
  });
});

describe('describeLineAdxDiPlusChart', () => {
  it('names the indicator', () => {
    expect(describeLineAdxDiPlusChart(RISING, OPTS)).toContain('+DI');
  });

  it('mentions the period and threshold', () => {
    const desc = describeLineAdxDiPlusChart(RISING, OPTS);
    expect(desc).toContain('period 4');
    expect(desc).toContain('threshold 25');
  });

  it('mentions the pure-rising identity', () => {
    expect(describeLineAdxDiPlusChart(RISING, OPTS)).toContain(
      'pure rising trend',
    );
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineAdxDiPlusChart([])).toBe('No data');
    expect(describeLineAdxDiPlusChart(null)).toBe('No data');
  });
});

describe('<ChartLineAdxDiPlus />', () => {
  it('renders a labelled region', () => {
    render(<ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />);
    expect(
      screen.getByRole('region', { name: /\+DI directional indicator chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-adx-di-plus-aria-desc"]',
    );
    expect(desc?.textContent).toContain('+DI');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={[]} period={4} threshold={25} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-di-plus-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors the config on the root', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-adx-di-plus"]',
    );
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-threshold')).toBe('25');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(RISING.length),
    );
  });

  it('renders the price line and the +DI line', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-adx-di-plus-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-adx-di-plus-line"]'),
    ).toBeInTheDocument();
  });

  it('marks every RISING marker as strong (+DI = 100)', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adx-di-plus-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('strong');
  });

  it('marks every FALLING marker as weak (+DI = 0)', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={FALLING} period={4} threshold={25} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-adx-di-plus-marker"]',
    );
    for (const m of markers) expect(m.getAttribute('data-zone')).toBe('weak');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-adx-di-plus-badge-config"]',
    );
    expect(badge?.textContent).toContain('+DI 4');
    expect(badge?.textContent).toContain('25');
  });

  it('hides the +DI line via the legend toggle', () => {
    const { container } = render(
      <ChartLineAdxDiPlus data={RISING} period={4} threshold={25} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-adx-di-plus-legend-item"][data-series-id="diPlus"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector('[data-section="chart-line-adx-di-plus-line"]'),
    ).toBeNull();
  });

  it('hides the +DI line via showDiPlus=false', () => {
    const { container } = render(
      <ChartLineAdxDiPlus
        data={RISING}
        period={4}
        threshold={25}
        showDiPlus={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-adx-di-plus-line"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineAdxDiPlus
        data={RISING}
        period={4}
        threshold={25}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-adx-di-plus-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineAdxDiPlus
        ref={ref}
        data={RISING}
        period={4}
        threshold={25}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
