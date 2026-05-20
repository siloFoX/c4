import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineSqueeze,
  getLineSqueezeFinitePoints,
  normalizeLineSqueezePeriod,
  computeLineSqueezeSma,
  computeLineSqueezeStd,
  computeLineSqueezeRange,
  computeLineSqueeze,
  runLineSqueeze,
  computeLineSqueezeLayout,
  describeLineSqueezeChart,
  DEFAULT_CHART_LINE_SQUEEZE_PERIOD,
  DEFAULT_CHART_LINE_SQUEEZE_BB_MULT,
  DEFAULT_CHART_LINE_SQUEEZE_KC_MULT,
  type ChartLineSqueezePoint,
} from './chart-line-squeeze';

afterEach(() => cleanup());

const SQUEEZE_CLOSES = [50, 54, 58, 78, 70, 78, 82, 106, 98, 102];
const SQUEEZE_DATA: ChartLineSqueezePoint[] = SQUEEZE_CLOSES.map(
  (value, x) => ({ x, value }),
);
const OPTS = { period: 2, bbMult: 2, kcMult: 1.5 };

// period 2 -> the 2-bar population stddev is exactly |a-b|/2, so with
// integer closes the whole BB/KC pipeline lands on exact integers.
const MID_EXPECTED = [null, 52, 56, 68, 74, 74, 80, 94, 102, 100];
const STD_EXPECTED = [null, 2, 2, 10, 4, 4, 2, 12, 4, 2];
const RANGE_EXPECTED = [null, 4, 4, 20, 8, 8, 4, 24, 8, 4];
const BB_UPPER_EXPECTED = [null, 56, 60, 88, 82, 82, 84, 118, 110, 104];
const BB_LOWER_EXPECTED = [null, 48, 52, 48, 66, 66, 76, 70, 94, 96];
const KC_UPPER_EXPECTED = [null, null, 62, 86, 95, 86, 89, 115, 126, 109];
const KC_LOWER_EXPECTED = [null, null, 50, 50, 53, 62, 71, 73, 78, 91];
const COMPRESSION_EXPECTED = [null, null, 2, -2, 13, 4, 5, -3, 16, 5];
const STATE_EXPECTED = [
  'none',
  'none',
  'on',
  'off',
  'on',
  'on',
  'on',
  'off',
  'on',
  'on',
];

describe('getLineSqueezeFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineSqueezePoint[];
    expect(getLineSqueezeFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineSqueezeFinitePoints(null)).toEqual([]);
    expect(getLineSqueezeFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineSqueezePeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineSqueezePeriod(20.9, 20)).toBe(20);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineSqueezePeriod(0, 20)).toBe(20);
    expect(normalizeLineSqueezePeriod(-3, 20)).toBe(20);
    expect(normalizeLineSqueezePeriod(Number.NaN, 20)).toBe(20);
  });
});

describe('computeLineSqueezeSma', () => {
  it('computes the moving average of the close', () => {
    expect(computeLineSqueezeSma(SQUEEZE_CLOSES, 2)).toEqual(MID_EXPECTED);
  });

  it('is null where the window contains a null', () => {
    expect(computeLineSqueezeSma([null, 4, 8], 2)).toEqual([
      null,
      null,
      6,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineSqueezeSma(null, 2)).toEqual([]);
  });
});

describe('computeLineSqueezeStd', () => {
  it('computes the rolling population standard deviation', () => {
    expect(computeLineSqueezeStd(SQUEEZE_CLOSES, 2)).toEqual(STD_EXPECTED);
  });

  it('reads zero for a flat window', () => {
    expect(computeLineSqueezeStd([5, 5, 5], 2)).toEqual([null, 0, 0]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineSqueezeStd(null, 2)).toEqual([]);
  });
});

describe('computeLineSqueezeRange', () => {
  it('computes the absolute bar-to-bar change', () => {
    expect(computeLineSqueezeRange(SQUEEZE_CLOSES)).toEqual(RANGE_EXPECTED);
  });

  it('is null for the first bar', () => {
    expect(computeLineSqueezeRange(SQUEEZE_CLOSES)[0]).toBeNull();
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineSqueezeRange(null)).toEqual([]);
  });
});

describe('computeLineSqueeze', () => {
  it('computes the Bollinger Bands', () => {
    const out = computeLineSqueeze(SQUEEZE_CLOSES, 2, 2, 1.5);
    expect(out.bbUpper).toEqual(BB_UPPER_EXPECTED);
    expect(out.bbLower).toEqual(BB_LOWER_EXPECTED);
  });

  it('computes the Keltner Channels', () => {
    const out = computeLineSqueeze(SQUEEZE_CLOSES, 2, 2, 1.5);
    expect(out.kcUpper).toEqual(KC_UPPER_EXPECTED);
    expect(out.kcLower).toEqual(KC_LOWER_EXPECTED);
  });

  it('computes the compression as the Keltner minus Bollinger width', () => {
    const out = computeLineSqueeze(SQUEEZE_CLOSES, 2, 2, 1.5);
    expect(out.compression).toEqual(COMPRESSION_EXPECTED);
  });

  it('shares the middle band between the Bollinger and Keltner', () => {
    const out = computeLineSqueeze(SQUEEZE_CLOSES, 2, 2, 1.5);
    expect(out.mid).toEqual(MID_EXPECTED);
  });

  it('keeps the compression positive exactly when BB sits inside KC', () => {
    const out = computeLineSqueeze(SQUEEZE_CLOSES, 2, 2, 1.5);
    for (let i = 2; i < SQUEEZE_CLOSES.length; i += 1) {
      const inside =
        out.bbUpper[i]! < out.kcUpper[i]! &&
        out.bbLower[i]! > out.kcLower[i]!;
      expect(out.compression[i]! > 0).toBe(inside);
    }
  });

  it('returns empty series for a non-array input', () => {
    expect(computeLineSqueeze(null, 2, 2, 1.5)).toEqual({
      mid: [],
      bbUpper: [],
      bbLower: [],
      kcUpper: [],
      kcLower: [],
      compression: [],
    });
  });
});

describe('runLineSqueeze', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineSqueeze(SQUEEZE_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and the two multipliers', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    expect(run.period).toBe(2);
    expect(run.bbMult).toBe(2);
    expect(run.kcMult).toBe(1.5);
  });

  it('exposes the Bollinger Band series', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    expect(run.bbUpper).toEqual(BB_UPPER_EXPECTED);
    expect(run.bbLower).toEqual(BB_LOWER_EXPECTED);
  });

  it('exposes the Keltner Channel series', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    expect(run.kcUpper).toEqual(KC_UPPER_EXPECTED);
    expect(run.kcLower).toEqual(KC_LOWER_EXPECTED);
  });

  it('exposes the compression series', () => {
    expect(runLineSqueeze(SQUEEZE_DATA, OPTS).compression).toEqual(
      COMPRESSION_EXPECTED,
    );
  });

  it('emits one sample per point', () => {
    expect(runLineSqueeze(SQUEEZE_DATA, OPTS).samples).toHaveLength(
      SQUEEZE_DATA.length,
    );
  });

  it('classifies each sample as on, off or none', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    expect(run.samples.map((s) => s.state)).toEqual(STATE_EXPECTED);
  });

  it('flags the squeeze on exactly when BB sits inside KC', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    for (const s of run.samples) {
      if (s.state === 'none') continue;
      const inside =
        s.bbUpper! < s.kcUpper! && s.bbLower! > s.kcLower!;
      expect(s.state === 'on').toBe(inside);
    }
  });

  it('counts the squeeze-on and squeeze-off bars', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    expect(run.squeezeOnCount).toBe(6);
    expect(run.squeezeOffCount).toBe(2);
  });

  it('keeps the counts consistent with the samples', () => {
    const run = runLineSqueeze(SQUEEZE_DATA, OPTS);
    const on = run.samples.filter((s) => s.state === 'on').length;
    const off = run.samples.filter((s) => s.state === 'off').length;
    expect(run.squeezeOnCount).toBe(on);
    expect(run.squeezeOffCount).toBe(off);
  });

  it('reports the longest unbroken squeeze run', () => {
    expect(runLineSqueeze(SQUEEZE_DATA, OPTS).longestSqueeze).toBe(3);
  });

  it('reports the final squeeze state', () => {
    expect(runLineSqueeze(SQUEEZE_DATA, OPTS).finalState).toBe('on');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineSqueeze([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineSqueeze([], OPTS).ok).toBe(false);
    expect(runLineSqueeze(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      SQUEEZE_DATA[6]!,
      SQUEEZE_DATA[0]!,
      SQUEEZE_DATA[9]!,
      SQUEEZE_DATA[3]!,
    ];
    const run = runLineSqueeze(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the 20/2/1.5 configuration', () => {
    const run = runLineSqueeze(SQUEEZE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_SQUEEZE_PERIOD);
    expect(run.bbMult).toBe(DEFAULT_CHART_LINE_SQUEEZE_BB_MULT);
    expect(run.kcMult).toBe(DEFAULT_CHART_LINE_SQUEEZE_KC_MULT);
  });
});

describe('computeLineSqueezeLayout', () => {
  const layoutOptions = {
    data: SQUEEZE_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineSqueezeLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the squeeze panel', () => {
    const layout = computeLineSqueezeLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.squeezePanel.y);
    expect(layout.squeezePanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineSqueezeLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a closed Bollinger Band area path', () => {
    const layout = computeLineSqueezeLayout(layoutOptions);
    expect(layout.bbAreaPath.length).toBeGreaterThan(0);
    expect(layout.bbAreaPath.trim().endsWith('Z')).toBe(true);
  });

  it('builds the Keltner Channel upper and lower paths', () => {
    const layout = computeLineSqueezeLayout(layoutOptions);
    expect(layout.kcUpperPath.length).toBeGreaterThan(0);
    expect(layout.kcLowerPath.length).toBeGreaterThan(0);
  });

  it('builds a non-empty compression path', () => {
    expect(
      computeLineSqueezeLayout(layoutOptions).compressionPath.length,
    ).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineSqueezeLayout(layoutOptions).priceDots).toHaveLength(
      SQUEEZE_DATA.length,
    );
  });

  it('emits one squeeze dot per classified sample', () => {
    expect(computeLineSqueezeLayout(layoutOptions).squeezeDots).toHaveLength(
      8,
    );
  });

  it('places the zero line inside the squeeze panel', () => {
    const layout = computeLineSqueezeLayout(layoutOptions);
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.squeezePanel.y);
    expect(layout.zeroY).toBeLessThanOrEqual(
      layout.squeezePanel.y + layout.squeezePanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineSqueezeLayout(layoutOptions);
    expect(layout.squeezeOnCount).toBe(6);
    expect(layout.squeezeOffCount).toBe(2);
    expect(layout.longestSqueeze).toBe(3);
    expect(layout.finalState).toBe('on');
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(
      computeLineSqueezeLayout({ ...layoutOptions, width: 60 }).ok,
    ).toBe(false);
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineSqueezeLayout({
        ...layoutOptions,
        data: [{ x: 0, value: 1 }],
      }).ok,
    ).toBe(false);
  });
});

describe('describeLineSqueezeChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineSqueezeChart(SQUEEZE_DATA, OPTS);
    expect(text).toContain('TTM Squeeze');
    expect(text).toContain('Bollinger Bands');
    expect(text).toContain('Keltner Channels');
    expect(text).toContain('squeeze');
  });

  it('reports the squeeze-on and squeeze-off counts', () => {
    const text = describeLineSqueezeChart(SQUEEZE_DATA, OPTS);
    expect(text).toContain('on for 6');
    expect(text).toContain('off for 2');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineSqueezeChart([])).toBe('No data');
  });
});

describe('<ChartLineSqueeze />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-squeeze-aria-desc"]',
    );
    expect(desc?.textContent).toContain('TTM Squeeze');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-squeeze"]');
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-squeeze-on-count')).toBe('6');
    expect(root?.getAttribute('data-squeeze-off-count')).toBe('2');
    expect(root?.getAttribute('data-longest-squeeze')).toBe('3');
    expect(root?.getAttribute('data-final-state')).toBe('on');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-squeeze-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('Squeeze');
  });

  it('renders the Bollinger Band area', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-bb-area"]'),
    ).not.toBeNull();
  });

  it('renders the Keltner Channel upper and lower lines', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-kc-upper"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-squeeze-kc-lower"]'),
    ).not.toBeNull();
  });

  it('renders the compression line', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-compression-line"]',
      ),
    ).not.toBeNull();
  });

  it('renders one squeeze dot per classified sample', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-squeeze-dot"]',
      ),
    ).toHaveLength(8);
  });

  it('renders the zero line', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders the four-item legend', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-legend-item"]',
      ),
    ).toHaveLength(4);
  });

  it('renders the config badge with the period and multipliers', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-squeeze-badge-config"]',
    );
    expect(badge?.textContent).toBe('2/2/1.5');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-price-path"]'),
    ).toBeNull();
  });

  it('hides the Bollinger Band area when showBb is false', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showBb={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-bb-area"]'),
    ).toBeNull();
  });

  it('hides the Keltner Channels when showKc is false', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showKc={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-kc-upper"]'),
    ).toBeNull();
  });

  it('hides the squeeze panel content when showSqueeze is false', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showSqueeze={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-squeeze-compression-line"]',
      ),
    ).toBeNull();
    expect(
      container.querySelectorAll(
        '[data-section="chart-line-squeeze-squeeze-dot"]',
      ),
    ).toHaveLength(0);
  });

  it('hides the Bollinger Band area via the hidden set', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} hiddenSeries={['bb']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-bb-area"]'),
    ).toBeNull();
  });

  it('hides the zero line when showZeroLine is false', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showZeroLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-zero-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineSqueeze
        data={SQUEEZE_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-squeeze-legend-item"][data-series-id="kc"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'kc', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-squeeze-dot"]'),
    ).toHaveLength(SQUEEZE_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineSqueeze data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-squeeze"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-squeeze-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineSqueeze ref={ref} data={SQUEEZE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-squeeze',
    );
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineSqueeze.displayName).toBe('ChartLineSqueeze');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineSqueeze data={SQUEEZE_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-squeeze"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
