import { describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  ChartLineConfluence,
  DEFAULT_CHART_LINE_CONFLUENCE_LOOKBACKS,
  classifyLineConfluenceZone,
  computeLineConfluence,
  computeLineConfluenceLayout,
  computeLineConfluenceSignal,
  describeLineConfluenceChart,
  getLineConfluenceFinitePoints,
  normalizeLineConfluenceLookbacks,
  normalizeLineConfluenceThreshold,
  runLineConfluence,
  type ChartLineConfluencePoint,
} from './chart-line-confluence';

const toPoints = (values: number[]): ChartLineConfluencePoint[] =>
  values.map((v, i) => ({ x: i, value: v }));

const RISING: ChartLineConfluencePoint[] = toPoints(
  Array.from({ length: 25 }, (_, i) => 10 + i),
);
const FALLING: ChartLineConfluencePoint[] = toPoints(
  Array.from({ length: 25 }, (_, i) => 30 - i),
);
const CONST_FLAT: ChartLineConfluencePoint[] = toPoints(
  Array.from({ length: 25 }, () => 5),
);
const WAVE: ChartLineConfluencePoint[] = Array.from(
  { length: 40 },
  (_, i) => ({ x: i, value: 50 + 10 * Math.sin(i * 0.4) }),
);

const OPTS: { lookbacks: number[]; threshold: number } = {
  lookbacks: [3, 5, 10],
  threshold: 1,
};

describe('getLineConfluenceFinitePoints', () => {
  it('returns an empty list for null', () => {
    expect(getLineConfluenceFinitePoints(null)).toEqual([]);
  });

  it('returns an empty list for non-array', () => {
    expect(
      getLineConfluenceFinitePoints(
        'nope' as unknown as ChartLineConfluencePoint[],
      ),
    ).toEqual([]);
  });

  it('drops non-finite x or value', () => {
    const out = getLineConfluenceFinitePoints([
      { x: 0, value: 1 },
      { x: Number.NaN, value: 2 },
      { x: 1, value: Number.POSITIVE_INFINITY },
      { x: 2, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([0, 2]);
  });

  it('preserves input order', () => {
    const finite = getLineConfluenceFinitePoints(RISING.slice().reverse());
    expect(finite.map((p) => p.x)).toEqual(
      [...RISING].reverse().map((p) => p.x),
    );
  });
});

describe('normalizeLineConfluenceLookbacks', () => {
  it('keeps a sorted array of positive integers', () => {
    expect(normalizeLineConfluenceLookbacks([5, 10, 20], [3])).toEqual([
      5, 10, 20,
    ]);
  });

  it('sorts an unsorted array', () => {
    expect(normalizeLineConfluenceLookbacks([20, 5, 10], [3])).toEqual([
      5, 10, 20,
    ]);
  });

  it('floors fractional entries', () => {
    expect(normalizeLineConfluenceLookbacks([3.9, 5.1, 10.5], [3])).toEqual([
      3, 5, 10,
    ]);
  });

  it('drops non-finite and sub-1 entries', () => {
    expect(
      normalizeLineConfluenceLookbacks([0, -1, Number.NaN, 5, 10], [3]),
    ).toEqual([5, 10]);
  });

  it('falls back when the input is not an array', () => {
    expect(normalizeLineConfluenceLookbacks(null, [3, 5])).toEqual([3, 5]);
  });

  it('falls back when the result would be empty', () => {
    expect(normalizeLineConfluenceLookbacks([0, -1], [3])).toEqual([3]);
  });
});

describe('normalizeLineConfluenceThreshold', () => {
  it('keeps a non-negative finite threshold', () => {
    expect(normalizeLineConfluenceThreshold(2, 3)).toBe(2);
  });

  it('falls back to floor(N/2) for non-finite', () => {
    expect(normalizeLineConfluenceThreshold(Number.NaN, 3)).toBe(1);
  });

  it('falls back to floor(N/2) for negative', () => {
    expect(normalizeLineConfluenceThreshold(-1, 4)).toBe(2);
  });

  it('treats zero as a valid threshold', () => {
    expect(normalizeLineConfluenceThreshold(0, 5)).toBe(0);
  });
});

describe('computeLineConfluenceSignal', () => {
  it('returns an empty list for non-array or empty input', () => {
    expect(computeLineConfluenceSignal(null, 3)).toEqual([]);
    expect(computeLineConfluenceSignal([], 3)).toEqual([]);
  });

  it('matches input length', () => {
    const out = computeLineConfluenceSignal(RISING.map((p) => p.value), 3);
    expect(out).toHaveLength(RISING.length);
  });

  it('leaves the warm-up window null', () => {
    const out = computeLineConfluenceSignal(RISING.map((p) => p.value), 3);
    for (let i = 0; i < 3; i += 1) expect(out[i]).toBeNull();
  });

  it('a strictly rising series produces +1 at every defined bar (bit-exact)', () => {
    const out = computeLineConfluenceSignal(RISING.map((p) => p.value), 5);
    for (let i = 5; i < out.length; i += 1) expect(out[i]).toBe(1);
  });

  it('a strictly falling series produces -1 at every defined bar (bit-exact)', () => {
    const out = computeLineConfluenceSignal(FALLING.map((p) => p.value), 5);
    for (let i = 5; i < out.length; i += 1) expect(out[i]).toBe(-1);
  });

  it('a constant series produces 0 at every defined bar (bit-exact)', () => {
    const out = computeLineConfluenceSignal(
      CONST_FLAT.map((p) => p.value),
      5,
    );
    for (let i = 5; i < out.length; i += 1) expect(out[i]).toBe(0);
  });

  it('produces null at the non-finite bar and at bars looking back to it', () => {
    // [1, 2, NaN, 4, 5] with lookback 2:
    //   bar 0..1 warm-up null
    //   bar 2: curr is NaN -> null
    //   bar 3: curr 4 vs prev value[1] = 2 -> +1
    //   bar 4: prev value[2] = NaN -> null
    const out = computeLineConfluenceSignal([1, 2, Number.NaN, 4, 5], 2);
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(1);
    expect(out[4]).toBeNull();
  });
});

describe('computeLineConfluence', () => {
  it('returns empty arrays for non-array or empty input', () => {
    expect(computeLineConfluence(null, [3, 5, 10])).toEqual({
      signals: [[], [], []],
      score: [],
    });
    expect(computeLineConfluence([], [3, 5, 10])).toEqual({
      signals: [[], [], []],
      score: [],
    });
  });

  it('matches input length on the score and on every signal array', () => {
    const out = computeLineConfluence(RISING.map((p) => p.value), [3, 5, 10]);
    expect(out.score).toHaveLength(RISING.length);
    expect(out.signals[0]).toHaveLength(RISING.length);
    expect(out.signals[1]).toHaveLength(RISING.length);
    expect(out.signals[2]).toHaveLength(RISING.length);
  });

  it('leaves the score null until every lookback has filled', () => {
    const out = computeLineConfluence(RISING.map((p) => p.value), [3, 5, 10]);
    for (let i = 0; i < 10; i += 1) expect(out.score[i]).toBeNull();
    expect(out.score[10]).not.toBeNull();
  });

  it('the rising-series score equals the lookback count at every defined bar (bit-exact)', () => {
    const out = computeLineConfluence(RISING.map((p) => p.value), [3, 5, 10]);
    for (let i = 10; i < out.score.length; i += 1) expect(out.score[i]).toBe(3);
  });

  it('the falling-series score equals the negative lookback count at every defined bar (bit-exact)', () => {
    const out = computeLineConfluence(FALLING.map((p) => p.value), [3, 5, 10]);
    for (let i = 10; i < out.score.length; i += 1)
      expect(out.score[i]).toBe(-3);
  });

  it('the constant-series score is zero at every defined bar (bit-exact)', () => {
    const out = computeLineConfluence(
      CONST_FLAT.map((p) => p.value),
      [3, 5, 10],
    );
    for (let i = 10; i < out.score.length; i += 1) expect(out.score[i]).toBe(0);
  });

  it('every defined score is an integer in [-N, +N]', () => {
    const out = computeLineConfluence(WAVE.map((p) => p.value), [3, 5, 10]);
    const n = 3;
    for (const s of out.score) {
      if (s === null) continue;
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(-n);
      expect(s).toBeLessThanOrEqual(n);
    }
  });

  it('a five-lookback set produces scores in [-5, +5]', () => {
    const out = computeLineConfluence(
      RISING.map((p) => p.value),
      [2, 3, 5, 8, 13],
    );
    for (let i = 13; i < out.score.length; i += 1) expect(out.score[i]).toBe(5);
  });
});

describe('classifyLineConfluenceZone', () => {
  it('null -> none', () => {
    expect(classifyLineConfluenceZone(null, 1)).toBe('none');
  });

  it('non-finite -> none', () => {
    expect(classifyLineConfluenceZone(Number.NaN, 1)).toBe('none');
  });

  it('above the threshold -> bullish', () => {
    expect(classifyLineConfluenceZone(2, 1)).toBe('bullish');
  });

  it('below the negative threshold -> bearish', () => {
    expect(classifyLineConfluenceZone(-2, 1)).toBe('bearish');
  });

  it('inside the band -> neutral', () => {
    expect(classifyLineConfluenceZone(0, 1)).toBe('neutral');
    expect(classifyLineConfluenceZone(1, 1)).toBe('neutral');
    expect(classifyLineConfluenceZone(-1, 1)).toBe('neutral');
  });

  it('a zero threshold collapses neutral to exact zero (strict inequality)', () => {
    expect(classifyLineConfluenceZone(0, 0)).toBe('neutral');
    expect(classifyLineConfluenceZone(1, 0)).toBe('bullish');
    expect(classifyLineConfluenceZone(-1, 0)).toBe('bearish');
  });
});

describe('runLineConfluence', () => {
  it('marks a single-point input as not ok', () => {
    expect(runLineConfluence([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('marks empty / null input as not ok', () => {
    expect(runLineConfluence([]).ok).toBe(false);
    expect(runLineConfluence(null).ok).toBe(false);
  });

  it('marks a multi-point input as ok', () => {
    expect(runLineConfluence(RISING, OPTS).ok).toBe(true);
  });

  it('uses the default lookbacks when not given', () => {
    const run = runLineConfluence(RISING);
    expect(run.lookbacks).toEqual(DEFAULT_CHART_LINE_CONFLUENCE_LOOKBACKS);
  });

  it('honours custom lookbacks and threshold', () => {
    const run = runLineConfluence(RISING, OPTS);
    expect(run.lookbacks).toEqual([3, 5, 10]);
    expect(run.threshold).toBe(1);
  });

  it('the rising series counts as fully bullish after the warm-up', () => {
    const run = runLineConfluence(RISING, OPTS);
    const warm = 10; // max lookback
    expect(run.bullishCount).toBe(RISING.length - warm);
    expect(run.bearishCount).toBe(0);
  });

  it('the falling series counts as fully bearish after the warm-up', () => {
    const run = runLineConfluence(FALLING, OPTS);
    const warm = 10;
    expect(run.bearishCount).toBe(FALLING.length - warm);
    expect(run.bullishCount).toBe(0);
  });

  it('the constant series counts as fully neutral after the warm-up', () => {
    const run = runLineConfluence(CONST_FLAT, OPTS);
    const warm = 10;
    expect(run.neutralCount).toBe(CONST_FLAT.length - warm);
    expect(run.bullishCount).toBe(0);
    expect(run.bearishCount).toBe(0);
  });

  it('self-consistent zone counts equal sample length', () => {
    const run = runLineConfluence(WAVE, OPTS);
    let none = 0;
    for (const sample of run.samples) {
      if (sample.zone === 'none') none += 1;
    }
    expect(
      run.bullishCount + run.bearishCount + run.neutralCount + none,
    ).toBe(run.samples.length);
  });

  it('produces one sample per finite point', () => {
    const run = runLineConfluence(WAVE, OPTS);
    expect(run.samples).toHaveLength(WAVE.length);
  });

  it('sorts the series by x', () => {
    const shuffled = [...RISING].sort(() => -1);
    const run = runLineConfluence(shuffled, OPTS);
    const xs = run.series.map((p) => p.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });

  it('exposes the final score', () => {
    const run = runLineConfluence(RISING, OPTS);
    expect(run.scoreFinal).toBe(3);
  });

  it('exposes per-bar signals on each sample', () => {
    const run = runLineConfluence(RISING, OPTS);
    const last = run.samples[run.samples.length - 1]!;
    expect(last.signals).toEqual([1, 1, 1]);
  });
});

describe('computeLineConfluenceLayout', () => {
  it('marks a single-point input as not ok', () => {
    expect(
      computeLineConfluenceLayout({
        data: [{ x: 0, value: 1 }],
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks a collapsed canvas as not ok', () => {
    expect(
      computeLineConfluenceLayout({
        data: WAVE,
        width: 60,
        height: 60,
        ...OPTS,
      }).ok,
    ).toBe(false);
  });

  it('marks ok with normal input and canvas', () => {
    expect(
      computeLineConfluenceLayout({ data: WAVE, ...OPTS }).ok,
    ).toBe(true);
  });

  it('stacks the price panel above the score panel', () => {
    const layout = computeLineConfluenceLayout({ data: WAVE, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.scorePanelTop);
  });

  it('builds a non-empty price path', () => {
    const layout = computeLineConfluenceLayout({ data: RISING, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineConfluenceLayout({ data: RISING, ...OPTS });
    expect(layout.priceDots).toHaveLength(RISING.length);
  });

  it('emits one marker per defined-score bar', () => {
    const layout = computeLineConfluenceLayout({ data: RISING, ...OPTS });
    expect(layout.markers).toHaveLength(RISING.length - 10);
  });

  it('the zero line sits inside the score panel', () => {
    const layout = computeLineConfluenceLayout({ data: WAVE, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.scorePanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.scorePanelBottom);
  });

  it('the upper threshold sits above the lower threshold on the y axis', () => {
    const layout = computeLineConfluenceLayout({ data: WAVE, ...OPTS });
    expect(layout.upperThresholdY).toBeLessThan(layout.lowerThresholdY);
  });

  it('every marker lies inside the score panel', () => {
    const layout = computeLineConfluenceLayout({ data: WAVE, ...OPTS });
    for (const m of layout.markers) {
      expect(m.cy).toBeGreaterThanOrEqual(layout.scorePanelTop);
      expect(m.cy).toBeLessThanOrEqual(layout.scorePanelBottom);
    }
  });

  it('carries the run', () => {
    const layout = computeLineConfluenceLayout({ data: RISING, ...OPTS });
    expect(layout.run.lookbacks).toEqual([3, 5, 10]);
    expect(layout.run.threshold).toBe(1);
  });
});

describe('describeLineConfluenceChart', () => {
  it('names the indicator', () => {
    expect(describeLineConfluenceChart(RISING, OPTS)).toContain('Confluence');
  });

  it('mentions the lookbacks', () => {
    expect(describeLineConfluenceChart(RISING, OPTS)).toContain('3, 5, 10');
  });

  it('mentions the threshold', () => {
    expect(describeLineConfluenceChart(RISING, OPTS)).toContain('threshold 1');
  });

  it('mentions the final score', () => {
    expect(describeLineConfluenceChart(RISING, OPTS)).toContain('final score');
  });

  it('returns "No data" for empty input', () => {
    expect(describeLineConfluenceChart([])).toBe('No data');
    expect(describeLineConfluenceChart(null)).toBe('No data');
  });
});

describe('<ChartLineConfluence />', () => {
  it('renders a labelled region', () => {
    render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    expect(
      screen.getByRole('region', { name: /Confluence chart/i }),
    ).toBeInTheDocument();
  });

  it('renders the accessible description', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-confluence-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Confluence');
  });

  it('renders the empty state with no data', () => {
    const { container } = render(
      <ChartLineConfluence data={[]} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-confluence-empty"]'),
    ).toBeInTheDocument();
  });

  it('mirrors lookbacks and threshold on the root', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-confluence"]',
    );
    expect(root?.getAttribute('data-lookbacks')).toBe('3,5,10');
    expect(root?.getAttribute('data-threshold')).toBe('1');
  });

  it('renders an SVG with the img role', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it('renders the price and score lines', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-confluence-price-path"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section="chart-line-confluence-score-line"]'),
    ).toBeInTheDocument();
  });

  it('renders the zero line and both threshold lines by default', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-confluence-zero-line"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-confluence-threshold-line"]',
      ).length,
    ).toBe(2);
  });

  it('renders markers for the defined-score bars', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-confluence-marker"]',
    );
    expect(markers.length).toBe(RISING.length - 10);
  });

  it('marks every marker on the rising fixture as bullish', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-confluence-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('bullish');
    }
  });

  it('marks every marker on the falling fixture as bearish', () => {
    const { container } = render(
      <ChartLineConfluence data={FALLING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-confluence-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('bearish');
    }
  });

  it('marks every marker on the constant fixture as neutral', () => {
    const { container } = render(
      <ChartLineConfluence data={CONST_FLAT} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-confluence-marker"]',
    );
    for (const m of markers) {
      expect(m.getAttribute('data-zone')).toBe('neutral');
    }
  });

  it('renders the config badge with the lookbacks and threshold', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-confluence-badge-config"]',
    );
    expect(badge?.textContent).toContain('CONF 3/5/10 t1');
  });

  it('hides the score line via the legend toggle', () => {
    const { container } = render(
      <ChartLineConfluence data={RISING} lookbacks={[3, 5, 10]} threshold={1} />,
    );
    const btn = container.querySelector(
      '[data-section="chart-line-confluence-legend-item"][data-series-id="score"]',
    );
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn as Element);
    expect(
      container.querySelector(
        '[data-section="chart-line-confluence-score-line"]',
      ),
    ).toBeNull();
  });

  it('hides the threshold lines via showThresholdLines=false', () => {
    const { container } = render(
      <ChartLineConfluence
        data={RISING}
        lookbacks={[3, 5, 10]}
        threshold={1}
        showThresholdLines={false}
      />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-confluence-threshold-line"]',
      ).length,
    ).toBe(0);
  });

  it('fires onPointClick when a marker is clicked', () => {
    let received: number | null = null;
    const { container } = render(
      <ChartLineConfluence
        data={RISING}
        lookbacks={[3, 5, 10]}
        threshold={1}
        onPointClick={({ point }) => {
          received = point.index;
        }}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-confluence-marker"]',
    );
    expect(marker).toBeInTheDocument();
    fireEvent.click(marker as Element);
    expect(received).not.toBeNull();
  });

  it('forwards a ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChartLineConfluence
        ref={ref}
        data={RISING}
        lookbacks={[3, 5, 10]}
        threshold={1}
      />,
    );
    expect(ref.current).not.toBeNull();
  });
});
