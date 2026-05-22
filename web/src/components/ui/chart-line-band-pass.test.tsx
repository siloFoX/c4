import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render } from '@testing-library/react';
import {
  ChartLineBandPass,
  type ChartLineBandPassPoint,
  type ChartLineBandPassSample,
  DEFAULT_CHART_LINE_BAND_PASS_PERIOD,
  DEFAULT_CHART_LINE_BAND_PASS_BANDWIDTH,
  getLineBandPassFinitePoints,
  normalizeLineBandPassPeriod,
  normalizeLineBandPassBandwidth,
  computeLineBandPassCoefficients,
  computeLineBandPass,
  classifyLineBandPassZone,
  runLineBandPass,
  computeLineBandPassLayout,
  describeLineBandPassChart,
} from './chart-line-band-pass';

/** Eight bars at a constant level: every two-bar difference is zero. */
const CONST_DATA: ChartLineBandPassPoint[] = Array.from(
  { length: 8 },
  (_, i) => ({ x: i, value: 50 }),
);

const CONST_VALUES: number[] = CONST_DATA.map((p) => p.value);

/** Two full cycles of a twelve-bar sinusoid -- the bandpass rings on it. */
const WAVE_DATA: ChartLineBandPassPoint[] = [
  50, 54, 56, 57, 56, 54, 50, 46, 44, 43, 44, 46, 50, 54, 56, 57, 56, 54, 50,
  46, 44, 43, 44, 46,
].map((value, i) => ({ x: i, value }));

const WAVE_VALUES: number[] = WAVE_DATA.map((p) => p.value);

const OPTS = { period: 10, bandwidth: 0.3 };

describe('getLineBandPassFinitePoints', () => {
  it('returns an empty array for a non-array input', () => {
    expect(getLineBandPassFinitePoints(null)).toEqual([]);
    expect(
      getLineBandPassFinitePoints(undefined as unknown as ChartLineBandPassPoint[]),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(getLineBandPassFinitePoints([])).toEqual([]);
  });

  it('drops points with a non-finite x or value', () => {
    const dirty = [
      { x: 0, value: 10 },
      { x: Number.NaN, value: 20 },
      { x: 2, value: Number.POSITIVE_INFINITY },
      { x: 3, value: 30 },
    ] as ChartLineBandPassPoint[];
    expect(getLineBandPassFinitePoints(dirty)).toEqual([
      { x: 0, value: 10 },
      { x: 3, value: 30 },
    ]);
  });

  it('preserves the input order', () => {
    const out = getLineBandPassFinitePoints([
      { x: 5, value: 1 },
      { x: 2, value: 2 },
      { x: 9, value: 3 },
    ]);
    expect(out.map((p) => p.x)).toEqual([5, 2, 9]);
  });
});

describe('normalizeLineBandPassPeriod', () => {
  it('keeps a valid integer period', () => {
    expect(normalizeLineBandPassPeriod(20, 12)).toBe(20);
  });

  it('floors a fractional period', () => {
    expect(normalizeLineBandPassPeriod(12.7, 20)).toBe(12);
  });

  it('falls back for a period below two', () => {
    expect(normalizeLineBandPassPeriod(1, 20)).toBe(20);
  });

  it('falls back for a zero period', () => {
    expect(normalizeLineBandPassPeriod(0, 20)).toBe(20);
  });

  it('falls back for a negative period', () => {
    expect(normalizeLineBandPassPeriod(-8, 20)).toBe(20);
  });

  it('falls back for a non-finite period', () => {
    expect(normalizeLineBandPassPeriod(Number.NaN, 20)).toBe(20);
    expect(normalizeLineBandPassPeriod('30' as unknown as number, 20)).toBe(20);
  });
});

describe('normalizeLineBandPassBandwidth', () => {
  it('keeps a bandwidth inside the open unit interval', () => {
    expect(normalizeLineBandPassBandwidth(0.3, 0.5)).toBe(0.3);
  });

  it('falls back for a zero bandwidth', () => {
    expect(normalizeLineBandPassBandwidth(0, 0.3)).toBe(0.3);
  });

  it('falls back for a bandwidth of one or above', () => {
    expect(normalizeLineBandPassBandwidth(1, 0.3)).toBe(0.3);
    expect(normalizeLineBandPassBandwidth(5, 0.3)).toBe(0.3);
  });

  it('falls back for a negative bandwidth', () => {
    expect(normalizeLineBandPassBandwidth(-0.2, 0.3)).toBe(0.3);
  });

  it('falls back for a non-finite bandwidth', () => {
    expect(normalizeLineBandPassBandwidth(Number.NaN, 0.3)).toBe(0.3);
  });
});

describe('computeLineBandPassCoefficients', () => {
  it('returns finite beta, gamma and alpha', () => {
    const c = computeLineBandPassCoefficients(20, 0.3);
    expect(Number.isFinite(c.beta)).toBe(true);
    expect(Number.isFinite(c.gamma)).toBe(true);
    expect(Number.isFinite(c.alpha)).toBe(true);
  });

  it('sets beta to the cosine of two pi over the period', () => {
    const c = computeLineBandPassCoefficients(20, 0.3);
    expect(c.beta).toBe(Math.cos((2 * Math.PI) / 20));
  });

  it('keeps gamma at or above one for a valid band', () => {
    const c = computeLineBandPassCoefficients(20, 0.3);
    expect(c.gamma).toBeGreaterThanOrEqual(1);
  });

  it('keeps alpha inside the open unit interval for a valid band', () => {
    const c = computeLineBandPassCoefficients(20, 0.3);
    expect(c.alpha).toBeGreaterThan(0);
    expect(c.alpha).toBeLessThan(1);
  });

  it('responds to the bandwidth', () => {
    const a = computeLineBandPassCoefficients(20, 0.3);
    const b = computeLineBandPassCoefficients(20, 0.5);
    expect(a.alpha).not.toBe(b.alpha);
  });

  it('normalizes an out-of-range bandwidth to the fallback', () => {
    const dirty = computeLineBandPassCoefficients(20, 5);
    const clean = computeLineBandPassCoefficients(
      20,
      DEFAULT_CHART_LINE_BAND_PASS_BANDWIDTH,
    );
    expect(dirty.alpha).toBe(clean.alpha);
  });
});

describe('computeLineBandPass', () => {
  it('returns an empty array for a non-array input', () => {
    expect(computeLineBandPass(null, 10, 0.3)).toEqual([]);
    expect(
      computeLineBandPass(undefined as unknown as number[], 10, 0.3),
    ).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(computeLineBandPass([], 10, 0.3)).toEqual([]);
  });

  it('matches the input length', () => {
    expect(computeLineBandPass(WAVE_VALUES, 10, 0.3)).toHaveLength(
      WAVE_VALUES.length,
    );
  });

  it('seeds the first two bars at zero', () => {
    const bp = computeLineBandPass(WAVE_VALUES, 10, 0.3);
    expect(bp[0]).toBe(0);
    expect(bp[1]).toBe(0);
  });

  it('holds a constant series at zero across every bar', () => {
    const bp = computeLineBandPass(CONST_VALUES, 10, 0.3);
    expect(bp.every((v) => v === 0)).toBe(true);
  });

  it('keeps every bandpass reading finite for finite input', () => {
    const bp = computeLineBandPass(WAVE_VALUES, 10, 0.3);
    expect(bp.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('produces a non-zero oscillation for a varying series', () => {
    const bp = computeLineBandPass(WAVE_VALUES, 10, 0.3);
    expect(bp.some((v) => v !== 0)).toBe(true);
  });

  it('oscillates across zero with both signs for a cyclic series', () => {
    const bp = computeLineBandPass(WAVE_VALUES, 10, 0.3);
    expect(bp.some((v) => v > 0)).toBe(true);
    expect(bp.some((v) => v < 0)).toBe(true);
  });

  it('responds to the period', () => {
    const fast = computeLineBandPass(WAVE_VALUES, 8, 0.3);
    const slow = computeLineBandPass(WAVE_VALUES, 20, 0.3);
    expect(fast).not.toEqual(slow);
  });
});

describe('classifyLineBandPassZone', () => {
  it('classifies a positive bandpass as up', () => {
    expect(classifyLineBandPassZone(2.5)).toBe('up');
  });

  it('classifies a negative bandpass as down', () => {
    expect(classifyLineBandPassZone(-2.5)).toBe('down');
  });

  it('classifies a zero bandpass as flat', () => {
    expect(classifyLineBandPassZone(0)).toBe('flat');
  });

  it('classifies a null bandpass as none', () => {
    expect(classifyLineBandPassZone(null)).toBe('none');
  });

  it('classifies a non-finite bandpass as none', () => {
    expect(classifyLineBandPassZone(Number.NaN)).toBe('none');
  });
});

describe('runLineBandPass', () => {
  it('is not ok for a series shorter than two points', () => {
    expect(runLineBandPass([{ x: 0, value: 1 }]).ok).toBe(false);
  });

  it('is not ok for an empty or null input', () => {
    expect(runLineBandPass([]).ok).toBe(false);
    expect(runLineBandPass(null).ok).toBe(false);
  });

  it('is ok for a series of at least two points', () => {
    expect(runLineBandPass(WAVE_DATA, OPTS).ok).toBe(true);
  });

  it('uses the default period and bandwidth when none are given', () => {
    const run = runLineBandPass(WAVE_DATA);
    expect(run.period).toBe(DEFAULT_CHART_LINE_BAND_PASS_PERIOD);
    expect(run.bandwidth).toBe(DEFAULT_CHART_LINE_BAND_PASS_BANDWIDTH);
  });

  it('honours a custom period and bandwidth', () => {
    const run = runLineBandPass(WAVE_DATA, { period: 14, bandwidth: 0.4 });
    expect(run.period).toBe(14);
    expect(run.bandwidth).toBe(0.4);
  });

  it('holds the bandpass at zero and wholly flat for a constant series', () => {
    const run = runLineBandPass(CONST_DATA, OPTS);
    expect(run.bp.every((v) => v === 0)).toBe(true);
    expect(run.flatCount).toBe(run.series.length);
    expect(run.upCount).toBe(0);
    expect(run.downCount).toBe(0);
  });

  it('assigns each sample a valid zone', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    for (const sample of run.samples) {
      expect(['up', 'down', 'flat', 'none']).toContain(sample.zone);
    }
  });

  it('keeps the zone counts self-consistent', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(run.upCount + run.downCount + run.flatCount).toBe(
      run.series.length,
    );
  });

  it('lags the trigger one bar behind the bandpass', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(run.trigger[0]).toBeNull();
    for (let i = 1; i < run.bp.length; i += 1) {
      expect(run.trigger[i]).toBe(run.bp[i - 1]);
    }
  });

  it('emits one sample per point', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(run.samples).toHaveLength(WAVE_DATA.length);
  });

  it('carries finite filter coefficients', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(Number.isFinite(run.beta)).toBe(true);
    expect(Number.isFinite(run.gamma)).toBe(true);
    expect(Number.isFinite(run.alpha)).toBe(true);
  });

  it('carries the bandpass array alongside the samples', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(run.bp).toHaveLength(run.samples.length);
  });

  it('sorts the series by x', () => {
    const run = runLineBandPass(
      [
        { x: 3, value: 30 },
        { x: 1, value: 10 },
        { x: 2, value: 20 },
      ],
      OPTS,
    );
    expect(run.series.map((p) => p.x)).toEqual([1, 2, 3]);
  });

  it('reports the final bandpass reading', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    expect(run.bpFinal).toBe(run.bp[run.bp.length - 1]);
  });
});

describe('computeLineBandPassLayout', () => {
  it('is not ok for a single point', () => {
    const layout = computeLineBandPassLayout({
      data: [{ x: 0, value: 1 }],
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is not ok for a collapsed canvas', () => {
    const layout = computeLineBandPassLayout({
      data: WAVE_DATA,
      width: 0,
      ...OPTS,
    });
    expect(layout.ok).toBe(false);
  });

  it('is ok for a valid series and canvas', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.ok).toBe(true);
  });

  it('stacks the price panel above the bandpass panel', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePanelBottom).toBeLessThanOrEqual(layout.bpPanelTop);
  });

  it('builds a price path, a bandpass path and a trigger path', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.pricePath.length).toBeGreaterThan(0);
    expect(layout.bandpassPath.length).toBeGreaterThan(0);
    expect(layout.triggerPath.length).toBeGreaterThan(0);
  });

  it('emits one price dot per bar', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.priceDots).toHaveLength(WAVE_DATA.length);
  });

  it('emits one marker per bar', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.markers).toHaveLength(WAVE_DATA.length);
  });

  it('places the zero line inside the bandpass panel', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.zeroY).toBeGreaterThanOrEqual(layout.bpPanelTop);
    expect(layout.zeroY).toBeLessThanOrEqual(layout.bpPanelBottom);
  });

  it('carries the run', () => {
    const layout = computeLineBandPassLayout({ data: WAVE_DATA, ...OPTS });
    expect(layout.run.samples).toHaveLength(WAVE_DATA.length);
  });
});

describe('describeLineBandPassChart', () => {
  it('names the Ehlers Bandpass Filter', () => {
    expect(describeLineBandPassChart(WAVE_DATA, OPTS)).toContain(
      'Ehlers Bandpass Filter',
    );
  });

  it('mentions isolating the dominant cycle', () => {
    expect(describeLineBandPassChart(WAVE_DATA, OPTS)).toContain(
      'dominant cycle',
    );
  });

  it('mentions the resonant filter', () => {
    expect(describeLineBandPassChart(WAVE_DATA, OPTS)).toContain('resonant');
  });

  it('reports the zone counts', () => {
    const run = runLineBandPass(WAVE_DATA, OPTS);
    const text = describeLineBandPassChart(WAVE_DATA, OPTS);
    expect(text).toContain(`above zero on ${run.upCount}`);
    expect(text).toContain(`below zero on ${run.downCount}`);
  });

  it('returns No data for an empty series', () => {
    expect(describeLineBandPassChart([], OPTS)).toBe('No data');
  });
});

describe('<ChartLineBandPass />', () => {
  it('renders a labelled region', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('Bandpass');
  });

  it('renders an accessible description', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const desc = container.querySelector(
      '[data-section="chart-line-band-pass-aria-desc"]',
    );
    expect(desc?.textContent).toContain('Ehlers Bandpass Filter');
  });

  it('renders an empty state for no data', () => {
    const { container } = render(<ChartLineBandPass data={[]} {...OPTS} />);
    const empty = container.querySelector(
      '[data-section="chart-line-band-pass-empty"]',
    );
    expect(empty?.textContent).toBe('No data');
  });

  it('mirrors the period, bandwidth and point count on the root', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const root = container.querySelector(
      '[data-section="chart-line-band-pass"]',
    );
    expect(root?.getAttribute('data-period')).toBe('10');
    expect(root?.getAttribute('data-bandwidth')).toBe('0.3');
    expect(root?.getAttribute('data-total-points')).toBe(
      String(WAVE_DATA.length),
    );
  });

  it('renders an img-role svg', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const svg = container.querySelector(
      '[data-section="chart-line-band-pass-svg"]',
    );
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('draws the price, bandpass and trigger lines', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-band-pass-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-band-pass-bandpass-line"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-section="chart-line-band-pass-trigger-line"]',
      ),
    ).not.toBeNull();
  });

  it('draws the zero line', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-band-pass-zero-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per bar', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-band-pass-marker"]',
    );
    expect(markers).toHaveLength(WAVE_DATA.length);
  });

  it('tags each marker with a valid zone', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const markers = container.querySelectorAll(
      '[data-section="chart-line-band-pass-marker"]',
    );
    for (const marker of Array.from(markers)) {
      expect(['up', 'down', 'flat', 'none']).toContain(
        marker.getAttribute('data-zone'),
      );
    }
  });

  it('renders both panel labels', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const labels = container.querySelectorAll(
      '[data-section="chart-line-band-pass-panel-label"]',
    );
    const texts = Array.from(labels).map((n) => n.textContent);
    expect(texts).toContain('Price');
    expect(texts).toContain('Ehlers Bandpass Filter');
  });

  it('renders the config badge', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} />,
    );
    const badge = container.querySelector(
      '[data-section="chart-line-band-pass-badge-config"]',
    );
    expect(badge?.textContent).toBe('BP 10/0.3');
  });

  it('hides the bandpass line when its legend item is toggled off', () => {
    const { container } = render(
      <ChartLineBandPass
        data={WAVE_DATA}
        {...OPTS}
        hiddenSeries={['bandpass']}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-band-pass-bandpass-line"]',
      ),
    ).toBeNull();
  });

  it('hides the trigger line when showTrigger is false', () => {
    const { container } = render(
      <ChartLineBandPass data={WAVE_DATA} {...OPTS} showTrigger={false} />,
    );
    expect(
      container.querySelector(
        '[data-section="chart-line-band-pass-trigger-line"]',
      ),
    ).toBeNull();
  });

  it('fires onPointClick when a marker is activated', () => {
    const onPointClick = vi.fn();
    const { container } = render(
      <ChartLineBandPass
        data={WAVE_DATA}
        {...OPTS}
        onPointClick={onPointClick}
      />,
    );
    const marker = container.querySelector(
      '[data-section="chart-line-band-pass-marker"]',
    );
    (marker as SVGElement | null)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onPointClick).toHaveBeenCalledTimes(1);
    const detail = onPointClick.mock.calls[0]![0] as {
      point: ChartLineBandPassSample;
    };
    expect(detail.point.index).toBe(0);
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineBandPass ref={ref} data={WAVE_DATA} {...OPTS} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('data-section')).toBe(
      'chart-line-band-pass',
    );
  });
});
