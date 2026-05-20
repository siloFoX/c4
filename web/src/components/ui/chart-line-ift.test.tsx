import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineIft,
  getLineIftFinitePoints,
  normalizeLineIftPeriod,
  computeLineIftTransform,
  computeLineIftSma,
  computeLineIftOscillator,
  computeLineIft,
  runLineIft,
  computeLineIftLayout,
  describeLineIftChart,
  DEFAULT_CHART_LINE_IFT_PERIOD,
  DEFAULT_CHART_LINE_IFT_SCALE,
  type ChartLineIftPoint,
} from './chart-line-ift';

afterEach(() => cleanup());

const IFT_CLOSES = [20, 24, 20, 28, 20, 12, 24, 20, 20, 28];
const IFT_DATA: ChartLineIftPoint[] = IFT_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = { period: 2, scale: 0.5, threshold: 0.5 };

// period 2, scale 0.5 -> osc[i] = (close[i] - close[i-1]) / 4, so the
// oscillator is an exact dyadic; the transform of it is tanh.
const SMA_EXPECTED = [null, 22, 22, 24, 24, 16, 18, 22, 20, 24];
const OSC_EXPECTED = [null, 1, -1, 2, -2, -2, 3, -1, 0, 2];
const ZONE_EXPECTED = [
  'none',
  'bullish',
  'bearish',
  'bullish',
  'bearish',
  'bearish',
  'bullish',
  'bearish',
  'neutral',
  'bullish',
];

describe('getLineIftFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineIftPoint[];
    expect(getLineIftFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineIftFinitePoints(null)).toEqual([]);
    expect(getLineIftFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineIftPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineIftPeriod(9.6, 9)).toBe(9);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineIftPeriod(0, 9)).toBe(9);
    expect(normalizeLineIftPeriod(-2, 9)).toBe(9);
    expect(normalizeLineIftPeriod(Number.NaN, 9)).toBe(9);
  });
});

describe('computeLineIftTransform', () => {
  it('is exactly zero at the origin', () => {
    expect(computeLineIftTransform(0)).toBe(0);
  });

  it('matches the hyperbolic tangent', () => {
    for (const x of [0.5, 1, 2, -1.5, -3]) {
      expect(computeLineIftTransform(x)).toBeCloseTo(Math.tanh(x), 10);
    }
  });

  it('stays inside the open interval -1 to 1', () => {
    for (const x of [-5, -2, 0, 2, 5]) {
      const t = computeLineIftTransform(x);
      expect(t).toBeGreaterThan(-1);
      expect(t).toBeLessThan(1);
    }
  });

  it('is an odd function', () => {
    expect(computeLineIftTransform(-1.3)).toBeCloseTo(
      -computeLineIftTransform(1.3),
      12,
    );
  });

  it('saturates near +1 for a large positive input', () => {
    expect(computeLineIftTransform(20)).toBeCloseTo(1, 6);
  });

  it('saturates near -1 for a large negative input', () => {
    expect(computeLineIftTransform(-20)).toBeCloseTo(-1, 6);
  });

  it('returns 0 for a non-finite input', () => {
    expect(computeLineIftTransform(Number.NaN)).toBe(0);
  });
});

describe('computeLineIftSma', () => {
  it('computes the moving average of the close', () => {
    expect(computeLineIftSma(IFT_CLOSES, 2)).toEqual(SMA_EXPECTED);
  });

  it('is null where the window contains a null', () => {
    expect(computeLineIftSma([null, 4, 8], 2)).toEqual([null, null, 6]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineIftSma(null, 2)).toEqual([]);
  });
});

describe('computeLineIftOscillator', () => {
  it('computes the scaled deviation from the moving average', () => {
    expect(computeLineIftOscillator(IFT_CLOSES, 2, 0.5)).toEqual(
      OSC_EXPECTED,
    );
  });

  it('is null through the warm-up', () => {
    expect(computeLineIftOscillator(IFT_CLOSES, 2, 0.5)[0]).toBeNull();
  });

  it('scales with the scale factor', () => {
    const osc = computeLineIftOscillator(IFT_CLOSES, 2, 1);
    expect(osc[1]).toBe(2);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineIftOscillator(null, 2, 0.5)).toEqual([]);
  });
});

describe('computeLineIft', () => {
  it('compresses the oscillator through the transform', () => {
    const ift = computeLineIft(IFT_CLOSES, 2, 0.5);
    for (let i = 1; i < OSC_EXPECTED.length; i += 1) {
      expect(ift[i]!).toBeCloseTo(Math.tanh(OSC_EXPECTED[i] as number), 10);
    }
  });

  it('is exactly zero where the oscillator is zero', () => {
    expect(computeLineIft(IFT_CLOSES, 2, 0.5)[8]).toBe(0);
  });

  it('is null through the warm-up', () => {
    expect(computeLineIft(IFT_CLOSES, 2, 0.5)[0]).toBeNull();
  });

  it('is the transform of the oscillator', () => {
    const osc = computeLineIftOscillator(IFT_CLOSES, 2, 0.5);
    const ift = computeLineIft(IFT_CLOSES, 2, 0.5);
    expect(ift[3]).toBe(computeLineIftTransform(osc[3] as number));
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineIft(null, 2, 0.5)).toEqual([]);
  });
});

describe('runLineIft', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineIft(IFT_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period, scale and threshold', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    expect(run.period).toBe(2);
    expect(run.scale).toBe(0.5);
    expect(run.threshold).toBe(0.5);
  });

  it('exposes the oscillator series', () => {
    expect(runLineIft(IFT_DATA, OPTS).oscillator).toEqual(OSC_EXPECTED);
  });

  it('exposes the ift series', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    expect(run.ift).toHaveLength(IFT_DATA.length);
    expect(run.ift[8]).toBe(0);
    expect(run.ift[1]!).toBeCloseTo(Math.tanh(1), 10);
  });

  it('emits one sample per point', () => {
    expect(runLineIft(IFT_DATA, OPTS).samples).toHaveLength(IFT_DATA.length);
  });

  it('classifies each sample into a zone', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    expect(run.samples.map((s) => s.zone)).toEqual(ZONE_EXPECTED);
  });

  it('counts the bullish, bearish and neutral bars', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    expect(run.bullishCount).toBe(4);
    expect(run.bearishCount).toBe(4);
    expect(run.neutralCount).toBe(1);
  });

  it('keeps the zone counts consistent with the samples', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.zone === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.zone === 'bearish').length,
    );
  });

  it('reports the final ift reading', () => {
    expect(runLineIft(IFT_DATA, OPTS).iftFinal).toBeCloseTo(
      Math.tanh(2),
      10,
    );
  });

  it('carries the oscillator, ift and zone fields on each sample', () => {
    const run = runLineIft(IFT_DATA, OPTS);
    const s = run.samples[3]!;
    expect(s.oscillator).toBe(2);
    expect(s.ift!).toBeCloseTo(Math.tanh(2), 10);
    expect(s.zone).toBe('bullish');
  });

  it('is not ok for a single-point series', () => {
    expect(runLineIft([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineIft([], OPTS).ok).toBe(false);
    expect(runLineIft(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      IFT_DATA[6]!,
      IFT_DATA[0]!,
      IFT_DATA[9]!,
      IFT_DATA[3]!,
    ];
    const run = runLineIft(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 6, 9]);
  });

  it('defaults to the period 9 scale 0.5 configuration', () => {
    const run = runLineIft(IFT_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_IFT_PERIOD);
    expect(run.scale).toBe(DEFAULT_CHART_LINE_IFT_SCALE);
  });
});

describe('computeLineIftLayout', () => {
  const layoutOptions = {
    data: IFT_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineIftLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the ift panel', () => {
    const layout = computeLineIftLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.iftPanel.y);
    expect(layout.iftPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineIftLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds a non-empty ift path', () => {
    expect(computeLineIftLayout(layoutOptions).iftPath.length).toBeGreaterThan(
      0,
    );
  });

  it('emits one price dot per point', () => {
    expect(computeLineIftLayout(layoutOptions).priceDots).toHaveLength(
      IFT_DATA.length,
    );
  });

  it('emits one ift marker per defined sample', () => {
    expect(computeLineIftLayout(layoutOptions).iftMarkers).toHaveLength(9);
  });

  it('orders the upper, zero and lower level lines top to bottom', () => {
    const layout = computeLineIftLayout(layoutOptions);
    expect(layout.upperY).toBeLessThan(layout.zeroY);
    expect(layout.zeroY).toBeLessThan(layout.lowerY);
  });

  it('places the level lines inside the ift panel', () => {
    const layout = computeLineIftLayout(layoutOptions);
    for (const y of [layout.upperY, layout.zeroY, layout.lowerY]) {
      expect(y).toBeGreaterThanOrEqual(layout.iftPanel.y);
      expect(y).toBeLessThanOrEqual(
        layout.iftPanel.y + layout.iftPanel.height,
      );
    }
  });

  it('carries the run statistics', () => {
    const layout = computeLineIftLayout(layoutOptions);
    expect(layout.bullishCount).toBe(4);
    expect(layout.bearishCount).toBe(4);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineIftLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineIftLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineIftChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineIftChart(IFT_DATA, OPTS);
    expect(text).toContain('Inverse Fisher Transform');
    expect(text).toContain('oscillator');
    expect(text).toContain('compresses');
    expect(text).toContain('-1 to +1');
  });

  it('reports the zone counts', () => {
    const text = describeLineIftChart(IFT_DATA, OPTS);
    expect(text).toContain('bullish on 4');
    expect(text).toContain('bearish on 4');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineIftChart([])).toBe('No data');
  });
});

describe('<ChartLineIft />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-ift-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Inverse Fisher Transform');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-ift"]');
    expect(root?.getAttribute('data-period')).toBe('2');
    expect(root?.getAttribute('data-bullish-count')).toBe('4');
    expect(root?.getAttribute('data-bearish-count')).toBe('4');
    expect(root?.getAttribute('data-neutral-count')).toBe('1');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ift-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-ift-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const labels = Array.from(
      container.querySelectorAll('[data-section="chart-line-ift-panel-label"]'),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('IFT');
  });

  it('renders the ift line', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-ift-ift-line"]'),
    ).not.toBeNull();
  });

  it('renders one ift marker per defined sample', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-ift-marker"]'),
    ).toHaveLength(9);
  });

  it('renders the upper, zero and lower level lines', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-ift-level-line"]'),
    ).toHaveLength(3);
  });

  it('exposes the zone on each ift marker', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-ift-marker"][data-point-index="8"]',
    );
    expect(marker?.getAttribute('data-zone')).toBe('neutral');
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-ift-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period and scale', () => {
    const { container } = render(<ChartLineIft data={IFT_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-ift-badge-config"]',
    );
    expect(badge?.textContent).toBe('2/0.5');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-price-path"]'),
    ).toBeNull();
  });

  it('hides the ift line and markers when showIft is false', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} showIft={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-ift-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-ift-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the level lines when showLevels is false', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} showLevels={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-level-line"]'),
    ).toBeNull();
  });

  it('hides the ift via the hidden set', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} hiddenSeries={['ift']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-ift-line"]'),
    ).toBeNull();
  });

  it('hides the level lines via the hidden set', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} hiddenSeries={['levels']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-level-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineIft
        data={IFT_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-ift-legend-item"][data-series-id="ift"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'ift', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-ift-dot"]'),
    ).toHaveLength(IFT_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineIft data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-ift"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-ift-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineIft ref={ref} data={IFT_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-ift');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineIft.displayName).toBe('ChartLineIft');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineIft data={IFT_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-ift"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
