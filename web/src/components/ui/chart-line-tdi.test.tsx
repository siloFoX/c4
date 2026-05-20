import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineTdi,
  getLineTdiFinitePoints,
  normalizeLineTdiPeriod,
  computeLineTdiRsi,
  computeLineTdiSma,
  computeLineTdiBand,
  computeLineTdi,
  runLineTdi,
  computeLineTdiLayout,
  describeLineTdiChart,
  DEFAULT_CHART_LINE_TDI_RSI_PERIOD,
  DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD,
  DEFAULT_CHART_LINE_TDI_BAND_PERIOD,
  type ChartLineTdiPoint,
} from './chart-line-tdi';

afterEach(() => cleanup());

const TDI_CLOSES = [20, 26, 36, 30, 40, 34, 24, 30, 40, 34];
const TDI_DATA: ChartLineTdiPoint[] = TDI_CLOSES.map((value, x) => ({
  x,
  value,
}));
const OPTS = {
  rsiPeriod: 2,
  signalPeriod: 2,
  bandPeriod: 2,
  multiplier: 2,
};

// Cutler RSI of TDI_CLOSES, period 2. Every window has gain+loss
// total 16, so RSI = 100 * gainSum / 16 lands on exact dyadics.
const RSI_EXPECTED = [
  null,
  null,
  100,
  62.5,
  62.5,
  62.5,
  0,
  37.5,
  100,
  62.5,
];
// 2-bar SMA of the RSI.
const SIGNAL_EXPECTED = [
  null,
  null,
  null,
  81.25,
  62.5,
  62.5,
  31.25,
  18.75,
  68.75,
  81.25,
];
// Bollinger band on the RSI, period 2, multiplier 2. The 2-bar
// population stddev is |rsi[i]-rsi[i-1]|/2, exact for dyadic input.
const BAND_UPPER_EXPECTED = [
  null,
  null,
  null,
  118.75,
  62.5,
  62.5,
  93.75,
  56.25,
  131.25,
  118.75,
];
const BAND_LOWER_EXPECTED = [
  null,
  null,
  null,
  43.75,
  62.5,
  62.5,
  -31.25,
  -18.75,
  6.25,
  43.75,
];
const CROSS_EXPECTED = [
  'neutral',
  'neutral',
  'neutral',
  'bearish',
  'neutral',
  'neutral',
  'bearish',
  'bullish',
  'bullish',
  'bearish',
];

describe('getLineTdiFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineTdiPoint[];
    expect(getLineTdiFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineTdiFinitePoints(null)).toEqual([]);
    expect(getLineTdiFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineTdiPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineTdiPeriod(7.8, 13)).toBe(7);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineTdiPeriod(0, 13)).toBe(13);
    expect(normalizeLineTdiPeriod(-4, 13)).toBe(13);
    expect(normalizeLineTdiPeriod(Number.NaN, 13)).toBe(13);
  });
});

describe('computeLineTdiRsi', () => {
  it('computes the RSI from the bar gains and losses', () => {
    expect(computeLineTdiRsi(TDI_CLOSES, 2)).toEqual(RSI_EXPECTED);
  });

  it('is null through the warm-up', () => {
    const rsi = computeLineTdiRsi(TDI_CLOSES, 2);
    expect(rsi[0]).toBeNull();
    expect(rsi[1]).toBeNull();
  });

  it('reads 100 when every bar rises', () => {
    expect(computeLineTdiRsi([10, 12, 14, 16], 2)).toEqual([
      null,
      null,
      100,
      100,
    ]);
  });

  it('reads 0 when every bar falls', () => {
    expect(computeLineTdiRsi([16, 14, 12, 10], 2)).toEqual([
      null,
      null,
      0,
      0,
    ]);
  });

  it('reads 50 for a flat series with no movement', () => {
    expect(computeLineTdiRsi([5, 5, 5, 5], 2)).toEqual([
      null,
      null,
      50,
      50,
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineTdiRsi(null, 2)).toEqual([]);
  });
});

describe('computeLineTdiSma', () => {
  it('computes the moving average of a nullable series', () => {
    expect(computeLineTdiSma([null, 10, 20, 30], 2)).toEqual([
      null,
      null,
      15,
      25,
    ]);
  });

  it('is null where the window contains a null', () => {
    const sma = computeLineTdiSma(RSI_EXPECTED, 2);
    expect(sma[1]).toBeNull();
    expect(sma[2]).toBeNull();
    expect(sma[3]).toBe(81.25);
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineTdiSma(null, 2)).toEqual([]);
  });
});

describe('computeLineTdiBand', () => {
  it('computes the band middle as the RSI moving average', () => {
    const band = computeLineTdiBand(RSI_EXPECTED, 2, 2);
    expect(band.middle).toEqual(SIGNAL_EXPECTED);
  });

  it('computes the upper and lower band from the RSI stddev', () => {
    const band = computeLineTdiBand(RSI_EXPECTED, 2, 2);
    expect(band.upper).toEqual(BAND_UPPER_EXPECTED);
    expect(band.lower).toEqual(BAND_LOWER_EXPECTED);
  });

  it('collapses the band onto the middle where the RSI is flat', () => {
    const band = computeLineTdiBand(RSI_EXPECTED, 2, 2);
    expect(band.upper[4]).toBe(62.5);
    expect(band.lower[4]).toBe(62.5);
    expect(band.middle[4]).toBe(62.5);
  });

  it('returns empty series for a non-array input', () => {
    expect(computeLineTdiBand(null, 2, 2)).toEqual({
      middle: [],
      upper: [],
      lower: [],
    });
  });
});

describe('computeLineTdi', () => {
  it('computes the rsi, signal and band together', () => {
    const out = computeLineTdi(TDI_CLOSES, 2, 2, 2, 2);
    expect(out.rsi).toEqual(RSI_EXPECTED);
    expect(out.signal).toEqual(SIGNAL_EXPECTED);
    expect(out.bandUpper).toEqual(BAND_UPPER_EXPECTED);
    expect(out.bandLower).toEqual(BAND_LOWER_EXPECTED);
  });

  it('derives the signal as the RSI moving average', () => {
    const out = computeLineTdi(TDI_CLOSES, 2, 2, 2, 2);
    expect(out.signal).toEqual(computeLineTdiSma(out.rsi, 2));
  });

  it('is null through the warm-up', () => {
    const out = computeLineTdi(TDI_CLOSES, 2, 2, 2, 2);
    expect(out.signal.slice(0, 3)).toEqual([null, null, null]);
  });

  it('returns empty series for a non-array input', () => {
    expect(computeLineTdi(null, 2, 2, 2, 2)).toEqual({
      rsi: [],
      signal: [],
      bandMiddle: [],
      bandUpper: [],
      bandLower: [],
    });
  });
});

describe('runLineTdi', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineTdi(TDI_DATA, OPTS).ok).toBe(true);
  });

  it('carries the rsi, signal and band periods', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    expect(run.rsiPeriod).toBe(2);
    expect(run.signalPeriod).toBe(2);
    expect(run.bandPeriod).toBe(2);
  });

  it('carries the band multiplier', () => {
    expect(runLineTdi(TDI_DATA, OPTS).multiplier).toBe(2);
  });

  it('exposes the rsi series', () => {
    expect(runLineTdi(TDI_DATA, OPTS).rsi).toEqual(RSI_EXPECTED);
  });

  it('exposes the signal series', () => {
    expect(runLineTdi(TDI_DATA, OPTS).signal).toEqual(SIGNAL_EXPECTED);
  });

  it('exposes the band upper and lower series', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    expect(run.bandUpper).toEqual(BAND_UPPER_EXPECTED);
    expect(run.bandLower).toEqual(BAND_LOWER_EXPECTED);
  });

  it('emits one sample per point', () => {
    expect(runLineTdi(TDI_DATA, OPTS).samples).toHaveLength(TDI_DATA.length);
  });

  it('classifies each sample by the rsi versus the signal', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    expect(run.samples.map((s) => s.cross)).toEqual(CROSS_EXPECTED);
  });

  it('carries the rsi, signal and band fields on each sample', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    const s = run.samples[3]!;
    expect(s.rsi).toBe(62.5);
    expect(s.signal).toBe(81.25);
    expect(s.bandUpper).toBe(118.75);
    expect(s.bandLower).toBe(43.75);
  });

  it('counts the bullish and bearish bars', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    expect(run.bullishCount).toBe(2);
    expect(run.bearishCount).toBe(3);
  });

  it('keeps the bullish and bearish counts consistent with the samples', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    const bull = run.samples.filter((s) => s.cross === 'bullish').length;
    const bear = run.samples.filter((s) => s.cross === 'bearish').length;
    expect(run.bullishCount).toBe(bull);
    expect(run.bearishCount).toBe(bear);
  });

  it('reports the final rsi and signal readings', () => {
    const run = runLineTdi(TDI_DATA, OPTS);
    expect(run.rsiFinal).toBe(62.5);
    expect(run.signalFinal).toBe(81.25);
  });

  it('is not ok for a single-point series', () => {
    expect(runLineTdi([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineTdi([], OPTS).ok).toBe(false);
    expect(runLineTdi(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      TDI_DATA[5]!,
      TDI_DATA[0]!,
      TDI_DATA[9]!,
      TDI_DATA[2]!,
    ];
    const run = runLineTdi(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 2, 5, 9]);
  });

  it('defaults to the 13/7/34 periods', () => {
    const run = runLineTdi(TDI_DATA);
    expect(run.rsiPeriod).toBe(DEFAULT_CHART_LINE_TDI_RSI_PERIOD);
    expect(run.signalPeriod).toBe(DEFAULT_CHART_LINE_TDI_SIGNAL_PERIOD);
    expect(run.bandPeriod).toBe(DEFAULT_CHART_LINE_TDI_BAND_PERIOD);
  });
});

describe('computeLineTdiLayout', () => {
  const layoutOptions = {
    data: TDI_DATA,
    ...OPTS,
    width: 560,
    height: 360,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineTdiLayout(layoutOptions).ok).toBe(true);
  });

  it('stacks the price panel above the tdi panel', () => {
    const layout = computeLineTdiLayout(layoutOptions);
    expect(layout.pricePanel.y).toBeLessThan(layout.tdiPanel.y);
    expect(layout.tdiPanel.y).toBeGreaterThanOrEqual(
      layout.pricePanel.y + layout.pricePanel.height,
    );
  });

  it('builds a non-empty price path', () => {
    expect(computeLineTdiLayout(layoutOptions).pricePath.length).toBeGreaterThan(
      0,
    );
  });

  it('builds the rsi and signal paths', () => {
    const layout = computeLineTdiLayout(layoutOptions);
    expect(layout.rsiPath.length).toBeGreaterThan(0);
    expect(layout.signalPath.length).toBeGreaterThan(0);
  });

  it('builds a closed band area path', () => {
    const layout = computeLineTdiLayout(layoutOptions);
    expect(layout.bandAreaPath.length).toBeGreaterThan(0);
    expect(layout.bandAreaPath.trim().endsWith('Z')).toBe(true);
  });

  it('emits one price dot per point', () => {
    expect(computeLineTdiLayout(layoutOptions).priceDots).toHaveLength(
      TDI_DATA.length,
    );
  });

  it('emits one rsi marker per defined rsi sample', () => {
    expect(computeLineTdiLayout(layoutOptions).rsiMarkers).toHaveLength(8);
  });

  it('places the reference line inside the tdi panel', () => {
    const layout = computeLineTdiLayout(layoutOptions);
    expect(layout.refY).toBeGreaterThanOrEqual(layout.tdiPanel.y);
    expect(layout.refY).toBeLessThanOrEqual(
      layout.tdiPanel.y + layout.tdiPanel.height,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineTdiLayout(layoutOptions);
    expect(layout.rsiFinal).toBe(62.5);
    expect(layout.signalFinal).toBe(81.25);
    expect(layout.bullishCount).toBe(2);
    expect(layout.bearishCount).toBe(3);
    expect(layout.totalPoints).toBe(10);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(
      computeLineTdiLayout({ ...layoutOptions, width: 60 }).ok,
    ).toBe(false);
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineTdiLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineTdiChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineTdiChart(TDI_DATA, OPTS);
    expect(text).toContain('Traders Dynamic Index');
    expect(text).toContain('RSI');
    expect(text).toContain('signal');
    expect(text).toContain('volatility band');
  });

  it('reports the bullish and bearish counts', () => {
    const text = describeLineTdiChart(TDI_DATA, OPTS);
    expect(text).toContain('bullish on 2');
    expect(text).toContain('bearish on 3');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineTdiChart([])).toBe('No data');
  });
});

describe('<ChartLineTdi />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-tdi-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Traders Dynamic Index');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-tdi"]');
    expect(root?.getAttribute('data-rsi-period')).toBe('2');
    expect(root?.getAttribute('data-signal-period')).toBe('2');
    expect(root?.getAttribute('data-band-period')).toBe('2');
    expect(root?.getAttribute('data-bullish-count')).toBe('2');
    expect(root?.getAttribute('data-bearish-count')).toBe('3');
    expect(root?.getAttribute('data-total-points')).toBe('10');
  });

  it('renders the svg and the price line', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-tdi-price-path"]'),
    ).not.toBeNull();
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    const labels = Array.from(
      container.querySelectorAll(
        '[data-section="chart-line-tdi-panel-label"]',
      ),
    ).map((n) => n.textContent);
    expect(labels).toContain('Price');
    expect(labels).toContain('TDI');
  });

  it('renders the rsi line', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-rsi-line"]'),
    ).not.toBeNull();
  });

  it('renders the signal line', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-signal-line"]'),
    ).not.toBeNull();
  });

  it('renders the band area', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-band-area"]'),
    ).not.toBeNull();
  });

  it('renders one rsi marker per defined sample', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-tdi-marker"]'),
    ).toHaveLength(8);
  });

  it('renders the reference line', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-ref-line"]'),
    ).not.toBeNull();
  });

  it('renders the four-item legend', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-tdi-legend-item"]'),
    ).toHaveLength(4);
  });

  it('renders the config badge with all three periods', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-tdi-badge-config"]',
    );
    expect(badge?.textContent).toBe('2/2/2');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-price-path"]'),
    ).toBeNull();
  });

  it('hides the rsi line when showRsi is false', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showRsi={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-rsi-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-tdi-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the signal line when showSignal is false', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showSignal={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-signal-line"]'),
    ).toBeNull();
  });

  it('hides the band area when showBand is false', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showBand={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-band-area"]'),
    ).toBeNull();
  });

  it('hides the rsi line via the hidden set', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} hiddenSeries={['rsi']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-rsi-line"]'),
    ).toBeNull();
  });

  it('hides the reference line when showRefLine is false', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showRefLine={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-ref-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineTdi
        data={TDI_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-tdi-legend-item"][data-series-id="signal"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'signal', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-tdi-dot"]'),
    ).toHaveLength(TDI_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineTdi data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-tdi"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-tdi-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineTdi ref={ref} data={TDI_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-tdi');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineTdi.displayName).toBe('ChartLineTdi');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineTdi data={TDI_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-tdi"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
