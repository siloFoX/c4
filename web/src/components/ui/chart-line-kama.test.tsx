import { describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import {
  ChartLineKama,
  computeLineKama,
  computeLineKamaEfficiencyRatio,
  computeLineKamaLayout,
  getLineKamaFinitePoints,
  normalizeLineKamaPeriod,
  runLineKama,
  describeLineKamaChart,
  type ChartLineKamaPoint,
} from './chart-line-kama';

afterEach(() => cleanup());

// Hand-verified with erPeriod 2, fastPeriod 2, slowPeriod 30:
//   values    = [10, 14, 10, 22, 30]
//   ER[i] = |value[i] - value[i-2]| / sum(|bar moves| over the window)
//     ER[2] = |10-10| / (|10-14|+|14-10|) =  0 / 8 = 0    (pure noise)
//     ER[3] = |22-14| / (|22-10|+|10-14|) =  8 / 16 = 0.5
//     ER[4] = |30-10| / (|30-22|+|22-10|) = 20 / 20 = 1    (clean trend)
//   ER  = [null, null, 0, 0.5, 1]
//   fastSC = 2/3, slowSC = 2/31; SC = (ER*(fastSC-slowSC)+slowSC)^2
//   KAMA seeded at index 1 with value[1] = 14, then recursive:
//     KAMA[i] = KAMA[i-1] + SC[i] * (value[i] - KAMA[i-1])
//     KAMA[2] = 14 + (2/31)^2 * (10-14)        ~= 13.983351
//     KAMA[3] = KAMA[2] + (34/93)^2 * (22-KAMA[2]) ~= 15.054833
//     KAMA[4] = KAMA[3] + (2/3)^2 * (30-KAMA[3])   ~= 21.697129
const KAMA_DATA: ChartLineKamaPoint[] = [
  { x: 0, value: 10 },
  { x: 1, value: 14 },
  { x: 2, value: 10 },
  { x: 3, value: 22 },
  { x: 4, value: 30 },
];

describe('getLineKamaFinitePoints', () => {
  it('keeps only points with finite x and value', () => {
    const points = getLineKamaFinitePoints([
      { x: 0, value: 5 },
      { x: NaN, value: 5 },
      { x: 1, value: Infinity },
      { x: 2, value: 9 },
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.x)).toEqual([0, 2]);
  });

  it('returns an empty array for non-array input', () => {
    expect(getLineKamaFinitePoints(null)).toEqual([]);
    expect(getLineKamaFinitePoints(undefined)).toEqual([]);
  });
});

describe('normalizeLineKamaPeriod', () => {
  it('floors a fractional period', () => {
    expect(normalizeLineKamaPeriod(10.8, 10)).toBe(10);
  });

  it('falls back for a sub-1, NaN or negative period', () => {
    expect(normalizeLineKamaPeriod(0, 10)).toBe(10);
    expect(normalizeLineKamaPeriod(NaN, 10)).toBe(10);
    expect(normalizeLineKamaPeriod(-3, 10)).toBe(10);
  });
});

describe('computeLineKamaEfficiencyRatio', () => {
  const values = KAMA_DATA.map((p) => p.value);

  it('divides the net change by the summed bar moves', () => {
    expect(computeLineKamaEfficiencyRatio(values, 2)).toEqual([
      null,
      null,
      0,
      0.5,
      1,
    ]);
  });

  it('reads 0 for a window where the moves cancel out', () => {
    const er = computeLineKamaEfficiencyRatio([10, 14, 10], 2);
    expect(er[2]).toBe(0);
  });

  it('reads 1 for a window that trends in one direction', () => {
    const er = computeLineKamaEfficiencyRatio([10, 20, 30], 2);
    expect(er[2]).toBe(1);
  });

  it('reads 0 for a flat window rather than dividing by zero', () => {
    const er = computeLineKamaEfficiencyRatio([5, 5, 5], 2);
    expect(er[2]).toBe(0);
    expect(Number.isNaN(er[2])).toBe(false);
  });

  it('stays within the 0 to 1 bound', () => {
    const er = computeLineKamaEfficiencyRatio(values, 2);
    for (const v of er) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leaves the first erPeriod entries as a null warm-up', () => {
    const er = computeLineKamaEfficiencyRatio(values, 2);
    expect(er[0]).toBeNull();
    expect(er[1]).toBeNull();
    expect(er[2]).not.toBeNull();
  });

  it('returns an empty array for non-array input', () => {
    expect(computeLineKamaEfficiencyRatio(null, 2)).toEqual([]);
  });
});

describe('computeLineKama', () => {
  const values = KAMA_DATA.map((p) => p.value);

  it('exposes the efficiency ratio series', () => {
    const { er } = computeLineKama(values, 2, 2, 30);
    expect(er).toEqual([null, null, 0, 0.5, 1]);
  });

  it('squares the slow smoothing constant when the ratio is 0', () => {
    const { sc } = computeLineKama(values, 2, 2, 30);
    expect(sc[2]).toBeCloseTo((2 / 31) ** 2, 6);
  });

  it('squares the fast smoothing constant when the ratio is 1', () => {
    const { sc } = computeLineKama(values, 2, 2, 30);
    expect(sc[4]).toBeCloseTo((2 / 3) ** 2, 6);
  });

  it('seeds the KAMA at index erPeriod-1 with that bar value', () => {
    const { kama } = computeLineKama(values, 2, 2, 30);
    expect(kama[1]).toBe(14);
  });

  it('recursively blends each bar into the KAMA', () => {
    const { kama } = computeLineKama(values, 2, 2, 30);
    expect(kama[2]).toBeCloseTo(13.98335, 3);
    expect(kama[3]).toBeCloseTo(15.05483, 3);
    expect(kama[4]).toBeCloseTo(21.69713, 3);
  });

  it('leaves the bars before the seed as null', () => {
    const { kama } = computeLineKama(values, 2, 2, 30);
    expect(kama[0]).toBeNull();
  });

  it('lengthens the warm-up as erPeriod grows', () => {
    const { kama } = computeLineKama(values, 3, 2, 30);
    expect(kama[0]).toBeNull();
    expect(kama[1]).toBeNull();
    expect(kama[2]).toBe(10);
  });

  it('returns empty arrays for non-array input', () => {
    expect(computeLineKama(null, 2, 2, 30)).toEqual({
      er: [],
      sc: [],
      kama: [],
    });
  });
});

describe('runLineKama', () => {
  it('reports ok for a sufficient series', () => {
    expect(runLineKama(KAMA_DATA, { erPeriod: 2 }).ok).toBe(true);
  });

  it('carries the three periods onto the run', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.erPeriod).toBe(2);
    expect(run.fastPeriod).toBe(2);
    expect(run.slowPeriod).toBe(30);
  });

  it('exposes the efficiency ratio and KAMA series', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.er).toEqual([null, null, 0, 0.5, 1]);
    expect(run.kama[4]).toBeCloseTo(21.69713, 3);
  });

  it('reports the final, min and max KAMA readings', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.kamaFinal).toBeCloseTo(21.69713, 3);
    expect(run.kamaMin).toBeCloseTo(13.98335, 3);
    expect(run.kamaMax).toBeCloseTo(21.69713, 3);
  });

  it('classifies each sample by price position versus KAMA', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.samples[0]!.position).toBe('on');
    expect(run.samples[1]!.position).toBe('on');
    expect(run.samples[2]!.position).toBe('below');
    expect(run.samples[3]!.position).toBe('above');
    expect(run.samples[4]!.position).toBe('above');
  });

  it('counts bars above and below the KAMA', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.aboveCount).toBe(2);
    expect(run.belowCount).toBe(1);
  });

  it('sorts the series by x before computing', () => {
    const shuffled = [...KAMA_DATA].reverse();
    const run = runLineKama(shuffled, { erPeriod: 2 });
    expect(run.series.map((p) => p.x)).toEqual([0, 1, 2, 3, 4]);
    expect(run.er).toEqual([null, null, 0, 0.5, 1]);
  });

  it('reports not-ok for fewer than two points', () => {
    const run = runLineKama([{ x: 0, value: 5 }]);
    expect(run.ok).toBe(false);
    expect(run.samples).toEqual([]);
  });

  it('reports not-ok for empty or null input', () => {
    expect(runLineKama([]).ok).toBe(false);
    expect(runLineKama(null).ok).toBe(false);
  });

  it('produces one sample per series point', () => {
    expect(runLineKama(KAMA_DATA, { erPeriod: 2 }).samples).toHaveLength(5);
  });

  it('defaults to erPeriod 10 and reads no KAMA for a short series', () => {
    const run = runLineKama(KAMA_DATA);
    expect(run.erPeriod).toBe(10);
    expect(run.kama.every((v) => v === null)).toBe(true);
    expect(Number.isNaN(run.kamaFinal)).toBe(true);
  });

  it('exposes the efficiency ratio on every sample', () => {
    const run = runLineKama(KAMA_DATA, { erPeriod: 2 });
    expect(run.samples[3]!.er).toBe(0.5);
  });
});

describe('computeLineKamaLayout', () => {
  const base = {
    data: KAMA_DATA,
    erPeriod: 2,
    width: 560,
    height: 320,
    padding: 40,
  };

  it('produces an ok layout for a valid series', () => {
    const layout = computeLineKamaLayout(base);
    expect(layout.ok).toBe(true);
    expect(layout.totalPoints).toBe(5);
  });

  it('builds non-empty price and KAMA paths', () => {
    const layout = computeLineKamaLayout(base);
    expect(layout.pricePath.startsWith('M')).toBe(true);
    expect(layout.kamaPath.startsWith('M')).toBe(true);
  });

  it('emits a marker only where the KAMA is defined', () => {
    const layout = computeLineKamaLayout(base);
    expect(layout.kamaMarkers).toHaveLength(4);
    expect(layout.priceDots).toHaveLength(5);
  });

  it('spans a y domain covering both the price and the KAMA', () => {
    const layout = computeLineKamaLayout(base);
    expect(layout.yMin).toBeLessThanOrEqual(10);
    expect(layout.yMax).toBeGreaterThanOrEqual(30);
  });

  it('carries the run statistics onto the layout', () => {
    const layout = computeLineKamaLayout(base);
    expect(layout.kamaFinal).toBeCloseTo(21.69713, 3);
    expect(layout.aboveCount).toBe(2);
    expect(layout.belowCount).toBe(1);
    expect(layout.erPeriod).toBe(2);
  });

  it('keeps the KAMA markers inside the panel', () => {
    const layout = computeLineKamaLayout(base);
    for (const m of layout.kamaMarkers) {
      expect(m.py).toBeGreaterThanOrEqual(layout.panel.y);
      expect(m.py).toBeLessThanOrEqual(layout.panel.y + layout.panel.height);
    }
  });

  it('returns a not-ok layout for collapsed dimensions', () => {
    const layout = computeLineKamaLayout({ ...base, width: 10 });
    expect(layout.ok).toBe(false);
    expect(layout.kamaPath).toBe('');
  });

  it('returns a not-ok layout when there is too little data', () => {
    const layout = computeLineKamaLayout({
      ...base,
      data: [{ x: 0, value: 5 }],
    });
    expect(layout.ok).toBe(false);
  });
});

describe('describeLineKamaChart', () => {
  it('summarises the chart with the indicator vocabulary', () => {
    const text = describeLineKamaChart(KAMA_DATA, { erPeriod: 2 });
    expect(text).toContain('Kaufman Adaptive Moving Average');
    expect(text).toContain('KAMA');
    expect(text).toContain('efficiency');
    expect(text).toContain('smoothing constant');
    expect(text).toContain('trend');
    expect(text).toContain('noise');
  });

  it('reports the above and below counts', () => {
    const text = describeLineKamaChart(KAMA_DATA, { erPeriod: 2 });
    expect(text).toContain('above the KAMA on 2');
    expect(text).toContain('below on 1');
  });

  it('returns a no-data message for an insufficient series', () => {
    expect(describeLineKamaChart([])).toBe('No data');
    expect(describeLineKamaChart(null)).toBe('No data');
  });
});

describe('<ChartLineKama />', () => {
  it('renders a labelled region', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const region = container.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-label')).toBeTruthy();
  });

  it('exposes an accessible description', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const desc = container.querySelector(
      '[data-section="chart-line-kama-aria-desc"]',
    );
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toContain('Kaufman Adaptive Moving Average');
  });

  it('publishes the run statistics as data attributes', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const root = container.querySelector('[data-section="chart-line-kama"]');
    expect(root!.getAttribute('data-er-period')).toBe('2');
    expect(root!.getAttribute('data-fast-period')).toBe('2');
    expect(root!.getAttribute('data-slow-period')).toBe('30');
    expect(root!.getAttribute('data-above-count')).toBe('2');
    expect(root!.getAttribute('data-below-count')).toBe('1');
    expect(root!.getAttribute('data-total-points')).toBe('5');
    expect(root!.getAttribute('data-empty')).toBe('false');
    expect(
      Number(root!.getAttribute('data-kama-final')),
    ).toBeCloseTo(21.69713, 2);
  });

  it('renders an svg with the price and KAMA lines', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    expect(
      container.querySelector('[data-section="chart-line-kama-svg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-kama-price-path"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="chart-line-kama-kama-line"]'),
    ).not.toBeNull();
  });

  it('renders one marker per defined KAMA value', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const markers = container.querySelectorAll(
      '[data-section="chart-line-kama-marker"]',
    );
    expect(markers).toHaveLength(4);
  });

  it('renders both panel legend items', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const items = container.querySelectorAll(
      '[data-section="chart-line-kama-legend-item"]',
    );
    expect(items).toHaveLength(2);
  });

  it('renders the config badge with the efficiency ratio period', () => {
    const { container } = render(<ChartLineKama data={KAMA_DATA} erPeriod={2} />);
    const badge = container.querySelector(
      '[data-section="chart-line-kama-badge-er"]',
    );
    expect(badge!.textContent).toContain('2');
  });

  it('hides the price path when price is in the hidden set', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} hiddenSeries={['price']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-price-path"]'),
    ).toBeNull();
  });

  it('hides the KAMA line and markers when showKama is false', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} showKama={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-kama-line"]'),
    ).toBeNull();
    expect(
      container.querySelectorAll('[data-section="chart-line-kama-marker"]'),
    ).toHaveLength(0);
  });

  it('toggles the KAMA line off via a legend click', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} hiddenSeries={['kama']} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-kama-line"]'),
    ).toBeNull();
  });

  it('reports series toggles through onSeriesToggle', () => {
    const seen: { seriesId: string; hidden: boolean }[] = [];
    const { container } = render(
      <ChartLineKama
        data={KAMA_DATA}
        erPeriod={2}
        onSeriesToggle={(p) => seen.push(p)}
      />,
    );
    const kamaButton = container.querySelector(
      '[data-section="chart-line-kama-legend-item"][data-series-id="kama"]',
    ) as HTMLButtonElement;
    kamaButton.click();
    expect(seen).toEqual([{ seriesId: 'kama', hidden: true }]);
  });

  it('renders price dots when showDots is true', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} showDots />,
    );
    expect(
      container.querySelectorAll('[data-section="chart-line-kama-dot"]'),
    ).toHaveLength(5);
  });

  it('renders the empty state for an insufficient series', () => {
    const { container } = render(
      <ChartLineKama data={[{ x: 0, value: 5 }]} />,
    );
    const root = container.querySelector('[data-section="chart-line-kama"]');
    expect(root!.getAttribute('data-empty')).toBe('true');
    expect(
      container.querySelector('[data-section="chart-line-kama-svg"]'),
    ).toBeNull();
  });

  it('omits the config badge when showConfigBadge is false', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} showConfigBadge={false} />,
    );
    expect(
      container.querySelector('[data-section="chart-line-kama-badge"]'),
    ).toBeNull();
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChartLineKama ref={ref} data={KAMA_DATA} erPeriod={2} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.getAttribute('data-section')).toBe('chart-line-kama');
  });

  it('has a stable displayName', () => {
    expect(ChartLineKama.displayName).toBe('ChartLineKama');
  });

  it('toggles the animate attribute', () => {
    const { container } = render(
      <ChartLineKama data={KAMA_DATA} erPeriod={2} animate={false} />,
    );
    const root = container.querySelector('[data-section="chart-line-kama"]');
    expect(root!.getAttribute('data-animate')).toBe('false');
  });
});
