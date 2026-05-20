import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  ChartLineMama,
  getLineMamaFinitePoints,
  normalizeLineMamaPeriod,
  normalizeLineMamaLimit,
  computeLineMamaPhase,
  computeLineMama,
  runLineMama,
  computeLineMamaLayout,
  describeLineMamaChart,
  DEFAULT_CHART_LINE_MAMA_PERIOD,
  type ChartLineMamaPoint,
} from './chart-line-mama';

afterEach(() => cleanup());

const MAMA_VALUES = [
  100, 110, 120, 115, 105, 95, 90, 95, 105, 115, 120, 110,
];
const MAMA_DATA: ChartLineMamaPoint[] = MAMA_VALUES.map((value, x) => ({
  x,
  value,
}));
const FLAT_VALUES = [50, 50, 50, 50, 50, 50, 50, 50];
const OPTS = { period: 4, slowLimit: 0.1, fastLimit: 0.6 };

describe('getLineMamaFinitePoints', () => {
  it('keeps only points with a finite x and value', () => {
    const points = [
      { x: 0, value: 10 },
      { x: 1, value: Number.NaN },
      { x: Number.POSITIVE_INFINITY, value: 5 },
      { x: 2, value: 20 },
    ] as ChartLineMamaPoint[];
    expect(getLineMamaFinitePoints(points)).toEqual([
      { x: 0, value: 10 },
      { x: 2, value: 20 },
    ]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(getLineMamaFinitePoints(null)).toEqual([]);
    expect(getLineMamaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineMamaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineMamaPeriod(10.8, 10)).toBe(10);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineMamaPeriod(0, 10)).toBe(10);
    expect(normalizeLineMamaPeriod(-3, 10)).toBe(10);
    expect(normalizeLineMamaPeriod(Number.NaN, 10)).toBe(10);
  });
});

describe('normalizeLineMamaLimit', () => {
  it('uses a limit inside the open interval 0 to 1', () => {
    expect(normalizeLineMamaLimit(0.3, 0.5)).toBe(0.3);
  });

  it('falls back for a limit outside the range or non-finite', () => {
    expect(normalizeLineMamaLimit(0, 0.5)).toBe(0.5);
    expect(normalizeLineMamaLimit(1, 0.5)).toBe(0.5);
    expect(normalizeLineMamaLimit(Number.NaN, 0.5)).toBe(0.5);
  });
});

describe('computeLineMamaPhase', () => {
  it('is null through the detrend warm-up', () => {
    expect(computeLineMamaPhase(MAMA_VALUES, 4).slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads zero for a flat series', () => {
    const phase = computeLineMamaPhase(FLAT_VALUES, 4);
    expect(phase.slice(4)).toEqual([0, 0, 0, 0]);
  });

  it('produces a finite phase for a varying series', () => {
    const phase = computeLineMamaPhase(MAMA_VALUES, 4);
    for (let i = 4; i < MAMA_VALUES.length; i += 1) {
      expect(Number.isFinite(phase[i])).toBe(true);
    }
  });

  it('returns an empty array for a non-array input', () => {
    expect(computeLineMamaPhase(null, 4)).toEqual([]);
  });
});

describe('computeLineMama', () => {
  it('seeds the mama and fama at the first value', () => {
    const out = computeLineMama(MAMA_VALUES, 4, 0.1, 0.6);
    expect(out.mama[0]).toBe(100);
    expect(out.fama[0]).toBe(100);
  });

  it('keeps the mama and fama flat for a flat price', () => {
    const out = computeLineMama(FLAT_VALUES, 4, 0.1, 0.6);
    for (const m of out.mama) expect(m).toBeCloseTo(50, 9);
    for (const f of out.fama) expect(f).toBeCloseTo(50, 9);
  });

  it('follows the mama recursion', () => {
    const out = computeLineMama(MAMA_VALUES, 4, 0.1, 0.6);
    for (let i = 1; i < MAMA_VALUES.length; i += 1) {
      const a = out.alpha[i]!;
      const expected = a * MAMA_VALUES[i]! + (1 - a) * out.mama[i - 1]!;
      expect(out.mama[i]!).toBeCloseTo(expected, 9);
    }
  });

  it('follows the fama recursion', () => {
    const out = computeLineMama(MAMA_VALUES, 4, 0.1, 0.6);
    for (let i = 1; i < MAMA_VALUES.length; i += 1) {
      const a = out.alpha[i]!;
      const expected =
        0.5 * a * out.mama[i]! + (1 - 0.5 * a) * out.fama[i - 1]!;
      expect(out.fama[i]!).toBeCloseTo(expected, 9);
    }
  });

  it('keeps alpha within the slow and fast limits', () => {
    const out = computeLineMama(MAMA_VALUES, 4, 0.1, 0.6);
    for (const a of out.alpha) {
      expect(a).toBeGreaterThanOrEqual(0.1);
      expect(a).toBeLessThanOrEqual(0.6);
    }
  });

  it('is finite for every bar', () => {
    const out = computeLineMama(MAMA_VALUES, 4, 0.1, 0.6);
    expect(out.mama.every((v) => Number.isFinite(v))).toBe(true);
    expect(out.fama.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('returns empty series for a non-array input', () => {
    expect(computeLineMama(null, 4, 0.1, 0.6)).toEqual({
      mama: [],
      fama: [],
      alpha: [],
    });
  });
});

describe('runLineMama', () => {
  it('marks ok for a sufficient series', () => {
    expect(runLineMama(MAMA_DATA, OPTS).ok).toBe(true);
  });

  it('carries the period and the alpha limits', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    expect(run.period).toBe(4);
    expect(run.slowLimit).toBe(0.1);
    expect(run.fastLimit).toBe(0.6);
  });

  it('exposes the mama, fama and alpha series', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    expect(run.mama).toHaveLength(MAMA_DATA.length);
    expect(run.fama).toHaveLength(MAMA_DATA.length);
    expect(run.alpha).toHaveLength(MAMA_DATA.length);
  });

  it('emits one sample per point', () => {
    expect(runLineMama(MAMA_DATA, OPTS).samples).toHaveLength(
      MAMA_DATA.length,
    );
  });

  it('classifies the first bar neutral', () => {
    expect(runLineMama(MAMA_DATA, OPTS).samples[0]!.cross).toBe('neutral');
  });

  it('classifies each sample as bullish, bearish or neutral', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    for (const s of run.samples) {
      expect(['bullish', 'bearish', 'neutral']).toContain(s.cross);
    }
  });

  it('keeps the cross counts consistent with the samples', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    expect(run.bullishCount).toBe(
      run.samples.filter((s) => s.cross === 'bullish').length,
    );
    expect(run.bearishCount).toBe(
      run.samples.filter((s) => s.cross === 'bearish').length,
    );
    expect(
      run.bullishCount + run.bearishCount + run.neutralCount,
    ).toBe(MAMA_DATA.length);
  });

  it('reports the final mama and fama readings', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    expect(run.mamaFinal).toBe(run.mama[run.mama.length - 1]);
    expect(run.famaFinal).toBe(run.fama[run.fama.length - 1]);
  });

  it('carries the mama, fama, alpha and cross fields on each sample', () => {
    const run = runLineMama(MAMA_DATA, OPTS);
    const s = run.samples[5]!;
    expect(Number.isFinite(s.mama)).toBe(true);
    expect(Number.isFinite(s.fama)).toBe(true);
    expect(Number.isFinite(s.alpha)).toBe(true);
    expect(['bullish', 'bearish', 'neutral']).toContain(s.cross);
  });

  it('is not ok for a single-point series', () => {
    expect(runLineMama([{ x: 0, value: 1 }], OPTS).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineMama([], OPTS).ok).toBe(false);
    expect(runLineMama(null, OPTS).ok).toBe(false);
  });

  it('sorts the points by x before running', () => {
    const shuffled = [
      MAMA_DATA[7]!,
      MAMA_DATA[0]!,
      MAMA_DATA[11]!,
      MAMA_DATA[3]!,
    ];
    const run = runLineMama(shuffled, OPTS);
    expect(run.series.map((p) => p.x)).toEqual([0, 3, 7, 11]);
  });

  it('defaults to the period 10 configuration', () => {
    expect(runLineMama(MAMA_DATA).period).toBe(
      DEFAULT_CHART_LINE_MAMA_PERIOD,
    );
  });
});

describe('computeLineMamaLayout', () => {
  const layoutOptions = {
    data: MAMA_DATA,
    ...OPTS,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('marks ok for a valid layout', () => {
    expect(computeLineMamaLayout(layoutOptions).ok).toBe(true);
  });

  it('uses a single full-width panel', () => {
    const layout = computeLineMamaLayout(layoutOptions);
    expect(layout.panel.x).toBe(40);
    expect(layout.panel.width).toBe(560 - 80);
  });

  it('builds a non-empty price path', () => {
    expect(
      computeLineMamaLayout(layoutOptions).pricePath.length,
    ).toBeGreaterThan(0);
  });

  it('builds non-empty mama and fama paths', () => {
    const layout = computeLineMamaLayout(layoutOptions);
    expect(layout.mamaPath.length).toBeGreaterThan(0);
    expect(layout.famaPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per point', () => {
    expect(computeLineMamaLayout(layoutOptions).priceDots).toHaveLength(
      MAMA_DATA.length,
    );
  });

  it('emits one mama marker per point', () => {
    expect(computeLineMamaLayout(layoutOptions).mamaMarkers).toHaveLength(
      MAMA_DATA.length,
    );
  });

  it('carries the run statistics', () => {
    const layout = computeLineMamaLayout(layoutOptions);
    expect(layout.period).toBe(4);
    expect(layout.totalPoints).toBe(12);
    expect(Number.isFinite(layout.mamaFinal)).toBe(true);
  });

  it('is not ok for a collapsed canvas', () => {
    expect(computeLineMamaLayout({ ...layoutOptions, width: 60 }).ok).toBe(
      false,
    );
  });

  it('is not ok for too little data', () => {
    expect(
      computeLineMamaLayout({ ...layoutOptions, data: [{ x: 0, value: 1 }] })
        .ok,
    ).toBe(false);
  });
});

describe('describeLineMamaChart', () => {
  it('describes the indicator vocabulary', () => {
    const text = describeLineMamaChart(MAMA_DATA, OPTS);
    expect(text).toContain('MESA Adaptive Moving Average');
    expect(text).toContain('alpha');
    expect(text).toContain('phase');
    expect(text).toContain('adapt');
  });

  it('reports the cross counts', () => {
    const text = describeLineMamaChart(MAMA_DATA, OPTS);
    expect(text).toContain('bullish on');
    expect(text).toContain('bearish on');
  });

  it('returns No data for an empty input', () => {
    expect(describeLineMamaChart([])).toBe('No data');
  });
});

describe('<ChartLineMama />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders an accessible description', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    const desc = container.querySelector(
      '[data-section="chart-line-mama-aria-desc"]',
    );
    expect(desc?.textContent).toContain('MESA Adaptive Moving Average');
  });

  it('exposes the run summary on the root data attributes', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    const root = container.querySelector('[data-section="chart-line-mama"]');
    expect(root?.getAttribute('data-period')).toBe('4');
    expect(root?.getAttribute('data-total-points')).toBe('12');
    expect(root?.getAttribute('data-bullish-count')).toBeTruthy();
  });

  it('renders the svg and the price line', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-mama-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-mama-price-path"]'),
    ).not.toBeNull();
  });

  it('renders the mama line', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-mama-mama-line"]'),
    ).not.toBeNull();
  });

  it('renders the fama line', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelector('[data-section="chart-line-mama-fama-line"]'),
    ).not.toBeNull();
  });

  it('renders one mama marker per point', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-mama-marker"]'),
    ).toHaveLength(MAMA_DATA.length);
  });

  it('exposes the cross on each mama marker', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    const marker = container.querySelector(
      '[data-section="chart-line-mama-marker"][data-point-index="5"]',
    );
    expect(['bullish', 'bearish', 'neutral']).toContain(
      marker?.getAttribute('data-cross'),
    );
  });

  it('renders the grid lines', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-mama-grid-line"]')
        .length,
    ).toBeGreaterThan(0);
  });

  it('renders the three-item legend', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    expect(
      container.querySelectorAll('[data-section="chart-line-mama-legend-item"]'),
    ).toHaveLength(3);
  });

  it('renders the config badge with the period', () => {
    const { container } = render(<ChartLineMama data={MAMA_DATA} {...OPTS} />);
    const badge = container.querySelector(
      '[data-section="chart-line-mama-badge-config"]',
    );
    expect(badge?.textContent).toBe('4');
  });

  it('hides the price line via the price hidden set', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-price-path"]'),
    ).toBeNull();
  });

  it('hides the mama line and markers when showMama is false', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} showMama={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-mama-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-mama-marker"]'),
    ).toHaveLength(0);
  });

  it('hides the fama line when showFama is false', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} showFama={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-fama-line"]'),
    ).toBeNull();
  });

  it('hides the mama via the hidden set', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} hiddenSeries={['mama']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-mama-line"]'),
    ).toBeNull();
  });

  it('hides the fama via the hidden set', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} hiddenSeries={['fama']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-fama-line"]'),
    ).toBeNull();
  });

  it('reports a series toggle through the callback', () => {
    let payload: { seriesId: string; hidden: boolean } | null = null;
    const { container } = render(
      <ChartLineMama
        data={MAMA_DATA}
        {...OPTS}
        onSeriesToggle={(p) => {
          payload = p;
        }}
      />,
    );
    const item = container.querySelector(
      '[data-section="chart-line-mama-legend-item"][data-series-id="fama"]',
    ) as HTMLButtonElement | null;
    item?.click();
    expect(payload).toEqual({ seriesId: 'fama', hidden: true });
  });

  it('renders price dots when showDots is set', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-mama-dot"]'),
    ).toHaveLength(MAMA_DATA.length);
  });

  it('renders the empty state for too little data', () => {
    const { container } = render(
      <ChartLineMama data={[{ x: 0, value: 1 }]} {...OPTS} />,
    );
    const root = container.querySelector('[data-section="chart-line-mama"]');
    expect(root?.getAttribute('data-empty')).toBe('true');
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-mama-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineMama ref={ref} data={MAMA_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe('chart-line-mama');
  });

  it('exposes a stable displayName', () => {
    expect(ChartLineMama.displayName).toBe('ChartLineMama');
  });

  it('honours the animate flag', () => {
    const { container } = render(
      <ChartLineMama data={MAMA_DATA} {...OPTS} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-mama"]');
    expect(root?.getAttribute('data-animate')).toBe('false');
  });
});
