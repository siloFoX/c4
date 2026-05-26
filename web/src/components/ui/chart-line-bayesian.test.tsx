import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineBayesian,
  CHART_LINE_BAYESIAN_MIDLINE,
  DEFAULT_CHART_LINE_BAYESIAN_DELTA,
  DEFAULT_CHART_LINE_BAYESIAN_SIGMA,
  DEFAULT_CHART_LINE_BAYESIAN_WINDOW,
  classifyLineBayesianZone,
  computeLineBayesianLayout,
  computeLineBayesianPosterior,
  computeLineBayesianPosteriorWindow,
  computeLineBayesianReturns,
  describeLineBayesianChart,
  getLineBayesianFinitePoints,
  normalizeLineBayesianDelta,
  normalizeLineBayesianSigma,
  normalizeLineBayesianWindow,
  runLineBayesian,
  type ChartLineBayesianPoint,
} from './chart-line-bayesian';

const toPoints = (values: number[]): ChartLineBayesianPoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const CONST_FLAT: ChartLineBayesianPoint[] = toPoints([
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);
const RISING: ChartLineBayesianPoint[] = toPoints([
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]);
const FALLING: ChartLineBayesianPoint[] = toPoints([
  21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
]);
const WAVE: ChartLineBayesianPoint[] = Array.from({ length: 30 }, (_, i) => ({
  x: i,
  value: 50 + 10 * Math.sin(i * 0.4),
}));

const OPTS = { window: 5, delta: 1, sigma: 1 } as const;

describe('getLineBayesianFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineBayesianFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineBayesianFinitePoints(
        'nope' as unknown as ChartLineBayesianPoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const points: ChartLineBayesianPoint[] = [
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ];
    expect(getLineBayesianFinitePoints(points)).toEqual([
      { x: 0, value: 1 },
      { x: 2, value: 3 },
    ]);
  });

  it('preserves input order', () => {
    const finite = getLineBayesianFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineBayesianWindow', () => {
  it('keeps a valid integer window', () => {
    expect(normalizeLineBayesianWindow(10, 10)).toBe(10);
  });

  it('floors a fractional window', () => {
    expect(normalizeLineBayesianWindow(10.9, 10)).toBe(10);
  });

  it('falls back for a sub-2 window', () => {
    expect(normalizeLineBayesianWindow(1, 10)).toBe(10);
  });

  it('falls back for non-finite window', () => {
    expect(normalizeLineBayesianWindow(Number.NaN, 10)).toBe(10);
  });

  it('falls back for a string window', () => {
    expect(normalizeLineBayesianWindow('10' as unknown as number, 10)).toBe(10);
  });
});

describe('normalizeLineBayesianDelta', () => {
  it('keeps a positive delta', () => {
    expect(normalizeLineBayesianDelta(0.05, 0.01)).toBe(0.05);
  });

  it('falls back for zero', () => {
    expect(normalizeLineBayesianDelta(0, 0.01)).toBe(0.01);
  });

  it('falls back for negative', () => {
    expect(normalizeLineBayesianDelta(-0.01, 0.01)).toBe(0.01);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineBayesianDelta(Number.NaN, 0.01)).toBe(0.01);
  });
});

describe('normalizeLineBayesianSigma', () => {
  it('keeps a positive sigma', () => {
    expect(normalizeLineBayesianSigma(0.05, 0.02)).toBe(0.05);
  });

  it('falls back for zero', () => {
    expect(normalizeLineBayesianSigma(0, 0.02)).toBe(0.02);
  });

  it('falls back for negative', () => {
    expect(normalizeLineBayesianSigma(-0.01, 0.02)).toBe(0.02);
  });

  it('falls back for non-finite', () => {
    expect(normalizeLineBayesianSigma(Number.NaN, 0.02)).toBe(0.02);
  });
});

describe('computeLineBayesianReturns', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineBayesianReturns(null as unknown as number[]),
    ).toEqual([]);
  });

  it('matches input length', () => {
    const returns = computeLineBayesianReturns(RISING.map((p) => p.value));
    expect(returns).toHaveLength(RISING.length);
  });

  it('the first return is null', () => {
    const returns = computeLineBayesianReturns(RISING.map((p) => p.value));
    expect(returns[0]).toBeNull();
  });

  it('matches bar-to-bar differences', () => {
    const returns = computeLineBayesianReturns([10, 12, 14, 11]);
    expect(returns).toEqual([null, 2, 2, -3]);
  });

  it('yields zero for a constant input', () => {
    const returns = computeLineBayesianReturns([5, 5, 5, 5]);
    expect(returns).toEqual([null, 0, 0, 0]);
  });

  it('null at a non-finite bar', () => {
    const returns = computeLineBayesianReturns([1, 2, Number.NaN, 3]);
    expect(returns[2]).toBeNull();
    expect(returns[3]).toBeNull();
  });
});

describe('computeLineBayesianPosteriorWindow', () => {
  it('returns a posterior that sums to one for a zero window', () => {
    const post = computeLineBayesianPosteriorWindow(
      [0, 0, 0, 0, 0],
      1,
      1,
    );
    expect(post.pUp + post.pFlat + post.pDown).toBeCloseTo(1, 12);
  });

  it('returns equal up and down for a zero window (the symmetry anchor)', () => {
    const post = computeLineBayesianPosteriorWindow(
      [0, 0, 0, 0, 0],
      1,
      1,
    );
    expect(post.pUp).toBe(post.pDown);
  });

  it('the flat hypothesis leads on a zero window', () => {
    const post = computeLineBayesianPosteriorWindow(
      [0, 0, 0, 0, 0],
      1,
      1,
    );
    expect(post.pFlat).toBeGreaterThan(post.pUp);
    expect(post.pFlat).toBeGreaterThan(post.pDown);
  });

  it('the up hypothesis leads when all returns equal +delta', () => {
    const post = computeLineBayesianPosteriorWindow(
      [1, 1, 1, 1, 1],
      1,
      1,
    );
    expect(post.pUp).toBeGreaterThan(post.pFlat);
    expect(post.pUp).toBeGreaterThan(post.pDown);
  });

  it('the down hypothesis leads when all returns equal -delta', () => {
    const post = computeLineBayesianPosteriorWindow(
      [-1, -1, -1, -1, -1],
      1,
      1,
    );
    expect(post.pDown).toBeGreaterThan(post.pFlat);
    expect(post.pDown).toBeGreaterThan(post.pUp);
  });

  it('every defined probability is inside [0, 1]', () => {
    const post = computeLineBayesianPosteriorWindow(
      [1, -1, 2, 0, -2],
      1,
      1,
    );
    for (const p of [post.pUp, post.pFlat, post.pDown]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('symmetric mirror windows swap the up and down probabilities', () => {
    const a = computeLineBayesianPosteriorWindow([1, -1, 2, -2], 1, 1);
    const b = computeLineBayesianPosteriorWindow([-1, 1, -2, 2], 1, 1);
    expect(a.pUp).toBe(b.pDown);
    expect(a.pDown).toBe(b.pUp);
    expect(a.pFlat).toBe(b.pFlat);
  });

  it('a wider window concentrates the posterior toward the leader', () => {
    const a = computeLineBayesianPosteriorWindow([1, 1, 1], 1, 1);
    const b = computeLineBayesianPosteriorWindow(
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      1,
      1,
    );
    expect(b.pUp).toBeGreaterThan(a.pUp);
  });
});

describe('computeLineBayesianPosterior', () => {
  it('returns an empty list for non-array', () => {
    expect(
      computeLineBayesianPosterior(
        null as unknown as number[],
        5,
        1,
        1,
      ),
    ).toEqual([]);
  });

  it('returns a list the same length as the input', () => {
    const out = computeLineBayesianPosterior(
      RISING.map((p) => p.value),
      5,
      1,
      1,
    );
    expect(out).toHaveLength(RISING.length);
  });

  it('the first `window` bars are null (the lookback warm-up)', () => {
    const out = computeLineBayesianPosterior(
      RISING.map((p) => p.value),
      5,
      1,
      1,
    );
    for (let i = 0; i < 5; i += 1) expect(out[i]).toBeNull();
  });

  it('every defined posterior sums to one within ULP', () => {
    const out = computeLineBayesianPosterior(
      RISING.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      expect(post.pUp + post.pFlat + post.pDown).toBeCloseTo(1, 12);
    }
  });

  it('the up hypothesis leads at every defined bar of a strictly rising series', () => {
    const out = computeLineBayesianPosterior(
      RISING.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      expect(post.pUp).toBeGreaterThan(post.pDown);
      expect(post.pUp).toBeGreaterThan(post.pFlat);
    }
  });

  it('the down hypothesis leads at every defined bar of a strictly falling series', () => {
    const out = computeLineBayesianPosterior(
      FALLING.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      expect(post.pDown).toBeGreaterThan(post.pUp);
      expect(post.pDown).toBeGreaterThan(post.pFlat);
    }
  });

  it('the flat hypothesis leads at every defined bar of a constant series', () => {
    const out = computeLineBayesianPosterior(
      CONST_FLAT.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      expect(post.pFlat).toBeGreaterThan(post.pUp);
      expect(post.pFlat).toBeGreaterThan(post.pDown);
    }
  });

  it('a constant series gives pUp === pDown bit-exact at every defined bar', () => {
    const out = computeLineBayesianPosterior(
      CONST_FLAT.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      expect(post.pUp).toBe(post.pDown);
    }
  });

  it('every defined probability is inside [0, 1]', () => {
    const out = computeLineBayesianPosterior(
      WAVE.map((p) => p.value),
      5,
      1,
      1,
    );
    for (const post of out) {
      if (post === null) continue;
      for (const p of [post.pUp, post.pFlat, post.pDown]) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  it('respects sub-2 / non-finite window via the fallback', () => {
    const out = computeLineBayesianPosterior(
      RISING.map((p) => p.value),
      Number.NaN,
      1,
      1,
    );
    expect(out).toHaveLength(RISING.length);
  });
});

describe('classifyLineBayesianZone', () => {
  it('null posterior -> none', () => {
    expect(classifyLineBayesianZone(null)).toBe('none');
  });

  it('non-finite posterior -> none', () => {
    expect(
      classifyLineBayesianZone({
        pUp: Number.NaN,
        pFlat: 0.5,
        pDown: 0.5,
      }),
    ).toBe('none');
  });

  it('pUp leader -> up', () => {
    expect(
      classifyLineBayesianZone({ pUp: 0.8, pFlat: 0.1, pDown: 0.1 }),
    ).toBe('up');
  });

  it('pDown leader -> down', () => {
    expect(
      classifyLineBayesianZone({ pUp: 0.1, pFlat: 0.1, pDown: 0.8 }),
    ).toBe('down');
  });

  it('pFlat leader -> flat', () => {
    expect(
      classifyLineBayesianZone({ pUp: 0.2, pFlat: 0.6, pDown: 0.2 }),
    ).toBe('flat');
  });

  it('tie favours flat then up over down', () => {
    expect(
      classifyLineBayesianZone({
        pUp: 1 / 3,
        pFlat: 1 / 3,
        pDown: 1 / 3,
      }),
    ).toBe('flat');
  });

  it('exposes a midline constant at 0.5', () => {
    expect(CHART_LINE_BAYESIAN_MIDLINE).toBe(0.5);
  });
});

describe('runLineBayesian', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineBayesian([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineBayesian([]).ok).toBe(false);
    expect(runLineBayesian(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineBayesian(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default window, delta and sigma', () => {
    const run = runLineBayesian(RISING);
    expect(run.window).toBe(DEFAULT_CHART_LINE_BAYESIAN_WINDOW);
    expect(run.delta).toBe(DEFAULT_CHART_LINE_BAYESIAN_DELTA);
    expect(run.sigma).toBe(DEFAULT_CHART_LINE_BAYESIAN_SIGMA);
  });

  it('honours custom options', () => {
    const run = runLineBayesian(RISING, { window: 6, delta: 2, sigma: 3 });
    expect(run.window).toBe(6);
    expect(run.delta).toBe(2);
    expect(run.sigma).toBe(3);
  });

  it('classifies a rising series as up after the warm-up', () => {
    const run = runLineBayesian(RISING, OPTS);
    expect(run.upCount).toBe(RISING.length - 5);
    expect(run.downCount).toBe(0);
  });

  it('classifies a falling series as down after the warm-up', () => {
    const run = runLineBayesian(FALLING, OPTS);
    expect(run.downCount).toBe(FALLING.length - 5);
    expect(run.upCount).toBe(0);
  });

  it('classifies a constant series as flat after the warm-up', () => {
    const run = runLineBayesian(CONST_FLAT, OPTS);
    expect(run.flatCount).toBe(CONST_FLAT.length - 5);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineBayesian(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(run.upCount + run.downCount + run.flatCount + none).toBe(
      run.samples.length,
    );
  });

  it('produces one sample per finite point', () => {
    const run = runLineBayesian(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineBayesian(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('every defined sample sums to one', () => {
    const run = runLineBayesian(RISING, OPTS);
    for (const sample of run.samples) {
      if (
        sample.pUp === null ||
        sample.pFlat === null ||
        sample.pDown === null
      )
        continue;
      expect(sample.pUp + sample.pFlat + sample.pDown).toBeCloseTo(1, 12);
    }
  });

  it('exposes the final posterior', () => {
    const run = runLineBayesian(CONST_FLAT, OPTS);
    expect(run.pUpFinal).toBeGreaterThanOrEqual(0);
    expect(run.pFlatFinal).toBeGreaterThanOrEqual(0);
    expect(run.pDownFinal).toBeGreaterThanOrEqual(0);
    expect(run.pUpFinal).toBe(run.pDownFinal);
  });
});

describe('computeLineBayesianLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineBayesianLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineBayesianLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(computeLineBayesianLayout({ data: WAVE, ...OPTS }).ok).toBe(true);
  });

  it('stacks the price panel above the probability panel', () => {
    const layout = computeLineBayesianLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.probPanelTop);
  });

  it('builds non-empty paths for price and the three probability lines', () => {
    const layout = computeLineBayesianLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.pUpPath.length).toBeGreaterThan(0);
    expect(layout.pFlatPath.length).toBeGreaterThan(0);
    expect(layout.pDownPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineBayesianLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined-posterior bar', () => {
    const layout = computeLineBayesianLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 5);
  });

  it('puts the midline inside the probability panel', () => {
    const layout = computeLineBayesianLayout({ data: WAVE, ...OPTS });
    expect(layout.midlineY).toBeGreaterThanOrEqual(layout.probPanelTop);
    expect(layout.midlineY).toBeLessThanOrEqual(layout.probPanelBottom);
  });

  it('every marker lies inside the probability panel', () => {
    const layout = computeLineBayesianLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.probPanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.probPanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineBayesianLayout({ data: RISING, ...OPTS });
    expect(layout.run.window).toBe(5);
    expect(layout.run.samples).toHaveLength(RISING.length);
  });
});

describe('describeLineBayesianChart', () => {
  it('names the indicator', () => {
    expect(describeLineBayesianChart(RISING, OPTS)).toContain('Bayesian Trend');
  });

  it('mentions the lookback window', () => {
    expect(describeLineBayesianChart(RISING, OPTS)).toContain('window 5');
  });

  it('mentions the three hypotheses', () => {
    const text = describeLineBayesianChart(RISING, OPTS);
    expect(text).toContain('up');
    expect(text).toContain('flat');
    expect(text).toContain('down');
  });

  it('mentions the final posterior', () => {
    expect(describeLineBayesianChart(RISING, OPTS)).toContain('final posterior');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineBayesianChart([])).toBe('No data');
    expect(describeLineBayesianChart(null)).toBe('No data');
  });
});

describe('<ChartLineBayesian />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    expect(
      screen.getByRole('region', {
        name: /Bayesian Trend probability chart/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-bayesian-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Bayesian Trend');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineBayesian data={[]} window={5} delta={1} sigma={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bayesian-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors window, delta and sigma on the root', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-bayesian"]',
    );
    expect(root?.getAttribute('data-window')).toBe('5');
    expect(root?.getAttribute('data-delta')).toBe('1');
    expect(root?.getAttribute('data-sigma')).toBe('1');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price line and the three probability lines', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-bayesian-price-path"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-bayesian-p-up-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-bayesian-p-flat-line"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-section="chart-line-bayesian-p-down-line"]',
      ),
    ).toBeInTheDocument();
  });

  it('renders the midline by default', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bayesian-midline"]'),
    ).toBeInTheDocument();
  });

  it('renders one marker per defined bar', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-bayesian-marker"]',
    );
    expect(markers.length).toBe(RISING.length - 5);
  });

  it('marks every marker with a valid zone', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-bayesian-marker"]',
    );
    for (const m of markers) {
      const zone = m.getAttribute('data-zone');
      expect(['up', 'flat', 'down']).toContain(zone);
    }
  });

  it('renders the config badge with the window', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-bayesian-badge-config"]',
    );
    expect(badge?.textContent).toContain('BAYES 5');
  });

  it('hides P(up) via the legend toggle', () => {
    const { container } = render(
      <ChartLineBayesian data={RISING} window={5} delta={1} sigma={1} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-bayesian-legend-item"][data-series-id="pUp"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-bayesian-p-up-line"]',
      ),
    ).toBeNull();
  });

  it('hides the midline via showMidline=false', () => {
    const { container } = render(
      <ChartLineBayesian
        data={RISING}
        window={5}
        delta={1}
        sigma={1}
        showMidline={false}
      />,
    );
    expect(
      container.querySelector('[data-section="chart-line-bayesian-midline"]'),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineBayesian
        data={RISING}
        window={5}
        delta={1}
        sigma={1}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-bayesian-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineBayesian
        ref={ref}
        data={RISING}
        window={5}
        delta={1}
        sigma={1}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
